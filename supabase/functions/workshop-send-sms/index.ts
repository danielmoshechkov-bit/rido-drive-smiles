import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(raw: string): string {
  let phone = raw.replace(/[\s\-\(\)\+]/g, "");
  if (phone.startsWith("48") && phone.length >= 11) return phone;
  if (phone.startsWith("0")) phone = phone.substring(1);
  if (phone.length === 9) return "48" + phone;
  return phone;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, message, order_id, sms_type, provider_id, sender } = await req.json();

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

    if (smsProvider === "smsapi") {
      const params = new URLSearchParams({
        to: msisdn,
        message,
        format: "json",
        from: senderName || "INFO",
        encoding: "utf-8",
      });

      response = await fetch("https://api.smsapi.pl/sms.do", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${appKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });
      responseText = await response.text();
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
    }

    console.log(`[Workshop SMS] Response: HTTP ${response.status} — ${responseText}`);

    const isSuccess = response.status === 200 || response.status === 201;
    if (!isSuccess) {
      return new Response(
        JSON.stringify({ error: `SMS API error (HTTP ${response.status}): ${responseText}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduct SMS credit
    if (provider_id) {
      try {
        const { error: decrError } = await supabaseAdmin.rpc("deduct_sms_credit", { p_provider_id: provider_id });
        if (decrError) console.warn("[Workshop SMS] Could not deduct SMS credit:", decrError.message);
      } catch (e) {
        console.warn("[Workshop SMS] Credit deduction failed:", e);
      }
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
