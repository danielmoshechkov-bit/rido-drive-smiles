import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CreditCard, Search } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchase: (credits: number, priceNet: number) => void;
}

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

        <div className="space-y-6 py-4">
          <p className="text-sm text-muted-foreground">
            Zakup kredytów wymaga pakietu z ceną i liczbą kredytów zdefiniowanymi w katalogu serwerowym.
          </p>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium">Zakup jest tymczasowo niedostępny</p>
                <p className="mt-1 text-muted-foreground">
                  Nie skonfigurowano jeszcze kanonicznego <code>price_id</code> dla kredytów pojazdowych.
                  Saldo nie zostanie zmienione w przeglądarce.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
          <Button disabled className="gap-2">
            <CreditCard className="h-4 w-4" />
            Płatność niedostępna
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
