/**
 * Który krok wprowadzenia pasuje do tego, co JEST TERAZ NA EKRANIE.
 *
 * Dlaczego to w ogóle istnieje: wprowadzenie było licznikiem — krok 1, 2, 3 —
 * a praca w warsztacie licznikiem nie jest. Okno zlecenia otwiera okno pojazdu,
 * to otwiera okno klienta, klient się zamyka i wracamy do pojazdu. Licznik
 * zostawał wtedy w innym miejscu niż człowiek: dymek mówił o liście zadań,
 * a na wierzchu stało okno „Dodaj nowy pojazd".
 *
 * Reguła jest prosta i wynika z tego, jak działają okna: LICZY SIĘ NAJGŁĘBSZE
 * OTWARTE OKNO. Jeśli widać cel kroku z okna klienta, to człowiek jest w oknie
 * klienta — nieważne, na którym kroku stał licznik. Dopiero wewnątrz jednego
 * ekranu kolejność kroków ma znaczenie i tam działa „Dalej".
 *
 * Funkcje są czyste (wchodzi lista celów i głębokości, wychodzi numer kroku),
 * więc całą tę logikę da się sprawdzić testem bez przeglądarki — a to jedyny
 * sposób, żeby przestać ją poprawiać po omacku.
 */

export interface WidocznyCel {
  cel: string;
  /** Ile okien modalnych opakowuje ten element. 0 = zwykły ekran. */
  glebokosc: number;
}

/**
 * Zwraca numer kroku, który powinien być pokazany.
 *
 * @param cele        cele kolejnych kroków (undefined = krok bez podświetlenia)
 * @param biezacy     krok pokazywany teraz
 * @param widoczne    cele obecne na ekranie wraz z głębokością okna
 */
export function wybierzKrok(
  cele: Array<string | undefined>,
  biezacy: number,
  widoczne: WidocznyCel[],
): number {
  if (!widoczne.length) return biezacy;

  const najglebiej = Math.max(...widoczne.map((w) => w.glebokosc));
  const naWierzchu = new Set(
    widoczne.filter((w) => w.glebokosc === najglebiej).map((w) => w.cel),
  );

  const celBiezacego = cele[biezacy];
  // Człowiek jest tam, gdzie stoi bieżący krok — nie ruszamy go.
  if (celBiezacego && naWierzchu.has(celBiezacego)) return biezacy;

  const kandydaci = cele
    .map((cel, i) => ({ cel, i }))
    .filter((k) => k.cel && naWierzchu.has(k.cel));

  if (!kandydaci.length) return biezacy;

  // Wśród kroków tego samego ekranu bierzemy pierwszy PO bieżącym — dzięki temu
  // powrót do okna, w którym już byliśmy (np. zamknięcie okna klienta), nie
  // cofa wprowadzenia do kroku, który człowiek ma za sobą.
  const doPrzodu = kandydaci.find((k) => k.i > biezacy);
  return (doPrzodu ?? kandydaci[0]).i;
}

/**
 * Dokąd prowadzi „Dalej".
 *
 * Nie zawsze do sąsiedniego kroku: gdy następny krok dotyczy innego ekranu
 * (np. okna, które jeszcze się nie otworzyło), a na tym ekranie jest jeszcze
 * coś do pokazania, najpierw pokazujemy to.
 */
export function nastepnyKrok(
  cele: Array<string | undefined>,
  biezacy: number,
  widoczne: WidocznyCel[],
): number {
  const nastepny = biezacy + 1;
  if (nastepny >= cele.length) return nastepny;
  if (!widoczne.length) return nastepny;

  const najglebiej = Math.max(...widoczne.map((w) => w.glebokosc));
  const naWierzchu = new Set(
    widoczne.filter((w) => w.glebokosc === najglebiej).map((w) => w.cel),
  );

  const celNastepnego = cele[nastepny];
  // Następny krok pokazuje coś, co widać — idziemy normalnie.
  if (!celNastepnego || naWierzchu.has(celNastepnego)) return nastepny;

  // Nie widać go: szukamy dalej czegoś, co na tym ekranie widać.
  for (let i = nastepny + 1; i < cele.length; i++) {
    const cel = cele[i];
    if (cel && naWierzchu.has(cel)) return i;
  }
  // Nic więcej na tym ekranie — zostawiamy sąsiedni krok. Jego cel pojawi się,
  // gdy człowiek przejdzie dalej, a do tego czasu dymek stoi na środku.
  return nastepny;
}
