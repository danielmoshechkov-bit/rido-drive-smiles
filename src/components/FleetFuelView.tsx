import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { FuelCardAssignModal } from './fleet/FuelCardAssignModal';
import { cn } from '@/lib/utils';

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
  isUnassigned: boolean;
}

export function FleetFuelView({ fleetId, periodFrom, periodTo }: FleetFuelViewProps) {
  const [cardSummaries, setCardSummaries] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedCardNumber, setSelectedCardNumber] = useState<string>('');

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

      // Create map of card_number to driver name (all 4 variants)
      const cardToDriverMap = new Map<string, string>();
      drivers?.forEach(d => {
        const cardNum = d.fuel_card_number;
        const driverName = `${d.first_name} ${d.last_name}`;
        
        // Always map all 4 variants:
        cardToDriverMap.set(cardNum, driverName);
        cardToDriverMap.set('0' + cardNum, driverName);
        cardToDriverMap.set('00' + cardNum, driverName);
        const normalized = cardNum.replace(/^0+/, '');
        if (normalized !== cardNum) {
          cardToDriverMap.set(normalized, driverName);
        }
      });

      // Fetch fuel transactions for the period
      const { data: transactions, error: transactionsError } = await supabase
        .from('fuel_transactions')
        .select('*')
        .gte('transaction_date', periodFrom)
        .lte('transaction_date', periodTo)
        .order('transaction_date', { ascending: false });

      if (transactionsError) throw transactionsError;

      // Create set of all fleet card numbers (all 4 variants)
      const fleetCardNumbers = new Set<string>();
      drivers?.forEach(d => {
        if (d.fuel_card_number) {
          const cardNum = d.fuel_card_number;
          fleetCardNumbers.add(cardNum);
          fleetCardNumbers.add('0' + cardNum);
          fleetCardNumbers.add('00' + cardNum);
          const normalized = cardNum.replace(/^0+/, '');
          fleetCardNumbers.add(normalized);
        }
      });

      // Include ALL transactions, not just fleet ones - so we can show unassigned cards
      const allTransactions = transactions || [];

      // Group transactions by card_number
      const grouped = allTransactions.reduce((acc, transaction) => {
        const cardNumber = transaction.card_number;
        if (!acc[cardNumber]) {
          // Try all variants to find driver name
          const driverName = cardToDriverMap.get(cardNumber) || 
                            cardToDriverMap.get(cardNumber.replace(/^0+/, '')) ||
                            cardToDriverMap.get('0' + cardNumber) ||
                            cardToDriverMap.get('00' + cardNumber) ||
                            null;
          
          const isUnassigned = !driverName;
          
          acc[cardNumber] = {
            card_number: cardNumber,
            driver_name: driverName || 'Nie przypisano',
            transaction_count: 0,
            total_liters: 0,
            total_amount: 0,
            transactions: [],
            isUnassigned
          };
        }
        acc[cardNumber].transaction_count++;
        acc[cardNumber].total_liters += Number(transaction.liters || 0);
        acc[cardNumber].total_amount += Number(transaction.total_amount || 0);
        acc[cardNumber].transactions.push(transaction);
        return acc;
      }, {} as Record<string, CardSummary>);

      // Sort: unassigned first, then by driver name
      const summaries = Object.values(grouped).sort((a, b) => {
        if (a.isUnassigned && !b.isUnassigned) return -1;
        if (!a.isUnassigned && b.isUnassigned) return 1;
        return a.driver_name.localeCompare(b.driver_name);
      });
      
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

  const handleAssignClick = (cardNumber: string) => {
    setSelectedCardNumber(cardNumber);
    setAssignModalOpen(true);
  };

  const handleAssignComplete = () => {
    fetchFuelTransactions();
  };

  // Format card number in readable chunks
  const formatCardNumber = (num: string) => {
    return num.replace(/(\d{4})/g, '$1 ').trim();
  };

  // Format number with Polish locale
  const formatNumber = (num: number, decimals: number = 2) => {
    return new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(num);
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

  const unassignedCount = cardSummaries.filter(c => c.isUnassigned).length;
  const totalAmount = cardSummaries.reduce((sum, card) => sum + card.total_amount, 0);
  const totalLiters = cardSummaries.reduce((sum, card) => sum + card.total_liters, 0);
  const totalTransactions = cardSummaries.reduce((sum, card) => sum + card.transaction_count, 0);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Rozliczenie paliwa</CardTitle>
              <CardDescription>
                Szczegółowe rozliczenie paliwa dla okresu {periodFrom} - {periodTo}
              </CardDescription>
            </div>
            {unassignedCount > 0 && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {unassignedCount} {unassignedCount === 1 ? 'karta nieprzypisana' : 'karty nieprzypisane'}
              </Badge>
            )}
          </div>
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
                  <TableRow 
                    key={card.card_number} 
                    className={cn(
                      "hover:bg-muted/50",
                      card.isUnassigned && "bg-destructive/5"
                    )}
                  >
                    <TableCell className="tabular-nums">
                      {formatCardNumber(card.card_number)}
                    </TableCell>
                    <TableCell>
                      {card.isUnassigned ? (
                        <button
                          onClick={() => handleAssignClick(card.card_number)}
                          className="text-destructive font-medium hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Nie przypisano
                        </button>
                      ) : (
                        card.driver_name
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {card.transaction_count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(card.total_liters)} L
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatNumber(card.total_amount)} zł
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
                                  <TableCell className="text-xs tabular-nums">
                                    {format(new Date(transaction.transaction_date), 'dd.MM.yyyy')}
                                  </TableCell>
                                  <TableCell className="text-xs tabular-nums">{transaction.transaction_time}</TableCell>
                                  <TableCell className="text-xs">{transaction.brand}</TableCell>
                                  <TableCell className="text-xs">{transaction.fuel_type}</TableCell>
                                  <TableCell className="text-xs text-right tabular-nums">
                                    {formatNumber(transaction.liters)} L
                                  </TableCell>
                                  <TableCell className="text-xs text-right tabular-nums">
                                    {formatNumber(transaction.price_per_liter)} zł
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-medium tabular-nums">
                                    {formatNumber(transaction.total_amount)} zł
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
                <TableCell className="text-right tabular-nums">{totalTransactions}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totalLiters)} L
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totalAmount)} zł
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <FuelCardAssignModal
        open={assignModalOpen}
        onOpenChange={setAssignModalOpen}
        cardNumber={selectedCardNumber}
        fleetId={fleetId}
        onComplete={handleAssignComplete}
      />
    </>
  );
}
