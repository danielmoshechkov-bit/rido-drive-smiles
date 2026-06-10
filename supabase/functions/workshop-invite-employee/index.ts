import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email, provider_id, role = 'mechanic', language_preference = 'pl' } = await req.json();
    if (!email || !provider_id) return json({ error: 'email and provider_id required' }, 400);

    const authHeader = req.headers.get('Authorization') || '';
    const accessToken = authHeader.replace('Bearer ', '');
    const supaUrl = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(supaUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser(accessToken);
    const user = userData?.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(supaUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Verify caller owns the provider
    const { data: prov } = await admin.from('service_providers').select('id, user_id, company_name')
      .eq('id', provider_id).maybeSingle();
    if (!prov || prov.user_id !== user.id) return json({ error: 'forbidden' }, 403);

    // Look up user by email
    const { data: existing } = await admin
      .from('auth.users' as any).select('id').eq('email', email.toLowerCase()).maybeSingle();
    let invitedUserId: string | null = null;
    try {
      const { data: users } = await (admin.auth.admin as any).listUsers({ page: 1, perPage: 200 });
      const found = users?.users?.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
      if (found) invitedUserId = found.id;
    } catch (e) {
      console.warn('listUsers failed', e);
    }

    // Insert invitation
    const { data: invitation, error: invErr } = await admin
      .from('workshop_employee_invitations')
      .insert({
        provider_id,
        invited_email: email.toLowerCase(),
        invited_user_id: invitedUserId,
        invited_by: user.id,
        role,
        language_preference,
        status: 'pending',
      })
      .select()
      .single();
    if (invErr) return json({ error: invErr.message }, 500);

    // Send notification + email
    let actionLink: string | null = null;
    try {
      if (!invitedUserId) {
        const redirectTo = `${req.headers.get('origin') || 'https://getrido.pl'}/?invitation=${invitation.id}`;
        const { data: linkData } = await (admin.auth.admin as any).generateLink({
          type: 'invite',
          email,
          options: { redirectTo, data: { workshop_invitation_id: invitation.id } },
        });
        actionLink = (linkData as any)?.properties?.action_link || null;
      }

      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey) {
        const html = `
          <div style="font-family:Arial;max-width:560px;margin:0 auto;padding:24px">
            <h2 style="color:#4A3AFF">Zaproszenie do warsztatu</h2>
            <p>${prov.company_name || 'Warsztat'} zaprasza Cię do współpracy jako pracownika.</p>
            <p>Zaloguj się do GetRido, aby zaakceptować zaproszenie i otrzymywać przydzielone zlecenia.</p>
            ${actionLink ? `<p style="margin:24px 0"><a href="${actionLink}" style="background:#4A3AFF;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px">Załóż konto i akceptuj</a></p>` : `<p style="margin:24px 0"><a href="https://getrido.pl/?invitation=${invitation.id}" style="background:#4A3AFF;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px">Otwórz GetRido</a></p>`}
          </div>`;
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'GetRido <noreply@getrido.pl>',
            to: [email],
            subject: `${prov.company_name || 'Warsztat'} zaprosił Cię do zespołu`,
            html,
          }),
        });
      }
    } catch (e) {
      console.error('notify err', e);
    }

    return json({ success: true, invitation_id: invitation.id, action_link: actionLink });
  } catch (e) {
    console.error('workshop-invite-employee error:', e);
    return json({ error: String(e) }, 500);
  }
});
