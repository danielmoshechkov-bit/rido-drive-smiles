import { useState } from 'react';
import { Search, Plus, FileText, Upload, Download, Users, Car, Send, Eye, CheckCircle, Trash2, RotateCcw, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { parseRegistryField, getSalutation, getZwanymA } from '@/utils/contractHelpers';

interface DocumentsManagementProps {
  cityId: string;
  cityName: string;
  fleetId?: string | null;
}

const BUILT_IN_TEMPLATES = [
  {
    id: 'builtin-umowa-najmu',
    name: 'Umowa najmu pojazdu',
    code: 'RENTAL_CONTRACT',
    version: '1.0',
    enabled: true,
    created_at: '2026-01-01T00:00:00Z',
    description: 'Umowa najmu pojazdu',
    required_fields: ['driver_data', 'vehicle_data', 'fleet_data', 'contract_date'],
    builtin: true,
  },
];

interface DriverOption {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
}

export const DocumentsManagement = ({ cityId, cityName, fleetId }: DocumentsManagementProps) => {
  const [activeTab, setActiveTab] = useState('templates');
  const [searchTerm, setSearchTerm] = useState('');
  const [sendDialog, setSendDialog] = useState<{ templateCode: string; templateName: string } | null>(null);
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);
  const [sendToAll, setSendToAll] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const [completedSearch, setCompletedSearch] = useState('');
  const [completedFilter, setCompletedFilter] = useState<'all' | 'signed' | 'pending' | 'unsigned'>('all');
  const [sentSearch, setSentSearch] = useState('');
  const [previewContract, setPreviewContract] = useState<any>(null);
  const [contractDate, setContractDate] = useState(new Date().toISOString().split('T')[0]);
  const [contractNumber, setContractNumber] = useState('');
  const queryClient = useQueryClient();

  const { data: resolvedFleetId } = useQuery({
    queryKey: ['resolved-fleet-id', fleetId],
    queryFn: async () => {
      if (fleetId) return fleetId;
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return null;
      const { data: fleetData } = await (supabase as any)
        .from('fleets')
        .select('id')
        .eq('owner_id', session.session.user.id)
        .maybeSingle();
      return fleetData?.id || null;
    },
  });

  const { data: fleetData } = useQuery({
    queryKey: ['fleet-data-docs', resolvedFleetId],
    queryFn: async () => {
      if (!resolvedFleetId) return null;
      const { data } = await supabase.from('fleets').select('name, nip, address, city, postal_code, krs, owner_name, logo_url').eq('id', resolvedFleetId).single();
      return data;
    },
    enabled: !!resolvedFleetId,
  });

  const { data: fleetSignature } = useQuery({
    queryKey: ['fleet-signature-docs', resolvedFleetId],
    queryFn: async () => {
      if (!resolvedFleetId) return null;
      const { data } = await (supabase as any).from('fleet_signatures').select('signature_url, stamp_url').eq('fleet_id', resolvedFleetId).eq('is_active', true).maybeSingle();
      return data;
    },
    enabled: !!resolvedFleetId,
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['fleet-drivers-docs', resolvedFleetId],
    queryFn: async () => {
      if (!resolvedFleetId) return [] as DriverOption[];
      const { data } = await supabase.from('drivers').select('id, first_name, last_name').eq('fleet_id', resolvedFleetId).order('last_name');
      return (data || []) as DriverOption[];
    },
    enabled: !!resolvedFleetId,
  });

  const { data: existingRequests = [] } = useQuery({
    queryKey: ['doc-requests-status', resolvedFleetId],
    queryFn: async () => {
      if (!resolvedFleetId) return [];
      const { data } = await supabase.from('driver_document_requests' as any).select('*').eq('fleet_id', resolvedFleetId);
      return (data || []) as any[];
    },
    enabled: !!resolvedFleetId,
  });

  const { data: sentRequests = [], refetch: refetchRequests } = useQuery({
    queryKey: ['document-requests', resolvedFleetId],
    queryFn: async () => {
      if (!resolvedFleetId) return [];
      const { data } = await supabase.from('driver_document_requests' as any).select('*').eq('fleet_id', resolvedFleetId).order('created_at', { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!resolvedFleetId,
  });

  const allTemplates = [...BUILT_IN_TEMPLATES];

  const filteredTemplates = allTemplates.filter(template =>
    template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDrivers = drivers.filter(d =>
    `${d.first_name} ${d.last_name}`.toLowerCase().includes(driverSearch.toLowerCase())
  );

  // Filter for "Wysłane" tab
  const filteredSent = sentRequests.filter((req: any) => {
    const driver = drivers.find(d => d.id === req.driver_id);
    const name = driver ? `${driver.first_name} ${driver.last_name}` : '';
    return name.toLowerCase().includes(sentSearch.toLowerCase()) || req.template_name?.toLowerCase().includes(sentSearch.toLowerCase());
  });

  // Filter for "Podpisane dokumenty" tab
  const getFilteredCompleted = () => {
    return drivers.filter(driver => {
      const nameMatch = `${driver.first_name} ${driver.last_name}`.toLowerCase().includes(completedSearch.toLowerCase());
      if (!nameMatch) return false;
      const docReq = existingRequests.find((r: any) => r.driver_id === driver.id && r.template_code === 'RENTAL_CONTRACT');
      const isSigned = docReq?.status === 'signed' || docReq?.status === 'completed';
      const isPending = docReq?.status === 'pending';
      if (completedFilter === 'signed') return isSigned;
      if (completedFilter === 'pending') return isPending;
      if (completedFilter === 'unsigned') return !docReq;
      return true;
    });
  };

  const handleSendToDrivers = async () => {
    if (!sendDialog) return;
    const targetDrivers = sendToAll ? drivers.map(d => d.id) : selectedDriverIds;
    if (targetDrivers.length === 0) { toast.error('Wybierz co najmniej jednego kierowcę'); return; }

    // Filter out drivers that already have a request for this template (prevent duplicates)
    const existingDriverIds = existingRequests
      .filter((r: any) => r.template_code === sendDialog.templateCode)
      .map((r: any) => r.driver_id);
    const newDrivers = targetDrivers.filter(id => !existingDriverIds.includes(id));
    
    if (newDrivers.length === 0) {
      toast.info('Wszyscy wybrani kierowcy już otrzymali ten dokument');
      setSendDialog(null);
      return;
    }

    try {
      // Auto-generate contract numbers if not provided
      const existingNumbers = existingRequests
        .filter((r: any) => r.contract_number)
        .map((r: any) => {
          const match = r.contract_number?.match(/^(\d+)\//);
          return match ? parseInt(match[1]) : 0;
        });
      let nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 10001;
      const year = new Date().getFullYear();

      const requests = newDrivers.map((driverId, idx) => {
        const num = contractNumber || `${String(nextNumber + idx).padStart(7, '0')}/${year}`;
        return {
          driver_id: driverId,
          template_code: sendDialog.templateCode,
          template_name: sendDialog.templateName,
          status: 'pending',
          fleet_id: resolvedFleetId || cityId,
          contract_number: num,
          contract_date: contractDate,
        };
      });
      const { error } = await supabase.from('driver_document_requests' as any).insert(requests);
      if (error) throw error;
      const skipped = targetDrivers.length - newDrivers.length;
      toast.success(`Wysłano ${newDrivers.length} zaproszeń${skipped > 0 ? ` (${skipped} pominięto - już wysłane)` : ''}`);
      setSendDialog(null);
      setSelectedDriverIds([]);
      setSendToAll(false);
      refetchRequests();
      queryClient.invalidateQueries({ queryKey: ['doc-requests-status'] });
    } catch (error: any) {
      toast.info('Funkcja wysyłania dokumentów zostanie uruchomiona po utworzeniu tabeli w bazie danych');
      setSendDialog(null);
    }
  };

  const handleResend = async (req: any) => {
    try {
      await supabase.from('driver_document_requests' as any).update({ status: 'pending', signed_at: null, signature_url: null, filled_data: null, updated_at: new Date().toISOString() } as any).eq('id', req.id);
      toast.success('Dokument wysłany ponownie');
      refetchRequests();
      queryClient.invalidateQueries({ queryKey: ['doc-requests-status'] });
    } catch { toast.error('Błąd'); }
  };

  const handleDeleteRequest = async (reqId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten dokument?')) return;
    try {
      await supabase.from('driver_document_requests' as any).delete().eq('id', reqId);
      toast.success('Dokument usunięty');
      refetchRequests();
      queryClient.invalidateQueries({ queryKey: ['doc-requests-status'] });
    } catch { toast.error('Błąd usuwania'); }
  };

  const generateContractHtml = (contract: any) => {
    const fd = contract.filled_data || {};
    const contractDateStr = contract.contract_date ? format(new Date(contract.contract_date), 'dd.MM.yyyy') : (contract.signed_at ? format(new Date(contract.signed_at), 'dd.MM.yyyy') : '—');
    const fName = (fleetData as any)?.name || '';
    const fAddress = (fleetData as any)?.address ? `${(fleetData as any).address}${(fleetData as any).postal_code ? ', ' + (fleetData as any).postal_code : ''} ${(fleetData as any).city || ''}` : '';
    const fNip = (fleetData as any)?.nip || '';
    const fKrs = (fleetData as any)?.krs || '';
    const fOwner = (fleetData as any)?.owner_name || '';
    const logoUrl = (fleetData as any)?.logo_url || null;
    const sigUrl = fleetSignature?.signature_url || null;
    const stampUrl = fleetSignature?.stamp_url || null;

    const registry = parseRegistryField(fKrs);
    const salutation = getSalutation(fd.pesel);
    const zwanymA = getZwanymA(fd.pesel);
    const regAddr = fd.registered_address || '—';
    const resAddr = fd.residential_address || fd.registered_address || '—';
    const showResAddr = resAddr !== regAddr;

    return `
<div style="font-family: 'Times New Roman', Georgia, serif; max-width: 700px; margin: 0 auto; padding: 30px; font-size: 13px; line-height: 1.8; color: #1a1a1a;">
  ${logoUrl ? `<div style="text-align: center; margin-bottom: 20px;"><img src="${logoUrl}" alt="Logo" style="max-height: 60px; max-width: 200px; object-fit: contain;" /></div>` : ''}
  <h1 style="text-align: center; font-size: 18px; font-weight: bold; letter-spacing: 2px;">UMOWA NAJMU POJAZDU</h1>
  <p style="text-align: center; font-size: 14px; font-weight: bold; margin-bottom: 25px;">Nr ${contract.contract_number || '—'}</p>
  <p style="text-align: center; margin-bottom: 30px;">zawarta w dniu <strong>${contractDateStr}</strong> pomiędzy:</p>
  <div style="margin-bottom: 20px; padding: 15px; border-left: 3px solid #333;">
    <p style="margin: 0;"><strong>${fName}</strong></p>
    <p style="margin: 2px 0;">z siedzibą: ${fAddress}</p>
    <p style="margin: 2px 0;">NIP: ${fNip}</p>
    <p style="margin: 2px 0;">${registry.label}: ${registry.value}</p>
    <p style="margin: 2px 0;">reprezentowaną przez: ${fOwner}</p>
    <p style="margin: 5px 0 0; font-style: italic;">zwaną dalej „Najemcą"</p>
  </div>
  <p style="text-align: center; margin: 15px 0;">a</p>
  <div style="margin-bottom: 25px; padding: 15px; border-left: 3px solid #333;">
    <p style="margin: 0;">${salutation}: <strong>${fd.full_name || '—'}</strong></p>
    <p style="margin: 2px 0;">PESEL: ${fd.pesel || '—'}</p>
    <p style="margin: 2px 0;">adres zameldowania: ${regAddr}</p>
    ${showResAddr ? `<p style="margin: 2px 0;">adres zamieszkania: ${resAddr}</p>` : ''}
    <p style="margin: 5px 0 0; font-style: italic;">${zwanymA} dalej „Wynajmującym"</p>
  </div>
  <hr style="border: none; border-top: 1px solid #ccc; margin: 25px 0;" />
  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§1 Przedmiot umowy</h2>
  <p>Wynajmujący oddaje Najemcy do używania pojazd:</p>
  <table style="width: 100%; border-collapse: collapse; margin: 10px 0; border: 1px solid #ddd;">
    <tr style="background: #f5f5f5;"><td style="padding: 6px 12px; border: 1px solid #ddd; width: 180px;"><strong>Marka:</strong></td><td style="padding: 6px 12px; border: 1px solid #ddd;">${fd.car_brand || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; border: 1px solid #ddd;"><strong>Model:</strong></td><td style="padding: 6px 12px; border: 1px solid #ddd;">${fd.car_model || '—'}</td></tr>
    <tr style="background: #f5f5f5;"><td style="padding: 6px 12px; border: 1px solid #ddd;"><strong>Numer VIN:</strong></td><td style="padding: 6px 12px; border: 1px solid #ddd;">${fd.car_vin || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; border: 1px solid #ddd;"><strong>Nr rejestracyjny:</strong></td><td style="padding: 6px 12px; border: 1px solid #ddd;">${fd.car_registration || '—'}</td></tr>
  </table>
  <p>Wynajmujący oświadcza, że:</p>
  <p style="margin-left: 20px;">a) jest właścicielem pojazdu lub posiada tytuł prawny do jego wynajmu,</p>
  <p style="margin-left: 20px;">b) pojazd jest sprawny technicznie i dopuszczony do ruchu,</p>
  <p style="margin-left: 20px;">c) pojazd posiada wymagane badania techniczne oraz ubezpieczenie OC,</p>
  <p style="margin-left: 20px;">d) pojazd spełnia wymogi przewidziane przepisami prawa dla świadczenia usług przewozowych (jeżeli dotyczy).</p>
  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§2 Cel najmu</h2>
  <p>Pojazd zostaje oddany w najem w celu umożliwienia Najemcy korzystania z niego przy realizacji usług przewozu osób lub rzeczy za pośrednictwem aplikacji transportowych.</p>
  <p>Umowa niniejsza ma charakter cywilnoprawny i nie stanowi umowy o pracę ani nie tworzy stosunku podporządkowania pomiędzy Stronami.</p>
  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§3 Okres trwania umowy</h2>
  <p>1. Umowa zostaje zawarta na czas nieokreślony.</p>
  <p>2. Każda ze Stron może wypowiedzieć umowę z zachowaniem 7-dniowego okresu wypowiedzenia.</p>
  <p>3. W przypadku rażącego naruszenia postanowień umowy każda ze Stron może rozwiązać umowę ze skutkiem natychmiastowym.</p>
  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§4 Czynsz najmu</h2>
  <p>1. Strony ustalają, że czynsz najmu będzie ustalany miesięcznie.</p>
  <p>2. Wysokość czynszu może być uzależniona od poziomu eksploatacji pojazdu.</p>
  <p>3. Czynsz może być wypłacany w formie zaliczek w okresach tygodniowych.</p>
  <p>4. Ostateczne rozliczenie czynszu za dany miesiąc następuje do 10 dnia miesiąca następującego po miesiącu rozliczeniowym.</p>
  <p>5. Czynsz będzie płatny ${fd.payment_method === 'transfer' ? 'przelewem na rachunek bankowy Wynajmującego nr: <strong>' + (fd.bank_account || '') + '</strong>' : 'gotówką'}.</p>
  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§5 Obowiązki Wynajmującego</h2>
  <p>1. Utrzymywanie pojazdu w należytym stanie technicznym.</p>
  <p>2. Zapewnienie aktualnych badań technicznych i ubezpieczenia OC.</p>
  <p>3. Niezwłoczne informowanie Najemcy o wszelkich zdarzeniach mających wpływ na możliwość korzystania z pojazdu.</p>
  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§6 Odpowiedzialność podatkowa</h2>
  <p>1. Strony zgodnie potwierdzają, że czynsz najmu stanowi przychód Wynajmującego.</p>
  <p>2. Wynajmujący zobowiązuje się do samodzielnego rozliczania podatku dochodowego.</p>
  <p>3. Najemca nie pełni funkcji płatnika podatku dochodowego od czynszu najmu.</p>
  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§7 Postanowienia końcowe</h2>
  <p>1. W sprawach nieuregulowanych niniejszą umową zastosowanie mają przepisy Kodeksu cywilnego.</p>
  <p>2. Wszelkie zmiany niniejszej umowy wymagają formy pisemnej pod rygorem nieważności.</p>
  <p>3. Spory wynikłe z niniejszej umowy będą rozstrzygane przez sąd właściwy dla siedziby Najemcy.</p>
  <p>4. Umowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze Stron.</p>
  <div style="display: flex; justify-content: space-between; margin-top: 60px; padding-top: 20px; border-top: 1px solid #eee;">
    <div style="text-align: center; width: 45%;">
      <p style="margin-bottom: 10px; font-weight: bold;">Wynajmujący</p>
      <p style="color: #888; font-size: 11px; margin-bottom: 15px;">(kierowca / właściciel pojazdu)</p>
      <div style="min-height: 60px; display: flex; align-items: center; justify-content: center;">
        ${contract.signature_url ? `<img src="${contract.signature_url}" alt="Podpis" style="max-height: 50px;" />` : '<p style="color: #aaa;">……………………………………</p>'}
      </div>
    </div>
    <div style="text-align: center; width: 10%;">
      ${stampUrl ? `<div style="display: flex; align-items: center; justify-content: center; height: 100%;"><img src="${stampUrl}" alt="Pieczątka" style="max-height: 50px;" /></div>` : ''}
    </div>
    <div style="text-align: center; width: 45%;">
      <p style="margin-bottom: 10px; font-weight: bold;">Najemca</p>
      <p style="color: #888; font-size: 11px; margin-bottom: 15px;">${fName}</p>
      <div style="min-height: 60px; display: flex; align-items: center; justify-content: center;">
        ${sigUrl ? `<img src="${sigUrl}" alt="Podpis" style="max-height: 50px;" />` : '<p style="color: #aaa;">……………………………………</p>'}
      </div>
    </div>
  </div>
</div>`;
  };

  const toggleDriverSelection = (driverId: string) => {
    setSelectedDriverIds(prev =>
      prev.includes(driverId) ? prev.filter(id => id !== driverId) : [...prev, driverId]
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Dokumenty - {cityName}
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="bg-transparent w-full justify-center gap-1.5 h-auto p-0 flex-wrap">
              {[
                { value: 'templates', label: 'Szablony' },
                { value: 'sent', label: 'Wysłane' },
                { value: 'completed', label: 'Podpisane' },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=inactive]:text-foreground/70 data-[state=inactive]:bg-transparent data-[state=inactive]:hover:bg-[#F5C842] data-[state=inactive]:hover:text-[#1a1a1a]"
                  style={activeTab === tab.value ? { backgroundColor: 'var(--nav-bar-color, #6C3CF0)' } : undefined}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Templates Tab */}
            <TabsContent value="templates" className="space-y-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input placeholder="Szukaj szablonów..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <div className="space-y-3">
                {filteredTemplates.map((template) => (
                  <div key={template.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold">{template.name}</h3>
                          <Badge variant="default">Aktywny</Badge>
                          <Badge variant="outline" className="text-xs">v{template.version}</Badge>
                          {template.builtin && <Badge variant="secondary" className="text-xs">Wbudowany</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Kod: {template.code}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="default" size="sm" className="gap-1" onClick={() => { setContractDate(new Date().toISOString().split('T')[0]); setContractNumber(''); setSendDialog({ templateCode: template.code, templateName: template.name }); }}>
                          <Send className="h-4 w-4" /> Wyślij do kierowcy
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Sent Tab */}
            <TabsContent value="sent" className="space-y-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input placeholder="Szukaj po nazwisku lub dokumencie..." value={sentSearch} onChange={(e) => setSentSearch(e.target.value)} className="pl-10" />
              </div>
              {filteredSent.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Brak wysłanych dokumentów</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSent.map((req: any) => {
                    const driver = drivers.find(d => d.id === req.driver_id);
                    const isSigned = req.status === 'signed' || req.status === 'completed';
                    return (
                      <div key={req.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-sm">{req.template_name}</h3>
                              <Badge variant={isSigned ? 'default' : req.status === 'in_progress' ? 'secondary' : 'outline'}>
                                {isSigned ? 'Podpisany' : req.status === 'in_progress' ? 'W trakcie' : 'Oczekujący'}
                              </Badge>
                              {req.contract_number && <Badge variant="outline" className="text-xs">Nr {req.contract_number}</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              Kierowca: {driver ? `${driver.first_name} ${driver.last_name}` : req.driver_id}
                            </p>
                            {req.created_at && (
                              <p className="text-xs text-muted-foreground">
                                Wysłano: {format(new Date(req.created_at), 'dd.MM.yyyy HH:mm', { locale: pl })}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {isSigned && (
                              <Button variant="outline" size="sm" className="gap-1" onClick={() => setPreviewContract(req)}>
                                <Eye className="h-4 w-4" /> Podgląd
                              </Button>
                            )}
                            {!isSigned && (
                              <Button variant="outline" size="sm" className="gap-1" onClick={() => handleResend(req)}>
                                <RotateCcw className="h-4 w-4" /> Wyślij ponownie
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteRequest(req.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Completed Documents Tab */}
            <TabsContent value="completed" className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input placeholder="Szukaj kierowcy..." value={completedSearch} onChange={(e) => setCompletedSearch(e.target.value)} className="pl-10" />
                </div>
                <Select value={completedFilter} onValueChange={(v: any) => setCompletedFilter(v)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszyscy</SelectItem>
                    <SelectItem value="signed">Podpisane</SelectItem>
                    <SelectItem value="pending">Oczekujące</SelectItem>
                    <SelectItem value="unsigned">Nie podpisane</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {getFilteredCompleted().length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Brak wyników</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_140px_120px_100px_80px] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
                    <span>Kierowca</span>
                    <span>Nr umowy</span>
                    <span>Dokument</span>
                    <span className="text-center">Status</span>
                    <span className="text-center">Akcje</span>
                  </div>
                  {getFilteredCompleted().map(driver => {
                    const docReq = existingRequests.find((r: any) => r.driver_id === driver.id && r.template_code === 'RENTAL_CONTRACT');
                    const isSigned = docReq?.status === 'signed' || docReq?.status === 'completed';
                    const isPending = docReq?.status === 'pending';

                    return (
                      <div key={driver.id} className="grid grid-cols-[1fr_140px_120px_100px_80px] gap-2 items-center px-4 py-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <span className="font-medium text-sm">{driver.first_name} {driver.last_name}</span>
                        <span className="text-xs text-muted-foreground">{docReq?.contract_number || '—'}</span>
                        <span className="text-xs">Umowa najmu</span>
                        <div className="flex justify-center">
                          {isSigned ? (
                            <Badge className="bg-green-600 text-white text-[10px] gap-1"><CheckCircle className="h-3 w-3" /> Podpisana</Badge>
                          ) : isPending ? (
                            <Badge variant="outline" className="text-orange-600 border-orange-300 text-[10px]">Oczekuje</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">Nie podpisana</Badge>
                          )}
                        </div>
                        <div className="flex justify-center">
                          {isSigned && docReq && (
                            <Button variant="ghost" size="sm" onClick={() => setPreviewContract(docReq)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Contract Preview Dialog */}
      <Dialog open={!!previewContract} onOpenChange={() => setPreviewContract(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {previewContract?.template_name || 'Umowa najmu pojazdu'}
              {previewContract?.contract_number && <Badge variant="outline" className="ml-2">Nr {previewContract.contract_number}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {previewContract && (
            <div className="border rounded-lg p-4 bg-white dark:bg-muted/30 text-sm" dangerouslySetInnerHTML={{ __html: generateContractHtml(previewContract) }} />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPreviewContract(null)}>Zamknij</Button>
            <Button onClick={() => {
              const w = window.open('', '_blank');
              if (w && previewContract) {
                w.document.write(`<html><head><title>Umowa ${previewContract.contract_number || ''}</title></head><body>${generateContractHtml(previewContract)}</body></html>`);
                w.document.close();
                w.print();
              }
            }} className="gap-1"><Download className="h-4 w-4" /> Drukuj / Pobierz PDF</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send to Drivers Dialog */}
      <Dialog open={!!sendDialog} onOpenChange={(open) => !open && setSendDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Wyślij "{sendDialog?.templateName}" do kierowców</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Kierowca po zalogowaniu zobaczy powiadomienie o konieczności wypełnienia dokumentu. Duplikaty nie będą wysyłane.
            </p>
            
            {/* Contract date & number */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Data zawarcia umowy</Label>
                <Input type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nr umowy (opcjonalnie)</Label>
                <Input placeholder="Auto" value={contractNumber} onChange={e => setContractNumber(e.target.value)} />
                <p className="text-[10px] text-muted-foreground">Puste = auto numeracja (np. 1/2026)</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="send-to-all" checked={sendToAll} onCheckedChange={(checked) => { setSendToAll(checked as boolean); if (checked) setSelectedDriverIds(drivers.map(d => d.id)); else setSelectedDriverIds([]); }} />
              <Label htmlFor="send-to-all" className="font-medium">Wyślij do wszystkich ({drivers.length})</Label>
            </div>
            {!sendToAll && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input placeholder="Szukaj kierowcy..." value={driverSearch} onChange={(e) => setDriverSearch(e.target.value)} className="pl-10" />
                </div>
                <div className="max-h-[250px] overflow-y-auto space-y-1 border rounded-lg p-2">
                  {filteredDrivers.map(driver => {
                    const driverDocStatus = sendDialog ? existingRequests.find((r: any) => r.driver_id === driver.id && r.template_code === sendDialog.templateCode) : null;
                    const isSigned = driverDocStatus?.status === 'signed' || driverDocStatus?.status === 'completed';
                    const isPending = driverDocStatus?.status === 'pending';
                    return (
                      <label key={driver.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer">
                        <Checkbox checked={selectedDriverIds.includes(driver.id)} onCheckedChange={() => toggleDriverSelection(driver.id)} disabled={isSigned || isPending} />
                        <span className="text-sm flex-1">{driver.first_name} {driver.last_name}</span>
                        {isSigned && <Badge variant="default" className="text-[10px] gap-1 bg-green-600">✓ Podpisana</Badge>}
                        {isPending && <Badge variant="outline" className="text-[10px] gap-1 text-orange-600 border-orange-300">Oczekuje</Badge>}
                        {!driverDocStatus && <Badge variant="secondary" className="text-[10px]">Brak</Badge>}
                      </label>
                    );
                  })}
                  {filteredDrivers.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">Brak kierowców</p>}
                </div>
              </>
            )}
            {(sendToAll || selectedDriverIds.length > 0) && (
              <p className="text-xs text-muted-foreground">Wybrano: {sendToAll ? drivers.length : selectedDriverIds.length} kierowców</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialog(null)}>Anuluj</Button>
            <Button onClick={handleSendToDrivers} className="gap-1"><Send className="h-4 w-4" /> Wyślij ({sendToAll ? drivers.length : selectedDriverIds.length})</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
