// Shared helper: when an order's status equals a station name, attach the
// order to that station and create assignments for every employee that
// belongs to it (so they see it in their "Moje zlecenia" instantly).
import { supabase } from '@/integrations/supabase/client';

export async function applyStationHandover(opts: {
  orderId: string;
  providerId: string;
  newStatus: string;
}): Promise<{ station: any | null; addedAssignments: number }> {
  const { orderId, providerId, newStatus } = opts;

  const { data: st } = await (supabase.from('workshop_stations') as any)
    .select('id, name')
    .eq('provider_id', providerId)
    .eq('name', newStatus)
    .eq('is_active', true)
    .maybeSingle();

  if (!st) return { station: null, addedAssignments: 0 };

  // mark the order as belonging to this station
  await (supabase.from('workshop_orders') as any)
    .update({ station_id: st.id })
    .eq('id', orderId);

  // employees of this station
  const { data: stEmps } = await (supabase.from('workshop_station_employees') as any)
    .select('employee_user_id').eq('station_id', st.id);

  const { data: existing } = await (supabase.from('workshop_order_assignments') as any)
    .select('employee_user_id').eq('order_id', orderId);

  const have = new Set(((existing || []) as any[]).map(e => e.employee_user_id));
  const { data: { user } } = await supabase.auth.getUser();
  const toAdd = ((stEmps || []) as any[])
    .map((e: any) => e.employee_user_id)
    .filter((uid: string) => uid && !have.has(uid))
    .map((uid: string) => ({
      order_id: orderId,
      provider_id: providerId,
      employee_user_id: uid,
      assigned_by: user?.id || null,
      status: 'assigned',
    }));

  if (toAdd.length) {
    await (supabase.from('workshop_order_assignments') as any).insert(toAdd);
  }

  // best-effort SMS/notification
  supabase.functions.invoke('workshop-notify-employee', {
    body: { order_id: orderId, event: 'department_changed', station_id: st.id, status_name: newStatus },
  }).catch(() => {});

  return { station: st, addedAssignments: toAdd.length };
}
