import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { finding_ids } = await req.json() as { finding_ids: string[] };
    if (!Array.isArray(finding_ids) || finding_ids.length === 0)
      return json({ error: 'finding_ids[] required' }, 400);

    const authHeader = req.headers.get('Authorization') || '';
    const supaUrl = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(supaUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ud } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    const user = ud?.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(supaUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Get findings and verify provider ownership
    const { data: findings } = await admin.from('workshop_employee_findings')
      .select('*, service_providers!inner(user_id)').in('id', finding_ids);
    if (!findings || findings.length === 0) return json({ error: 'not found' }, 404);

    // Verify all belong to providers owned by caller
    const { data: provs } = await admin.from('service_providers').select('id').eq('user_id', user.id);
    const ownedIds = new Set((provs || []).map(p => p.id));
    if (findings.some(f => !ownedIds.has(f.provider_id))) return json({ error: 'forbidden' }, 403);

    // Get next sort_order for each order
    const orderIds = [...new Set(findings.map(f => f.order_id))];
    const sortMap: Record<string, number> = {};
    for (const oid of orderIds) {
      const { data: items } = await admin.from('workshop_order_items')
        .select('sort_order').eq('order_id', oid).order('sort_order', { ascending: false }).limit(1);
      sortMap[oid] = ((items?.[0]?.sort_order as number) || 0) + 1;
    }

    // Insert workshop_order_items for each finding
    for (const f of findings) {
      const itemType = f.part_oe_code || f.part_name ? 'part' : 'service';
      const description = f.description_pl || f.description_original || '';
      const itemRow: any = {
        order_id: f.order_id,
        item_type: itemType,
        description,
        quantity: 1,
        unit: itemType === 'part' ? 'szt' : 'h',
        sort_order: sortMap[f.order_id]++,
        notes: `Od pracownika: ${f.description_original}`,
      };
      if (itemType === 'part') {
        itemRow.name = f.part_name || description;
        itemRow.oe_code = f.part_oe_code;
        itemRow.supplier = f.part_supplier;
      } else {
        itemRow.name = description;
        itemRow.quantity = f.estimated_hours || 1;
      }
      const { data: ins } = await admin.from('workshop_order_items').insert(itemRow).select('id').maybeSingle();
      await admin.from('workshop_employee_findings').update({
        status: 'approved',
        moved_to_order_at: new Date().toISOString(),
        moved_to_order_item_id: ins?.id || null,
      }).eq('id', f.id);
    }

    // Update assignment status
    for (const oid of orderIds) {
      await admin.from('workshop_order_assignments').update({
        status: 'approved', updated_at: new Date().toISOString(),
      }).eq('order_id', oid);
    }

    return json({ success: true, count: findings.length });
  } catch (e) {
    console.error('approve-findings error:', e);
    return json({ error: String(e) }, 500);
  }
});
