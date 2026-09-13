import * as React from "react";
import { useLocation } from "react-router-dom";
import { pilnujZgody, sledzOdslone } from "@/lib/pikselMeta";

/**
 * Piksel Meta — montowany RAZ, globalnie, pod routerem.
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
export function PikselMeta() {
  const { pathname, search } = useLocation();
  const pierwszeWywolanie = React.useRef(true);

  React.useEffect(() => pilnujZgody(), []);

  React.useEffect(() => {
    if (pierwszeWywolanie.current) {
      pierwszeWywolanie.current = false;
      return;
    }
    sledzOdslone();
  }, [pathname, search]);

  return null;
}

export default PikselMeta;
