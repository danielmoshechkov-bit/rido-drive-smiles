import * as React from "react";
import { useLocation } from "react-router-dom";
import { pilnujZgody, sledzOdslone } from "@/lib/pikselMeta";
import { odslonaGa4, pilnujZgodyAnalityki } from "@/lib/zdarzenia";

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
