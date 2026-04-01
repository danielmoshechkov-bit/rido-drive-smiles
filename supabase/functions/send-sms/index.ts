import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const JUSTSEND_API_URL = 'https://justsend.io/api/sender/bulk/send';
const DEFAULT_SENDER = 'GetRido.pl';

interface SMSRequest {
  phone: string;
  message: string;
  driver_id?: string;
  fleet_id?: string;
  type?: string;
  sender?: string;
}

/**
 * Normalize phone to MSISDN format: 48XXXXXXXXX (no +, no spaces)
 */
function normalizePhone(raw: string): string {
  let phone = raw.replace(/[\s\-\(\)\+]/g, '');
  if (phone.startsWith('48') && phone.length >= 11) return phone;
  if (phone.startsWith('0')) phone = phone.substring(1);
  if (phone.length === 9) return '48' + phone;
  return phone;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SMSAPI_TOKEN = Deno.env.get('SMSAPI_TOKEN');
    if (!SMSAPI_TOKEN) {
      console.error('SMSAPI_TOKEN (JustSend App-Key) not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'SMS service not configured — brak klucza API JustSend' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { phone, message, driver_id, fleet_id, type = 'generic', sender }: SMSRequest = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Phone and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const msisdn = normalizePhone(phone);
    const senderName = (sender || DEFAULT_SENDER).replace(/[^a-zA-Z0-9.\-]/g, '').slice(0, 11);
    const campaignName = `GetRido-${type}-${Date.now()}`;

    // Build ISO 8601 sendDate = now + 5 seconds (immediate)
    const sendDate = new Date(Date.now() + 5000).toISOString().replace(/\.\d+Z$/, '+00:00');

    const body = {
      name: campaignName,
      bulkType: 'STANDARD',
      bulkVariant: 'PRO',
      sender: senderName,
      message: message,
      sendDate: sendDate,
      recipients: [{ msisdn }],
    };

    console.log(`[JustSend] Sending SMS to ${msisdn}, sender=${senderName}, message="${message.substring(0, 60)}..."`);
    console.log(`[JustSend] Request body:`, JSON.stringify(body));

    const smsResponse = await fetch(JUSTSEND_API_URL, {
      method: 'POST',
      headers: {
        'App-Key': SMSAPI_TOKEN,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const responseStatus = smsResponse.status;
    let responseBody: string;
    try {
      responseBody = await smsResponse.text();
    } catch {
      responseBody = '(empty response)';
    }

    console.log(`[JustSend] Response status: ${responseStatus}, body: ${responseBody}`);

    // JustSend returns 201 Created on success
    if (responseStatus !== 201 && responseStatus !== 200) {
      console.error(`[JustSend] ERROR: HTTP ${responseStatus} — ${responseBody}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: `JustSend API error (HTTP ${responseStatus})`,
          details: responseBody,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the SMS in database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Deduct SMS credit from provider if fleet_id present
    if (fleet_id) {
      await supabase.rpc('deduct_sms_credit', { p_provider_id: fleet_id }).catch((e: any) => {
        console.warn('[JustSend] Could not deduct SMS credit:', e?.message);
      });
    }

    await supabase.from('driver_communications').insert({
      driver_id: driver_id || null,
      type: 'sms',
      subject: type,
      content: message,
      status: 'sent',
      sent_at: new Date().toISOString(),
      metadata: {
        phone: msisdn,
        sender: senderName,
        justsend_response: responseBody,
        fleet_id: fleet_id,
        campaign_name: campaignName,
      }
    }).catch((e: any) => {
      console.warn('[JustSend] Could not log SMS to driver_communications:', e?.message);
    });

    return new Response(
      JSON.stringify({
        success: true,
        phone: msisdn,
        sender: senderName,
        justsend_status: responseStatus,
        response: responseBody,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[JustSend] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
