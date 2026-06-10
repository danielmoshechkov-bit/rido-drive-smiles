import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { invitation_id, accept } = await req.json();
    if (!invitation_id || typeof accept !== 'boolean') return json({ error: 'invitation_id + accept required' }, 400);

    const authHeader = req.headers.get('Authorization') || '';
    const supaUrl = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(supaUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ud } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    const user = ud?.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(supaUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: inv } = await admin.from('workshop_employee_invitations').select('*').eq('id', invitation_id).maybeSingle();
    if (!inv) return json({ error: 'not found' }, 404);
    if (inv.status !== 'pending') return json({ error: 'already processed' }, 400);

    const emailMatches = (user.email || '').toLowerCase() === (inv.invited_email || '').toLowerCase();
    if (!emailMatches && inv.invited_user_id !== user.id) {
      return json({ error: 'forbidden — invitation is for another email' }, 403);
    }

    if (!accept) {
      await admin.from('workshop_employee_invitations').update({
        status: 'rejected', rejected_at: new Date().toISOString(), invited_user_id: user.id,
      }).eq('id', invitation_id);
      return json({ success: true, status: 'rejected' });
    }

    // Accept: create/update workshop_employees with user_id
    const fullName = (user.user_metadata?.full_name || user.email || 'Pracownik') as string;
    const parts = fullName.split(' ');
    const firstName = parts[0] || 'Pracownik';
    const lastName = parts.slice(1).join(' ') || '';

    // Check existing record by provider + email
    const { data: existing } = await admin.from('workshop_employees')
      .select('id').eq('provider_id', inv.provider_id)
      .or(`user_id.eq.${user.id},email.eq.${(user.email || '').toLowerCase()}`).maybeSingle();

    if (existing) {
      await admin.from('workshop_employees').update({
        user_id: user.id, status: 'active', is_active: true,
        language_preference: inv.language_preference || 'pl',
        role: inv.role || 'mechanic', removed_at: null,
        email: user.email,
      }).eq('id', existing.id);
    } else {
      await admin.from('workshop_employees').insert({
        provider_id: inv.provider_id, user_id: user.id,
        name: fullName, first_name: firstName, last_name: lastName,
        email: user.email, role: inv.role || 'mechanic',
        language_preference: inv.language_preference || 'pl',
        status: 'active', is_active: true,
      });
    }

    await admin.from('workshop_employee_invitations').update({
      status: 'accepted', accepted_at: new Date().toISOString(), invited_user_id: user.id,
    }).eq('id', invitation_id);

    return json({ success: true, status: 'accepted' });
  } catch (e) {
    console.error('workshop-accept-employee-invitation error:', e);
    return json({ error: String(e) }, 500);
  }
});
