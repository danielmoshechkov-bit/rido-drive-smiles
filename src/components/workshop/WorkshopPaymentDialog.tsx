import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Loader2, Wallet, AlertTriangle } from 'lucide-react';
import {
  useCreateWorkshopPayments, PAYMENT_METHODS, type PaymentMethod, type PaymentSplit,
} from '@/hooks/useWorkshopFinance';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  orderId?: string;
  invoiceId?: string;
  amount: number;            // kwota do rozliczenia (brutto zlecenia/sprzedaży)
  title?: string;
  onPaid?: () => void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function WorkshopPaymentDialog({ open, onOpenChange, providerId, orderId, invoiceId, amount, title, onPaid }: Props) {
  const createPayments = useCreateWorkshopPayments();
  const [splits, setSplits] = useState<PaymentSplit[]>([{ method: 'gotowka', amount: round2(amount) }]);

  // Reset to a single full-amount row each time the dialog opens for a new amount.
  useEffect(() => {
    if (open) setSplits([{ method: 'gotowka', amount: round2(amount) }]);
  }, [open, amount]);

  const sum = round2(splits.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const remaining = round2(amount - sum);
  const matches = Math.abs(remaining) < 0.01;

  const setRow = (i: number, patch: Partial<PaymentSplit>) =>
    setSplits((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addRow = () => {
    // Prefill the new row with whatever is still missing.
    const missing = remaining > 0 ? remaining : 0;
    setSplits((prev) => [...prev, { method: 'karta', amount: round2(missing) }]);
  };

  const removeRow = (i: number) =>
    setSplits((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const handleSave = async () => {
    if (!matches) return;
    await createPayments.mutateAsync({ providerId, orderId, invoiceId, splits });
    onOpenChange(false);
    onPaid?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" /> {title || 'Forma płatności'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Do zapłaty</span>
            <span className="text-base font-semibold tabular-nums">{fmt(amount)} zł</span>
          </div>

          <div className="space-y-2">
            {splits.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={row.method} onValueChange={(v) => setRow(i, { method: v as PaymentMethod })}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.amount || ''}
                  onChange={(e) => setRow(i, { amount: Number(e.target.value) })}
                  className="flex-1 text-right tabular-nums"
                  placeholder="0,00"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive shrink-0"
                  onClick={() => removeRow(i)}
                  disabled={splits.length <= 1}
                  title="Usuń formę"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" className="gap-1" onClick={addRow}>
            <Plus className="h-4 w-4" /> Dodaj formę (płatność podzielona)
          </Button>

          {/* Sum / remaining */}
          <div className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${matches ? 'bg-green-500/10 text-green-700' : 'bg-amber-500/10 text-amber-700'}`}>
            {matches ? (
              <span>Suma form zgadza się z kwotą zlecenia.</span>
            ) : (
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                {remaining > 0 ? `Brakuje ${fmt(remaining)} zł` : `Nadwyżka ${fmt(-remaining)} zł`}
              </span>
            )}
            <span className="tabular-nums font-medium">{fmt(sum)} zł</span>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button onClick={handleSave} disabled={!matches || createPayments.isPending} className="gap-2">
              {createPayments.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Zapisz płatność
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
