import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { phone, message, driver_id, fleet_id, type = 'generic', sender, dry_run = false } = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Phone and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Pobierz ustawienia SMS z bazy
    const { data: settings, error: settingsError } = await supabase
      .from('sms_settings')
      .select('api_key, sender_name, provider, is_active, api_url')
      .limit(1)
      .single();

    // Fallback: klucz z env jeśli brak w bazie
    const apiKey = settings?.api_key || Deno.env.get('SMSAPI_TOKEN');

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Brak klucza API SMS. Wprowadź go w panelu Admin → Bramki SMS.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const provider = settings?.provider || 'justsend';
    const senderName = (sender || settings?.sender_name || 'GetRido.pl').replace(/[^a-zA-Z0-9.\-]/g, '').slice(0, 11);
    const isActive = settings?.is_active ?? true;

    if (!isActive && type !== 'test' && !dry_run) {
      return new Response(
        JSON.stringify({ success: false, error: 'Integracja SMS jest nieaktywna. Aktywuj w panelu admina.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalizacja numeru telefonu
    let msisdn = phone.replace(/[\s\-\(\)\+]/g, '');
    if (msisdn.startsWith('48') && msisdn.length >= 11) {
      // already has prefix
    } else if (msisdn.startsWith('0')) {
      msisdn = '48' + msisdn.substring(1);
    } else if (msisdn.length === 9) {
      msisdn = '48' + msisdn;
    }

    if (dry_run) {
      return new Response(
        JSON.stringify({ success: true, dry_run: true, provider, sender: senderName, is_active: isActive }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[SMS] Sending via ${provider} to ${msisdn}, sender=${senderName}`);

    let response: Response;
    let responseText: string;

    if (provider === 'justsend') {
      const apiUrl = settings?.api_url || 'https://justsend.io/api/sender/bulk/send';
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

      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'App-Key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      responseText = await response.text();

    } else if (provider === 'smsapi') {
      const params = new URLSearchParams({
        to: msisdn,
        message,
        format: 'json',
        from: senderName || 'INFO',
        encoding: 'utf-8',
      });

      response = await fetch('https://api.smsapi.pl/sms.do', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      responseText = await response.text();

    } else {
      return new Response(
        JSON.stringify({ success: false, error: `Nieznany dostawca SMS: ${provider}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[SMS] Response: ${response.status} - ${responseText}`);

    const isSuccess = response.status === 200 || response.status === 201;

    if (!isSuccess) {
      return new Response(
        JSON.stringify({ success: false, error: `Błąd SMS (HTTP ${response.status})`, details: responseText }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduct SMS credit - try fleet_id first, then try to find the user's provider
    try {
      if (fleet_id) {
        const { error: rpcErr } = await supabase.rpc('deduct_sms_credit', { p_provider_id: fleet_id });
        if (rpcErr) console.warn('[SMS] Could not deduct credit for fleet:', rpcErr.message);
      } else {
        // Try to find the user who made the request via auth header
        const authHeader = req.headers.get('Authorization');
        if (authHeader) {
          const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
          const userClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            anonKey ?? '',
            { global: { headers: { Authorization: authHeader } } }
          );
          const { data: { user } } = await userClient.auth.getUser();
          if (user) {
            const { data: provider } = await supabase
              .from('service_providers')
              .select('id, sms_balance')
              .eq('user_id', user.id)
              .maybeSingle();
            if (provider && (provider.sms_balance || 0) > 0) {
              const { error: decrErr } = await supabase
                .from('service_providers')
                .update({ sms_balance: (provider.sms_balance || 0) - 1 })
                .eq('id', provider.id);
              if (decrErr) console.warn('[SMS] Could not deduct user SMS credit:', decrErr.message);
              else console.log(`[SMS] Deducted 1 SMS credit from provider ${provider.id}, remaining: ${(provider.sms_balance || 0) - 1}`);
            } else {
              console.warn('[SMS] User has no SMS balance or no provider record');
            }
          }
        }
      }
    } catch (e: any) {
      console.warn('[SMS] Credit deduction error:', e?.message);
    }

    // Log to driver_communications
    try {
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
          provider,
          fleet_id,
          response: responseText,
        },
      });
    } catch (e: any) {
      console.warn('[SMS] Could not log:', e?.message);
    }

    return new Response(
      JSON.stringify({ success: true, phone: msisdn, sender: senderName, details: responseText }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[SMS] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
