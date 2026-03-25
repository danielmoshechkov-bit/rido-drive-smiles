import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useKsefUnreadCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { count: c } = await (supabase as any)
        .from('ksef_monitor_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (!cancelled) setCount(c || 0);
    };

    load();

    // Real-time subscription
    const channel = (supabase as any)
      .channel('ksef-unread-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ksef_monitor_alerts' }, () => {
        load();
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const markAllRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await (supabase as any)
      .from('ksef_monitor_alerts')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    setCount(0);
  };

  return { count, markAllRead };
}
