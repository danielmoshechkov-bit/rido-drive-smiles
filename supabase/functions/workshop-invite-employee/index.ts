import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { corsHeaders } from '../_shared/cors.ts';

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email = null, provider_id, role = 'mechanic', language_preference = 'pl', phone = null, send_email = true, send_sms = false } = await req.json();
    const emailNorm = email ? String(email).trim().toLowerCase() : null;
    const phoneNorm = phone ? String(phone).trim() : null;
    if ((!emailNorm && !phoneNorm) || !provider_id) return json({ error: 'email or phone, and provider_id required' }, 400);

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

    // Look up user by email (tylko gdy mamy email)
    let invitedUserId: string | null = null;
    if (emailNorm) try {
      const { data: users } = await (admin.auth.admin as any).listUsers({ page: 1, perPage: 200 });
      const found = users?.users?.find((u: any) => (u.email || '').toLowerCase() === emailNorm);
      if (found) invitedUserId = found.id;
    } catch (e) {
      console.warn('listUsers failed', e);
    }

    // Reuse pending invitation if one already exists (prevents duplicate emails on double-click)
    let pendingQ = admin
      .from('workshop_employee_invitations')
      .select('*')
      .eq('provider_id', provider_id)
      .eq('status', 'pending');
    pendingQ = emailNorm ? pendingQ.eq('invited_email', emailNorm) : pendingQ.eq('invited_phone', phoneNorm);
    const { data: existingPending } = await pendingQ
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let invitation: any = existingPending;
    if (!invitation) {
      const { data: created, error: invErr } = await admin
        .from('workshop_employee_invitations')
        .insert({
          provider_id,
          invited_email: emailNorm,
          invited_phone: phoneNorm,
          invited_user_id: invitedUserId,
          invited_by: user.id,
          role,
          language_preference,
          status: 'pending',
        })
        .select()
        .single();
      if (invErr) return json({ error: invErr.message }, 500);
      invitation = created;
    }


    // Build action link (auth invite link if no account, otherwise direct link)
    let actionLink: string | null = null;
    const origin = req.headers.get('origin') || 'https://getrido.pl';
    try {
      if (!invitedUserId && emailNorm) {
        const redirectTo = `${origin}/?invitation=${invitation.id}`;
        const { data: linkData } = await (admin.auth.admin as any).generateLink({
          type: 'invite',
          email: emailNorm,
          options: { redirectTo, data: { workshop_invitation_id: invitation.id } },
        });
        actionLink = (linkData as any)?.properties?.action_link || null;
      }
    } catch (e) {
      console.warn('generateLink failed', e);
    }
    if (!actionLink) actionLink = `${origin}/?invitation=${invitation.id}`;

    // Send email via SMTP (same path used for registration emails)
    let emailSent = false;
    let emailError: string | null = null;
    if (send_email && emailNorm) try {
      const smtpPassword = Deno.env.get('SMTP_PASSWORD');
      if (!smtpPassword) throw new Error('SMTP_PASSWORD not configured');

      const { data: settings, error: settingsErr } = await admin
        .from('email_settings')
        .select('*')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .single();
      if (settingsErr || !settings) throw new Error('email_settings not found');

      const senderName = settings.sender_name || 'GetRido';
      const senderEmail = settings.sender_email || settings.smtp_user || 'kontakt@getrido.pl';
      const company = prov.company_name || 'Warsztat';

      const subject = `${company} zaprasza Cię do zespołu w GetRido`;
      const text = `Witaj!\n\n${company} zaprasza Cię do dołączenia do swojego zespołu w GetRido — będziesz otrzymywać i obsługiwać zlecenia warsztatowe bezpośrednio w aplikacji.\n\nAby potwierdzić zaproszenie, kliknij w poniższy link:\n${actionLink}\n\nJeśli link nie zadziała, skopiuj go i wklej w przeglądarce.\n\nJeśli nie spodziewałeś/aś się tego zaproszenia — zignoruj tę wiadomość.\n\n--\nZespół GetRido\nhttps://getrido.pl`;

      const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;background:#fff">
  <div style="text-align:center;margin-bottom:24px">
    <h1 style="color:#4A3AFF;margin:0;font-size:24px">GetRido</h1>
  </div>
  <h2 style="color:#1a1a1a;font-size:20px;margin:0 0 16px">Zaproszenie do zespołu warsztatu</h2>
  <p>Cześć,</p>
  <p><strong>${company}</strong> zaprasza Cię do dołączenia do swojego zespołu w GetRido. Po akceptacji będziesz otrzymywać przydzielone zlecenia warsztatowe i obsługiwać je bezpośrednio w aplikacji.</p>
  <p style="margin:28px 0;text-align:center">
    <a href="${actionLink}" style="background:#4A3AFF;color:#fff;padding:14px 28px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600">
      Potwierdź zaproszenie
    </a>
  </p>
  <p style="color:#666;font-size:13px;margin-top:24px">
    Jeśli przycisk nie działa, skopiuj i wklej ten link w przeglądarce:<br/>
    <a href="${actionLink}" style="color:#4A3AFF;word-break:break-all">${actionLink}</a>
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0"/>
  <p style="color:#999;font-size:12px;text-align:center">
    Otrzymujesz tę wiadomość ponieważ ${company} wpisał Twój adres email jako pracownika w panelu GetRido.<br/>
    Jeśli to pomyłka, zignoruj tę wiadomość.
  </p>
</div>`;

      const port = settings.smtp_port || 587;
      const useTls = port === 465;
      const client = new SMTPClient({
        connection: {
          hostname: settings.smtp_host || 'getrido.pl',
          port,
          tls: useTls,
          auth: {
            username: settings.smtp_user || 'kontakt@getrido.pl',
            password: smtpPassword,
          },
        },
      });

      // qmail/pobox SMTP rejects bare LFs — force CRLF line endings everywhere
      const toCRLF = (s: string) => s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
      const minifiedHtml = toCRLF(
        html.replace(/\r\n/g, '\n').replace(/\n\s+/g, ' ').replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim()
      );
      const crlfText = toCRLF(text);

      await client.send({
        from: `${senderName} <${senderEmail}>`,
        to: [emailNorm],
        replyTo: senderEmail,
        subject,
        content: crlfText,
        html: minifiedHtml,
        headers: {
          'List-Unsubscribe': `<mailto:${senderEmail}?subject=Unsubscribe>`,
          'X-Mailer': 'GetRido Workshop',
        },
      });
      await client.close();
      emailSent = true;
      console.log('Workshop invitation email sent to', emailNorm);
    } catch (e: any) {
      emailError = String(e?.message || e);
      console.error('SMTP send failed:', emailError);
    }

    // SMS z linkiem rejestracji (best-effort)
    let smsSent = false;
    if (send_sms && phoneNorm) {
      try {
        const sUrl = Deno.env.get('SUPABASE_URL');
        const sKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const msg = `Zaproszenie do zespolu ${prov.company_name || 'warsztatu'} w GetRido. Zarejestruj sie: ${actionLink}`;
        const r = await fetch(`${sUrl}/functions/v1/workshop-send-sms`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${sKey}`, apikey: sKey || '', 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider_id, phone: phoneNorm, message: msg, sms_type: 'employee_invite' }),
        });
        const rj = await r.json().catch(() => ({}));
        smsSent = !rj?.error;
      } catch (_) { /* sms best-effort */ }
    }

    return json({ success: true, invitation_id: invitation.id, action_link: actionLink, email_sent: emailSent, email_error: emailError, sms_sent: smsSent });
  } catch (e) {
    console.error('workshop-invite-employee error:', e);
    return json({ error: String(e) }, 500);
  }
});
