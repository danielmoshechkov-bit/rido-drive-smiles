import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface DriverFuelViewProps {
  fuelCardNumber: string;
  periodFrom?: string;
  periodTo?: string;
}

interface FuelTransaction {
  id: string;
  card_number: string;
  transaction_date: string;
  transaction_time: string;
  brand: string;
  liters: number;
  price_per_liter: number;
  total_amount: number;
  fuel_type: string;
}

export function DriverFuelView({ fuelCardNumber, periodFrom, periodTo }: DriverFuelViewProps) {
  const [transactions, setTransactions] = useState<FuelTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (periodFrom && periodTo && fuelCardNumber) {
      fetchFuelTransactions();
    }
  }, [fuelCardNumber, periodFrom, periodTo]);

  const fetchFuelTransactions = async () => {
    try {
      setLoading(true);

      // Normalize driver's card number (remove leading zeros)
      const normalizedDriverCard = fuelCardNumber.replace(/^0+/, '');

      // Fetch all fuel transactions for the period
      const { data: allTransactions, error: transactionsError } = await supabase
        .from('fuel_transactions')
        .select('*')
        .gte('transaction_date', periodFrom)
        .lte('transaction_date', periodTo)
        .order('transaction_date', { ascending: false });

      if (transactionsError) throw transactionsError;

      // Filter transactions where the normalized card number matches
      const driverTransactions = (allTransactions || []).filter(t => {
        const normalizedTransactionCard = t.card_number.replace(/^0+/, '');
        return normalizedTransactionCard === normalizedDriverCard;
      });

      setTransactions(driverTransactions);

    } catch (error: any) {
      console.error('Error fetching fuel transactions:', error);
      toast.error('Nie udało się pobrać danych paliwowych');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Brak transakcji paliwowych dla wybranego okresu
        </CardContent>
      </Card>
    );
  }

  const totalAmount = transactions.reduce((sum, t) => sum + t.total_amount, 0);
  const totalLiters = transactions.reduce((sum, t) => sum + t.liters, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Twoje rozliczenie paliwa</CardTitle>
        <CardDescription>
          Transakcje paliwowe za okres {periodFrom} - {periodTo}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 text-sm font-medium">Nr karty</th>
                  <th className="text-right py-2 px-2 text-sm font-medium">Transakcje</th>
                  <th className="text-right py-2 px-2 text-sm font-medium">Litry</th>
                  <th className="text-right py-2 px-2 text-sm font-medium">Kwota</th>
                  <th className="text-center py-2 px-2 text-sm font-medium">Szczegóły</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-2 px-2 text-sm">{fuelCardNumber}</td>
                  <td className="py-2 px-2 text-sm text-right">{transactions.length}</td>
                  <td className="py-2 px-2 text-sm text-right">{totalLiters.toFixed(2)} L</td>
                  <td className="py-2 px-2 text-sm text-right font-medium">{totalAmount.toFixed(2)} zł</td>
                  <td className="py-2 px-2 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpanded(!expanded)}
                    >
                      {expanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={5} className="py-2 px-2 bg-muted/30">
                      <div className="space-y-1 text-sm">
                        {transactions.map((trans) => (
                          <div key={trans.id} className="flex justify-between py-1 px-2 border-b border-border/50">
                            <span>{trans.transaction_date} {trans.transaction_time}</span>
                            <span>{trans.brand} - {trans.fuel_type}</span>
                            <span>{trans.liters.toFixed(2)} L</span>
                            <span className="font-medium">{trans.total_amount.toFixed(2)} zł</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                <tr className="font-bold border-t-2">
                  <td className="py-2 px-2 text-sm">SUMA</td>
                  <td className="py-2 px-2 text-sm text-right">{transactions.length}</td>
                  <td className="py-2 px-2 text-sm text-right">{totalLiters.toFixed(2)} L</td>
                  <td className="py-2 px-2 text-sm text-right">{totalAmount.toFixed(2)} zł</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
