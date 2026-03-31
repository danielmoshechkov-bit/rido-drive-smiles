import { useState } from 'react';
import { Search, Plus, FileText, Download, Send, Eye, CheckCircle, Trash2, RotateCcw, Edit, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { CreateTemplateModal } from '@/components/fleet-documents/CreateTemplateModal';
import { TemplatePreviewModal } from '@/components/fleet-documents/TemplatePreviewModal';
import { FillAndSendPanel } from '@/components/fleet-documents/FillAndSendPanel';
import { UploadContractModal } from '@/components/fleet-documents/UploadContractModal';

interface DocumentsManagementProps {
  cityId: string;
  cityName: string;
  fleetId?: string | null;
}

// Built-in rental contract template content
const RENTAL_CONTRACT_CONTENT = `UMOWA NAJMU POJAZDU
Nr {{NR_UMOWY}}

zawarta w dniu {{DATA_UMOWY}} pomiędzy:

{{NAZWA_FIRMY}}
z siedzibą: {{ADRES_FIRMY}}
NIP: {{NIP_FIRMY}}
reprezentowaną przez: {{REPREZENTANT}}
zwaną dalej „Najemcą"

a

{{IMIE_NAZWISKO_KIEROWCY}}
PESEL: {{PESEL}}
adres zameldowania: {{ADRES_ZAMELDOWANIA}}
zwanym dalej „Wynajmującym"

§1 Przedmiot umowy
Wynajmujący oddaje Najemcy do używania pojazd:
Marka: {{MARKA_POJAZDU}}
Model: {{MODEL_POJAZDU}}
Numer VIN: {{NR_VIN}}
Nr rejestracyjny: {{NR_REJESTRACYJNY}}

§2 Cel najmu
Pojazd zostaje oddany w najem w celu umożliwienia Najemcy korzystania z niego przy realizacji usług przewozu osób lub rzeczy za pośrednictwem aplikacji transportowych.

§3 Okres trwania umowy
1. Umowa zostaje zawarta na czas nieokreślony.
2. Każda ze Stron może wypowiedzieć umowę z zachowaniem 7-dniowego okresu wypowiedzenia.
3. W przypadku rażącego naruszenia postanowień umowy każda ze Stron może rozwiązać umowę ze skutkiem natychmiastowym.

§4 Czynsz najmu
1. Strony ustalają czynsz najmu w wysokości {{KWOTA_WYNAJMU}} zł tygodniowo.
2. Czynsz będzie płatny w okresach tygodniowych.

§5 Obowiązki Wynajmującego
1. Utrzymywanie pojazdu w należytym stanie technicznym.
2. Zapewnienie aktualnych badań technicznych i ubezpieczenia OC.

§6 Postanowienia końcowe
1. W sprawach nieuregulowanych niniejszą umową zastosowanie mają przepisy Kodeksu cywilnego.
2. Wszelkie zmiany niniejszej umowy wymagają formy pisemnej pod rygorem nieważności.
3. Umowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze Stron.

______________________________          ______________________________
Wynajmujący                             Najemca`;

const BUILT_IN_TEMPLATES = [
  {
    id: 'builtin-umowa-najmu',
    name: 'Umowa najmu pojazdu',
    code: 'RENTAL_CONTRACT',
    version: '1.0',
    enabled: true,
    content: RENTAL_CONTRACT_CONTENT,
    created_at: '2026-01-01T00:00:00Z',
    builtin: true,
    status: 'active',
  },
];

interface DriverOption {
  id: string;
  first_name: string;
  last_name: string;
}

export const DocumentsManagement = ({ cityId, cityName, fleetId }: DocumentsManagementProps) => {
  const [activeTab, setActiveTab] = useState('templates');
  const [searchTerm, setSearchTerm] = useState('');
  const [sendDialog, setSendDialog] = useState<{ templateCode: string; templateName: string } | null>(null);
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);
  const [sendToAll, setSendToAll] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const [sentSearch, setSentSearch] = useState('');
  const [previewContract, setPreviewContract] = useState<any>(null);
  const [contractDate, setContractDate] = useState(new Date().toISOString().split('T')[0]);
  const [contractNumber, setContractNumber] = useState('');
  const queryClient = useQueryClient();

  // New modal states
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<any>(null);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  const [fillTemplate, setFillTemplate] = useState<any>(null);
  const [showUploadContract, setShowUploadContract] = useState(false);

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

  // Load custom templates from DB
  const { data: customTemplates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ['fleet-custom-templates', resolvedFleetId],
    queryFn: async () => {
      if (!resolvedFleetId) return [];
      const { data } = await (supabase as any)
        .from('fleet_document_templates')
        .select('*')
        .eq('fleet_id', resolvedFleetId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!resolvedFleetId,
  });

  // Load document instances for sent/signed tabs
  const { data: documentInstances = [], refetch: refetchInstances } = useQuery({
    queryKey: ['fleet-document-instances', resolvedFleetId],
    queryFn: async () => {
      if (!resolvedFleetId) return [];
      const { data } = await (supabase as any)
        .from('fleet_document_instances')
        .select('*')
        .eq('fleet_id', resolvedFleetId)
        .order('created_at', { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!resolvedFleetId,
  });

  const allTemplates = [...BUILT_IN_TEMPLATES, ...customTemplates.map((t: any) => ({
    ...t,
    builtin: false,
    enabled: t.status === 'active',
  }))];

  const filteredTemplates = allTemplates.filter(template =>
    template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDrivers = drivers.filter(d =>
    `${d.first_name} ${d.last_name}`.toLowerCase().includes(driverSearch.toLowerCase())
  );

  // Combine sent requests + document instances for sent tab
  const allSentDocs = [
    ...sentRequests.map((r: any) => ({ ...r, source: 'request' })),
    ...documentInstances
      .filter((d: any) => d.status === 'sent' || d.status === 'draft')
      .map((d: any) => ({
        id: d.id,
        template_name: d.template_name,
        driver_id: d.driver_id,
        status: d.status === 'sent' ? 'pending' : d.status,
        created_at: d.created_at,
        sent_at: d.sent_at,
        source: 'instance',
        contract_number: d.filled_data?.NR_UMOWY || '',
      })),
  ].filter((doc, idx, arr) => {
    // Deduplicate by driver_id + template_name
    return arr.findIndex(d => d.driver_id === doc.driver_id && d.template_name === doc.template_name && d.source === doc.source) === idx;
  });

  const filteredSent = allSentDocs.filter((req: any) => {
    const driver = drivers.find(d => d.id === req.driver_id);
    const name = driver ? `${driver.first_name} ${driver.last_name}` : '';
    return name.toLowerCase().includes(sentSearch.toLowerCase()) || req.template_name?.toLowerCase().includes(sentSearch.toLowerCase());
  });

  // Signed documents
  const signedDocs = [
    ...sentRequests.filter((r: any) => r.status === 'signed' || r.status === 'completed').map((r: any) => ({ ...r, source: 'request' })),
    ...documentInstances.filter((d: any) => d.status === 'signed').map((d: any) => ({
      id: d.id,
      template_name: d.template_name,
      driver_id: d.driver_id,
      status: 'signed',
      signed_at: d.signed_at,
      created_at: d.created_at,
      source: 'instance',
      filled_content: d.filled_content,
    })),
  ];

  const handleSendToDrivers = async () => {
    if (!sendDialog) return;
    const targetDrivers = sendToAll ? drivers.map(d => d.id) : selectedDriverIds;
    if (targetDrivers.length === 0) { toast.error('Wybierz co najmniej jednego kierowcę'); return; }

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
    } catch {
      toast.info('Funkcja wysyłania dokumentów zostanie uruchomiona po utworzeniu tabeli w bazie danych');
      setSendDialog(null);
    }
  };

  const handleResend = async (req: any) => {
    try {
      if (req.source === 'instance') {
        await (supabase as any).from('fleet_document_instances').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', req.id);
      } else {
        await supabase.from('driver_document_requests' as any).update({ status: 'pending', signed_at: null, signature_url: null, filled_data: null, updated_at: new Date().toISOString() } as any).eq('id', req.id);
      }
      toast.success('Dokument wysłany ponownie');
      refetchRequests();
      refetchInstances();
    } catch { toast.error('Błąd'); }
  };

  const handleDeleteRequest = async (reqId: string, source?: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten dokument?')) return;
    try {
      if (source === 'instance') {
        await (supabase as any).from('fleet_document_instances').delete().eq('id', reqId);
      } else {
        await supabase.from('driver_document_requests' as any).delete().eq('id', reqId);
      }
      toast.success('Dokument usunięty');
      refetchRequests();
      refetchInstances();
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

    // If it's a custom document instance with filled_content, render that
    if (contract.filled_content && contract.source === 'instance') {
      return `<div style="font-family: 'Times New Roman', Georgia, serif; max-width: 700px; margin: 0 auto; padding: 30px; font-size: 13px; line-height: 1.8; color: #1a1a1a; white-space: pre-wrap;">${contract.filled_content}</div>`;
    }

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
  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§2 Cel najmu</h2>
  <p>Pojazd zostaje oddany w najem w celu umożliwienia Najemcy korzystania z niego przy realizacji usług przewozu osób lub rzeczy za pośrednictwem aplikacji transportowych.</p>
  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§3 Okres trwania umowy</h2>
  <p>1. Umowa zostaje zawarta na czas nieokreślony.</p>
  <p>2. Każda ze Stron może wypowiedzieć umowę z zachowaniem 7-dniowego okresu wypowiedzenia.</p>
  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§4 Czynsz najmu</h2>
  <p>1. Strony ustalają, że czynsz najmu będzie ustalany miesięcznie.</p>
  <p>2. Czynsz może być wypłacany w formie zaliczek w okresach tygodniowych.</p>
  <p>3. Czynsz będzie płatny ${fd.payment_method === 'transfer' ? 'przelewem na rachunek bankowy Wynajmującego nr: <strong>' + (fd.bank_account || '') + '</strong>' : 'gotówką'}.</p>
  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§5 Postanowienia końcowe</h2>
  <p>1. W sprawach nieuregulowanych niniejszą umową zastosowanie mają przepisy Kodeksu cywilnego.</p>
  <p>2. Wszelkie zmiany niniejszej umowy wymagają formy pisemnej pod rygorem nieważności.</p>
  <p>3. Umowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze Stron.</p>
  <div style="display: flex; justify-content: space-between; margin-top: 60px; padding-top: 20px; border-top: 1px solid #eee;">
    <div style="text-align: center; width: 45%;">
      <p style="margin-bottom: 10px; font-weight: bold;">Wynajmujący</p>
      <div style="min-height: 60px; display: flex; align-items: center; justify-content: center;">
        ${contract.signature_url ? `<img src="${contract.signature_url}" alt="Podpis" style="max-height: 50px;" />` : '<p style="color: #aaa;">……………………………………</p>'}
      </div>
    </div>
    <div style="text-align: center; width: 10%;">
      ${stampUrl ? `<div style="display: flex; align-items: center; justify-content: center; height: 100%;"><img src="${stampUrl}" alt="Pieczątka" style="max-height: 50px;" /></div>` : ''}
    </div>
    <div style="text-align: center; width: 45%;">
      <p style="margin-bottom: 10px; font-weight: bold;">Najemca</p>
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

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten szablon?')) return;
    try {
      await (supabase as any).from('fleet_document_templates').update({ status: 'archived' }).eq('id', templateId);
      toast.success('Szablon usunięty');
      refetchTemplates();
    } catch { toast.error('Błąd'); }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
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
                  {tab.value === 'sent' && filteredSent.length > 0 && (
                    <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{filteredSent.length}</Badge>
                  )}
                  {tab.value === 'completed' && signedDocs.length > 0 && (
                    <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{signedDocs.length}</Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Templates Tab */}
            <TabsContent value="templates" className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input placeholder="Szukaj szablonów..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
                </div>
                <Button onClick={() => setShowCreateTemplate(true)} className="gap-2" style={{ backgroundColor: '#6C5CE7' }}>
                  <Plus className="h-4 w-4" /> Stwórz szablon
                </Button>
                <Button onClick={() => setShowUploadContract(true)} variant="outline" className="gap-2">
                  <FileUp className="h-4 w-4" /> Wgraj umowę
                </Button>
              </div>
              <div className="space-y-3">
                {filteredTemplates.map((template) => (
                  <div key={template.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex-1 min-w-[200px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{template.name}</h3>
                          <Badge variant="default" className="text-[10px]">Aktywny</Badge>
                          <Badge variant="outline" className="text-[10px]">v{template.version}</Badge>
                          {template.builtin && <Badge variant="secondary" className="text-[10px]">Wbudowany</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Kod: {template.code}</p>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setPreviewTemplate(template)}>
                          <Eye className="h-3.5 w-3.5" /> Podgląd
                        </Button>
                        <Button size="sm" className="gap-1 text-xs" style={{ backgroundColor: '#6C5CE7' }} onClick={() => setFillTemplate(template)}>
                          <FileText className="h-3.5 w-3.5" /> Uzupełnij i wyślij
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => {
                          if (template.builtin) {
                            setEditTemplate({ id: template.id, name: template.name, content: template.content, version: template.version });
                          } else {
                            setEditTemplate(template);
                          }
                          setShowCreateTemplate(true);
                        }}>
                          <Edit className="h-3.5 w-3.5" /> Edytuj
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => {
                          setContractDate(new Date().toISOString().split('T')[0]);
                          setContractNumber('');
                          setSendDialog({ templateCode: template.code, templateName: template.name });
                        }}>
                          <Send className="h-3.5 w-3.5" /> Wyślij do kierowcy
                        </Button>
                        {!template.builtin && (
                          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => handleDeleteTemplate(template.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {filteredTemplates.length === 0 && (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">Brak szablonów</p>
                  </div>
                )}
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
                    const isRejected = req.status === 'rejected';
                    return (
                      <div key={`${req.source}-${req.id}`} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-sm">{req.template_name}</h3>
                              <Badge variant={isSigned ? 'default' : isRejected ? 'destructive' : req.status === 'in_progress' ? 'secondary' : 'outline'}
                                className={isSigned ? 'bg-green-600 text-white' : ''}>
                                {isSigned ? '✓ Podpisany' : isRejected ? 'Odrzucony' : req.status === 'in_progress' ? 'W trakcie' : 'Oczekuje na podpis'}
                              </Badge>
                              {req.contract_number && <Badge variant="outline" className="text-[10px]">Nr {req.contract_number}</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              Kierowca: {driver ? `${driver.first_name} ${driver.last_name}` : '—'}
                            </p>
                            <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                              {(req.sent_at || req.created_at) && (
                                <span>Wysłano: {format(new Date(req.sent_at || req.created_at), 'dd.MM.yyyy HH:mm', { locale: pl })}</span>
                              )}
                              {req.signed_at && (
                                <span>Podpisano: {format(new Date(req.signed_at), 'dd.MM.yyyy HH:mm', { locale: pl })}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1.5">
                            {isSigned && (
                              <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setPreviewContract(req)}>
                                <Eye className="h-3.5 w-3.5" /> Podgląd
                              </Button>
                            )}
                            {!isSigned && !isRejected && (
                              <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => handleResend(req)}>
                                <RotateCcw className="h-3.5 w-3.5" /> Ponów
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => handleDeleteRequest(req.id, req.source)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Signed Documents Tab */}
            <TabsContent value="completed" className="space-y-4">
              {signedDocs.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Brak podpisanych dokumentów</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {signedDocs.map((doc: any) => {
                    const driver = drivers.find(d => d.id === doc.driver_id);
                    return (
                      <div key={`${doc.source}-${doc.id}`} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-sm">{doc.template_name}</h3>
                              <Badge className="bg-green-600 text-white text-[10px] gap-1"><CheckCircle className="h-3 w-3" /> Podpisany</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {driver ? `${driver.first_name} ${driver.last_name}` : '—'}
                            </p>
                            {doc.signed_at && (
                              <p className="text-xs text-muted-foreground">
                                Podpisano: {format(new Date(doc.signed_at), 'dd.MM.yyyy HH:mm', { locale: pl })}
                              </p>
                            )}
                          </div>
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => setPreviewContract(doc)}>
                            <Eye className="h-4 w-4" /> Podgląd
                          </Button>
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
              {previewContract?.template_name || 'Dokument'}
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
                w.document.write(`<html><head><title>${previewContract.template_name || 'Dokument'}</title></head><body>${generateContractHtml(previewContract)}</body></html>`);
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
              Kierowca po zalogowaniu zobaczy powiadomienie o konieczności wypełnienia dokumentu.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Data zawarcia umowy</Label>
                <Input type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nr umowy (opcjonalnie)</Label>
                <Input placeholder="Auto" value={contractNumber} onChange={e => setContractNumber(e.target.value)} />
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
                        {isSigned && <Badge className="text-[10px] gap-1 bg-green-600 text-white">✓ Podpisana</Badge>}
                        {isPending && <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300">Oczekuje</Badge>}
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialog(null)}>Anuluj</Button>
            <Button onClick={handleSendToDrivers} className="gap-1"><Send className="h-4 w-4" /> Wyślij ({sendToAll ? drivers.length : selectedDriverIds.length})</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / Edit Template Modal */}
      <CreateTemplateModal
        open={showCreateTemplate}
        onOpenChange={(v) => { setShowCreateTemplate(v); if (!v) setEditTemplate(null); }}
        fleetId={resolvedFleetId || cityId}
        onCreated={() => { refetchTemplates(); }}
        editTemplate={editTemplate}
      />

      {/* Template Preview Modal */}
      <TemplatePreviewModal
        open={!!previewTemplate}
        onOpenChange={(v) => { if (!v) setPreviewTemplate(null); }}
        template={previewTemplate}
        onFillAndSend={() => { setFillTemplate(previewTemplate); setPreviewTemplate(null); }}
      />

      {/* Fill and Send Panel */}
      <FillAndSendPanel
        open={!!fillTemplate}
        onOpenChange={(v) => { if (!v) setFillTemplate(null); }}
        template={fillTemplate}
        fleetId={resolvedFleetId || cityId}
        onSent={() => { refetchInstances(); refetchRequests(); }}
      />

      {/* Upload Contract Modal */}
      <UploadContractModal
        open={showUploadContract}
        onOpenChange={setShowUploadContract}
        fleetId={resolvedFleetId || cityId}
        onUploaded={() => { refetchInstances(); }}
      />
    </div>
  );
};
