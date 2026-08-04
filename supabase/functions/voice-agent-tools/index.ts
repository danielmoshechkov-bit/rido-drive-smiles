// ============================================================================
// voice-agent-tools — narzędzia agenta głosowego (Etap 1):
//   check_availability — wolne terminy na dany dzień
//   create_booking     — rezerwacja: service_bookings(source='portal') +
//                        workshop_client_bookings (link /r/:token + 24h reminder)
//                        => widoczna w "Rezerwacje z portalu" i w kalendarzu
//   create_order       — zlecenie: find/create klient(po telefonie)+pojazd(po nr rej)
//                        + workshop_orders(booking_id => ZLP-, status "Umówiony telefonicznie")
//
// Gate uprawnień: calendar_access / orders_access z voice_agent_configs.
// Auth: zweryfikowany użytkownik albo krótkotrwałe, związane z rozmową capability.
// Narzędzia zapisujące są fail-closed do czasu uruchomienia transakcyjnej bramy.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  SecurityError,
  createServiceClient,
  errorResponse,
  handleCors,
  jsonResponse,
  readJsonBody,
  requireUser,
  requestCorrelationId,
  resolveProviderForUser,
  writeAuditEvent,
} from "../_shared/security.ts";
import {
  consumeAiRateLimit,
  requireAiLiveRuntimeEnabled,
  verifyAiCapabilityToken,
  type VerifiedAiCapabilityClaims,
} from "../_shared/aiSecurity.ts";

const norm9 = (p: string) => (p || "").replace(/\D/g, "").slice(-9);
const normPlate = (p: string) => (p || "").toUpperCase().replace(/\s/g, "");
const splitName = (full: string) => {
  const parts = (full || "").trim().split(/\s+/);
  return { first: parts[0] || "Klient", last: parts.slice(1).join(" ") || "" };
};
const addMinutes = (date: string, time: string, mins: number) => {
  const d = new Date(`${date}T${(time || "09:00")}:00`);
  return new Date(d.getTime() + mins * 60000).toISOString();
};

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== "POST") return jsonResponse(req, 405, { error: "method_not_allowed" });
  const json = (body: unknown, status = 200) => jsonResponse(req, status, body);
  try {
    const admin = createServiceClient();

    const body = await readJsonBody(req, 256_000);
    const action = String(body?.action || "");
    const personaKey = String(body?.persona_key || "workshop_secretary").slice(0, 64);
    if (!/^[a-z0-9_-]+$/i.test(personaKey)) {
      throw new SecurityError(400, "invalid_persona", "Nieprawidłowa persona");
    }
    if (!new Set(["check_availability", "create_booking", "create_order"]).has(action)) {
      throw new SecurityError(400, "unknown_action", "Nieznana akcja narzędzia");
    }

    const capabilityToken = req.headers.get("x-rido-ai-capability");
    if (req.headers.has("x-rido-internal-secret")) {
      throw new SecurityError(401, "legacy_internal_auth_disabled", "Wspólny sekret integracji głosowej jest wyłączony");
    }
    let identity: Awaited<ReturnType<typeof requireUser>> | null = null;
    let capability: VerifiedAiCapabilityClaims | null = null;
    const requestedProviderId = typeof body?.provider_id === "string" ? body.provider_id : "";
    const requestedConfigId = typeof body?.config_id === "string" ? body.config_id : "";
    const requestedCallId = typeof body?.call_id === "string" ? body.call_id : "";
    if (capabilityToken) {
      capability = await verifyAiCapabilityToken(
        capabilityToken,
        Deno.env.get("AI_CAPABILITY_SIGNING_SECRET") || "",
        {
          binding: {
            providerId: requestedProviderId,
            configId: requestedConfigId,
            callId: requestedCallId,
            personaKey,
            scope: action === "check_availability" ? "voice.tool.read" : "voice.tool.write",
          },
        },
      );
    } else {
      identity = await requireUser(req, admin);
    }
    const correlationId = identity?.correlationId ?? requestCorrelationId(req);

    let providerId: string;
    let tenantId: string | null = null;
    if (identity) {
      const provider = await resolveProviderForUser(admin, identity, requestedProviderId || undefined);
      providerId = provider.id;
      tenantId = provider.company_id;
    } else if (capability) {
      const { data: provider, error: providerError } = await admin.from("service_providers")
        .select("id, company_id")
        .eq("id", requestedProviderId)
        .maybeSingle();
      if (providerError || !provider) throw new SecurityError(403, "provider_access_denied", "Brak dostępu do usługodawcy");
      providerId = provider.id;
      tenantId = provider.company_id;
    } else {
      throw new SecurityError(401, "unauthorized", "Wymagane jest uwierzytelnienie");
    }

    // --- Konfig agenta (uprawnienia) ---
    const { data: cfg, error: configError } = await admin
      .from("voice_agent_configs")
      .select("id, calendar_access, orders_access, is_active, privacy_confirmed, kill_switch_enabled, dry_run_tools, max_tool_calls_per_conversation, daily_tool_call_limit")
      .eq("provider_id", providerId).eq("persona_key", personaKey).maybeSingle();
    if (configError || !cfg) throw new SecurityError(404, "agent_config_not_found", "Brak konfiguracji agenta");
    if (capability && cfg.id !== capability.config_id) {
      throw new SecurityError(403, "ai_capability_binding_denied", "Capability AI nie pasuje do konfiguracji");
    }
    const calendarAccess = !!cfg?.calendar_access;
    const ordersAccess = !!cfg?.orders_access;

    if (capability) {
      requireAiLiveRuntimeEnabled(Deno.env.get("AI_VOICE_LIVE_EXECUTION_ENABLED"));
      const [featureResult, runtimeResult] = await Promise.all([
        admin.from("ai_feature_flags").select("is_enabled").eq("flag_key", "ai_agents_enabled").maybeSingle(),
        admin.from("ai_global_runtime_control").select("kill_switch_enabled").eq("control_key", "global").maybeSingle(),
      ]);
      if (featureResult.error || runtimeResult.error
        || featureResult.data?.is_enabled !== true
        || runtimeResult.data?.kill_switch_enabled !== false
        || cfg.kill_switch_enabled !== false
        || cfg.dry_run_tools !== false
        || cfg.is_active !== true
        || cfg.privacy_confirmed !== true
        || Number(cfg.max_tool_calls_per_conversation) <= 0
        || Number(cfg.daily_tool_call_limit) <= 0) {
        throw new SecurityError(503, "voice_agent_disabled", "Agent głosowy jest wyłączony");
      }
    }

    await consumeAiRateLimit(admin, {
      scope: identity ? "ai.voice.tool.user" : "ai.voice.tool.live",
      subjectId: identity?.userId ?? cfg.id,
      limit: identity ? 60 : 120,
      windowSeconds: 60,
    });
    await consumeAiRateLimit(admin, {
      scope: "ai.voice.tool.provider.daily",
      subjectId: providerId,
      limit: 2_000,
      windowSeconds: 86_400,
    });

    if (action === "create_booking" || action === "create_order") {
      await writeAuditEvent(admin, {
        actorId: identity?.userId ?? null,
        tenantId,
        action: `ai.voice_tool.${action}`,
        resourceType: "voice_agent_config",
        resourceId: providerId,
        result: "denied",
        correlationId,
        metadata: { reason: "transactional_gateway_required", persona_key: personaKey },
      });
      return jsonResponse(req, 503, {
        ok: false,
        error: "voice_write_tools_disabled",
        message: "Narzędzia zapisujące są zablokowane do czasu uruchomienia transakcyjnej bramy",
      });
    }

    // ========================= CHECK AVAILABILITY =========================
    if (action === "check_availability") {
      if (!calendarAccess) throw new SecurityError(403, "calendar_access_denied", "Agent nie ma dostępu do kalendarza");
      const date = String(body?.date || "");
      const duration = Number(body?.duration_minutes ?? 60);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
        throw new SecurityError(400, "invalid_date", "Nieprawidłowa data");
      }
      if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
        throw new SecurityError(400, "invalid_duration", "Nieprawidłowy czas usługi");
      }

      // godziny pracy (service_working_hours -> fallback 9-17)
      const dow = new Date(`${date}T00:00:00`).getDay(); // 0=nd
      let fromH = 9, toH = 17;
      const { data: wh, error: workingHoursError } = await admin.from("service_working_hours")
        .select("*").eq("provider_id", providerId).eq("day_of_week", dow).maybeSingle();
      if (workingHoursError) throw new SecurityError(503, "calendar_unavailable", "Nie można pobrać godzin pracy");
      if (wh) {
        if (wh.is_open === false || wh.is_closed === true) return json({ ok: true, slots: [], note: "Nieczynne tego dnia" });
        const s = wh.start_time || wh.open_time, e = wh.end_time || wh.close_time;
        if (s) fromH = parseInt(String(s).slice(0, 2));
        if (e) toH = parseInt(String(e).slice(0, 2));
      }
      // pojemność = liczba aktywnych stanowisk (min 1)
      const { count: stations, error: stationsError } = await admin.from("workshop_workstations")
        .select("id", { count: "exact", head: true }).eq("provider_id", providerId).eq("is_active", true);
      if (stationsError) throw new SecurityError(503, "calendar_unavailable", "Nie można pobrać stanowisk");
      const capacity = Math.max(1, stations || 0);
      // zajętość z service_bookings tego dnia
      const { data: booked, error: bookedError } = await admin.from("service_bookings")
        .select("scheduled_time, duration_minutes").eq("provider_id", providerId)
        .eq("scheduled_date", date).not("status", "in", "(cancelled,rejected)");
      if (bookedError) throw new SecurityError(503, "calendar_unavailable", "Nie można pobrać dostępności");
      const load: Record<string, number> = {};
      for (const b of booked || []) {
        const start = parseInt(String(b.scheduled_time).slice(0, 2)) * 60 + parseInt(String(b.scheduled_time).slice(3, 5));
        const dur = b.duration_minutes || 60;
        for (let m = start; m < start + dur; m += 30) { const k = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; load[k] = (load[k] || 0) + 1; }
      }
      const slots: string[] = [];
      for (let start = fromH * 60; start + duration <= toH * 60; start += 30) {
        let available = true;
        for (let minute = start; minute < start + duration; minute += 30) {
          const key = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
          if ((load[key] || 0) >= capacity) {
            available = false;
            break;
          }
        }
        if (available) slots.push(`${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`);
      }
      await writeAuditEvent(admin, {
        actorId: identity?.userId ?? null,
        tenantId,
        action: "ai.voice_tool.check_availability",
        resourceType: "voice_agent_config",
        resourceId: cfg.id,
        result: "succeeded",
        correlationId,
        metadata: { persona_key: personaKey, date, slot_count: slots.length },
      });
      return json({ ok: true, date, slots, capacity });
    }

    // ========================= CREATE BOOKING =========================
    if (action === "create_booking") {
      if (!calendarAccess) return json({ ok: false, error: "Agent nie ma dostępu do kalendarza (włącz w panelu)." }, 403);
      // IDEMPOTENCJA: ta rozmowa ma już rezerwację albo zlecenie — nie tworzymy drugiej
      // i nie wysyłamy drugiego SMS-a. Ponowienie tury zwraca istniejący identyfikator.
      if (conversationCall?.linked_entity_id) {
        return json({
          ok: true, booking_id: conversationCall.linked_entity_id, duplicate: true,
          message: "Rezerwacja w tej rozmowie już istnieje.",
        });
      }
      const name = String(body?.customer_name || "").trim();
      const phone = String(body?.customer_phone || "").trim();
      const date = String(body?.scheduled_date || "");
      const time = String(body?.scheduled_time || "");
      const duration = Number(body?.duration_minutes) || 60;
      if (!name || !phone || !date || !time) return json({ ok: false, error: "Wymagane: imię, telefon, data, godzina" }, 400);
      const veh = body?.vehicle || {};
      const isTest = !!body?.is_test;
      const notePrefix = isTest ? "[TEST AI] " : "[Z ROZMOWY AI] ";
      const { first, last } = splitName(name);

      // dedup: ta sama rezerwacja (telefon+data+godzina) już istnieje?
      const { data: exBk } = await admin.from("service_bookings")
        .select("id").eq("provider_id", providerId).eq("customer_phone", phone)
        .eq("scheduled_date", date).eq("scheduled_time", time).neq("status", "cancelled").maybeSingle();
      if (exBk) return json({ ok: true, booking_id: exBk.id, duplicate: true, message: "Rezerwacja na ten termin już istnieje." });

      // 1) service_bookings (source='portal') -> "Rezerwacje z portalu" + kalendarz
      const { data: sb, error: sbErr } = await admin.from("service_bookings").insert({
        provider_id: providerId,
        service_id: body?.service_id || null,
        customer_name: name, customer_phone: phone, customer_email: null,
        scheduled_date: date, scheduled_time: time, duration_minutes: duration,
        customer_notes: notePrefix + (body?.notes || ""),
        vehicle_brand: veh.brand || null, vehicle_model: veh.model || null,
        vehicle_year: veh.year || null, vehicle_plate: veh.plate || null,
        status: "pending", completion_status: "pending",
        requires_provider_confirmation: true, source: "portal",
      }).select("id").single();
      if (sbErr) return json({ ok: false, error: "Rezerwacja: " + sbErr.message }, 400);

      // 2) workshop_client_bookings -> link /r/:token + 24h reminder
      const { data: wcb } = await admin.from("workshop_client_bookings").insert({
        provider_id: providerId, phone, first_name: first, last_name: last,
        plate: veh.plate || null, brand: veh.brand || null, model: veh.model || null,
        service_description: notePrefix + (body?.notes || body?.service_name || ""),
        appointment_date: date, appointment_time: time, duration_minutes: duration,
        status: "scheduled", reminder_enabled: true, reminder_times: ["24h"],
      }).select("id, confirmation_token, public_token").maybeSingle();

      // Wysyłka SMS z tej ścieżki pozostaje celowo wyłączona. Przywrócenie
      // wymaga osobnego capability `voice.sms.write`, atomowego claimu narzędzia
      // i serwerowego powiązania odbiorcy; wspólny sekret nie jest akceptowany.
      let smsSent = false;
      let manageLink: string | null = null;
      if (wcb?.confirmation_token) {
        const appBase = Deno.env.get("APP_PUBLIC_URL") || "https://preview--rido-drive-smiles.lovable.app";
        manageLink = `${appBase}/r/${wcb.confirmation_token}`;
      }

      // Powiązanie rozmowy z rezerwacją. Po utworzeniu zlecenia zostanie nadpisane
      // na workshop_order, bo tego szuka zakładka "Rozmowa telefoniczna".
      await linkConversation("service_booking", sb.id);

      return json({
        ok: true, booking_id: sb.id,
        client_booking_id: wcb?.id || null,
        manage_token: wcb?.confirmation_token || null,
        manage_link: manageLink, sms_sent: smsSent,
        message: `Rezerwacja utworzona na ${date} ${time}.${smsSent ? " Wysłano SMS potwierdzenia z linkiem." : ""}`,
      });
    }

    // ========================= CREATE ORDER =========================
    if (action === "create_order") {
      if (!ordersAccess) return json({ ok: false, error: "Agent nie ma dostępu do zleceń (włącz w panelu)." }, 403);
      // IDEMPOTENCJA: ta rozmowa ma już zlecenie — zwracamy istniejące zamiast tworzyć drugie.
      if (conversationCall?.linked_entity_type === "workshop_order" && conversationCall.linked_entity_id) {
        return json({
          ok: true, order_id: conversationCall.linked_entity_id, duplicate: true,
          message: "Zlecenie w tej rozmowie już istnieje.",
        });
      }
      const name = String(body?.customer_name || "").trim();
      const phone = String(body?.customer_phone || "").trim();
      // opis jako czyste linie-punkty (karta pracownika sama numeruje 1. 2. 3.)
      const complaint = String(body?.complaint || body?.notes || "").trim()
        .split("\n").map((l) => l.replace(/^\s*[-•*–]\s*/, "").trim()).filter(Boolean).join("\n");
      const date = String(body?.scheduled_date || "");
      const time = String(body?.scheduled_time || "");
      const duration = Number(body?.duration_minutes) || 60;
      const veh = body?.vehicle || {};
      if (!name || !phone) return json({ ok: false, error: "Wymagane: imię i telefon" }, 400);
      const { first, last } = splitName(name);

      // dedup #1: po booking_id (jedno zlecenie na rezerwację)
      if (body?.booking_id) {
        const { data: exB } = await admin.from("workshop_orders").select("id, order_number").eq("booking_id", body.booking_id).maybeSingle();
        if (exB) return json({ ok: true, order_id: exB.id, order_number: exB.order_number, duplicate: true, message: "Zlecenie już istnieje." });
      }

      // status "Umówiony telefonicznie" — upewnij się że istnieje u providera (select-then-insert)
      const { data: stExisting } = await admin.from("workshop_order_statuses")
        .select("id").eq("provider_id", providerId).eq("name", "Umówiony telefonicznie").maybeSingle();
      if (!stExisting) {
        await admin.from("workshop_order_statuses").insert({ provider_id: providerId, name: "Umówiony telefonicznie", color: "#0ea5e9", sort_order: 1 });
      }

      // klient po telefonie (ostatnie 9 cyfr)
      let clientId: string | null = null;
      const p9 = norm9(phone);
      const { data: clients } = await admin.from("workshop_clients").select("id, phone").eq("provider_id", providerId);
      clientId = (clients || []).find((c: any) => norm9(c.phone || "") === p9)?.id || null;
      if (!clientId) {
        const { data: nc } = await admin.from("workshop_clients").insert({
          provider_id: providerId, client_type: "private", first_name: first, last_name: last, phone,
        }).select("id").single();
        clientId = nc.id;
      }

      // dedup #2: świeże zlecenie tego klienta w ostatnich 15 min (ta sama rozmowa)
      const { data: recentOrder } = await admin.from("workshop_orders")
        .select("id, order_number")
        .eq("provider_id", providerId).eq("client_id", clientId)
        .gte("created_at", new Date(Date.now() - 15 * 60000).toISOString())
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (recentOrder) return json({ ok: true, order_id: recentOrder.id, order_number: recentOrder.order_number, duplicate: true, message: "Zlecenie już utworzone w tej rozmowie." });

      // pojazd po nr rej
      let vehicleId: string | null = null;
      const plate = normPlate(veh.plate || "");
      if (plate) {
        const { data: vehs } = await admin.from("workshop_vehicles").select("id, plate").eq("provider_id", providerId);
        vehicleId = (vehs || []).find((v: any) => normPlate(v.plate || "") === plate)?.id || null;
      }
      if (!vehicleId && (veh.plate || veh.brand || veh.model)) {
        const { data: nv } = await admin.from("workshop_vehicles").insert({
          provider_id: providerId, owner_client_id: clientId,
          brand: veh.brand || null, model: veh.model || null, year: veh.year || null, plate: veh.plate || null,
        }).select("id").maybeSingle();
        vehicleId = nv?.id || null;
      }

      // zlecenie (omijamy order_number -> trigger nada ZLP-; booking_id -> ZLP + kalendarz)
      const insert: any = {
        provider_id: providerId, client_id: clientId, vehicle_id: vehicleId,
        booking_id: body?.booking_id || null,
        description: complaint || "Zgłoszenie telefoniczne",
        status_name: "Umówiony telefonicznie",
      };
      if (date && time) { insert.scheduled_date = date; insert.scheduled_start = `${date}T${time}:00`; insert.scheduled_end = addMinutes(date, time, duration); }
      const { data: order, error: oErr } = await admin.from("workshop_orders").insert(insert).select("id, order_number").single();
      if (oErr) return json({ ok: false, error: "Zlecenie: " + oErr.message }, 400);

      // Powiązanie rozmowy ze zleceniem — dokładnie to czyta zakładka
      // "Rozmowa telefoniczna" (voice_calls po linked_entity_type/linked_entity_id).
      await linkConversation("workshop_order", order.id);

      return json({ ok: true, order_id: order.id, order_number: order.order_number, client_id: clientId, vehicle_id: vehicleId });
    }

    return json({ ok: false, error: "Nieznana akcja" }, 400);
  } catch (e) {
    return errorResponse(req, e);
  }
});
