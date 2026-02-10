import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AddDriverChargeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
  periodFrom?: string;
  periodTo?: string;
  onComplete: () => void;
}

export function AddDriverChargeModal({
  open,
  onOpenChange,
  driverId,
  driverName,
  periodFrom,
  periodTo,
  onComplete,
}: AddDriverChargeModalProps) {
  const [type, setType] = useState<'deduction' | 'bonus'>('deduction');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error('Wprowadź poprawną kwotę');
      return;
    }
    if (!reason.trim()) {
      toast.error('Wprowadź powód');
      return;
    }

    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      if (type === 'deduction') {
        // Add to driver debt
        await supabase.rpc('increment_driver_debt', {
          p_driver_id: driverId,
          p_amount: parsedAmount,
        });

        // Log transaction
        const { data: debtData } = await supabase
          .from('driver_debts')
          .select('current_balance')
          .eq('driver_id', driverId)
          .maybeSingle();

        const currentBalance = debtData?.current_balance || parsedAmount;

        await supabase.from('driver_debt_transactions').insert({
          driver_id: driverId,
          type: 'debt_increase',
          amount: parsedAmount,
          balance_before: currentBalance - parsedAmount,
          balance_after: currentBalance,
          period_from: periodFrom || today,
          period_to: periodTo || today,
          description: reason,
        });

        toast.success(`Dług ${parsedAmount.toFixed(2)} zł dodany dla ${driverName}`);
      } else {
        // Bonus - add as a negative debt (reduce debt or create credit)
        // For bonus, we store it as a settlement adjustment
        // First check if there's existing debt to reduce
        const { data: debtData } = await supabase
          .from('driver_debts')
          .select('current_balance')
          .eq('driver_id', driverId)
          .maybeSingle();

        const currentBalance = debtData?.current_balance || 0;

        if (currentBalance > 0) {
          // Reduce debt
          const newBalance = Math.max(0, currentBalance - parsedAmount);
          await supabase
            .from('driver_debts')
            .update({ current_balance: newBalance, updated_at: new Date().toISOString() })
            .eq('driver_id', driverId);

          await supabase.from('driver_debt_transactions').insert({
            driver_id: driverId,
            type: 'payment',
            amount: parsedAmount,
            balance_before: currentBalance,
            balance_after: newBalance,
            period_from: periodFrom || today,
            period_to: periodTo || today,
            description: `Dodatek: ${reason}`,
          });
        }

        // Also store in settlement_adjustments for display
        try {
          await supabase.from('settlement_adjustments' as any).insert({
            driver_id: driverId,
            type: 'bonus',
            amount: parsedAmount,
            reason: reason,
            period_from: periodFrom || today,
            period_to: periodTo || today,
          });
        } catch {
          // Table may not exist yet
        }

        toast.success(`Dodatek ${parsedAmount.toFixed(2)} zł dodany dla ${driverName}`);
      }

      setAmount('');
      setReason('');
      onOpenChange(false);
      onComplete();
    } catch (err) {
      console.error('Error adding charge:', err);
      toast.error('Błąd dodawania');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dodaj opłatę / dodatek</DialogTitle>
          <DialogDescription>
            Kierowca: <strong>{driverName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup value={type} onValueChange={(v) => setType(v as 'deduction' | 'bonus')} className="flex gap-4">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="deduction" id="deduction" />
              <Label htmlFor="deduction" className="text-red-600 font-medium">Dług (odejmij od wypłaty)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="bonus" id="bonus" />
              <Label htmlFor="bonus" className="text-green-600 font-medium">Dodatek (dodaj do wypłaty)</Label>
            </div>
          </RadioGroup>

          <div className="space-y-2">
            <Label>Kwota (PLN)</Label>
            <Input
              type="text"
              placeholder="np. 100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Powód / opis</Label>
            <Textarea
              placeholder="np. Naprawa uszkodzenia, premia za wydajność..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Zapisywanie...' : type === 'deduction' ? 'Dodaj dług' : 'Dodaj dodatek'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
