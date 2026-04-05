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
import { Loader2, CreditCard, Save, Wallet, History, ShoppingCart, RefreshCw, Gift, Search, MessageSquare, Sparkles, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function AdminPaymentsTab() {
  const [activeTab, setActiveTab] = useState('gateways');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="bg-gradient-hero text-primary-foreground rounded-lg p-1 shadow-purple h-10 w-full mb-4">
        <TabsTrigger value="gateways" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-accent/20 rounded-md transition-colors px-2.5 py-1.5 text-sm font-medium flex-1">
          <div className="flex items-center gap-1.5 justify-center">
            <CreditCard className="h-3.5 w-3.5" /> Bramki
          </div>
        </TabsTrigger>
        <TabsTrigger value="assign-credits" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-accent/20 rounded-md transition-colors px-2.5 py-1.5 text-sm font-medium flex-1">
          <div className="flex items-center gap-1.5 justify-center">
            <Gift className="h-3.5 w-3.5" /> Kredyty
          </div>
        </TabsTrigger>
        <TabsTrigger value="onetime" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-accent/20 rounded-md transition-colors px-2.5 py-1.5 text-sm font-medium flex-1">
          <div className="flex items-center gap-1.5 justify-center">
            <ShoppingCart className="h-3.5 w-3.5" /> Pakiety
          </div>
        </TabsTrigger>
        <TabsTrigger value="history" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-accent/20 rounded-md transition-colors px-2.5 py-1.5 text-sm font-medium flex-1">
          <div className="flex items-center gap-1.5 justify-center">
            <History className="h-3.5 w-3.5" /> Historia
          </div>
        </TabsTrigger>
        <TabsTrigger value="subscriptions" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-accent/20 rounded-md transition-colors px-2.5 py-1.5 text-sm font-medium flex-1">
          <div className="flex items-center gap-1.5 justify-center">
            <RefreshCw className="h-3.5 w-3.5" /> Subskrypcje
          </div>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="gateways"><PaymentGatewayConfig /></TabsContent>
      <TabsContent value="assign-credits"><AssignCreditsPanel /></TabsContent>
      <TabsContent value="onetime"><CreditPackagesManager /></TabsContent>
      <TabsContent value="history"><PaymentHistory /></TabsContent>
      <TabsContent value="subscriptions">
        <div className="text-center py-8 text-muted-foreground">
          <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium">Subskrypcje miesięczne</p>
          <p className="text-sm mt-1">Wkrótce — konfiguracja planów abonamentowych</p>
        </div>
      </TabsContent>
    </Tabs>
  );
}

// ==================== Payment Gateway Config ====================

function PaymentGatewayConfig() {
  const [provider, setProvider] = useState('przelewy24');
  const [merchantId, setMerchantId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [posId, setPosId] = useState('');
  const [isSandbox, setIsSandbox] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    const { data } = await supabase.from('payment_gateway_config').select('*').order('created_at');
    setConfigs(data || []);
    if (data && data.length > 0) {
      const cfg = data[0];
      setProvider(cfg.provider || 'przelewy24');
      setMerchantId(cfg.merchant_id || '');
      setPosId((cfg as any).pos_id || '');
      setIsSandbox(cfg.is_test_mode !== false);
      setIsActive(cfg.is_enabled || false);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        provider,
        merchant_id: merchantId,
        api_key_secret_name: apiKey || undefined,
        pos_id: posId || merchantId,
        is_sandbox: isSandbox,
        is_enabled: isActive,
        name: `${provider} ${isSandbox ? '(sandbox)' : '(prod)'}`,
      };

      if (configs.length > 0) {
        await supabase.from('payment_gateway_config').update(payload).eq('id', configs[0].id);
      } else {
        await supabase.from('payment_gateway_config').insert(payload);
      }
      toast.success('Konfiguracja bramki zapisana');
      await loadConfigs();
    } catch (e: any) {
      toast.error('Błąd: ' + e.message);
    }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> Konfiguracja bramki płatniczej
        </CardTitle>
        <CardDescription>Podłącz Przelewy24, PayU lub Stripe</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Dostawca</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="przelewy24">Przelewy24</SelectItem>
                <SelectItem value="payu">PayU</SelectItem>
                <SelectItem value="stripe">Stripe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Merchant ID</Label>
            <Input value={merchantId} onChange={e => setMerchantId(e.target.value)} placeholder="np. 123456" />
          </div>
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Klucz API" />
          </div>
          <div className="space-y-2">
            <Label>POS ID {provider === 'przelewy24' ? '(dla P24)' : '(opcjonalnie)'}</Label>
            <Input value={posId} onChange={e => setPosId(e.target.value)} placeholder="POS ID" />
          </div>
        </div>

        <div className="flex items-center gap-6 pt-2">
          <div className="flex items-center gap-2">
            <Switch checked={isSandbox} onCheckedChange={setIsSandbox} />
            <Label>Tryb sandbox</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>Bramka aktywna</Label>
          </div>
          <Badge variant={isActive ? 'default' : 'secondary'} className="ml-auto">
            {isActive ? '● Aktywna' : '○ Nieaktywna'}
          </Badge>
        </div>

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Zapisz konfigurację
        </Button>
      </CardContent>
    </Card>
  );
}

// ==================== Assign Credits Panel ====================

function AssignCreditsPanel() {
  const [email, setEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{ id: string; email: string }[]>([]);
  const [foundUser, setFoundUser] = useState<{ id: string; email: string } | null>(null);
  const [creditType, setCreditType] = useState('sms');
  const [amount, setAmount] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (email.trim().length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await supabase.rpc('admin_find_user_by_email', { p_email: email.trim() });
        const results = Array.isArray(data) ? data : data ? [data] : [];
        setSearchResults(results.filter((r: any) => r?.id).map((r: any) => ({ id: r.id as string, email: (r.email as string) || '' })));
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [email]);

  const selectUser = (user: { id: string; email: string }) => {
    setFoundUser(user);
    setEmail(user.email);
    setSearchResults([]);
  };

  const handleAssign = async () => {
    if (!foundUser || !amount || amount <= 0) return;
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('payment-core', {
        body: { action: 'admin_grant', user_id: foundUser.id, credit_type: creditType, amount },
      });
      if (error) throw error;
      toast.success(`Przyznano ${amount} kredytów (${creditType}) dla ${foundUser.email}`);
      setAmount('');
    } catch (e: any) {
      toast.error('Błąd: ' + (e?.message || 'Nieznany'));
    }
    setSaving(false);
  };

  const creditTypes = [
    { value: 'sms', label: 'SMS', icon: MessageSquare },
    { value: 'ai', label: 'AI', icon: Sparkles },
    { value: 'ai_photo', label: 'AI Zdjęcia', icon: Sparkles },
    { value: 'listing_featured', label: 'Wyróżnienia', icon: Star },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" /> Znajdź użytkownika</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-md">
            <div className="flex gap-2">
              <Input
                placeholder="Email użytkownika..."
                value={email}
                onChange={e => { setEmail(e.target.value); setFoundUser(null); }}
                className="flex-1"
              />
              {searching && <Loader2 className="h-4 w-4 animate-spin absolute right-14 top-3" />}
            </div>
            {searchResults.length > 0 && !foundUser && (
              <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map(user => (
                  <button key={user.id} onClick={() => selectUser(user)} className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors text-sm">
                    {user.email}
                  </button>
                ))}
              </div>
            )}
          </div>
          {foundUser && <p className="text-sm text-green-600 mt-2">✓ {foundUser.email}</p>}
        </CardContent>
      </Card>

      {foundUser && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Gift className="h-4 w-4" /> Przyznaj kredyty</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Typ kredytów</Label>
              <Select value={creditType} onValueChange={setCreditType}>
                <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {creditTypes.map(ct => (
                    <SelectItem key={ct.value} value={ct.value}>
                      <span className="flex items-center gap-2"><ct.icon className="h-4 w-4" /> {ct.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ilość</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))} placeholder="np. 50" className="max-w-xs" min={1} />
            </div>
            <Button onClick={handleAssign} disabled={saving || !amount || amount <= 0} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
              Przyznaj {amount || 0} kredytów
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== Credit Packages Manager ====================

function CreditPackagesManager() {
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('credit_packages' as any).select('*').order('credit_type').order('price').then(({ data }) => {
      setPackages((data as any[]) || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const typeLabels: Record<string, string> = { sms: 'SMS', ai_photo: 'AI Zdjęcia', listing_featured: 'Wyróżnienia', ai: 'AI' };

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nazwa</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead>Kredyty</TableHead>
            <TableHead>Cena (zł)</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {packages.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Brak pakietów</TableCell></TableRow>
          )}
          {packages.map((pkg: any) => (
            <TableRow key={pkg.id}>
              <TableCell className="font-medium">{pkg.name}</TableCell>
              <TableCell><Badge variant="outline">{typeLabels[pkg.credit_type] || pkg.credit_type}</Badge></TableCell>
              <TableCell>{pkg.credits_amount}</TableCell>
              <TableCell>{Number(pkg.price).toFixed(2)}</TableCell>
              <TableCell>
                <Badge variant={pkg.is_active ? 'default' : 'secondary'}>{pkg.is_active ? 'Aktywny' : 'Nieaktywny'}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ==================== Payment History ====================

function PaymentHistory() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [totalRevenue, setTotalRevenue] = useState(0);

  useEffect(() => {
    loadPayments();
  }, [filter]);

  const loadPayments = async () => {
    setLoading(true);
    let query = supabase.from('payments' as any).select('*').order('created_at', { ascending: false }).limit(100);
    if (filter !== 'all') {
      query = query.eq('status', filter);
    }
    const { data } = await query;
    const items = (data as any[]) || [];
    setPayments(items);
    setTotalRevenue(items.filter((p: any) => p.status === 'paid').reduce((s: number, p: any) => s + Number(p.amount || 0), 0));
    setLoading(false);
  };

  const productLabels: Record<string, string> = {
    marketplace_purchase: 'Marketplace',
    ai_photo_package: 'AI Zdjęcia',
    sms_credits: 'SMS',
    ai_credits: 'AI',
    listing_featured: 'Wyróżnienie',
    subscription: 'Subskrypcja',
    inpost_label: 'InPost',
  };

  const statusColors: Record<string, string> = {
    pending: 'secondary',
    paid: 'default',
    failed: 'destructive',
    refunded: 'outline',
    cancelled: 'secondary',
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {/* Revenue metric */}
      <Card className="border-primary/20">
        <CardContent className="pt-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Łączny przychód (opłacone)</p>
            <p className="text-2xl font-bold text-primary">{totalRevenue.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</p>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'paid', 'failed', 'refunded'].map(s => (
          <Button key={s} variant={filter === s ? 'default' : 'outline'} size="sm" onClick={() => setFilter(s)}>
            {s === 'all' ? 'Wszystkie' : s === 'pending' ? 'Oczekujące' : s === 'paid' ? 'Opłacone' : s === 'failed' ? 'Nieudane' : 'Zwroty'}
          </Button>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead>Kwota</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Bramka</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Brak transakcji</TableCell></TableRow>
          )}
          {payments.map((p: any) => (
            <TableRow key={p.id}>
              <TableCell className="text-sm">{new Date(p.created_at).toLocaleDateString('pl-PL')}</TableCell>
              <TableCell><Badge variant="outline">{productLabels[p.product_type] || p.product_type}</Badge></TableCell>
              <TableCell className="font-medium">{Number(p.amount).toFixed(2)} zł</TableCell>
              <TableCell>
                <Badge variant={(statusColors[p.status] || 'secondary') as any}>
                  {p.status === 'paid' ? 'Opłacona' : p.status === 'pending' ? 'Oczekuje' : p.status === 'failed' ? 'Nieudana' : p.status}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{p.gateway || '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
