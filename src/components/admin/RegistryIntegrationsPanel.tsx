import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, XCircle, Building2, FileCheck, Receipt, RefreshCw, Key, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Integration {
  id: string;
  service_name: string;
  is_enabled: boolean;
  environment: 'demo' | 'production';
  api_key_encrypted: string | null;
  api_url: string | null;
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_message: string | null;
  config: Record<string, unknown>;
}

interface ServiceInfo {
  label: string;
  icon: React.ElementType;
  description: string;
  docsUrl?: string;
}

const SERVICE_INFO: Record<string, ServiceInfo> = {
  gus_regon: {
    label: 'GUS REGON',
    icon: Building2,
    description: 'Pobieranie danych firm z rejestru REGON (nazwa, adres, NIP, REGON)',
    docsUrl: 'https://api.stat.gov.pl/Home/RegonApi'
  },
  mf_whitelist: {
    label: 'Biała Lista VAT',
    icon: FileCheck,
    description: 'Weryfikacja statusu VAT i kont bankowych kontrahentów',
    docsUrl: 'https://www.podatki.gov.pl/wykaz-podatnikow-vat-wyszukiwarka'
  },
  ksef: {
    label: 'KSeF (e-Faktury)',
    icon: Receipt,
    description: 'Wysyłanie i odbieranie faktur przez Krajowy System e-Faktur',
    docsUrl: 'https://www.podatki.gov.pl/ksef/'
  }
};

export function RegistryIntegrationsPanel() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingService, setTestingService] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from('external_integrations')
        .select('*')
        .order('service_name');

      if (error) throw error;
      setIntegrations((data || []) as Integration[]);
      
      // Initialize masked API keys
      const keys: Record<string, string> = {};
      data?.forEach(int => {
        if (int.api_key_encrypted) {
          keys[int.service_name] = '••••••••••••';
        }
      });
      setApiKeys(keys);
    } catch (error) {
      console.error('Error loading integrations:', error);
      toast({
        title: 'Błąd',
        description: 'Nie udało się załadować integracji',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const updateIntegration = async (serviceName: string, updates: Partial<Omit<Integration, 'config'>>) => {
    try {
      const { error } = await supabase
        .from('external_integrations')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        } as Record<string, unknown>)
        .eq('service_name', serviceName);

      if (error) throw error;

      setIntegrations(prev => 
        prev.map(int => 
          int.service_name === serviceName ? { ...int, ...updates } : int
        )
      );

      toast({
        title: 'Zapisano',
        description: 'Ustawienia zostały zaktualizowane'
      });
    } catch (error) {
      console.error('Error updating integration:', error);
      toast({
        title: 'Błąd',
        description: 'Nie udało się zapisać ustawień',
        variant: 'destructive'
      });
    }
  };

  const saveApiKey = async (serviceName: string) => {
    const key = apiKeys[serviceName];
    if (!key || key.includes('•')) return;

    await updateIntegration(serviceName, { api_key_encrypted: key });
    setApiKeys(prev => ({ ...prev, [serviceName]: '••••••••••••' }));
  };

  const testIntegration = async (serviceName: string) => {
    setTestingService(serviceName);
    
    try {
      let result: { success: boolean; message?: string; error?: string };
      
      if (serviceName === 'gus_regon') {
        const { data, error } = await supabase.functions.invoke('registry-gus', {
          body: { nip: '5252344078' } // Test NIP (GUS)
        });
        result = error ? { success: false, error: error.message } : data;
      } else if (serviceName === 'mf_whitelist') {
        const { data, error } = await supabase.functions.invoke('registry-whitelist', {
          body: { nip: '5252344078' }
        });
        result = error ? { success: false, error: error.message } : data;
      } else if (serviceName === 'ksef') {
        const { data, error } = await supabase.functions.invoke('ksef-integration', {
          body: { action: 'status' }
        });
        result = error ? { success: false, error: error.message } : { success: true, message: 'Połączenie demo OK' };
      } else {
        result = { success: false, error: 'Nieznana usługa' };
      }

      // Update test status
      await supabase
        .from('external_integrations')
        .update({
          last_test_at: new Date().toISOString(),
          last_test_status: result.success ? 'success' : 'error',
          last_test_message: result.success ? (result.message || 'OK') : (result.error || 'Błąd')
        })
        .eq('service_name', serviceName);

      // Reload
      loadIntegrations();

      toast({
        title: result.success ? 'Test OK' : 'Test nieudany',
        description: result.success ? 'Połączenie działa poprawnie' : result.error,
        variant: result.success ? 'default' : 'destructive'
      });
    } catch (error) {
      console.error('Test error:', error);
      toast({
        title: 'Błąd testu',
        description: 'Nie udało się przetestować połączenia',
        variant: 'destructive'
      });
    } finally {
      setTestingService(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {integrations.map(integration => {
        const info: ServiceInfo = SERVICE_INFO[integration.service_name] || {
          label: integration.service_name,
          icon: Building2,
          description: '',
          docsUrl: undefined
        };
        const Icon = info.icon;
        const isTesting = testingService === integration.service_name;

        return (
          <Card key={integration.id} className={integration.is_enabled ? 'border-primary/30' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${integration.is_enabled ? 'bg-primary/10 text-primary' : 'bg-muted'}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {info.label}
                      {integration.last_test_status === 'success' && (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                      {integration.last_test_status === 'error' && (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </CardTitle>
                    <CardDescription>{info.description}</CardDescription>
                  </div>
                </div>
                <Switch
                  checked={integration.is_enabled}
                  onCheckedChange={(checked) => updateIntegration(integration.service_name, { is_enabled: checked })}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                {/* Environment */}
                <div className="space-y-2">
                  <Label>Środowisko</Label>
                  <Select
                    value={integration.environment}
                    onValueChange={(value: 'demo' | 'production') => 
                      updateIntegration(integration.service_name, { environment: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="demo">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">Demo</Badge>
                          Testowe
                        </div>
                      </SelectItem>
                      <SelectItem value="production">
                        <div className="flex items-center gap-2">
                          <Badge variant="default">Produkcja</Badge>
                          Produkcyjne
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* API Key */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Klucz API
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={apiKeys[integration.service_name] || ''}
                      onChange={(e) => setApiKeys(prev => ({ ...prev, [integration.service_name]: e.target.value }))}
                      placeholder={integration.service_name === 'mf_whitelist' ? 'Publiczne API (brak klucza)' : 'Wklej klucz API...'}
                      disabled={integration.service_name === 'mf_whitelist'}
                    />
                    {integration.service_name !== 'mf_whitelist' && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => saveApiKey(integration.service_name)}
                        disabled={!apiKeys[integration.service_name] || apiKeys[integration.service_name].includes('•')}
                      >
                        Zapisz
                      </Button>
                    )}
                  </div>
                </div>

                {/* Test Button */}
                <div className="space-y-2">
                  <Label>Test połączenia</Label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => testIntegration(integration.service_name)}
                      disabled={isTesting || !integration.is_enabled}
                      className="flex-1"
                    >
                      {isTesting ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Testuj
                    </Button>
                    {info.docsUrl && (
                      <Button variant="ghost" size="icon" asChild>
                        <a href={info.docsUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Last test info */}
              {integration.last_test_at && (
                <div className="text-xs text-muted-foreground flex items-center gap-2 pt-2 border-t">
                  <span>Ostatni test:</span>
                  <span>{new Date(integration.last_test_at).toLocaleString('pl-PL')}</span>
                  <span>•</span>
                  <Badge variant={integration.last_test_status === 'success' ? 'default' : 'destructive'} className="text-xs">
                    {integration.last_test_status === 'success' ? 'OK' : 'Błąd'}
                  </Badge>
                  {integration.last_test_message && (
                    <span className="truncate max-w-xs">{integration.last_test_message}</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Info about integrations */}
      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <FileCheck className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">Informacje o integracjach:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Biała Lista VAT</strong> - publiczne API Ministerstwa Finansów, nie wymaga klucza</li>
                <li>
                  <strong>GUS REGON</strong> - wymaga klucza z{' '}
                  <a href="https://api.stat.gov.pl/Home/RegonApi" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    api.stat.gov.pl
                  </a>{' '}
                  (bezpłatny dla środowiska testowego)
                </li>
                <li><strong>KSeF</strong> - wymaga certyfikatu lub tokenu z podatki.gov.pl</li>
              </ul>
              <div className="mt-3 p-3 bg-background rounded border">
                <p className="font-medium text-foreground mb-2">📋 Jak uzyskać klucz GUS REGON:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Wejdź na <a href="https://api.stat.gov.pl/Home/RegonApi" target="_blank" rel="noopener noreferrer" className="text-primary underline">api.stat.gov.pl</a></li>
                  <li>Zarejestruj się i zaloguj</li>
                  <li>Przejdź do sekcji "Klucze użytkownika"</li>
                  <li>Wygeneruj klucz dla środowiska testowego (demo) lub produkcyjnego</li>
                  <li>Skopiuj klucz i wklej w polu "Klucz API" powyżej</li>
                  <li>Wybierz odpowiednie środowisko (Demo/Produkcja)</li>
                  <li>Włącz integrację przełącznikiem</li>
                </ol>
                <p className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
                  ⚠️ Klucz testowy: <code className="bg-muted px-1 rounded">abcde12345abcde12345</code> (tylko do testów)
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
