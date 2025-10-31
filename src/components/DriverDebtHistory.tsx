import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { TrendingDown, TrendingUp } from "lucide-react";

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
}

export const DriverDebtHistory = ({ driverId }: DriverDebtHistoryProps) => {
  const [transactions, setTransactions] = useState<DebtTransaction[]>([]);
  const [currentDebt, setCurrentDebt] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDebtData();
  }, [driverId]);

  const fetchDebtData = async () => {
    setLoading(true);
    
    // Pobierz aktualny dług
    const { data: debtData } = await supabase
      .from('driver_debts')
      .select('current_balance')
      .eq('driver_id', driverId)
      .maybeSingle();
    
    if (debtData) {
      setCurrentDebt(debtData.current_balance);
    }

    // Pobierz historię transakcji
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
      <CardContent>
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
                        {tx.type === 'debt_increase' ? 'Narastanie długu' : 'Spłata długu'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(tx.period_from), 'dd.MM', { locale: pl })} -{' '}
                        {format(new Date(tx.period_to), 'dd.MM.yyyy', { locale: pl })}
                      </div>
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
