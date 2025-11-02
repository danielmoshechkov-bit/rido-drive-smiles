import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { toast } from 'sonner';

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

  useEffect(() => {
    if (periodFrom && periodTo && fuelCardNumber) {
      fetchFuelTransactions();
    }
  }, [fuelCardNumber, periodFrom, periodTo]);

  const fetchFuelTransactions = async () => {
    try {
      setLoading(true);

      // Create all possible variants of the card number
      const cardVariants = new Set<string>();
      cardVariants.add(fuelCardNumber);                           // Original
      cardVariants.add('0' + fuelCardNumber);                     // With 0
      cardVariants.add('00' + fuelCardNumber);                    // With 00
      const normalized = fuelCardNumber.replace(/^0+/, '');
      if (normalized !== fuelCardNumber) {
        cardVariants.add(normalized);                             // Without leading zeros
      }

      // Fetch all fuel transactions for the period
      const { data: allTransactions, error: transactionsError } = await supabase
        .from('fuel_transactions')
        .select('*')
        .gte('transaction_date', periodFrom)
        .lte('transaction_date', periodTo)
        .order('transaction_date', { ascending: false });

      if (transactionsError) throw transactionsError;

      // Filter transactions that match any variant of the driver's card
      const driverTransactions = (allTransactions || []).filter(t => {
        const transactionCard = t.card_number;
        const transactionNormalized = transactionCard.replace(/^0+/, '');
        
        return cardVariants.has(transactionCard) || 
               cardVariants.has(transactionNormalized) ||
               cardVariants.has('0' + transactionCard) ||
               cardVariants.has('00' + transactionCard);
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
    return <div className="text-center py-8">Ładowanie danych paliwowych...</div>;
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
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Łączna ilość litrów</p>
              <p className="text-2xl font-bold">{totalLiters.toFixed(2)} L</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Łączna kwota</p>
              <p className="text-2xl font-bold">{totalAmount.toFixed(2)} zł</p>
            </div>
          </div>

          {/* Transactions Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Godzina</TableHead>
                <TableHead>Stacja</TableHead>
                <TableHead>Paliwo</TableHead>
                <TableHead className="text-right">Litry</TableHead>
                <TableHead className="text-right">Cena/L</TableHead>
                <TableHead className="text-right">Kwota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>
                    {format(new Date(transaction.transaction_date), 'dd.MM.yyyy')}
                  </TableCell>
                  <TableCell>{transaction.transaction_time}</TableCell>
                  <TableCell>{transaction.brand}</TableCell>
                  <TableCell>{transaction.fuel_type}</TableCell>
                  <TableCell className="text-right">
                    {transaction.liters.toFixed(2)} L
                  </TableCell>
                  <TableCell className="text-right">
                    {transaction.price_per_liter.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {transaction.total_amount.toFixed(2)} zł
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-bold bg-muted/50">
                <TableCell colSpan={4}>SUMA</TableCell>
                <TableCell className="text-right">
                  {totalLiters.toFixed(2)} L
                </TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right">
                  {totalAmount.toFixed(2)} zł
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
