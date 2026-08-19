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

  const celBiezacegoNaWierzchu = !!cele[biezacy] && naWierzchu.has(cele[biezacy]!);

  /**
   * Czy stoimy JUŻ na kroku, który sam pojawił się razem z tym, co widać.
   *
   * 🔴 NAPRAWIONE 19.08.2026. Lista statusów zawiera i „Gotowe do odbioru"
   * (krok 30), i „Zakończone" (krok 36) — obie pozycje mają regułę „pokaż, gdy
   * się zjawi". Po otwarciu tej listy na kroku 30 reguła szukała czegoś
   * DALSZEGO i znajdowała krok 36: wprowadzenie przeskakiwało na sam koniec,
   * omijając powiadomienie o gotowym aucie, odbiór i wystawienie dokumentu.
   *
   * Zasada: gdy bieżący krok sam jest krokiem „pojawiającym się" i jego cel
   * widać na wierzchu, to jesteśmy dokładnie tam, gdzie trzeba — nic dalszego
   * z tego samego menu nas stąd nie zabierze.
   */
  const stoimyNaSwiezym = celBiezacegoNaWierzchu && !!opcje.pokazGdySieZjawi?.[biezacy];

  /**
   * ILE KROKÓW DO PRZODU WOLNO PRZESKOCZYĆ, GDY COŚ SIĘ POJAWI.
   *
   * 🔴 NAPRAWIONE 19.08.2026. Reguła „pokaż, gdy się zjawi" opisuje rzecz,
   * którą człowiek WŁAŚNIE wywołał — a to zawsze leży o krok, najwyżej dwa
   * dalej. Bez ograniczenia jedno otwarte menu potrafiło przenieść
   * wprowadzenie o sześć kroków: lista statusów zawiera i „Gotowe do odbioru"
   * (30), i „Zakończone" (36), więc jej otwarcie w okolicy kroku 30 lądowało
   * na 36 — z pominięciem powiadomienia o gotowym aucie, odbioru auta
   * i wystawienia dokumentu.
   *
   * Samo oznaczanie tylko tego statusu, który jest na kolei, nie wystarcza:
   * w chwili kliknięcia „Gotowe do odbioru" status zmienia się na gotowy,
   * a menu jeszcze się zamyka — cel kroku 36 mignąłby na ułamek sekundy
   * i to wystarczyłoby do przeskoku.
   *
   * Otwarcie czegoś może przesunąć o krok. Nie może przenieść na koniec drogi.
   */
  const ZASIEG_ZJAWIENIA = 3;

  // Coś się właśnie pojawiło i samo prosi o opis (zielona ramka z danymi,
  // otwarte menu „Wystaw") — idziemy za tym, nawet jeśli bieżący krok wciąż widać.
  const zjawilSie = stoimyNaSwiezym
    ? undefined
    : kandydaci.find(
        (k) => k.i > biezacy && k.i - biezacy <= ZASIEG_ZJAWIENIA && opcje.pokazGdySieZjawi?.[k.i],
      );
  if (zjawilSie) return zjawilSie.i;

  // To samo, ale dla miejsc, które stoją puste do czasu, aż coś je wypełni
  // (pola pojazdu po sprawdzeniu numeru w rejestrze).
  const wypelnilSie = stoimyNaSwiezym ? undefined : kandydaci.find(
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
  /**
   * KROK, KTÓREGO MIEJSCE POJAWIA SIĘ NA ŻĄDANIE, JEST BRAMKĄ — NIE WOLNO GO MINĄĆ.
   *
   * 🔴 NAPRAWIONE 19.08.2026. Zgłoszone z testów: wprowadzenie pokazywało
   * „zmień status na gotowe", potem „wystaw dokument" — i od razu przeskakiwało
   * do opisu zakładki „Zakończone zlecenia", POMIJAJĄC krok, w którym zaznacza
   * się status „Zakończone". Czyli dokładnie tę czynność, o którą chodzi.
   *
   * Mechanizm: pozycja „Zakończone" istnieje tylko przy ROZWINIĘTEJ liście
   * statusów, a zakładka „Zakończone zlecenia" stoi na ekranie zawsze. Po
   * zamknięciu podglądu dokumentu korektor widział więc tylko tę drugą i szedł
   * prosto do niej.
   *
   * Zasada: krok z regułą „pokaż, gdy się zjawi" opisuje rzecz, którą człowiek
   * musi dopiero wywołać. Dopóki jej nie wywoła, wprowadzenie czeka przed nim,
   * a nie przeskakuje dalej po tym, co akurat widać.
   */
  const bramka = cele.findIndex((_, i) => i > biezacy && opcje.pokazGdySieZjawi?.[i]);
  const zaBramka = bramka === -1 ? Infinity : bramka;

  const doPrzoduDowolny = kandydaci.find((k) => k.i > biezacy);
  // Za bramkę nie idziemy — ale to, że ona blokuje, nie może unieruchomić
  // wprowadzenia. Gdy przód jest zamknięty, a za plecami jest dokąd wrócić
  // (zamknięte okno zlecenia, pusta lista), wracamy — patrz niżej.
  const doPrzodu = doPrzoduDowolny && doPrzoduDowolny.i <= zaBramka ? doPrzoduDowolny : undefined;
  const doTylu = [...kandydaci].reverse().find((k) => k.i < biezacy);

  if (doPrzodu && doTylu) {
    return doPrzodu.i - biezacy <= biezacy - doTylu.i ? doPrzodu.i : doTylu.i;
  }
  if (doPrzodu) return doPrzodu.i;

  // Przód zamknięty bramką, ale jest dokąd wrócić: człowiek zamknął okno
  // i wylądował na ekranie, na którym widać tylko wcześniejsze kroki.
  if (doTylu && doPrzoduDowolny) return doTylu.i;

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

/**
 * Czy korektę kroku wolno już zastosować.
 *
 * Wydzielone z GuidedTour, żeby dało się to sprawdzić testem — reszta pliku
 * istnieje z tego samego powodu.
 *
 * 🔴 Powód: po naciśnięciu „Wyślij SMS" wprowadzenie wracało na sam POCZĄTEK.
 * Okno zlecenia zamyka się natychmiast, a lista dopiero dociąga swój wiersz;
 * przez tę jedną chwilę widać tylko „Nowe zlecenie", czyli cel kroku
 * pierwszego. Ekran w trakcie przerysowania nie jest odpowiedzią na pytanie
 * „gdzie jest człowiek".
 *
 * Dlatego korekta wchodzi dopiero wtedy, gdy ta sama propozycja utrzyma się
 * przez `prog` milisekund. Wyjątek: rzeczy, które właśnie się zjawiły
 * (otwarte okno, rozwinięte menu) — te wchodzą natychmiast, bo to człowiek
 * je przed chwilą otworzył.
 */
export function czyZastosowacKorekte(
  poprzednia: { krok: number; od: number } | null,
  trafiony: number,
  teraz: number,
  pilne: boolean,
  prog = 500,
): { zastosuj: boolean; propozycja: { krok: number; od: number } | null } {
  if (pilne) return { zastosuj: true, propozycja: null };
  if (poprzednia?.krok !== trafiony) {
    return { zastosuj: false, propozycja: { krok: trafiony, od: teraz } };
  }
  if (teraz - poprzednia.od < prog) return { zastosuj: false, propozycja: poprzednia };
  return { zastosuj: true, propozycja: null };
}
