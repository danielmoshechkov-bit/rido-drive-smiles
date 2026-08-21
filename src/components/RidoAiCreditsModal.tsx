import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Wrench, Stethoscope, ShoppingCart } from 'lucide-react';
import { DoladowanieModal } from '@/components/billing/DoladowanieModal';

/**
 * Co kryje się pod licznikiem Rido AI.
 *
 * Doładowania jeszcze nie ma — warsztat prosił, żeby najpierw pojawił się sam
 * licznik, a sprzedaż pakietów dołożyć później. Dlatego okno na razie tylko
 * tłumaczy, skąd bierze się ta liczba i co ją zmniejsza. Kupowanie wejdzie tu,
 * gdy ceny pakietów zostaną ustalone — bez przebudowy, bo licznik i pula już
 * działają tak samo jak przy SMS-ach i sprawdzeniach pojazdu.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = plan bez limitu, `undefined` = jeszcze nie wiadomo. */
  dostepne: number | null | undefined;
}

export function RidoAiCreditsModal({ open, onOpenChange, dostepne }: Props) {
  const bezLimitu = dostepne === null;
  const [doladowanie, setDoladowanie] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Rido AI
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 text-center">
            <p className="text-3xl font-bold text-primary">
              {bezLimitu ? '∞' : (dostepne ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {bezLimitu ? 'Twój plan nie ma limitu pytań' : 'pytań zostało w tym miesiącu'}
            </p>
          </div>

          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Z tej samej puli idą dwie rzeczy:</p>

            <div className="flex gap-3">
              <Wrench className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Rido Wycena</p>
                <p className="text-xs text-muted-foreground">
                  Podpowiedź kwot w kosztorysie — jedno pytanie za każde wywołanie.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Stethoscope className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Pomoc RIDO AI</p>
                <p className="text-xs text-muted-foreground">
                  Pytania o diagnostykę i naprawę. Funkcja jeszcze niedostępna —
                  gdy ruszy, będzie liczona z tego samego licznika.
                </p>
              </div>
            </div>
          </div>

          {/*
            DOKUPIENIE NIE ZASTĘPUJE PLANU — DOKŁADA SIĘ DO NIEGO.
            Pakiet ma być doładowaniem awaryjnym w miesiącu, w którym limit
            skończył się wcześniej, a nie tańszą drogą naokoło abonamentu.
            Dlatego 200 pytań, a nie 500: Pro daje 300 w cenie planu.
          */}
          {!bezLimitu && (
            <Button className="w-full gap-2" onClick={() => setDoladowanie(true)}>
              <ShoppingCart className="h-4 w-4" /> Dokup 200 pytań — 49,20 zł
            </Button>
          )}

          <p className="text-xs text-muted-foreground border-t pt-3">
            Limit z planu odnawia się co miesiąc razem z abonamentem. Dokupione
            pytania są bezterminowe i zużywają się dopiero po wyczerpaniu limitu
            z planu.
          </p>
        </div>
      </DialogContent>

      <DoladowanieModal
        open={doladowanie}
        onOpenChange={setDoladowanie}
        productCode="rido_ai"
        tytul="Dokup pytania do Rido AI"
        jednostka="pytań"
      />
    </Dialog>
  );
}
