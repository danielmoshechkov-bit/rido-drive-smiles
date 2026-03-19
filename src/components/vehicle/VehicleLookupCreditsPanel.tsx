import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, CreditCard, ShoppingCart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVehicleLookup } from '@/hooks/useVehicleLookup';
import { VehicleLookupCreditsModal } from '@/components/vehicle/VehicleLookupCreditsModal';

interface Props {
  userId: string;
}

export function VehicleLookupCreditsPanel({ userId }: Props) {
  const { credits, creditsLoading, purchaseCredits, refreshCredits } = useVehicleLookup(userId);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [usage, setUsage] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const [txRes, usageRes] = await Promise.all([
        supabase.from('vehicle_lookup_credit_transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
        supabase.from('vehicle_lookup_usage').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
      ]);
      setTransactions(txRes.data || []);
      setUsage(usageRes.data || []);
      setLoadingHistory(false);
    };
    fetchHistory();
  }, [userId]);

  const handlePurchase = async (amount: number, priceNet: number) => {
    const ok = await purchaseCredits(amount, priceNet);
    if (ok) {
      setShowBuyModal(false);
      // Refresh history
      const { data } = await supabase.from('vehicle_lookup_credit_transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
      setTransactions(data || []);
    }
  };

  if (creditsLoading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Sprawdzenia pojazdów
          </CardTitle>
          <CardDescription>Zarządzaj kredytami do pobierania danych pojazdów</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Credits summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-3xl font-bold text-primary">{credits?.remaining_credits || 0}</div>
                <div className="text-sm text-muted-foreground">Pozostałe kredyty</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-3xl font-bold">{credits?.total_credits_purchased || 0}</div>
                <div className="text-sm text-muted-foreground">Kupione łącznie</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-3xl font-bold">{usage.length}</div>
                <div className="text-sm text-muted-foreground">Sprawdzenia</div>
              </CardContent>
            </Card>
          </div>

          <Button onClick={() => setShowBuyModal(true)} className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Dokup kredyty
          </Button>

          {/* Usage history */}
          <div>
            <h4 className="font-medium mb-2">Historia sprawdzeń</h4>
            {loadingHistory ? (
              <Loader2 className="h-5 w-5 animate-spin mx-auto" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Nr rejestracyjny</TableHead>
                    <TableHead>VIN</TableHead>
                    <TableHead>Źródło</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Brak sprawdzeń</TableCell></TableRow>
                  )}
                  {usage.map((u: any) => (
                    <TableRow key={u.id}>
                      <TableCell className="text-sm">{new Date(u.created_at).toLocaleDateString('pl-PL')}</TableCell>
                      <TableCell className="font-mono text-sm">{u.registration_number || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">{u.vin || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {u.source_type === 'cache' ? 'Baza' : u.source_type === 'external_api' ? 'API' : 'VIN'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Transaction history */}
          <div>
            <h4 className="font-medium mb-2">Historia zakupów</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Kredyty</TableHead>
                  <TableHead>Kwota netto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.filter((t: any) => t.type !== 'usage').length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Brak zakupów</TableCell></TableRow>
                )}
                {transactions.filter((t: any) => t.type !== 'usage').map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm">{new Date(t.created_at).toLocaleDateString('pl-PL')}</TableCell>
                    <TableCell>
                      <Badge variant={t.type === 'purchase' ? 'default' : 'outline'}>
                        {t.type === 'purchase' ? 'Zakup' : t.type === 'manual_add' ? 'Dodane' : 'Odjęte'}
                      </Badge>
                    </TableCell>
                    <TableCell className={t.credits > 0 ? 'text-green-600' : 'text-red-600'}>
                      {t.credits > 0 ? '+' : ''}{t.credits}
                    </TableCell>
                    <TableCell>{t.price_net ? `${Number(t.price_net).toFixed(2)} zł` : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <VehicleLookupCreditsModal
        open={showBuyModal}
        onOpenChange={setShowBuyModal}
        onPurchase={handlePurchase}
      />
    </>
  );
}
