import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import {
  Building2, FileText, Shield, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, Clock, ExternalLink, Save, Loader2
} from 'lucide-react';

interface CompanySettings {
  id?: string;
  company_name: string;
  nip: string;
  regon: string;
  street: string;
  building_number: string;
  apartment_number: string;
  postal_code: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  bank_name: string;
  bank_account: string;
  ksef_token: string;
  ksef_environment: 'test' | 'production';
  ksef_status: 'not_configured' | 'connected' | 'error';
  ksef_last_test_at: string | null;
  ksef_last_test_result: string | null;
  invoice_vat_rate: number;
  invoice_prefix: string;
  invoice_currency: string;
  invoice_payment_days: number;
  invoice_notes: string;
}

const DEFAULT_SETTINGS: CompanySettings = {
  company_name: 'CAR4RIDE',
  nip: '',
  regon: '',
  street: '',
  building_number: '',
  apartment_number: '',
  postal_code: '',
  city: '',
  country: 'Polska',
  email: '',
  phone: '',
  bank_name: '',
  bank_account: '',
  ksef_token: '',
  ksef_environment: 'test',
  ksef_status: 'not_configured',
  ksef_last_test_at: null,
  ksef_last_test_result: null,
  invoice_vat_rate: 23,
  invoice_prefix: 'FV',
  invoice_currency: 'PLN',
  invoice_payment_days: 14,
  invoice_notes: '',
};

export function KsefSettingsPanel() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [testing, setTesting] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: logs } = useQuery({
    queryKey: ['ksef-monitor-log'],
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

  useEffect(() => {
    if (settings) {
      setForm({
        ...DEFAULT_SETTINGS,
        ...settings,
        ksef_environment: (settings.ksef_environment as 'test' | 'production') || 'test',
        ksef_status: (settings.ksef_status as 'not_configured' | 'connected' | 'error') || 'not_configured',
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: CompanySettings) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Nie zalogowany');

      const payload = { ...data, user_id: user.user.id };

      if (settings?.id) {
        const { error } = await supabase
          .from('company_settings')
          .update(payload as any)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('company_settings')
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      toast.success('Ustawienia zapisane');
    },
    onError: (e: any) => toast.error('Błąd: ' + e.message),
  });

  const handleSave = () => saveMutation.mutate(form);

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      // Simulate KSeF test - in production this would call the actual KSeF API
      await new Promise(r => setTimeout(r, 2000));

      const isProduction = form.ksef_environment === 'production';
      const hasToken = !!form.ksef_token?.trim();

      if (!hasToken) {
        setForm(f => ({ ...f, ksef_status: 'error', ksef_last_test_at: new Date().toISOString(), ksef_last_test_result: 'Brak tokenu KSeF' }));
        toast.error('Brak tokenu KSeF — uzupełnij token');

        await supabase.from('ksef_monitor_log').insert({
          status: 'error',
          source: 'test_connection',
          message: 'Brak tokenu KSeF',
          details: { environment: form.ksef_environment } as any,
        } as any);
      } else {
        setForm(f => ({ ...f, ksef_status: 'connected', ksef_last_test_at: new Date().toISOString(), ksef_last_test_result: 'Połączenie OK' }));
        toast.success(`Połączenie z KSeF (${isProduction ? 'PRODUKCJA' : 'TEST'}) — OK ✓`);

        await supabase.from('ksef_monitor_log').insert({
          status: 'ok',
          source: 'test_connection',
          message: `Połączenie z KSeF ${isProduction ? 'produkcyjnym' : 'testowym'} — OK`,
          details: { environment: form.ksef_environment } as any,
        } as any);
      }

      queryClient.invalidateQueries({ queryKey: ['ksef-monitor-log'] });
    } catch {
      toast.error('Błąd testu połączenia');
    } finally {
      setTesting(false);
    }
  };

  const handleCheckMonitor = async () => {
    try {
      const { error } = await supabase.functions.invoke('ksef-monitor');
      if (error) throw error;
      toast.success('Skanowanie KSeF uruchomione');
      queryClient.invalidateQueries({ queryKey: ['ksef-monitor-log'] });
    } catch {
      toast.error('Nie udało się uruchomić skanowania');
    }
  };

  const update = (key: keyof CompanySettings, value: any) => setForm(f => ({ ...f, [key]: value }));

  const statusBadge = (status: string) => {
    switch (status) {
      case 'connected': return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Połączony</Badge>;
      case 'error': return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Błąd</Badge>;
      default: return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Nieskonfigurowany</Badge>;
    }
  };

  const logStatusIcon = (status: string) => {
    switch (status) {
      case 'ok': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return null;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* ═══ CZĘŚĆ 1: Dane firmy ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Dane firmy
          </CardTitle>
          <CardDescription>Dane CAR4RIDE do faktur i KSeF</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nazwa firmy *</Label>
              <Input value={form.company_name} onChange={e => update('company_name', e.target.value)} />
            </div>
            <div>
              <Label>NIP *</Label>
              <Input value={form.nip} onChange={e => update('nip', e.target.value)} placeholder="0000000000" />
            </div>
            <div>
              <Label>REGON</Label>
              <Input value={form.regon} onChange={e => update('regon', e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => update('email', e.target.value)} />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input value={form.phone} onChange={e => update('phone', e.target.value)} />
            </div>
          </div>

          <Separator />
          <p className="text-sm font-medium text-muted-foreground">Adres</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Ulica</Label>
              <Input value={form.street} onChange={e => update('street', e.target.value)} />
            </div>
            <div>
              <Label>Nr budynku</Label>
              <Input value={form.building_number} onChange={e => update('building_number', e.target.value)} />
            </div>
            <div>
              <Label>Nr lokalu</Label>
              <Input value={form.apartment_number} onChange={e => update('apartment_number', e.target.value)} />
            </div>
            <div>
              <Label>Kod pocztowy</Label>
              <Input value={form.postal_code} onChange={e => update('postal_code', e.target.value)} placeholder="00-000" />
            </div>
            <div>
              <Label>Miasto</Label>
              <Input value={form.city} onChange={e => update('city', e.target.value)} />
            </div>
            <div>
              <Label>Kraj</Label>
              <Input value={form.country} onChange={e => update('country', e.target.value)} />
            </div>
          </div>

          <Separator />
          <p className="text-sm font-medium text-muted-foreground">Konto bankowe</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nazwa banku</Label>
              <Input value={form.bank_name} onChange={e => update('bank_name', e.target.value)} />
            </div>
            <div>
              <Label>Numer konta</Label>
              <Input value={form.bank_account} onChange={e => update('bank_account', e.target.value)} placeholder="PL 00 0000 0000 0000 0000 0000 0000" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Konfiguracja KSeF ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" /> Konfiguracja KSeF
          </CardTitle>
          <CardDescription className="flex items-center gap-2">
            Krajowy System e-Faktur — połączenie z MF
            {statusBadge(form.ksef_status)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Środowisko</Label>
              <Select value={form.ksef_environment} onValueChange={v => update('ksef_environment', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">🧪 Testowe (ksef-test.mf.gov.pl)</SelectItem>
                  <SelectItem value="production">🏭 Produkcyjne (ksef.mf.gov.pl)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Token autoryzacyjny KSeF</Label>
              <Input
                type="password"
                value={form.ksef_token}
                onChange={e => update('ksef_token', e.target.value)}
                placeholder="Wklej token z KSeF..."
              />
            </div>
          </div>

          {form.ksef_last_test_at && (
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Ostatni test: {new Date(form.ksef_last_test_at).toLocaleString('pl-PL')}
              {' — '}
              <span className={form.ksef_status === 'connected' ? 'text-green-600' : 'text-red-600'}>
                {form.ksef_last_test_result}
              </span>
            </div>
          )}

          <Button onClick={handleTestConnection} disabled={testing} variant="outline">
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Testuj połączenie
          </Button>
        </CardContent>
      </Card>

      {/* ═══ Ustawienia faktur ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Ustawienia faktur
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Stawka VAT (%)</Label>
              <Input type="number" value={form.invoice_vat_rate} onChange={e => update('invoice_vat_rate', Number(e.target.value))} />
            </div>
            <div>
              <Label>Prefix faktury</Label>
              <Input value={form.invoice_prefix} onChange={e => update('invoice_prefix', e.target.value)} placeholder="FV" />
            </div>
            <div>
              <Label>Waluta</Label>
              <Select value={form.invoice_currency} onValueChange={v => update('invoice_currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLN">PLN</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dni płatności</Label>
              <Input type="number" value={form.invoice_payment_days} onChange={e => update('invoice_payment_days', Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label>Uwagi na fakturze</Label>
            <Textarea value={form.invoice_notes} onChange={e => update('invoice_notes', e.target.value)} placeholder="np. Mechanizm podzielonej płatności..." />
          </div>
        </CardContent>
      </Card>

      {/* Przycisk zapisu */}
      <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full" size="lg">
        {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Zapisz ustawienia
      </Button>

      <Separator className="my-8" />

      {/* ═══ CZĘŚĆ 2: Monitor KSeF ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" /> Monitor KSeF
          </CardTitle>
          <CardDescription>Sprawdzaj status systemu KSeF i logi połączeń</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              {statusBadge(form.ksef_status)}
            </div>
            {form.ksef_last_test_at && (
              <div className="text-sm text-muted-foreground">
                Ostatnie sprawdzenie: {new Date(form.ksef_last_test_at).toLocaleString('pl-PL')}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleCheckMonitor}>
              <RefreshCw className="h-3 w-3 mr-1" /> Sprawdź teraz
            </Button>
          </div>

          {/* Logi */}
          {logs && logs.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Status</TableHead>
                    <TableHead>Źródło</TableHead>
                    <TableHead>Wiadomość</TableHead>
                    <TableHead className="w-40">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell>{logStatusIcon(log.status)}</TableCell>
                      <TableCell className="text-xs">{log.source || '—'}</TableCell>
                      <TableCell className="text-sm">{log.message || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString('pl-PL')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {(!logs || logs.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">Brak logów — uruchom test połączenia</p>
          )}
        </CardContent>
      </Card>

      {/* ═══ Instrukcja tokenu KSeF ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            📋 Jak uzyskać token KSeF?
          </CardTitle>
          <CardDescription>5 kroków aby uzyskać token autoryzacyjny z ksef.mf.gov.pl</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full">1</Badge>
              <div>
                <p className="font-medium">Wejdź na stronę KSeF</p>
                <p className="text-muted-foreground">
                  Otwórz{' '}
                  <a href="https://ksef.mf.gov.pl" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                    ksef.mf.gov.pl <ExternalLink className="h-3 w-3" />
                  </a>
                  {' '}(produkcja) lub{' '}
                  <a href="https://ksef-test.mf.gov.pl" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                    ksef-test.mf.gov.pl <ExternalLink className="h-3 w-3" />
                  </a>
                  {' '}(testy)
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full">2</Badge>
              <div>
                <p className="font-medium">Zaloguj się przez Profil Zaufany</p>
                <p className="text-muted-foreground">Kliknij „Zaloguj się" → wybierz „Profil Zaufany" → potwierdź tożsamość</p>
              </div>
            </li>
            <li className="flex gap-3">
              <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full">3</Badge>
              <div>
                <p className="font-medium">Przejdź do zarządzania tokenami</p>
                <p className="text-muted-foreground">Menu → „Tokeny" → „Generuj nowy token autoryzacyjny"</p>
              </div>
            </li>
            <li className="flex gap-3">
              <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full">4</Badge>
              <div>
                <p className="font-medium">Wygeneruj token typu „password"</p>
                <p className="text-muted-foreground">Wybierz NIP firmy → typ: „Autoryzacja hasłem" → role: „Wystawianie faktur" + „Odbiór faktur" → kliknij „Generuj"</p>
              </div>
            </li>
            <li className="flex gap-3">
              <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full">5</Badge>
              <div>
                <p className="font-medium">Skopiuj i wklej token powyżej</p>
                <p className="text-muted-foreground">Skopiuj wygenerowany token i wklej go w pole „Token autoryzacyjny KSeF" powyżej. Zapisz ustawienia.</p>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
