import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Minus, Plus, CreditCard, Search } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchase: (credits: number, priceNet: number) => void;
}

const PRICE_PER_CREDIT = 1.50;
const MIN_CREDITS = 10;
const STEP = 10;

export function VehicleLookupCreditsModal({ open, onOpenChange, onPurchase }: Props) {
  const [credits, setCredits] = useState(MIN_CREDITS);

  const priceNet = credits * PRICE_PER_CREDIT;

  const decrease = () => setCredits(prev => Math.max(MIN_CREDITS, prev - STEP));
  const increase = () => setCredits(prev => prev + STEP);

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
            W tym miejscu możesz kupić kredyty, dzięki którym będziesz mieć możliwość pobierania danych pojazdu po numerze rejestracyjnym.
          </p>

          <div className="flex items-center justify-center gap-6">
            <Button
              variant="outline"
              size="icon"
              onClick={decrease}
              disabled={credits <= MIN_CREDITS}
              className="h-12 w-12 rounded-full"
            >
              <Minus className="h-5 w-5" />
            </Button>

            <div className="text-center">
              <div className="text-4xl font-bold text-primary">{credits}</div>
              <div className="text-sm text-muted-foreground">kredytów</div>
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={increase}
              className="h-12 w-12 rounded-full"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <div className="text-sm text-muted-foreground">Cena netto</div>
            <div className="text-2xl font-bold">{priceNet.toFixed(2)} zł</div>
            <div className="text-xs text-muted-foreground mt-1">
              ({PRICE_PER_CREDIT.toFixed(2)} zł / kredyt)
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
          <Button onClick={() => onPurchase(credits, priceNet)} className="gap-2">
            <CreditCard className="h-4 w-4" />
            Przejdź do płatności
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
