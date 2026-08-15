import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCheckout } from '@/hooks/useCheckout';
import type { PublicPlan } from '@/hooks/usePublicPricing';

/**
 * Co ma się stać po kliknięciu w kartę planu — jedna reguła dla `/cennik`
 * i `/warsztat-info`, żeby te dwie strony nie zaczęły zachowywać się inaczej.
 *
 * Świadomie NIE sprawdzamy tu, czy klient ma już subskrypcję. `/cennik` jest
 * stroną publiczną i celem kampanii, więc większość wejść to niezalogowani —
 * zapytanie zawsze wracałoby puste, a koszt płacilibyśmy na każdym wejściu.
 * Rozstrzyga serwer: `billing-checkout` odmawia z `ALREADY_SUBSCRIBED`, a klient
 * dostaje komunikat z przyciskiem zamiast napisu, który zmienia się w trakcie
 * ładowania. Bramka po stronie serwera i tak musi istnieć, bo ktoś otworzy
 * dwie karty.
 */
export function usePlanAction(onNeedAuth: (plan: PublicPlan) => void) {
  const navigate = useNavigate();
  const { kup, pending } = useCheckout();
  const [zalogowany, setZalogowany] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setZalogowany(!!data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_e, s) => setZalogowany(!!s),
    );
    return () => subscription.unsubscribe();
  }, []);

  const klik = (plan: PublicPlan) => {
    // Plan indywidualny nie ma ceny, więc nie ma czego kupować.
    if (plan.is_custom) { navigate('/kontakt'); return; }

    // Darmowy i niezalogowany prowadzą w to samo miejsce: do założenia konta.
    // Przy darmowym to jest cel sam w sobie, przy płatnym — krok przed płatnością,
    // bo `billing-checkout` ustala podmiot z konta, nigdy z formularza.
    if (Number(plan.price_net) === 0 || zalogowany === false) {
      onNeedAuth(plan);
      return;
    }

    kup(plan.code);
  };

  return { klik, pending, zalogowany };
}
