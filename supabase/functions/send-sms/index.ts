import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SMSRequest {
  phone: string;
  message: string;
  driver_id?: string;
  fleet_id?: string;
  type?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SMSAPI_TOKEN = Deno.env.get('SMSAPI_TOKEN');
    if (!SMSAPI_TOKEN) {
      console.error('SMSAPI_TOKEN not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'SMS service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { phone, message, driver_id, fleet_id, type = 'generic' }: SMSRequest = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Phone and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize phone number - remove spaces, dashes, etc.
    let normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
    
    // Add Polish country code if not present
    if (!normalizedPhone.startsWith('+')) {
      if (normalizedPhone.startsWith('48')) {
        normalizedPhone = '+' + normalizedPhone;
      } else {
        normalizedPhone = '+48' + normalizedPhone;
      }
    }

    console.log(`Sending SMS to ${normalizedPhone}: ${message.substring(0, 50)}...`);

    // SMSAPI.pl API call
    const smsApiUrl = 'https://api.smsapi.pl/sms.do';
    const params = new URLSearchParams({
      to: normalizedPhone.replace('+', ''),
      message: message,
      format: 'json',
      from: 'RIDO',
      encoding: 'utf-8',
    });

    const smsResponse = await fetch(smsApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SMSAPI_TOKEN}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const smsResult = await smsResponse.json();
    console.log('SMSAPI response:', JSON.stringify(smsResult));

    if (smsResult.error) {
      console.error('SMSAPI error:', smsResult.error, smsResult.message);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: smsResult.message || 'SMS sending failed',
          details: smsResult 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the SMS in database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    await supabase.from('driver_communications').insert({
      driver_id: driver_id,
      type: 'sms',
      subject: type,
      content: message,
      status: 'sent',
      sent_at: new Date().toISOString(),
      metadata: {
        phone: normalizedPhone,
        sms_id: smsResult.id,
        fleet_id: fleet_id,
        points: smsResult.points,
      }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message_id: smsResult.id,
        phone: normalizedPhone,
        points_used: smsResult.points 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error sending SMS:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
