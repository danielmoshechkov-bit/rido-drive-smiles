import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { phaseABlockedResponse } from "../_shared/phaseABlock.ts";

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/**
 * Token-based acceptance.
 * Accepts `invitation_id` (the UUID acts as token) WITHOUT requiring auth.
 * - Looks up an auth user by invited_email.
 * - If exists: activates workshop_employees with user_id, marks accepted.
 * - If not: marks accepted anyway; user will be linked on next login (by email).
 */
serve(async (req) => {
  return phaseABlockedResponse(req, "workshop-accept-employee-invitation");

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as any));
    const invitation_id: string | undefined = body.invitation_id;
    const accept: boolean = body.accept !== false; // default true

    if (!invitation_id) return json({ error: 'invitation_id required' }, 400);

    const supaUrl = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(supaUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: inv } = await admin
      .from('workshop_employee_invitations')
      .select('*, service_providers(company_name)')
      .eq('id', invitation_id)
      .maybeSingle();
    if (!inv) return json({ error: 'not_found' }, 404);

    const companyName = (inv as any).service_providers?.company_name || 'warsztat';

    if (inv.status === 'accepted') {
      return json({ success: true, status: 'accepted', already: true, company_name: companyName, invited_email: inv.invited_email });
    }
    if (inv.status !== 'pending') {
      return json({ error: 'already_processed', status: inv.status }, 400);
    }

    if (!accept) {
      await admin.from('workshop_employee_invitations').update({
        status: 'rejected', rejected_at: new Date().toISOString(),
      }).eq('id', invitation_id);
      return json({ success: true, status: 'rejected' });
    }

    // Try to find an auth user by email
    let foundUser: any = null;
    try {
      let page = 1;
      while (page < 20 && !foundUser) {
        const { data: list } = await (admin.auth.admin as any).listUsers({ page, perPage: 200 });
        const users = list?.users || [];
        foundUser = users.find((u: any) => (u.email || '').toLowerCase() === (inv.invited_email || '').toLowerCase());
        if (users.length < 200) break;
        page++;
      }
    } catch (e) {
      console.warn('listUsers failed', e);
    }

    const userId = foundUser?.id || inv.invited_user_id || null;

    // Upsert workshop_employees: if user known, fill user_id and activate; otherwise leave as awaiting-user record
    const { data: existing } = await admin.from('workshop_employees')
      .select('id').eq('provider_id', inv.provider_id)
      .or(`email.eq.${(inv.invited_email || '').toLowerCase()}${userId ? `,user_id.eq.${userId}` : ''}`)
      .maybeSingle();

    if (existing) {
      await admin.from('workshop_employees').update({
        user_id: userId, status: 'active', is_active: true,
        language_preference: inv.language_preference || 'pl',
        role: inv.role || 'mechanic', removed_at: null,
        email: inv.invited_email,
      }).eq('id', existing.id);
    } else {
      const fullName = foundUser?.user_metadata?.full_name || inv.invited_email || 'Pracownik';
      const parts = String(fullName).split(' ');
      await admin.from('workshop_employees').insert({
        provider_id: inv.provider_id, user_id: userId,
        name: fullName, first_name: parts[0] || 'Pracownik', last_name: parts.slice(1).join(' ') || '',
        email: inv.invited_email, role: inv.role || 'mechanic',
        language_preference: inv.language_preference || 'pl',
        status: 'active', is_active: true,
      });
    }

    await admin.from('workshop_employee_invitations').update({
      status: 'accepted', accepted_at: new Date().toISOString(),
      invited_user_id: userId,
    }).eq('id', invitation_id);

    return json({
      success: true,
      status: 'accepted',
      company_name: companyName,
      invited_email: inv.invited_email,
      user_linked: !!userId,
    });
  } catch (e) {
    console.error('workshop-accept-employee-invitation error:', e);
    return json({ error: String(e) }, 500);
  }
});
