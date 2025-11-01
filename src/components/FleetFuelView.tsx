import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface FleetFuelViewProps {
  fleetId: string;
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
  driver_name?: string;
}

interface CardSummary {
  card_number: string;
  driver_name: string;
  transaction_count: number;
  total_liters: number;
  total_amount: number;
  transactions: FuelTransaction[];
}

export function FleetFuelView({ fleetId, periodFrom, periodTo }: FleetFuelViewProps) {
  const [cardSummaries, setCardSummaries] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (periodFrom && periodTo) {
      fetchFuelTransactions();
    }
  }, [periodFrom, periodTo]);

  const fetchFuelTransactions = async () => {
    try {
      setLoading(true);

      // Fetch drivers with fuel cards from the fleet
      const { data: drivers, error: driversError } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, fuel_card_number, fleet_id')
        .eq('fleet_id', fleetId)
        .not('fuel_card_number', 'is', null);

      if (driversError) throw driversError;

      // Create map of card_number to driver name
      // Handle both formats: with and without leading zeros
      const cardToDriverMap = new Map<string, string>();
      drivers?.forEach(d => {
        const cardNum = d.fuel_card_number;
        const driverName = `${d.first_name} ${d.last_name}`;
        
        // Map both formats: original and with leading zeros
        cardToDriverMap.set(cardNum, driverName);
        cardToDriverMap.set(`00${cardNum}`, driverName);
        cardToDriverMap.set(`0${cardNum}`, driverName);
      });

      // Fetch fuel transactions for the period
      const { data: transactions, error: transactionsError } = await supabase
        .from('fuel_transactions')
        .select('*')
        .gte('transaction_date', periodFrom)
        .lte('transaction_date', periodTo)
        .order('transaction_date', { ascending: false });

      if (transactionsError) throw transactionsError;

      // Filter transactions to only include cards from this fleet
      const fleetCardNumbers = new Set(
        drivers?.map(d => d.fuel_card_number) || []
      );

      const fleetTransactions = (transactions || []).filter(t => {
        // Remove leading zeros for comparison
        const normalizedCardNumber = t.card_number.replace(/^0+/, '');
        return fleetCardNumbers.has(normalizedCardNumber);
      });

      // Group transactions by card_number
      const grouped = fleetTransactions.reduce((acc, transaction) => {
        const cardNumber = transaction.card_number;
        if (!acc[cardNumber]) {
          acc[cardNumber] = {
            card_number: cardNumber,
            driver_name: cardToDriverMap.get(cardNumber) || 'Nieprzypisany',
            transaction_count: 0,
            total_liters: 0,
            total_amount: 0,
            transactions: []
          };
        }
        acc[cardNumber].transaction_count++;
        acc[cardNumber].total_liters += Number(transaction.liters || 0);
        acc[cardNumber].total_amount += Number(transaction.total_amount || 0);
        acc[cardNumber].transactions.push(transaction);
        return acc;
      }, {} as Record<string, CardSummary>);

      const summaries = Object.values(grouped);
      setCardSummaries(summaries);

    } catch (error: any) {
      console.error('Error fetching fuel transactions:', error);
      toast.error('Nie udało się pobrać danych paliwowych');
    } finally {
      setLoading(false);
    }
  };

  const toggleCard = (cardNumber: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(cardNumber)) {
      newExpanded.delete(cardNumber);
    } else {
      newExpanded.add(cardNumber);
    }
    setExpandedCards(newExpanded);
  };

  if (loading) {
    return <div className="text-center py-8">Ładowanie danych paliwowych...</div>;
  }

  if (cardSummaries.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Brak danych paliwowych dla wybranego okresu
        </CardContent>
      </Card>
    );
  }

  const totalAmount = cardSummaries.reduce((sum, card) => sum + card.total_amount, 0);
  const totalLiters = cardSummaries.reduce((sum, card) => sum + card.total_liters, 0);
  const totalTransactions = cardSummaries.reduce((sum, card) => sum + card.transaction_count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rozliczenie paliwa</CardTitle>
        <CardDescription>
          Szczegółowe rozliczenie paliwa dla okresu {periodFrom} - {periodTo}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Numer karty</TableHead>
              <TableHead>Kierowca</TableHead>
              <TableHead className="text-right">Transakcje</TableHead>
              <TableHead className="text-right">Litry</TableHead>
              <TableHead className="text-right">Kwota</TableHead>
              <TableHead className="text-center">Szczegóły</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cardSummaries.map((card) => (
              <>
                <TableRow key={card.card_number} className="hover:bg-muted/50">
                  <TableCell className="font-mono">{card.card_number}</TableCell>
                  <TableCell>{card.driver_name}</TableCell>
                  <TableCell className="text-right">{card.transaction_count}</TableCell>
                  <TableCell className="text-right">
                    {card.total_liters.toFixed(2)} L
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {card.total_amount.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCard(card.card_number)}
                    >
                      {expandedCards.has(card.card_number) ? 'Ukryj' : 'Pokaż'}
                    </Button>
                  </TableCell>
                </TableRow>
                {expandedCards.has(card.card_number) && (
                  <TableRow>
                    <TableCell colSpan={6} className="bg-muted/20 p-4">
                      <div className="space-y-2">
                        <p className="text-sm font-medium mb-2">Szczegóły transakcji:</p>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Data</TableHead>
                              <TableHead className="text-xs">Godzina</TableHead>
                              <TableHead className="text-xs">Stacja</TableHead>
                              <TableHead className="text-xs">Paliwo</TableHead>
                              <TableHead className="text-xs text-right">Litry</TableHead>
                              <TableHead className="text-xs text-right">Cena/L</TableHead>
                              <TableHead className="text-xs text-right">Kwota</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {card.transactions.map((transaction) => (
                              <TableRow key={transaction.id}>
                                <TableCell className="text-xs">
                                  {format(new Date(transaction.transaction_date), 'dd.MM.yyyy')}
                                </TableCell>
                                <TableCell className="text-xs">{transaction.transaction_time}</TableCell>
                                <TableCell className="text-xs">{transaction.brand}</TableCell>
                                <TableCell className="text-xs">{transaction.fuel_type}</TableCell>
                                <TableCell className="text-xs text-right">
                                  {transaction.liters.toFixed(2)} L
                                </TableCell>
                                <TableCell className="text-xs text-right">
                                  {transaction.price_per_liter.toFixed(2)} zł
                                </TableCell>
                                <TableCell className="text-xs text-right font-medium">
                                  {transaction.total_amount.toFixed(2)} zł
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
            <TableRow className="font-bold bg-muted/50">
              <TableCell colSpan={2}>SUMA</TableCell>
              <TableCell className="text-right">{totalTransactions}</TableCell>
              <TableCell className="text-right">
                {totalLiters.toFixed(2)} L
              </TableCell>
              <TableCell className="text-right">
                {totalAmount.toFixed(2)} zł
              </TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
