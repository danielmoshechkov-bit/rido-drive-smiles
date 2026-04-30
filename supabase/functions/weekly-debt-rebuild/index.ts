// Edge function: weekly-debt-rebuild
// Przelicza długi tygodniowe od wskazanego tygodnia (np. 14/2025) dla wszystkich kierowców.
// Tryby:
//   dry_run = true  -> nic nie zapisuje, zwraca raport różnic vs aktualne dane.
//   dry_run = false -> zapisuje driver_weekly_debts, sync settlements,
//                      migruje wpłaty z driver_debt_transactions / settlements.amounts
//                      TYLKO dla tygodni od start_week w górę.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { calculateWeeklyDebt, round2 } from "../_shared/weeklyDebt.ts";

interface RequestBody {
  start_week: number;       // np. 14
  year: number;             // np. 2025
  dry_run?: boolean;        // domyślnie true
  driver_ids?: string[];    // opcjonalnie ograniczyć do listy
  offset?: number;          // do batchowania
  limit?: number;           // do batchowania (domyślnie 25)
  only_diffs?: boolean;     // raport tylko z tygodniami które mają diff
}

// ISO week start (poniedziałek)
function isoWeekStart(year: number, week: number): Date {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const isoStart = new Date(simple);
  if (dow <= 4) isoStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  else isoStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  return isoStart;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface DriverReport {
  driver_id: string;
  driver_name?: string;
  weeks: Array<{
    period_from: string;
    period_to: string;
    settlement_id: string | null;
    previous_actual_payout: number;
    current_payout_raw: number;
    payments_found: number;
    payments_count: number;
    opening_debt: number;
    paid_amount: number;
    remaining_debt: number;
    new_actual_payout: number;
    old_settlement_actual_payout: number;
    old_debt_after: number;
    diff_payout: number;
    diff_debt: number;
    note: string;
  }>;
  unmatched_payments: Array<{ source: string; amount: number; date?: string; note?: string }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as RequestBody;
    const dryRun = body.dry_run !== false; // domyślnie true
    if (!body.start_week || !body.year) {
      return new Response(JSON.stringify({ error: "start_week i year wymagane" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startDate = fmtDate(isoWeekStart(body.year, body.start_week));

    // Lista kierowców
    let driverQuery = supabase.from("drivers").select("id, first_name, last_name");
    if (body.driver_ids?.length) driverQuery = driverQuery.in("id", body.driver_ids);
    const { data: drivers, error: driversErr } = await driverQuery;
    if (driversErr) throw driversErr;

    const reports: DriverReport[] = [];
    let totalWritten = 0;
    let totalPaymentsMigrated = 0;

    for (const driver of drivers || []) {
      // Settlements od start_week
      const { data: settlements } = await supabase
        .from("settlements")
        .select("id, period_from, period_to, actual_payout, amounts, debt_after")
        .eq("driver_id", driver.id)
        .gte("period_from", startDate)
        .order("period_from", { ascending: true });

      if (!settlements?.length) continue;

      // Poprzedni settlement (przed start_week) jako seed dla previousActualPayout
      const { data: seedPrev } = await supabase
        .from("settlements")
        .select("id, actual_payout, period_from, period_to")
        .eq("driver_id", driver.id)
        .lt("period_from", startDate)
        .order("period_to", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Stare driver_debt_transactions od start_week (do migracji wpłat)
      const { data: oldDebtTx } = await supabase
        .from("driver_debt_transactions")
        .select("id, amount, transaction_type, period_from, period_to, created_at, note, settlement_id")
        .eq("driver_id", driver.id)
        .gte("created_at", startDate);

      const driverReport: DriverReport = {
        driver_id: driver.id,
        driver_name: `${driver.first_name || ""} ${driver.last_name || ""}`.trim(),
        weeks: [],
        unmatched_payments: [],
      };

      let previousActualPayout = Number(seedPrev?.actual_payout || 0);
      let previousSettlementId: string | null = seedPrev?.id || null;

      for (const s of settlements) {
        // Wpłaty dla tego tygodnia: 
        // 1) z driver_weekly_debt_payments (jeśli już są)
        // 2) z driver_debt_transactions o typie wskazującym na wpłatę i okresie pasującym do tygodnia
        // 3) z manual_week_adjustment_reason zapisanego w settlements.amounts (gdy ujemna korekta = wpłata)
        const { data: existingDwdp } = await supabase
          .from("driver_weekly_debt_payments")
          .select("amount")
          .eq("driver_id", driver.id)
          .eq("period_from", s.period_from)
          .eq("period_to", s.period_to);

        const matchedTx = (oldDebtTx || []).filter((t) => {
          const isPayment = ["payment", "manual_payment", "debt_payment", "repayment"].includes(
            String(t.transaction_type || "").toLowerCase(),
          );
          if (!isPayment) return false;
          if (t.settlement_id && t.settlement_id === s.id) return true;
          if (t.period_from === s.period_from && t.period_to === s.period_to) return true;
          return false;
        });

        const allPayments: { amount: number }[] = [
          ...(existingDwdp || []).map((p: any) => ({ amount: Number(p.amount || 0) })),
          ...matchedTx.map((t: any) => ({ amount: Math.abs(Number(t.amount || 0)) })),
        ];

        // currentPayoutRaw = stary actual_payout + stary debt_after (odwracamy potrącenie)
        const oldActualPayout = Number(s.actual_payout || 0);
        const oldDebtAfter = Number(s.debt_after || 0);
        const currentPayoutRaw = round2(oldActualPayout + oldDebtAfter);

        const computed = calculateWeeklyDebt(previousActualPayout, currentPayoutRaw, allPayments);

        const note = previousActualPayout < -0.01
          ? `Dług z tygodnia ${seedPrev?.period_to || "poprzedniego"}`
          : "Brak długu z poprzedniego tygodnia";

        driverReport.weeks.push({
          period_from: s.period_from,
          period_to: s.period_to,
          settlement_id: s.id,
          previous_actual_payout: round2(previousActualPayout),
          current_payout_raw: currentPayoutRaw,
          payments_found: round2(allPayments.reduce((a, p) => a + Math.abs(p.amount), 0)),
          payments_count: allPayments.length,
          opening_debt: computed.openingDebt,
          paid_amount: computed.paidAmount,
          remaining_debt: computed.remainingDebt,
          new_actual_payout: computed.actualPayout,
          old_settlement_actual_payout: round2(oldActualPayout),
          old_debt_after: round2(oldDebtAfter),
          diff_payout: round2(computed.actualPayout - oldActualPayout),
          diff_debt: round2(computed.remainingDebt - oldDebtAfter),
          note,
        });

        // Zapis tylko gdy nie dry-run
        if (!dryRun) {
          const { data: upserted, error: upsertErr } = await supabase
            .from("driver_weekly_debts")
            .upsert(
              {
                driver_id: driver.id,
                settlement_id: s.id,
                period_from: s.period_from,
                period_to: s.period_to,
                opening_debt: computed.openingDebt,
                paid_amount: computed.paidAmount,
                remaining_debt: computed.remainingDebt,
                source_previous_settlement_id: previousSettlementId,
                source_previous_actual_payout: round2(previousActualPayout),
                source_note: note,
                status: "active",
              },
              { onConflict: "driver_id,period_from,period_to" },
            )
            .select()
            .single();
          if (upsertErr) throw upsertErr;
          totalWritten++;

          // Migracja wpłat z driver_debt_transactions -> driver_weekly_debt_payments
          for (const t of matchedTx) {
            // Sprawdź czy już zmigrowane (po note albo amount + okres)
            const { data: alreadyExists } = await supabase
              .from("driver_weekly_debt_payments")
              .select("id")
              .eq("driver_id", driver.id)
              .eq("period_from", s.period_from)
              .eq("period_to", s.period_to)
              .eq("amount", Math.abs(Number(t.amount || 0)))
              .ilike("note", `%migrated:${t.id}%`)
              .maybeSingle();
            if (alreadyExists) continue;

            await supabase.from("driver_weekly_debt_payments").insert({
              weekly_debt_id: upserted?.id || null,
              driver_id: driver.id,
              settlement_id: s.id,
              period_from: s.period_from,
              period_to: s.period_to,
              amount: Math.abs(Number(t.amount || 0)),
              payment_type: "migrated",
              note: `migrated:${t.id} ${t.note || ""}`.trim(),
            });
            totalPaymentsMigrated++;
          }

          // Sync settlements
          await supabase
            .from("settlements")
            .update({
              debt_before: computed.openingDebt,
              debt_payment: computed.paidAmount,
              debt_after: computed.remainingDebt,
              actual_payout: computed.actualPayout,
            })
            .eq("id", s.id);
        }

        // Następna iteracja: previous = aktualnie obliczone
        previousActualPayout = computed.actualPayout;
        previousSettlementId = s.id;
      }

      // Niezmatchowane wpłaty
      const matchedIds = new Set<string>();
      for (const w of driverReport.weeks) {
        // (już zliczone w payments_count) — pozostawiamy proste raportowanie:
      }
      const unmatched = (oldDebtTx || []).filter((t) => {
        const isPayment = ["payment", "manual_payment", "debt_payment", "repayment"].includes(
          String(t.transaction_type || "").toLowerCase(),
        );
        if (!isPayment) return false;
        const matchedToWeek = (settlements || []).some(
          (s) =>
            (t.settlement_id && t.settlement_id === s.id) ||
            (t.period_from === s.period_from && t.period_to === s.period_to),
        );
        return !matchedToWeek;
      });
      driverReport.unmatched_payments = unmatched.map((t: any) => ({
        source: "driver_debt_transactions",
        amount: Number(t.amount || 0),
        date: t.created_at,
        note: t.note || t.transaction_type,
      }));

      reports.push(driverReport);
    }

    // Podsumowanie
    const driversWithDiffs = reports.filter((r) =>
      r.weeks.some((w) => Math.abs(w.diff_payout) > 0.01 || Math.abs(w.diff_debt) > 0.01),
    );

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dryRun,
        start_week: body.start_week,
        year: body.year,
        start_date: startDate,
        drivers_processed: reports.length,
        drivers_with_diffs: driversWithDiffs.length,
        weeks_written: totalWritten,
        payments_migrated: totalPaymentsMigrated,
        reports,
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
