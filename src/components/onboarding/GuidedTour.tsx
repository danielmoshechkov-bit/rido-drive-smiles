import { useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { X, ArrowRight } from 'lucide-react';

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
}

interface Props {
  kroki: KrokTrasy[];
  krok: number;
  onDalej: () => void;
  onZamknij: () => void;
  /** Widoczne w dymku „krok 3 z 12". */
  pokazLicznik?: boolean;
}

const ODSTEP = 8;

export function GuidedTour({ kroki, krok, onDalej, onZamknij, pokazLicznik = true }: Props) {
  const biezacy = kroki[krok];
  const [obszar, setObszar] = useState<DOMRect | null>(null);

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
  }, [biezacy?.cel]);

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

  // Kroki oznaczone `czekaNaKlikniecie` przechodzą dalej dopiero, gdy użytkownik
  // NAPRAWDĘ kliknie podświetlony element. Bez tego wprowadzenie zamieniłoby się
  // w pokaz slajdów: „dalej, dalej, dalej" i nikt nic nie umie.
  useEffect(() => {
    if (!biezacy?.czekaNaKlikniecie || !biezacy.cel) return;
    const el = document.querySelector(`[data-tour="${biezacy.cel}"]`);
    if (!el) return;
    const poKlikniecie = () => window.setTimeout(onDalej, 350); // dajemy oknu się otworzyć
    el.addEventListener('click', poKlikniecie);
    return () => el.removeEventListener('click', poKlikniecie);
  }, [biezacy, onDalej, krok]);

  // WPROWADZENIE IDZIE ZA UŻYTKOWNIKIEM, nie odwrotnie.
  //
  // Krok czekający na kliknięcie potrafił utknąć: przycisk „Nowe zlecenie"
  // bywa zasłonięty otwartym oknem (np. po ponownym włączeniu wprowadzenia
  // przy już otwartym zleceniu), więc kliknąć się go nie da i wprowadzenie
  // stoi w miejscu. Jeśli jednak cel NASTĘPNEGO kroku jest już na ekranie,
  // znaczy że użytkownik i tak jest dalej — przechodzimy za nim.
  const celNastepnego = kroki[krok + 1]?.cel;
  useEffect(() => {
    if (!celNastepnego) return;

    // Liczy się ZMIANA, nie stan. Jeśli cel następnego kroku był na ekranie już
    // w chwili wejścia w ten krok, nie jest żadnym dowodem, że użytkownik ruszył
    // dalej — a właśnie dlatego pierwsza podpowiedź znikała, zanim dało się ją
    // przeczytać: okno zlecenia bywa otwarte od początku.
    const bylOdRazu = !!document.querySelector(`[data-tour="${celNastepnego}"]`);
    const wejscie = Date.now();

    const sprawdz = () => {
      // Minimum czasu na ekranie. Podpowiedź, która mignęła, jest gorsza niż
      // jej brak: człowiek wie, że coś było, i nie wie co.
      if (Date.now() - wejscie < 1500) return;
      const jest = !!document.querySelector(`[data-tour="${celNastepnego}"]`);
      if (!jest) return;
      if (bylOdRazu) {
        // Cel następnego kroku był tu od początku — przechodzimy tylko wtedy,
        // gdy celu BIEŻĄCEGO już nie ma (użytkownik zamknął okno, zmienił ekran).
        const celTegoKroku = biezacy?.cel
          ? document.querySelector(`[data-tour="${biezacy.cel}"]`)
          : null;
        if (celTegoKroku) return;
      }
      onDalej();
    };

    const timer = window.setInterval(sprawdz, 400);
    return () => window.clearInterval(timer);
  }, [biezacy, celNastepnego, onDalej, krok]);

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
  const styleDymka: React.CSSProperties = dymekNaSrodku
    ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    : (() => {
        const miejsceZPrawej = window.innerWidth - obszar!.right;
        const miejsceZLewej = obszar!.left;
        const gora = Math.min(
          Math.max(12, obszar!.top - 20),
          Math.max(12, window.innerHeight - 240),
        );
        if (miejsceZPrawej > SZEROKOSC + 24) return { top: gora, left: obszar!.right + 16 };
        if (miejsceZLewej > SZEROKOSC + 24) return { top: gora, left: obszar!.left - SZEROKOSC - 16 };
        const podSpodem = obszar!.bottom + 220 < window.innerHeight;
        return {
          top: podSpodem ? obszar!.bottom + ODSTEP + 6 : Math.max(12, obszar!.top - 210),
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
        className="fixed z-[97] w-[320px] max-w-[92vw] rounded-xl border bg-background p-4 shadow-2xl pointer-events-auto"
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
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{biezacy.tresc}</p>
        {biezacy.akcja && (
          <p className="mt-2 text-xs font-medium text-primary">{biezacy.akcja}</p>
        )}
        <div className="flex items-center justify-between mt-3">
          {pokazLicznik && <span className="text-[11px] text-muted-foreground">Krok {krok + 1} z {kroki.length}</span>}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onZamknij}>Zamknij</Button>
            {(!biezacy.czekaNaKlikniecie || furtka) && (
              <Button size="sm" variant={biezacy.czekaNaKlikniecie ? 'outline' : 'default'} onClick={onDalej}>
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
