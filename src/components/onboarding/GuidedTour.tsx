import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { X, ArrowRight } from 'lucide-react';
import { wybierzKrok, nastepnyKrok, type WidocznyCel } from '@/components/onboarding/wyborKroku';

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
function widoczneCele(cele: Array<string | undefined>): WidocznyCel[] {
  const okna = Array.from(document.querySelectorAll('[role="dialog"]'));
  const wynik: WidocznyCel[] = [];
  for (const cel of cele) {
    if (!cel) continue;
    const el = document.querySelector(`[data-tour="${cel}"]`) as HTMLElement | null;
    if (!el || el.offsetParent === null) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const okno = el.closest('[role="dialog"]');
    wynik.push({ cel, glebokosc: okno ? okna.indexOf(okno) + 1 : 0, wypelniony: wypelnione(el) });
  }
  return wynik;
}

/**
 * Czy pole w podswietlonym miejscu jest juz wypelnione.
 *
 * Bierzemy PIERWSZE pole, bo w parze „Imie / Nazwisko" obowiazkowe jest imie,
 * a na nazwisko nikt nie ma obowiazku czekac.
 */
function wypelnione(el: HTMLElement): boolean {
  const pole = el.querySelector('input, textarea') as HTMLInputElement | null;
  // Nie ma czego wpisywac — bo wybrany klient zastapil pole wyszukiwania swoja
  // wizytowka. Skoro nie ma pola, to znaczy, ze rzecz jest juz zalatwiona.
  if (!pole) return true;
  return pole.value.trim().length > 0;
}

export function GuidedTour({ kroki, krok, onDalej, onZamknij, onKrok, pokazLicznik = true }: Props) {
  const biezacy = kroki[krok];
  const [obszar, setObszar] = useState<DOMRect | null>(null);
  // Ile miejsca zajmuje dymek — potrzebne, zeby go PRZYCIAC do ekranu. Bez tego
  // dlugi tekst wypychal przyciski „Dalej" i „Zamknij" pod dolna krawedz okna.
  const dymekRef = useRef<HTMLDivElement | null>(null);
  const [wysokoscDymka, setWysokoscDymka] = useState(0);

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
      if (!ed || ed.offsetParent === null) continue;
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
    const dopasuj = () => {
      if (Date.now() - wejscie < 2500) return;
      const trafiony = wybierzKrok(cele, krok, widoczneCele(cele), {
        przejdzGdyWypelnione: kroki.map((k) => !!k.przejdzGdyWypelnione),
        pokazGdySieZjawi: kroki.map((k) => !!k.pokazGdySieZjawi),
        pokazGdyWypelniony: kroki.map((k) => !!k.pokazGdyWypelniony),
      });
      if (trafiony !== krok) onKrok(trafiony);
    };

    const timer = window.setInterval(dopasuj, 400);
    return () => window.clearInterval(timer);
  }, [kroki, krok, onKrok]);

  // WYJŚCIE AWARYJNE DLA KROKÓW „KLIKNIJ".
  //
  // Taki krok czeka na kliknięcie w podświetlony element i celowo nie ma
  // przycisku „Dalej" — inaczej wprowadzenie byłoby pokazem slajdów. Ale gdy
  // element jest zasłonięty albo kliknięcia nie da się wykryć, człowiek zostaje
  // uwięziony. Po kilku sekundach pokazujemy więc „Dalej" jako furtkę.
  const [furtka, setFurtka] = useState(false);
  useEffect(() => {
    setFurtka(false);
    if (!biezacy?.czekaNaKlikniecie) return;
    const timer = window.setTimeout(() => setFurtka(true), 6000);
    return () => window.clearTimeout(timer);
  }, [krok, biezacy?.czekaNaKlikniecie]);

  // „Dalej" idzie po TYM SAMYM ekranie. Gdy następnego kroku nie widać (dotyczy
  // okna, które się jeszcze nie otworzyło), a na tym ekranie zostało coś do
  // pokazania — pokazujemy to, zamiast przeskakiwać w próżnię.
  const dalejPoEkranie = () => {
    if (!onKrok) { onDalej(); return; }
    const cele = kroki.map((k) => k.cel);
    const nastepny = nastepnyKrok(cele, krok, widoczneCele(cele));
    if (nastepny >= kroki.length) { onZamknij(); return; }
    onKrok(nastepny);
  };

  if (!biezacy) return null;

  // `pointer-events-auto` jest tu KONIECZNE. Okna modalne (Radix) na czas
  // otwarcia ustawiają `pointer-events: none` na całym dokumencie i przywracają
  // klikalność tylko wewnątrz siebie. Dymek wprowadzenia leży poza oknem, więc
  // bez tego przycisków „Dalej" i „Zamknij" NIE DA SIĘ kliknąć — wprowadzenie
  // zatrzymywało się na kroku z otwartym oknem zlecenia.
  const ciemne = 'fixed bg-black/60 z-[95] transition-all duration-200 pointer-events-auto';
  const dymekNaSrodku = !obszar;

  // GDZIE POSTAWIĆ DYMEK.
  //
  // Pierwszy wybór to BOK, nie „pod spodem": pod polem otwierają się listy
  // podpowiedzi (klienci, pojazdy) i przyciski lupki, a dymek je zasłaniał —
  // użytkownik widział podpowiedź „wpisz numer", ale nie mógł kliknąć wyszukania.
  // Dopiero gdy z boku nie ma miejsca, schodzimy pod cel albo nad niego.
  const SZEROKOSC = 320;
  // Wysokość dymka mierzymy PO wyrenderowaniu (patrz `wysokoscDymka`), bo zależy
  // od długości tekstu. Zanim ją poznamy, zakładamy typową.
  const wysokosc = wysokoscDymka || 260;
  const dolnaGranica = Math.max(12, window.innerHeight - wysokosc - 12);
  const przytnij = (y: number) => Math.min(Math.max(12, y), dolnaGranica);

  const styleDymka: React.CSSProperties = dymekNaSrodku
    ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    : (() => {
        const miejsceZPrawej = window.innerWidth - obszar!.right;
        const miejsceZLewej = obszar!.left;
        // PRZYCINAMY DO EKRANU — inaczej dymek z długim tekstem wychodzi dołem
        // poza okno i razem z nim znika przycisk „Dalej". Człowiek zostaje wtedy
        // z podpowiedzią, której nie da się zamknąć inaczej niż krzyżykiem, i
        // traci zaczęte zlecenie. To się wydarzyło na żywo.
        const gora = przytnij(obszar!.top - 20);
        if (miejsceZPrawej > SZEROKOSC + 24) return { top: gora, left: obszar!.right + 16 };
        if (miejsceZLewej > SZEROKOSC + 24) return { top: gora, left: obszar!.left - SZEROKOSC - 16 };
        // Z boku nie ma miejsca: schodzimy pod cel, a jeśli pod nim się nie mieści
        // — nad niego. W obu wypadkach i tak przycinamy do ekranu.
        const podSpodem = obszar!.bottom + wysokosc + 24 < window.innerHeight;
        return {
          top: przytnij(podSpodem ? obszar!.bottom + ODSTEP + 6 : obszar!.top - wysokosc - ODSTEP - 6),
          left: Math.min(Math.max(12, obszar!.left), window.innerWidth - SZEROKOSC - 12),
        };
      })();

  return createPortal(
    <>
      {obszar ? (
        <>
          <div className={ciemne} style={{ top: 0, left: 0, right: 0, height: Math.max(0, obszar.top - ODSTEP) }} />
          <div className={ciemne} style={{ top: obszar.bottom + ODSTEP, left: 0, right: 0, bottom: 0 }} />
          <div className={ciemne} style={{ top: obszar.top - ODSTEP, left: 0, width: Math.max(0, obszar.left - ODSTEP), height: obszar.height + ODSTEP * 2 }} />
          <div className={ciemne} style={{ top: obszar.top - ODSTEP, left: obszar.right + ODSTEP, right: 0, height: obszar.height + ODSTEP * 2 }} />
          {/* Ramka wokół dziury — sam brak przyciemnienia bywa niewidoczny na jasnym tle. */}
          <div
            className="fixed z-[96] rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent pointer-events-none animate-pulse"
            style={{ top: obszar.top - ODSTEP, left: obszar.left - ODSTEP, width: obszar.width + ODSTEP * 2, height: obszar.height + ODSTEP * 2 }}
          />
        </>
      ) : (
        <div className={ciemne} style={{ inset: 0 }} />
      )}

      <div
        ref={dymekRef}
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
          // Cel kroku jest schowany pod otwartym oknem (np. podglądem dokumentu).
          // Zamiast pozwolić „Dalej" iść w ciemno, mówimy, co zrobić.
          <p className="mt-2 text-xs text-muted-foreground">
            Zamknij otwarte okno, żeby wrócić do zlecenia — wprowadzenie podąży za Tobą.
          </p>
        )}
        </div>
        <div className="flex items-center justify-between mt-3 shrink-0">
          {pokazLicznik && <span className="text-[11px] text-muted-foreground">Krok {krok + 1} z {kroki.length}</span>}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onZamknij}>Zamknij</Button>
            {(!biezacy.czekaNaKlikniecie || furtka) && (
              <Button size="sm" variant={biezacy.czekaNaKlikniecie ? 'outline' : 'default'} onClick={dalejPoEkranie}>
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
