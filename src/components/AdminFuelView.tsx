import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { getWeekDates } from "@/lib/utils";

interface FuelTransaction {
  id: string;
  card_number: string;
  transaction_date: string;
  transaction_time: string;
  liters: number;
  price_per_liter: number;
  total_amount: number;
  brand: string;
  fuel_type: string;
  vehicle_number: string;
  driver_name: string;
}

interface CardSummary {
  cardNumber: string;
  driverName: string;
  transactionCount: number;
  totalLiters: number;
  totalAmount: number;
  transactions: FuelTransaction[];
}

export const AdminFuelView = () => {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [selectedWeek, setSelectedWeek] = useState(() => {
    // Set the newest week (first in reversed array) as default
    const weeks = getWeekDates(new Date().getFullYear());
    return weeks.length > 0 ? weeks[0].number.toString() : "1";
  });
  const [cardSummaries, setCardSummaries] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const weeks = getWeekDates(parseInt(year));

  useEffect(() => {
    if (selectedWeek) {
      fetchFuelTransactions();
    }
  }, [selectedWeek, year]);

  const fetchFuelTransactions = async () => {
    const week = weeks.find(w => w.number.toString() === selectedWeek);
    if (!week) return;

    setLoading(true);

    try {
      // Fetch all drivers with fuel cards
      const { data: drivers, error: driversError } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, fuel_card_number')
        .not('fuel_card_number', 'is', null);

      if (driversError) throw driversError;

      // Create a map of card numbers to driver names
      // Handle both formats: with and without leading zeros
      const cardToDriver = new Map<string, string>();
      drivers?.forEach(driver => {
        if (driver.fuel_card_number) {
          const fullName = `${driver.first_name || ''} ${driver.last_name || ''}`.trim();
          const driverName = fullName || 'Nieznany kierowca';
          
          // Map all possible formats
          cardToDriver.set(driver.fuel_card_number, driverName);
          cardToDriver.set(`00${driver.fuel_card_number}`, driverName);
          cardToDriver.set(`0${driver.fuel_card_number}`, driverName);
        }
      });

      // Fetch fuel transactions for the selected week
      const { data: transactions, error: transError } = await supabase
        .from('fuel_transactions')
        .select('*')
        .gte('transaction_date', week.start)
        .lte('transaction_date', week.end)
        .order('transaction_date', { ascending: false });

      if (transError) throw transError;

      // Group transactions by card number
      const summariesMap = new Map<string, CardSummary>();

      transactions?.forEach((trans: any) => {
        const cardNumber = trans.card_number;
        const driverName = cardToDriver.get(cardNumber) || trans.driver_name || 'Nieznany kierowca';

        if (!summariesMap.has(cardNumber)) {
          summariesMap.set(cardNumber, {
            cardNumber,
            driverName,
            transactionCount: 0,
            totalLiters: 0,
            totalAmount: 0,
            transactions: [],
          });
        }

        const summary = summariesMap.get(cardNumber)!;
        summary.transactionCount++;
        summary.totalLiters += parseFloat(trans.liters) || 0;
        summary.totalAmount += parseFloat(trans.total_amount) || 0;
        summary.transactions.push(trans);
      });

      const summariesArray = Array.from(summariesMap.values());
      summariesArray.sort((a, b) => b.totalAmount - a.totalAmount);

      setCardSummaries(summariesArray);
    } catch (error: any) {
      console.error('Error fetching fuel transactions:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się pobrać danych paliwowych",
        variant: "destructive",
      });
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

  const totals = cardSummaries.reduce(
    (acc, summary) => ({
      transactions: acc.transactions + summary.transactionCount,
      liters: acc.liters + summary.totalLiters,
      amount: acc.amount + summary.totalAmount,
    }),
    { transactions: 0, liters: 0, amount: 0 }
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dane paliwowe</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Rok</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map((y) => (
                  <SelectItem key={y} value={y.toString()}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Tydzień</label>
            <Select value={selectedWeek} onValueChange={setSelectedWeek}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz tydzień" />
              </SelectTrigger>
              <SelectContent>
                {weeks.map((week) => {
                  const isCurrentWeek = (() => {
                    const now = new Date();
                    const weekStart = new Date(week.start);
                    const weekEnd = new Date(week.end);
                    return now >= weekStart && now <= weekEnd;
                  })();

                  return (
                    <SelectItem 
                      key={week.number} 
                      value={week.number.toString()}
                      className={isCurrentWeek ? "bg-yellow-100 dark:bg-yellow-900/30" : ""}
                    >
                      {week.displayLabel}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && selectedWeek && cardSummaries.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Brak danych paliwowych dla wybranego tygodnia
          </div>
        )}

        {!loading && cardSummaries.length > 0 && (
          <div className="space-y-2">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 text-sm font-medium">Nr karty</th>
                    <th className="text-left py-2 px-2 text-sm font-medium">Kierowca</th>
                    <th className="text-right py-2 px-2 text-sm font-medium">Transakcje</th>
                    <th className="text-right py-2 px-2 text-sm font-medium">Litry</th>
                    <th className="text-right py-2 px-2 text-sm font-medium">Kwota</th>
                    <th className="text-center py-2 px-2 text-sm font-medium">Szczegóły</th>
                  </tr>
                </thead>
                <tbody>
                  {cardSummaries.map((summary) => (
                    <>
                      <tr key={summary.cardNumber} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-2 text-sm">{summary.cardNumber}</td>
                        <td className="py-2 px-2 text-sm">{summary.driverName}</td>
                        <td className="py-2 px-2 text-sm text-right">{summary.transactionCount}</td>
                        <td className="py-2 px-2 text-sm text-right">{summary.totalLiters.toFixed(2)} L</td>
                        <td className="py-2 px-2 text-sm text-right font-medium">{summary.totalAmount.toFixed(2)} zł</td>
                        <td className="py-2 px-2 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleCard(summary.cardNumber)}
                          >
                            {expandedCards.has(summary.cardNumber) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </td>
                      </tr>
                      {expandedCards.has(summary.cardNumber) && (
                        <tr>
                          <td colSpan={6} className="py-2 px-2 bg-muted/30">
                            <div className="space-y-1 text-sm">
                              {summary.transactions.map((trans) => (
                                <div key={trans.id} className="flex justify-between py-1 px-2 border-b border-border/50">
                                  <span>{trans.transaction_date} {trans.transaction_time}</span>
                                  <span>{trans.brand} - {trans.fuel_type}</span>
                                  <span>{parseFloat(trans.liters as any).toFixed(2)} L</span>
                                  <span className="font-medium">{parseFloat(trans.total_amount as any).toFixed(2)} zł</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  <tr className="font-bold border-t-2">
                    <td className="py-2 px-2 text-sm" colSpan={2}>SUMA</td>
                    <td className="py-2 px-2 text-sm text-right">{totals.transactions}</td>
                    <td className="py-2 px-2 text-sm text-right">{totals.liters.toFixed(2)} L</td>
                    <td className="py-2 px-2 text-sm text-right">{totals.amount.toFixed(2)} zł</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
