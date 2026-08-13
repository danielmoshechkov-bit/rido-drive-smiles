import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Ban, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  PAYMENT_METHODS, type PaymentMethod, type CashOpType,
  useVoidCashOperation, useUpdateCashOperation,
} from '@/hooks/useWorkshopFinance';

export interface CashOp {
  type: CashOpType;
  id: string;
  label: string;
  amount: number;
  method?: PaymentMethod | null;
  description?: string | null;
}

const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Storno (anulowanie): kto + powód obowiązkowe ──
export function WorkshopVoidDialog({ open, onOpenChange, op }: { open: boolean; onOpenChange: (o: boolean) => void; op: CashOp | null }) {
  const voidOp = useVoidCashOperation();
  const [who, setWho] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) { setWho(''); setReason(''); } }, [open]);

  const confirm = async () => {
    if (!who.trim()) { toast.error('Podaj kto anuluje'); return; }
    if (!reason.trim()) { toast.error('Podaj powód korekty'); return; }
    if (!op) return;
    await voidOp.mutateAsync({ type: op.type, id: op.id, voidedBy: who.trim(), reason: reason.trim() });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Ban className="h-5 w-5 text-destructive" /> Anuluj operację (storno)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{op?.label} — <span className="font-medium tabular-nums">{fmt(op?.amount || 0)} zł</span></p>
          <p className="text-xs text-amber-600">Operacja nie zostanie usunięta — będzie widoczna jako przekreślona „Anulowano" i wykluczona z obliczeń.</p>
          <div className="space-y-1.5"><Label>Kto anuluje (imię i nazwisko)</Label><Input onFocus={e => e.currentTarget.select()} value={who} onChange={e => setWho(e.target.value)} placeholder="np. Jan Kowalski" /></div>
          <div className="space-y-1.5"><Label>Powód korekty</Label><Input onFocus={e => e.currentTarget.select()} value={reason} onChange={e => setReason(e.target.value)} placeholder="np. pomyłka w kwocie" /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Wróć</Button>
            <Button variant="destructive" onClick={confirm} disabled={voidOp.isPending} className="gap-2">{voidOp.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Anuluj operację</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Edycja (kwota/forma/opis) ze śladem ──
export function WorkshopOpEditDialog({ open, onOpenChange, op }: { open: boolean; onOpenChange: (o: boolean) => void; op: CashOp | null }) {
  const updateOp = useUpdateCashOperation();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('gotowka');
  const [description, setDescription] = useState('');
  const [editedBy, setEditedBy] = useState('');

  useEffect(() => {
    if (open && op) { setAmount(String(op.amount ?? '')); setMethod((op.method as PaymentMethod) || 'gotowka'); setDescription(op.description || ''); setEditedBy(''); }
  }, [open, op]);

  const hasMethod = op?.type === 'payment' || op?.type === 'expense';
  const hasDesc = op?.type === 'expense' || op?.type === 'payout';

  const save = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error('Podaj kwotę'); return; }
    if (!op) return;
    const patch: any = { amount: amt };
    if (hasMethod) patch.method = method;
    if (hasDesc) patch[op.type === 'payout' ? 'note' : 'description'] = description || null;
    await updateOp.mutateAsync({ type: op.type, id: op.id, patch, editedBy: editedBy.trim() || undefined });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5" /> Edytuj operację</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{op?.label}</p>
          <div className="space-y-1.5"><Label>Kwota</Label><Input onFocus={e => e.currentTarget.select()} type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className="text-right" /></div>
          onFocus={e => e.currentTarget.select()}
          {hasMethod && (
            <div className="space-y-1.5"><Label>Forma</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {hasDesc && <div className="space-y-1.5"><Label>Opis</Label><Input onFocus={e => e.currentTarget.select()} value={description} onChange={e => setDescription(e.target.value)} /></div>}
          <div className="space-y-1.5"><Label>Kto edytuje (opcj.)</Label><Input onFocus={e => e.currentTarget.select()} value={editedBy} onChange={e => setEditedBy(e.target.value)} placeholder="imię i nazwisko" /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button onClick={save} disabled={updateOp.isPending} className="gap-2">{updateOp.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Zapisz</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
