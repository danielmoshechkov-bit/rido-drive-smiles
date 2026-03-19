import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Minus, Plus, MessageSquare } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchase: (count: number, priceNet: number) => void;
}

const PRICE_PER_SMS = 0.20; // 0.20 zł netto per SMS
const MIN_SMS = 100;
const STEP = 50;

export function SmsPurchaseModal({ open, onOpenChange, onPurchase }: Props) {
  const [count, setCount] = useState(MIN_SMS);

  const priceNet = count * PRICE_PER_SMS;

  const decrease = () => setCount(prev => Math.max(MIN_SMS, prev - STEP));
  const increase = () => setCount(prev => prev + STEP);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Dokup pakiet SMS
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Counter */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Liczba SMS</span>
            <div className="flex items-center gap-0 border rounded-lg overflow-hidden">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-none border-r"
                onClick={decrease}
                disabled={count <= MIN_SMS}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="w-24 text-center font-bold text-lg">{count}</div>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-none border-l"
                onClick={increase}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Price */}
          <div className="flex items-center justify-between">
            <span className="text-sm">* Do zapłaty</span>
            <span className="text-2xl font-bold">{priceNet.toFixed(0)} PLN</span>
          </div>
          <p className="text-xs text-muted-foreground">*Kwota netto</p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => onPurchase(count, priceNet)}
          >
            Przejdź do płatności
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
