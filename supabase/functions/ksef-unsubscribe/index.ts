import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function renderPage(title: string, description: string, isError = false) {
  return `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0;font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;">
    <div style="max-width:520px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:32px;text-align:center;box-shadow:0 18px 40px rgba(15,23,42,0.08);">
      <div style="width:56px;height:56px;border-radius:999px;margin:0 auto 16px;background:${isError ? '#fee2e2' : '#dcfce7'};display:flex;align-items:center;justify-content:center;font-size:28px;">
        ${isError ? '✕' : '✓'}
      </div>
      <h1 style="font-size:24px;line-height:1.2;margin:0 0 12px;">${title}</h1>
      <p style="font-size:15px;line-height:1.6;color:#475569;margin:0;">${description}</p>
    </div>
  </body>
</html>`;
}

async function verifyToken(token: string) {
  const [payloadPart, signaturePart] = token.split('.');
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!payloadPart || !signaturePart || !secret) {
    return null;
  }

  const payloadBytes = fromBase64Url(payloadPart);
  const signatureBytes = fromBase64Url(signaturePart);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, payloadBytes);
  if (!isValid) {
    return null;
  }

  const payload = JSON.parse(decoder.decode(payloadBytes));
  if (payload?.type !== 'ksef-unsubscribe' || !payload?.email) {
    return null;
  }

  return String(payload.email);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = req.method === 'GET' ? url.searchParams.get('token') : (await req.json()).token;

    if (!token) {
      const html = renderPage('Nieprawidłowy link', 'Brakuje tokenu wypisu z powiadomień KSeF.', true);
      return new Response(html, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders } });
    }

    const email = await verifyToken(token);
    if (!email) {
      const html = renderPage('Nieprawidłowy link', 'Ten link wypisu jest niepoprawny lub został uszkodzony.', true);
      return new Response(html, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await supabase.from('ksef_alert_emails').update({ active: false }).eq('email', email);

    if (error) throw error;

    if (req.method === 'GET') {
      const html = renderPage('Wypisano z maili', `Adres ${email} został wypisany z powiadomień KSeF.`);
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders } });
    }

    return new Response(JSON.stringify({ success: true, email }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    const html = renderPage('Nie udało się wypisać', e?.message || 'Wystąpił błąd podczas wypisywania adresu z maili.', true);
    return new Response(html, { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders } });
  }
});