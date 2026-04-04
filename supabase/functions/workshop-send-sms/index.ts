import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JUSTSEND_API_URL = "https://justsend.io/api/sender/bulk/send";
const DEFAULT_SENDER = "GetRido.pl";

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

    // Pobierz klucz API z bazy (admin panel) lub env
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: smsSettings } = await supabaseAdmin
      .from("sms_settings")
      .select("api_key, sender_name")
      .limit(1)
      .single();

    const appKey = smsSettings?.api_key || Deno.env.get("SMSAPI_TOKEN");
    if (!appKey) {
      console.error("[JustSend] Brak klucza API — ani w sms_settings, ani w env SMSAPI_TOKEN");
      return new Response(JSON.stringify({ error: "Brak klucza API JustSend. Wprowadź go w Admin → Bramki SMS." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const msisdn = normalizePhone(phone);
    const senderName = (sender || DEFAULT_SENDER).replace(/[^a-zA-Z0-9.\-]/g, "").slice(0, 11);
    const campaignName = `Workshop-${sms_type || "sms"}-${Date.now()}`;
    const sendDate = new Date(Date.now() + 5000).toISOString().replace(/\.\d+Z$/, "+00:00");

    const body = {
      name: campaignName,
      bulkType: "STANDARD",
      bulkVariant: "PRO",
      sender: senderName,
      message: message,
      sendDate: sendDate,
      recipients: [{ msisdn }],
    };

    console.log(`[JustSend/Workshop] Sending to ${msisdn}, sender=${senderName}`);
    console.log(`[JustSend/Workshop] Body:`, JSON.stringify(body));

    const smsResponse = await fetch(JUSTSEND_API_URL, {
      method: "POST",
      headers: {
        "App-Key": appKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
    });

    const responseStatus = smsResponse.status;
    let responseBody: string;
    try {
      responseBody = await smsResponse.text();
    } catch {
      responseBody = "(empty response)";
    }

    console.log(`[JustSend/Workshop] Response: HTTP ${responseStatus} — ${responseBody}`);

    // JustSend returns 201 Created on success
    if (responseStatus !== 201 && responseStatus !== 200) {
      console.error(`[JustSend/Workshop] ERROR: HTTP ${responseStatus} — ${responseBody}`);
      return new Response(
        JSON.stringify({ error: `JustSend API error (HTTP ${responseStatus}): ${responseBody}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduct SMS credit from provider
    if (provider_id) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );
        await supabase
          .from("service_providers")
          .update({ sms_balance: supabase.rpc ? undefined : undefined })
          .eq("id", provider_id);
        // Decrement sms_balance by 1
        const { error: decrError } = await supabase.rpc("deduct_sms_credit", { p_provider_id: provider_id });
        if (decrError) console.warn("[JustSend/Workshop] Could not deduct SMS credit:", decrError.message);
      } catch (e) {
        console.warn("[JustSend/Workshop] Credit deduction failed:", e);
      }
    }

    return new Response(
      JSON.stringify({ success: true, phone: msisdn, sender: senderName, status: responseStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[JustSend/Workshop] Unexpected error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
