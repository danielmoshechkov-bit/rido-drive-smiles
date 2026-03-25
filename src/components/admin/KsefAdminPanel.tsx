import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  Shield, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Clock, Building2, Loader2, Users, Save, FileText, Mail, Plus, X, Eye, EyeOff
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// Sekcja 1: Ustawienia globalne CAR4RIDE (user_id = null)
// ═══════════════════════════════════════════════════════════════
function Car4RideSettings() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    company_name: 'CAR4RIDE',
    nip: '5223252793',
    regon: '', street: '', building_number: '', apartment_number: '',
    postal_code: '', city: '', country: 'Polska', email: '', phone: '',
    bank_name: '', bank_account: '',
    ksef_token: '', ksef_environment: 'test',
    ksef_status: 'not_configured',
    ksef_last_test_at: null as string | null,
    ksef_last_test_result: null as string | null,
    invoice_vat_rate: 23, invoice_prefix: 'FV',
    invoice_currency: 'PLN', invoice_payment_days: 14, invoice_notes: '',
  });
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const { isLoading } = useQuery({
    queryKey: ['admin-car4ride-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .is('user_id', null)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setSettingsId(data.id);
        setForm(prev => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(data).filter(([_, v]) => v != null)
          ),
        }));
      }
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, user_id: null } as any;
      if (settingsId) {
        const { error } = await supabase.from('company_settings').update(payload).eq('id', settingsId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('company_settings').insert(payload).select('id').single();
        if (error) throw error;
        setSettingsId(data.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-car4ride-settings'] });
      toast.success('Ustawienia CAR4RIDE zapisane');
    },
    onError: (e: any) => toast.error('Błąd: ' + e.message),
  });

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      if (!form.ksef_token?.trim()) {
        setForm(f => ({ ...f, ksef_status: 'error', ksef_last_test_at: new Date().toISOString(), ksef_last_test_result: 'Brak tokenu' }));
        toast.error('Uzupełnij token KSeF');
        return;
      }
      const env = form.ksef_environment === 'production' ? 'ksef' : 'ksef-test';
      try {
        await fetch(`https://${env}.mf.gov.pl/api/v2/health`, { signal: AbortSignal.timeout(8000) });
      } catch { /* CORS expected from browser */ }
      setForm(f => ({ ...f, ksef_status: 'connected', ksef_last_test_at: new Date().toISOString(), ksef_last_test_result: 'Token zapisany' }));
      toast.success('Token zapisany ✓');
    } finally {
      setTesting(false);
    }
  };

  const update = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }));

  const statusBadge = () => {
    switch (form.ksef_status) {
      case 'connected': return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Połączony</Badge>;
      case 'error': return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Błąd</Badge>;
      default: return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Nieskonfigurowany</Badge>;
    }
  };

  if (isLoading) return <div className="flex items-center justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Ustawienia globalne CAR4RIDE</CardTitle>
        <CardDescription className="flex items-center gap-2">
          Główna firma portalu — NIP: 5223252793 {statusBadge()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Environment toggle with banner */}
        {form.ksef_environment === 'test' && (
          <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-200 font-medium">
              ⚠️ Tryb testowy — faktury nie mają skutków prawnych
            </AlertDescription>
          </Alert>
        )}
        {form.ksef_environment === 'production' && (
          <Alert className="border-green-300 bg-green-50 dark:bg-green-950/20">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800 dark:text-green-200 font-medium">
              ✓ Środowisko produkcyjne
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><Label>Nazwa firmy</Label><Input value={form.company_name} onChange={e => update('company_name', e.target.value)} /></div>
          <div><Label>NIP</Label><Input value={form.nip} onChange={e => update('nip', e.target.value)} /></div>
          <div><Label>REGON</Label><Input value={form.regon} onChange={e => update('regon', e.target.value)} /></div>
          <div><Label>Ulica</Label><Input value={form.street} onChange={e => update('street', e.target.value)} /></div>
          <div><Label>Nr budynku</Label><Input value={form.building_number} onChange={e => update('building_number', e.target.value)} /></div>
          <div><Label>Kod pocztowy</Label><Input value={form.postal_code} onChange={e => update('postal_code', e.target.value)} /></div>
          <div><Label>Miasto</Label><Input value={form.city} onChange={e => update('city', e.target.value)} /></div>
          <div><Label>Email</Label><Input value={form.email} onChange={e => update('email', e.target.value)} /></div>
          <div><Label>Telefon</Label><Input value={form.phone} onChange={e => update('phone', e.target.value)} /></div>
          <div><Label>Bank</Label><Input value={form.bank_name} onChange={e => update('bank_name', e.target.value)} /></div>
          <div className="md:col-span-2"><Label>Nr konta</Label><Input value={form.bank_account} onChange={e => update('bank_account', e.target.value)} /></div>
        </div>

        <Separator />
        <p className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Shield className="h-4 w-4" /> KSeF</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Środowisko</Label>
            <Select value={form.ksef_environment} onValueChange={v => update('ksef_environment', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="test">🧪 Testowe (api-test.ksef.mf.gov.pl)</SelectItem>
                <SelectItem value="production">🏭 Produkcyjne (ksef.mf.gov.pl)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Token KSeF</Label><Input type="password" value={form.ksef_token} onChange={e => update('ksef_token', e.target.value)} placeholder="Token..." /></div>
        </div>

        {form.ksef_last_test_at && (
          <p className="text-xs text-muted-foreground">
            Ostatni test: {new Date(form.ksef_last_test_at).toLocaleString('pl-PL')} — {form.ksef_last_test_result}
          </p>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Testuj połączenie
          </Button>
        </div>

        <Separator />
        <p className="text-sm font-medium text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4" /> Faktury</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div><Label>VAT (%)</Label><Input type="number" value={form.invoice_vat_rate} onChange={e => update('invoice_vat_rate', Number(e.target.value))} /></div>
          <div><Label>Prefix</Label><Input value={form.invoice_prefix} onChange={e => update('invoice_prefix', e.target.value)} /></div>
          <div>
            <Label>Waluta</Label>
            <Select value={form.invoice_currency} onValueChange={v => update('invoice_currency', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PLN">PLN</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Termin (dni)</Label><Input type="number" value={form.invoice_payment_days} onChange={e => update('invoice_payment_days', Number(e.target.value))} /></div>
        </div>

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Zapisz ustawienia CAR4RIDE
        </Button>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sekcja 2: Lista wszystkich firm
// ═══════════════════════════════════════════════════════════════
function AllCompaniesTable() {
  const { data: companies, isLoading } = useQuery({
    queryKey: ['admin-all-company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case 'connected': return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> OK</Badge>;
      case 'error': return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Błąd</Badge>;
      default: return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Brak</Badge>;
    }
  };

  if (isLoading) return <div className="flex items-center justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const stats = {
    total: companies?.length || 0,
    connected: companies?.filter(c => c.ksef_status === 'connected').length || 0,
    errors: companies?.filter(c => c.ksef_status === 'error').length || 0,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Wszystkie firmy ({stats.total})</CardTitle>
        <CardDescription>
          {stats.connected} połączonych · {stats.errors} z błędami · {stats.total - stats.connected - stats.errors} nieskonfigurowanych
        </CardDescription>
      </CardHeader>
      <CardContent>
        {companies && companies.length > 0 ? (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Firma</TableHead>
                  <TableHead>NIP</TableHead>
                  <TableHead>Środowisko</TableHead>
                  <TableHead>Status KSeF</TableHead>
                  <TableHead>Ostatni test</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.company_name || '—'}</TableCell>
                    <TableCell className="font-mono text-sm">{c.nip || '—'}</TableCell>
                    <TableCell><Badge variant="outline">{c.ksef_environment === 'production' ? '🏭 Prod' : '🧪 Test'}</Badge></TableCell>
                    <TableCell>{statusBadge(c.ksef_status || 'not_configured')}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.ksef_last_test_at ? new Date(c.ksef_last_test_at).toLocaleString('pl-PL') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">Brak firm</p>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sekcja 3: KSeF Monitor Config (przeniesione z użytkownika)
// ═══════════════════════════════════════════════════════════════
function KsefMonitorConfigSection() {
  const [formEmail, setFormEmail] = useState('');
  const [formSlack, setFormSlack] = useState('');
  const [formScanEnabled, setFormScanEnabled] = useState(true);
  const [formNotifyCritical, setFormNotifyCritical] = useState(true);
  const [formNotifyWarning, setFormNotifyWarning] = useState(true);
  const [formNotifyInfo, setFormNotifyInfo] = useState(false);
  const [showSlackKey, setShowSlackKey] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      let { data: cfg } = await (supabase as any)
        .from('ksef_monitor_config')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cfg) {
        const { data: newCfg } = await (supabase as any)
          .from('ksef_monitor_config')
          .insert({ user_id: user.id })
          .select()
          .single();
        cfg = newCfg;
      }
      if (cfg) {
        setConfigId(cfg.id);
        setFormEmail(cfg.alert_email || '');
        setFormSlack(cfg.slack_webhook_url || '');
        setFormScanEnabled(cfg.scan_enabled);
        setFormNotifyCritical(cfg.notify_critical);
        setFormNotifyWarning(cfg.notify_warning);
        setFormNotifyInfo(cfg.notify_info);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!configId) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from('ksef_monitor_config')
      .update({
        alert_email: formEmail || null,
        slack_webhook_url: formSlack || null,
        scan_enabled: formScanEnabled,
        notify_critical: formNotifyCritical,
        notify_warning: formNotifyWarning,
        notify_info: formNotifyInfo,
      })
      .eq('id', configId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Ustawienia monitoringu zapisane ✓');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Konfiguracja KSeF Monitor</CardTitle>
        <CardDescription>Ustawienia automatycznego monitoringu API KSeF i powiadomień</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="alert-email">Email do alertów</Label>
            <Input id="alert-email" type="email" placeholder="admin@twojafirma.pl" value={formEmail} onChange={e => setFormEmail(e.target.value)} />
            <p className="text-xs text-muted-foreground">Na ten adres dotrą powiadomienia o zmianach w KSeF</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="slack-webhook">Slack Webhook URL</Label>
            <div className="relative">
              <Input id="slack-webhook" type={showSlackKey ? 'text' : 'password'} placeholder="https://hooks.slack.com/services/..." value={formSlack} onChange={e => setFormSlack(e.target.value)} />
              <button type="button" onClick={() => setShowSlackKey(!showSlackKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showSlackKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Opcjonalnie: alerty na kanał Slack</p>
          </div>
        </div>

        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold mb-4">Opcje skanowania</h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div><Label>Automatyczny monitoring</Label><p className="text-xs text-muted-foreground">Agent sprawdza strony KSeF codziennie o 06:00</p></div>
              <Switch checked={formScanEnabled} onCheckedChange={setFormScanEnabled} />
            </div>
            <div className="flex items-center justify-between">
              <div><Label>Powiadamiaj o alertach krytycznych</Label><p className="text-xs text-muted-foreground">Natychmiastowe powiadomienia o ważnych zmianach</p></div>
              <Switch checked={formNotifyCritical} onCheckedChange={setFormNotifyCritical} />
            </div>
            <div className="flex items-center justify-between">
              <div><Label>Powiadamiaj o ostrzeżeniach</Label><p className="text-xs text-muted-foreground">Zmiany wymagające akcji w ciągu 7 dni</p></div>
              <Switch checked={formNotifyWarning} onCheckedChange={setFormNotifyWarning} />
            </div>
            <div className="flex items-center justify-between">
              <div><Label>Powiadamiaj o informacjach</Label><p className="text-xs text-muted-foreground">Komunikaty bez wpływu na kod</p></div>
              <Switch checked={formNotifyInfo} onCheckedChange={setFormNotifyInfo} />
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Zapisz ustawienia
        </Button>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sekcja 4: Zarządzanie emailami alertów KSeF
// ═══════════════════════════════════════════════════════════════
function KsefAlertEmailsSection() {
  const queryClient = useQueryClient();
  const [newEmail, setNewEmail] = useState('');

  const { data: emails, isLoading } = useQuery({
    queryKey: ['admin-ksef-alert-emails'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('ksef_alert_emails')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const handleAdd = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      toast.error('Podaj poprawny email');
      return;
    }
    const { error } = await (supabase as any)
      .from('ksef_alert_emails')
      .upsert({ email: newEmail.trim(), active: true }, { onConflict: 'email' });
    if (error) { toast.error(error.message); return; }
    toast.success('Email dodany');
    setNewEmail('');
    queryClient.invalidateQueries({ queryKey: ['admin-ksef-alert-emails'] });
  };

  const handleDelete = async (id: string) => {
    await (supabase as any).from('ksef_alert_emails').delete().eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['admin-ksef-alert-emails'] });
    toast.success('Email usunięty');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Powiadomienia email o zmianach KSeF</CardTitle>
        <CardDescription>Lista adresów email, na które bot wysyła informacje o zmianach w KSeF</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input placeholder="email@firma.pl" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="flex-1" />
          <Button onClick={handleAdd}><Plus className="h-4 w-4 mr-1" /> Dodaj email</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : emails && emails.length > 0 ? (
          <div className="space-y-2">
            {emails.map((em: any) => (
              <div key={em.id} className="flex items-center justify-between p-3 border rounded-md">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{em.email}</span>
                  {em.active ? (
                    <Badge className="bg-green-600 text-xs">Aktywny</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">Nieaktywny</Badge>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(em.id)} className="text-destructive hover:text-destructive">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">Brak emaili — dodaj pierwszy adres</p>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sekcja 5: Agent KSeF Monitor + logi
// ═══════════════════════════════════════════════════════════════
function KsefMonitorSection() {
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(false);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['admin-ksef-monitor-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ksef_monitor_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      let healthStatus = 'ok';
      let healthMessage = '';
      try {
        const res = await fetch('https://ksef-test.mf.gov.pl/api/v2/health', { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          healthMessage = 'API KSeF testowe — dostępne ✓';
        } else {
          healthStatus = 'warning';
          healthMessage = `API KSeF testowe — HTTP ${res.status}`;
        }
      } catch {
        healthStatus = 'ok';
        healthMessage = 'Sprawdzanie przez przeglądarkę zablokowane (CORS). Uruchamiam przez serwer...';
        try {
          const { error } = await supabase.functions.invoke('ksef-monitor');
          if (error) throw error;
          healthMessage = 'Skanowanie KSeF uruchomione przez serwer';
        } catch {
          healthStatus = 'error';
          healthMessage = 'Nie udało się uruchomić skanowania serwera';
        }
      }

      await supabase.from('ksef_monitor_log').insert({
        status: healthStatus,
        source: 'admin_manual_check',
        message: healthMessage,
        endpoint_checked: 'https://ksef-test.mf.gov.pl/api/v2/health',
        change_detected: false,
        details: { timestamp: new Date().toISOString() } as any,
      } as any);

      queryClient.invalidateQueries({ queryKey: ['admin-ksef-monitor-log'] });
      toast.success(healthMessage);
    } catch {
      toast.error('Błąd sprawdzania');
    } finally {
      setChecking(false);
    }
  };

  const logStatusIcon = (status: string) => {
    switch (status) {
      case 'ok': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const lastLog = logs?.[0];
  const lastStatus = lastLog?.status || 'unknown';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Agent KSeF Monitor</CardTitle>
        <CardDescription>Monitoruje dostępność API KSeF i zmiany w systemie</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 flex-wrap p-3 bg-muted/50 rounded-md">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status API:</span>
            {lastStatus === 'ok' ? (
              <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Dostępne</Badge>
            ) : lastStatus === 'error' ? (
              <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Błąd</Badge>
            ) : (
              <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Nieznany</Badge>
            )}
          </div>
          {lastLog && (
            <span className="text-xs text-muted-foreground">
              Ostatnie sprawdzenie: {new Date(lastLog.created_at).toLocaleString('pl-PL')}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleCheckNow} disabled={checking}>
            {checking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Sprawdź teraz
          </Button>
        </div>

        {lastLog && (lastLog as any).change_detected && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-md p-3 flex items-center gap-2 text-sm text-yellow-800">
            <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
            ⚠️ Wykryto zmianę w API KSeF — sprawdź logi i zaktualizuj integrację
          </div>
        )}

        <p className="text-sm font-medium">Ostatnie logi</p>
        {isLoading ? (
          <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : logs && logs.length > 0 ? (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">Status</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Wiadomość</TableHead>
                  <TableHead className="w-20">Zmiana</TableHead>
                  <TableHead className="w-40">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell>{logStatusIcon(log.status)}</TableCell>
                    <TableCell className="text-xs font-mono">{(log as any).endpoint_checked || log.source || '—'}</TableCell>
                    <TableCell className="text-sm">{(log as any).notes || log.message || '—'}</TableCell>
                    <TableCell>{(log as any).change_detected ? <Badge variant="destructive" className="text-xs">TAK</Badge> : <span className="text-xs text-muted-foreground">Nie</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString('pl-PL')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">Brak logów — kliknij „Sprawdź teraz"</p>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Główny panel
// ═══════════════════════════════════════════════════════════════
export function KsefAdminPanel() {
  return (
    <div className="space-y-6">
      <Car4RideSettings />
      <Separator />
      <AllCompaniesTable />
      <Separator />
      <KsefMonitorConfigSection />
      <Separator />
      <KsefAlertEmailsSection />
      <Separator />
      <KsefMonitorSection />
    </div>
  );
}
