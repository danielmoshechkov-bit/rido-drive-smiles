import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Clock, MessageSquare } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Zostaje w interfejsie, choć chwilowo nieużywany — miejsca wywołania
   * przekazują swój handler i przy uruchomieniu billingu wracamy do niego.
   */
  onPurchase?: (count: number, priceNet: number) => void;
}

export const PRICE_PER_SMS = 0.20; // 0.20 zł netto per SMS

/**
 * Dokupienie pakietu SMS jest chwilowo wyłączone.
 *
 * Modal wołał handler, który dopisywał SMS-y wprost do
 * `service_providers.sms_balance` z przeglądarki, bez pobrania jakiejkolwiek
 * płatności. Ścieżka zakupu wróci razem z billingiem — wtedy pójdzie przez
 * `payment-core`. Na czas przejściowy pakiety dodaje administrator.
 */
export function SmsPurchaseModal({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Dokup pakiet SMS
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex flex-col items-center gap-3 rounded-lg bg-muted/50 p-6 text-center">
            <Clock className="h-10 w-10 text-muted-foreground opacity-60" />
            <div>
              <p className="font-medium">Doładowania wkrótce</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Samodzielny zakup pakietów SMS jest chwilowo niedostępny —
                przygotowujemy płatności online.
              </p>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Potrzebujesz SMS-ów już teraz? Napisz do nas, a dodamy pakiet do Twojego konta.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zamknij</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
