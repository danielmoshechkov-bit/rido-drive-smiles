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

    let resolvedProviderId = provider_id ?? null;

    if (!resolvedProviderId && order_id) {
      const { data: orderData } = await supabaseAdmin
        .from("workshop_orders")
        .select("provider_id")
        .eq("id", order_id)
        .maybeSingle();

      resolvedProviderId = orderData?.provider_id ?? null;
    }

    const appKey = smsSettings?.api_key || Deno.env.get("SMSAPI_TOKEN");
    if (!appKey) {
      console.error("[Workshop SMS] Brak klucza API");
      return new Response(JSON.stringify({ error: "Brak klucza API SMS. Wprowadź go w Admin → Bramki SMS." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const smsProvider = smsSettings?.provider || "justsend";
    const msisdn = normalizePhone(phone);
    const senderName = (sender || smsSettings?.sender_name || "GetRido.pl").replace(/[^a-zA-Z0-9.\-]/g, "").slice(0, 11);

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

    // Deduct SMS credit
      try {
      if (resolvedProviderId) {
        const { error: decrError } = await supabaseAdmin.rpc("deduct_sms_credit", { p_provider_id: resolvedProviderId });
        if (decrError) console.warn("[Workshop SMS] Could not deduct SMS credit:", decrError.message);
        else console.log(`[Workshop SMS] Deducted 1 SMS credit from provider ${resolvedProviderId}`);
      } else {
        // Try to find provider via auth header
        const authHeader = req.headers.get("Authorization");
        if (authHeader) {
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
          const { createClient: cc } = await import("https://esm.sh/@supabase/supabase-js@2");
          const userClient = cc(
            Deno.env.get("SUPABASE_URL") ?? "",
            anonKey ?? "",
            { global: { headers: { Authorization: authHeader } } }
          );
          const { data: { user } } = await userClient.auth.getUser();
          if (user) {
            const { data: sp } = await supabaseAdmin
              .from("service_providers")
              .select("id, sms_balance")
              .eq("user_id", user.id)
              .maybeSingle();
            if (sp && (sp.sms_balance || 0) > 0) {
              const { error: decrErr } = await supabaseAdmin.rpc("deduct_sms_credit", { p_provider_id: sp.id });
              if (decrErr) console.warn("[Workshop SMS] Could not deduct user SMS credit:", decrErr.message);
              else console.log(`[Workshop SMS] Deducted 1 SMS credit from provider ${sp.id}, remaining: ${(sp.sms_balance || 0) - 1}`);
            } else {
              console.warn("[Workshop SMS] User has no SMS balance or no provider record");
            }
          }
        }
      }
    } catch (e) {
      console.warn("[Workshop SMS] Credit deduction failed:", e);
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
