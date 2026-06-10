import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface WorkshopEmployeeRecord {
  id: string;
  provider_id: string;
  provider_name?: string;
  role?: string;
}

/**
 * Returns true if the current user is an active workshop employee
 * (i.e. they accepted an invitation from some provider).
 */
export function useIsWorkshopEmployee() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<WorkshopEmployeeRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) { setRecords([]); setLoading(false); }
          return;
        }
        const { data } = await (supabase.from('workshop_employees') as any)
          .select('id, provider_id, role, service_providers(company_name)')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .eq('status', 'active');
        if (cancelled) return;
        setRecords(
          (data || []).map((r: any) => ({
            id: r.id,
            provider_id: r.provider_id,
            provider_name: r.service_providers?.company_name,
            role: r.role,
          })),
        );
      } catch (e) {
        console.warn('useIsWorkshopEmployee error', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { loading, isWorkshopEmployee: records.length > 0, records };
}
