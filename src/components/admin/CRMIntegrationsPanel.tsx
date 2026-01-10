import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Database, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ChevronDown,
  Globe,
  Server,
  Key,
  AlertTriangle,
  Info
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CRMProvider {
  id: string;
  provider_code: string;
  provider_name: string;
  is_enabled: boolean;
  supported_import_modes: string[];
}

interface CRMIntegration {
  id: string;
  agency_id: string;
  provider_code: string;
  is_enabled: boolean;
  import_mode: string;
  xml_url?: string;
  xml_login?: string;
  ftp_host?: string;
  ftp_port?: number;
  ftp_login?: string;
  ftp_xml_path?: string;
  ftp_photos_path?: string;
  api_base_url?: string;
  api_login?: string;
  import_schedule: string;
  last_import_at?: string;
  last_import_status?: string;
  last_import_message?: string;
  total_offers_in_feed: number;
  added_count: number;
  updated_count: number;
  deactivated_count: number;
  error_count: number;
}

interface ImportLog {
  id: string;
  log_type: string;
  message: string;
  created_at: string;
}

const IMPORT_MODES = [
  { value: 'xml_url', label: 'URL XML', icon: Globe },
  { value: 'ftp', label: 'FTP', icon: Server },
  { value: 'api', label: 'API', icon: Key },
];

const SCHEDULE_OPTIONS = [
  { value: '1h', label: 'Co 1 godzinę' },
  { value: '3h', label: 'Co 3 godziny' },
  { value: '6h', label: 'Co 6 godzin' },
  { value: '12h', label: 'Co 12 godzin' },
  { value: '24h', label: 'Co 24 godziny' },
];

const CRM_ICONS: Record<string, string> = {
  esticrm: '📊',
  asari: '🏢',
  galactica: '🌌',
  imo: '🏠',
  custom: '⚙️',
};

export function CRMIntegrationsPanel() {
  const [providers, setProviders] = useState<CRMProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  
  // Local state for form values per provider
  const [formState, setFormState] = useState<Record<string, {
    is_enabled: boolean;
    import_mode: string;
    xml_url: string;
    xml_login: string;
    xml_password: string;
    ftp_host: string;
    ftp_port: number;
    ftp_login: string;
    ftp_password: string;
    ftp_xml_path: string;
    ftp_photos_path: string;
    api_base_url: string;
    api_key: string;
    api_login: string;
    api_password: string;
    import_schedule: string;
  }>>({});

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      const { data, error } = await supabase
        .from('crm_integration_providers')
        .select('*')
        .order('provider_name');
      
      if (error) throw error;
      
      setProviders(data || []);
      
      // Initialize form state for each provider
      const initialState: typeof formState = {};
      (data || []).forEach((p: CRMProvider) => {
        initialState[p.provider_code] = {
          is_enabled: p.is_enabled,
          import_mode: 'xml_url',
          xml_url: '',
          xml_login: '',
          xml_password: '',
          ftp_host: '',
          ftp_port: 21,
          ftp_login: '',
          ftp_password: '',
          ftp_xml_path: '',
          ftp_photos_path: '',
          api_base_url: '',
          api_key: '',
          api_login: '',
          api_password: '',
          import_schedule: '24h',
        };
      });
      setFormState(initialState);
    } catch (error) {
      console.error('Error fetching CRM providers:', error);
      toast.error('Nie udało się pobrać listy dostawców CRM');
    } finally {
      setLoading(false);
    }
  };

  const updateFormField = (providerCode: string, field: string, value: any) => {
    setFormState(prev => ({
      ...prev,
      [providerCode]: {
        ...prev[providerCode],
        [field]: value,
      }
    }));
  };

  const handleToggleProvider = async (providerCode: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('crm_integration_providers')
        .update({ is_enabled: enabled })
        .eq('provider_code', providerCode);

      if (error) throw error;

      setProviders(prev => 
        prev.map(p => p.provider_code === providerCode ? { ...p, is_enabled: enabled } : p)
      );
      updateFormField(providerCode, 'is_enabled', enabled);
      
      toast.success(`Integracja ${enabled ? 'włączona' : 'wyłączona'}`);
    } catch (error) {
      console.error('Error toggling provider:', error);
      toast.error('Nie udało się zmienić statusu integracji');
    }
  };

  const handleTestConnection = async (providerCode: string) => {
    setTestingProvider(providerCode);
    const state = formState[providerCode];
    
    // Simulate connection test (replace with actual edge function call)
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mock test result
    const success = Math.random() > 0.3;
    setTestResults(prev => ({
      ...prev,
      [providerCode]: {
        success,
        message: success 
          ? 'Połączenie nawiązane pomyślnie' 
          : 'Błąd: Nie można nawiązać połączenia. Sprawdź dane dostępowe.'
      }
    }));
    
    setTestingProvider(null);
    toast[success ? 'success' : 'error'](
      success ? 'Test połączenia zakończony sukcesem' : 'Test połączenia nie powiódł się'
    );
  };

  const renderImportModeFields = (providerCode: string) => {
    const state = formState[providerCode];
    if (!state) return null;

    switch (state.import_mode) {
      case 'xml_url':
        return (
          <div className="space-y-3">
            <div>
              <Label htmlFor={`${providerCode}-xml-url`}>URL do pliku XML</Label>
              <Input
                id={`${providerCode}-xml-url`}
                placeholder="https://example.com/feed.xml"
                value={state.xml_url}
                onChange={e => updateFormField(providerCode, 'xml_url', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor={`${providerCode}-xml-login`}>Login (opcjonalnie)</Label>
                <Input
                  id={`${providerCode}-xml-login`}
                  placeholder="login"
                  value={state.xml_login}
                  onChange={e => updateFormField(providerCode, 'xml_login', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor={`${providerCode}-xml-password`}>Hasło / Token (opcjonalnie)</Label>
                <Input
                  id={`${providerCode}-xml-password`}
                  type="password"
                  placeholder="••••••••"
                  value={state.xml_password}
                  onChange={e => updateFormField(providerCode, 'xml_password', e.target.value)}
                />
              </div>
            </div>
          </div>
        );

      case 'ftp':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label htmlFor={`${providerCode}-ftp-host`}>Host FTP</Label>
                <Input
                  id={`${providerCode}-ftp-host`}
                  placeholder="ftp.example.com"
                  value={state.ftp_host}
                  onChange={e => updateFormField(providerCode, 'ftp_host', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor={`${providerCode}-ftp-port`}>Port</Label>
                <Input
                  id={`${providerCode}-ftp-port`}
                  type="number"
                  value={state.ftp_port}
                  onChange={e => updateFormField(providerCode, 'ftp_port', parseInt(e.target.value) || 21)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor={`${providerCode}-ftp-login`}>Login</Label>
                <Input
                  id={`${providerCode}-ftp-login`}
                  placeholder="login"
                  value={state.ftp_login}
                  onChange={e => updateFormField(providerCode, 'ftp_login', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor={`${providerCode}-ftp-password`}>Hasło</Label>
                <Input
                  id={`${providerCode}-ftp-password`}
                  type="password"
                  placeholder="••••••••"
                  value={state.ftp_password}
                  onChange={e => updateFormField(providerCode, 'ftp_password', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor={`${providerCode}-ftp-xml-path`}>Ścieżka do XML</Label>
                <Input
                  id={`${providerCode}-ftp-xml-path`}
                  placeholder="/feeds/offers.xml"
                  value={state.ftp_xml_path}
                  onChange={e => updateFormField(providerCode, 'ftp_xml_path', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor={`${providerCode}-ftp-photos-path`}>Ścieżka do zdjęć (opcjonalnie)</Label>
                <Input
                  id={`${providerCode}-ftp-photos-path`}
                  placeholder="/photos/"
                  value={state.ftp_photos_path}
                  onChange={e => updateFormField(providerCode, 'ftp_photos_path', e.target.value)}
                />
              </div>
            </div>
          </div>
        );

      case 'api':
        return (
          <div className="space-y-3">
            <div>
              <Label htmlFor={`${providerCode}-api-url`}>Base URL API</Label>
              <Input
                id={`${providerCode}-api-url`}
                placeholder="https://api.example.com/v1"
                value={state.api_base_url}
                onChange={e => updateFormField(providerCode, 'api_base_url', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={`${providerCode}-api-key`}>API Key / Token</Label>
              <Input
                id={`${providerCode}-api-key`}
                type="password"
                placeholder="••••••••"
                value={state.api_key}
                onChange={e => updateFormField(providerCode, 'api_key', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor={`${providerCode}-api-login`}>Login (opcjonalnie)</Label>
                <Input
                  id={`${providerCode}-api-login`}
                  placeholder="login"
                  value={state.api_login}
                  onChange={e => updateFormField(providerCode, 'api_login', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor={`${providerCode}-api-password`}>Hasło (opcjonalnie)</Label>
                <Input
                  id={`${providerCode}-api-password`}
                  type="password"
                  placeholder="••••••••"
                  value={state.api_password}
                  onChange={e => updateFormField(providerCode, 'api_password', e.target.value)}
                />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const renderCRMCard = (provider: CRMProvider) => {
    const state = formState[provider.provider_code];
    const testResult = testResults[provider.provider_code];
    const isLogsExpanded = expandedLogs[provider.provider_code];
    
    if (!state) return null;

    return (
      <Card key={provider.id} className="relative">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{CRM_ICONS[provider.provider_code] || '📊'}</span>
              <div>
                <CardTitle className="text-lg">{provider.provider_name}</CardTitle>
                <CardDescription className="text-xs">
                  Import ofert z systemu {provider.provider_name}
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={provider.is_enabled}
              onCheckedChange={(checked) => handleToggleProvider(provider.provider_code, checked)}
            />
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Import Mode Selection */}
          <div>
            <Label>Tryb importu</Label>
            <Select
              value={state.import_mode}
              onValueChange={(value) => updateFormField(provider.provider_code, 'import_mode', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMPORT_MODES.map(mode => (
                  <SelectItem key={mode.value} value={mode.value}>
                    <div className="flex items-center gap-2">
                      <mode.icon className="h-4 w-4" />
                      {mode.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dynamic Fields Based on Import Mode */}
          {renderImportModeFields(provider.provider_code)}

          {/* Schedule */}
          <div>
            <Label>Harmonogram importu</Label>
            <Select
              value={state.import_schedule}
              onValueChange={(value) => updateFormField(provider.provider_code, 'import_schedule', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Test Connection Button */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleTestConnection(provider.provider_code)}
            disabled={testingProvider === provider.provider_code}
          >
            {testingProvider === provider.provider_code ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Testowanie...
              </>
            ) : (
              <>
                <Database className="h-4 w-4 mr-2" />
                Testuj połączenie
              </>
            )}
          </Button>

          {/* Test Result */}
          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
              testResult.success 
                ? 'bg-green-500/10 text-green-700 dark:text-green-400' 
                : 'bg-destructive/10 text-destructive'
            }`}>
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Separator */}
          <div className="border-t pt-4">
            <div className="text-sm text-muted-foreground mb-2">Statystyki importu</div>
            
            {/* Mock Stats - will be replaced with real data */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Ostatni import:</span>
              </div>
              <span className="text-muted-foreground">Brak</span>
              
              <div>Ofert w feedzie:</div>
              <Badge variant="secondary">0</Badge>
              
              <div>Dodanych:</div>
              <Badge variant="outline" className="bg-green-500/10 text-green-700">0</Badge>
              
              <div>Zaktualizowanych:</div>
              <Badge variant="outline" className="bg-blue-500/10 text-blue-700">0</Badge>
              
              <div>Dezaktywowanych:</div>
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700">0</Badge>
              
              <div>Błędów:</div>
              <Badge variant="outline" className="bg-destructive/10 text-destructive">0</Badge>
            </div>
          </div>

          {/* Error Logs Collapsible */}
          <Collapsible
            open={isLogsExpanded}
            onOpenChange={(open) => setExpandedLogs(prev => ({ ...prev, [provider.provider_code]: open }))}
          >
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Log błędów
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${isLogsExpanded ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  <span>Brak błędów do wyświetlenia</span>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Integracje z systemami CRM</h3>
          <p className="text-sm text-muted-foreground">
            Konfiguracja automatycznego importu ogłoszeń z zewnętrznych systemów CRM agencji nieruchomości
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {providers.map(provider => renderCRMCard(provider))}
      </div>

      {/* Info Banner */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">Jak działa import?</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Oferty są identyfikowane po unikalnym <code className="bg-muted px-1 rounded">external_id</code> z CRM</li>
                <li>Istniejące oferty są aktualizowane, nowe dodawane</li>
                <li>Oferty usunięte z feeda są automatycznie dezaktywowane</li>
                <li>Każda oferta otrzymuje oznaczenie źródła (np. "Źródło: EstiCRM")</li>
                <li>Agencje mogą również konfigurować własne integracje w swoim panelu</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
