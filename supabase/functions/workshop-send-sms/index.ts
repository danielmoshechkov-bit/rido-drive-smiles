import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const appKey = smsSettings?.api_key || Deno.env.get("SMSAPI_TOKEN");
    if (!appKey) {
      console.error("[Workshop SMS] Brak klucza API");
      return new Response(JSON.stringify({ error: "Brak klucza API SMS. Wprowadź go w Admin → Bramki SMS." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pre-check SMS balance
    if (resolvedProviderId) {
      const { data: spBal } = await supabaseAdmin
        .from("service_providers")
        .select("sms_balance")
        .eq("id", resolvedProviderId)
        .maybeSingle();
      if (!spBal || (spBal.sms_balance || 0) <= 0) {
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
      if (resolvedProviderId) {
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
