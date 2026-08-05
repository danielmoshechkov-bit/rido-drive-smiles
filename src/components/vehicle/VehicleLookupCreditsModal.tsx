import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Clock, Search } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Zostaje w interfejsie, choć chwilowo nieużywany — wszystkie miejsca wywołania
   * przekazują swój handler i przy uruchomieniu billingu wracamy do niego bez
   * ruszania siedmiu komponentów.
   */
  onPurchase?: (credits: number, priceNet: number) => void;
}

export const PRICE_PER_CREDIT = 1.50;

/**
 * Doładowanie kredytów jest chwilowo wyłączone.
 *
 * Ten modal uruchamiał `purchaseCredits`, które dopisywało kredyty i zapisywało
 * w księdze wpis `type: 'purchase'` z ceną — a płatności nikt nie pobierał
 * (w kodzie stało wprost „simulate purchase, payment gateway integration later").
 * Był to więc darmowy dystrybutor kredytów dostępny z siedmiu ekranów.
 *
 * Zamiast wycinać UI zostaje komunikat, żeby użytkownik rozumiał, czemu nie może
 * kupić. Ścieżka zakupu wróci razem z billingiem — wtedy `onPurchase` przepniemy
 * na `payment-core` (akcja `init`), a nie na bezpośredni zapis do bazy.
 * Na czas przejściowy kredyty przyznaje administrator (panel → Płatności → Kredyty).
 */
export function VehicleLookupCreditsModal({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Pobieranie danych po numerze rejestracyjnym
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex flex-col items-center gap-3 rounded-lg bg-muted/50 p-6 text-center">
            <Clock className="h-10 w-10 text-muted-foreground opacity-60" />
            <div>
              <p className="font-medium">Doładowania wkrótce</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Samodzielny zakup kredytów jest chwilowo niedostępny — przygotowujemy
                płatności online.
              </p>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Potrzebujesz kredytów już teraz? Napisz do nas, a dodamy je do Twojego konta.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zamknij</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
