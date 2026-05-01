// Edge function: weekly-debt-rebuild (v2 - ledger-first)
// Przelicza długi tygodniowe od wskazanego tygodnia (np. 13/2026) dla wszystkich kierowców.
//
// REGUŁY (v2, zatwierdzone przez użytkownika):
//   - Świeży start: opening_debt w start_week = 0 dla każdego kierowcy.
//   - Źródło ręcznych akcji = driver_debt_transactions (ledger), grupowane po created_at -> tydzień UI.
//     manual_added_debt = SUM(debt_increase, manual_add, adjustment_add)
//     manual_paid_debt  = SUM(ABS) wszystkich payment / manual_payment / debt_payment / repayment / zero_out
//   - raw_payout = z settlements (jak dotychczas, z rekonstrukcji actual + debt_payment / actual + opening_old).
//   - Formuła:
//       effective_opening = max(0, opening_debt - manual_paid_debt)
//       final = raw_payout - effective_opening - manual_added_debt
//       final >= 0  -> actual_payout = final, remaining_debt = 0
//       final <  0  -> actual_payout = 0,     remaining_debt = abs(final)
//       visible_debt = effective_opening
//       opening_debt(next) = remaining_debt
//   - driver_weekly_debt_payments może istnieć jako source dla UI, ale rebuild NIE czyta wpłat z dwdp,
//     żeby nie dublować ledger. Przy zapisie (dry_run=false) wstawiamy migrowane wpłaty z dedupe po
//     note `ledger:<tx.id>`.
//
// Tryby:
//   dry_run = true  -> nic nie zapisuje, zwraca raport.
//   dry_run = false -> zapisuje driver_weekly_debts, sync settlements, migruje wpłaty z ledger.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { round2 } from "../_shared/weeklyDebt.ts";
import { uiWeekRange, uiWeekFromDate } from "../_shared/weekMapping.ts";

interface RequestBody {
  start_week: number;
  year: number;
  dry_run?: boolean;
  driver_ids?: string[];
  fleet_id?: string;
  offset?: number;
  limit?: number;
  only_diffs?: boolean;
}

const ADD_TYPES = new Set(["debt_increase", "manual_add", "adjustment_add"]);
const PAY_TYPES = new Set([
  "payment",
  "manual_payment",
  "debt_payment",
  "repayment",
  "zero_out",
  "zero_out_payment",
]);

function txIsAdd(t: any) {
  return ADD_TYPES.has(String(t.transaction_type || t.type || "").toLowerCase());
}
function txIsPay(t: any) {
  return PAY_TYPES.has(String(t.transaction_type || t.type || "").toLowerCase());
}

function txWeekKey(t: any): string {
  // PRIORYTET: period_from/period_to (jeśli są) — to jest okres, którego transakcja dotyczy.
  // FALLBACK: created_at (kiedy operator kliknął) — tylko gdy period_from brak.
  // Powód: dług za t.16 zaksięgowany 30.04 (t.17) musi wpaść do t.16, jeśli ma period_from=2026-04-20.
  const periodIso = String(t.period_from || "").slice(0, 10);
  const iso = periodIso || String(t.created_at || "").slice(0, 10);
  if (!iso) return "";
  const w = uiWeekFromDate(iso);
  return `${w.year}-${w.week}`;
}

function txIsInvalid(t: any): boolean {
  // Pomijamy transakcje oznaczone jako invalid lub duplicate w metadata.
  const m = t?.metadata;
  if (!m || typeof m !== "object") return false;
  return m.invalid === true || m.invalid === "true" || m.duplicate === true || m.duplicate === "true";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as RequestBody;
    const dryRun = body.dry_run !== false;
    if (!body.start_week || !body.year) {
      return new Response(JSON.stringify({ error: "start_week i year wymagane" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startDate = uiWeekRange(body.year, body.start_week).startISO;

    const offset = Math.max(0, Number(body.offset || 0));
    const limit = Math.max(1, Math.min(200, Number(body.limit || 50)));
    let driverQuery = supabase
      .from("drivers")
      .select("id, first_name, last_name, fleet_id", { count: "exact" })
      .order("id", { ascending: true });
    if (body.fleet_id) driverQuery = driverQuery.eq("fleet_id", body.fleet_id);
    if (body.driver_ids?.length) driverQuery = driverQuery.in("id", body.driver_ids);
    else driverQuery = driverQuery.range(offset, offset + limit - 1);
    const { data: drivers, error: driversErr, count: totalDriversCount } = await driverQuery;
    if (driversErr) throw driversErr;

    const reports: any[] = [];
    let totalWritten = 0;
    let totalPaymentsMigrated = 0;

    for (const driver of drivers || []) {
      const { data: settlements } = await supabase
        .from("settlements")
        .select("id, period_from, period_to, actual_payout, amounts, debt_before, debt_payment, debt_after")
        .eq("driver_id", driver.id)
        .gte("period_from", startDate)
        .order("period_from", { ascending: true });

      if (!settlements?.length) continue;

      // Pełny ledger: bierzemy szeroki zakres po created_at, bo transakcje z period_from w przeszłości
      // mogą być zaksięgowane później (created_at > start_week) — i odwrotnie. Filtrujemy potem po period_from/created_at.
      const { data: ledger } = await supabase
        .from("driver_debt_transactions")
        .select("id, amount, type, period_from, period_to, created_at, description, settlement_id, debt_category, metadata")
        .eq("driver_id", driver.id)
        .gte("created_at", startDate)
        .order("created_at", { ascending: true });

      // Live ledger balance (driver_debts.current_balance) — do diff_to_ledger
      const { data: liveDebt } = await supabase
        .from("driver_debts")
        .select("current_balance")
        .eq("driver_id", driver.id)
        .maybeSingle();
      const ledgerBalance = round2(Number(liveDebt?.current_balance || 0));

      // Grupuj ledger po tygodniu UI (priorytet: period_from, fallback: created_at).
      // Pomijamy transakcje oznaczone jako invalid/duplicate w metadata.
      const ledgerByWeek = new Map<string, any[]>();
      for (const t of ledger || []) {
        if (txIsInvalid(t)) continue;
        const k = txWeekKey(t);
        if (!k) continue;
        if (!ledgerByWeek.has(k)) ledgerByWeek.set(k, []);
        ledgerByWeek.get(k)!.push(t);
      }

      const driverReport: any = {
        driver_id: driver.id,
        driver_name: `${driver.first_name || ""} ${driver.last_name || ""}`.trim(),
        weeks: [],
        unmatched_ledger: [],
      };

      let openingDebt = 0; // czysty start w start_week
      let previousSettlementId: string | null = null;

      for (const s of settlements) {
        const uiW = uiWeekFromDate(s.period_from);
        const wkKey = `${uiW.year}-${uiW.week}`;
        const weekLedger = ledgerByWeek.get(wkKey) || [];
        ledgerByWeek.delete(wkKey);

        // Sumy z ledgera dla tego tygodnia UI (po created_at)
        const manualAddedDebt = round2(
          weekLedger.filter(txIsAdd).reduce((a, t) => a + Math.abs(Number(t.amount || 0)), 0),
        );
        const manualPaidDebt = round2(
          weekLedger.filter(txIsPay).reduce((a, t) => a + Math.abs(Number(t.amount || 0)), 0),
        );

        // RAW payout z settlements (rekonstrukcja jak dotąd)
        const oldActualPayout = Number(s.actual_payout || 0);
        const oldDebtBefore = Number(s.debt_before || 0);
        const oldDebtPayment = Number(s.debt_payment || 0);
        const oldDebtAfter = Number(s.debt_after || 0);
        let rawPayout: number;
        if (oldActualPayout < -0.01) {
          const effectiveOpeningOld = Math.max(0, oldDebtBefore - oldDebtPayment);
          rawPayout = round2(oldActualPayout + effectiveOpeningOld);
        } else {
          rawPayout = round2(oldActualPayout + oldDebtPayment);
        }

        // Formuła v4 (ledger-first, brak ukrytej spłaty z dodatniego raw):
        //   1. Jeśli ledger ma debt_increase/manual_add w tym tygodniu -> ledger jest źródłem długu.
        //      Ujemny raw_payout z settlement byłby tym samym długiem -> zerujemy raw, żeby nie dublować.
        //   2. Jeśli NIE ma ledger_added, ujemny raw z settlement traktujemy jako dług tygodnia.
        //   3. Dodatni raw_payout NIGDY nie zmniejsza długu (nie ma ukrytej spłaty). To po prostu wypłata.
        //      Spłata długu wymaga jawnego wpisu w ledgerze (payment/zero_out) albo w DWD payments.
        //
        // Formuła:
        //   addedThisWeek   = manualAddedDebt + (rawPayoutUsed < 0 ? abs(rawPayoutUsed) : 0)
        //   paidThisWeek    = manualPaidDebt
        //   remaining_debt  = max(0, opening + addedThisWeek - paidThisWeek)
        //   actualPayout    = max(0, rawPayoutUsed)   // dodatni raw = wypłata, dług osobno
        //   visible_debt    = opening (przed odjęciem wpłat tego tygodnia – do UI "Dług")
        const rawPayoutOriginal = rawPayout;
        let rawPayoutUsed = rawPayout;
        if (manualAddedDebt > 0.01 && rawPayout < -0.01) {
          rawPayoutUsed = 0; // no double-count
        }

        const negRawAsDebt = rawPayoutUsed < -0.01 ? Math.abs(rawPayoutUsed) : 0;
        const addedThisWeek = round2(manualAddedDebt + negRawAsDebt);
        const paidThisWeek = round2(manualPaidDebt);

        const remainingDebt = round2(Math.max(0, openingDebt + addedThisWeek - paidThisWeek));
        const actualPayout = rawPayoutUsed > 0 ? round2(rawPayoutUsed) : 0;
        const visibleDebt = round2(openingDebt);
        const paidAmount = round2(Math.min(openingDebt + addedThisWeek, paidThisWeek));
        const effectiveOpening = round2(Math.max(0, openingDebt - paidThisWeek));
        const final = round2(actualPayout - 0); // kept for backward report compat

        driverReport.weeks.push({
          ui_week: uiW.week,
          ui_year: uiW.year,
          ui_label: `t.${uiW.week}/${uiW.year} (${s.period_from} – ${s.period_to})`,
          period_from: s.period_from,
          period_to: s.period_to,
          settlement_id: s.id,
          opening_debt: round2(openingDebt),
          manual_added_debt: manualAddedDebt,
          manual_paid_debt: manualPaidDebt,
          raw_payout: rawPayoutUsed,
          raw_payout_original: rawPayoutOriginal,
          raw_payout_used: rawPayoutUsed,
          effective_opening: effectiveOpening,
          visible_debt: visibleDebt,
          remaining_debt: remainingDebt,
          new_actual_payout: actualPayout,
          old_settlement_actual_payout: round2(oldActualPayout),
          old_debt_before: round2(oldDebtBefore),
          old_debt_payment: round2(oldDebtPayment),
          old_debt_after: round2(oldDebtAfter),
          ledger_tx_count: weekLedger.length,
          ledger_tx_ids: weekLedger.map((t: any) => t.id),
          diff_payout: round2(actualPayout - oldActualPayout),
          diff_debt: round2(remainingDebt - oldDebtAfter),
        });

        if (!dryRun) {
          const { data: upserted, error: upsertErr } = await supabase
            .from("driver_weekly_debts")
            .upsert(
              {
                driver_id: driver.id,
                settlement_id: s.id,
                period_from: s.period_from,
                period_to: s.period_to,
                opening_debt: round2(openingDebt),
                paid_amount: paidAmount,
                visible_debt: visibleDebt,
                remaining_debt: remainingDebt,
                source_previous_settlement_id: previousSettlementId,
                source_previous_actual_payout: round2(openingDebt),
                source_note: `rebuild_v2: opening=${round2(openingDebt)} +add=${manualAddedDebt} -paid=${manualPaidDebt}`,
                status: "active",
              },
              { onConflict: "driver_id,period_from,period_to" },
            )
            .select()
            .single();
          if (upsertErr) throw upsertErr;
          totalWritten++;

          // Migracja wpłat z ledgera -> dwdp (tylko płatności, bez debt_increase). Dedupe po note `ledger:<id>`.
          for (const t of weekLedger.filter(txIsPay)) {
            const ledgerTag = `ledger:${t.id}`;
            const { data: alreadyExists } = await supabase
              .from("driver_weekly_debt_payments")
              .select("id")
              .eq("driver_id", driver.id)
              .ilike("note", `%${ledgerTag}%`)
              .maybeSingle();
            if (alreadyExists) continue;

            await supabase.from("driver_weekly_debt_payments").insert({
              weekly_debt_id: upserted?.id || null,
              driver_id: driver.id,
              settlement_id: s.id,
              period_from: s.period_from,
              period_to: s.period_to,
              amount: round2(Math.abs(Number(t.amount || 0))),
              payment_type: "migrated",
              note: `${ledgerTag} ${t.description || t.type || ""}`.trim(),
            });
            totalPaymentsMigrated++;
          }

          await supabase
            .from("settlements")
            .update({
              debt_before: round2(openingDebt),
              debt_payment: paidAmount,
              debt_after: remainingDebt,
              actual_payout: actualPayout,
            })
            .eq("id", s.id);
        }

        openingDebt = remainingDebt;
        previousSettlementId = s.id;
      }

      // Ledger transactions które nie wpadły do żadnego tygodnia (np. created_at poza zakresem settlements)
      for (const [wkKey, txs] of ledgerByWeek.entries()) {
        for (const t of txs) {
          driverReport.unmatched_ledger.push({
            tx_id: t.id,
            ui_week_key: wkKey,
            type: t.type || t.transaction_type,
            amount: Number(t.amount || 0),
            created_at: t.created_at,
            description: t.description,
          });
        }
      }

      // diff_to_ledger: ostatni remaining_debt vs ledgerBalance
      const lastRemaining = driverReport.weeks.length
        ? driverReport.weeks[driverReport.weeks.length - 1].remaining_debt
        : 0;
      driverReport.ledger_balance = ledgerBalance;
      driverReport.last_remaining_debt = lastRemaining;
      driverReport.diff_to_ledger = round2(lastRemaining - ledgerBalance);

      reports.push(driverReport);
    }

    const driversWithDiffs = reports.filter((r) =>
      r.weeks.some((w: any) => Math.abs(w.diff_payout) > 0.01 || Math.abs(w.diff_debt) > 0.01) ||
      Math.abs(r.diff_to_ledger || 0) > 0.01,
    );

    const filteredReports = body.only_diffs
      ? reports.filter(
          (r) =>
            r.weeks.some((w: any) => Math.abs(w.diff_payout) > 0.01 || Math.abs(w.diff_debt) > 0.01) ||
            Math.abs(r.diff_to_ledger || 0) > 0.01 ||
            r.unmatched_ledger.length > 0,
        )
      : reports;

    return new Response(
      JSON.stringify({
        success: true,
        version: "v2-ledger-first",
        dry_run: dryRun,
        start_week: body.start_week,
        year: body.year,
        start_date: startDate,
        offset,
        limit,
        total_drivers: totalDriversCount ?? null,
        next_offset: body.driver_ids?.length ? null : offset + (drivers?.length || 0),
        has_more: body.driver_ids?.length ? false : (offset + (drivers?.length || 0)) < (totalDriversCount ?? 0),
        drivers_processed: reports.length,
        drivers_with_diffs: driversWithDiffs.length,
        weeks_written: totalWritten,
        payments_migrated: totalPaymentsMigrated,
        reports: filteredReports,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[weekly-debt-rebuild] error", err);
    return new Response(
      JSON.stringify({ error: err?.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
