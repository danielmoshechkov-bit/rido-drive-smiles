// One-shot migration: ledger driver_debt_transactions -> driver_weekly_debt_payments
// Scope: Flame Partner fleet, 2026-03-30..2026-05-03.
// Rules approved by user:
//  - SKIP Marcin Stecki 10.16 (REVIEW)
//  - SKIP Anna Zur duplicate ledger entries (only 1x 463.54)
//  - SKIP if already exists in DWD payments (driver_id + amount in window)
//  - Map week via uiWeekFromDate(created_at)
// Then runs weekly-debt-rebuild for the fleet starting from t.13/2026.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { uiWeekFromDate } from "../_shared/weekMapping.ts";

interface Plan {
  driver_name: string;
  driver_id: string;
  tx_id: string;
  amount: number;
  created_at: string;
  description: string;
  action: "INSERT" | "SKIP_already_in_dwd" | "SKIP_duplicate_ledger" | "REVIEW";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run !== false; // default true

    // 1. Find Flame Partner fleet
    const { data: fleet } = await supabase
      .from("fleets").select("id, name").ilike("name", "%Flame%").limit(1).maybeSingle();
    if (!fleet) throw new Error("Flame fleet not found");

    // 2. Drivers
    const { data: drivers } = await supabase
      .from("drivers").select("id, first_name, last_name").eq("fleet_id", fleet.id);
    const driverMap = new Map<string, string>();
    (drivers || []).forEach((d: any) => {
      driverMap.set(d.id, `${d.first_name || ""} ${d.last_name || ""}`.trim());
    });
    const driverIds = (drivers || []).map((d: any) => d.id);

    // 3. Ledger txs
    const { data: ledger } = await supabase
      .from("driver_debt_transactions")
      .select("id, driver_id, amount, type, created_at, description")
      .in("driver_id", driverIds)
      .in("type", ["payment", "debt_payment"])
      .gte("created_at", "2026-03-30")
      .lt("created_at", "2026-05-04")
      .order("created_at", { ascending: true });

    // 4. Existing DWD payments in window (per driver+amount)
    const { data: existingDwd } = await supabase
      .from("driver_weekly_debt_payments")
      .select("driver_id, amount, period_from, period_to")
      .in("driver_id", driverIds)
      .gte("period_from", "2026-03-30")
      .lte("period_to", "2026-05-03");

    const dwdKeySet = new Set<string>();
    (existingDwd || []).forEach((p: any) => {
      const amt = Math.abs(Number(p.amount)).toFixed(2);
      dwdKeySet.add(`${p.driver_id}|${amt}`);
    });

    // 5. Build plan with dedup
    const seenLedger = new Set<string>();
    const plan: Plan[] = [];
    for (const t of ledger || []) {
      const amt = Math.abs(Number(t.amount));
      const amtKey = amt.toFixed(2);
      const driverName = driverMap.get(t.driver_id) || "?";
      const dedupKey = `${t.driver_id}|${amtKey}`;
      let action: Plan["action"];

      if (driverName === "Marcin Stecki" && Math.abs(amt - 10.16) < 0.001) {
        action = "REVIEW";
      } else if (dwdKeySet.has(dedupKey)) {
        action = "SKIP_already_in_dwd";
      } else if (seenLedger.has(dedupKey)) {
        action = "SKIP_duplicate_ledger";
      } else {
        action = "INSERT";
        seenLedger.add(dedupKey);
      }

      plan.push({
        driver_name: driverName,
        driver_id: t.driver_id,
        tx_id: t.id,
        amount: amt,
        created_at: t.created_at,
        description: t.description || "",
        action,
      });
    }

    const toInsert = plan.filter((p) => p.action === "INSERT");

    let insertedRows: any[] = [];
    if (!dryRun && toInsert.length > 0) {
      const rows = toInsert.map((p) => {
        const w = uiWeekFromDate(p.created_at.slice(0, 10));
        return {
          driver_id: p.driver_id,
          settlement_id: null,
          weekly_debt_id: null,
          period_from: w.startISO,
          period_to: w.endISO,
          amount: p.amount,
          payment_type: "ledger_migration",
          note: `Migracja z ledger tx=${p.tx_id} (${p.description})`,
          created_at: p.created_at,
        };
      });
      const { data: ins, error: insErr } = await supabase
        .from("driver_weekly_debt_payments")
        .insert(rows)
        .select("id, driver_id, period_from, amount");
      if (insErr) throw insErr;
      insertedRows = ins || [];
    }

    return new Response(
      JSON.stringify({
        dry_run: dryRun,
        fleet_id: fleet.id,
        plan_summary: {
          INSERT: plan.filter((p) => p.action === "INSERT").length,
          SKIP_already_in_dwd: plan.filter((p) => p.action === "SKIP_already_in_dwd").length,
          SKIP_duplicate_ledger: plan.filter((p) => p.action === "SKIP_duplicate_ledger").length,
          REVIEW: plan.filter((p) => p.action === "REVIEW").length,
        },
        plan,
        inserted_count: insertedRows.length,
        inserted: insertedRows,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[migrate-ledger-payments-flame]", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
