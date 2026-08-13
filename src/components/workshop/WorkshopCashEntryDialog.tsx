import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  PAYMENT_METHODS, type PaymentMethod,
  useCreateWorkshopPayments, useCreateWorkshopExpense,
} from '@/hooks/useWorkshopFinance';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  kind: 'in' | 'out';     // wpłata do kasy / wypłata z kasy
}

const today = () => new Date().toISOString().slice(0, 10);

export function WorkshopCashEntryDialog({ open, onOpenChange, providerId, kind }: Props) {
  const qc = useQueryClient();
  const createPayment = useCreateWorkshopPayments();
  const createExpense = useCreateWorkshopExpense();
  const [method, setMethod] = useState<PaymentMethod>('gotowka');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [who, setWho] = useState('');

  useEffect(() => { if (open) { setAmount(''); setDesc(''); setMethod('gotowka'); setWho(''); } }, [open]);

  const save = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error('Podaj kwotę'); return; }
    if (kind === 'in') {
      await createPayment.mutateAsync({ providerId, splits: [{ method, amount: amt }], createdByName: who.trim() || undefined });
      toast.success('Wpłata zapisana');
    } else {
      await createExpense.mutateAsync({
        provider_id: providerId, category: 'wyplata', subcategory: 'Wypłata z kasy',
        description: desc || null, amount: amt, method, expense_date: today(), employee_id: null,
        created_by_name: who.trim() || null,
      });
    }
    qc.invalidateQueries({ queryKey: ['workshop-cash-data'] });
    onOpenChange(false);
  };

  const busy = createPayment.isPending || createExpense.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {kind === 'in' ? <ArrowDownCircle className="h-5 w-5 text-green-600" /> : <ArrowUpCircle className="h-5 w-5 text-destructive" />}
            {kind === 'in' ? 'Dodaj wpłatę do kasy' : 'Dodaj wypłatę z kasy'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Forma</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Kwota</Label>
            <Input onFocus={e => e.currentTarget.select()} type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className="text-right" placeholder="0,00" />
            onFocus={e => e.currentTarget.select()}
          </div>
          <div className="space-y-1.5">
            <Label>Opis (opcj.)</Label>
            <Input onFocus={e => e.currentTarget.select()} value={desc} onChange={e => setDesc(e.target.value)} placeholder={kind === 'in' ? 'np. wpłata własna' : 'np. wypłata właściciela'} />
          </div>
          <div className="space-y-1.5">
            <Label>Zarejestrował (opcj.)</Label>
            <Input onFocus={e => e.currentTarget.select()} value={who} onChange={e => setWho(e.target.value)} placeholder="imię i nazwisko" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button onClick={save} disabled={busy} className="gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Zapisz</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
