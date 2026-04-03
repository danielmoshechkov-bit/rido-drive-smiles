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
  dry_run?: boolean;
}

function normalizePhone(raw: string): string {
  let phone = raw.replace(/[\s\-\(\)\+]/g, '');
  if (phone.startsWith('48') && phone.length >= 11) return phone;
  if (phone.startsWith('0')) phone = phone.substring(1);
  if (phone.length === 9) return '48' + phone;
  return phone;
}

function sanitizeSender(sender: string): string {
  return sender.replace(/[^a-zA-Z0-9.\-]/g, '').slice(0, 11) || DEFAULT_SENDER;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: settings } = await supabase
      .from('sms_settings')
      .select('provider, api_url, sender_name, is_active, api_key_secret_name, api_key')
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Klucz API: najpierw z bazy (admin panel), potem z env (Supabase secrets)
    const SMSAPI_TOKEN = settings?.api_key || Deno.env.get('SMSAPI_TOKEN');
    if (!SMSAPI_TOKEN) {
      console.error('SMSAPI_TOKEN not configured — neither in sms_settings.api_key nor env');
      return new Response(
        JSON.stringify({ success: false, error: 'Brak klucza API JustSend. Wprowadź go w panelu Admin → Bramki SMS.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { phone, message, driver_id, fleet_id, type = 'generic', sender, dry_run = false }: SMSRequest = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Phone and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const provider = settings?.provider || 'justsend';
    const apiUrl = settings?.api_url || JUSTSEND_API_URL;
    const senderName = sanitizeSender(sender || settings?.sender_name || DEFAULT_SENDER);
    const isActive = settings?.is_active ?? true;
    const msisdn = normalizePhone(phone);

    if (provider !== 'justsend') {
      return new Response(
        JSON.stringify({ success: false, error: 'Portal obsługuje obecnie wysyłkę SMS przez JustSend.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isActive && type !== 'test' && !dry_run) {
      return new Response(
        JSON.stringify({ success: false, error: 'Integracja SMS jest wyłączona w portalu.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (dry_run) {
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          provider,
          api_url: apiUrl,
          sender: senderName,
          is_active: isActive,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const campaignName = `GetRido-${type}-${Date.now()}`;
    const sendDate = new Date(Date.now() + 5000).toISOString().replace(/\.\d+Z$/, '+00:00');
    const payload = {
      name: campaignName,
      bulkType: 'STANDARD',
      bulkVariant: 'PRO',
      sender: senderName,
      message,
      sendDate,
      recipients: [{ msisdn }],
    };

    console.log(`[JustSend] Sending SMS to ${msisdn}, sender=${senderName}, provider=${provider}`);

    const smsResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'App-Key': SMSAPI_TOKEN,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseStatus = smsResponse.status;
    let responseBody = '(empty response)';
    try {
      responseBody = await smsResponse.text();
    } catch {
      responseBody = '(empty response)';
    }

    console.log(`[JustSend] Response status: ${responseStatus}, body: ${responseBody}`);

    if (responseStatus !== 200 && responseStatus !== 201) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `JustSend API error (HTTP ${responseStatus})`,
          details: responseBody,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (fleet_id) {
      await supabase.rpc('deduct_sms_credit', { p_provider_id: fleet_id }).catch((error: any) => {
        console.warn('[JustSend] Could not deduct SMS credit:', error?.message);
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
        fleet_id,
        campaign_name: campaignName,
      },
    }).catch((error: any) => {
      console.warn('[JustSend] Could not log SMS to driver_communications:', error?.message);
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
  } catch (error: any) {
    console.error('[JustSend] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
