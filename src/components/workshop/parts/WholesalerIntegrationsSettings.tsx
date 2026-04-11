import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, XCircle, TestTube, Settings2, Lock, Info } from 'lucide-react';
import { usePartsIntegrations, useUpsertPartsIntegration, usePartsApi } from '@/hooks/useWorkshopParts';
import { toast } from 'sonner';

interface Props {
  providerId: string;
}

interface IntegrationForm {
  supplier_code: string;
  supplier_name: string;
  api_username: string;
  api_password: string;
  api_url: string;
  default_branch_id: string;
  sales_margin_percent: number;
  is_enabled: boolean;
  environment: string;
  api_extra_json: Record<string, string>;
}

const HART_BRANCHES = [
  { id: '', label: 'Domyślny (przypisany do konta)' },
  { id: '1', label: 'Centrala Opole - HUB' },
  { id: '2', label: 'Wrocław' },
  { id: '3', label: 'Bytom' },
  { id: '4', label: 'Wieliczka' },
  { id: '8', label: 'Poznań' },
  { id: '9', label: 'Katowice' },
  { id: '10', label: 'Łódź' },
  { id: '11', label: 'Częstochowa' },
  { id: '12', label: 'Zielona Góra' },
  { id: '13', label: 'Kraków' },
  { id: '15', label: 'Białystok' },
  { id: '16', label: 'Warszawa 1 (Targówek)' },
  { id: '17', label: 'Rzeszów' },
  { id: '18', label: 'Bielsko-Biała' },
  { id: '19', label: 'Warszawa 2' },
  { id: '20', label: 'Radom' },
  { id: '22', label: 'Psary' },
  { id: '23', label: 'Bydgoszcz' },
  { id: '27', label: 'Koluszki - HUB' },
  { id: '28', label: 'Szczecin' },
  { id: '29', label: 'Gdańsk' },
  { id: '30', label: 'Lublin' },
  { id: '32', label: 'Warszawa 3' },
];

const WHOLESALERS = [
  { code: 'hart', name: 'Hart', logo: '🟡', url: 'hartphp.com.pl', active: true, helpText: 'Skontaktuj się z przedstawicielem handlowym Hart aby uzyskać login i hasło API.' },
  { code: 'auto_partner', name: 'Auto Partner', logo: '🔵', url: 'autopartner.dev', active: true, helpText: 'Skontaktuj się z opiekunem Auto Partner aby uzyskać Client Code, WS Password i Client Password.' },
  { code: 'inter_cars', name: 'Inter Cars', logo: '🔴', url: 'intercars.com.pl', active: true, helpText: 'Skontaktuj się z przedstawicielem Inter Cars aby uzyskać Client ID, Client Secret oraz numer odbiorcy (kh_kod).' },
  { code: 'gordon', name: 'Gordon', logo: '🟢', url: 'gordon.com.pl', active: false, helpText: '' },
  { code: 'motorro', name: 'Motorro', logo: '🟠', url: 'motorro.eu', active: false, helpText: '' },
  { code: 'feber', name: 'Feber', logo: '🟣', url: 'feber.com.pl', active: false, helpText: '' },
  { code: 'elit', name: 'Elit Polska', logo: '🔷', url: 'elit.pl', active: false, helpText: '' },
  { code: 'autos', name: 'Autos', logo: '⬛', url: 'autos.pl', active: false, helpText: '' },
  { code: 'stahlgruber', name: 'Stahlgruber', logo: '⚪', url: 'stahlgruber.pl', active: false, helpText: '' },
  { code: 'autodoc_pro', name: 'Autodoc Pro', logo: '🔘', url: 'autodoc-pro.com', active: false, helpText: '' },
];

export function WholesalerIntegrationsSettings({ providerId }: Props) {
  const { data: integrations = [], isLoading } = usePartsIntegrations(providerId);
  const upsertIntegration = useUpsertPartsIntegration();
  const partsApi = usePartsApi();

  const [forms, setForms] = useState<Record<string, IntegrationForm>>({});
  const [testingSupplier, setTestingSupplier] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'ok' | 'error'>>({});
  const [openDialog, setOpenDialog] = useState<string | null>(null);

  useEffect(() => {
    const newForms: Record<string, IntegrationForm> = {};
    for (const w of WHOLESALERS) {
      if (!w.active) continue;
      const existing = (integrations as any[]).find((i: any) => i.supplier_code === w.code);
      newForms[w.code] = {
        supplier_code: w.code,
        supplier_name: w.name,
        api_username: existing?.api_username || '',
        api_password: existing?.api_password || '',
        api_url: existing?.api_url || '',
        default_branch_id: existing?.default_branch_id || '',
        sales_margin_percent: existing?.sales_margin_percent ?? 30,
        is_enabled: existing?.is_enabled ?? false,
        environment: existing?.environment || 'sandbox',
        api_extra_json: existing?.api_extra_json || {},
      };
      if (existing?.last_connection_status) {
        setTestResults(prev => ({ ...prev, [w.code]: existing.last_connection_status }));
      }
    }
    setForms(newForms);
  }, [integrations]);

  const updateForm = (code: string, updates: Partial<IntegrationForm>) => {
    setForms(prev => ({ ...prev, [code]: { ...prev[code], ...updates } }));
  };

  const getExtraField = (code: string, key: string) => forms[code]?.api_extra_json?.[key] || '';
  const setExtraField = (code: string, key: string, value: string) => {
    updateForm(code, { api_extra_json: { ...(forms[code]?.api_extra_json || {}), [key]: value } });
  };

  const saveIntegration = async (code: string) => {
    const form = forms[code];
    await upsertIntegration.mutateAsync({
      provider_id: providerId,
      supplier_code: form.supplier_code,
      supplier_name: form.supplier_name,
      api_username: form.api_username,
      api_password: form.api_password,
      api_url: form.api_url,
      default_branch_id: form.default_branch_id,
      sales_margin_percent: form.sales_margin_percent,
      is_enabled: form.is_enabled,
      environment: form.environment,
      api_extra_json: form.api_extra_json || {},
    });
  };

  const testConnection = async (code: string) => {
    setTestingSupplier(code);
    try {
      await saveIntegration(code);
      await partsApi.mutateAsync({
        action: 'test_connection',
        provider_id: providerId,
        supplier_code: code,
      });
      setTestResults(prev => ({ ...prev, [code]: 'ok' }));
      toast.success(`Połączenie z ${forms[code]?.supplier_name || code} działa!`);
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [code]: 'error' }));
      toast.error(`Błąd: ${err.message || 'Sprawdź dane API'}`);
    } finally {
      setTestingSupplier(null);
    }
  };

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Hurtownie motoryzacyjne</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Kliknij na kafelek aby skonfigurować połączenie z hurtownią.
        </p>
      </div>

      {/* ── KAFELKI GRID ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {WHOLESALERS.map((w) => {
          const isComingSoon = !w.active;
          const status = testResults[w.code];
          const form = forms[w.code];
          const isEnabled = form?.is_enabled;

          return (
            <div
              key={w.code}
              role="button"
              tabIndex={isComingSoon ? -1 : 0}
              onClick={() => { if (!isComingSoon) setOpenDialog(w.code); }}
              onKeyDown={(e) => { if (!isComingSoon && (e.key === 'Enter' || e.key === ' ')) setOpenDialog(w.code); }}
              className={`
                relative flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all text-center select-none
                ${isComingSoon
                  ? 'opacity-40 cursor-not-allowed bg-muted/20 border-dashed border-muted'
                  : 'cursor-pointer hover:shadow-lg hover:border-primary/50 hover:-translate-y-0.5 bg-card border-border'
                }
                ${isEnabled && !isComingSoon ? 'ring-2 ring-primary/40 border-primary/60 shadow-md' : ''}
              `}
            >
              <span className="text-4xl leading-none">{w.logo}</span>
              <span className="font-bold text-sm text-foreground">{w.name}</span>
              <span className="text-[10px] text-muted-foreground leading-tight">{w.url}</span>

              {isComingSoon && (
                <Badge variant="secondary" className="text-[9px] px-2 py-0.5 gap-0.5">
                  <Lock className="h-2.5 w-2.5" /> Wkrótce
                </Badge>
              )}

              {!isComingSoon && status === 'ok' && (
                <Badge className="bg-green-500/90 hover:bg-green-500 text-white text-[9px] px-2 py-0.5 gap-0.5">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Połączono
                </Badge>
              )}
              {!isComingSoon && status === 'error' && (
                <Badge variant="destructive" className="text-[9px] px-2 py-0.5 gap-0.5">
                  <XCircle className="h-2.5 w-2.5" /> Błąd
                </Badge>
              )}
              {!isComingSoon && !status && (
                <Badge variant="outline" className="text-[9px] px-2 py-0.5 gap-0.5">
                  <Settings2 className="h-2.5 w-2.5" /> Konfiguruj
                </Badge>
              )}
            </div>
          );
        })}
      </div>

      {/* ── HART Dialog ── */}
      <Dialog open={openDialog === 'hart'} onOpenChange={(open) => { if (!open) setOpenDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="text-2xl">🟡</span> Hart — Konfiguracja API
            </DialogTitle>
            <DialogDescription className="text-xs">
              {WHOLESALERS[0].helpText}
            </DialogDescription>
          </DialogHeader>
          {forms.hart && (
            <div className="space-y-4 pt-2">
              {/* Info box */}
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground space-y-1">
                <div className="flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">Dane dostępowe Hart REST API</p>
                    <p className="mt-1">Od Hart otrzymujesz 4 dane:</p>
                    <ul className="list-disc ml-4 mt-1 space-y-0.5">
                      <li><strong>username</strong> (np. IK59) → wpisz w pole <em>Username</em></li>
                      <li><strong>password</strong> → wpisz w pole <em>Hasło API</em></li>
                      <li><strong>identyfikator</strong> (np. 78430) — zapamiętaj, nie jest potrzebny do API</li>
                      <li><strong>kode</strong> — to Twój kod klienta, nie jest wymagany w API</li>
                    </ul>
                    <p className="mt-1.5">
                      Produkcja: <code className="text-[10px] bg-muted px-1 rounded">restapi.hartphp.com.pl</code><br />
                      Sandbox: <code className="text-[10px] bg-muted px-1 rounded">sandbox.restapi.hartphp.com.pl</code>
                    </p>
                    <p className="mt-1 text-amber-600">⚠️ Sandbox i produkcja mają <strong>oddzielne</strong> username/hasło!</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Integracja aktywna</Label>
                <Switch checked={forms.hart.is_enabled} onCheckedChange={(v) => updateForm('hart', { is_enabled: v })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Username (login) <span className="text-destructive">*</span></Label>
                  <Input
                    value={forms.hart.api_username}
                    onChange={(e) => updateForm('hart', { api_username: e.target.value })}
                    placeholder="np. IK59"
                  />
                  <p className="text-[10px] text-muted-foreground">Username otrzymany od Hart</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hasło API <span className="text-destructive">*</span></Label>
                  <Input
                    type="password"
                    value={forms.hart.api_password}
                    onChange={(e) => updateForm('hart', { api_password: e.target.value })}
                    placeholder="••••••••"
                  />
                  <p className="text-[10px] text-muted-foreground">Password otrzymany od Hart</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Środowisko</Label>
                  <Select value={forms.hart.environment} onValueChange={(v) => updateForm('hart', { environment: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">🧪 Sandbox (test)</SelectItem>
                      <SelectItem value="production">🚀 Produkcja</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Zacznij od sandbox</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Magazyn (BranchId)</Label>
                  <Select
                    value={forms.hart.default_branch_id || ''}
                    onValueChange={(v) => updateForm('hart', { default_branch_id: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Domyślny" /></SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {HART_BRANCHES.map((b) => (
                        <SelectItem key={b.id} value={b.id || 'default'}>
                          {b.id ? `${b.id} — ${b.label}` : b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Najbliższy magazyn Hart</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Marża sprzedaży %</Label>
                  <Input
                    type="number"
                    value={forms.hart.sales_margin_percent}
                    onChange={(e) => updateForm('hart', { sales_margin_percent: Number(e.target.value) })}
                  />
                  <p className="text-[10px] text-muted-foreground">Narzut na cenę hurtową</p>
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => testConnection('hart')} disabled={testingSupplier === 'hart' || !forms.hart.api_username || !forms.hart.api_password} className="gap-1.5">
                  {testingSupplier === 'hart' ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                  Testuj połączenie
                </Button>
                <Button size="sm" onClick={async () => { await saveIntegration('hart'); toast.success('Hart zapisany'); setOpenDialog(null); }} disabled={!forms.hart.api_username || !forms.hart.api_password}>
                  Zapisz
                </Button>
                {testResults.hart === 'ok' && (
                  <span className="flex items-center gap-1 text-xs text-green-600 ml-auto">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Połączenie aktywne
                  </span>
                )}
                {testResults.hart === 'error' && (
                  <span className="flex items-center gap-1 text-xs text-destructive ml-auto">
                    <XCircle className="h-3.5 w-3.5" /> Sprawdź dane
                  </span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── AUTO PARTNER Dialog ── */}
      <Dialog open={openDialog === 'auto_partner'} onOpenChange={(open) => { if (!open) setOpenDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="text-2xl">🔵</span> Auto Partner — Konfiguracja API
            </DialogTitle>
            <DialogDescription className="text-xs">
              {WHOLESALERS[1].helpText}
            </DialogDescription>
          </DialogHeader>
          {forms.auto_partner && (
            <div className="space-y-4 pt-2">
              {/* Info box */}
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground space-y-1">
                <div className="flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">Jak uzyskać dane dostępowe?</p>
                    <ol className="list-decimal ml-4 mt-1 space-y-0.5">
                      <li>Skontaktuj się z opiekunem handlowym Auto Partner</li>
                      <li>Poproś o <strong>Client Code, WS Password i Client Password</strong></li>
                      <li>Client Password podaj jako <strong>hash MD5</strong> (małe litery)</li>
                    </ol>
                    <p className="mt-1.5">
                      API: <code className="text-[10px] bg-muted px-1 rounded">customerapi.autopartner.dev</code>
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Integracja aktywna</Label>
                <Switch checked={forms.auto_partner.is_enabled} onCheckedChange={(v) => updateForm('auto_partner', { is_enabled: v })} />
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Client Code <span className="text-destructive">*</span></Label>
                  <Input value={getExtraField('auto_partner', 'clientCode')} onChange={(e) => setExtraField('auto_partner', 'clientCode', e.target.value)} placeholder="np. 3282058" />
                  <p className="text-[10px] text-muted-foreground">Numer klienta w systemie Auto Partner</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">WS Password <span className="text-destructive">*</span></Label>
                  <Input type="password" value={getExtraField('auto_partner', 'wsPassword')} onChange={(e) => setExtraField('auto_partner', 'wsPassword', e.target.value)} placeholder="••••••••" />
                  <p className="text-[10px] text-muted-foreground">Hasło WebService od Auto Partner</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Client Password (MD5) <span className="text-destructive">*</span></Label>
                  <Input type="password" value={getExtraField('auto_partner', 'clientPassword')} onChange={(e) => setExtraField('auto_partner', 'clientPassword', e.target.value)} placeholder="np. e10adc3949ba59abbe56..." />
                  <p className="text-[10px] text-muted-foreground">Hash MD5 hasła klienta (małe litery, 32 znaki)</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Środowisko</Label>
                  <Select value={forms.auto_partner.environment} onValueChange={(v) => updateForm('auto_partner', { environment: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">🧪 Sandbox (test)</SelectItem>
                      <SelectItem value="production">🚀 Produkcja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Marża sprzedaży %</Label>
                  <Input type="number" value={forms.auto_partner.sales_margin_percent} onChange={(e) => updateForm('auto_partner', { sales_margin_percent: Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => testConnection('auto_partner')} disabled={testingSupplier === 'auto_partner' || !getExtraField('auto_partner', 'clientCode')} className="gap-1.5">
                  {testingSupplier === 'auto_partner' ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                  Testuj połączenie
                </Button>
                <Button size="sm" onClick={async () => { await saveIntegration('auto_partner'); toast.success('Auto Partner zapisany'); setOpenDialog(null); }} disabled={!getExtraField('auto_partner', 'clientCode')}>
                  Zapisz
                </Button>
                {testResults.auto_partner === 'ok' && (
                  <span className="flex items-center gap-1 text-xs text-green-600 ml-auto">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Połączenie aktywne
                  </span>
                )}
                {testResults.auto_partner === 'error' && (
                  <span className="flex items-center gap-1 text-xs text-destructive ml-auto">
                    <XCircle className="h-3.5 w-3.5" /> Sprawdź dane
                  </span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
