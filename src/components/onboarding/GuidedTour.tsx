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
    setObszar(el.getBoundingClientRect());
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

  if (!biezacy) return null;

  const ciemne = 'fixed bg-black/60 z-[95] transition-all duration-200';
  const dymekNaSrodku = !obszar;

  const styleDymka: React.CSSProperties = dymekNaSrodku
    ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    : (() => {
        const podSpodem = obszar!.bottom + 180 < window.innerHeight;
        const gora = podSpodem ? obszar!.bottom + ODSTEP + 6 : Math.max(12, obszar!.top - 190);
        const lewa = Math.min(Math.max(12, obszar!.left), window.innerWidth - 340);
        return { top: gora, left: lewa };
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
        className="fixed z-[97] w-[320px] max-w-[92vw] rounded-xl border bg-background p-4 shadow-2xl"
        style={styleDymka}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-sm">{biezacy.tytul}</h3>
          <button onClick={onZamknij} className="text-muted-foreground hover:text-foreground shrink-0" title="Zamknij wprowadzenie">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground whitespace-pre-line">{biezacy.tresc}</p>
        {biezacy.akcja && (
          <p className="mt-2 text-xs font-medium text-primary">{biezacy.akcja}</p>
        )}
        <div className="flex items-center justify-between mt-3">
          {pokazLicznik && <span className="text-[11px] text-muted-foreground">Krok {krok + 1} z {kroki.length}</span>}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onZamknij}>Zamknij</Button>
            {!biezacy.czekaNaKlikniecie && (
              <Button size="sm" onClick={onDalej}>
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
