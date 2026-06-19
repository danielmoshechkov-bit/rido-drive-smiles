// supabase/functions/_shared/creditGate.ts
//
// Centralny gate kredytów AI (System B: ai_user_credits).
// Spójny ze wzorcem z supabase/functions/ai-search/index.ts, ale:
//   - koszt liczony per typ zapytania (ai_query_costs), NIE sztywne -1,
//   - trial mierzony w KREDYTACH (monthly_free_used + koszt), nie w liczbie zapytań,
//   - atomowy zapis salda I resetu (optimistic lock + retry) — bez race condition,
//   - log do ai_credit_history (z model_used / tokens_used jeśli przekazane).
//
// KROK 1/4 — moduł NIE jest jeszcze podpięty do żadnej edge function.
// Świadoma różnica względem ai-search: stały TRIAL_FREE_CREDITS=30 zamiast
// settings.user_monthly_limit, oraz licznik darmowej puli w jednostkach kosztu.

export const TRIAL_FREE_CREDITS = 30;

const DEFAULT_COST = 1;
const MAX_RETRIES = 5; // optimistic concurrency — ponów przy równoległym zapisie

export type CreditGateResult =
  | { allowed: true; cost: number; balance_after: number; was_free: boolean }
  | { allowed: false; reason: 'insufficient_credits'; balance: number; cost: number };

export interface CreditGateOptions {
  modelUsed?: string;
  tokensUsed?: number;
  querySummary?: string;
}

/** true gdy zapytanie poszło z puli trialowej — routing może wymusić mocny model. */
export function shouldForceStrongModel(wasFreeTrial: boolean): boolean {
  return wasFreeTrial === true;
}

// Koszt zapytania wg ai_query_costs (domyślnie 1; ostrzeż gdy typ nieznany).
async function getQueryCost(supabase: any, queryType: string): Promise<number> {
  const { data, error } = await supabase
    .from('ai_query_costs')
    .select('cost_credits')
    .eq('query_type', queryType)
    .maybeSingle();
  if (error) {
    console.warn(`[creditGate] błąd odczytu ai_query_costs dla "${queryType}":`, error.message);
  }
  if (!data) {
    console.warn(`[creditGate] nieznany query_type "${queryType}" — domyślny koszt ${DEFAULT_COST}`);
    return DEFAULT_COST;
  }
  const c = Number(data.cost_credits);
  return Number.isFinite(c) && c > 0 ? c : DEFAULT_COST;
}

// Nowy miesiąc względem monthly_reset_date (porównanie rok+miesiąc, UTC).
function isNewMonth(resetDate: string | null): boolean {
  if (!resetDate) return true;
  const d = new Date(resetDate);
  const now = new Date();
  return d.getUTCFullYear() !== now.getUTCFullYear() || d.getUTCMonth() !== now.getUTCMonth();
}

async function logHistory(
  supabase: any, userId: string, queryType: string,
  creditsUsed: number, wasFree: boolean, opts: CreditGateOptions,
) {
  try {
    await supabase.from('ai_credit_history').insert({
      user_id: userId,
      query_type: queryType,
      credits_used: creditsUsed,
      was_free: wasFree,
      query_summary: opts.querySummary ?? null,
      model_used: opts.modelUsed ?? null,
      tokens_used: opts.tokensUsed ?? null,
    });
  } catch (e) {
    console.warn('[creditGate] log do ai_credit_history nieudany:', (e as any)?.message);
  }
}

/**
 * Sprawdza i (jeśli można) pobiera kredyty za jedno zapytanie AI.
 * Zwraca {allowed:true,...} po udanym pobraniu albo {allowed:false, reason:'insufficient_credits',...}.
 */
export async function checkAndDeductCredits(
  supabase: any,
  userId: string,
  queryType: string,
  opts: CreditGateOptions = {},
): Promise<CreditGateResult> {
  const cost = await getQueryCost(supabase, queryType);
  const todayStr = new Date().toISOString().split('T')[0];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // 1) Wczytaj (lub utwórz) wiersz kredytów usera
    let { data: row } = await supabase
      .from('ai_user_credits')
      .select('credits_balance, monthly_free_used, monthly_reset_date')
      .eq('user_id', userId)
      .maybeSingle();

    if (!row) {
      const { data: created } = await supabase
        .from('ai_user_credits')
        .insert({ user_id: userId, credits_balance: 0, monthly_free_used: 0, monthly_reset_date: todayStr })
        .select('credits_balance, monthly_free_used, monthly_reset_date')
        .maybeSingle();
      if (!created) continue; // równoległy insert → ponów (przeczytaj istniejący)
      row = created;
    }

    let balance = Number(row.credits_balance || 0);
    let freeUsed = Number(row.monthly_free_used || 0);

    // 2) Reset miesięczny (nowy miesiąc) — w ramach pętli optimistic-lock,
    //    z warunkiem na STAREJ monthly_reset_date. Bez tego dwa równoległe
    //    zapytania na przełomie miesiąca mogłyby oddać podwójny trial.
    const prevReset = row.monthly_reset_date as string | null;
    if (isNewMonth(prevReset)) {
      const resetQ = supabase
        .from('ai_user_credits')
        .update({ monthly_free_used: 0, monthly_reset_date: todayStr })
        .eq('user_id', userId);
      const { data: afterReset } = await (
        prevReset === null
          ? resetQ.is('monthly_reset_date', null)   // null-safe odpowiednik .eq
          : resetQ.eq('monthly_reset_date', prevReset)
      )
        .select('credits_balance, monthly_free_used')
        .maybeSingle();
      if (!afterReset) continue;            // ktoś już zresetował → ponów (świeży stan)
      balance = Number(afterReset.credits_balance || 0);
      freeUsed = 0;                          // leć dalej w tej samej iteracji
    }

    // 3) Trial — mieści się w darmowej puli miesięcznej
    if (freeUsed + cost <= TRIAL_FREE_CREDITS) {
      const { data: upd } = await supabase
        .from('ai_user_credits')
        .update({ monthly_free_used: freeUsed + cost })
        .eq('user_id', userId)
        .eq('monthly_free_used', freeUsed) // optimistic lock na starej wartości
        .select('monthly_free_used')
        .maybeSingle();
      if (!upd) continue; // równoległa zmiana → ponów
      await logHistory(supabase, userId, queryType, 0, true, opts);
      return { allowed: true, cost, balance_after: balance, was_free: true };
    }

    // 4) Trial wyczerpany — odejmij koszt z salda (atomowo)
    if (balance >= cost) {
      const { data: upd } = await supabase
        .from('ai_user_credits')
        .update({ credits_balance: balance - cost })
        .eq('user_id', userId)
        .eq('credits_balance', balance) // optimistic lock na starym saldzie
        .select('credits_balance')
        .maybeSingle();
      if (!upd) continue; // saldo zmienione równolegle → ponów
      const balanceAfter = Number(upd.credits_balance ?? (balance - cost));
      await logHistory(supabase, userId, queryType, cost, false, opts);
      return { allowed: true, cost, balance_after: balanceAfter, was_free: false };
    }

    // 5) Brak kredytów
    return { allowed: false, reason: 'insufficient_credits', balance, cost };
  }

  // Silna kontencja — bezpiecznie odmów (nie przepuszczaj bez pobrania).
  console.warn('[creditGate] wyczerpano próby optimistic-lock dla usera', userId);
  return { allowed: false, reason: 'insufficient_credits', balance: 0, cost };
}
