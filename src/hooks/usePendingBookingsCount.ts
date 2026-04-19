import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function usePendingBookingsCount(providerId: string | null) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!providerId) return;
    let cancelled = false;
    const fetchCount = async () => {
      const { count: c } = await (supabase as any)
        .from('service_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', providerId)
        .eq('source', 'portal')
        .eq('status', 'pending');
      if (!cancelled) setCount(c || 0);
    };
    fetchCount();
    const ch = (supabase as any)
      .channel(`pending-bookings-${providerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_bookings', filter: `provider_id=eq.${providerId}` }, fetchCount)
      .subscribe();
    return () => { cancelled = true; (supabase as any).removeChannel(ch); };
  }, [providerId]);

  return count;
}
