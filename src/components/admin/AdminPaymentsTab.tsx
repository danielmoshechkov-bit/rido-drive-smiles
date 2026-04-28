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

interface CompanyRow {
  id: string; user_id: string; email: string;
  company_name: string | null; company_nip: string | null;
  company_address: string | null; company_city: string | null;
  company_phone: string | null; sms_balance: number | null;
}

function AssignCreditsPanel() {
  const [email, setEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{ id: string; email: string }[]>([]);
  const [foundUser, setFoundUser] = useState<{ id: string; email: string; company_name?: string | null } | null>(null);
  const [creditType, setCreditType] = useState('sms');
  const [amount, setAmount] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);

  // Companies list + filters
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [companyFilter, setCompanyFilter] = useState('');

  // Vehicle search (VIN / plate)
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [vehicleSearching, setVehicleSearching] = useState(false);
  const [vehicleResults, setVehicleResults] = useState<Array<{ user_id: string; email: string; company_name: string | null; plate: string | null; vin: string | null; source: string }>>([]);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    setLoadingCompanies(true);
    try {
      const { data, error } = await supabase
        .from('service_providers')
        .select('id, user_id, owner_email, company_name, company_nip, company_address, company_city, company_phone, sms_balance')
        .order('company_name', { ascending: true })
        .limit(500);
      if (error) throw error;
      setCompanies((data || []).map((r: any) => ({
        id: r.id, user_id: r.user_id, email: r.owner_email || '',
        company_name: r.company_name, company_nip: r.company_nip,
        company_address: r.company_address, company_city: r.company_city,
        company_phone: r.company_phone, sms_balance: r.sms_balance,
      })));
    } catch (e: any) {
      console.error('loadCompanies', e);
    }
    setLoadingCompanies(false);
  };

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

  const selectUser = (user: { id: string; email: string; company_name?: string | null }) => {
    setFoundUser(user);
    setEmail(user.email);
    setSearchResults([]);
  };

  const selectCompany = (c: CompanyRow) => {
    if (!c.user_id) {
      toast.error('Ta firma nie ma jeszcze konta użytkownika');
      return;
    }
    setFoundUser({ id: c.user_id, email: c.email, company_name: c.company_name });
    setEmail(c.email);
    setSearchResults([]);
  };

  // Vehicle search by VIN or plate
  useEffect(() => {
    const q = vehicleQuery.trim().toUpperCase();
    if (q.length < 3) { setVehicleResults([]); return; }
    const timer = setTimeout(async () => {
      setVehicleSearching(true);
      try {
        // Search workshop_vehicles
        const { data: wv } = await supabase
          .from('workshop_vehicles')
          .select('vin, plate, provider_id')
          .or(`vin.ilike.%${q}%,plate.ilike.%${q}%`)
          .limit(20);

        // Resolve providers from workshop_vehicles
        const providerIds = Array.from(new Set((wv || []).map((v: any) => v.provider_id).filter(Boolean)));
        const providersMap = new Map<string, { user_id: string; email: string; company_name: string | null }>();
        if (providerIds.length) {
          const { data: provs } = await supabase
            .from('service_providers')
            .select('id, user_id, owner_email, company_name')
            .in('id', providerIds);
          (provs || []).forEach((p: any) => providersMap.set(p.id, { user_id: p.user_id, email: p.owner_email || '', company_name: p.company_name }));
        }

        const results: typeof vehicleResults = [];
        (wv || []).forEach((v: any) => {
          const p = providersMap.get(v.provider_id);
          if (p?.user_id) results.push({ user_id: p.user_id, email: p.email, company_name: p.company_name, plate: v.plate, vin: v.vin, source: 'Warsztat' });
        });

        // Also search vehicles (fleet)
        const { data: fv } = await supabase
          .from('vehicles')
          .select('vin, plate')
          .or(`vin.ilike.%${q}%,plate.ilike.%${q}%`)
          .limit(20);
        // fleet vehicles don't directly link to provider user; skip user resolve for now
        (fv || []).forEach((v: any) => {
          // mark as "Flota" but without account link
          if (!results.find(r => r.vin === v.vin && r.plate === v.plate)) {
            results.push({ user_id: '', email: '', company_name: null, plate: v.plate, vin: v.vin, source: 'Flota (brak konta usługodawcy)' });
          }
        });

        setVehicleResults(results);
      } catch (e) {
        console.error('vehicle search', e);
        setVehicleResults([]);
      }
      setVehicleSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [vehicleQuery]);

  const filteredCompanies = companies.filter(c => {
    const q = companyFilter.trim().toLowerCase();
    if (!q) return true;
    return (
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.company_nip || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.company_address || '').toLowerCase().includes(q) ||
      (c.company_city || '').toLowerCase().includes(q) ||
      (c.company_phone || '').toLowerCase().includes(q)
    );
  });

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
      {/* Vehicle search by VIN / plate */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" /> Szukaj po VIN / nr rejestracyjnym</CardTitle>
          <CardDescription className="text-xs">Wpisz fragment VIN lub tablicy — system znajdzie usługodawcę, do którego pojazd jest przypisany.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-md">
            <Input
              placeholder="np. WAUZZZ8K... lub WX1234A"
              value={vehicleQuery}
              onChange={e => setVehicleQuery(e.target.value)}
              className="uppercase"
            />
            {vehicleSearching && <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-3" />}
          </div>
          {vehicleResults.length > 0 && (
            <div className="mt-3 border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              {vehicleResults.map((v, idx) => (
                <button
                  key={`${v.vin}-${v.plate}-${idx}`}
                  disabled={!v.user_id}
                  onClick={() => v.user_id && selectUser({ id: v.user_id, email: v.email, company_name: v.company_name })}
                  className="w-full text-left px-3 py-2 hover:bg-muted transition-colors text-sm border-b last:border-0 flex items-center justify-between gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{v.plate || '—'} {v.vin && <span className="text-xs text-muted-foreground ml-2">VIN: {v.vin}</span>}</div>
                    <div className="text-xs text-muted-foreground truncate">{v.company_name || v.email || '—'} · {v.source}</div>
                  </div>
                  {v.user_id && <Badge variant="secondary" className="text-xs">Wybierz</Badge>}
                </button>
              ))}
            </div>
          )}
          {vehicleQuery.length >= 3 && !vehicleSearching && vehicleResults.length === 0 && (
            <p className="text-sm text-muted-foreground mt-2">Brak wyników</p>
          )}
        </CardContent>
      </Card>

      {/* Companies registered in the portal */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Firmy korzystające z systemu ({companies.length})</CardTitle>
          <CardDescription className="text-xs">Wybierz firmę z listy, aby przyznać jej kredyty (SMS, weryfikacja VIN/rej., AI itd.).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative mb-3 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Szukaj po NIP, nazwie, adresie, mailu, telefonie…"
              value={companyFilter}
              onChange={e => setCompanyFilter(e.target.value)}
              className="pl-9"
            />
          </div>
          {loadingCompanies ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : filteredCompanies.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">Brak firm pasujących do filtra</p>
          ) : (
            <div className="border rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Firma / NIP</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="hidden md:table-cell">Adres</TableHead>
                    <TableHead className="hidden md:table-cell">Telefon</TableHead>
                    <TableHead className="text-right">SMS</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompanies.map(c => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => selectCompany(c)}>
                      <TableCell>
                        <div className="font-medium text-sm">{c.company_name || '—'}</div>
                        {c.company_nip && <div className="text-xs text-muted-foreground">NIP {c.company_nip}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{c.email || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                        {c.company_address || '—'}{c.company_city ? `, ${c.company_city}` : ''}
                      </TableCell>
                      <TableCell className="text-xs hidden md:table-cell">{c.company_phone || '—'}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={(c.sms_balance || 0) > 0 ? 'default' : 'secondary'}>{c.sms_balance ?? 0}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); selectCompany(c); }}>Wybierz</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" /> Znajdź użytkownika po e-mail</CardTitle>
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
          {foundUser && <p className="text-sm text-green-600 mt-2">✓ {foundUser.company_name ? `${foundUser.company_name} — ` : ''}{foundUser.email}</p>}
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
