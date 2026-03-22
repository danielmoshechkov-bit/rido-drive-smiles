import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
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
  Info,
  Play,
  User,
  Link2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface CRMProvider {
  provider_code: string;
  provider_name: string;
  logo: string;
  description: string;
  help_text: string;
  help_url: string;
  xml_format: string;
  is_enabled: boolean;
  supported_import_modes: string[];
}

const CRM_PROVIDERS: CRMProvider[] = [
  {
    provider_code: 'asari', provider_name: 'ASARI CRM', logo: '🏢',
    description: 'Najpopularniejszy CRM w Polsce dla biur nieruchomości.',
    help_text: 'W ASARI: Eksport na portale → Konfiguracja → Dodaj własny FTP → wpisz dane GetRido poniżej',
    help_url: 'https://asaricrm.com/system-crm/integracje-api/', xml_format: 'EbiuroV2',
    is_enabled: true, supported_import_modes: ['xml_url', 'ftp'],
  },
  {
    provider_code: 'esticrm', provider_name: 'EstiCRM', logo: '🏠',
    description: 'System CRM z eksportem XML w formacie ZIP co godzinę.',
    help_text: 'W EstiCRM: Ustawienia → Portale → Dodaj FTP → wpisz dane GetRido poniżej',
    help_url: 'https://info.esticrm.pl/instrukcje/eksporty/', xml_format: 'EstiCRM XML',
    is_enabled: true, supported_import_modes: ['xml_url', 'ftp'],
  },
  {
    provider_code: 'imo', provider_name: 'IMO', logo: '📋',
    description: 'Program IMO z eksportem na portale.',
    help_text: 'W IMO: Administracja → Ustawienia eksportu → dodaj nowy portal z danymi FTP GetRido',
    help_url: 'https://instrukcja.imo.pl/index.php/Konfiguracja_eksport%C3%B3w', xml_format: 'EbiuroV2',
    is_enabled: true, supported_import_modes: ['xml_url', 'ftp'],
  },
  {
    provider_code: 'agencja3000', provider_name: 'Agencja3000', logo: '🔑',
    description: 'System Agencja3000 z eksportem XML.',
    help_text: 'W Agencja3000: Konfiguracja eksportów → dodaj portal → wpisz dane FTP GetRido',
    help_url: 'http://www.agencja3000.com/agencja2/eksport_specyfikacja.shtml', xml_format: 'Agencja3000',
    is_enabled: true, supported_import_modes: ['xml_url', 'ftp'],
  },
  {
    provider_code: 'galactica', provider_name: 'Galactica Gestor', logo: '🌐',
    description: 'Kompleksowe oprogramowanie biura nieruchomości.',
    help_text: 'W Galactica Gestor: Eksporty → dodaj nowy portal FTP z danymi GetRido poniżej',
    help_url: '', xml_format: 'EbiuroV2',
    is_enabled: true, supported_import_modes: ['xml_url', 'ftp'],
  },
  {
    provider_code: 'domus', provider_name: 'Domus', logo: '🏡',
    description: 'Program Domus do zarządzania nieruchomościami.',
    help_text: 'W Domus: Ustawienia portali → dodaj GetRido jako nowy portal FTP',
    help_url: '', xml_format: 'EbiuroV2',
    is_enabled: true, supported_import_modes: ['xml_url', 'ftp'],
  },
  {
    provider_code: 'realsoft', provider_name: 'RealSoft', logo: '💼',
    description: 'System RealSoft dla biur nieruchomości.',
    help_text: 'W RealSoft: Eksporty → konfiguracja portalu → wpisz dane FTP GetRido',
    help_url: '', xml_format: 'EbiuroV2',
    is_enabled: true, supported_import_modes: ['xml_url', 'ftp'],
  },
  {
    provider_code: 'custom_xml', provider_name: 'Własny system (XML/FTP)', logo: '⚙️',
    description: 'Masz inny program? Skonfiguruj eksport XML na serwer FTP GetRido.',
    help_text: 'Skonfiguruj swój program żeby wysyłał plik ZIP z XML na podany adres FTP GetRido.',
    help_url: '', xml_format: 'EbiuroV2',
    is_enabled: true, supported_import_modes: ['xml_url', 'ftp', 'api'],
  },
];

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

interface AgentMapping {
  id: string;
  crm_agent_id: string;
  crm_agent_name: string | null;
  crm_agent_email: string | null;
  crm_agent_phone: string | null;
  agent_id: string | null;
  auto_created: boolean;
}

interface AgencyAgent {
  id: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  company_name: string | null;
  owner_email: string | null;
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

interface AgencyCRMSettingsProps {
  agencyId: string;
}

export function AgencyCRMSettings({ agencyId }: AgencyCRMSettingsProps) {
  const [providers, setProviders] = useState<CRMProvider[]>([]);
  const [integration, setIntegration] = useState<CRMIntegration | null>(null);
  const [agentMappings, setAgentMappings] = useState<AgentMapping[]>([]);
  const [agencyAgents, setAgencyAgents] = useState<AgencyAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showMappings, setShowMappings] = useState(false);
  
  // Form state
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [formData, setFormData] = useState({
    is_enabled: false,
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
  });

  useEffect(() => {
    fetchData();
  }, [agencyId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Use hardcoded CRM providers
      setProviders(CRM_PROVIDERS);

      // Fetch existing integration for this agency
      const { data: integrationData } = await supabase
        .from('agency_crm_integrations')
        .select('*')
        .eq('agency_id', agencyId)
        .maybeSingle();

      if (integrationData) {
        setIntegration(integrationData);
        setSelectedProvider(integrationData.provider_code || '');
        setFormData({
          is_enabled: integrationData.is_enabled || false,
          import_mode: integrationData.import_mode || 'xml_url',
          xml_url: integrationData.xml_url || '',
          xml_login: integrationData.xml_login || '',
          xml_password: '',
          ftp_host: integrationData.ftp_host || '',
          ftp_port: integrationData.ftp_port || 21,
          ftp_login: integrationData.ftp_login || '',
          ftp_password: '',
          ftp_xml_path: integrationData.ftp_xml_path || '',
          ftp_photos_path: integrationData.ftp_photos_path || '',
          api_base_url: integrationData.api_base_url || '',
          api_key: '',
          api_login: integrationData.api_login || '',
          api_password: '',
          import_schedule: integrationData.import_schedule || '24h',
        });

        // Fetch agent mappings
        const { data: mappingsData } = await supabase
          .from('crm_agent_mappings')
          .select('*')
          .eq('integration_id', integrationData.id);
        
        setAgentMappings(mappingsData || []);
      }

      // Fetch agency's agents (employees)
      const { data: agentsData } = await supabase
        .from('real_estate_agents')
        .select('id, owner_first_name, owner_last_name, company_name, owner_email')
        .or(`id.eq.${agencyId},parent_agent_id.eq.${agencyId}`);

      setAgencyAgents(agentsData || []);

    } catch (error) {
      console.error('Error fetching CRM data:', error);
      toast.error('Nie udało się pobrać danych integracji');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedProvider) {
      toast.error('Wybierz system CRM');
      return;
    }

    setSaving(true);
    try {
      const integrationData = {
        agency_id: agencyId,
        provider_code: selectedProvider,
        is_enabled: formData.is_enabled,
        import_mode: formData.import_mode,
        xml_url: formData.xml_url || null,
        xml_login: formData.xml_login || null,
        ftp_host: formData.ftp_host || null,
        ftp_port: formData.ftp_port || 21,
        ftp_login: formData.ftp_login || null,
        ftp_xml_path: formData.ftp_xml_path || null,
        ftp_photos_path: formData.ftp_photos_path || null,
        api_base_url: formData.api_base_url || null,
        api_login: formData.api_login || null,
        import_schedule: formData.import_schedule,
      };

      if (integration?.id) {
        const { error } = await supabase
          .from('agency_crm_integrations')
          .update(integrationData)
          .eq('id', integration.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('agency_crm_integrations')
          .insert(integrationData)
          .select()
          .single();

        if (error) throw error;
        setIntegration(data);
      }

      toast.success('Konfiguracja zapisana');
    } catch (error) {
      console.error('Error saving integration:', error);
      toast.error('Nie udało się zapisać konfiguracji');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!integration?.id) {
      toast.error('Najpierw zapisz konfigurację');
      return;
    }

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('crm-import-asari', {
        body: { 
          integration_id: integration.id,
          test_connection: true 
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message || 'Połączenie nawiązane pomyślnie');
      } else {
        toast.error(data.message || 'Nie udało się nawiązać połączenia');
      }
    } catch (error) {
      console.error('Connection test error:', error);
      toast.error('Błąd testu połączenia');
    } finally {
      setTesting(false);
    }
  };

  const handleRunImport = async () => {
    if (!integration?.id) {
      toast.error('Najpierw zapisz konfigurację');
      return;
    }

    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('crm-import-asari', {
        body: { 
          integration_id: integration.id,
          mode: 'full' 
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success(`Import zakończony: ${data.stats.added_count} dodanych, ${data.stats.updated_count} zaktualizowanych`);
        fetchData(); // Refresh data
      } else {
        toast.error(data.error || 'Import nie powiódł się');
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Błąd importu');
    } finally {
      setImporting(false);
    }
  };

  const handleMappingChange = async (mappingId: string, agentId: string | null) => {
    try {
      const { error } = await supabase
        .from('crm_agent_mappings')
        .update({ agent_id: agentId })
        .eq('id', mappingId);

      if (error) throw error;

      setAgentMappings(prev => 
        prev.map(m => m.id === mappingId ? { ...m, agent_id: agentId } : m)
      );
      toast.success('Mapowanie zaktualizowane');
    } catch (error) {
      console.error('Error updating mapping:', error);
      toast.error('Nie udało się zaktualizować mapowania');
    }
  };

  const renderImportModeFields = () => {
    switch (formData.import_mode) {
      case 'xml_url':
        return (
          <div className="space-y-3">
            <div>
              <Label htmlFor="xml-url">URL do pliku XML</Label>
              <Input
                id="xml-url"
                placeholder="https://export.asari.pl/feed.xml"
                value={formData.xml_url}
                onChange={e => setFormData(prev => ({ ...prev, xml_url: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Adres URL do pliku XML eksportowanego z Twojego CRM
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="xml-login">Login (opcjonalnie)</Label>
                <Input
                  id="xml-login"
                  placeholder="login"
                  value={formData.xml_login}
                  onChange={e => setFormData(prev => ({ ...prev, xml_login: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="xml-password">Hasło (opcjonalnie)</Label>
                <Input
                  id="xml-password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.xml_password}
                  onChange={e => setFormData(prev => ({ ...prev, xml_password: e.target.value }))}
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
                <Label htmlFor="ftp-host">Host FTP</Label>
                <Input
                  id="ftp-host"
                  placeholder="ftp.example.com"
                  value={formData.ftp_host}
                  onChange={e => setFormData(prev => ({ ...prev, ftp_host: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="ftp-port">Port</Label>
                <Input
                  id="ftp-port"
                  type="number"
                  value={formData.ftp_port}
                  onChange={e => setFormData(prev => ({ ...prev, ftp_port: parseInt(e.target.value) || 21 }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ftp-login">Login</Label>
                <Input
                  id="ftp-login"
                  placeholder="login"
                  value={formData.ftp_login}
                  onChange={e => setFormData(prev => ({ ...prev, ftp_login: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="ftp-password">Hasło</Label>
                <Input
                  id="ftp-password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.ftp_password}
                  onChange={e => setFormData(prev => ({ ...prev, ftp_password: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ftp-xml-path">Ścieżka do XML</Label>
                <Input
                  id="ftp-xml-path"
                  placeholder="/feeds/offers.xml"
                  value={formData.ftp_xml_path}
                  onChange={e => setFormData(prev => ({ ...prev, ftp_xml_path: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="ftp-photos-path">Ścieżka do zdjęć</Label>
                <Input
                  id="ftp-photos-path"
                  placeholder="/photos/"
                  value={formData.ftp_photos_path}
                  onChange={e => setFormData(prev => ({ ...prev, ftp_photos_path: e.target.value }))}
                />
              </div>
            </div>
          </div>
        );

      case 'api':
        return (
          <div className="space-y-3">
            <div>
              <Label htmlFor="api-url">Base URL API</Label>
              <Input
                id="api-url"
                placeholder="https://api.example.com/v1"
                value={formData.api_base_url}
                onChange={e => setFormData(prev => ({ ...prev, api_base_url: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="api-key">API Key / Token</Label>
              <Input
                id="api-key"
                type="password"
                placeholder="••••••••"
                value={formData.api_key}
                onChange={e => setFormData(prev => ({ ...prev, api_key: e.target.value }))}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Integracja z CRM
              </CardTitle>
              <CardDescription>
                Automatyczny import ogłoszeń z zewnętrznego systemu CRM
              </CardDescription>
            </div>
            <Switch
              checked={formData.is_enabled}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_enabled: checked }))}
            />
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* CRM Provider Selection */}
          <div>
            <Label>System CRM</Label>
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz system CRM" />
              </SelectTrigger>
              <SelectContent>
                {providers.map(provider => (
                  <SelectItem key={provider.provider_code} value={provider.provider_code}>
                    <span className="flex items-center gap-2">
                      <span>{provider.logo}</span>
                      <span>{provider.provider_name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* CRM instruction card */}
          {selectedProvider && (() => {
            const prov = CRM_PROVIDERS.find(p => p.provider_code === selectedProvider);
            if (!prov) return null;
            return (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">
                  {prov.logo} {prov.provider_name} — jak skonfigurować eksport
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-400 mb-2">{prov.help_text}</p>
                <div className="p-2 rounded bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">📡 Dane do wpisania w swoim programie CRM:</p>
                  <div className="grid grid-cols-2 gap-0.5 text-xs text-amber-700 dark:text-amber-400">
                    <span className="font-semibold">Serwer FTP:</span><span>ftp.getrido.pl</span>
                    <span className="font-semibold">Login:</span><span>agent_{agencyId?.slice(0, 8)}</span>
                    <span className="font-semibold">Hasło:</span><span className="italic">(z pola poniżej)</span>
                    <span className="font-semibold">Katalog XML:</span><span>/import/xml/</span>
                    <span className="font-semibold">Format:</span><span>{prov.xml_format}</span>
                    <span className="font-semibold">Port FTP:</span><span>21</span>
                  </div>
                </div>
                {prov.help_url && (
                  <a href={prov.help_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 underline mt-1 inline-block dark:text-blue-400">
                    → Dokumentacja {prov.provider_name}
                  </a>
                )}
              </div>
            );
          })()}

          {selectedProvider && (
            <>
              {/* Import Mode */}
              <div>
                <Label>Tryb importu</Label>
                <Select
                  value={formData.import_mode}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, import_mode: value }))}
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

              {/* Dynamic Fields */}
              {renderImportModeFields()}

              {/* Schedule */}
              <div>
                <Label>Harmonogram importu</Label>
                <Select
                  value={formData.import_schedule}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, import_schedule: value }))}
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

              <Separator />

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Zapisywanie...
                    </>
                  ) : (
                    'Zapisz konfigurację'
                  )}
                </Button>
                
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testing || !integration?.id}
                >
                  {testing ? (
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

                <Button
                  variant="secondary"
                  onClick={handleRunImport}
                  disabled={importing || !integration?.id}
                >
                  {importing ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Importowanie...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Uruchom import
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Import Statistics */}
      {integration && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Statystyki importu</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Ostatni import
                </div>
                <div className="font-medium">
                  {integration.last_import_at 
                    ? format(new Date(integration.last_import_at), 'dd MMM yyyy, HH:mm', { locale: pl })
                    : 'Brak'
                  }
                </div>
                {integration.last_import_status && (
                  <Badge variant={integration.last_import_status === 'success' ? 'default' : 'destructive'}>
                    {integration.last_import_status === 'success' ? (
                      <><CheckCircle2 className="h-3 w-3 mr-1" /> Sukces</>
                    ) : integration.last_import_status === 'partial' ? (
                      <><AlertTriangle className="h-3 w-3 mr-1" /> Częściowy</>
                    ) : (
                      <><XCircle className="h-3 w-3 mr-1" /> Błąd</>
                    )}
                  </Badge>
                )}
              </div>

              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Ofert w feedzie</div>
                <div className="text-2xl font-bold">{integration.total_offers_in_feed || 0}</div>
              </div>

              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Dodanych</div>
                <div className="text-2xl font-bold text-primary">{integration.added_count || 0}</div>
              </div>

              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Zaktualizowanych</div>
                <div className="text-2xl font-bold text-accent-foreground">{integration.updated_count || 0}</div>
              </div>
            </div>

            {integration.last_import_message && (
              <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
                {integration.last_import_message}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Agent Mappings */}
      {integration && agentMappings.length > 0 && (
        <Card>
          <Collapsible open={showMappings} onOpenChange={setShowMappings}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Mapowanie pracowników ({agentMappings.length})
                  </CardTitle>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showMappings ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Przypisz pracowników z CRM do agentów w systemie. Ogłoszenia będą automatycznie przypisywane do właściwych osób.
                  </p>
                  
                  {agentMappings.map(mapping => (
                    <div key={mapping.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{mapping.crm_agent_name || 'Nieznany agent'}</div>
                        <div className="text-sm text-muted-foreground">
                          {mapping.crm_agent_email || mapping.crm_agent_phone || mapping.crm_agent_id}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">→</span>
                        <Select
                          value={mapping.agent_id || 'unassigned'}
                          onValueChange={(value) => handleMappingChange(mapping.id, value === 'unassigned' ? null : value)}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Wybierz agenta" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">
                              <span className="text-muted-foreground">Nieprzypisany</span>
                            </SelectItem>
                            {agencyAgents.map(agent => (
                              <SelectItem key={agent.id} value={agent.id}>
                                {agent.owner_first_name && agent.owner_last_name 
                                  ? `${agent.owner_first_name} ${agent.owner_last_name}` 
                                  : agent.company_name || agent.owner_email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {mapping.agent_id && (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* Info Banner */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">Jak działa import z CRM?</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Oferty są identyfikowane po unikalnym numerze z CRM</li>
                <li>Istniejące oferty są aktualizowane, nowe dodawane automatycznie</li>
                <li>Oferty usunięte z feeda CRM są automatycznie dezaktywowane</li>
                <li>Każda oferta otrzymuje oznaczenie źródła (np. "Źródło: ASARI")</li>
                <li>Import uruchamia się automatycznie według ustawionego harmonogramu</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
