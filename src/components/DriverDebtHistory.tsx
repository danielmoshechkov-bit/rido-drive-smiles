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

interface DriverDebtHistoryProps {
  driverId: string;
  onDebtChanged?: () => void;
}

export const DriverDebtHistory = ({ driverId, onDebtChanged }: DriverDebtHistoryProps) => {
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
      
      // Update or create debt balance
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
      
      const dateVal = paymentDate || new Date().toISOString().split('T')[0];
      await supabase
        .from('driver_debt_transactions')
        .insert({
          driver_id: driverId,
          type: 'payment',
          amount: amount,
          balance_before: currentDebt,
          balance_after: newBalance,
          period_from: dateVal,
          period_to: dateVal,
          description: paymentNote || 'Wpłata ręczna'
        });
      
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
              Obecny dług: {currentDebt.toFixed(2)} zł
            </span>
          )}
          {currentDebt === 0 && (
            <span className="text-green-600 font-bold">
              ✓ Brak zadłużenia
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
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className={`p-3 rounded-lg border ${
                  tx.type === 'debt_increase'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-green-50 border-green-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {tx.type === 'debt_increase' ? (
                      <TrendingDown className="text-red-600" size={20} />
                    ) : (
                      <TrendingUp className="text-green-600" size={20} />
                    )}
                    <div>
                      <div className="font-medium">
                        {tx.type === 'debt_increase' ? 'Narastanie długu' : tx.type === 'payment' ? 'Wpłata' : 'Spłata długu'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(tx.period_from), 'dd.MM', { locale: pl })} -{' '}
                        {format(new Date(tx.period_to), 'dd.MM.yyyy', { locale: pl })}
                      </div>
                      {tx.description && tx.type === 'payment' && (
                        <div className="text-xs text-muted-foreground mt-0.5">{tx.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${
                      tx.type === 'debt_increase' ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {tx.type === 'debt_increase' ? '+' : '-'}{Math.abs(tx.amount).toFixed(2)} zł
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Saldo: {tx.balance_after.toFixed(2)} zł
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
