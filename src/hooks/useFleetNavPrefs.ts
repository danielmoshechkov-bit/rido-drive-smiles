import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Preferencje paska panelu flotowego (per-użytkownik). Zwraca ukryte moduły.
 * BEZPIECZEŃSTWO: brak wiersza preferencji → hidden=[] → pasek DOKŁADNIE jak dziś
 * (18 firm bez zmian). Fail-safe na błędach.
 */
export function useFleetNavPrefs() {
  const [hidden, setHidden] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id);
      if (!user) { setHidden([]); setLoading(false); return; }
      const { data } = await (supabase as any).from('fleet_nav_preferences').select('hidden_tabs').eq('user_id', user.id).maybeSingle();
      setHidden(Array.isArray(data?.hidden_tabs) ? data.hidden_tabs : []);
    } catch { setHidden([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { hidden, userId, loading, reload: load };
}
