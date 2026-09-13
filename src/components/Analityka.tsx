import * as React from "react";
import { useLocation } from "react-router-dom";
import { pilnujZgody, sledzOdslone } from "@/lib/pikselMeta";
import { odslonaGa4, pilnujZgodyAnalityki, ustawDaneKupujacego } from "@/lib/zdarzenia";
import { supabase } from "@/integrations/supabase/client";

/**
 * Analityka — montowana RAZ, globalnie, pod routerem.
 *
 * Jedno miejsce dla WSZYSTKICH narzędzi: piksela Meta i GA4. Każde z nich
 * pilnuje SWOJEJ zgody osobno (marketingowa kontra analityczna), ale odsłony
 * i cykl życia mają wspólne — inaczej za miesiąc jedno liczyłoby trasy,
 * a drugie nie.
 *
 * Cała decyzja „ładować czy nie" siedzi w `lib/pikselMeta.ts`; tutaj są tylko
 * dwie rzeczy, których nie da się zrobić poza Reactem:
 *
 *   • podpięcie pod zmianę zgody na czas życia aplikacji,
 *   • odsłona przy KAŻDEJ zmianie trasy — bez tego w statystykach byłyby
 *     wyłącznie wejścia na stronę główną, bo to aplikacja jednostronicowa
 *     i przejście na ogłoszenie nie przeładowuje dokumentu.
 *
 * ⚠️ Pierwsza odsłona idzie z `uruchomPiksel()`, nie stąd. Efekt na zmianę
 * trasy pomija więc pierwsze wywołanie — inaczej wejście na stronę liczyłoby
 * się podwójnie.
 */
export function Analityka() {
  const { pathname, search } = useLocation();
  const pierwszeWywolanie = React.useRef(true);

  React.useEffect(() => pilnujZgody(), []);
  React.useEffect(() => pilnujZgodyAnalityki(), []);

  /**
   * KONWERSJE ROZSZERZONE — adres kupującego podajemy przy zalogowaniu.
   *
   * Musi trafić do Google PRZED zdarzeniem konwersji, a zakup dzieje się długo
   * później, więc logowanie jest tu naturalnym momentem. Mamy przewagę nad
   * większością sklepów: adres bierzemy z KONTA, nie z formularza — jest
   * zawsze i jest prawdziwy.
   *
   * `getSession` na starcie łapie kogoś, kto wchodzi już zalogowany;
   * `onAuthStateChange` łapie logowanie w trakcie.
   */
  React.useEffect(() => {
    let zywy = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (zywy) ustawDaneKupujacego(data.session?.user?.email);
    });
    const { data: nasluch } = supabase.auth.onAuthStateChange((_zdarzenie, sesja) => {
      ustawDaneKupujacego(sesja?.user?.email);
    });
    return () => {
      zywy = false;
      nasluch.subscription.unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    if (pierwszeWywolanie.current) {
      pierwszeWywolanie.current = false;
      return;
    }
    sledzOdslone();
    odslonaGa4(`${pathname}${search}`);
  }, [pathname, search]);

  return null;
}

export default Analityka;
