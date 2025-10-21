import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SystemAlert {
  id: string;
  type: 'error' | 'warning' | 'new_driver' | 'info';
  category: 'import' | 'matching' | 'validation' | 'system';
  title: string;
  description: string;
  driver_id: string | null;
  import_job_id: string | null;
  status: 'pending' | 'resolved' | 'ignored';
  metadata: any;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export function useSystemAlerts() {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from('system_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error fetching system alerts:', error);
        return;
      }

      setAlerts((data || []) as SystemAlert[]);
      setUnreadCount((data || []).filter(a => a.status === 'pending').length);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsResolved = async (alertId: string) => {
    const { error } = await supabase
      .from('system_alerts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', alertId);

    if (!error) {
      fetchAlerts();
    }
  };

  const markAsIgnored = async (alertId: string) => {
    const { error } = await supabase
      .from('system_alerts')
      .update({ status: 'ignored' })
      .eq('id', alertId);

    if (!error) {
      fetchAlerts();
    }
  };

  useEffect(() => {
    fetchAlerts();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('system_alerts_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_alerts'
        },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    alerts,
    loading,
    unreadCount,
    markAsResolved,
    markAsIgnored,
    refetch: fetchAlerts
  };
}
