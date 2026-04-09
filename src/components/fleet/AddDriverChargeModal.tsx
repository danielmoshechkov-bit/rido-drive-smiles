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
  settlementId?: string;
  currentRawPayout?: number;
  currentPayoutWithoutRental?: number;
  currentRental?: number;
  onComplete: () => void;
}

export function AddDriverChargeModal({
  open,
  onOpenChange,
  driverId,
  driverName,
  periodFrom,
  periodTo,
  settlementId,
  currentRawPayout,
  currentPayoutWithoutRental,
  currentRental,
  onComplete,
}: AddDriverChargeModalProps) {
  const [type, setType] = useState<'deduction' | 'bonus'>('deduction');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

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

      const { data: targetSettlement, error: settlementError } = settlementId
        ? await supabase
            .from('settlements')
            .select('id, amounts')
            .eq('id', settlementId)
            .maybeSingle()
        : await supabase
            .from('settlements')
            .select('id, amounts')
            .eq('driver_id', driverId)
            .eq('period_from', effectivePeriodFrom)
            .eq('period_to', effectivePeriodTo)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

      if (settlementError) throw settlementError;
      if (!targetSettlement) {
        toast.error('Brak rekordu rozliczenia dla tego tygodnia');
        return;
      }

      const adjustmentDelta = type === 'deduction' ? parsedAmount : -parsedAmount;
      const originalAmounts = ((targetSettlement as any).amounts || {}) as Record<string, any>;
      const currentAdjustment = round2(Number(originalAmounts.manual_week_adjustment || 0));
      const nextAdjustment = round2(currentAdjustment + adjustmentDelta);
      const nextAmounts = {
        ...originalAmounts,
        manual_week_adjustment: nextAdjustment,
        manual_week_adjustment_reason: reason.trim(),
        manual_week_adjustment_updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('settlements')
        .update({ amounts: nextAmounts } as any)
        .eq('id', targetSettlement.id);

      if (updateError) throw updateError;

      const targetSettlementId = settlementId || targetSettlement.id;
      if (
        targetSettlementId &&
        currentRawPayout !== undefined &&
        currentPayoutWithoutRental !== undefined
      ) {
        const nextRawPayout = round2(currentRawPayout - adjustmentDelta);
        const nextPayoutWithoutRental = round2(currentPayoutWithoutRental - adjustmentDelta);

        const { data: debtSyncData, error: debtSyncError } = await supabase.functions.invoke('update-driver-debt', {
          body: {
            driver_id: driverId,
            settlement_id: targetSettlementId,
            period_from: effectivePeriodFrom,
            period_to: effectivePeriodTo,
            calculated_payout: nextRawPayout,
            calculated_payout_without_rental: nextPayoutWithoutRental,
            rental_fee: currentRental || 0,
            force_recalculate_chain: true,
          },
        });

        if (debtSyncError || (debtSyncData as any)?.error) {
          await supabase
            .from('settlements')
            .update({ amounts: originalAmounts } as any)
            .eq('id', targetSettlement.id);

          throw debtSyncError || new Error((debtSyncData as any)?.error || 'Błąd przeliczenia rozliczenia');
        }
      }

      toast.success(
        `${type === 'deduction' ? 'Opłata' : 'Dodatek'} ${parsedAmount.toFixed(2)} zł zapisany dla ${driverName}`
      );

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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Zapisywanie...' : type === 'deduction' ? 'Dodaj dług' : 'Dodaj dodatek'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
