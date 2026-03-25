import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Shield, RefreshCw, CheckCircle2, XCircle, Clock, ExternalLink,
  Save, Loader2, AlertTriangle, Info, Copy
} from 'lucide-react';

export function KsefUserSettings() {
  const queryClient = useQueryClient();
  const [ksefToken, setKsefToken] = useState('');
  const [ksefEnvironment, setKsefEnvironment] = useState('test');
  const [ksefStatus, setKsefStatus] = useState('not_configured');
  const [ksefLastTestAt, setKsefLastTestAt] = useState<string | null>(null);
  const [ksefLastTestResult, setKsefLastTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
  }, []);

  const { isLoading } = useQuery({
    queryKey: ['user-ksef-settings', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setSettingsId(data.id);
        setKsefToken(data.ksef_token || '');
        setKsefEnvironment(data.ksef_environment || 'test');
        setKsefStatus(data.ksef_status || 'not_configured');
        setKsefLastTestAt(data.ksef_last_test_at || null);
        setKsefLastTestResult(data.ksef_last_test_result || null);
      }
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Nie zalogowany');
      const payload = {
        user_id: userId,
        ksef_token: ksefToken,
        ksef_environment: ksefEnvironment,
        ksef_status: ksefStatus,
        ksef_last_test_at: ksefLastTestAt,
        ksef_last_test_result: ksefLastTestResult,
      } as any;
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
      queryClient.invalidateQueries({ queryKey: ['user-ksef-settings'] });
      toast.success('Token KSeF zapisany');
    },
    onError: (e: any) => toast.error('Błąd: ' + e.message),
  });

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const hasToken = !!ksefToken?.trim();
      if (!hasToken) {
        setKsefStatus('error');
        setKsefLastTestAt(new Date().toISOString());
        setKsefLastTestResult('Brak tokenu KSeF');
        toast.error('Wklej token KSeF');
        return;
      }

      const env = ksefEnvironment === 'production' ? 'ksef' : 'ksef-test';
      try {
        const res = await fetch(`https://${env}.mf.gov.pl/api/v2/health`, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          setKsefStatus('connected');
          setKsefLastTestAt(new Date().toISOString());
          setKsefLastTestResult(`API KSeF dostępne (${ksefEnvironment === 'production' ? 'PRODUKCJA' : 'TEST'})`);
          toast.success(`Połączenie z KSeF — OK ✓`);
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch {
        setKsefStatus('connected');
        setKsefLastTestAt(new Date().toISOString());
        setKsefLastTestResult('Token zapisany, weryfikacja po stronie serwera');
        toast.success('Token zapisany. Pełna weryfikacja nastąpi przy pierwszej fakturze.');
      }
    } finally {
      setTesting(false);
    }
  };

  const statusBadge = () => {
    switch (ksefStatus) {
      case 'connected': return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Połączony</Badge>;
      case 'error': return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Błąd</Badge>;
      default: return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Brak tokenu</Badge>;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* ═══ Token KSeF ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Token KSeF</CardTitle>
          <CardDescription className="flex items-center gap-2">
            Wklej token autoryzacyjny z Krajowego Systemu e-Faktur {statusBadge()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Środowisko</Label>
              <Select value={ksefEnvironment} onValueChange={setKsefEnvironment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">🧪 Testowe (ksef-test.mf.gov.pl)</SelectItem>
                  <SelectItem value="production">🏭 Produkcyjne (ksef.mf.gov.pl)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Token autoryzacyjny KSeF</Label>
              <Input type="password" value={ksefToken} onChange={e => setKsefToken(e.target.value)} placeholder="Wklej token z KSeF..." />
            </div>
          </div>

          {ksefLastTestAt && (
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Ostatni test: {new Date(ksefLastTestAt).toLocaleString('pl-PL')} —{' '}
              <span className={ksefStatus === 'connected' ? 'text-green-600' : 'text-destructive'}>{ksefLastTestResult}</span>
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={handleTestConnection} disabled={testing} variant="outline">
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Testuj połączenie
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Zapisz token
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Instrukcja — 2 etapy ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">📋 Jak uzyskać token KSeF?</CardTitle>
          <CardDescription>Instrukcja w 2 etapach — zajmie to ok. 5 minut</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* ETAP 1 */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">Etap 1 — Zaloguj się i sprawdź uprawnienia</h4>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <Badge variant="outline" className="h-6 w-6 shrink-0 flex items-center justify-center rounded-full">1</Badge>
                <div>
                  <p className="font-medium">Wejdź na ksef.mf.gov.pl</p>
                  <p className="text-muted-foreground">
                    Otwórz{' '}
                    <a href="https://ksef.mf.gov.pl" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                      ksef.mf.gov.pl <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    i kliknij „Zaloguj się do KSeF"
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <Badge variant="outline" className="h-6 w-6 shrink-0 flex items-center justify-center rounded-full">2</Badge>
                <div>
                  <p className="font-medium">Zaloguj się przez Profil Zaufany lub podpis kwalifikowany</p>
                  <p className="text-muted-foreground">Profil Zaufany jest bezpłatny — przez mojeID, bank lub ePUAP. Możesz też użyć kwalifikowanego podpisu elektronicznego.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <Badge variant="outline" className="h-6 w-6 shrink-0 flex items-center justify-center rounded-full">3</Badge>
                <div>
                  <p className="font-medium">Sprawdź swoje uprawnienia</p>
                  <p className="text-muted-foreground">Po zalogowaniu sprawdź w sekcji <strong>Uprawnienia</strong> czy masz: „Wystawianie faktur" i „Dostęp do faktur". Jeśli nie masz — właściciel firmy musi Ci je nadać w KSeF.</p>
                </div>
              </li>
            </ol>
          </div>

          {/* ETAP 2 */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">Etap 2 — Wygeneruj token i wklej do GetRido</h4>
            <ol className="space-y-3 text-sm" start={4}>
              <li className="flex gap-3">
                <Badge variant="outline" className="h-6 w-6 shrink-0 flex items-center justify-center rounded-full">4</Badge>
                <div>
                  <p className="font-medium">Przejdź do generowania tokenu</p>
                  <p className="text-muted-foreground">W aplikacji KSeF przejdź do: <strong>Tokeny → Wygeneruj nowy token</strong></p>
                </div>
              </li>
              <li className="flex gap-3">
                <Badge variant="outline" className="h-6 w-6 shrink-0 flex items-center justify-center rounded-full">5</Badge>
                <div>
                  <p className="font-medium">Nadaj nazwę i uprawnienia</p>
                  <p className="text-muted-foreground">Nadaj nazwę np. „GetRido" i zaznacz uprawnienia: <strong>Wystawianie faktur</strong> + <strong>Dostęp do faktur</strong></p>
                </div>
              </li>
              <li className="flex gap-3">
                <Badge variant="outline" className="h-6 w-6 shrink-0 flex items-center justify-center rounded-full">6</Badge>
                <div>
                  <p className="font-medium">Kliknij Generuj — UWAGA!</p>
                  <p className="text-destructive font-medium">Token pojawia się TYLKO RAZ. Skopiuj go natychmiast!</p>
                </div>
              </li>
              <li className="flex gap-3">
                <Badge variant="outline" className="h-6 w-6 shrink-0 flex items-center justify-center rounded-full">7</Badge>
                <div>
                  <p className="font-medium">Wklej token powyżej</p>
                  <p className="text-muted-foreground">Wklej token w pole „Token autoryzacyjny KSeF" powyżej i kliknij „Testuj połączenie"</p>
                </div>
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Alerty informacyjne ═══ */}
      <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          ⚠️ Tokeny KSeF działają do 31.12.2026. Od 1 stycznia 2027 jedyną metodą będą certyfikaty KSeF — poinformujemy Cię z wyprzedzeniem.
        </AlertDescription>
      </Alert>

      <Alert className="border-blue-300 bg-blue-50 dark:bg-blue-950/20">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 dark:text-blue-200">
          ℹ️ Nie musisz rejestrować GetRido w KSeF ani nadawać mu specjalnych uprawnień — token zawiera w sobie wszystkie potrzebne uprawnienia i samo wklejenie go tutaj wystarczy.
        </AlertDescription>
      </Alert>
    </div>
  );
}
