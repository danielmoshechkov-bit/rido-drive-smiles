import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, Save, RefreshCw, CheckCircle, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';

const CRM_LIST = [
  {
    id: 'asari',
    name: 'ASARI CRM',
    logo: '🏢',
    urlExample: 'https://pliki.asari.pl/export/TWOJE_ID/feed.xml',
    steps: [
      'Zaloguj się do ASARI CRM (login.asari.pro)',
      'Przejdź do: Ustawienia → Eksport na portale',
      'Kliknij "Dodaj własny FTP / URL"',
      'Skopiuj wygenerowany URL eksportu i wklej poniżej',
    ],
    docsUrl: 'https://wiki.asari.pl',
  },
  {
    id: 'esticrm',
    name: 'EstiCRM',
    logo: '🏠',
    urlExample: 'https://export.esticrm.pl/feed/TWOJE_ID.xml',
    steps: [
      'Zaloguj się do EstiCRM',
      'Przejdź do: Ustawienia → Portale → Eksport na stronę WWW',
      'Wybierz format: EstiCRM XML lub EbiuroV2',
      'Skopiuj URL eksportu i wklej poniżej',
    ],
    docsUrl: 'https://info.esticrm.pl/instrukcje/eksporty/',
  },
  {
    id: 'imo',
    name: 'IMO',
    logo: '📋',
    urlExample: 'https://eksport.imo.pl/TWOJE_ID/feed.xml',
    steps: [
      'Zaloguj się do programu IMO',
      'Przejdź do: Administracja → Ustawienia eksportu',
      'Dodaj nowy portal → wybierz "URL/HTTP"',
      'Skopiuj adres URL eksportu i wklej poniżej',
    ],
    docsUrl: 'https://instrukcja.imo.pl',
  },
  {
    id: 'agencja3000',
    name: 'Agencja3000',
    logo: '🔑',
    urlExample: 'https://www.agencja3000.com/export/TWOJE_ID.xml',
    steps: [
      'Zaloguj się do Agencja3000',
      'Przejdź do: Konfiguracja → Eksporty na portale',
      'Dodaj nowy portal i pobierz URL eksportu XML',
      'Wklej URL poniżej',
    ],
    docsUrl: '',
  },
  {
    id: 'galactica',
    name: 'Galactica Gestor',
    logo: '🌐',
    urlExample: 'https://export.galactica.pl/TWOJE_ID/nieruchomosci.xml',
    steps: [
      'Zaloguj się do Galactica Gestor',
      'Przejdź do: Eksporty → Konfiguracja portalu',
      'Dodaj GetRido jako nowy portal i skopiuj URL',
    ],
    docsUrl: '',
  },
  {
    id: 'domus',
    name: 'Domus',
    logo: '🏡',
    urlExample: 'https://export.domus.pl/feed/TWOJE_ID.xml',
    steps: [
      'Zaloguj się do Domus',
      'Przejdź do: Ustawienia → Portale nieruchomości',
      'Dodaj GetRido jako portal i skopiuj URL eksportu',
    ],
    docsUrl: '',
  },
  {
    id: 'other',
    name: 'Inny program / własny XML',
    logo: '⚙️',
    urlExample: 'https://twoja-strona.pl/feed/nieruchomosci.xml',
    steps: [
      'Wygeneruj plik XML z ofertami w formacie EbiuroV2 lub EstiCRM XML',
      'Umieść plik na publicznie dostępnym serwerze',
      'Wklej URL do pliku XML poniżej',
      'Obsługujemy formaty: EbiuroV2, EstiCRM XML, Agencja3000 XML',
    ],
    docsUrl: '',
  },
];

interface AgencyCRMSettingsProps {
  agencyId?: string;
}

export function AgencyCRMSettings({ agencyId }: AgencyCRMSettingsProps) {
  const [selectedCrm, setSelectedCrm] = useState('');
  const [xmlUrl, setXmlUrl] = useState('');
  const [xmlLogin, setXmlLogin] = useState('');
  const [xmlPassword, setXmlPassword] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'error'>('idle');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [existingId, setExistingId] = useState<string | null>(null);

  const crm = CRM_LIST.find(c => c.id === selectedCrm);

  useEffect(() => {
    if (agencyId) loadConfig();
  }, [agencyId]);

  const loadConfig = async () => {
    const { data } = await supabase
      .from('agency_crm_integrations')
      .select('*')
      .eq('agency_id', agencyId as string)
      .maybeSingle();

    if (data) {
      setExistingId(data.id);
      setSelectedCrm(data.provider_code || '');
      setXmlUrl(data.xml_url || '');
      setXmlLogin(data.xml_login || '');
      setIsActive(data.is_enabled || false);
      setLastSync(data.last_import_at || null);
      setImportedCount(data.total_offers_in_feed || 0);
    }
  };

  const handleTest = async () => {
    if (!xmlUrl) { toast.error('Wpisz URL do pliku XML'); return; }
    setTesting(true);
    setTestResult('idle');
    try {
      const { data, error } = await supabase.functions.invoke('test-crm-feed', {
        body: { url: xmlUrl, login: xmlLogin, password: xmlPassword }
      });
      if (error || !data?.ok) {
        setTestResult('error');
        toast.error(data?.message || 'Nie można pobrać pliku XML. Sprawdź URL.');
      } else {
        setTestResult('ok');
        toast.success(`✅ Połączenie działa! Znaleziono ${data.count || '?'} ofert.`);
      }
    } catch {
      setTestResult('error');
      toast.error('Błąd połączenia');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!selectedCrm || !xmlUrl) { toast.error('Wybierz CRM i wpisz URL'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        agency_id: agencyId,
        provider_code: selectedCrm,
        import_mode: 'xml_url',
        xml_url: xmlUrl,
        xml_login: xmlLogin,
        is_enabled: isActive,
        updated_at: new Date().toISOString(),
      };
      const { error } = existingId
        ? await supabase.from('agency_crm_integrations').update(payload).eq('id', existingId)
        : await supabase.from('agency_crm_integrations').insert(payload);
      if (error) throw error;
      toast.success('✅ Konfiguracja zapisana! Pierwsze pobieranie ofert nastąpi w ciągu godziny.');
      await loadConfig();
    } catch (e: any) {
      toast.error('Błąd zapisu: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSyncNow = async () => {
    if (!agencyId) return;
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-crm-listings', {
        body: { agencyId }
      });
      if (error) throw error;
      toast.success(`✅ Zaimportowano ${data?.imported || 0} ofert!`);
      await loadConfig();
    } catch (e: any) {
      toast.error('Błąd synchronizacji: ' + e.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + status */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            <CardTitle>Połącz z systemem CRM</CardTitle>
          </div>
          <CardDescription>
            Twoje oferty z programu CRM będą automatycznie pojawiać się na GetRido.
            Wystarczy jeden URL — resztą zajmiemy się my.
          </CardDescription>
        </CardHeader>
        {existingId && (
          <CardContent>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-sm">
                {isActive
                  ? <CheckCircle className="h-4 w-4 text-green-500" />
                  : <AlertCircle className="h-4 w-4 text-muted-foreground" />}
                <span className="text-muted-foreground">
                  {isActive
                    ? `Aktywna · ${importedCount} ofert · ostatnia sync: ${lastSync ? new Date(lastSync).toLocaleString('pl') : 'brak'}`
                    : 'Integracja wyłączona'}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={handleSyncNow} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Pobierz teraz
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Step 1 — CRM selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Krok 1 — Wybierz swój program</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {CRM_LIST.map(c => (
              <button
                key={c.id}
                onClick={() => { setSelectedCrm(c.id); setShowSteps(true); setTestResult('idle'); }}
                className={`p-3 rounded-xl border-2 text-left transition-all hover:border-primary/60 ${
                  selectedCrm === c.id
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border'
                }`}
              >
                <p className="text-2xl mb-1">{c.logo}</p>
                <p className="text-xs font-semibold leading-tight">{c.name}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — Instructions */}
      {crm && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Krok 2 — Jak pobrać URL z {crm.name}
              </CardTitle>
              <button
                onClick={() => setShowSteps(!showSteps)}
                className="text-xs text-primary flex items-center gap-1 hover:underline"
              >
                {showSteps ? <><ChevronUp className="h-3 w-3" /> Ukryj</> : <><ChevronDown className="h-3 w-3" /> Pokaż</>}
              </button>
            </div>
          </CardHeader>
          {showSteps && (
            <CardContent>
              <div className="space-y-2">
                {crm.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
              {crm.docsUrl && (
                <a href={crm.docsUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary underline mt-3 inline-block">
                  → Pełna dokumentacja {crm.name}
                </a>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Step 3 — URL input */}
      {crm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Krok 3 — Wklej URL do pliku XML
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                URL do pliku XML z ofertami *
              </Label>
              <div className="flex gap-2">
                <Input
                  value={xmlUrl}
                  onChange={(e) => { setXmlUrl(e.target.value); setTestResult('idle'); }}
                  placeholder={crm.urlExample}
                  className={`flex-1 text-sm ${
                    testResult === 'ok' ? 'border-green-500' : testResult === 'error' ? 'border-destructive' : ''
                  }`}
                />
                <Button variant="outline" onClick={handleTest} disabled={testing || !xmlUrl}>
                  {testing
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : testResult === 'ok'
                    ? <CheckCircle className="h-4 w-4 text-green-500" />
                    : testResult === 'error'
                    ? <AlertCircle className="h-4 w-4 text-destructive" />
                    : null}
                  <span className="ml-1">Testuj</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Np.: {crm.urlExample}
              </p>
            </div>

            {/* Optional login/pass */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Login i hasło (opcjonalnie — jeśli plik XML jest chroniony)
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Login</Label>
                  <Input value={xmlLogin} onChange={e => setXmlLogin(e.target.value)} placeholder="login" className="text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Hasło</Label>
                  <Input type="password" value={xmlPassword} onChange={e => setXmlPassword(e.target.value)} placeholder="hasło" className="text-sm" />
                </div>
              </div>
            </div>

            {/* Auto-sync toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium">Automatyczna synchronizacja co godzinę</p>
                <p className="text-xs text-muted-foreground">Nowe i zmienione oferty pobierane są automatycznie</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            {/* Save */}
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving || !xmlUrl || !selectedCrm}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Zapisz i uruchom integrację
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info box */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Jak działa import?</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Twój CRM generuje plik XML — GetRido pobiera go automatycznie co godzinę</p>
            <p>• Nowe oferty są dodawane, zmienione aktualizowane, usunięte dezaktywowane</p>
            <p>• Każda oferta jest oznaczona jako „Źródło: {crm?.name || 'CRM'}"</p>
            <p>• Możesz w każdej chwili wyłączyć lub zmienić integrację</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
