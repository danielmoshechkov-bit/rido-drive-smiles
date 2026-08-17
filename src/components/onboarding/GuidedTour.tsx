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

export function GuidedTour({ kroki, krok, onDalej, onZamknij, onKrok, onWrocNaListe, pokazLicznik = true }: Props) {
  const biezacy = kroki[krok];
  const [obszar, setObszar] = useState<DOMRect | null>(null);
  // Ile miejsca zajmuje dymek — potrzebne, zeby go PRZYCIAC do ekranu. Bez tego
  // dlugi tekst wypychal przyciski „Dalej" i „Zamknij" pod dolna krawedz okna.
  const dymekRef = useRef<HTMLDivElement | null>(null);
  const [wysokoscDymka, setWysokoscDymka] = useState(0);
  // Czy w tym kroku czlowiek zrobil juz swoje i zostalo tylko nacisnac „Dalej".
  // Wtedy przycisk mruga — inaczej nie wiadomo, ze wprowadzenie czeka.
  const [czekaNaDalej, setCzekaNaDalej] = useState(false);
  // CZLOWIEK WAZNIEJSZY OD EKRANU.
  //
  // „Wstecz" cofalo krok, ale korektor ekranu natychmiast przywracal ten, ktory
  // pasuje do tego, co widac — wygladalo to, jakby przycisk liczyl od konca albo
  // w ogole nie dzialal. Po recznej zmianie kroku ekran ma sie nie odzywac przez
  // kilka sekund, zeby dalo sie przeczytac to, do czego sie wrocilo.
  const recznaZmiana = useRef(0);

  const zmierz = useCallback(() => {
    if (!biezacy?.cel) { setObszar(null); return; }
    const el = document.querySelector(`[data-tour="${biezacy.cel}"]`) as HTMLElement | null;
    if (!el) { setObszar(null); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });

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
    const timer = window.setInterval(odswiez, 600);
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

      // KROK PIERWSZY stoi nieruchomo, dopóki widać jego cel („Nowe zlecenie").
      // Gdy cel zniknie — bo otworzyło się okno zlecenia — przechodzimy dalej.
      // Wcześniej krok zerowy był całkiem poza zasięgiem korektora i po
      // kliknięciu „Nowe zlecenie" wprowadzenie zostawało na powitaniu.
      if (krok === 0 && naEkranieTeraz.some((w) => w.cel === cele[0])) return;

      // PILNE: rzeczy, które właśnie się pojawiły (okno Rido Wyceny, rozwinięta
      // lista statusów, podgląd dokumentu), przejmują ekran BEZ czekania —
      // inaczej okno stoi otwarte, a dymek jeszcze mówi o przycisku, który je
      // otworzył.
      const pilne = naEkranieTeraz.some((w) => {
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

    const timer = window.setInterval(dopasuj, 400);
    return () => window.clearInterval(timer);
  }, [kroki, krok, onKrok]);

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
    recznaZmiana.current = Date.now();

    // Krok „samoklikający": naciskamy jego cel i NIE przesuwamy kroku ręcznie —
    // ekran zmieni się sam, a wprowadzenie za nim podąży. Dzięki temu nie ma
    // rozjazdu między tym, co zrobił człowiek, a tym, co pokazuje dymek.
    if (biezacy.dalejKlika && biezacy.cel) {
      const el = document.querySelector(`[data-tour="${biezacy.cel}"]`) as HTMLElement | null;
      const doKlikniecia = el?.matches('button, a, [role="button"]')
        ? el
        : (el?.querySelector('button, a, [role="button"]') as HTMLElement | null) ?? el;
      if (doKlikniecia && naEkranie(doKlikniecia)) {
        doKlikniecia.click();
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
            className="fixed z-[96] rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent pointer-events-none animate-pulse"
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
        {dymekNaSrodku && (
          // Nie ma czego podświetlić. Dwa różne powody, więc dwie różne rady:
          // albo coś leży na wierzchu i trzeba to zamknąć, albo rzecz, o której
          // mowa, jest po prostu na innym ekranie.
          <p className="mt-2 text-xs text-muted-foreground">
            {document.querySelector('[role="dialog"]')
              ? 'Zamknij otwarte okno — wprowadzenie podąży za Tobą.'
              : 'To, o czym mowa, jest na innym ekranie. Wróć na listę zleceń („← Zlecenia") — wprowadzenie podąży za Tobą.'}
          </p>
        )}
        </div>
        <div className="flex items-center justify-between mt-3 shrink-0">
          {pokazLicznik && <span className="text-[11px] text-muted-foreground">Krok {krok + 1} z {kroki.length}</span>}
          <div className="flex gap-2">
            {/* WSTECZ — zeby dalo sie wrocic do kroku, ktory przelecial za szybko
                albo ktorego sie nie doczytalo. Na pierwszym kroku nie ma dokad. */}
            {krok > 0 && onKrok && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { recznaZmiana.current = Date.now(); onKrok(krok - 1); }}
                title="Poprzedni krok"
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Wstecz
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onZamknij}>Zamknij</Button>
            {/* „Dalej" jest ZAWSZE. Wczesniej na krokach czekajacych na
                klikniecie pojawial sie dopiero po kilku sekundach — czlowiek
                widzial sam „Zamknij" i myslal, ze wprowadzenie sie zacielo.
                Krok czekajacy dostaje slabszy wyglad, ale da sie go ominac od razu. */}
            {(
              <Button
                size="sm"
                variant={biezacy.czekaNaKlikniecie ? 'outline' : 'default'}
                onClick={dalejPoEkranie}
                className={czekaNaDalej ? 'miga-dalej' : undefined}
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
