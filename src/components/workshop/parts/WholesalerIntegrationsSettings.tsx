import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, XCircle, Plus, Trash2, TestTube } from 'lucide-react';
import { usePartsIntegrations, useUpsertPartsIntegration, usePartsApi } from '@/hooks/useWorkshopParts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

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
}

const POLISH_WHOLESALERS = [
  { code: 'hart', name: 'HART', url: 'hartphp.com.pl', logo: '🟡', apiInfo: 'REST API — skontaktuj się z opiekunem handlowym Hart' },
  { code: 'auto_partner', name: 'Auto Partner', url: 'apcat.eu', logo: '🔵', apiInfo: 'WebService API — kontakt z opiekunem Auto Partner' },
  { code: 'inter_cars', name: 'Inter Cars', url: 'intercars.com.pl', logo: '🔴', apiInfo: 'IC Katalog API — wymaga umowy z Inter Cars' },
  { code: 'gordon', name: 'Gordon', url: 'gordon.com.pl', logo: '🟢', apiInfo: 'API Gordon — kontakt: biuro@gordon.com.pl' },
  { code: 'motorro', name: 'Motorro', url: 'motorro.eu', logo: '🟠', apiInfo: 'Motorro API — kontakt z przedstawicielem' },
  { code: 'feber', name: 'Feber', url: 'feber.com.pl', logo: '🟣', apiInfo: 'Feber Web API — kontakt z działem IT' },
  { code: 'elit', name: 'Elit Polska', url: 'elit.pl', logo: '🔷', apiInfo: 'LKQ/Elit API — kontakt z opiekunem' },
  { code: 'autos', name: 'Autos', url: 'autos.pl', logo: '⬛', apiInfo: 'Autos API — kontakt z działem handlowym' },
];

export function WholesalerIntegrationsSettings({ providerId }: Props) {
  const { data: integrations = [], isLoading } = usePartsIntegrations(providerId);
  const upsertIntegration = useUpsertPartsIntegration();
  const partsApi = usePartsApi();
  const queryClient = useQueryClient();

  const [forms, setForms] = useState<Record<string, IntegrationForm>>({});
  const [testingSupplier, setTestingSupplier] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'ok' | 'error'>>({});
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  useEffect(() => {
    const newForms: Record<string, IntegrationForm> = {};
    
    // Known wholesalers
    for (const s of POLISH_WHOLESALERS) {
      const existing = integrations.find((i: any) => i.supplier_code === s.code);
      newForms[s.code] = {
        supplier_code: s.code,
        supplier_name: s.name,
        api_username: existing?.api_username || '',
        api_password: existing?.api_password || '',
        api_url: existing?.api_url || '',
        default_branch_id: existing?.default_branch_id || '',
        sales_margin_percent: existing?.sales_margin_percent ?? 30,
        is_enabled: existing?.is_enabled ?? false,
        environment: existing?.environment || 'sandbox',
      };
      if (existing?.last_connection_status) {
        setTestResults(prev => ({ ...prev, [s.code]: existing.last_connection_status }));
      }
    }

    // Custom integrations
    for (const i of integrations as any[]) {
      if (!POLISH_WHOLESALERS.find(w => w.code === i.supplier_code)) {
        newForms[i.supplier_code] = {
          supplier_code: i.supplier_code,
          supplier_name: i.supplier_name || i.supplier_code,
          api_username: i.api_username || '',
          api_password: i.api_password || '',
          api_url: i.api_url || '',
          default_branch_id: i.default_branch_id || '',
          sales_margin_percent: i.sales_margin_percent ?? 30,
          is_enabled: i.is_enabled ?? false,
          environment: i.environment || 'production',
        };
        if (i.last_connection_status) {
          setTestResults(prev => ({ ...prev, [i.supplier_code]: i.last_connection_status }));
        }
      }
    }

    setForms(newForms);
  }, [integrations]);

  const updateForm = (code: string, updates: Partial<IntegrationForm>) => {
    setForms(prev => ({
      ...prev,
      [code]: { ...prev[code], ...updates },
    }));
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

  const deleteCustomIntegration = async (code: string) => {
    try {
      await (supabase as any)
        .from('workshop_parts_integrations')
        .delete()
        .eq('provider_id', providerId)
        .eq('supplier_code', code);
      queryClient.invalidateQueries({ queryKey: ['workshop-parts-integrations'] });
      toast.success('Integracja usunięta');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const addCustomWholesaler = async () => {
    if (!customName.trim()) return;
    const code = 'custom_' + customName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    await upsertIntegration.mutateAsync({
      provider_id: providerId,
      supplier_code: code,
      supplier_name: customName,
      api_url: customUrl,
      is_enabled: false,
      sales_margin_percent: 30,
      environment: 'production',
    });
    setCustomDialogOpen(false);
    setCustomName('');
    setCustomUrl('');
  };

  if (isLoading) return <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;

  // Separate known vs custom
  const knownCodes = POLISH_WHOLESALERS.map(w => w.code);
  const customIntegrations = Object.entries(forms).filter(([code]) => !knownCodes.includes(code));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Podłącz hurtownie motoryzacyjne aby automatycznie wyszukiwać i zamawiać części. 
        Możesz dodać dowolną hurtownię z własnym API.
      </p>

      {/* Polish wholesalers */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Hurtownie motoryzacyjne w Polsce</h3>
        {POLISH_WHOLESALERS.map(supplier => {
          const form = forms[supplier.code];
          if (!form) return null;

          return (
            <Card key={supplier.code}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <span>{supplier.logo}</span>
                      {supplier.name}
                      {testResults[supplier.code] === 'ok' && (
                        <Badge className="bg-green-500 text-white text-[10px]">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Połączono
                        </Badge>
                      )}
                      {testResults[supplier.code] === 'error' && (
                        <Badge variant="destructive" className="text-[10px]">
                          <XCircle className="h-3 w-3 mr-1" /> Błąd
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>{supplier.url} — {supplier.apiInfo}</CardDescription>
                  </div>
                  <Switch
                    checked={form.is_enabled}
                    onCheckedChange={v => updateForm(supplier.code, { is_enabled: v })}
                  />
                </div>
              </CardHeader>
              {form.is_enabled && (
                <CardContent className="space-y-4 pt-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Login API</Label>
                      <Input
                        value={form.api_username}
                        onChange={e => updateForm(supplier.code, { api_username: e.target.value })}
                        placeholder="Wpisz login API"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Hasło API</Label>
                      <Input
                        type="password"
                        value={form.api_password}
                        onChange={e => updateForm(supplier.code, { api_password: e.target.value })}
                        placeholder="Wpisz hasło API"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs">Środowisko</Label>
                      <Select value={form.environment} onValueChange={v => updateForm(supplier.code, { environment: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sandbox">Sandbox (testowe)</SelectItem>
                          <SelectItem value="production">Produkcja</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Domyślny magazyn (ID)</Label>
                      <Input
                        value={form.default_branch_id}
                        onChange={e => updateForm(supplier.code, { default_branch_id: e.target.value })}
                        placeholder="ID magazynu"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Marża sprzedaży (%)</Label>
                      <Input
                        type="number"
                        value={form.sales_margin_percent}
                        onChange={e => updateForm(supplier.code, { sales_margin_percent: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection(supplier.code)}
                      disabled={testingSupplier === supplier.code || !form.api_username}
                      className="gap-1"
                    >
                      {testingSupplier === supplier.code ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <TestTube className="h-4 w-4" />
                      )}
                      Testuj połączenie
                    </Button>
                    <Button size="sm" onClick={() => saveIntegration(supplier.code)}>
                      Zapisz
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Custom integrations */}
      {customIntegrations.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Własne integracje</h3>
          {customIntegrations.map(([code, form]) => (
            <Card key={code}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      ⚙️ {form.supplier_name}
                      {testResults[code] === 'ok' && (
                        <Badge className="bg-green-500 text-white text-[10px]">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Połączono
                        </Badge>
                      )}
                      {testResults[code] === 'error' && (
                        <Badge variant="destructive" className="text-[10px]">
                          <XCircle className="h-3 w-3 mr-1" /> Błąd
                        </Badge>
                      )}
                    </CardTitle>
                    {form.api_url && <CardDescription>{form.api_url}</CardDescription>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.is_enabled}
                      onCheckedChange={v => updateForm(code, { is_enabled: v })}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteCustomIntegration(code)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {form.is_enabled && (
                <CardContent className="space-y-4 pt-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">URL API</Label>
                      <Input
                        value={form.api_url}
                        onChange={e => updateForm(code, { api_url: e.target.value })}
                        placeholder="https://api.hurtownia.pl/v1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Login API</Label>
                      <Input
                        value={form.api_username}
                        onChange={e => updateForm(code, { api_username: e.target.value })}
                        placeholder="Login"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Hasło / Klucz API</Label>
                      <Input
                        type="password"
                        value={form.api_password}
                        onChange={e => updateForm(code, { api_password: e.target.value })}
                        placeholder="Hasło lub klucz API"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Marża sprzedaży (%)</Label>
                      <Input
                        type="number"
                        value={form.sales_margin_percent}
                        onChange={e => updateForm(code, { sales_margin_percent: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection(code)}
                      disabled={testingSupplier === code || !form.api_username}
                      className="gap-1"
                    >
                      {testingSupplier === code ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                      Testuj połączenie
                    </Button>
                    <Button size="sm" onClick={() => saveIntegration(code)}>Zapisz</Button>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add custom button */}
      <Button variant="outline" className="gap-2" onClick={() => setCustomDialogOpen(true)}>
        <Plus className="h-4 w-4" /> Dodaj inną hurtownię
      </Button>

      <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dodaj własną hurtownię</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nazwa hurtowni *</Label>
              <Input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="np. Moja Hurtownia Parts" />
            </div>
            <div className="space-y-2">
              <Label>URL API (opcjonalnie)</Label>
              <Input value={customUrl} onChange={e => setCustomUrl(e.target.value)} placeholder="https://api.hurtownia.pl/v1" />
            </div>
            <p className="text-xs text-muted-foreground">
              Po dodaniu hurtowni włącz ją i uzupełnij dane dostępowe do API (login, hasło/klucz). 
              Następnie przetestuj połączenie aby upewnić się że działa.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomDialogOpen(false)}>Anuluj</Button>
            <Button onClick={addCustomWholesaler} disabled={!customName.trim()}>Dodaj</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
