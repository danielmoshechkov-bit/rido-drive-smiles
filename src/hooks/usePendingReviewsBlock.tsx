import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Sprawdza czy zalogowany klient ma niezakończone, obowiązkowe oceny.
 * Używane do blokady rezerwacji nowych usług.
 */
export function usePendingReviewsBlock() {
  const [hasPending, setHasPending] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setHasPending(false); setLoading(false); return; }
    const { data } = await supabase.rpc('user_has_pending_reviews', { p_user_id: user.id });
    setHasPending(!!data);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  return { hasPending, loading, refresh };
}
