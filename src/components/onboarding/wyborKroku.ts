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
  /** Czy pole w tym miejscu jest już wypełnione (patrz `przejdzGdyWypelnione`). */
  wypelniony?: boolean;
  /** Czy w tym miejscu w ogóle jest co wpisywać (przycisk nie ma pola). */
  maPole?: boolean;
}

export interface Opcje {
  /**
   * Kroki, które same schodzą dalej, gdy człowiek wypełni podświetlone pole.
   *
   * Powód: przy oknie klienta ramka stała na „Imię i nazwisko" także wtedy, gdy
   * imię było już wpisane, a następne w kolejności jest przecież pole telefonu.
   * Czekanie na „Dalej" w środku jednego formularza jest zbędnym klikaniem —
   * ekran wie, że ten krok jest zrobiony.
   *
   * Włączamy to TYLKO tam, gdzie wpisanie pola naprawdę kończy krok. Przy numerze
   * rejestracyjnym nie — tam po wpisaniu trzeba jeszcze nacisnąć lupkę albo
   * „Utwórz nowy pojazd", więc ramka musi zostać.
   */
  przejdzGdyWypelnione?: boolean[];
  /**
   * Kroki, które przejmują ekran w chwili, gdy ich miejsce się POJAWI.
   *
   * Są rzeczy, których wcześniej fizycznie nie ma: zielona ramka z danymi
   * pobranymi po numerze pokazuje się dopiero po kliknięciu lupki, a lista
   * „Paragon / Faktura / Potwierdzenie" — dopiero po otwarciu menu „Wystaw".
   * Skoro człowiek właśnie to wywołał, to o tym chce przeczytać; czekanie na
   * „Dalej" znaczyłoby, że dymek mówi o czymś innym niż to, co widać.
   *
   * Tylko do przodu — żeby otwarcie czegoś nie cofało wprowadzenia.
   */
  pokazGdySieZjawi?: boolean[];
  /**
   * Kroki, które przejmują ekran, gdy ich miejsce zostanie WYPEŁNIONE.
   *
   * Do rzeczy, które istnieją cały czas, ale mają sens dopiero z treścią: pola
   * pojazdu stoją puste od otwarcia okna, a mówimy o nich dopiero wtedy, gdy
   * wypełni je odpowiedź z rejestru. Sam fakt, że są na ekranie, niczego nie
   * znaczy — dlatego to osobna reguła niż `pokazGdySieZjawi`.
   */
  pokazGdyWypelniony?: boolean[];
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
  opcje: Opcje = {},
): number {
  if (!widoczne.length) return biezacy;

  const najglebiej = Math.max(...widoczne.map((w) => w.glebokosc));
  const naWierzchu = new Set(
    widoczne.filter((w) => w.glebokosc === najglebiej).map((w) => w.cel),
  );

  const kandydaci = cele
    .map((cel, i) => ({ cel, i }))
    .filter((k) => k.cel && naWierzchu.has(k.cel));

  // Coś się właśnie pojawiło i samo prosi o opis (zielona ramka z danymi,
  // otwarte menu „Wystaw") — idziemy za tym, nawet jeśli bieżący krok wciąż widać.
  const zjawilSie = kandydaci.find((k) => k.i > biezacy && opcje.pokazGdySieZjawi?.[k.i]);
  if (zjawilSie) return zjawilSie.i;

  // To samo, ale dla miejsc, które stoją puste do czasu, aż coś je wypełni
  // (pola pojazdu po sprawdzeniu numeru w rejestrze).
  const wypelnilSie = kandydaci.find(
    (k) => k.i > biezacy && opcje.pokazGdyWypelniony?.[k.i] &&
      widoczne.some((w) => w.cel === k.cel && w.wypelniony),
  );
  if (wypelnilSie) return wypelnilSie.i;

  const celBiezacego = cele[biezacy];
  if (celBiezacego && naWierzchu.has(celBiezacego)) {
    // Krok „samoschodzący": pole wypełnione, więc pokazujemy następne miejsce
    // w tym samym oknie. Gdy nic dalej w tym oknie nie ma — zostajemy.
    const zrobiony =
      opcje.przejdzGdyWypelnione?.[biezacy] &&
      widoczne.some((w) => w.cel === celBiezacego && w.wypelniony);
    if (zrobiony) {
      const dalej = kandydaci.find((k) => k.i > biezacy);
      if (dalej) return dalej.i;
    }
    // Człowiek jest tam, gdzie stoi bieżący krok — nie ruszamy go.
    return biezacy;
  }

  if (!kandydaci.length) return biezacy;

  // BIERZEMY KROK NAJBLIŻSZY TEMU, GDZIE CZŁOWIEK BYŁ — nie pierwszy z brzegu
  // do przodu.
  //
  // To jest błąd, który wyszedł na żywo: ktoś dodał pojazd i właściciela, okno
  // zlecenia się zamknęło, a na pustej liście widać było tylko „Nowe zlecenie"
  // (krok 1) i „Zakończone zlecenia" (krok 28). Reguła „pierwszy do przodu"
  // wybierała krok 28 — wprowadzenie skakało na koniec drogi i mówiło o
  // archiwum, zamiast odesłać człowieka do „Nowe zlecenie".
  //
  // Odległość od bieżącego kroku jest lepszą miarą niż kierunek: najbliższy
  // krok to ten z tego samego miejsca w pracy. Przy remisie idziemy do przodu.
  const doPrzodu = kandydaci.find((k) => k.i > biezacy);
  const doTylu = [...kandydaci].reverse().find((k) => k.i < biezacy);

  if (doPrzodu && doTylu) {
    return doPrzodu.i - biezacy <= biezacy - doTylu.i ? doPrzodu.i : doTylu.i;
  }
  if (doPrzodu) return doPrzodu.i;

  // Zostało tylko cofanie. Na zwykłym ekranie NIE cofamy się — inaczej po
  // wysłaniu SMS-a o odbiorze zamknięcie okna rzucałoby wprowadzenie z powrotem
  // na ikonę odbioru i człowiek klikałby ją w kółko.
  if (najglebiej === 0) return biezacy;
  // W oknie, do którego ktoś wrócił (np. poprawia dane klienta), zaczynamy od
  // pierwszego kroku TEGO okna.
  return kandydaci[0].i;
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
  _widoczne: WidocznyCel[],
): number {
  // „DALEJ" IDZIE O JEDEN KROK. ZAWSZE.
  //
  // Wcześniej ta funkcja próbowała być mądrzejsza: gdy cel następnego kroku nie
  // był widoczny, szukała dalej czegoś, co widać. Wychodziły z tego skoki, które
  // dla człowieka wyglądały na awarię — z kroku 2 na 10, z 27 na 35 — bo
  // „widoczne" jest na jednym ekranie kilkanaście rzeczy naraz i wyprzedzały one
  // to, czego człowiek jeszcze nie zrobił.
  //
  // Przewidywalność jest tu ważniejsza od sprytu: jeden klik to jeden krok.
  // Gdy krok dotyczy czegoś, czego akurat nie widać, dymek staje na środku
  // i mówi, dokąd wrócić — a ekran i tak poprawi krok, gdy człowiek tam trafi
  // (patrz wybierzKrok).
  return biezacy + 1;
}
