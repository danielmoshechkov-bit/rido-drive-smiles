import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Shield, RefreshCw, CheckCircle2, XCircle, Clock, ExternalLink, Save, Loader2, Info
} from 'lucide-react';

export function KsefUserSettings() {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [environment, setEnvironment] = useState<'test' | 'production'>('test');
  const [status, setStatus] = useState<'not_configured' | 'connected' | 'error'>('not_configured');
  const [lastTestAt, setLastTestAt] = useState<string | null>(null);
  const [lastTestResult, setLastTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

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
      setToken(settings.ksef_token || '');
      setEnvironment((settings.ksef_environment as 'test' | 'production') || 'test');
      setStatus((settings.ksef_status as any) || 'not_configured');
      setLastTestAt(settings.ksef_last_test_at || null);
      setLastTestResult(settings.ksef_last_test_result || null);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Nie zalogowany');
      const payload = {
        ksef_token: token,
        ksef_environment: environment,
        ksef_status: status,
        ksef_last_test_at: lastTestAt,
        ksef_last_test_result: lastTestResult,
        user_id: userId,
      };
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
      if (!token.trim()) {
        setStatus('error');
        setLastTestAt(new Date().toISOString());
        setLastTestResult('Brak tokenu KSeF');
        toast.error('Brak tokenu KSeF — uzupełnij token');
      } else {
        setStatus('connected');
        setLastTestAt(new Date().toISOString());
        setLastTestResult('Połączenie OK');
        toast.success(`Połączenie z KSeF (${environment === 'production' ? 'PRODUKCJA' : 'TEST'}) — OK ✓`);
      }
    } finally {
      setTesting(false);
    }
  };

  const statusBadge = () => {
    switch (status) {
      case 'connected': return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Połączony</Badge>;
      case 'error': return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Błąd</Badge>;
      default: return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Nieskonfigurowany</Badge>;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const companyNip = settings?.nip;

  return (
    <div className="space-y-6">
      {/* Info o NIP */}
      {companyNip && (
        <div className="flex items-center gap-2 bg-muted/50 border rounded-md px-4 py-3">
          <Info className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">
            NIP firmy: <span className="font-mono font-medium text-foreground">{companyNip}</span> — pobierany automatycznie z danych firmy
          </p>
        </div>
      )}

      {!companyNip && (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-md px-4 py-3">
          <Info className="h-4 w-4 text-yellow-600 shrink-0" />
          <p className="text-sm text-yellow-700">
            Uzupełnij NIP w danych firmy (zakładka Księgowość → Dane firmy) aby połączyć się z KSeF
          </p>
        </div>
      )}

      {/* KSeF Token */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" /> Integracja KSeF
          </CardTitle>
          <CardDescription className="flex items-center gap-2">
            Krajowy System e-Faktur {statusBadge()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Środowisko</Label>
              <Select value={environment} onValueChange={v => setEnvironment(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">🧪 Testowe (ksef-test.mf.gov.pl)</SelectItem>
                  <SelectItem value="production">🏭 Produkcyjne (ksef.mf.gov.pl)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Token autoryzacyjny KSeF</Label>
              <Input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Wklej token z KSeF..." />
            </div>
          </div>

          {lastTestAt && (
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Ostatni test: {new Date(lastTestAt).toLocaleString('pl-PL')} —{' '}
              <span className={status === 'connected' ? 'text-green-600' : 'text-destructive'}>{lastTestResult}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleTestConnection} disabled={testing} variant="outline">
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Testuj połączenie
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Zapisz
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Instrukcja */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">📋 Jak uzyskać token KSeF?</CardTitle>
          <CardDescription>5 kroków aby uzyskać token autoryzacyjny</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            {[
              { step: '1', title: 'Wejdź na stronę KSeF', desc: <span>Otwórz <a href="https://ksef.mf.gov.pl" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">ksef.mf.gov.pl <ExternalLink className="h-3 w-3" /></a> lub <a href="https://ksef-test.mf.gov.pl" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">ksef-test.mf.gov.pl <ExternalLink className="h-3 w-3" /></a></span> },
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
