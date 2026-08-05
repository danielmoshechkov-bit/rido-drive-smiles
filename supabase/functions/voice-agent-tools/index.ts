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
// Auth: zalogowany użytkownik = właściciel providera (test); później service-role
// dla telefonii. Wstawki przez service_role (bypass RLS).
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPublicUrl } from "../_shared/publicUrl.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    let providerId = String(body?.provider_id || "");
    const personaKey = String(body?.persona_key || "workshop_secretary");

    // --- Autoryzacja: user-owner (test) albo service-role (telefonia w 1.5) ---
    const isServiceCall = authHeader === `Bearer ${serviceRoleKey}`;
    if (!isServiceCall) {
      if (!authHeader) return json({ ok: false, error: "Brak autoryzacji" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: aerr } = await userClient.auth.getUser();
      if (aerr || !user) return json({ ok: false, error: "Brak autoryzacji" }, 401);
      // resolwuj/weryfikuj providera użytkownika
      if (!providerId) {
        const { data: sp } = await admin.from("service_providers").select("id").eq("user_id", user.id).maybeSingle();
        providerId = sp?.id || "";
      } else {
        const { data: sp } = await admin.from("service_providers").select("id").eq("id", providerId).eq("user_id", user.id).maybeSingle();
        const { data: isAdmin } = await admin.from("user_roles").select("id").eq("user_id", user.id).eq("role", "admin").maybeSingle();
        if (!sp && !isAdmin) return json({ ok: false, error: "Brak dostępu do tego providera" }, 403);
      }
    }
    if (!providerId) return json({ ok: false, error: "Brak provider_id" }, 400);

    // --- Konfig agenta (uprawnienia) ---
    const { data: cfg } = await admin
      .from("voice_agent_configs")
      .select("calendar_access, orders_access")
      .eq("provider_id", providerId).eq("persona_key", personaKey).maybeSingle();
    const calendarAccess = !!cfg?.calendar_access;
    const ordersAccess = !!cfg?.orders_access;

    // ===================== TOŻSAMOŚĆ ROZMOWY (dodatek) =====================
    // conversation_id przychodzi wyłącznie z uwierzytelnionego wywołania service-role
    // (voice-agent-chat w gałęzi canary). Daje dwie rzeczy naraz:
    //   1) klucz idempotencji — retry tej samej tury nie utworzy drugiej rezerwacji,
    //   2) powiązanie rozmowy ze zleceniem, którego szuka panel warsztatu
    //      (OrderCallPanel czyta voice_calls po linked_entity_type/linked_entity_id).
    //
    // Cały blok jest DODATKIEM: gdy conversation_id nie przyjdzie, wszystko poniżej
    // zachowuje się dokładnie tak jak dotąd i żadna istniejąca ścieżka się nie zmienia.
    //
    // OGRANICZENIE: brak unikalnego indeksu na voice_calls(provider_id,
    // elevenlabs_conversation_id), więc find-or-create jest podatny na wyścig przy
    // równoczesnych żądaniach. W rozmowie telefonicznej tury idą sekwencyjnie, więc
    // w praktyce to wystarcza; twardą gwarancję dałby unikalny indeks (migracja).
    const conversationId = isServiceCall ? String(body?.conversation_id || "") : "";
    let conversationCall: { id: string; linked_entity_type: string | null; linked_entity_id: string | null } | null = null;
    if (conversationId && providerId) {
      const { data: existingCall } = await admin.from("voice_calls")
        .select("id, linked_entity_type, linked_entity_id")
        .eq("provider_id", providerId).eq("elevenlabs_conversation_id", conversationId).maybeSingle();
      if (existingCall) {
        conversationCall = existingCall as typeof conversationCall;
      } else {
        const { data: createdCall } = await admin.from("voice_calls").insert({
          provider_id: providerId, persona_key: personaKey, direction: "inbound",
          elevenlabs_conversation_id: conversationId, status: "in_progress",
          started_at: new Date().toISOString(),
        }).select("id, linked_entity_type, linked_entity_id").maybeSingle();
        conversationCall = (createdCall as typeof conversationCall) || null;
      }
    }
    // Zapamiętanie powiązania rozmowy z utworzonym rekordem. Zlecenie ma pierwszeństwo
    // nad rezerwacją, bo to jego szuka zakładka "Rozmowa telefoniczna".
    const linkConversation = async (entityType: "service_booking" | "workshop_order", entityId: string) => {
      if (!conversationCall) return;
      if (conversationCall.linked_entity_type === "workshop_order" && entityType !== "workshop_order") return;
      const { error } = await admin.from("voice_calls")
        .update({ linked_entity_type: entityType, linked_entity_id: entityId })
        .eq("id", conversationCall.id).eq("provider_id", providerId);
      if (error) console.warn("[voice-agent-tools] link_failed", { code: error.code });
      else conversationCall = { ...conversationCall, linked_entity_type: entityType, linked_entity_id: entityId };
    };

    // ========================= CHECK AVAILABILITY =========================
    if (action === "check_availability") {
      const date = String(body?.date || "");
      const duration = Number(body?.duration_minutes) || 60;
      if (!date) return json({ ok: false, error: "Brak daty" }, 400);

      // godziny pracy (service_working_hours -> fallback 9-17)
      const dow = new Date(`${date}T00:00:00`).getDay(); // 0=nd
      let fromH = 9, toH = 17;
      const { data: wh } = await admin.from("service_working_hours")
        .select("*").eq("provider_id", providerId).eq("day_of_week", dow).maybeSingle();
      if (wh) {
        if (wh.is_open === false || wh.is_closed === true) return json({ ok: true, slots: [], note: "Nieczynne tego dnia" });
        const s = wh.start_time || wh.open_time, e = wh.end_time || wh.close_time;
        if (s) fromH = parseInt(String(s).slice(0, 2));
        if (e) toH = parseInt(String(e).slice(0, 2));
      }
      // pojemność = liczba aktywnych stanowisk (min 1)
      const { count: stations } = await admin.from("workshop_workstations")
        .select("id", { count: "exact", head: true }).eq("provider_id", providerId).eq("is_active", true);
      const capacity = Math.max(1, stations || 0);
      // zajętość z service_bookings tego dnia
      const { data: booked } = await admin.from("service_bookings")
        .select("scheduled_time, duration_minutes").eq("provider_id", providerId)
        .eq("scheduled_date", date).not("status", "in", "(cancelled,rejected)");
      const load: Record<string, number> = {};
      for (const b of booked || []) {
        const start = parseInt(String(b.scheduled_time).slice(0, 2)) * 60 + parseInt(String(b.scheduled_time).slice(3, 5));
        const dur = b.duration_minutes || 60;
        for (let m = start; m < start + dur; m += 30) { const k = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; load[k] = (load[k] || 0) + 1; }
      }
      const slots: string[] = [];
      for (let h = fromH; h < toH; h++) {
        for (const mm of ["00", "30"]) {
          const t = `${String(h).padStart(2, "0")}:${mm}`;
          if ((load[t] || 0) < capacity) slots.push(t);
        }
      }
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

      // ATOMOWE PRZEJĘCIE ROZMOWY.
      //
      // Sprawdzenie "czy już istnieje, jeśli nie to wstaw" NIE wystarcza, gdy żądania
      // biegną równolegle: wszystkie trzy sprawdzają, zanim którekolwiek zapisze.
      // Rozmowa 05.08 17:56 dostała trzy wpisy w grafiku i sześć SMS-ów właśnie tak.
      //
      // ElevenLabs wysyła duplikaty niezależnie od nas — trzy z czterech to poprawki
      // ASR (ta sama liczba wiadomości, inna treść ostatniej wypowiedzi), jedno to
      // czysty retry (identyczny skrót). Nie da się ich odróżnić po treści, więc
      // rozstrzygamy to zapisem warunkowym w bazie: wygrywa żądanie, któremu UPDATE
      // faktycznie zmienił wiersz. Reszta dostaje `duplicate` i nie dotyka bazy.
      //
      // Żądanie, które przejmie rozmowę, zawsze dokończy zapisy — nawet gdy ElevenLabs
      // porzuci połączenie (widać w logach: porzucone żądania kończą swoje narzędzia).
      if (conversationCall) {
        const { data: claimed } = await admin.from("voice_calls")
          .update({ linked_entity_type: "voice_booking_claim" })
          .eq("id", conversationCall.id).eq("provider_id", providerId)
          .is("linked_entity_type", null)
          .select("id");
        if (!claimed?.length) {
          console.info("[voice-agent-tools] booking_claim_lost", { conversation: conversationId.slice(-8) });
          return json({
            ok: true, duplicate: true,
            message: "Rezerwacja w tej rozmowie jest już tworzona.",
          });
        }
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
      //
      // Tu był goły `return`. Skutek: przy trafieniu dedupu funkcja wychodziła
      // PRZED wpisem do grafiku, przed SMS-em i przed zleceniem. Rozmowa 05.08
      // 02:05 trafiła w rezerwację z 01:41 (ten sam telefon, 06.08 09:00) — klient
      // nie dostał SMS-a mimo obietnicy agenta, w grafiku nic nie przybyło,
      // a zlecenie powstało tylko dlatego, że model osobno zawołał create_order.
      //
      // Dedup pomija teraz WYŁĄCZNIE wstawienie do service_bookings. Reszta kroku
      // wykonuje się dalej i dociąga to, czego brakuje przy istniejącej rezerwacji.
      // UWAGA na `maybeSingle()`: przy WIĘCEJ NIŻ JEDNYM pasującym wierszu PostgREST
      // zwraca BŁĄD, a nie wiersz. Z `const { data } = …` (bez `error`) wygląda to
      // identycznie jak brak dopasowania — czyli kod idzie wstawić kolejny duplikat,
      // przez co następne sprawdzenie pasuje do jeszcze większej liczby wierszy.
      // Rozmowa 05.08 17:56 zrobiła tak trzy wpisy w grafiku i wysłała 6 SMS-ów.
      // Dlatego wszędzie tam, gdzie duplikaty są możliwe: `limit(1)` + tablica.
      const { data: exBkRows } = await admin.from("service_bookings")
        .select("id").eq("provider_id", providerId).eq("customer_phone", phone)
        .eq("scheduled_date", date).eq("scheduled_time", time).neq("status", "cancelled")
        .order("created_at", { ascending: true }).limit(1);
      const exBk = exBkRows?.[0] || null;

      let bookingId: string;
      const bookingDuplicate = !!exBk;
      if (exBk) {
        bookingId = exBk.id;
      } else {
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
        bookingId = sb.id;
      }

      // GRAFIK: rezerwacja pojawia sie na siatce warsztatu WYLACZNIE gdy ma station_id.
      // WorkshopScheduler mapuje workshop_client_bookings.station_id -> scheduled_station_id
      // i pokazuje pozycje tylko wtedy, gdy to pole jest ustawione. Bez niego rezerwacja
      // istnieje w bazie, ale grafik jest pusty - dokladnie to zglosil warsztat.
      // Przypisujemy PIERWSZE wolne stanowisko o tej godzinie. Klientowi tego nie mowimy.
      let freeStationId: string | null = null;
      try {
        const { data: stations } = await admin.from("workshop_workstations")
          .select("id").eq("provider_id", providerId).eq("is_active", true).order("sort_order", { ascending: true });
        const { data: takenRows } = await admin.from("workshop_client_bookings")
          .select("station_id").eq("provider_id", providerId)
          .eq("appointment_date", date).eq("appointment_time", time).neq("status", "cancelled");
        const taken = new Set((takenRows || []).map((r: any) => r.station_id).filter(Boolean));
        freeStationId = ((stations || []).find((st: any) => !taken.has(st.id))?.id) || null;
        if (!freeStationId) console.warn("[voice-agent-tools] no_free_station", { date, time });
      } catch (_) { /* brak stanowisk nie moze blokowac rezerwacji */ }

      // 2) workshop_client_bookings -> grafik + link /r/:token + 24h reminder
      //
      // Przy dedupie albo ponowionej turze wiersz grafiku może już istnieć —
      // wtedy go używamy zamiast wstawiać drugi (to byłby duplikat na siatce).
      let wcb: { id: string; confirmation_token: string | null; public_token: string | null } | null = null;
      const { data: exWcbRows } = await admin.from("workshop_client_bookings")
        .select("id, confirmation_token, public_token")
        .eq("provider_id", providerId).eq("phone", phone)
        .eq("appointment_date", date).eq("appointment_time", time)
        .neq("status", "cancelled")
        .order("created_at", { ascending: true }).limit(1);
      const exWcb = exWcbRows?.[0] || null;
      if (exWcb) {
        wcb = exWcb;
      } else {
        // Błąd tego zapisu był dotąd POŁYKANY — destrukturyzacja nie brała `error`,
        // a `if (wcb?.confirmation_token)` niżej po cichu pomijało SMS. Nieudany
        // zapis grafiku wyglądał wtedy identycznie jak udany bez SMS-a.
        const { data: inserted, error: wcbErr } = await admin.from("workshop_client_bookings").insert({
          provider_id: providerId, phone, first_name: first, last_name: last,
          plate: veh.plate || null, brand: veh.brand || null, model: veh.model || null,
          service_description: notePrefix + (body?.notes || body?.service_name || ""),
          appointment_date: date, appointment_time: time, duration_minutes: duration,
          status: "scheduled", reminder_enabled: true, reminder_times: ["24h"],
          ...(freeStationId ? { station_id: freeStationId } : {}),
        }).select("id, confirmation_token, public_token").maybeSingle();
        if (wcbErr) {
          console.error("[voice-agent-tools] calendar_insert_failed", {
            code: wcbErr.code, message: String(wcbErr.message).slice(0, 200),
          });
        }
        wcb = inserted || null;
      }

      // 1.4 — SMS potwierdzenia OD RAZU (data, godzina, adres, link do zarządzania). Best-effort.
      let smsSent = false;
      let manageLink: string | null = null;
      try {
        if (wcb?.confirmation_token) {
          manageLink = buildPublicUrl(`/r/${wcb.public_token ?? wcb.confirmation_token}`);
          // Jedno potwierdzenie na wizytę. Bez tego dedup albo ponowiona tura
          // wysłałyby klientowi drugiego SMS-a o tej samej godzinie.
          const { data: smsAlready } = await admin.from("workshop_sms_log")
            .select("id").eq("appointment_id", wcb.id)
            .eq("sms_type", "booking_confirmation_ai").neq("status", "failed")
            .limit(1).maybeSingle();
          if (smsAlready) {
            smsSent = true;
          } else {
          // KOLUMNY: `service_providers` NIE MA pól `address` ani `city`. Poprzednie
          // zapytanie o nie zwracało błąd, a `const { data: prov }` bez `error` dawał
          // null — stąd SMS "serwis: potwierdzenie wizyty..." bez nazwy firmy i adresu,
          // przy poprawnie wypełnionych danych warsztatu. Te same pola co
          // booking-reminders: short_name/company_name + company_address/postal/city.
          const { data: prov, error: provErr } = await admin.from("service_providers")
            .select("short_name, company_name, company_address, company_postal_code, company_city")
            .eq("id", providerId).maybeSingle();
          if (provErr) console.error("[voice-agent-tools] provider_lookup_failed", { code: provErr.code });
          const company = prov?.short_name || prov?.company_name || "serwis";
          const addr = [prov?.company_address,
                        [prov?.company_postal_code, prov?.company_city].filter(Boolean).join(" ")]
                       .filter(Boolean).join(", ");
          const service = String(body?.notes || body?.service_name || "").replace(/^\[[^\]]*\]\s*/, "").trim();
          let msg = `${company}: wizyta ${date} ${time}.`
            + (service ? ` ${service}.` : "")
            + (addr ? ` ${addr}.` : "")
            + ` Zarzadzaj: ${manageLink}`;
          // Kolejno odchudzamy, aż zmieści się w jednym SMS-ie: najpierw adres, potem usługa.
          if (msg.length > 160) msg = `${company}: wizyta ${date} ${time}.` + (service ? ` ${service}.` : "") + ` Zarzadzaj: ${manageLink}`;
          if (msg.length > 160) msg = `${company}: wizyta ${date} ${time}. Zarzadzaj: ${manageLink}`;

          // SMS NIE MOŻE OPÓŹNIAĆ TURY. To wywołanie sieciowe do bramki, a klient
          // czeka w tym czasie w ciszy. Oddajemy je runtime'owi: żądanie może się
          // zakończyć, a wysyłka i tak dobiegnie końca.
          const sendSms = fetch(`${supabaseUrl}/functions/v1/workshop-send-sms`, {
            method: "POST",
            headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
            body: JSON.stringify({ provider_id: providerId, phone, message: msg, sms_type: "booking_confirmation_ai", appointment_id: wcb.id }),
          }).then(async (r) => {
            const rj = await r.json().catch(() => ({}));
            if (rj?.error) console.error("[voice-agent-tools] sms_failed", { status: r.status });
          }).catch((e) => console.error("[voice-agent-tools] sms_error", { name: (e as Error)?.name }));

          const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
          if (runtime?.waitUntil) runtime.waitUntil(sendSms); else await sendSms;
          // Zaplanowany, nie potwierdzony — dlatego agent mówi "przyjdzie w ciągu
          // kilku minut", a nie "wysłaliśmy".
          smsSent = true;
          }
        }
      } catch (_) { /* SMS best-effort — nie blokuje rezerwacji */ }

      // ZLECENIE DETERMINISTYCZNIE, nie na łasce modelu.
      // Model kilkukrotnie wywoływał samo create_order albo samo create_booking, przez co
      // raz nie było zlecenia, raz nie było SMS-a. Teraz zlecenie powstaje ZAWSZE po udanej
      // rezerwacji, po stronie kodu. Wołamy własną akcję create_order, żeby nie duplikować
      // logiki klienta, pojazdu, numeracji i statusu "Umówiony telefonicznie".
      //
      // complaint = SŁOWA KLIENTA, zwięźle. Nie parafraza, nie diagnoza, nie kategoria —
      // mechanik ma zobaczyć, z czym przyszedł klient.
      let createdOrderId: string | null = null;
      let orderFailed = false;
      if (ordersAccess) {
        try {
          const complaint = String(body?.notes || body?.service_name || "Zgłoszenie telefoniczne").trim();
          const orderRes = await fetch(`${supabaseUrl}/functions/v1/voice-agent-tools`, {
            method: "POST",
            headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create_order", provider_id: providerId, persona_key: personaKey, is_test: isTest,
              ...(conversationId ? { conversation_id: conversationId } : {}),
              customer_name: name, customer_phone: phone, complaint,
              scheduled_date: date, scheduled_time: time, duration_minutes: duration,
              vehicle: body?.vehicle || {}, booking_id: bookingId,
            }),
            signal: AbortSignal.timeout(10_000),
          });
          const orderOut = await orderRes.json().catch(() => ({}));
          if (orderOut?.ok && orderOut?.order_id) createdOrderId = String(orderOut.order_id);
          else { orderFailed = true; console.error("[voice-agent-tools] order_after_booking_failed", { status: orderRes.status }); }
        } catch (error) {
          orderFailed = true;
          console.error("[voice-agent-tools] order_after_booking_error", { name: (error as Error)?.name });
        }
      }

      // Powiązanie rozmowy z rezerwacją. Po utworzeniu zlecenia zostanie nadpisane
      // na workshop_order, bo tego szuka zakładka "Rozmowa telefoniczna".
      await linkConversation("service_booking", bookingId);

      return json({
        ok: true, booking_id: bookingId, duplicate: bookingDuplicate,
        order_id: createdOrderId, order_failed: orderFailed,
        client_booking_id: wcb?.id || null,
        manage_token: wcb?.confirmation_token || null,
        manage_link: manageLink, sms_sent: smsSent,
        // Model powtarza to, co dostanie. "Wysłano SMS" kazało mu mówić w czasie
        // przeszłym o wiadomości, która dopiero wychodzi.
        message: `Rezerwacja utworzona na ${date} ${time}.${smsSent ? " Potwierdzenie przyjdzie SMS-em w ciągu kilku minut." : ""}`,
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
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
