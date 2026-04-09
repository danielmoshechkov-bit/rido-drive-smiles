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
      const effectivePeriodFrom = periodFrom || today;
      const effectivePeriodTo = periodTo || today;

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
          type: 'manual_add' as any,
          amount: parsedAmount,
          balance_before: currentBalance - parsedAmount,
          balance_after: currentBalance,
          period_from: effectivePeriodFrom,
          period_to: effectivePeriodTo,
          description: reason,
          debt_category: 'settlement',
        } as any);

        // Update the current week's settlement snapshot so debt shows in the table
        await syncSettlementDebtSnapshot(driverId, effectivePeriodFrom, effectivePeriodTo);

        toast.success(`Dług ${parsedAmount.toFixed(2)} zł dodany dla ${driverName}`);
      } else {
        // Bonus - reduce debt or add credit
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
            amount: -parsedAmount,
            balance_before: currentBalance,
            balance_after: newBalance,
            period_from: effectivePeriodFrom,
            period_to: effectivePeriodTo,
            description: `Dodatek: ${reason}`,
            debt_category: 'settlement',
          } as any);
        }

        // Update the current week's settlement snapshot
        await syncSettlementDebtSnapshot(driverId, effectivePeriodFrom, effectivePeriodTo);

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

  // After adding a manual charge/bonus, re-sync the settlement's debt snapshot
  // so the UI table shows updated debt values without page reload
  const syncSettlementDebtSnapshot = async (driverId: string, periodFrom: string, periodTo: string) => {
    try {
      // Get updated debt balance
      const { data: debtData } = await supabase
        .from('driver_debts')
        .select('current_balance')
        .eq('driver_id', driverId)
        .maybeSingle();

      const currentDebt = debtData?.current_balance || 0;

      // Find the settlement for this period
      const { data: settlements } = await supabase
        .from('settlements')
        .select('id, debt_before, debt_after')
        .eq('driver_id', driverId)
        .gte('period_from', periodFrom)
        .lte('period_to', periodTo)
        .limit(1);

      if (settlements && settlements.length > 0) {
        // Update the debt_after snapshot to reflect manual change
        await supabase
          .from('settlements')
          .update({ debt_after: currentDebt })
          .eq('id', settlements[0].id);
      }
    } catch (err) {
      console.error('Error syncing settlement debt snapshot:', err);
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
