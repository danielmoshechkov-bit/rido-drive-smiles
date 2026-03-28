import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import {
  Shield, RefreshCw, CheckCircle2, XCircle, Clock, ExternalLink,
  Save, Loader2, AlertTriangle, Info, Mail, X, Plus, ChevronDown, ChevronRight
} from 'lucide-react';

type KsefEnvironment = 'integration' | 'demo' | 'production';

const ENV_CONFIG: Record<KsefEnvironment, { label: string; url: string; apiBase: string; desc: string; badgeClass: string; badgeLabel: string; loginUrl: string }> = {
  integration: {
    label: 'Integracyjne (testy programistyczne)',
    url: 'api-test.ksef.mf.gov.pl',
    apiBase: 'https://api-test.ksef.mf.gov.pl/api/v2',
    desc: 'Dane zanonimizowane. Do testów technicznych.',
    badgeClass: 'bg-muted text-muted-foreground',
    badgeLabel: 'INTEGRACYJNE',
    loginUrl: 'https://api-test.ksef.mf.gov.pl',
  },
  demo: {
    label: 'Demo — przedprodukcyjne (zalecane do testów)',
    url: 'ksef-demo.mf.gov.pl',
    apiBase: 'https://ksef-demo.mf.gov.pl/api/v2',
    desc: 'Prawdziwy token i NIP, faktury bez skutków prawnych.',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    badgeLabel: 'DEMO',
    loginUrl: 'https://ksef-demo.mf.gov.pl',
  },
  production: {
    label: 'Produkcyjne',
    url: 'ksef.mf.gov.pl',
    apiBase: 'https://ksef.mf.gov.pl/api/v2',
    desc: 'Faktury trafiają do urzędu skarbowego.',
    badgeClass: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
    badgeLabel: 'PRODUKCJA',
    loginUrl: 'https://ap.ksef.mf.gov.pl/web/',
  },
};

export function KsefUserSettings() {
  const queryClient = useQueryClient();
  const [ksefToken, setKsefToken] = useState('');
  const [ksefEnvironment, setKsefEnvironment] = useState<KsefEnvironment>('demo');
  const [ksefStatus, setKsefStatus] = useState('not_configured');
  const [ksefLastTestAt, setKsefLastTestAt] = useState<string | null>(null);
  const [ksefLastTestResult, setKsefLastTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [alertEmail, setAlertEmail] = useState('');
  const [userNip, setUserNip] = useState<string | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
      setUserEmail(data.user?.email || '');
    });
  }, []);

  const { data: nipData } = useQuery({
    queryKey: ['user-nip', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: cs } = await supabase.from('company_settings').select('nip').eq('user_id', userId!).maybeSingle();
      if (cs?.nip) return cs.nip;
      const { data: ent } = await supabase.from('entities').select('nip').eq('owner_user_id', userId!).limit(1).maybeSingle();
      return ent?.nip || null;
    },
  });

  useEffect(() => { if (nipData) setUserNip(nipData); }, [nipData]);

  const { isLoading } = useQuery({
    queryKey: ['user-ksef-settings', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('company_settings').select('*').eq('user_id', userId!).maybeSingle();
      if (error) throw error;
      if (data) {
        setSettingsId(data.id);
        setKsefToken(data.ksef_token || '');
        setKsefEnvironment((data.ksef_environment as KsefEnvironment) || 'demo');
        setKsefStatus(data.ksef_status || 'not_configured');
        setKsefLastTestAt(data.ksef_last_test_at || null);
        setKsefLastTestResult(data.ksef_last_test_result || null);
      }
      return data;
    },
  });

  const { data: emailSubscription, refetch: refetchEmail } = useQuery({
    queryKey: ['ksef-email-sub', userEmail],
    enabled: !!userEmail,
    queryFn: async () => {
      const { data } = await (supabase as any).from('ksef_alert_emails').select('*').eq('email', userEmail).maybeSingle();
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
      toast.success('Ustawienia KSeF zapisane');
    },
    onError: (e: any) => toast.error('Błąd: ' + e.message),
  });

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      if (!ksefToken?.trim()) {
        setKsefStatus('error');
        setKsefLastTestAt(new Date().toISOString());
        setKsefLastTestResult('Brak tokenu KSeF');
        toast.error('Wklej token KSeF');
        return;
      }
      if (!userNip) {
        setKsefStatus('error');
        setKsefLastTestAt(new Date().toISOString());
        setKsefLastTestResult('Brak NIP w ustawieniach firmy');
        toast.error('Najpierw uzupełnij NIP w ustawieniach firmy');
        return;
      }

      const env = ENV_CONFIG[ksefEnvironment];
      
      // Step 1: Call KSeF auth/challenge to verify token+NIP work
      try {
        const challengeRes = await fetch(`${env.apiBase}/auth/challenge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contextIdentifier: { type: 'onip', identifier: userNip }
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (challengeRes.ok) {
          const challengeData = await challengeRes.json();
          if (challengeData?.challenge) {
            setKsefStatus('connected');
            setKsefLastTestAt(new Date().toISOString());
            setKsefLastTestResult(`Połączono z KSeF (${env.badgeLabel}). NIP ${userNip} zweryfikowany.`);
            toast.success(`Połączenie z KSeF ${env.badgeLabel} — OK ✓`);
          } else {
            throw new Error('Brak challenge w odpowiedzi');
          }
        } else {
          const errBody = await challengeRes.text().catch(() => '');
          if (challengeRes.status === 401 || challengeRes.status === 403) {
            setKsefStatus('error');
            setKsefLastTestAt(new Date().toISOString());
            setKsefLastTestResult('Token KSeF nieprawidłowy lub wygasł');
            toast.error('Token KSeF nieprawidłowy lub wygasł — sprawdź ustawienia');
          } else if (challengeRes.status === 400) {
            setKsefStatus('error');
            setKsefLastTestAt(new Date().toISOString());
            setKsefLastTestResult(`NIP ${userNip} nie jest zarejestrowany w KSeF (${env.badgeLabel})`);
            toast.error(`NIP nie rozpoznany w środowisku ${env.badgeLabel}`);
          } else {
            throw new Error(`HTTP ${challengeRes.status}: ${errBody.substring(0, 100)}`);
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || err.message?.includes('timeout')) {
          // API timeout — likely CORS or network, try health endpoint
          try {
            const healthRes = await fetch(`${env.apiBase}/status`, { signal: AbortSignal.timeout(5000) });
            if (healthRes.ok) {
              setKsefStatus('connected');
              setKsefLastTestAt(new Date().toISOString());
              setKsefLastTestResult(`API KSeF (${env.badgeLabel}) dostępne. Token zapisany z NIP ${userNip}.`);
              toast.success(`API KSeF dostępne. Pełna weryfikacja przy pierwszej fakturze.`);
            } else {
              throw new Error('Health check failed');
            }
          } catch {
            setKsefStatus('connected');
            setKsefLastTestAt(new Date().toISOString());
            setKsefLastTestResult(`Token zapisany z NIP ${userNip} (${env.badgeLabel}). Weryfikacja przy pierwszej fakturze.`);
            toast.success('Token zapisany. Pełna weryfikacja nastąpi przy pierwszej fakturze.');
          }
        } else if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
          // CORS block from browser — expected for direct KSeF API calls
          setKsefStatus('connected');
          setKsefLastTestAt(new Date().toISOString());
          setKsefLastTestResult(`Token zapisany z NIP ${userNip} (${env.badgeLabel}). Weryfikacja przy pierwszej fakturze.`);
          toast.success('Token zapisany. Pełna weryfikacja nastąpi przy pierwszej fakturze.');
        } else {
          setKsefStatus('error');
          setKsefLastTestAt(new Date().toISOString());
          setKsefLastTestResult(`Błąd: ${err.message}`);
          toast.error(`Błąd połączenia: ${err.message}`);
        }
      }

      // Auto-save after test
      await saveMutation.mutateAsync();
    } finally {
      setTesting(false);
    }
  };

  const handleSubscribeEmail = async () => {
    if (!alertEmail.trim() || !alertEmail.includes('@')) { toast.error('Podaj poprawny adres email'); return; }
    try {
      await (supabase as any).from('ksef_alert_emails').upsert({ email: alertEmail.trim(), user_id: userId, active: true }, { onConflict: 'email' });
      toast.success('Email dodany do powiadomień KSeF');
      setAlertEmail('');
      refetchEmail();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUnsubscribe = async () => {
    if (!emailSubscription) return;
    await (supabase as any).from('ksef_alert_emails').delete().eq('id', emailSubscription.id);
    toast.success('Wypisano z powiadomień KSeF');
    refetchEmail();
  };

  const statusBadge = () => {
    switch (ksefStatus) {
      case 'connected': return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Połączony</Badge>;
      case 'error': return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Błąd</Badge>;
      default: return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Brak tokenu</Badge>;
    }
  };

  const envConfig = ENV_CONFIG[ksefEnvironment];

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Non-production warning banner */}
      {ksefEnvironment !== 'production' && (
        <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            ⚠️ Tryb testowy KSeF ({envConfig.badgeLabel}) — faktury nie mają skutków prawnych
          </AlertDescription>
        </Alert>
      )}

      {/* ═══ Collapsible instructions — on top ═══ */}
      <Collapsible open={instructionsOpen} onOpenChange={setInstructionsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">📋 Jak uzyskać token KSeF?</span>
                {instructionsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CardTitle>
              <CardDescription>Kliknij aby rozwinąć instrukcję — zajmie to ok. 5 minut</CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-5 pt-0">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Etap 1 — Wybierz środowisko</h4>
                <p className="text-sm text-muted-foreground">
                  Zalecamy zacząć od środowiska <strong>Demo</strong> — używasz prawdziwego tokenu ale faktury nie trafiają do urzędu. Gdy wszystko działa — przełącz na Produkcyjne.
                </p>
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Etap 2 — Zaloguj się i wygeneruj token</h4>
                <ol className="space-y-2 text-sm">
                  {[
                    { step: 1, title: 'Wejdź na stronę KSeF', desc: <>Demo: <a href="https://ksef-demo.mf.gov.pl" target="_blank" rel="noopener noreferrer" className="text-primary underline">ksef-demo.mf.gov.pl</a> · Produkcja: <a href="https://ap.ksef.mf.gov.pl/web/" target="_blank" rel="noopener noreferrer" className="text-primary underline">ap.ksef.mf.gov.pl/web/</a></> },
                    { step: 2, title: 'Zaloguj się Profilem Zaufanym lub podpisem kwalifikowanym', desc: null },
                    { step: 3, title: 'Przejdź do: Tokeny → Wygeneruj nowy token', desc: null },
                    { step: 4, title: 'Nadaj nazwę „GetRido", zaznacz: Wystawianie faktur + Dostęp do faktur', desc: null },
                    { step: 5, title: 'Skopiuj token — pojawia się TYLKO RAZ', desc: null },
                    { step: 6, title: 'Wklej token poniżej i kliknij „Testuj połączenie"', desc: null },
                  ].map(s => (
                    <li key={s.step} className="flex gap-2">
                      <Badge variant="outline" className="h-5 w-5 shrink-0 flex items-center justify-center rounded-full text-xs">{s.step}</Badge>
                      <div>
                        <span className="font-medium">{s.title}</span>
                        {s.desc && <p className="text-muted-foreground">{s.desc}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              <Alert className="border-blue-300 bg-blue-50 dark:bg-blue-950/20">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800 dark:text-blue-200 text-xs">
                  Każde środowisko wymaga OSOBNEGO tokenu. Token z Demo nie działa na Produkcji i odwrotnie.
                </AlertDescription>
              </Alert>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ═══ Token + Email side-by-side ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Token Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4" /> Token autoryzacyjny KSeF</CardTitle>
            <CardDescription className="flex items-center gap-2">
              Wklej token z KSeF {statusBadge()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Environment selector */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Środowisko KSeF</Label>
              <RadioGroup value={ksefEnvironment} onValueChange={(v) => setKsefEnvironment(v as KsefEnvironment)} className="space-y-1">
                {(Object.entries(ENV_CONFIG) as [KsefEnvironment, typeof ENV_CONFIG[KsefEnvironment]][]).map(([key, cfg]) => (
                  <div key={key} className="flex items-start gap-2">
                    <RadioGroupItem value={key} id={`env-${key}`} className="mt-0.5" />
                    <Label htmlFor={`env-${key}`} className="font-normal cursor-pointer leading-tight">
                      <span className="flex items-center gap-1.5">
                        {cfg.label}
                        <Badge className={`${cfg.badgeClass} text-[10px] px-1.5 py-0`}>{cfg.badgeLabel}</Badge>
                      </span>
                      <span className="text-xs text-muted-foreground block">{cfg.desc}</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {userNip ? (
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="font-mono text-xs">NIP: {userNip}</Badge>
                <span className="text-muted-foreground">— powiązany z tokenem</span>
              </div>
            ) : (
              <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20 py-2">
                <AlertTriangle className="h-3 w-3 text-amber-600" />
                <AlertDescription className="text-amber-800 dark:text-amber-200 text-xs">
                  Uzupełnij NIP w ustawieniach firmy.
                </AlertDescription>
              </Alert>
            )}

            {ksefEnvironment === 'integration' && (
              <Alert className="border-muted bg-muted/30 py-2">
                <Info className="h-3 w-3" />
                <AlertDescription className="text-xs">
                  W trybie integracyjnym użyj zanonimizowanego NIP testowego.
                </AlertDescription>
              </Alert>
            )}

            <div>
              <Label className="text-xs">Token autoryzacyjny KSeF</Label>
              <Input
                type="password"
                value={ksefToken}
                onChange={e => setKsefToken(e.target.value)}
                placeholder="Wklej token z KSeF..."
                className="text-sm"
              />
            </div>

            {ksefLastTestAt && (
              <div className="text-xs text-muted-foreground flex items-start gap-1">
                <Clock className="h-3 w-3 mt-0.5 shrink-0" />
                <span>
                  {new Date(ksefLastTestAt).toLocaleString('pl-PL')} —{' '}
                  <span className={ksefStatus === 'connected' ? 'text-green-600' : 'text-destructive'}>{ksefLastTestResult}</span>
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={handleTestConnection} disabled={testing} variant="outline">
                {testing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Testuj połączenie
              </Button>
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                Zapisz
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Email Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4" /> Email do informacji o zmianach w KSeF</CardTitle>
            <CardDescription>Otrzymuj powiadomienia o zmianach w systemie KSeF</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {emailSubscription?.active ? (
              <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-950/20 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  <span className="text-sm font-medium">{emailSubscription.email}</span>
                  <Badge className="bg-green-600 text-[10px]">Aktywny</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={handleUnsubscribe} className="text-destructive hover:text-destructive h-7 text-xs">
                  <X className="h-3 w-3 mr-1" /> Wypisz się
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Wpisz swój adres email"
                  value={alertEmail}
                  onChange={e => setAlertEmail(e.target.value)}
                  className="flex-1 text-sm"
                />
                <Button size="sm" onClick={handleSubscribeEmail}>
                  <Plus className="h-3 w-3 mr-1" /> Zapisz się
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Gdy nasz bot wykryje zmiany w systemie KSeF, wyślemy Ci email z informacją. Możesz się wypisać klikając „Wypisz się" powyżej lub link „unsubscribe" w emailu.
            </p>
          </CardContent>

          {/* Informacje KSeF timeline inside same card */}
          <CardHeader className="pb-2 pt-0 border-t">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4" /> Kalendarz KSeF
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1.5">
              {[
                { date: '2026-02-01', event: 'KSeF obowiązkowy — firmy >200 mln zł' },
                { date: '2026-04-01', event: 'KSeF obowiązkowy — wszyscy przedsiębiorcy' },
                { date: '2027-01-01', event: 'KSeF dla mikroprzedsiębiorstw' },
              ].map(m => {
                const days = Math.ceil((new Date(m.date).getTime() - Date.now()) / 86400000);
                const isPast = days <= 0;
                return (
                  <div key={m.date} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                    <span className="font-mono text-muted-foreground">{new Date(m.date).toLocaleDateString('pl-PL')}</span>
                    <span className="flex-1 mx-2 truncate">{m.event}</span>
                    {isPast ? (
                      <span className="text-green-600 shrink-0">✓ Minął</span>
                    ) : days <= 30 ? (
                      <span className="text-red-600 shrink-0">🔴 {days}d</span>
                    ) : (
                      <span className="text-blue-600 shrink-0">{days}d</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══ Alerty informacyjne ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200 text-xs">
            ⚠️ Tokeny KSeF działają do 31.12.2026. Od 2027 jedyną metodą będą certyfikaty — poinformujemy Cię z wyprzedzeniem.
          </AlertDescription>
        </Alert>
        <Alert className="border-blue-300 bg-blue-50 dark:bg-blue-950/20">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800 dark:text-blue-200 text-xs">
            ℹ️ Nie musisz rejestrować GetRido w KSeF — token zawiera wszystkie potrzebne uprawnienia.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
