import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useZakup } from '@/components/billing/ZakupProvider';
import type { PublicPlan } from '@/hooks/usePublicPricing';

/**
 * Co ma się stać po kliknięciu w kartę planu — jedna reguła dla `/cennik`
 * i `/warsztat-info`, żeby te dwie strony nie zaczęły zachowywać się inaczej.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 ZAKUP IDZIE PRZEZ OKNO, NIE WPROST DO OPERATORA
 * ═══════════════════════════════════════════════════════════════════════════
 * Ten hak wołał `billing-checkout` bezpośrednio (przez `useCheckout`) i tym
 * samym OMIJAŁ krok „Dane do faktury". Warsztat bez tych danych — 25 z 30 kont
 * na produkcji — dostawał odmowę 409, którą front pokazywał jako
 * „Edge Function returned a non-2xx status code".
 *
 * Okno zakupu pyta o dane PRZED metodą płatności, więc ta odmowa nie ma jak
 * powstać. Zniknęła przy okazji druga droga do bramki płatności — a `ZakupProvider`
 * od początku deklarował, że żadne miejsce własnej drogi mieć nie będzie.
 *
 * Świadomie NIE sprawdzamy tu, czy klient ma już subskrypcję. `/cennik` jest
 * stroną publiczną i celem kampanii, więc większość wejść to niezalogowani —
 * zapytanie zawsze wracałoby puste, a koszt płacilibyśmy na każdym wejściu.
 * Rozstrzyga serwer, a okno tłumaczy jego odmowę na zdanie.
 */
export function usePlanAction(onNeedAuth: (plan: PublicPlan) => void) {
  const navigate = useNavigate();
  const { otworzZakup } = useZakup();
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

    otworzZakup({ planCode: plan.code });
  };

  return { klik, zalogowany };
}
