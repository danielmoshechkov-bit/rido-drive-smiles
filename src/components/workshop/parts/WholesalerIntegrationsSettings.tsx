import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, XCircle, TestTube } from 'lucide-react';
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

const WHOLESALERS = [
  {
    code: 'hart',
    name: 'HART',
    logo: '🟡',
    url: 'hartphp.com.pl',
    active: true,
    helpText: 'hartphp.com.pl — skontaktuj się z przedstawicielem handlowym Hart aby uzyskać login i hasło API',
  },
  {
    code: 'auto_partner',
    name: 'Auto Partner',
    logo: '🔵',
    url: 'autopartner.dev',
    active: true,
    helpText: 'autopartner.dev — skontaktuj się z opiekunem Auto Partner aby uzyskać Client Code, WS Password i Client Password',
  },
  { code: 'inter_cars', name: 'Inter Cars', logo: '🔴', url: 'intercars.com.pl', active: false, helpText: '' },
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
      toast.success(`Połączenie z ${forms[code]?.supplier_name || code} działa poprawnie!`);
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [code]: 'error' }));
      toast.error(`Błąd połączenia: ${err.message || 'Sprawdź dane API'}`);
    } finally {
      setTestingSupplier(null);
    }
  };

  if (isLoading) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Podłącz hurtownie motoryzacyjne aby automatycznie wyszukiwać i zamawiać części.
      </p>

      <div className="space-y-4">
        {WHOLESALERS.map(w => {
          const form = forms[w.code];
          const isComingSoon = !w.active;

          return (
            <Card key={w.code} className={isComingSoon ? 'opacity-50' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="text-lg">{w.logo}</span>
                      {w.name}
                      {isComingSoon && (
                        <Badge variant="secondary" className="text-[10px]">Wkrótce</Badge>
                      )}
                      {!isComingSoon && testResults[w.code] === 'ok' && (
                        <Badge className="bg-green-500 text-white text-[10px]">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Połączono
                        </Badge>
                      )}
                      {!isComingSoon && testResults[w.code] === 'error' && (
                        <Badge variant="destructive" className="text-[10px]">
                          <XCircle className="h-3 w-3 mr-1" /> Błąd
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {isComingSoon ? w.url : w.helpText}
                    </CardDescription>
                  </div>
                  <Switch
                    checked={form?.is_enabled ?? false}
                    onCheckedChange={v => updateForm(w.code, { is_enabled: v })}
                    disabled={isComingSoon}
                  />
                </div>
              </CardHeader>

              {/* HART form */}
              {w.code === 'hart' && form?.is_enabled && (
                <CardContent className="space-y-4 pt-0">
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs">Login API</Label>
                      <Input
                        value={form.api_username}
                        onChange={e => updateForm('hart', { api_username: e.target.value })}
                        placeholder="Login z Hart"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Hasło API</Label>
                      <Input
                        type="password"
                        value={form.api_password}
                        onChange={e => updateForm('hart', { api_password: e.target.value })}
                        placeholder="Hasło z Hart"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Środowisko</Label>
                      <Select value={form.environment} onValueChange={v => updateForm('hart', { environment: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sandbox">Sandbox (testowe)</SelectItem>
                          <SelectItem value="production">Produkcja</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Domyślny magazyn ID</Label>
                      <Input
                        value={form.default_branch_id}
                        onChange={e => updateForm('hart', { default_branch_id: e.target.value })}
                        placeholder="np. 1 = Centrala Opole, 16 = Warszawa, 29 = Gdańsk"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Marża sprzedaży (%)</Label>
                      <Input
                        type="number"
                        value={form.sales_margin_percent}
                        onChange={e => updateForm('hart', { sales_margin_percent: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => testConnection('hart')} disabled={testingSupplier === 'hart'} className="gap-1">
                      {testingSupplier === 'hart' ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                      Testuj połączenie
                    </Button>
                    <Button size="sm" onClick={() => saveIntegration('hart')}>Zapisz</Button>
                  </div>
                </CardContent>
              )}

              {/* AUTO PARTNER form */}
              {w.code === 'auto_partner' && form?.is_enabled && (
                <CardContent className="space-y-4 pt-0">
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs">Client Code</Label>
                      <Input
                        value={getExtraField('auto_partner', 'clientCode')}
                        onChange={e => setExtraField('auto_partner', 'clientCode', e.target.value)}
                        placeholder="np. 3282058"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">WS Password</Label>
                      <Input
                        type="password"
                        value={getExtraField('auto_partner', 'wsPassword')}
                        onChange={e => setExtraField('auto_partner', 'wsPassword', e.target.value)}
                        placeholder="hasło WebService od AP"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Client Password</Label>
                      <Input
                        type="password"
                        value={getExtraField('auto_partner', 'clientPassword')}
                        onChange={e => setExtraField('auto_partner', 'clientPassword', e.target.value)}
                        placeholder="hash MD5 hasła klienta"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Środowisko</Label>
                      <Select value={form.environment} onValueChange={v => updateForm('auto_partner', { environment: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sandbox">Sandbox (testowe)</SelectItem>
                          <SelectItem value="production">Produkcja</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Marża sprzedaży (%)</Label>
                      <Input
                        type="number"
                        value={form.sales_margin_percent}
                        onChange={e => updateForm('auto_partner', { sales_margin_percent: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => testConnection('auto_partner')} disabled={testingSupplier === 'auto_partner'} className="gap-1">
                      {testingSupplier === 'auto_partner' ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                      Testuj połączenie
                    </Button>
                    <Button size="sm" onClick={() => saveIntegration('auto_partner')}>Zapisz</Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
