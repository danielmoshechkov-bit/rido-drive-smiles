import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { TrendingDown, TrendingUp, Plus } from "lucide-react";
import { toast } from "sonner";

interface DebtTransaction {
  id: string;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  period_from: string;
  period_to: string;
  created_at: string;
  description: string;
}

interface WeekDebtContext {
  settlementDebtBefore: number;
  rentalDebtBefore: number;
  totalDebtBefore: number;
  debtAfter: number;
  periodFrom?: string;
  periodTo?: string;
}

interface DriverDebtHistoryProps {
  driverId: string;
  weekDebtContext?: WeekDebtContext;
  onDebtChanged?: () => void;
}

export const DriverDebtHistory = ({ driverId, weekDebtContext, onDebtChanged }: DriverDebtHistoryProps) => {
  const [transactions, setTransactions] = useState<DebtTransaction[]>([]);
  const [currentDebt, setCurrentDebt] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showAddDebtForm, setShowAddDebtForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [debtAmount, setDebtAmount] = useState('');
  const [debtNote, setDebtNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchDebtData();
  }, [driverId]);

  const fetchDebtData = async () => {
    setLoading(true);
    
    const { data: debtData } = await supabase
      .from('driver_debts')
      .select('current_balance')
      .eq('driver_id', driverId)
      .maybeSingle();
    
    if (debtData) {
      setCurrentDebt(debtData.current_balance);
    }

    const { data: txData } = await supabase
      .from('driver_debt_transactions')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false });
    
    if (txData) {
      setTransactions(txData);
    }
    
    setLoading(false);
  };

  const handlePayment = async () => {
    const amount = parseFloat(paymentAmount.replace(',', '.'));
    if (!amount || amount <= 0) {
      toast.error('Wprowadź poprawną kwotę');
      return;
    }
    
    setSaving(true);
    try {
      const newBalance = Math.max(0, currentDebt - amount);
      
      // 1. First create the transaction record (most important for history)
      const dateVal = paymentDate || new Date().toISOString().split('T')[0];
      const { error: txError } = await supabase
        .from('driver_debt_transactions')
        .insert({
          driver_id: driverId,
          type: 'payment',
          amount: -amount,
          balance_before: currentDebt,
          balance_after: newBalance,
          period_from: dateVal,
          period_to: dateVal,
          description: paymentNote || 'Wpłata własna kierowcy'
        });
      
      if (txError) {
        console.error('Error inserting payment transaction:', txError);
        toast.error('Nie udało się zapisać transakcji wpłaty: ' + txError.message);
        setSaving(false);
        return; // Don't update balance if transaction failed
      }

      // 2. Update or create debt balance
      const { data: existing } = await supabase
        .from('driver_debts')
        .select('id')
        .eq('driver_id', driverId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('driver_debts')
          .update({ current_balance: newBalance, updated_at: new Date().toISOString() })
          .eq('driver_id', driverId);
      } else {
        await supabase
          .from('driver_debts')
          .insert({ driver_id: driverId, current_balance: newBalance });
      }

      // 3. Also update the latest settlement's debt_after to reflect the payment
      const { data: latestSettlement } = await supabase
        .from('settlements')
        .select('id')
        .eq('driver_id', driverId)
        .not('debt_after', 'is', null)
        .order('period_from', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (latestSettlement) {
        await supabase
          .from('settlements')
          .update({ debt_after: newBalance })
          .eq('id', latestSettlement.id);
      }
      
      toast.success(`Wpłata ${amount.toFixed(2)} zł zarejestrowana`);
      setPaymentAmount('');
      setPaymentNote('');
      setShowPaymentForm(false);
      await fetchDebtData();
      onDebtChanged?.();
    } catch (err) {
      console.error('Error recording payment:', err);
      toast.error('Błąd rejestracji wpłaty');
    } finally {
      setSaving(false);
    }
  };

  const handleAddDebt = async () => {
    const amount = parseFloat(debtAmount.replace(',', '.'));
    if (!amount || amount <= 0) {
      toast.error('Wprowadź poprawną kwotę');
      return;
    }

    setSaving(true);
    try {
      const newBalance = currentDebt + amount;

      const { data: existing } = await supabase
        .from('driver_debts')
        .select('id')
        .eq('driver_id', driverId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('driver_debts')
          .update({ current_balance: newBalance, updated_at: new Date().toISOString() })
          .eq('driver_id', driverId);
      } else {
        await supabase
          .from('driver_debts')
          .insert({ driver_id: driverId, current_balance: newBalance });
      }

      const dateVal = new Date().toISOString().split('T')[0];
      await supabase
        .from('driver_debt_transactions')
        .insert({
          driver_id: driverId,
          type: 'debt_increase',
          amount: amount,
          balance_before: currentDebt,
          balance_after: newBalance,
          period_from: dateVal,
          period_to: dateVal,
          description: debtNote || 'Dług dodany ręcznie'
        });

      toast.success(`Dług ${amount.toFixed(2)} zł dodany`);
      setDebtAmount('');
      setDebtNote('');
      setShowAddDebtForm(false);
      await fetchDebtData();
      onDebtChanged?.();
    } catch (err) {
      console.error('Error adding debt:', err);
      toast.error('Błąd dodawania długu');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>💳 Historia zadłużenia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">Ładowanie...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>💳 Historia zadłużenia</span>
          {currentDebt > 0 && (
            <span className="text-red-600 font-bold">
              Obecny dług (na dziś): {currentDebt.toFixed(2)} zł
            </span>
          )}
          {currentDebt === 0 && (
            <span className="text-green-600 font-bold">
              ✓ Brak bieżącego zadłużenia
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action buttons - always show */}
        <div className="flex gap-2">
          {!showPaymentForm && !showAddDebtForm && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowAddDebtForm(true)}
                className="gap-2 flex-1"
              >
                <TrendingDown className="h-4 w-4 text-destructive" />
                Dodaj dług
              </Button>
              {currentDebt > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowPaymentForm(true)}
                  className="gap-2 flex-1"
                >
                  <Plus className="h-4 w-4" />
                  Zarejestruj wpłatę
                </Button>
              )}
            </>
          )}
        </div>

        {weekDebtContext && (
          <div className="p-3 rounded-lg border bg-muted/40 space-y-1">
            <div className="text-sm font-semibold">Podgląd długu dla wybranego rozliczenia</div>
            {(weekDebtContext.periodFrom && weekDebtContext.periodTo) && (
              <div className="text-xs text-muted-foreground">
                Okres: {format(new Date(weekDebtContext.periodFrom), 'dd.MM.yyyy', { locale: pl })} - {format(new Date(weekDebtContext.periodTo), 'dd.MM.yyyy', { locale: pl })}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Dług rozliczeniowy: <span className="font-medium text-foreground">{weekDebtContext.settlementDebtBefore.toFixed(2)} zł</span>
              {' • '}Dług wynajmu: <span className="font-medium text-foreground">{weekDebtContext.rentalDebtBefore.toFixed(2)} zł</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Razem na start tygodnia: <span className="font-semibold text-foreground">{weekDebtContext.totalDebtBefore.toFixed(2)} zł</span>
              {' • '}Po rozliczeniu tygodnia: <span className="font-semibold text-foreground">{weekDebtContext.debtAfter.toFixed(2)} zł</span>
            </div>
            {currentDebt === 0 && weekDebtContext.totalDebtBefore > 0 && (
              <div className="text-xs font-medium text-green-700">Ten dług został już spłacony — dlatego obecnie saldo to 0.</div>
            )}
          </div>
        )}

        {/* Add debt form */}
        {showAddDebtForm && (
          <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3">
            <Label className="text-sm font-medium">Dodaj dług</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Kwota (np. 200)"
                value={debtAmount}
                onChange={(e) => setDebtAmount(e.target.value)}
                className="flex-1"
              />
              <span className="flex items-center text-sm text-muted-foreground">zł</span>
            </div>
            <Input
              type="text"
              placeholder="Notatka (opcjonalnie)"
              value={debtNote}
              onChange={(e) => setDebtNote(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleAddDebt} disabled={saving}>
                {saving ? 'Zapisywanie...' : 'Dodaj dług'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddDebtForm(false)}>
                Anuluj
              </Button>
            </div>
          </div>
        )}

        {/* Payment form */}
        {showPaymentForm && (
          <div className="p-3 rounded-lg border border-green-200 bg-green-50 space-y-3">
            <Label className="text-sm font-medium">Wpłata na poczet długu</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Kwota (np. 200)"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="flex-1"
              />
              <span className="flex items-center text-sm text-muted-foreground">zł</span>
            </div>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Notatka (opcjonalnie)"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                className="flex-1"
              />
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-[140px]"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handlePayment} disabled={saving}>
                {saving ? 'Zapisywanie...' : 'Zapisz wpłatę'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowPaymentForm(false)}>
                Anuluj
              </Button>
            </div>
          </div>
        )}

        {transactions.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">
            Brak historii transakcji
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const isDebtIncrease = tx.type === 'debt_increase';
              const isManualPayment = tx.type === 'payment';
              const isDebtPayment = tx.type === 'debt_payment';
              const isReducing = isManualPayment || isDebtPayment;
              
              // Determine label and sublabel
              let label = '';
              let sublabel = '';
              if (isDebtIncrease) {
                label = 'Narastanie długu';
                sublabel = tx.description || 'Ujemne saldo z rozliczenia';
              } else if (isManualPayment) {
                label = 'Wpłata własna';
                sublabel = tx.description || 'Wpłata gotówkowa / przelew';
              } else if (isDebtPayment) {
                label = 'Spłata z rozliczenia';
                sublabel = tx.description || 'Automatyczna spłata z zarobków';
              } else {
                label = tx.type;
                sublabel = tx.description || '';
              }

              return (
                <div
                  key={tx.id}
                  className={`p-3 rounded-lg border ${
                    isDebtIncrease
                      ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                      : 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {isDebtIncrease ? (
                        <TrendingDown className="text-destructive" size={20} />
                      ) : (
                        <TrendingUp className="text-green-600" size={20} />
                      )}
                      <div>
                        <div className="font-medium text-sm">{label}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(tx.period_from), 'dd.MM', { locale: pl })} -{' '}
                          {format(new Date(tx.period_to), 'dd.MM.yyyy', { locale: pl })}
                        </div>
                        {sublabel && (
                          <div className="text-xs text-muted-foreground mt-0.5 italic">{sublabel}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${
                        isDebtIncrease ? 'text-destructive' : 'text-green-600'
                      }`}>
                        {isDebtIncrease ? '+' : '-'}{Math.abs(tx.amount).toFixed(2)} zł
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Saldo: {tx.balance_after.toFixed(2)} zł
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
