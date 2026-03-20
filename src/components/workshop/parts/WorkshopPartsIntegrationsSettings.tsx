import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { usePartsIntegrations, useUpsertPartsIntegration, usePartsApi } from '@/hooks/useWorkshopParts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  providerId: string;
}

interface IntegrationForm {
  supplier_code: string;
  api_username: string;
  api_password: string;
  default_branch_id: string;
  sales_margin_percent: number;
  is_enabled: boolean;
  environment: string;
}

const SUPPLIERS = [
  { code: 'hart', name: 'Hart', description: 'hartphp.com.pl' },
  { code: 'auto_partner', name: 'Auto Partner', description: 'apcat.eu — wkrótce' },
];

export function WorkshopPartsIntegrationsSettings({ providerId }: Props) {
  const { data: integrations = [], isLoading } = usePartsIntegrations(providerId);
  const upsertIntegration = useUpsertPartsIntegration();
  const partsApi = usePartsApi();

  const [forms, setForms] = useState<Record<string, IntegrationForm>>({});
  const [testingSupplier, setTestingSupplier] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'ok' | 'error'>>({});

  useEffect(() => {
    const newForms: Record<string, IntegrationForm> = {};
    for (const s of SUPPLIERS) {
      const existing = integrations.find((i: any) => i.supplier_code === s.code);
      newForms[s.code] = {
        supplier_code: s.code,
        api_username: existing?.api_username || '',
        api_password: existing?.api_password || '',
        default_branch_id: existing?.default_branch_id || '',
        sales_margin_percent: existing?.sales_margin_percent ?? 30,
        is_enabled: existing?.is_enabled ?? false,
        environment: existing?.environment || 'sandbox',
      };
      if (existing?.last_connection_status) {
        setTestResults(prev => ({ ...prev, [s.code]: existing.last_connection_status }));
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
      ...form,
    });
  };

  const testConnection = async (code: string) => {
    setTestingSupplier(code);
    try {
      // First save
      await saveIntegration(code);
      // Then test
      await partsApi.mutateAsync({
        action: 'test_connection',
        provider_id: providerId,
        supplier_code: code,
      });
      setTestResults(prev => ({ ...prev, [code]: 'ok' }));
    } catch {
      setTestResults(prev => ({ ...prev, [code]: 'error' }));
    } finally {
      setTestingSupplier(null);
    }
  };

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Ładowanie...</div>;

  return (
    <div className="space-y-6">
      {SUPPLIERS.map(supplier => {
        const form = forms[supplier.code];
        if (!form) return null;
        const isDisabled = supplier.code === 'auto_partner';

        return (
          <Card key={supplier.code} className={isDisabled ? 'opacity-60' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
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
                    {isDisabled && <Badge variant="outline" className="text-[10px]">Wkrótce</Badge>}
                  </CardTitle>
                  <CardDescription>{supplier.description}</CardDescription>
                </div>
                <Switch
                  checked={form.is_enabled}
                  onCheckedChange={v => updateForm(supplier.code, { is_enabled: v })}
                  disabled={isDisabled}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Username API</Label>
                  <Input
                    value={form.api_username}
                    onChange={e => updateForm(supplier.code, { api_username: e.target.value })}
                    placeholder="Wpisz login API"
                    disabled={isDisabled}
                  />
                </div>
                <div>
                  <Label className="text-xs">Password API</Label>
                  <Input
                    type="password"
                    value={form.api_password}
                    onChange={e => updateForm(supplier.code, { api_password: e.target.value })}
                    placeholder="Wpisz hasło API"
                    disabled={isDisabled}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Środowisko</Label>
                  <Select value={form.environment} onValueChange={v => updateForm(supplier.code, { environment: v })} disabled={isDisabled}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">Sandbox (testowe)</SelectItem>
                      <SelectItem value="production">Produkcja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Domyślny magazyn</Label>
                  <Input
                    value={form.default_branch_id}
                    onChange={e => updateForm(supplier.code, { default_branch_id: e.target.value })}
                    placeholder="ID magazynu"
                    disabled={isDisabled}
                  />
                </div>
                <div>
                  <Label className="text-xs">Marża sprzedaży (%)</Label>
                  <Input
                    type="number"
                    value={form.sales_margin_percent}
                    onChange={e => updateForm(supplier.code, { sales_margin_percent: Number(e.target.value) })}
                    disabled={isDisabled}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testConnection(supplier.code)}
                  disabled={isDisabled || testingSupplier === supplier.code || !form.api_username}
                >
                  {testingSupplier === supplier.code ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : null}
                  Testuj połączenie
                </Button>
                <Button
                  size="sm"
                  onClick={() => saveIntegration(supplier.code)}
                  disabled={isDisabled}
                >
                  Zapisz
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
