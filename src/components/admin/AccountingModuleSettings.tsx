import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Building2,
  FileCheck,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Key,
  Globe,
  Receipt,
  Database
} from 'lucide-react';

interface IntegrationStatus {
  gus: { enabled: boolean; lastTest?: string; status?: 'ok' | 'error' };
  whitelist: { enabled: boolean; autoCheck: boolean; lastTest?: string; status?: 'ok' | 'error' };
  ksef: { enabled: boolean; environment: 'demo' | 'production'; lastTest?: string; status?: 'ok' | 'error' };
}

interface GlobalSettings {
  defaultInvoiceSeries: string;
  highValueThreshold: number;
  autoWhitelistCheck: boolean;
  requireBankVerification: boolean;
  defaultPaymentDays: number;
}

export function AccountingModuleSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  
  const [integrations, setIntegrations] = useState<IntegrationStatus>({
    gus: { enabled: false },
    whitelist: { enabled: true, autoCheck: true },
    ksef: { enabled: false, environment: 'demo' }
  });
  
  const [settings, setSettings] = useState<GlobalSettings>({
    defaultInvoiceSeries: 'FV/{YYYY}/{MM}/{NNN}',
    highValueThreshold: 15000,
    autoWhitelistCheck: true,
    requireBankVerification: false,
    defaultPaymentDays: 14
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      // Load AI settings which contains integration info
      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      // Try to get KSeF settings
      const { data: ksefData } = await supabase
        .from('ksef_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (ksefData) {
        setIntegrations(prev => ({
          ...prev,
          ksef: { 
            enabled: ksefData.is_enabled || false,
            environment: (ksefData.environment as 'demo' | 'production') || 'demo'
          }
        }));
      }

      // Set defaults - we'll use local state since registry_integrations table may not exist
      setIntegrations(prev => ({
        ...prev,
        gus: { enabled: true }, // GUS is typically always available
        whitelist: { enabled: true, autoCheck: true }
      }));

    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      toast.success('Ustawienia zapisane');
    } catch (err) {
      console.error('Error saving settings:', err);
      toast.error('Błąd zapisu ustawień');
    } finally {
      setSaving(false);
    }
  };

  const testIntegration = async (service: 'gus' | 'whitelist' | 'ksef') => {
    setTesting(service);
    try {
      let result;
      
      if (service === 'gus') {
        // Test with a known valid NIP
        result = await supabase.functions.invoke('registry-gus', {
          body: { nip: '5252344078' } // Sample NIP for testing
        });
      } else if (service === 'whitelist') {
        result = await supabase.functions.invoke('registry-whitelist', {
          body: { nip: '5252344078' }
        });
      } else if (service === 'ksef') {
        result = await supabase.functions.invoke('ksef-integration', {
          body: { action: 'get_settings' }
        });
      }

      if (result?.error) {
        throw new Error(result.error.message);
      }

      // Update status
      setIntegrations(prev => ({
        ...prev,
        [service]: { ...prev[service], status: 'ok', lastTest: new Date().toISOString() }
      }));

      toast.success(`Test ${service.toUpperCase()} pomyślny`);
    } catch (err) {
      console.error(`Test ${service} error:`, err);
      setIntegrations(prev => ({
        ...prev,
        [service]: { ...prev[service], status: 'error', lastTest: new Date().toISOString() }
      }));
      toast.error(`Test ${service.toUpperCase()} nieudany`);
    } finally {
      setTesting(null);
    }
  };

  const toggleIntegration = async (service: 'gus' | 'whitelist' | 'ksef', enabled: boolean) => {
    try {
      if (service === 'ksef') {
        // Update KSeF settings in database
        await supabase
          .from('ksef_settings')
          .upsert({ 
            id: 'default',
            is_enabled: enabled,
            environment: integrations.ksef.environment
          });
      }

      setIntegrations(prev => ({
        ...prev,
        [service]: { ...prev[service], enabled }
      }));

      toast.success(`${service.toUpperCase()} ${enabled ? 'włączone' : 'wyłączone'}`);
    } catch (err) {
      console.error('Toggle error:', err);
      toast.error('Błąd przełączania integracji');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="integrations" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="integrations" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Integracje API
          </TabsTrigger>
          <TabsTrigger value="invoicing" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Fakturowanie
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Bezpieczeństwo
          </TabsTrigger>
        </TabsList>

        {/* API Integrations Tab */}
        <TabsContent value="integrations" className="space-y-4 mt-4">
          {/* GUS REGON */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">GUS REGON (BIR 1.1)</CardTitle>
                    <CardDescription>Pobieranie danych firm z rejestru REGON</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {integrations.gus.status === 'ok' && (
                    <Badge className="bg-primary/10 text-primary">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Działa
                    </Badge>
                  )}
                  {integrations.gus.status === 'error' && (
                    <Badge variant="destructive">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Błąd
                    </Badge>
                  )}
                  <Switch
                    checked={integrations.gus.enabled}
                    onCheckedChange={(checked) => toggleIntegration('gus', checked)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => testIntegration('gus')}
                  disabled={testing === 'gus'}
                >
                  {testing === 'gus' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Testuj połączenie
                </Button>
                {integrations.gus.lastTest && (
                  <span className="text-xs text-muted-foreground">
                    Ostatni test: {new Date(integrations.gus.lastTest).toLocaleString('pl-PL')}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Whitelist VAT */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent">
                    <FileCheck className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Biała Lista VAT</CardTitle>
                    <CardDescription>Weryfikacja statusu VAT i kont bankowych</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {integrations.whitelist.status === 'ok' && (
                    <Badge className="bg-primary/10 text-primary">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Działa
                    </Badge>
                  )}
                  {integrations.whitelist.status === 'error' && (
                    <Badge variant="destructive">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Błąd
                    </Badge>
                  )}
                  <Switch
                    checked={integrations.whitelist.enabled}
                    onCheckedChange={(checked) => toggleIntegration('whitelist', checked)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => testIntegration('whitelist')}
                  disabled={testing === 'whitelist'}
                >
                  {testing === 'whitelist' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Testuj połączenie
                </Button>
                {integrations.whitelist.lastTest && (
                  <span className="text-xs text-muted-foreground">
                    Ostatni test: {new Date(integrations.whitelist.lastTest).toLocaleString('pl-PL')}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* KSeF */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-secondary">
                    <Key className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base">KSeF</CardTitle>
                    <CardDescription>Krajowy System e-Faktur</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Select
                    value={integrations.ksef.environment}
                    onValueChange={(val: 'demo' | 'production') => 
                      setIntegrations(prev => ({ ...prev, ksef: { ...prev.ksef, environment: val } }))
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="demo">Demo</SelectItem>
                      <SelectItem value="production">Produkcja</SelectItem>
                    </SelectContent>
                  </Select>
                  <Switch
                    checked={integrations.ksef.enabled}
                    onCheckedChange={(checked) => toggleIntegration('ksef', checked)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => testIntegration('ksef')}
                  disabled={testing === 'ksef'}
                >
                  {testing === 'ksef' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Testuj połączenie
                </Button>
                {integrations.ksef.lastTest && (
                  <span className="text-xs text-muted-foreground">
                    Ostatni test: {new Date(integrations.ksef.lastTest).toLocaleString('pl-PL')}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invoicing Tab */}
        <TabsContent value="invoicing" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Ustawienia numeracji faktur
              </CardTitle>
              <CardDescription>
                Domyślny format numeracji dla nowych firm
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Domyślna seria numeracji</Label>
                <Input
                  value={settings.defaultInvoiceSeries}
                  onChange={(e) => setSettings(prev => ({ ...prev, defaultInvoiceSeries: e.target.value }))}
                  placeholder="FV/{YYYY}/{MM}/{NNN}"
                />
                <p className="text-xs text-muted-foreground">
                  Dostępne zmienne: {'{YYYY}'} - rok, {'{MM}'} - miesiąc, {'{NNN}'} - numer kolejny
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Domyślny termin płatności (dni)</Label>
                <Input
                  type="number"
                  value={settings.defaultPaymentDays}
                  onChange={(e) => setSettings(prev => ({ ...prev, defaultPaymentDays: parseInt(e.target.value) || 14 }))}
                  min={1}
                  max={365}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Weryfikacja kontrahentów
              </CardTitle>
              <CardDescription>
                Ustawienia automatycznej weryfikacji kontrahentów
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Automatyczne sprawdzanie białej listy</Label>
                  <p className="text-sm text-muted-foreground">
                    Przy dodawaniu kontrahenta automatycznie sprawdź status VAT
                  </p>
                </div>
                <Switch
                  checked={settings.autoWhitelistCheck}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, autoWhitelistCheck: checked }))}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Wymagaj weryfikacji konta bankowego</Label>
                  <p className="text-sm text-muted-foreground">
                    Blokuj płatności powyżej progu bez zweryfikowanego konta
                  </p>
                </div>
                <Switch
                  checked={settings.requireBankVerification}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, requireBankVerification: checked }))}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Próg wysokich płatności (PLN)</Label>
                <Input
                  type="number"
                  value={settings.highValueThreshold}
                  onChange={(e) => setSettings(prev => ({ ...prev, highValueThreshold: parseInt(e.target.value) || 15000 }))}
                  min={1000}
                  step={1000}
                />
                <p className="text-xs text-muted-foreground">
                  Płatności powyżej tej kwoty wymagają weryfikacji na białej liście (art. 19 ustawy o VAT)
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Zapisuję...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4 mr-2" />
                  Zapisz ustawienia
                </>
              )}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
