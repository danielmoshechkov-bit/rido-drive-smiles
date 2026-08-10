// ============================================================================
// voice-call-commit — ZAPIS ROZMOWY PO ROZŁĄCZENIU.
//
// Zasada nadrzędna: agent rozmawia i notuje, nic nie robi w systemie.
// Tutaj, bez presji czasu, powstaje wszystko naraz.
//
// Ścieżka: transkrypt -> ekstrakcja (Sonnet/Haiku) -> dopasowanie (voiceReconcile)
//          -> RPC voice_commit_call (JEDNA transakcja) -> SMS
//
// SMS jest OSTATNI i POZA transakcją — nie da się go wycofać, więc wychodzi
// dopiero gdy wszystko już istnieje.
//
// TRYB dry_run: przechodzi całą ścieżkę i pokazuje, CO BY zapisał, plus
// porównanie z tym, co faktycznie jest w bazie z tamtej rozmowy. Zero zapisów.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhase1Secret } from "../_shared/voicePhase1SecretReader.ts";
import { extractFromTranscript, type TranscriptTurn } from "../_shared/voiceExtraction.ts";
import { matchBrand, missingForCommit, reconcileCall } from "../_shared/voiceReconcile.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const cleanKey = (k: string) => k.replace(/[^\x20-\x7E]/g, "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const expected = await getPhase1Secret(admin, "VOICE_LLM_TOKEN");
  const provided = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const isServiceCall = provided === serviceRoleKey;
  if (!isServiceCall && (!expected || provided !== expected)) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const conversationId = String(body?.conversation_id || "");
  const providerId = String(body?.provider_id || "");
  const dryRun = body?.dry_run === true;
  if (!conversationId || !providerId) return json({ error: "wymagane: conversation_id, provider_id" }, 400);

  const started = performance.now();
  const kroki: Array<{ krok: string; ms: number }> = [];
  const track = async <T>(krok: string, fn: () => Promise<T>): Promise<T> => {
    const t = performance.now();
    const out = await fn();
    kroki.push({ krok, ms: Math.round(performance.now() - t) });
    return out;
  };

  // 1. TRANSKRYPT — z ciała żądania (webhook) albo z ElevenLabs (dry_run po id).
  let turns: TranscriptTurn[] = Array.isArray(body?.transcript) ? body.transcript : [];
  let callerId: string | null = body?.caller_id ? String(body.caller_id) : null;
  // Data rozmowy — model bez niej wpisywał rok 2024/2025 zamiast bieżącego.
  let startedAt = body?.started_at ? new Date(String(body.started_at)) : new Date();
  if (!turns.length) {
    const elKey = await getPhase1Secret(admin, "ELEVENLABS_API_KEY");
    if (!elKey) return json({ error: "brak ELEVENLABS_API_KEY — nie mam skąd wziąć transkryptu" }, 400);
    const conv = await track("pobranie_transkryptu", async () => {
      const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
        headers: { "xi-api-key": cleanKey(elKey) }, signal: AbortSignal.timeout(20_000),
      });
      return r.ok ? await r.json() : null;
    });
    if (!conv) return json({ error: "ElevenLabs nie zwrócił rozmowy", conversation_id: conversationId }, 404);
    turns = (conv.transcript || []) as TranscriptTurn[];
    callerId = conv?.conversation_initiation_client_data?.dynamic_variables?.system__caller_id || callerId;
    if (conv?.metadata?.start_time_unix_secs) startedAt = new Date(conv.metadata.start_time_unix_secs * 1000);
  }

  // 2. EKSTRAKCJA.
  const anthropicRaw = await getPhase1Secret(admin, "ANTHROPIC_API_KEY");
  if (!anthropicRaw) return json({ error: "brak ANTHROPIC_API_KEY" }, 400);
  const extracted = await track("ekstrakcja", () =>
    extractFromTranscript(cleanKey(anthropicRaw), "claude-haiku-4-5-20251001", turns, startedAt));

  // 3. DOPASOWANIE — kandydaci z bazy, potem czysta funkcja.
  const phoneNorm = (extracted.phone || callerId || "").replace(/\D/g, "").slice(-9);
  const platePattern = (extracted.plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const [{ data: clients }, { data: vehicles }, { data: allVehicles }] = await track("kandydaci", () =>
    Promise.all([
      admin.from("workshop_clients").select("id, first_name, last_name, phone").eq("provider_id", providerId),
      admin.from("workshop_vehicles").select("id, owner_client_id, brand, model, plate").eq("provider_id", providerId),
      admin.from("workshop_vehicles").select("id, plate").eq("provider_id", providerId),
    ]));

  const reconciled = reconcileCall({
    extracted,
    callerId,
    clientsByPhone: (clients || []).filter((c) => (c.phone || "").replace(/\D/g, "").slice(-9) === phoneNorm),
    vehiclesByPlate: (vehicles || []).filter((v) => (v.plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === platePattern),
    allVehicles: allVehicles || [],
  });
  const brandMatch = matchBrand(reconciled.brand);
  const braki = missingForCommit(extracted, reconciled.phone);

  const zapis = {
    first_name: reconciled.firstName, last_name: reconciled.lastName,
    phone: reconciled.phone,
    brand: brandMatch?.brand ?? reconciled.brand, model: reconciled.model,
    plate: reconciled.plate,
    complaint: extracted.complaint, date: extracted.date, time: extracted.time,
    needs_review: reconciled.needsReview || reconciled.plateSuspicious,
    review_reason: reconciled.reviewReason
      || (reconciled.plateSuspicious ? "Numer rejestracyjny nie pasuje do formatu tablic." : null),
  };

  // 4. DRY RUN — pokazuje, co BY zapisał, i porównuje z tym, co JEST.
  if (dryRun) {
    const { data: call } = await admin.from("voice_calls")
      .select("id, linked_entity_id, linked_entity_type")
      .eq("provider_id", providerId).eq("elevenlabs_conversation_id", conversationId).maybeSingle();

    let wBazie: Record<string, unknown> | null = null;
    if (call?.linked_entity_id && call.linked_entity_type === "workshop_order") {
      const { data: ord } = await admin.from("workshop_orders")
        .select("order_number, description, scheduled_date, client_id, vehicle_id, booking_id")
        .eq("id", call.linked_entity_id).maybeSingle();
      if (ord) {
        const [{ data: cl }, { data: veh }, { data: bk }] = await Promise.all([
          admin.from("workshop_clients").select("first_name, last_name, phone").eq("id", ord.client_id).maybeSingle(),
          ord.vehicle_id
            ? admin.from("workshop_vehicles").select("brand, model, plate").eq("id", ord.vehicle_id).maybeSingle()
            : Promise.resolve({ data: null }),
          ord.booking_id
            ? admin.from("service_bookings").select("scheduled_date, scheduled_time").eq("id", ord.booking_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        wBazie = {
          order_number: ord.order_number,
          first_name: cl?.first_name ?? null, last_name: cl?.last_name ?? null,
          phone: cl?.phone ?? null,
          brand: veh?.brand ?? null, model: veh?.model ?? null, plate: veh?.plate ?? null,
          date: bk?.scheduled_date ?? null, time: (bk?.scheduled_time ?? "").toString().slice(0, 5) || null,
        };
      }
    }

    // Porównanie pól, które ASR gubił najczęściej.
    const norm = (v: unknown) => (v === null || v === undefined ? null : String(v).trim().toLowerCase() || null);
    const roznice: Record<string, { ekstrakcja: unknown; baza: unknown }> = {};
    if (wBazie) {
      for (const pole of ["last_name", "brand", "model", "plate", "date", "time"] as const) {
        const a = norm((zapis as Record<string, unknown>)[pole]);
        const b = norm((wBazie as Record<string, unknown>)[pole]);
        if (a !== b) roznice[pole] = { ekstrakcja: (zapis as Record<string, unknown>)[pole], baza: (wBazie as Record<string, unknown>)[pole] };
      }
    }

    return json({
      tryb: "dry_run",
      conversation_id: conversationId,
      tur: turns.length,
      wynik: extracted.parse_failed ? "parse_failed" : braki.length ? "kolejka" : "komplet",
      braki,
      caller_id_obecny: !!callerId,
      zapis,
      marka_zrodlo: brandMatch?.source ?? null,
      klient_zrodlo: reconciled.clientSource,
      pojazd_zrodlo: reconciled.vehicleSource,
      kandydaci_rejestracji: reconciled.plateCandidates,
      w_bazie: wBazie,
      roznice,
      kroki, total_ms: Math.round(performance.now() - started),
    });
  }

  // 5. ZAPIS. Rozmowa bez kompletu NIE ginie — dostaje status i zostaje w kolejce.
  if (extracted.parse_failed || braki.length) {
    await admin.from("voice_calls").update({
      status: "needs_review",
      outcome: extracted.parse_failed ? "Nie udało się odczytać danych z rozmowy." : braki.join("; "),
    }).eq("provider_id", providerId).eq("elevenlabs_conversation_id", conversationId);
    return json({ status: "queued", powod: extracted.parse_failed ? "parse_failed" : braki, conversation_id: conversationId });
  }

  const { data: rpc, error: rpcErr } = await track("commit", () => admin.rpc("voice_commit_call", {
    p_conversation_id: conversationId, p_provider_id: providerId,
    p_first_name: zapis.first_name, p_last_name: zapis.last_name, p_phone: zapis.phone,
    p_brand: zapis.brand, p_model: zapis.model, p_plate: zapis.plate,
    p_complaint: zapis.complaint, p_date: zapis.date, p_time: zapis.time,
    p_needs_review: zapis.needs_review, p_review_reason: zapis.review_reason,
  }));

  if (rpcErr) {
    // ZASADA 12 i 14: błąd nie może wyglądać jak sukces ani zniknąć.
    console.error("[voice-call-commit]", JSON.stringify({ event: "commit_failed", code: rpcErr.code, conversation: conversationId.slice(-8) }));
    await admin.from("voice_calls").update({ status: "needs_review", outcome: "Zapis nie powiódł się: " + rpcErr.code })
      .eq("provider_id", providerId).eq("elevenlabs_conversation_id", conversationId);
    return json({ status: "failed", error: rpcErr.message, conversation_id: conversationId }, 500);
  }

  const wynik = rpc as Record<string, unknown> | null;

  // 6. SMS — OSTATNI KROK, po sukcesie transakcji.
  //
  // Wychodzi WYŁĄCZNIE przy zleceniu Z TERMINEM. Przy statusie "Oddzwonić" klient
  // nie dostaje potwierdzenia wizyty, której nie ma — a SMS „oddzwonimy" byłby
  // obietnicą bez terminu wykonania, nie dowodem. Reakcji pilnuje status
  // w liście zleceń, po stronie tego, kto ma coś zrobić.
  let sms: Record<string, unknown> | null = null;
  if (wynik?.status === "committed" && wynik?.bez_terminu === false && wynik?.public_token) {
    const { data: prov } = await admin.from("service_providers")
      .select("short_name, company_name, company_address, company_postal_code, company_city")
      .eq("id", providerId).maybeSingle();
    const firma = prov?.short_name || prov?.company_name || "serwis";
    const adres = [prov?.company_address, [prov?.company_postal_code, prov?.company_city].filter(Boolean).join(" ")]
      .filter(Boolean).join(", ");
    const link = `https://getrido.pl/r/${wynik.public_token}`;
    const usluga = (zapis.complaint || "").slice(0, 40);
    let tresc = `${firma}: wizyta ${zapis.date} ${zapis.time}.`
      + (usluga ? ` ${usluga}.` : "") + (adres ? ` ${adres}.` : "") + ` Zarzadzaj: ${link}`;
    if (tresc.length > 160) tresc = `${firma}: wizyta ${zapis.date} ${zapis.time}.` + (usluga ? ` ${usluga}.` : "") + ` Zarzadzaj: ${link}`;
    if (tresc.length > 160) tresc = `${firma}: wizyta ${zapis.date} ${zapis.time}. Zarzadzaj: ${link}`;

    const r = await track("sms", () => fetch(`${supabaseUrl}/functions/v1/workshop-send-sms`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_id: providerId, phone: zapis.phone, message: tresc,
        sms_type: "booking_confirmation_ai", appointment_id: wynik.calendar_id,
      }),
      signal: AbortSignal.timeout(15_000),
    }));
    const rj = await r.json().catch(() => ({}));
    sms = { wyslany: !rj?.error, blad: rj?.error ? String(rj.error).slice(0, 120) : null };
    // ZASADA 12: nieudany SMS nie może zniknąć. Zapis już jest, więc nie wycofujemy
    // transakcji — ale rozmowa dostaje flagę, żeby warsztat wiedział.
    if (rj?.error) {
      console.error("[voice-call-commit]", JSON.stringify({ event: "sms_failed", conversation: conversationId.slice(-8) }));
      await admin.from("voice_calls").update({ outcome: "Zapis OK, ale SMS nie wyszedł" })
        .eq("provider_id", providerId).eq("elevenlabs_conversation_id", conversationId);
    }
  }

  console.info("[voice-call-commit]", JSON.stringify({
    event: "commit", status: wynik?.status, order_status: wynik?.status_zlecenia,
    bez_terminu: wynik?.bez_terminu, sms: sms?.wyslany ?? null,
    conversation: conversationId.slice(-8), total_ms: Math.round(performance.now() - started), kroki,
  }));
  return json({ status: "ok", rpc, sms, kroki, total_ms: Math.round(performance.now() - started) });
});
