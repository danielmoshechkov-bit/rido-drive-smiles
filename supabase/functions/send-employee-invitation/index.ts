import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), {
      status: s,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const { employee_id, email, first_name, last_name, provider_name } = await req.json();
    if (!email || !employee_id) {
      return json({ error: 'employee_id i email są wymagane' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Generate invite link
    const redirectTo = `${req.headers.get('origin') || 'https://getrido.pl'}/uslugi/panel?invited_employee=${employee_id}`;
    const { data: linkData, error: linkErr } = await (admin.auth.admin as any).generateLink({
      type: 'invite',
      email,
      options: { redirectTo, data: { employee_id, first_name, last_name } },
    });

    if (linkErr) {
      console.error('generateLink error:', linkErr);
      return json({ error: linkErr.message }, 500);
    }

    const actionLink = (linkData as any)?.properties?.action_link;

    // Try to send email via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY');
    let emailSent = false;
    if (resendKey && actionLink) {
      try {
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
            <h2 style="color:#4A3AFF">Zaproszenie do zespołu ${provider_name || 'warsztatu'}</h2>
            <p>Cześć ${first_name || ''},</p>
            <p>${provider_name || 'Twój pracodawca'} zaprasza Cię do swojego konta na platformie GetRido jako pracownika warsztatu.</p>
            <p>Po rejestracji będziesz mieć dostęp do przydzielonych zleceń i kalendarza.</p>
            <p style="margin:24px 0">
              <a href="${actionLink}" style="background:#4A3AFF;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">
                Zaakceptuj zaproszenie
              </a>
            </p>
            <p style="color:#666;font-size:13px">Lub skopiuj link: ${actionLink}</p>
          </div>`;

        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'GetRido <noreply@getrido.pl>',
            to: [email],
            subject: `Zaproszenie do zespołu ${provider_name || 'warsztatu'}`,
            html,
          }),
        });
        emailSent = r.ok;
        if (!r.ok) console.error('Resend error:', await r.text());
      } catch (e) {
        console.error('Email send failed:', e);
      }
    }

    // Mark employee as invited
    await admin
      .from('workshop_employees')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', employee_id);

    return json({ success: true, action_link: actionLink, email_sent: emailSent });
  } catch (err) {
    console.error('send-employee-invitation error:', err);
    return json({ error: String(err) }, 500);
  }
});
