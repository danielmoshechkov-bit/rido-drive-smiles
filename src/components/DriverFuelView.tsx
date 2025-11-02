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
      toast.error(t('fuel.errorLoading'));
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
          {t('fuel.noDataForPeriod')}
        </CardContent>
      </Card>
    );
  }

  const totalAmount = transactions.reduce((sum, t) => sum + t.total_amount, 0);
  const totalLiters = transactions.reduce((sum, t) => sum + t.liters, 0);

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-2">
        <CardTitle className="text-sm">{t('fuel.title')}</CardTitle>
        <CardDescription className="text-xs">
          {t('fuel.transactionsForPeriod')} {periodFrom} - {periodTo}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-2">
        <div className="space-y-1">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5 px-1.5 text-xs font-medium">{t('fuel.cardNumber')}</th>
                  <th className="text-right py-1.5 px-1.5 text-xs font-medium">{t('fuel.transactions')}</th>
                  <th className="text-right py-1.5 px-1.5 text-xs font-medium">{t('fuel.liters')}</th>
                  <th className="text-right py-1.5 px-1.5 text-xs font-medium">{t('fuel.amount')}</th>
                  <th className="text-center py-1.5 px-1.5 text-xs font-medium">{t('fuel.details')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-1.5 px-1.5 text-xs">{fuelCardNumber}</td>
                  <td className="py-1.5 px-1.5 text-xs text-right">{transactions.length}</td>
                  <td className="py-1.5 px-1.5 text-xs text-right">{totalLiters.toFixed(2)} L</td>
                  <td className="py-1.5 px-1.5 text-xs text-right font-medium">{totalAmount.toFixed(2)} zł</td>
                  <td className="py-1.5 px-1.5 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpanded(!expanded)}
                      className="h-6 w-6 p-0"
                    >
                      {expanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </Button>
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={5} className="py-1.5 px-1.5 bg-muted/30">
                      <div className="space-y-0.5 text-xs">
                        {transactions.map((trans) => (
                          <div key={trans.id} className="flex justify-between py-0.5 px-1.5 border-b border-border/50">
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
                  <td className="py-1.5 px-1.5 text-xs">{t('fuel.total')}</td>
                  <td className="py-1.5 px-1.5 text-xs text-right">{transactions.length}</td>
                  <td className="py-1.5 px-1.5 text-xs text-right">{totalLiters.toFixed(2)} L</td>
                  <td className="py-1.5 px-1.5 text-xs text-right">{totalAmount.toFixed(2)} zł</td>
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
