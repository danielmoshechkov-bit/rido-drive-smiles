import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CreditCard, Save, Wallet, History, ShoppingCart, RefreshCw, Gift, Search, Car, MessageSquare, Plus, Minus } from 'lucide-react';
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
            <TabsTrigger value="assign-credits" className="gap-1.5">
              <Gift className="h-3.5 w-3.5" /> Przyznaj kredyty
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
          <TabsContent value="assign-credits">
            <AssignCreditsPanel />
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

// ==================== Assign Credits Panel ====================

function AssignCreditsPanel() {
  const [email, setEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<{ id: string; email: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [creditType, setCreditType] = useState<'vehicle' | 'sms'>('vehicle');
  const [amount, setAmount] = useState(10);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [userCredits, setUserCredits] = useState<{ vehicle: number; sms: number }>({ vehicle: 0, sms: 0 });

  const searchUser = async () => {
    if (!email.trim()) return;
    setSearching(true);
    setFoundUser(null);
    setNotFound(false);

    // Search in auth users via profiles or direct
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name')
      .ilike('display_name', `%${email.trim()}%`)
      .limit(1)
      .maybeSingle();

    // Also try by auth - we'll use a different approach: query by email in RPC or check
    // Since we can't query auth.users directly, let's check vehicle_lookup_credits
    // Actually, the simplest: use supabase admin list users - but from client we can't
    // Let's search by checking if we have any data for this email
    
    // Try to find user by email using the profiles approach or just store the email
    // For admin usage, let's use a simple approach: look up by email
    const { data: authData } = await supabase.rpc('admin_find_user_by_email', { p_email: email.trim() }).maybeSingle();
    
    if (authData) {
      setFoundUser({ id: authData.id, email: authData.email || email.trim() });
      await loadUserCredits(authData.id);
    } else {
      // Fallback: try to find in profiles by display_name containing email
      setNotFound(true);
    }
    setSearching(false);
  };

  const loadUserCredits = async (userId: string) => {
    const { data: vehicleData } = await supabase
      .from('vehicle_lookup_credits')
      .select('remaining_credits')
      .eq('user_id', userId)
      .maybeSingle();

    setUserCredits({
      vehicle: vehicleData?.remaining_credits ?? 0,
      sms: 0, // TODO: when SMS credits table exists
    });
  };

  const handleAssign = async () => {
    if (!foundUser || amount <= 0) return;
    setSaving(true);

    try {
      const { data: { user: adminUser } } = await supabase.auth.getUser();

      if (creditType === 'vehicle') {
        // Check if user has a credits record
        const { data: existing } = await supabase
          .from('vehicle_lookup_credits')
          .select('id, remaining_credits, total_credits_purchased')
          .eq('user_id', foundUser.id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('vehicle_lookup_credits')
            .update({
              remaining_credits: existing.remaining_credits + amount,
              total_credits_purchased: existing.total_credits_purchased + amount,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('vehicle_lookup_credits')
            .insert({
              user_id: foundUser.id,
              remaining_credits: amount,
              total_credits_purchased: amount,
            });
        }

        // Log transaction
        await supabase.from('vehicle_lookup_credit_transactions').insert({
          user_id: foundUser.id,
          type: 'manual_add',
          credits: amount,
          source: 'admin',
          note: note || `Przyznano przez admina`,
          created_by_admin_id: adminUser?.id || null,
        });

        toast.success(`Przyznano ${amount} kredytów sprawdzeń pojazdów dla ${foundUser.email}`);
      } else {
        // SMS credits - placeholder for now
        toast.info(`Kredyty SMS zostaną dodane po wdrożeniu modułu SMS`);
      }

      await loadUserCredits(foundUser.id);
      setAmount(10);
      setNote('');
    } catch (e: any) {
      toast.error('Błąd: ' + (e?.message || 'Nieznany błąd'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search user */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Znajdź użytkownika
          </CardTitle>
          <CardDescription>Wpisz adres e-mail konta, któremu chcesz przyznać kredyty</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="np. warsztat@test.pl"
              value={email}
              onChange={e => { setEmail(e.target.value); setNotFound(false); setFoundUser(null); }}
              onKeyDown={e => e.key === 'Enter' && searchUser()}
              className="flex-1"
            />
            <Button onClick={searchUser} disabled={searching || !email.trim()} className="gap-2">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Szukaj
            </Button>
          </div>

          {notFound && (
            <p className="text-sm text-destructive mt-2">Nie znaleziono użytkownika o podanym adresie e-mail</p>
          )}
        </CardContent>
      </Card>

      {/* User found - assign credits */}
      {foundUser && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="h-4 w-4" />
              Przyznaj kredyty
            </CardTitle>
            <CardDescription>
              Użytkownik: <span className="font-semibold text-foreground">{foundUser.email}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current balances */}
            <div className="flex gap-4">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10">
                <Car className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium">Sprawdzenia pojazdów: <span className="font-bold">{userCredits.vehicle}</span></span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted">
                <MessageSquare className="h-4 w-4" />
                <span className="text-sm font-medium">SMS: <span className="font-bold">{userCredits.sms}</span></span>
              </div>
            </div>

            {/* Credit type */}
            <div className="space-y-2">
              <Label>Typ kredytów</Label>
              <Select value={creditType} onValueChange={(v: 'vehicle' | 'sms') => setCreditType(v)}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vehicle">
                    <span className="flex items-center gap-2"><Car className="h-4 w-4" /> Sprawdzenia pojazdów</span>
                  </SelectItem>
                  <SelectItem value="sms">
                    <span className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Pakiet SMS</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label>Liczba kredytów do przyznania</Label>
              <div className="flex items-center gap-0 border rounded-lg overflow-hidden w-fit">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-none border-r"
                  onClick={() => setAmount(prev => Math.max(1, prev - 10))}
                  disabled={amount <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 text-center border-0 rounded-none"
                  min={1}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-none border-l"
                  onClick={() => setAmount(prev => prev + 10)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label>Notatka (opcjonalnie)</Label>
              <Input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="np. Bonus powitalny, rekompensata..."
              />
            </div>

            {/* Submit */}
            <Button onClick={handleAssign} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
              Przyznaj {amount} kredytów
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== Payment Gateway Config ====================

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

// ==================== Payment History ====================

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
