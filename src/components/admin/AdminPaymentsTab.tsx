import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, CreditCard, Save, Wallet, History, ShoppingCart, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function AdminPaymentsTab() {
  const [activeTab, setActiveTab] = useState('gateways');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Płatności
        </CardTitle>
        <CardDescription>Bramki płatnicze, subskrypcje i jednorazowe zakupy</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="gateways" className="gap-1.5">
              <CreditCard className="h-3.5 w-3.5" /> Bramki płatnicze
            </TabsTrigger>
            <TabsTrigger value="subscriptions" className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Subskrypcje
            </TabsTrigger>
            <TabsTrigger value="onetime" className="gap-1.5">
              <ShoppingCart className="h-3.5 w-3.5" /> Jednorazowe zakupy
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-3.5 w-3.5" /> Historia płatności
            </TabsTrigger>
          </TabsList>

          <TabsContent value="gateways">
            <PaymentGatewayConfig />
          </TabsContent>
          <TabsContent value="subscriptions">
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">Subskrypcje miesięczne</p>
              <p className="text-sm mt-1">Architektura gotowa – konfiguracja wkrótce</p>
            </div>
          </TabsContent>
          <TabsContent value="onetime">
            <div className="text-center py-8 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">Jednorazowe zakupy</p>
              <p className="text-sm mt-1">Kredyty pojazdowe – aktywne. Kolejne produkty wkrótce.</p>
            </div>
          </TabsContent>
          <TabsContent value="history">
            <PaymentHistory />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function PaymentGatewayConfig() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('payment_gateway_config').select('*').order('created_at');
      setConfigs(data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {configs.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>Brak skonfigurowanych bramek płatniczych</p>
          <p className="text-sm mt-1">Dodaj bramkę aby umożliwić płatności online</p>
        </div>
      )}
      {configs.map(cfg => (
        <Card key={cfg.id}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{cfg.name}</p>
                <p className="text-sm text-muted-foreground">{cfg.provider}</p>
              </div>
              <Badge variant={cfg.is_enabled ? 'default' : 'secondary'}>
                {cfg.is_enabled ? 'Aktywna' : 'Nieaktywna'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PaymentHistory() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('vehicle_lookup_credit_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      setTransactions(data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Typ</TableHead>
          <TableHead>Kredyty</TableHead>
          <TableHead>Cena netto</TableHead>
          <TableHead>Źródło</TableHead>
          <TableHead>Notatka</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.length === 0 && (
          <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Brak transakcji</TableCell></TableRow>
        )}
        {transactions.map(t => (
          <TableRow key={t.id}>
            <TableCell className="text-sm">{new Date(t.created_at).toLocaleDateString('pl-PL')}</TableCell>
            <TableCell>
              <Badge variant={t.type === 'purchase' ? 'default' : t.type === 'usage' ? 'secondary' : 'outline'}>
                {t.type === 'purchase' ? 'Zakup' : t.type === 'usage' ? 'Użycie' : t.type === 'manual_add' ? 'Dodane' : 'Odjęte'}
              </Badge>
            </TableCell>
            <TableCell className={t.credits > 0 ? 'text-green-600' : 'text-red-600'}>{t.credits > 0 ? '+' : ''}{t.credits}</TableCell>
            <TableCell>{t.price_net ? `${Number(t.price_net).toFixed(2)} zł` : '-'}</TableCell>
            <TableCell className="text-sm">{t.source}</TableCell>
            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{t.note || '-'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
