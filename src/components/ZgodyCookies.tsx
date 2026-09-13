import * as React from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Kategoria,
  ODMOWA,
  OPIS_KATEGORII,
  Wybor,
  ZGODA_PELNA,
  aktualnyWybor,
  odczytajZgode,
  przywrocZgodeNaStarcie,
  zapiszZgode,
} from "@/lib/zgody";

/**
 * Baner zgód na cookies — wąski pasek, nie nakładka.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO ODMOWA JEST NA PIERWSZYM EKRANIE
 * ═══════════════════════════════════════════════════════════════════════════
 * Nie z uprzejmości. CNIL ukarał Google na 150 mln € i Facebooka na 60 mln €
 * dokładnie za to, że zgoda była jednym kliknięciem, a odmowa wymagała wejścia
 * w ustawienia. „Odrzuć" musi być tak samo dostępny jak „Akceptuję wszystkie"
 * — obok, na tym samym ekranie, jedno kliknięcie.
 *
 * Domyślnie zaznaczone zgody są niedozwolone (TSUE, Planet49), więc wszystkie
 * przełączniki poza niezbędnymi startują wyłączone — także po wejściu
 * w „Ustawienia".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CZEGO TEN KOMPONENT NIE ROBI
 * ═══════════════════════════════════════════════════════════════════════════
 * Nie ładuje żadnego skryptu. Stan trzyma `src/lib/zgody.ts`, a piksel
 * i analityka same go subskrybują. Gdyby baner ładował skrypty, drugie miejsce
 * z tą samą decyzją powstałoby przy pierwszej nowej integracji.
 */

/** Kolejność w ustawieniach — niezbędne pierwsze, bo są bez wyboru. */
const KOLEJNOSC: Kategoria[] = ["niezbedne", "analityczne", "marketingowe", "personalizacja"];

/**
 * Otwarcie ustawień z dowolnego miejsca (odnośnik w stopce).
 *
 * Zdarzenie zamiast kontekstu: stopka renderuje się w innych poddrzewach niż
 * baner, a dokładanie providera obejmującego całą aplikację dla jednego
 * odnośnika byłoby drożej niż warto.
 */
export const ZDARZENIE_OTWORZ_ZGODY = "getrido:otworz-zgody";

export function otworzUstawieniaZgod(): void {
  window.dispatchEvent(new CustomEvent(ZDARZENIE_OTWORZ_ZGODY));
}

export function ZgodyCookies() {
  const [pokazPasek, setPokazPasek] = React.useState(false);
  const [ustawienia, setUstawienia] = React.useState(false);
  const [robocze, setRobocze] = React.useState<Wybor>(ODMOWA);

  React.useEffect(() => {
    // Wracający użytkownik: `index.html` wysłał już odmowę, tu ją poprawiamy
    // na to, co naprawdę wybrał.
    przywrocZgodeNaStarcie();
    setPokazPasek(odczytajZgode() === null);
  }, []);

  React.useEffect(() => {
    const otworz = () => {
      setRobocze(aktualnyWybor());
      setUstawienia(true);
    };
    window.addEventListener(ZDARZENIE_OTWORZ_ZGODY, otworz);
    return () => window.removeEventListener(ZDARZENIE_OTWORZ_ZGODY, otworz);
  }, []);

  const rozstrzygnij = (wybor: Wybor) => {
    zapiszZgode(wybor);
    setPokazPasek(false);
    setUstawienia(false);
  };

  return (
    <>
      {pokazPasek && (
        <div
          role="dialog"
          aria-label="Zgoda na pliki cookies"
          // `pointer-events-none` na otoczce + `auto` na pasku: baner NIE
          // blokuje strony, można ją czytać i przewijać z banerem na dole.
          className="fixed inset-x-0 bottom-0 z-[60] pointer-events-none p-3 sm:p-4"
        >
          <div className="pointer-events-auto mx-auto flex max-w-5xl flex-col gap-3 rounded-lg border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:gap-4">
            <p className="flex-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Używamy plików cookies. Niezbędne są zawsze włączone; analityczne
              i marketingowe — tylko za Twoją zgodą.{" "}
              <a
                href="/prawne?tab=polityka"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Polityka prywatności
              </a>
            </p>

            {/* Trzy przyciski OBOK SIEBIE. „Odrzuć" nie chowa się w ustawieniach. */}
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRobocze(ODMOWA);
                  setUstawienia(true);
                }}
              >
                Ustawienia
              </Button>
              <Button variant="outline" size="sm" onClick={() => rozstrzygnij(ODMOWA)}>
                Odrzuć
              </Button>
              <Button size="sm" onClick={() => rozstrzygnij(ZGODA_PELNA)}>
                Akceptuję wszystkie
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={ustawienia} onOpenChange={setUstawienia}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ustawienia cookies</DialogTitle>
            <DialogDescription>
              Zgodę na każdą kategorię możesz wycofać w dowolnym momencie — tym
              samym oknem, z odnośnika w stopce.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {KOLEJNOSC.map((kategoria) => {
              const opis = OPIS_KATEGORII[kategoria];
              const niezbedna = kategoria === "niezbedne";
              return (
                <div
                  key={kategoria}
                  className="flex items-start justify-between gap-4 rounded-md border border-border p-3"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">{opis.nazwa}</p>
                    <p className="text-xs text-muted-foreground">{opis.opis}</p>
                  </div>
                  <Switch
                    checked={niezbedna ? true : robocze[kategoria]}
                    disabled={niezbedna}
                    aria-label={opis.nazwa}
                    onCheckedChange={(czy) =>
                      setRobocze((p) => ({ ...p, [kategoria]: czy }))
                    }
                  />
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" size="sm" onClick={() => rozstrzygnij(ODMOWA)}>
              Odrzuć wszystkie
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => rozstrzygnij(robocze)}>
                Zapisz wybór
              </Button>
              <Button size="sm" onClick={() => rozstrzygnij(ZGODA_PELNA)}>
                Akceptuję wszystkie
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ZgodyCookies;
