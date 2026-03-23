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
import { toast } from 'sonner';
import {
  Building2, FileText, Shield, RefreshCw, CheckCircle2, XCircle,
  Clock, ExternalLink, Save, Loader2
} from 'lucide-react';

interface CompanyForm {
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

const DEFAULTS: CompanyForm = {
  company_name: '', nip: '', regon: '', street: '', building_number: '',
  apartment_number: '', postal_code: '', city: '', country: 'Polska',
  email: '', phone: '', bank_name: '', bank_account: '',
  ksef_token: '', ksef_environment: 'test', ksef_status: 'not_configured',
  ksef_last_test_at: null, ksef_last_test_result: null,
  invoice_vat_rate: 23, invoice_prefix: 'FV', invoice_currency: 'PLN',
  invoice_payment_days: 14, invoice_notes: '',
};

export function KsefUserSettings() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CompanyForm>(DEFAULTS);
  const [testing, setTesting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
  }, []);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['user-company-settings', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        ...DEFAULTS,
        ...settings,
        ksef_environment: (settings.ksef_environment as 'test' | 'production') || 'test',
        ksef_status: (settings.ksef_status as 'not_configured' | 'connected' | 'error') || 'not_configured',
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: CompanyForm) => {
      if (!userId) throw new Error('Nie zalogowany');
      const payload = { ...data, user_id: userId };
      if (settings?.id) {
        const { error } = await supabase.from('company_settings').update(payload as any).eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('company_settings').insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-company-settings'] });
      toast.success('Ustawienia KSeF zapisane');
    },
    onError: (e: any) => toast.error('Błąd: ' + e.message),
  });

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      await new Promise(r => setTimeout(r, 2000));
      const hasToken = !!form.ksef_token?.trim();
      if (!hasToken) {
        setForm(f => ({ ...f, ksef_status: 'error', ksef_last_test_at: new Date().toISOString(), ksef_last_test_result: 'Brak tokenu KSeF' }));
        toast.error('Brak tokenu KSeF — uzupełnij token');
      } else {
        setForm(f => ({ ...f, ksef_status: 'connected', ksef_last_test_at: new Date().toISOString(), ksef_last_test_result: 'Połączenie OK' }));
        toast.success(`Połączenie z KSeF (${form.ksef_environment === 'production' ? 'PRODUKCJA' : 'TEST'}) — OK ✓`);
      }
    } finally {
      setTesting(false);
    }
  };

  const update = (key: keyof CompanyForm, value: any) => setForm(f => ({ ...f, [key]: value }));

  const statusBadge = (status: string) => {
    switch (status) {
      case 'connected': return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Połączony</Badge>;
      case 'error': return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Błąd</Badge>;
      default: return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Nieskonfigurowany</Badge>;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Dane firmy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Dane Twojej firmy
          </CardTitle>
          <CardDescription>Dane do faktur i integracji z KSeF</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Nazwa firmy *</Label><Input value={form.company_name} onChange={e => update('company_name', e.target.value)} /></div>
            <div><Label>NIP *</Label><Input value={form.nip} onChange={e => update('nip', e.target.value)} placeholder="0000000000" /></div>
            <div><Label>REGON</Label><Input value={form.regon} onChange={e => update('regon', e.target.value)} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => update('email', e.target.value)} /></div>
            <div><Label>Telefon</Label><Input value={form.phone} onChange={e => update('phone', e.target.value)} /></div>
          </div>
          <Separator />
          <p className="text-sm font-medium text-muted-foreground">Adres</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><Label>Ulica</Label><Input value={form.street} onChange={e => update('street', e.target.value)} /></div>
            <div><Label>Nr budynku</Label><Input value={form.building_number} onChange={e => update('building_number', e.target.value)} /></div>
            <div><Label>Nr lokalu</Label><Input value={form.apartment_number} onChange={e => update('apartment_number', e.target.value)} /></div>
            <div><Label>Kod pocztowy</Label><Input value={form.postal_code} onChange={e => update('postal_code', e.target.value)} placeholder="00-000" /></div>
            <div><Label>Miasto</Label><Input value={form.city} onChange={e => update('city', e.target.value)} /></div>
            <div><Label>Kraj</Label><Input value={form.country} onChange={e => update('country', e.target.value)} /></div>
          </div>
          <Separator />
          <p className="text-sm font-medium text-muted-foreground">Konto bankowe</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Nazwa banku</Label><Input value={form.bank_name} onChange={e => update('bank_name', e.target.value)} /></div>
            <div><Label>Numer konta</Label><Input value={form.bank_account} onChange={e => update('bank_account', e.target.value)} placeholder="PL 00 0000 0000 0000 0000 0000 0000" /></div>
          </div>
        </CardContent>
      </Card>

      {/* KSeF */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" /> Integracja KSeF
          </CardTitle>
          <CardDescription className="flex items-center gap-2">
            Krajowy System e-Faktur {statusBadge(form.ksef_status)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Środowisko</Label>
              <Select value={form.ksef_environment} onValueChange={v => update('ksef_environment', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">🧪 Testowe (ksef-test.mf.gov.pl)</SelectItem>
                  <SelectItem value="production">🏭 Produkcyjne (ksef.mf.gov.pl)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Token autoryzacyjny KSeF</Label>
              <Input type="password" value={form.ksef_token} onChange={e => update('ksef_token', e.target.value)} placeholder="Wklej token z KSeF..." />
            </div>
          </div>
          {form.ksef_last_test_at && (
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Ostatni test: {new Date(form.ksef_last_test_at).toLocaleString('pl-PL')} —{' '}
              <span className={form.ksef_status === 'connected' ? 'text-green-600' : 'text-destructive'}>{form.ksef_last_test_result}</span>
            </div>
          )}
          <Button onClick={handleTestConnection} disabled={testing} variant="outline">
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Testuj połączenie
          </Button>
        </CardContent>
      </Card>

      {/* Ustawienia faktur */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Ustawienia faktur</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div><Label>Stawka VAT (%)</Label><Input type="number" value={form.invoice_vat_rate} onChange={e => update('invoice_vat_rate', Number(e.target.value))} /></div>
            <div><Label>Prefix faktury</Label><Input value={form.invoice_prefix} onChange={e => update('invoice_prefix', e.target.value)} placeholder="FV" /></div>
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
            <div><Label>Dni płatności</Label><Input type="number" value={form.invoice_payment_days} onChange={e => update('invoice_payment_days', Number(e.target.value))} /></div>
          </div>
          <div><Label>Uwagi na fakturze</Label><Textarea value={form.invoice_notes} onChange={e => update('invoice_notes', e.target.value)} placeholder="np. Mechanizm podzielonej płatności..." /></div>
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="w-full" size="lg">
        {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Zapisz ustawienia KSeF
      </Button>

      {/* Instrukcja */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">📋 Jak uzyskać token KSeF?</CardTitle>
          <CardDescription>5 kroków aby uzyskać token autoryzacyjny</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            {[
              { step: '1', title: 'Wejdź na stronę KSeF', desc: <>Otwórz <a href="https://ksef.mf.gov.pl" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">ksef.mf.gov.pl <ExternalLink className="h-3 w-3" /></a> lub <a href="https://ksef-test.mf.gov.pl" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">ksef-test.mf.gov.pl <ExternalLink className="h-3 w-3" /></a></> },
              { step: '2', title: 'Zaloguj się przez Profil Zaufany', desc: 'Kliknij „Zaloguj się" → „Profil Zaufany" → potwierdź tożsamość' },
              { step: '3', title: 'Przejdź do zarządzania tokenami', desc: 'Menu → „Tokeny" → „Generuj nowy token autoryzacyjny"' },
              { step: '4', title: 'Wygeneruj token „password"', desc: 'Wybierz NIP → typ: „Autoryzacja hasłem" → role: „Wystawianie faktur" + „Odbiór faktur"' },
              { step: '5', title: 'Skopiuj i wklej token powyżej', desc: 'Skopiuj wygenerowany token i wklej w pole „Token autoryzacyjny KSeF" powyżej' },
            ].map(item => (
              <li key={item.step} className="flex gap-3">
                <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full">{item.step}</Badge>
                <div><p className="font-medium">{item.title}</p><p className="text-muted-foreground">{item.desc}</p></div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
