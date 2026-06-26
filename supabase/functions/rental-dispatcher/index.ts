// =====================================================================
// rental-dispatcher — OUTBOX poller (warstwa zdarzeń modułu wynajem)
// Dokument: docs/wynajem-mvp-projekt.md (pkt 1.2 / 1.3)
//
// Co robi:
//   1. Atomowo "claimuje" porcję eventów (RPC claim_domain_events ->
//      UPDATE ... FOR UPDATE SKIP LOCKED) — dwa pollery nie wezmą tego samego.
//   2. Dla każdego eventu uruchamia zarejestrowane handlery, ale tylko gdy
//      moduł danego handlera jest włączony dla firmy
//      (company_module_enabled = warstwy 1+2, bez roli — kontekst service-role).
//   3. Idempotencja: run-guard przez INSERT do event_handler_runs
//      (UNIQUE(event_id, handler_key)) — handler odpala się raz na event,
//      nawet przy retry / dwóch pollerach.
//   4. Po przetworzeniu ustawia status eventu: 'done' (sukces lub same skip)
//      albo 'failed' (gdy któryś handler zwrócił błąd) -> poller ponowi.
//
// UWAGA (paczka 1): rejestr HANDLERS jest PUSTY.
//   Producenci eventów (booking->'rezerwacja_potwierdzona' itd.) oraz
//   handlery (faktura, płatność, kalendarz) dochodzą w KOLEJNYCH paczkach.
//   Tu budujemy samą infrastrukturę — event bez handlera = 'done' (no-op).
//
// verify_jwt = false (config.toml). Wywoływane przez pg_cron (WYN6) oraz
// opcjonalnie akcelerowane przez pg_notify (WYN2). Autoryzacja: service-role.
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const BATCH_SIZE = 20;

interface DomainEvent {
  id: string;
  company_id: string;
  event_key: string;
  source_type: string | null;
  source_id: string | null;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
}

// Definicja handlera. `requiredModule` jest sprawdzany przez
// company_module_enabled() PRZED uruchomieniem (graceful degradation).
interface Handler {
  handlerKey: string;
  requiredModule: string;
  run: (event: DomainEvent, supabase: SupabaseClient) => Promise<Record<string, unknown>>;
}

// -----------------------------------------------------------------
// REJESTR HANDLERÓW — event_key -> lista handlerów.
// PUSTY w paczce 1. Przykład docelowego wpisu (kolejne paczki):
//   "rezerwacja_potwierdzona": [
//     { handlerKey: "invoice:create", requiredModule: "invoicing", run: ... },
//     { handlerKey: "payment:link",   requiredModule: "payments",  run: ... },
//   ],
// -----------------------------------------------------------------
const HANDLERS: Record<string, Handler[]> = {};

async function processEvent(event: DomainEvent, supabase: SupabaseClient): Promise<"done" | "failed"> {
  const handlers = HANDLERS[event.event_key] ?? [];
  let anyFailed = false;

  for (const handler of handlers) {
    // Run-guard (idempotencja): rezerwujemy wykonanie przez INSERT z UNIQUE.
    // Jeśli wpis już istnieje (handler odpalił się wcześniej) -> pomijamy.
    const { error: claimErr } = await supabase
      .from("event_handler_runs")
      .insert({ event_id: event.id, handler_key: handler.handlerKey, status: "done" });

    if (claimErr) {
      // 23505 = unique_violation -> już wykonany; każdy inny błąd = realny problem.
      if ((claimErr as { code?: string }).code === "23505") {
        console.log(`[skip-already-run] event=${event.id} handler=${handler.handlerKey}`);
        continue;
      }
      console.error(`[run-guard-error] event=${event.id} handler=${handler.handlerKey}`, claimErr);
      anyFailed = true;
      continue;
    }

    // Graceful degradation: moduł handlera wyłączony dla firmy -> skip.
    const { data: enabled, error: gateErr } = await supabase.rpc("company_module_enabled", {
      p_company_id: event.company_id,
      p_module_key: handler.requiredModule,
    });

    if (gateErr) {
      console.error(`[gate-error] event=${event.id} handler=${handler.handlerKey}`, gateErr);
      await supabase
        .from("event_handler_runs")
        .update({ status: "failed", result: { error: gateErr.message } })
        .eq("event_id", event.id)
        .eq("handler_key", handler.handlerKey);
      anyFailed = true;
      continue;
    }

    if (!enabled) {
      await supabase
        .from("event_handler_runs")
        .update({ status: "skipped", result: { reason: "module_disabled", module: handler.requiredModule } })
        .eq("event_id", event.id)
        .eq("handler_key", handler.handlerKey);
      console.log(`[skip-module-off] event=${event.id} handler=${handler.handlerKey} module=${handler.requiredModule}`);
      continue;
    }

    // Wykonanie handlera.
    try {
      const result = await handler.run(event, supabase);
      await supabase
        .from("event_handler_runs")
        .update({ status: "done", result: result ?? {} })
        .eq("event_id", event.id)
        .eq("handler_key", handler.handlerKey);
    } catch (e) {
      console.error(`[handler-error] event=${event.id} handler=${handler.handlerKey}`, e);
      await supabase
        .from("event_handler_runs")
        .update({ status: "failed", result: { error: String(e) } })
        .eq("event_id", event.id)
        .eq("handler_key", handler.handlerKey);
      anyFailed = true;
    }
  }

  return anyFailed ? "failed" : "done";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // 1) Atomowy claim porcji eventów.
    const { data: claimed, error: claimError } = await supabase.rpc("claim_domain_events", {
      p_limit: BATCH_SIZE,
    });

    if (claimError) {
      console.error("[claim-error]", claimError);
      return new Response(JSON.stringify({ error: claimError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const events = (claimed ?? []) as DomainEvent[];
    let done = 0;
    let failed = 0;

    // 2) Przetwarzanie każdego claimowanego eventu.
    for (const event of events) {
      const outcome = await processEvent(event, supabase);
      if (outcome === "done") {
        done++;
        await supabase
          .from("domain_events")
          .update({ status: "done", processed_at: new Date().toISOString(), last_error: null })
          .eq("id", event.id);
      } else {
        failed++;
        await supabase
          .from("domain_events")
          // wracamy do 'pending' -> poller ponowi (z backoffem implikowanym przez czas)
          .update({ status: "pending", last_error: "handler_failed", locked_at: null })
          .eq("id", event.id);
      }
    }

    return new Response(
      JSON.stringify({ claimed: events.length, done, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[dispatcher-fatal]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
