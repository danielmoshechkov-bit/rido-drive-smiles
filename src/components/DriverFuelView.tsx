import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState<FuelTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const formatFuelType = (brand: string, fuelType: string): string => {
    let shortType = fuelType;
    
    if (fuelType.includes('Skroplony gaz') || fuelType.includes('LPG')) {
      shortType = 'LPG';
    } else if (fuelType.includes('Benzyna 95')) {
      shortType = 'benzyna 95';
    } else if (fuelType.includes('Benzyna 98')) {
      shortType = 'benzyna 98';
    } else if (fuelType.includes('Diesel') || fuelType.includes('ON')) {
      shortType = 'diesel';
    }
    
    return `${brand} ${shortType}`;
  };

  useEffect(() => {
    if (periodFrom && periodTo && fuelCardNumber) {
      fetchFuelTransactions();
    }
  }, [fuelCardNumber, periodFrom, periodTo]);

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
      <CardHeader>
        <CardTitle>{t('fuel.title')}</CardTitle>
        <CardDescription>
          {t('fuel.transactions')} {periodFrom} - {periodTo}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 text-sm font-medium">{t('fuel.cardNumber')}</th>
                  <th className="text-right py-2 px-2 text-sm font-medium">{t('fuel.transactionCount')}</th>
                  <th className="text-right py-2 px-2 text-sm font-medium">{t('fuel.liters')}</th>
                  <th className="text-right py-2 px-2 text-sm font-medium">{t('fuel.amount')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-2 px-2 text-sm">{fuelCardNumber}</td>
                  <td className="py-2 px-2 text-sm text-right">{transactions.length}</td>
                  <td className="py-2 px-2 text-sm text-right">{totalLiters.toFixed(2)} L</td>
                  <td className="py-2 px-2 text-sm text-right font-medium">{totalAmount.toFixed(2)} zł</td>
                </tr>
                <tr className="font-bold border-t-2">
                  <td className="py-2 px-2 text-sm">{t('fuel.sum')}</td>
                  <td className="py-2 px-2 text-sm text-right">{transactions.length}</td>
                  <td className="py-2 px-2 text-sm text-right">{totalLiters.toFixed(2)} L</td>
                  <td className="py-2 px-2 text-sm text-right">{totalAmount.toFixed(2)} zł</td>
                </tr>
                <tr>
                  <td colSpan={4} className="py-2 px-2 text-center">
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
                    <td colSpan={4} className="py-2 px-2 bg-muted/30">
                      <div className="space-y-1 text-sm">
                        {transactions.map((trans) => (
                          <div key={trans.id} className="flex justify-between py-1 px-2 border-b border-border/50">
                            <span>{trans.transaction_date} {trans.transaction_time}</span>
                            <span>{formatFuelType(trans.brand, trans.fuel_type)}</span>
                            <span>{trans.liters.toFixed(2)} L</span>
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
