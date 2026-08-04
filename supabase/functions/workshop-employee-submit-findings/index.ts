import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { phaseABlockedResponse } from "../_shared/phaseABlock.ts";

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface FindingInput {
  description_original: string;
  description_original_lang?: string;
  action_type?: string;
  part_oe_code?: string | null;
  part_name?: string | null;
  part_supplier?: string | null;
  estimated_hours?: number;
}

serve(async (req) => {
  return phaseABlockedResponse(req, "workshop-employee-submit-findings");

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { order_id, findings, source_lang = 'pl' } = await req.json() as {
      order_id: string; findings: FindingInput[]; source_lang?: string;
    };
    if (!order_id || !Array.isArray(findings) || findings.length === 0)
      return json({ error: 'order_id and findings[] required' }, 400);

    const authHeader = req.headers.get('Authorization') || '';
    const supaUrl = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(supaUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ud } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    const user = ud?.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(supaUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Verify assignment exists
    const { data: assignment } = await admin.from('workshop_order_assignments')
      .select('id, provider_id').eq('order_id', order_id).eq('employee_user_id', user.id).maybeSingle();
    if (!assignment) return json({ error: 'no assignment for this order' }, 403);

    // Get current max position
    const { data: existing } = await admin.from('workshop_employee_findings')
      .select('position').eq('order_id', order_id).order('position', { ascending: false }).limit(1);
    let nextPos = ((existing?.[0]?.position as number) || 0) + 1;

    const rows: any[] = [];
    for (const f of findings) {
      const original = (f.description_original || '').trim();
      if (!original) continue;
      let pl = original;
      if (source_lang !== 'pl') {
        // Translate via workshop-translate
        try {
          const r = await fetch(`${supaUrl}/functions/v1/workshop-translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
            body: JSON.stringify({ text: original, source_lang, target_lang: 'pl' }),
          });
          if (r.ok) {
            const d = await r.json();
            pl = d.text || original;
          }
        } catch (e) { console.error('translate err', e); }
      }
      rows.push({
        order_id, provider_id: assignment.provider_id, employee_user_id: user.id,
        position: nextPos++, description_original: original,
        description_original_lang: source_lang, description_pl: pl,
        action_type: f.action_type || 'inne',
        part_oe_code: f.part_oe_code || null,
        part_name: f.part_name || null,
        part_supplier: f.part_supplier || null,
        estimated_hours: f.estimated_hours || 0,
        status: 'pending',
      });
    }

    if (rows.length === 0) return json({ error: 'no valid findings' }, 400);
    const { data: inserted, error: insErr } = await admin.from('workshop_employee_findings').insert(rows).select();
    if (insErr) return json({ error: insErr.message }, 500);

    await admin.from('workshop_order_assignments').update({
      status: 'submitted_for_review', updated_at: new Date().toISOString(),
    }).eq('id', assignment.id);

    return json({ success: true, count: inserted?.length || 0 });
  } catch (e) {
    console.error('submit-findings error:', e);
    return json({ error: String(e) }, 500);
  }
});
