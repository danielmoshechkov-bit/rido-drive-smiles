// supabase/functions/_shared/creditGate.ts
// Gate kredytow AI dla marketplace foto.
// Saldo:  user_credits.credits_balance (to, co widzi front przez useUserCredits).
// Koszt:  ai_pricing.credits_per_use po feature_key (JEDYNE zrodlo kosztu).
// Log:    ai_credit_history. Atomowo: optimistic-lock + retry. Brak puli trialowej.
// NIE tworzy wiersza user_credits (zeby nie nadpisac bonusu 50 z onboardingu frontu).
//
// SPRINT 0 — wpiety serwerowo do ai-photo-edit PRZED wywolaniem modelu.
// (Wczesniejszy wariant uzywal ai_user_credits/ai_query_costs/trial — byl martwy.)

const DEFAULT_COST = 1;
const MAX_RETRIES = 5; // optimistic concurrency — ponow przy rownoleglym zapisie

export type CreditGateResult =
  | { allowed: true; cost: number; balance_after: number }
  | { allowed: false; reason: 'insufficient_credits' | 'disabled_feature' | 'no_account'; balance: number; cost: number };

export interface CreditGateOptions {
  modelUsed?: string;
  querySummary?: string;
}

// Koszt featureKey wg ai_pricing (i czy feature wlaczony).
async function getFeatureCost(supabase: any, featureKey: string): Promise<{ cost: number; enabled: boolean }> {
  const { data, error } = await supabase
    .from('ai_pricing')
    .select('credits_per_use, is_enabled')
    .eq('feature_key', featureKey)
    .maybeSingle();
  if (error) {
    console.warn(`[creditGate] blad odczytu ai_pricing "${featureKey}":`, error.message);
  }
  if (!data) {
    console.warn(`[creditGate] brak feature_key "${featureKey}" w ai_pricing — koszt ${DEFAULT_COST}`);
    return { cost: DEFAULT_COST, enabled: true };
  }
  const c = Number(data.credits_per_use);
  return { cost: Number.isFinite(c) && c > 0 ? c : DEFAULT_COST, enabled: data.is_enabled !== false };
}

async function logHistory(
  supabase: any, userId: string, featureKey: string, creditsUsed: number, opts: CreditGateOptions,
) {
  try {
    await supabase.from('ai_credit_history').insert({
      user_id: userId,
      query_type: featureKey,
      credits_used: creditsUsed,
      was_free: false,
      query_summary: opts.querySummary ?? null,
      model_used: opts.modelUsed ?? null,
    });
  } catch (e) {
    console.warn('[creditGate] log ai_credit_history nieudany:', (e as any)?.message);
  }
}

/**
 * Sprawdza i (jesli mozna) pobiera koszt featureKey z salda user_credits.
 * Zwraca {allowed:true,...} po udanym pobraniu albo {allowed:false, reason, ...}.
 */
export async function checkAndDeductCredits(
  supabase: any,
  userId: string,
  featureKey: string,
  opts: CreditGateOptions = {},
): Promise<CreditGateResult> {
  const { cost, enabled } = await getFeatureCost(supabase, featureKey);
  if (!enabled) return { allowed: false, reason: 'disabled_feature', balance: 0, cost };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data: row } = await supabase
      .from('user_credits')
      .select('credits_balance')
      .eq('user_id', userId)
      .maybeSingle();

    // Front (useUserCredits) tworzy wiersz z bonusem 50 przy pierwszym wejsciu.
    // Tu NIE tworzymy, zeby nie nadpisac bonusu zerem.
    if (!row) return { allowed: false, reason: 'no_account', balance: 0, cost };

    const balance = Number(row.credits_balance || 0);
    if (balance < cost) return { allowed: false, reason: 'insufficient_credits', balance, cost };

    const { data: upd } = await supabase
      .from('user_credits')
      .update({ credits_balance: balance - cost, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('credits_balance', balance) // optimistic lock na starym saldzie
      .select('credits_balance')
      .maybeSingle();

    if (!upd) continue; // saldo zmienione rownolegle → ponow
    await logHistory(supabase, userId, featureKey, cost, opts);
    return { allowed: true, cost, balance_after: Number(upd.credits_balance ?? (balance - cost)) };
  }

  // Silna kontencja — bezpiecznie odmow (nie przepuszczaj bez pobrania).
  console.warn('[creditGate] wyczerpano proby optimistic-lock dla usera', userId);
  return { allowed: false, reason: 'insufficient_credits', balance: 0, cost };
}

/** Zwrot kredytow (np. gdy model padl po pobraniu). */
export async function refundCredits(supabase: any, userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data: row } = await supabase
      .from('user_credits')
      .select('credits_balance')
      .eq('user_id', userId)
      .maybeSingle();
    if (!row) return;
    const balance = Number(row.credits_balance || 0);
    const { data: upd } = await supabase
      .from('user_credits')
      .update({ credits_balance: balance + amount, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('credits_balance', balance)
      .select('credits_balance')
      .maybeSingle();
    if (upd) return;
  }
}
