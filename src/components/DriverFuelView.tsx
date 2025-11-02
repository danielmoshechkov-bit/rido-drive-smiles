import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { getAvailableWeeks, getCurrentWeekNumber } from '@/lib/utils';
import { PinDisplay } from '@/components/PinDisplay';

interface DriverFuelViewProps {
  fuelCardNumber: string;
  fuelCardPin?: string;
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

export function DriverFuelView({ fuelCardNumber, fuelCardPin }: DriverFuelViewProps) {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState<FuelTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const currentYear = new Date().getFullYear();
    return getCurrentWeekNumber(currentYear);
  });

  const weeks = getAvailableWeeks(selectedYear);
  const selectedWeekData = weeks.find(w => w.number === selectedWeek);
  const periodFrom = selectedWeekData?.start;
  const periodTo = selectedWeekData?.end;

  const years = [2023, 2024, 2025, 2026];

  const formatFuelType = (brand: string, fuelType: string): string => {
    let shortType = fuelType;
    
    if (fuelType.includes('Skroplony gaz') || fuelType.includes('LPG')) {
      shortType = 'LPG';
    } else if (fuelType.includes('Benzyna 95')) {
      shortType = 'PB95';
    } else if (fuelType.includes('Benzyna 98')) {
      shortType = 'PB98';
    } else if (fuelType.includes('Diesel') || fuelType.includes('ON')) {
      shortType = 'diesel';
    }
    
    return `${brand} ${shortType}`;
  };

  useEffect(() => {
    if (periodFrom && periodTo && fuelCardNumber) {
      fetchFuelTransactions();
    }
  }, [fuelCardNumber, periodFrom, periodTo, selectedYear, selectedWeek]);

  const fetchFuelTransactions = async () => {
    try {
      setLoading(true);

      // Use secure RPC function to fetch driver's own fuel transactions
      const { data: driverTransactions, error: transactionsError } = await supabase
        .rpc('my_fuel_transactions', {
          p_from: periodFrom,
          p_to: periodTo
        });

      if (transactionsError) throw transactionsError;

      setTransactions(driverTransactions || []);

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
          {t('fuel.noTransactions')}
        </CardContent>
      </Card>
    );
  }

  const totalAmount = transactions.reduce((sum, t) => sum + t.total_amount, 0);
  const totalLiters = transactions.reduce((sum, t) => sum + t.liters, 0);

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center gap-4 flex-wrap">
          <CardTitle className="whitespace-nowrap">{t('fuel.title')}</CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-sm whitespace-nowrap">Rok:</Label>
            <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="h-9 px-3 w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm whitespace-nowrap">Okres:</Label>
            <Select value={selectedWeek.toString()} onValueChange={(v) => setSelectedWeek(parseInt(v))}>
              <SelectTrigger className="h-9 px-3 w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {weeks.map(week => (
                  <SelectItem key={week.number} value={week.number.toString()}>
                    {week.displayLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      
      {/* Card number and PIN below header */}
      <div className="px-6 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Karta:</span>
          <span className="text-sm font-medium">{fuelCardNumber}</span>
        </div>
        {fuelCardPin && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">PIN:</span>
            <PinDisplay pin={fuelCardPin} />
          </div>
        )}
      </div>
      
      <CardContent>
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 text-sm font-medium">{t('fuel.cardNumber')}</th>
                  <th className="text-right py-2 px-2 text-sm font-medium">{t('fuel.transactionCount')}</th>
                  <th className="text-right py-2 px-2 text-sm font-medium">{t('fuel.amount')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-2 px-2 text-sm">{fuelCardNumber}</td>
                  <td className="py-2 px-2 text-sm text-right">{transactions.length}</td>
                  <td className="py-2 px-2 text-sm text-right font-medium">{totalAmount.toFixed(2)} zł</td>
                </tr>
                <tr className="font-bold border-t-2">
                  <td className="py-2 px-2 text-sm">{t('fuel.sum')}</td>
                  <td className="py-2 px-2 text-sm text-right">{transactions.length}</td>
                  <td className="py-2 px-2 text-sm text-right">{totalAmount.toFixed(2)} zł</td>
                </tr>
                <tr>
                  <td colSpan={3} className="py-2 px-2 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpanded(!expanded)}
                      className="w-full"
                    >
                      {expanded ? (
                        <>
                          <ChevronUp className="h-4 w-4 mr-2" />
                          {t('fuel.hideDetails')}
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 mr-2" />
                          {t('fuel.showDetails')}
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={3} className="py-2 px-2 bg-muted/30">
                      <div className="space-y-1 text-sm">
                        {transactions.map((trans) => (
                          <div key={trans.id} className="flex justify-between py-1 px-2 border-b border-border/50">
                            <span>{trans.transaction_date} {trans.transaction_time}</span>
                            <span>{formatFuelType(trans.brand, trans.fuel_type)}</span>
                            <span className="font-medium">{trans.total_amount.toFixed(2)} zł</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
