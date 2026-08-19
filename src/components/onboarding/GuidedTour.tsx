import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { X, ArrowRight, ArrowLeft } from 'lucide-react';
import { wybierzKrok, nastepnyKrok, type WidocznyCel } from '@/components/onboarding/wyborKroku';
import { pozycjaDymka } from '@/components/onboarding/pozycjaDymka';

/**
 * Wprowadzenie „pokaż palcem": przygaszony ekran, jedno jasne miejsce i dymek,
 * który tłumaczy, co się tam wpisuje.
 *
 * Po co osobny silnik zamiast gotowej biblioteki: kroki muszą czekać na to, aż
 * użytkownik NAPRAWDĘ coś zrobi (kliknie „Nowe zlecenie", wpisze numer, zapisze
 * zlecenie), a nie tylko kliknie „dalej". Warsztat ma po tym wprowadzeniu umieć
 * wystawić zlecenie, nie obejrzeć film o wystawianiu zleceń.
 *
 * Jak działa podświetlenie: cztery ciemne prostokąty dookoła celu zostawiają
 * w środku dziurę. To brzmi prymitywnie, ale działa wszędzie i nie wymaga masek
 * SVG ani przechwytywania kliknięć — kliknięcie w cel idzie do aplikacji tak
 * jak zwykle, bo nad celem nic nie leży.
 *
 * Element, na który pokazujemy, oznacza się w kodzie atrybutem
 * `data-tour="nazwa-kroku"`. Gdy elementu nie ma na ekranie (np. inna zakładka),
 * krok pokazuje sam dymek na środku — wprowadzenie nie może się zaciąć.
 */

export interface KrokTrasy {
  /** Wartość atrybutu data-tour elementu do podświetlenia. Brak = dymek na środku. */
  cel?: string;
  tytul: string;
  tresc: string;
  /** Podpowiedź o tym, co ma zrobić użytkownik (np. „Kliknij, żeby przejść dalej"). */
  akcja?: string;
  /** Gdy true, krok czeka na akcję użytkownika i nie pokazuje przycisku „Dalej". */
  czekaNaKlikniecie?: boolean;
  /**
   * Dodatkowe miejsca do podświetlenia razem z `cel`.
   *
   * Bywa, że jedna czynność wymaga dwóch rzeczy na raz: żeby wystawić dokument,
   * trzeba NAJPIERW zaznaczyć zlecenie, a potem kliknąć „Wystaw". Podświetlenie
   * samego przycisku mówi połowę prawdy i człowiek klika w martwy przycisk.
   */
  celeDodatkowe?: string[];
  /**
   * Krok schodzi dalej sam, gdy podświetlone pole zostanie wypełnione.
   *
   * Do par typu „imię i nazwisko → telefon", gdzie czekanie na „Dalej" w środku
   * jednego formularza jest zbędnym klikaniem. Nie używać tam, gdzie po wpisaniu
   * trzeba jeszcze coś nacisnąć (numer rejestracyjny → lupka).
   */
  przejdzGdyWypelnione?: boolean;
  /**
   * Krok przejmuje ekran, gdy jego miejsce się POJAWI (zielona ramka z danymi
   * z rejestru, otwarte menu „Wystaw"). Patrz wyborKroku.ts.
   */
  pokazGdySieZjawi?: boolean;
  /**
   * Krok przejmuje ekran, gdy jego miejsce zostanie WYPEŁNIONE (pola pojazdu po
   * sprawdzeniu numeru w rejestrze). Patrz wyborKroku.ts.
   */
  pokazGdyWypelniony?: boolean;
  /**
   * Ile milisekund krok ma stać nietknięty, zanim EKRAN dostanie prawo go zmienić.
   *
   * Powitalna podpowiedź znikała po sekundzie — ekran zmieniał się szybciej, niż
   * dało się ją przeczytać. Przy takim kroku trzeba dać czas na przeczytanie,
   * bo to on tłumaczy, po co w ogóle wpisywać SWOJE dane.
   */
  czasNaPrzeczytanie?: number;
  /**
   * Krok dzieje się NA LIŚCIE zleceń, nie w karcie.
   *
   * Kliknięcie „Dalej" zamyka wtedy otwartą kartę i wraca na listę, zamiast
   * kazać człowiekowi szukać strzałki „← Zlecenia". Tekst i tak o niej mówi,
   * ale sam powrót jest szybszy niż instrukcja.
   */
  wracajNaListe?: boolean;
  /**
   * „Dalej" NACISKA za człowieka to, o czym mówi krok.
   *
   * Prośba warsztatu brzmiała: „jak nacisnę Dalej, to niech system to zrobi
   * i mi pokaże". Ma to sens tam, gdzie krok opisuje jedno konkretne kliknięcie
   * (Nowe zlecenie, Rido Wycena, ikona kosztorysu, wybór statusu) — wtedy da się
   * przejść całą drogę samym „Dalej" i obejrzeć ją jak pokaz, zamiast szukać
   * przycisków po ekranie.
   *
   * NIE dla kroków, w których trzeba coś wpisać albo zdecydować — tam kliknięcie
   * za człowieka zapisałoby cudze dane.
   */
  dalejKlika?: boolean;
  /**
   * Co dokładnie ma nacisnąć „Dalej", jeśli to co innego niż `cel`.
   *
   * Krok o numerze rejestracyjnym podświetla POLE, a naciska „Utwórz nowy
   * pojazd" — bo to jest czynność, którą krok opisuje. Bez tego wprowadzenie
   * wpisywało numer i stało, a następny krok mówił o oknie, które się nie
   * otworzyło.
   */
  dalejKlikaCel?: string;
  /**
   * „Dalej" naciska SAM element z markerem, a nie przycisk w środku niego.
   *
   * 🔴 Wiersz zlecenia na liście otwiera kartę zlecenia kliknięciem w SIEBIE
   * (`onClick` na wierszu). W środku ma jednak pola do zaznaczania i listę
   * statusów, więc zwykłe szukanie „głównego przycisku" trafiało w nie, a
   * zlecenie się nie otwierało — dokładnie to, co człowiek robi ręcznie
   * jednym kliknięciem, „Dalej" robiło źle.
   */
  dalejKlikaWprost?: boolean;
  /**
   * „Dalej" najpierw ZAMYKA otwarte okno, a potem idzie dalej.
   *
   * Do kroków, które opisują podgląd (dokument, wydruk): dopóki okno stoi na
   * wierzchu, następny krok i tak nie ma czego pokazać, a człowiek musiał
   * zamykać je ręcznie, wracać przyciskiem „Wstecz" i dopiero iść dalej.
   */
  zamknijOkno?: boolean;
  /**
   * Podświetlenie MIGA — dla miejsc, w których łatwo przeoczyć, że to właśnie
   * tę pozycję trzeba kliknąć (np. „Gotowe do odbioru" na rozwiniętej liście).
   */
  mrugajCel?: boolean;
  /**
   * Krok STOI, dopóki człowiek nie kliknie „Dalej". Ekran go nie rusza.
   *
   * Powitanie znikało po pół sekundy, bo ekran zmieniał się szybciej, niż dało
   * się je przeczytać, a kolejne próby ratowania tego zegarem (2,5 s, potem
   * 20 s) myliły się raz w jedną, raz w drugą stronę. Zegar to zły pomysł:
   * jedyny pewny sygnał, że człowiek przeczytał, to jego kliknięcie.
   */
  czekajNaDalej?: boolean;
  /**
   * Przykładowe wartości, którymi „Dalej" wypełni PUSTE pola tego miejsca.
   *
   * Warsztat, który chce najpierw obejrzeć całą drogę, nie musi nic wymyślać:
   * klika „Dalej" i wprowadzenie wpisuje za niego przykład. Pól już wypełnionych
   * nie ruszamy — nikt nie chce, żeby jego wpis zniknął.
   */
  przykladoweWpisy?: string[];
  /**
   * Pole, którego NIE WOLNO pominąć — „Dalej" nie przejdzie, dopóki jest puste.
   *
   * Numer telefonu przy zleceniu próbnym musi wpisać sam warsztat: to na niego
   * pójdą SMS-y z przejścia. Podstawienie czegokolwiek za człowieka znaczyłoby
   * wysyłkę do przypadkowej osoby.
   */
  wymagane?: string;
}

interface Props {
  kroki: KrokTrasy[];
  krok: number;
  onDalej: () => void;
  onZamknij: () => void;
  /** Skok na krok wskazany przez EKRAN (patrz wyborKroku.ts). */
  onKrok?: (i: number) => void;
  /** Widoczne w dymku „krok 3 z 12". */
  pokazLicznik?: boolean;
  /** Zamyka otwartą kartę zlecenia — dla kroków z `wracajNaListe`. */
  onWrocNaListe?: () => void;
  /**
   * Wartości podstawiane w `przykladoweWpisy` pod tokeny `{{nazwa}}`.
   *
   * Numer telefonu warsztatu wpisujemy jako telefon klienta próbnego, żeby SMS-y
   * z tego przejścia trafiły do właściciela, a nie do przypadkowej osoby.
   */
  wartosci?: Record<string, string | undefined>;
}

const ODSTEP = 8;

/**
 * Cele obecne na ekranie wraz z informacja, jak „wysoko" leza.
 *
 * Okna modalne sa przenoszone na koniec dokumentu (portal), wiec okno pojazdu
 * NIE jest dzieckiem okna zlecenia — oba leza obok siebie. Liczenie zagniezdzenia
 * dawalo wiec obu te sama glebokosc i wprowadzenie pokazywalo krok z okna pod
 * spodem. Kolejnosc w dokumencie odpowiada kolejnosci otwierania, wiec ostatnie
 * okno jest tym na wierzchu.
 *
 * Pomijamy tez wszystko, co biblioteka ukryla przed czytnikami ekranu
 * (aria-hidden) — tak oznaczane jest tlo pod otwartym oknem.
 */
/**
 * Czy element jest naprawde widoczny.
 *
 * NIE `offsetParent !== null`, choc tak to tu wygladalo. Ta wlasciwosc zwraca
 * null takze dla elementow `position: fixed` — a wlasnie takie sa okna modalne.
 * Przez to okno Rido Wyceny bylo dla wprowadzenia niewidzialne: krok o nim nigdy
 * nie wchodzil, „Dalej" nie mial dokad isc i jedynym wyjsciem bylo Esc.
 */
function naEkranie(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function widoczneCele(cele: Array<string | undefined>): WidocznyCel[] {
  const okna = Array.from(document.querySelectorAll('[role="dialog"]'));
  const wynik: WidocznyCel[] = [];
  for (const cel of cele) {
    if (!cel) continue;
    const el = document.querySelector(`[data-tour="${cel}"]`) as HTMLElement | null;
    if (!el || !naEkranie(el)) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const okno = el.closest('[role="dialog"]');
    wynik.push({
      cel,
      glebokosc: okno ? okna.indexOf(okno) + 1 : 0,
      wypelniony: wypelnione(el, cel),
      maPole: !!el.querySelector('input, textarea'),
    });
  }
  return wynik;
}

/**
 * Czy pole w podswietlonym miejscu jest juz wypelnione — i CZY CZLOWIEK SKONCZYL.
 *
 * Bierzemy PIERWSZE pole, bo w parze „Imie / Nazwisko" obowiazkowe jest imie,
 * a na nazwisko nikt nie ma obowiazku czekac.
 *
 * Druga polowa jest wazniejsza od pierwszej. Poprzednia wersja uznawala pole za
 * wypelnione po PIERWSZEJ wpisanej literze, wiec ramka uciekala na „Zapisz"
 * w polowie wystukiwania numeru telefonu. Dlatego:
 *   - numer telefonu liczy sie dopiero przy komplecie cyfr (9),
 *   - dopoki kursor stoi w tym polu, dajemy sekunde i pol ciszy — dopiero
 *     wtedy uznajemy, ze to koniec pisania,
 *   - gdy kursor juz z pola wyszedl, nie ma na co czekac.
 */
const ostatniaTresc = new Map<string, { wartosc: string; czas: number }>();

/**
 * Przycisk, ktory NAPRAWDE wykonuje czynnosc.
 *
 * Pierwszy przycisk w kontenerze to zwykle „Anuluj" — wprowadzenie klikalo wiec
 * anulowanie zamiast zapisu i cala praca przepadala. Bierzemy ostatni przycisk,
 * a jesli jakis ma wyglad glowny (variant default), to jego.
 */
function przyciskGlowny(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  const przyciski = Array.from(el.querySelectorAll('button, a, [role="button"]')) as HTMLElement[];
  if (!przyciski.length) return el;
  const odrzuc = /anuluj|zamknij|cancel|pomiń|pomin/i;
  const sensowne = przyciski.filter((p) => !odrzuc.test(p.textContent || ''));
  return (sensowne[sensowne.length - 1] ?? przyciski[przyciski.length - 1]) || el;
}

function wypelnione(el: HTMLElement, klucz: string): boolean {
  const pole = el.querySelector('input, textarea') as HTMLInputElement | null;
  // Nie ma czego wpisywac — bo wybrany klient zastapil pole wyszukiwania swoja
  // wizytowka. Skoro nie ma pola, to znaczy, ze rzecz jest juz zalatwiona.
  if (!pole) return true;

  const wartosc = pole.value.trim();
  if (!wartosc) { ostatniaTresc.delete(klucz); return false; }

  const telefon = pole.type === 'tel' || /telefon|phone/i.test(pole.name + pole.placeholder);
  if (telefon && wartosc.replace(/\D/g, '').length < 9) return false;

  const teraz = Date.now();
  const poprzednia = ostatniaTresc.get(klucz);
  if (!poprzednia || poprzednia.wartosc !== wartosc) {
    ostatniaTresc.set(klucz, { wartosc, czas: teraz });
    return false;
  }

  const pisze = el.contains(document.activeElement);
  return !pisze || teraz - poprzednia.czas > 1500;
}

export function GuidedTour({ kroki, krok, onDalej, onZamknij, onKrok, onWrocNaListe, wartosci, pokazLicznik = true }: Props) {
  const biezacy = kroki[krok];
  const [obszar, setObszar] = useState<DOMRect | null>(null);
  // Ile miejsca zajmuje dymek — potrzebne, zeby go PRZYCIAC do ekranu. Bez tego
  // dlugi tekst wypychal przyciski „Dalej" i „Zamknij" pod dolna krawedz okna.
  const dymekRef = useRef<HTMLDivElement | null>(null);
  const [wysokoscDymka, setWysokoscDymka] = useState(0);
  // Czy w tym kroku czlowiek zrobil juz swoje i zostalo tylko nacisnac „Dalej".
  // Wtedy przycisk mruga — inaczej nie wiadomo, ze wprowadzenie czeka.
  const [czekaNaDalej, setCzekaNaDalej] = useState(false);
  // Czy czlowiek kliknal juz „Dalej" na kroku, ktory na to czeka.
  const [ruszony, setRuszony] = useState(false);
  // Komunikat „wpisz to, zanim pójdziemy dalej".
  const [brakuje, setBrakuje] = useState<string | null>(null);
  useEffect(() => { setBrakuje(null); }, [krok]);
  useEffect(() => { setRuszony(false); }, [krok]);
  // CZLOWIEK WAZNIEJSZY OD EKRANU.
  //
  // „Wstecz" cofalo krok, ale korektor ekranu natychmiast przywracal ten, ktory
  // pasuje do tego, co widac — wygladalo to, jakby przycisk liczyl od konca albo
  // w ogole nie dzialal. Po recznej zmianie kroku ekran ma sie nie odzywac przez
  // kilka sekund, zeby dalo sie przeczytac to, do czego sie wrocilo.
  const recznaZmiana = useRef(0);
  // Numer kroku widziany przez opoznione sprawdzenia (patrz nizej).
  const krokRef = useRef(krok);
  krokRef.current = krok;

  /**
   * KLIKNIĘCIE W TO, O CZYM MÓWI KROK, PRZESUWA WPROWADZENIE DALEJ.
   *
   * 🔴 NAPRAWIONE 19.08.2026. Dwa zgłoszenia z tej samej przyczyny:
   *   • po ręcznym wysłaniu SMS-a „Dalej" wysyłał go DRUGI RAZ, bo krok wciąż
   *     stał na tym samym przycisku,
   *   • po naciśnięciu „Zastosuj ceny" w Rido Wycenie okno się zamykało, a dymek
   *     zostawał na kroku o tym oknie i pokazywał „to jest na innym ekranie".
   *
   * Skoro człowiek zrobił to, o czym mówi krok, to ten krok jest zrobiony.
   * Patrzymy tylko na najbliższe kroki (bieżący i dwa następne) — inaczej
   * kliknięcie w status wewnątrz wiersza zlecenia katapultowałoby wprowadzenie
   * na koniec drogi.
   *
   * `naszKlik` odsiewa kliknięcia, które sami wykonaliśmy przyciskiem „Dalej" —
   * tam krok przesuwa już inna ścieżka i podwójne przejście gubiłoby jeden krok.
   */
  const naszKlik = useRef(false);
  useEffect(() => {
    if (!onKrok) return;
    const naKlik = (e: MouseEvent) => {
      if (naszKlik.current) { naszKlik.current = false; return; }
      const start = (e.target as HTMLElement | null)?.closest?.('[data-tour]') as HTMLElement | null;
      if (!start) return;

      // Element bywa opakowany w kilka markerów naraz (przycisk w oknie Rido).
      const nazwy = new Set<string>();
      let w: HTMLElement | null = start;
      while (w) {
        const n = w.getAttribute('data-tour');
        if (n) nazwy.add(n);
        w = w.parentElement?.closest('[data-tour]') as HTMLElement | null;
      }

      let zrobiony = -1;
      for (let i = krokRef.current; i <= Math.min(krokRef.current + 2, kroki.length - 1); i++) {
        const k = kroki[i];
        if ((k.cel && nazwy.has(k.cel)) || (k.dalejKlikaCel && nazwy.has(k.dalejKlikaCel))) zrobiony = i;
      }
      if (zrobiony < 0) return;

      const nastepny = zrobiony + 1;
      recznaZmiana.current = Date.now();
      if (nastepny >= kroki.length) { onZamknij(); return; }
      if (kroki[nastepny]?.wracajNaListe) onWrocNaListe?.();
      onKrok(nastepny);
    };
    document.addEventListener('click', naKlik, true);
    return () => document.removeEventListener('click', naKlik, true);
  }, [kroki, onKrok, onZamknij, onWrocNaListe]);

  const zmierz = useCallback(() => {
    if (!biezacy?.cel) { setObszar(null); return; }
    const el = document.querySelector(`[data-tour="${biezacy.cel}"]`) as HTMLElement | null;
    if (!el) { setObszar(null); return; }
    // BEZ plynnego przewijania: animacja trwala pol sekundy, wiec ramka
    // dojezdzala do celu juz po tym, jak czlowiek przeczytal dymek.
    el.scrollIntoView({ block: 'center', behavior: 'auto' });

    // PODŚWIETLAMY RAZEM Z TYM, CO Z ELEMENTU WYCHODZI.
    //
    // Lista podpowiedzi pod polem (pojazdy, klienci) jest pozycjonowana
    // bezwzględnie, więc NIE wchodzi do prostokąta rodzica — podświetlone
    // zostawało samo pole, a lista z „Utwórz nowy pojazd" lądowała w cieniu,
    // czyli dokładnie ta rzecz, którą trzeba kliknąć.
    const r = el.getBoundingClientRect();
    let gora = r.top, dol = r.bottom, lewo = r.left, prawo = r.right;

    // Miejsca dodatkowe (np. pole wyboru zlecenia przy „Wystaw") wchodzą do tego
    // samego podświetlenia — czynność wymaga obu naraz.
    for (const dodatkowy of biezacy.celeDodatkowe || []) {
      const ed = document.querySelector(`[data-tour="${dodatkowy}"]`) as HTMLElement | null;
      if (!ed || !naEkranie(ed)) continue;
      const rd = ed.getBoundingClientRect();
      gora = Math.min(gora, rd.top);
      dol = Math.max(dol, rd.bottom);
      lewo = Math.min(lewo, rd.left);
      prawo = Math.max(prawo, rd.right);
    }

    el.querySelectorAll('*').forEach((dziecko) => {
      const rd = (dziecko as HTMLElement).getBoundingClientRect();
      if (rd.width === 0 || rd.height === 0) return;
      // Bierzemy tylko to, co realnie wystaje poza rodzica (rozwinięte listy).
      gora = Math.min(gora, rd.top);
      dol = Math.max(dol, rd.bottom);
      lewo = Math.min(lewo, rd.left);
      prawo = Math.max(prawo, rd.right);
    });
    setObszar(new DOMRect(lewo, gora, prawo - lewo, dol - gora));
  }, [biezacy?.cel, biezacy?.celeDodatkowe]);

  useLayoutEffect(() => { zmierz(); }, [zmierz, krok]);

  useEffect(() => {
    if (!biezacy) return;
    // Pozycja celu zmienia się przy przewijaniu, zmianie rozmiaru okna
    // i po dorysowaniu treści — mierzymy ponownie, zamiast zamrażać.
    const odswiez = () => zmierz();
    window.addEventListener('scroll', odswiez, true);
    window.addEventListener('resize', odswiez);
    const timer = window.setInterval(odswiez, 120);
    return () => {
      window.removeEventListener('scroll', odswiez, true);
      window.removeEventListener('resize', odswiez);
      window.clearInterval(timer);
    };
  }, [zmierz, biezacy]);

  useLayoutEffect(() => {
    const zmierzDymek = () => {
      const h = dymekRef.current?.offsetHeight ?? 0;
      setWysokoscDymka((poprzednia) => (Math.abs(h - poprzednia) > 2 ? h : poprzednia));
    };
    zmierzDymek();
    const timer = window.setInterval(zmierzDymek, 300);
    window.addEventListener('resize', zmierzDymek);
    return () => { window.clearInterval(timer); window.removeEventListener('resize', zmierzDymek); };
  }, [krok]);

  // TO EKRAN DECYDUJE, KTORY KROK POKAZAC.
  //
  // Wprowadzenie bylo licznikiem, a praca w warsztacie licznikiem nie jest:
  // okno zlecenia otwiera okno pojazdu, to otwiera okno klienta, klient sie
  // zamyka i wracamy do pojazdu. Licznik zostawal wtedy w innym miejscu niz
  // czlowiek - dymek mowil o liscie zadan, a na wierzchu stalo okno pojazdu.
  //
  // Teraz co pol sekundy sprawdzamy, ktore cele sa na ekranie i jak gleboko
  // (ile okien modalnych je opakowuje), a decyzje podejmuje czysta funkcja
  // z wyborKroku.ts - przetestowana na calym przebiegu, bez przegladarki.
  useEffect(() => {
    if (!onKrok) return;
    const cele = kroki.map((k) => k.cel);

    // CHWILA NA PRZECZYTANIE. Ekran zmienia sie w ulamku sekundy po kliknieciu,
    // a podpowiedz ma byc przeczytana, nie mignac. Przez pierwsze 2,5 sekundy
    // krok zostaje na miejscu, nawet jesli ekran juz sie przelaczyl.
    const wejscie = Date.now();
    const cisza = kroki[krok]?.czasNaPrzeczytanie ?? 2500;
    const dopasuj = () => {
      // POWITANIE ZOSTAJE, DOPOKI SAM NIE PRZEJDZIESZ DALEJ.
      //
      // Ekran zmienia sie w ulamku sekundy po kliknieciu „Nowe zlecenie", a
      // pierwsza podpowiedz tlumaczy rzecz, bez ktorej cala reszta nie ma sensu:
      // ze wpisujemy WLASNE dane i wlasny numer. Zadne opoznienie tego nie
      // uratowalo, wiec krok zerowy jest po prostu poza zasiegiem korektora.
      const naEkranieTeraz = widoczneCele(cele);

      // KROK PIERWSZY stoi nieruchomo, dopóki NIE OTWORZY SIĘ ŻADNE OKNO.
      //
      // Dwie poprzednie wersje tej reguły były błędne z przeciwnych stron:
      // najpierw krok zerowy był całkiem poza zasięgiem korektora (powitanie
      // stało, ale po kliknięciu „Nowe zlecenie" wprowadzenie na nim zostawało),
      // potem trzymał się „dopóki widać jego cel" — a przycisk pod otwartym
      // oknem nadal ma swoje miejsce na ekranie, więc znowu nie przechodziło.
      //
      // Otwarte okno jest jednoznaczne: człowiek ruszył z miejsca.
      // KROK, KTORY CZEKA NA CZLOWIEKA. Zaden ekran go nie przestawi, dopoki
      // nie kliknie „Dalej" — patrz czekajNaDalej.
      if (kroki[krok]?.czekajNaDalej && !ruszony) return;

      // PILNE: rzeczy, które właśnie się pojawiły (okno Rido Wyceny, rozwinięta
      // lista statusów, podgląd dokumentu), przejmują ekran BEZ czekania —
      // inaczej okno stoi otwarte, a dymek jeszcze mówi o przycisku, który je
      // otworzył.
      const pilne =
        naEkranieTeraz.some((w) => {
          const i = cele.indexOf(w.cel);
          return i > krok && (kroki[i]?.pokazGdySieZjawi || kroki[i]?.pokazGdyWypelniony);
        });
      if (!pilne) {
        if (Date.now() - recznaZmiana.current < 5000) return;
        if (Date.now() - wejscie < cisza) return;
      }
      const wlasny = naEkranieTeraz.find((w) => w.cel === kroki[krok]?.cel);
      // Mruga tylko tam, gdzie BYLO co wpisac i zostalo to wpisane. Przy krokach
      // bez pola (przyciski, kolumny) „Dalej" jest jedyna droga i mruganie przez
      // caly czas byloby tylko halasem.
      setCzekaNaDalej(!!wlasny?.maPole && !!wlasny?.wypelniony);
      const trafiony = wybierzKrok(cele, krok, naEkranieTeraz, {
        przejdzGdyWypelnione: kroki.map((k) => !!k.przejdzGdyWypelnione),
        pokazGdySieZjawi: kroki.map((k) => !!k.pokazGdySieZjawi),
        pokazGdyWypelniony: kroki.map((k) => !!k.pokazGdyWypelniony),
      });
      if (trafiony !== krok) onKrok(trafiony);
    };

    const timer = window.setInterval(dopasuj, 120);
    return () => window.clearInterval(timer);
  }, [kroki, krok, onKrok, ruszony]);

  // KROKI „KLIKNIJ" TEŻ MAJĄ „DALEJ" — OD RAZU.
  //
  // Wcześniej przycisk pojawiał się dopiero po sześciu sekundach, żeby nie robić
  // z wprowadzenia pokazu slajdów. Skutek był odwrotny od zamierzonego: przy
  // kroku z kosztorysem widać było sam „Zamknij" i wyglądało to na zacięcie —
  // jedynym wyjściem było zamknięcie wprowadzenia. Lepiej dać wyjście od razu
  // i tylko wyciszyć wygląd przycisku tam, gdzie liczymy na kliknięcie w ekran.

  // „Dalej" idzie po TYM SAMYM ekranie. Gdy następnego kroku nie widać (dotyczy
  // okna, które się jeszcze nie otworzyło), a na tym ekranie zostało coś do
  // pokazania — pokazujemy to, zamiast przeskakiwać w próżnię.
  const dalejPoEkranie = () => {
    // Pole obowiązkowe: zamiast iść dalej, mówimy, czego brakuje.
    if (biezacy.wymagane && biezacy.cel) {
      const miejsce = document.querySelector(`[data-tour="${biezacy.cel}"]`) as HTMLElement | null;
      const pole = miejsce?.querySelector('input, textarea') as HTMLInputElement | null;
      if (pole && !pole.value.trim()) {
        setBrakuje(biezacy.wymagane);
        pole.focus();
        return;
      }
    }
    setBrakuje(null);
    recznaZmiana.current = Date.now();
    setRuszony(true);

    // Puste pola wypełniamy przykładem — żeby „Dalej" niczego nie blokowało.
    if (biezacy.przykladoweWpisy && biezacy.cel) {
      const miejsce = document.querySelector(`[data-tour="${biezacy.cel}"]`) as HTMLElement | null;
      const pola = Array.from(miejsce?.querySelectorAll('input, textarea') ?? []) as HTMLInputElement[];
      biezacy.przykladoweWpisy.forEach((surowy, i) => {
        const wpis = surowy.replace(/\{\{(\w[\w-]*)\}\}/g, (_, klucz) => wartosci?.[klucz] ?? '');
        const pole = pola[i];
        if (!pole || pole.value.trim() || !wpis) return;
        // React nie zauważa zwykłego `pole.value = ...` — trzeba użyć settera
        // z prototypu i ręcznie wywołać zdarzenie, inaczej stan komponentu
        // zostaje pusty i zlecenie i tak się nie zapisze.
        const setter = Object.getOwnPropertyDescriptor(
          pole instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(pole, wpis);
        pole.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    // Wpisanie przykładu i kliknięcie w jednym kroku: React musi zdążyć
    // przerysować listę (np. „Utwórz nowy pojazd" pojawia się po wpisaniu
    // numeru), więc klikamy z małym opóźnieniem.
    if (biezacy.przykladoweWpisy && (biezacy.dalejKlika || biezacy.dalejKlikaCel)) {
      const nazwa = biezacy.dalejKlikaCel || biezacy.cel;
      window.setTimeout(() => {
        const el = document.querySelector(`[data-tour="${nazwa}"]`) as HTMLElement | null;
        const cel = biezacy.dalejKlikaWprost || el?.matches('button, a, [role="button"]')
          ? el
          : przyciskGlowny(el);
        if (cel && naEkranie(cel)) { naszKlik.current = true; cel.click(); }
      }, 350);
      recznaZmiana.current = Date.now();
      setRuszony(true);
      return;
    }

    // Krok opisujący podgląd: zamykamy okno za człowieka. Radix zamyka się na
    // Escape, więc nie musimy szukać krzyżyka w każdym oknie z osobna.
    if (biezacy.zamknijOkno && document.querySelector('[role="dialog"]')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }

    // Krok „samoklikający": naciskamy jego cel i NIE przesuwamy kroku ręcznie —
    // ekran zmieni się sam, a wprowadzenie za nim podąży. Dzięki temu nie ma
    // rozjazdu między tym, co zrobił człowiek, a tym, co pokazuje dymek.
    if ((biezacy.dalejKlika || biezacy.dalejKlikaCel) && (biezacy.dalejKlikaCel || biezacy.cel)) {
      const nazwa = biezacy.dalejKlikaCel || biezacy.cel;
      const el = document.querySelector(`[data-tour="${nazwa}"]`) as HTMLElement | null;
      const doKlikniecia = biezacy.dalejKlikaWprost || el?.matches('button, a, [role="button"]')
        ? el
        : przyciskGlowny(el);
      if (doKlikniecia && naEkranie(doKlikniecia)) {
        naszKlik.current = true;
        doKlikniecia.click();
        // ZABEZPIECZENIE: klikniecie nie zawsze zmienia ekran — menu bywa juz
        // otwarte, a wtedy drugi klik je tylko zamyka. Bez tego „Dalej"
        // wygladalo na zepsute (najczesciej po powrocie przyciskiem „Wstecz").
        // Gdy po sekundzie i pol nic sie nie ruszylo, przechodzimy normalnie.
        const stad = krok;
        window.setTimeout(() => {
          if (krokRef.current !== stad || !onKrok) return;
          const teraz = kroki.map((k) => k.cel);
          const nastepny = nastepnyKrok(teraz, stad, widoczneCele(teraz));
          if (nastepny >= kroki.length) { onZamknij(); return; }
          if (kroki[nastepny]?.wracajNaListe) onWrocNaListe?.();
          onKrok(nastepny);
        }, 1500);
        return;
      }
    }

    if (!onKrok) { onDalej(); return; }
    const cele = kroki.map((k) => k.cel);
    const nastepny = nastepnyKrok(cele, krok, widoczneCele(cele));
    if (nastepny >= kroki.length) { onZamknij(); return; }
    // Krok z listy, a stoimy w karcie zlecenia — wracamy tam sami.
    if (kroki[nastepny]?.wracajNaListe) onWrocNaListe?.();
    onKrok(nastepny);
  };

  if (!biezacy) return null;

  // `pointer-events-auto` jest tu KONIECZNE. Okna modalne (Radix) na czas
  // otwarcia ustawiają `pointer-events: none` na całym dokumencie i przywracają
  // klikalność tylko wewnątrz siebie. Dymek wprowadzenia leży poza oknem, więc
  // bez tego przycisków „Dalej" i „Zamknij" NIE DA SIĘ kliknąć — wprowadzenie
  // zatrzymywało się na kroku z otwartym oknem zlecenia.
  const ciemne = 'fixed bg-black/60 z-[95] transition-all duration-200 pointer-events-auto';

  // TO ZAMYKALO OKNO ZLECENIA.
  //
  // Dymek i przyciemnienie leza POZA oknem modalnym (portal do body). Radix
  // nasluchuje wcisniecia myszy na calym dokumencie i wszystko, co nie jest
  // w srodku okna, traktuje jako „klikniecie obok" — czyli zamkniecie okna.
  // Nacisniecie „Dalej" kasowalo wiec zaczete zlecenie razem z wpisanymi
  // danymi. Zatrzymujemy zdarzenie, zanim dojdzie do dokumentu.
  const nieZamykajOkna = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
    onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
  };

  // PRZEWIJANIE PRZEZ PRZYCIEMNIENIE.
  //
  // Przyciemnienie zakrywa cale okno, wiec kolko myszy nad nim nie przewijalo
  // niczego: dolna czesc formularza (zdjecia, uszkodzenia, „Zapisz") byla nie
  // do osiagniecia. Przekazujemy ruch kolka do tego, co realnie sie przewija —
  // najczesciej do tresci otwartego okna.
  const przewinPodSpodem = (e: React.WheelEvent) => {
    const okna = document.querySelectorAll('[role="dialog"]');
    const okno = okna[okna.length - 1] as HTMLElement | undefined;
    const kandydaci: HTMLElement[] = [];
    if (okno) {
      kandydaci.push(okno);
      okno.querySelectorAll('*').forEach((el) => kandydaci.push(el as HTMLElement));
    }
    const przewijalny = kandydaci.find((el) => {
      const st = getComputedStyle(el);
      return /(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 4;
    });
    if (przewijalny) { przewijalny.scrollTop += e.deltaY; return; }
    window.scrollBy(0, e.deltaY);
  };
  const dymekNaSrodku = !obszar;

  // GDZIE POSTAWIĆ DYMEK — patrz pozycjaDymka.ts. Reguła jest tam, bo dopiero
  // jako czysta funkcja da się ją sprawdzić testem, a nie okiem użytkownika.
  const SZEROKOSC = 320;
  // Wysokość mierzymy PO wyrenderowaniu (zależy od długości tekstu). Zanim ją
  // poznamy, zakładamy typową.
  const wysokosc = wysokoscDymka || 260;

  const styleDymka: React.CSSProperties = dymekNaSrodku
    ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    : (() => {
        const { top, left } = pozycjaDymka({
          obszar: { top: obszar!.top, bottom: obszar!.bottom, left: obszar!.left, right: obszar!.right },
          szerokosc: SZEROKOSC,
          wysokosc,
          ekranW: window.innerWidth,
          ekranH: window.innerHeight,
          odstep: ODSTEP,
        });
        return { top, left };
      })();

  return createPortal(
    <>
      {obszar ? (
        <>
          <div className={ciemne} {...nieZamykajOkna} onWheel={przewinPodSpodem} style={{ top: 0, left: 0, right: 0, height: Math.max(0, obszar.top - ODSTEP) }} />
          <div className={ciemne} {...nieZamykajOkna} onWheel={przewinPodSpodem} style={{ top: obszar.bottom + ODSTEP, left: 0, right: 0, bottom: 0 }} />
          <div className={ciemne} {...nieZamykajOkna} onWheel={przewinPodSpodem} style={{ top: obszar.top - ODSTEP, left: 0, width: Math.max(0, obszar.left - ODSTEP), height: obszar.height + ODSTEP * 2 }} />
          <div className={ciemne} {...nieZamykajOkna} onWheel={przewinPodSpodem} style={{ top: obszar.top - ODSTEP, left: obszar.right + ODSTEP, right: 0, height: obszar.height + ODSTEP * 2 }} />
          {/* Ramka wokół dziury — sam brak przyciemnienia bywa niewidoczny na jasnym tle. */}
          <div
            className={`fixed z-[96] rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent pointer-events-none ${biezacy.mrugajCel ? 'miga-dalej' : 'animate-pulse'}`}
            style={{ top: obszar.top - ODSTEP, left: obszar.left - ODSTEP, width: obszar.width + ODSTEP * 2, height: obszar.height + ODSTEP * 2 }}
          />
        </>
      ) : (
        <div className={ciemne} {...nieZamykajOkna} onWheel={przewinPodSpodem} style={{ inset: 0 }} />
      )}

      <div
        ref={dymekRef}
        {...nieZamykajOkna}
        // max-h + przewijanie tresci: przyciski na dole maja byc widoczne ZAWSZE,
        // nawet przy dlugim opisie na niskim ekranie.
        className="fixed z-[97] flex max-h-[80vh] w-[320px] max-w-[92vw] flex-col rounded-xl border bg-background p-4 shadow-2xl pointer-events-auto"
        style={styleDymka}
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="font-semibold text-base">{biezacy.tytul}</h3>
          <button onClick={onZamknij} className="text-muted-foreground hover:text-foreground shrink-0" title="Zamknij wprowadzenie">
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Tekst czytany w biegu, często na ciemnym tle przygaszonego ekranu —
            `muted-foreground` zlewał się z tłem. Pełny kolor tekstu i większy
            odstęp między wierszami. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{biezacy.tresc}</p>
        {biezacy.akcja && (
          <p className="mt-2 text-xs font-medium text-primary">{biezacy.akcja}</p>
        )}
        {brakuje && (
          <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs font-medium text-destructive">
            {brakuje}
          </p>
        )}
        {dymekNaSrodku && (
          // Nie ma czego podświetlić. Dwa różne powody, więc dwie różne rady:
          // albo coś leży na wierzchu i trzeba to zamknąć, albo rzecz, o której
          // mowa, jest po prostu na innym ekranie.
          <p className="mt-2 text-xs text-muted-foreground">
            {document.querySelector('[role="dialog"]')
              ? 'Zamknij otwarte okno — wprowadzenie podąży za Tobą.'
              : biezacy.wracajNaListe
                ? 'To, o czym mowa, jest na liście zleceń. Wróć tam („← Zlecenia") — wprowadzenie podąży za Tobą.'
                /* Rada „wróć na listę" była wcześniej JEDYNA — także przy krokach,
                   które mieszkają w KARCIE zlecenia (pasek ikon, wycena, kosztorys).
                   Człowiek stał wtedy na liście, czytał „wróć na listę" i nie miał
                   dokąd pójść. */
                : 'To, o czym mowa, jest w karcie zlecenia. Otwórz zlecenie z listy — wprowadzenie podąży za Tobą.'}
          </p>
        )}
        </div>
        {/* Licznik nad przyciskami, nie obok. Przy trzech przyciskach („Wstecz",
            „Zamknij", „Dalej") w dymku szerokim na 320 px napis „Krok 23 z 37"
            wypychal „Dalej" poza ramke — to widac bylo na kazdym kroku. */}
        <div className="mt-3 shrink-0 space-y-2">
          {pokazLicznik && (
            <div className="text-[11px] text-muted-foreground">Krok {krok + 1} z {kroki.length}</div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {/* WSTECZ — zeby dalo sie wrocic do kroku, ktory przelecial za szybko
                albo ktorego sie nie doczytalo. Na pierwszym kroku nie ma dokad. */}
            {krok > 0 && onKrok && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { recznaZmiana.current = Date.now(); onKrok(krok - 1); }}
                title="Poprzedni krok"
                className="px-2"
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Wstecz
              </Button>
            )}
            <Button size="sm" variant="ghost" className="px-2" onClick={onZamknij}>Zamknij</Button>
            {/* „Dalej" jest ZAWSZE. Wczesniej na krokach czekajacych na
                klikniecie pojawial sie dopiero po kilku sekundach — czlowiek
                widzial sam „Zamknij" i myslal, ze wprowadzenie sie zacielo.
                Krok czekajacy dostaje slabszy wyglad, ale da sie go ominac od razu. */}
            {(
              <Button
                size="sm"
                variant={biezacy.czekaNaKlikniecie ? 'outline' : 'default'}
                onClick={dalejPoEkranie}
                // Mruga takze na kroku, ktory CZEKA na klikniecie — inaczej nie widac,
                // ze wprowadzenie nie ruszy bez tego przycisku.
                className={czekaNaDalej || biezacy.czekajNaDalej ? 'miga-dalej' : undefined}
              >
                Dalej <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
