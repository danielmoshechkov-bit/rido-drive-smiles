import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Konto testowe z pełnym dostępem: widzi funkcje "wkrótce" jako aktywne,
 * podczas gdy zwykli klienci widzą je wyszarzone. Flaga trzymana w tabeli
 * public.beta_testers (jeden wiersz = jedno odblokowane konto), więc kolejne
 * konta odblokowuje się INSERT-em w bazie, bez zmiany kodu.
 *
 * Zwraca { isBetaTester, loading }. Domyślnie false (bezpieczna strona:
 * gdy nie wiadomo / brak sesji, traktuj jak zwykłego klienta).
 */
export function useIsBetaTester() {
  const [isBetaTester, setIsBetaTester] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) { setIsBetaTester(false); setLoading(false); }
          return;
        }
        const { data } = await (supabase.from('beta_testers') as any)
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled) return;
        setIsBetaTester(!!data);
        setLoading(false);
      } catch {
        if (!cancelled) { setIsBetaTester(false); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { isBetaTester, loading };
}
