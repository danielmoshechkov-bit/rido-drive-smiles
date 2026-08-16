import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { sprawdzTrescSms } from "../_shared/smsModeration.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mozePracowac, odmowaBramki } from "../_shared/subscriptionGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(raw: string): string {
  let phone = raw.replace(/\D/g, "");
  if (phone.startsWith("0048")) phone = phone.substring(2);
  while (phone.startsWith("4848")) phone = phone.substring(2);
  if (phone.startsWith("48") && phone.length === 11) return phone;
  if (phone.startsWith("0")) phone = phone.substring(1);
  if (phone.length === 9) return "48" + phone;
  return phone;
}

function tryParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getSmsApiError(parsed: any): string | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const errorCode = Number(parsed.error ?? 0);
  if (!errorCode) return null;
  return String(parsed.message || `SMSAPI error ${errorCode}`);
}

function isInvalidSmsApiSender(parsed: any): boolean {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const errorCode = Number(parsed.error ?? 0);
  const message = String(parsed.message || "").toLowerCase();
  return errorCode === 14 || message.includes("invalid from field");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, message, order_id, sms_type, provider_id, sender, scheduled_at, appointment_id, client_id } = await req.json();

    // ── KONTROLA TREŚCI ────────────────────────────────────────────────
    // SMS-y wychodzą z konta portalu u operatora bramki. Wulgarna albo
    // oszukańcza treść wysłana przez jednego klienta obciąża to konto i grozi
    // odcięciem wysyłki WSZYSTKIM warsztatom naraz, a przy podszywaniu się pod
    // bank czy kuriera także odpowiedzialnością prawną. Ekran ostrzega
    // wcześniej, ale ekran da się ominąć wołaniem tej funkcji wprost —
    // dlatego blokada stoi tutaj.
    //
    // Wołania WEWNĘTRZNE (przypomnienia, potwierdzenia) też przez to
    // przechodzą: ich treść składa nasz kod, więc nie mają jak nie przejść,
    // a gdyby kiedyś miały — chcemy o tym wiedzieć.
    if (typeof message === "string") {
      const ocena = sprawdzTrescSms(message);
      if (!ocena.dozwolone) {
        console.warn("[Workshop SMS]", JSON.stringify({
          event: "tresc_zablokowana", powod: ocena.powod, dopasowanie: ocena.dopasowanie,
        }));
        return new Response(JSON.stringify({
          error: "CONTENT_BLOCKED", powod: ocena.powod, message: ocena.komunikat,
        }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: "Missing phone or message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: smsSettings } = await supabaseAdmin
      .from("sms_settings")
      .select("api_key, sender_name, provider, api_url, is_active")
      .limit(1)
      .single();

    // ── Authorization (SECFIX ETAP 3) ──────────────────────────────────
    // Wcześniej provider_id/phone szło z gołego body bez auth: (1) bez provider_id
    // pomijało pre-check salda = darmowe SMS na koszt platformy; (2) cudzy
    // provider_id = drenaż salda ofiary. Teraz: albo wołanie WEWNĘTRZNE
    // (service-role, cron/inne edge — body zaufane), albo ZALOGOWANY user,
    // którego provider WYPROWADZAMY z JWT (body provider_id musi do niego
    // należeć — właściciel LUB aktywny pracownik). Bez auth → 401.
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isInternal = serviceKey.length > 0 && bearer === serviceKey;

    const resolveOrderProvider = async (): Promise<string | null> => {
      if (!order_id) return null;
      const { data } = await supabaseAdmin.from("workshop_orders")
        .select("provider_id").eq("id", order_id).maybeSingle();
      return data?.provider_id ?? null;
    };

    let resolvedProviderId: string | null = null;

    if (isInternal) {
      resolvedProviderId = provider_id ?? (await resolveOrderProvider());
    } else {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "UNAUTHORIZED", message: "Brak autoryzacji." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
      const userClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", anonKey ?? "", {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "UNAUTHORIZED", message: "Sesja nieważna." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const [{ data: owned }, { data: emp }] = await Promise.all([
        supabaseAdmin.from("service_providers").select("id").eq("user_id", user.id),
        supabaseAdmin.from("workshop_employees").select("provider_id")
          .eq("user_id", user.id).eq("is_active", true).eq("status", "active"),
      ]);
      const authorized = new Set<string>([
        ...((owned || []) as any[]).map((o) => o.id),
        ...((emp || []) as any[]).map((e) => e.provider_id),
      ]);
      if (authorized.size === 0) {
        return new Response(JSON.stringify({ error: "FORBIDDEN", message: "Konto nie jest powiązane z warsztatem." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let target = provider_id ?? (await resolveOrderProvider());
      if (target) {
        if (!authorized.has(target)) {
          return new Response(JSON.stringify({ error: "FORBIDDEN", message: "Brak uprawnień do tego warsztatu." }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else if (authorized.size === 1) {
        target = [...authorized][0];
      } else {
        return new Response(JSON.stringify({ error: "AMBIGUOUS_PROVIDER", message: "Wskaż provider_id." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      resolvedProviderId = target;
    }
    // ── koniec Authorization ───────────────────────────────────────────

    // ── Bramka subskrypcji (G5), wersja lekka ──────────────────────────
    // Warsztat bez planu może jeszcze dopisać się do klienta, który MA u niego
    // zlecenie — rozmowa w toku nie ma się urwać w połowie. Nie może natomiast
    // rozsyłać SMS-ów w dowolne miejsce: to już jest korzystanie z produktu.
    //
    // Wołania WEWNĘTRZNE (kluczem service_role) przechodzą bez bramki celowo.
    // Tą drogą idą przypomnienia o wizycie do klienta końcowego, a on nie ma
    // nic wspólnego z tym, czy warsztat zapłacił. Bramkę zakładamy u ŹRÓDŁA
    // takich wywołań, tam gdzie to praca warsztatu (workshop-tire-reminders).
    if (!isInternal) {
      const bramka = await mozePracowac(supabaseAdmin, resolvedProviderId);
      if (!bramka.wolno) {
        if (!order_id) {
          return odmowaBramki(corsHeaders, `${bramka.powod}; SMS bez order_id`);
        }
        const { data: zlecenie } = await supabaseAdmin
          .from("workshop_orders")
          .select("id, provider_id")
          .eq("id", order_id)
          .maybeSingle();
        if (!zlecenie || zlecenie.provider_id !== resolvedProviderId) {
          return odmowaBramki(corsHeaders, `${bramka.powod}; zlecenie ${order_id} nie należy do warsztatu`);
        }
      }
    }
    // ── koniec bramki ──────────────────────────────────────────────────

    const appKey = smsSettings?.api_key || Deno.env.get("SMSAPI_TOKEN");
    if (!appKey) {
      console.error("[Workshop SMS] Brak klucza API");
      return new Response(JSON.stringify({ error: "Brak klucza API SMS. Wprowadź go w Admin → Bramki SMS." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ZLECENIE PRÓBNE Z WPROWADZENIA ─────────────────────────────────
    //
    // Warsztat uczy się na własnym aucie i własnym numerze — musi zobaczyć
    // prawdziwy SMS, bo inaczej nie wie, co dostaje jego klient. Za naukę nie
    // płaci pakietem, ale nadużycie odcinamy trzema warunkami sprawdzanymi
    // W BAZIE, nie w przeglądarce: tylko własny numer warsztatu, ograniczona
    // pula i tylko dla zlecenia oznaczonego jako próbne.
    let smsProbny = false;
    if (order_id && resolvedProviderId) {
      const { data: zlec } = await supabaseAdmin
        .from("workshop_orders").select("is_demo").eq("id", order_id).maybeSingle();
      if (zlec?.is_demo) {
        const { data: ocena } = await supabaseAdmin
          .rpc("demo_sms_dozwolony", { p_provider: resolvedProviderId, p_telefon: phone });
        const wpis = Array.isArray(ocena) ? ocena[0] : ocena;
        if (!wpis?.dozwolone) {
          return new Response(JSON.stringify({
            error: "DEMO_SMS_BLOCKED",
            message: wpis?.powod || "Wiadomość próbna niedozwolona",
          }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        smsProbny = true;
      }
    }

    // Sprawdzenie pokrycia przed wysyłką
    if (resolvedProviderId && !smsProbny) {
      // 🔴 NAPRAWIONE 16.08.2026 (audyt). Ta bramka czytała najpierw
      // `service_providers.sms_balance` i przepuszczała wysyłkę, gdy było tam
      // cokolwiek dodatniego — `sms_dostepne` pytała dopiero przy zerze.
      //
      // A `sms_balance` klient MOŻE sobie ustawić z przeglądarki: polityka
      // „Users can update own provider" pozwala właścicielowi zapisać własny
      // wiersz, a RLS nie ogranicza kolumn. Jeden `update({sms_balance:
      // 999999})` w konsoli dawał nieograniczone SMS-y na nasz koszt.
      //
      // Ta gałąź była zgodnością na czas przejścia 4.10 („ma działać przed
      // migracją i po niej"). Migracja jest wykonana, kolumna wyzerowana
      // i martwa, więc zgodność przestała być potrzebna i została dziurą.
      // Jedynym źródłem prawdy jest `sms_dostepne`: pula planu plus paczki.
      let dostepne = 0;
      const { data: nowe, error: bladNowe } = await supabaseAdmin
        .rpc("sms_dostepne", { p_provider_id: resolvedProviderId });

      if (bladNowe) {
        // Fail-closed: nie wiemy, czy klient ma pokrycie, więc nie wysyłamy.
        console.error("workshop-send-sms: sms_dostepne nie odpowiedziało —", bladNowe.message);
        return new Response(
          JSON.stringify({ error: "NO_SMS", message: "Nie udało się sprawdzić pakietu SMS. Spróbuj za chwilę." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // `null` znaczy „bez limitu w planie" — wtedy przepuszczamy.
      dostepne = nowe === null ? Number.POSITIVE_INFINITY : Number(nowe ?? 0);

      if (dostepne <= 0) {
        return new Response(
          JSON.stringify({ error: "NO_SMS", message: "Brak pakietu SMS. Doładuj pakiet, aby kontynuować." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const smsProvider = smsSettings?.provider || "justsend";
    const msisdn = normalizePhone(phone);
    const senderName = (sender || smsSettings?.sender_name || "GetRido.pl").replace(/[^a-zA-Z0-9.\-]/g, "").slice(0, 11);

    // Scheduled SMS — store and exit (no immediate send)
    if (scheduled_at) {
      const scheduledDate = new Date(scheduled_at);
      if (scheduledDate.getTime() > Date.now() + 60_000) {
        const { data: insertedRow, error: insErr } = await supabaseAdmin
          .from("workshop_sms_log")
          .insert({
            provider_id: resolvedProviderId,
            order_id: order_id ?? null,
            appointment_id: appointment_id ?? null,
            client_id: client_id ?? null,
            phone: msisdn,
            message,
            sms_type: sms_type ?? "manual",
            status: "scheduled",
            scheduled_at: scheduledDate.toISOString(),
          })
          .select()
          .single();
        if (insErr) {
          console.error("[Workshop SMS] Failed to store scheduled SMS:", insErr);
          return new Response(JSON.stringify({ error: insErr.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ success: true, scheduled: true, id: insertedRow.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.log(`[Workshop SMS] Sending via ${smsProvider} to ${msisdn}, sender=${senderName}`);

    let response: Response;
    let responseText: string;
    let parsedResponse: any = null;

    if (smsProvider === "smsapi") {
      const sendViaSmsApi = async (from?: string) => {
        const params = new URLSearchParams({
          to: msisdn,
          message,
          format: "json",
          encoding: "utf-8",
        });

        if (from) {
          params.set("from", from);
        }

        const smsResponse = await fetch("https://api.smsapi.pl/sms.do", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${appKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        });

        const smsResponseText = await smsResponse.text();
        return { smsResponse, smsResponseText };
      };

      ({ smsResponse: response, smsResponseText: responseText } = await sendViaSmsApi(senderName));
      parsedResponse = tryParseJson(responseText);

      if (isInvalidSmsApiSender(parsedResponse)) {
        console.warn("[Workshop SMS] Sender rejected by SMSAPI, retrying without custom sender");
        ({ smsResponse: response, smsResponseText: responseText } = await sendViaSmsApi());
        parsedResponse = tryParseJson(responseText);
      }
    } else {
      // justsend (default)
      const apiUrl = smsSettings?.api_url || "https://justsend.io/api/sender/bulk/send";
      const campaignName = `Workshop-${sms_type || "sms"}-${Date.now()}`;
      const sendDate = new Date(Date.now() + 5000).toISOString().replace(/\.\d+Z$/, "+00:00");

      const body = {
        name: campaignName,
        bulkType: "STANDARD",
        bulkVariant: "PRO",
        sender: senderName,
        message,
        sendDate,
        recipients: [{ msisdn }],
      };

      response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "App-Key": appKey,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(body),
      });
      responseText = await response.text();
      parsedResponse = tryParseJson(responseText);
    }

    console.log(`[Workshop SMS] Response: HTTP ${response.status} — ${responseText}`);

    const isSuccess = response.status === 200 || response.status === 201;
    const providerError = smsProvider === "smsapi" ? getSmsApiError(parsedResponse) : null;

    if (!isSuccess || providerError) {
      return new Response(
        JSON.stringify({ error: providerError || `SMS API error (HTTP ${response.status}): ${responseText}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduct SMS credit. resolvedProviderId jest już ustalony i zweryfikowany
    // w bloku Authorization (dawny fallback po auth-headerze usunięty jako martwy).
    try {
      if (resolvedProviderId && smsProbny) {
        // Wiadomość próbna nie schodzi z pakietu — zwiększamy tylko licznik
        // wykorzystanej puli wprowadzenia.
        await supabaseAdmin.rpc("demo_sms_zapisz", { p_provider: resolvedProviderId });
        console.log(`[Workshop SMS] Wiadomosc probna (wprowadzenie), pakiet nietkniety: ${resolvedProviderId}`);
      } else if (resolvedProviderId) {
        const { error: decrError } = await supabaseAdmin.rpc("deduct_sms_credit", { p_provider_id: resolvedProviderId });
        if (decrError) console.warn("[Workshop SMS] Could not deduct SMS credit:", decrError.message);
        else console.log(`[Workshop SMS] Deducted 1 SMS credit from provider ${resolvedProviderId}`);
      }
    } catch (e) {
      console.warn("[Workshop SMS] Credit deduction failed:", e);
    }

    // Log successful send to workshop_sms_log
    try {
      await supabaseAdmin.from("workshop_sms_log").insert({
        provider_id: resolvedProviderId,
        order_id: order_id ?? null,
        appointment_id: appointment_id ?? null,
        client_id: client_id ?? null,
        phone: msisdn,
        message,
        sms_type: sms_type ?? "manual",
        status: "sent",
        sent_at: new Date().toISOString(),
      });
    } catch (logErr) {
      console.warn("[Workshop SMS] Failed to log SMS:", logErr);
    }

    return new Response(
      JSON.stringify({ success: true, phone: msisdn, sender: senderName, status: response.status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Workshop SMS] Unexpected error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
