import { useState, useEffect } from 'react';
import { WholesalerIntegrationsSettings } from './parts/WholesalerIntegrationsSettings';
import { WorkshopStationsManager } from './WorkshopStationsManager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useWorkshopStatuses } from '@/hooks/useWorkshop';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { translateWorkshopStatus } from '@/utils/workshopStatusStyle';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Settings, Building2, FileText, Mail, Palette,
  CreditCard, Calendar, Users, Wrench, ClipboardList, Package,
  Plus, Trash2, GripVertical, Save, Loader2
} from 'lucide-react';

interface Props {
  providerId: string;
  onBack: () => void;
}

export function WorkshopSettings({ providerId, onBack }: Props) {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const sections = {
    ogolne: {
      title: t('workshop.settings.sections.general'),
      items: [
        { key: 'podstawowe', label: t('workshop.settings.section.basic'), icon: Settings },
        { key: 'dane-firmy', label: t('workshop.settings.section.companyData'), icon: Building2 },
        { key: 'numeracja', label: t('workshop.settings.section.documentNumbering'), icon: FileText },
        { key: 'szablony-email', label: t('workshop.settings.section.emailTemplates'), icon: Mail },
        { key: 'wyglad', label: t('workshop.settings.section.documentAppearance'), icon: Palette },
        { key: 'karta-zlecenia', label: t('workshop.settings.section.electronicOrderCard'), icon: FileText },
        { key: 'kasy', label: t('workshop.settings.section.cashRegisters'), icon: CreditCard },
      ]
    },
    warsztat: {
      title: t('workshop.settings.sections.workshop'),
      items: [
        { key: 'w-podstawowe', label: t('workshop.settings.section.basic'), icon: Settings },
        { key: 'w-zaawansowane', label: t('workshop.settings.section.advanced'), icon: Wrench },
        { key: 'w-wyceny', label: t('workshop.settings.section.estimates'), icon: CreditCard },
        { key: 'w-zlecenia', label: t('workshop.settings.section.orders'), icon: ClipboardList },
        { key: 'w-godziny', label: t('workshop.settings.section.workingHours'), icon: Calendar },
        { key: 'w-statusy', label: t('workshop.settings.section.orderStatuses'), icon: ClipboardList },
        { key: 'w-rodzaje', label: t('workshop.settings.section.orderTypes'), icon: FileText },
        { key: 'w-szablony-zadan', label: t('workshop.settings.section.taskTemplates'), icon: ClipboardList },
        { key: 'w-szablony-tworzenia', label: t('workshop.settings.section.orderCreationTemplates'), icon: FileText },
        { key: 'w-stanowiska', label: t('workshop.settings.section.workstations'), icon: Wrench },
        { key: 'w-dzialy', label: t('workshop.settings.section.departments'), icon: Building2 },
        { key: 'w-pracownicy', label: t('workshop.settings.section.employeeList'), icon: Users },
        { key: 'w-listy-kontrolne', label: t('workshop.settings.section.checklists'), icon: ClipboardList },
        { key: 'w-pojazdy', label: t('workshop.settings.section.vehicles'), icon: Wrench },
      ]
    },
    terminarz: {
      title: t('workshop.settings.sections.scheduler'),
      items: [
        { key: 't-podstawowe', label: t('workshop.settings.section.basic'), icon: Calendar },
        { key: 't-kalendarze', label: t('workshop.settings.section.additionalCalendars'), icon: Calendar },
      ]
    },
    magazyn: {
      title: t('workshop.settings.sections.warehouse'),
      items: [
        { key: 'm-towary', label: t('workshop.settings.section.goods'), icon: Package },
        { key: 'm-producenci', label: t('workshop.settings.section.manufacturerList'), icon: Building2 },
        { key: 'm-grupy', label: t('workshop.settings.section.priceGroups'), icon: CreditCard },
      ]
    },
    przechowalnia: {
      title: t('workshop.settings.sections.storage'),
      items: [
        { key: 'p-podstawowe', label: t('workshop.settings.section.basic'), icon: Settings },
        { key: 'p-szablony', label: t('workshop.settings.section.taskTemplates'), icon: ClipboardList },
      ]
    },
    integracje: {
      title: t('workshop.settings.sections.integrations'),
      items: [
        { key: 'i-hurtownie', label: t('workshop.settings.section.wholesalerIntegrations'), icon: Package },
        { key: 'i-integracje', label: t('workshop.settings.section.otherIntegrations'), icon: Wrench },
      ]
    },
    inne: {
      title: t('workshop.settings.sections.other'),
      items: [
        { key: 'i-import', label: t('workshop.settings.section.dataImport'), icon: FileText },
        { key: 'i-eksport', label: t('workshop.settings.section.dataExport'), icon: FileText },
      ]
    },
  };

  if (activeSection) {
    return (
      <SettingSectionDetail
        sectionKey={activeSection}
        providerId={providerId}
        onBack={() => setActiveSection(null)}
        onBackToMain={onBack}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-xl font-bold">{t('workshop.settings.title')}</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Object.entries(sections).map(([key, section]) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wide">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {section.items.map(item => (
                <button
                  key={item.key}
                  className="w-full text-left text-sm text-primary hover:underline py-1 flex items-center gap-2"
                  onClick={() => setActiveSection(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SettingSectionDetail({ sectionKey, providerId, onBack, onBackToMain }: {
  sectionKey: string; providerId: string; onBack: () => void; onBackToMain: () => void;
}) {
  const { t } = useTranslation();
  const { data: statuses = [] } = useWorkshopStatuses(providerId);

  const titleKeys: Record<string, string> = {
    'dane-firmy': 'workshop.settings.detailTitle.companyData',
    'numeracja': 'workshop.settings.detailTitle.documentNumbering',
    'w-statusy': 'workshop.settings.detailTitle.orderStatuses',
    'w-stanowiska': 'workshop.settings.detailTitle.workstations',
    'w-dzialy': 'workshop.settings.detailTitle.departments',
    'w-pracownicy': 'workshop.settings.detailTitle.employeeList',
    'w-godziny': 'workshop.settings.detailTitle.workingHours',
    'karta-zlecenia': 'workshop.settings.detailTitle.electronicOrderCard',
    'w-szablony-zadan': 'workshop.settings.detailTitle.taskTemplates',
    'i-hurtownie': 'workshop.settings.detailTitle.wholesalerIntegrations',
  };

  const title = titleKeys[sectionKey] ? t(titleKeys[sectionKey]) : t('workshop.settings.title');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <button onClick={onBackToMain} className="text-primary hover:underline">🏠</button>
        <span className="text-muted-foreground">/</span>
        <button onClick={onBack} className="text-primary hover:underline">{t('workshop.settings.title')}</button>
        <span className="text-muted-foreground">/</span>
        <span className="font-semibold">{title}</span>
      </div>

      {sectionKey === 'dane-firmy' && <CompanyDataSettings />}
      {sectionKey === 'numeracja' && <DocumentNumberingSettings providerId={providerId} />}
      {sectionKey === 'w-statusy' && <StatusSettings statuses={statuses} />}
      {sectionKey === 'w-stanowiska' && <WorkstationSettings providerId={providerId} />}
      {sectionKey === 'w-dzialy' && <WorkshopStationsManager providerId={providerId} />}
      {sectionKey === 'w-pracownicy' && <WorkerSettings providerId={providerId} />}
      {sectionKey === 'w-godziny' && <WorkingHoursSettings />}
      {sectionKey === 'karta-zlecenia' && <OrderCardSettings />}
      {sectionKey === 'i-hurtownie' && <WholesalerIntegrationsSettings providerId={providerId} />}

      {!['dane-firmy', 'numeracja', 'w-statusy', 'w-stanowiska', 'w-dzialy', 'w-pracownicy', 'w-godziny', 'karta-zlecenia', 'i-hurtownie'].includes(sectionKey) && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('workshop.settings.sectionComingSoon', { title })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Document Numbering Settings
// ============================================================

type ResetCycle = 'never' | 'yearly' | 'monthly' | 'daily';
type DateOrder = 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'MM-YYYY' | 'YYYY-MM' | 'YYYY' | 'none';

interface DocFormat {
  enabled: boolean;
  prefix: string;
  reset: ResetCycle;
  dateOrder: DateOrder;
  separator: '/' | '-' | '.';
  padding: number; // e.g. 4 → 0001
  startNumber: number;
}

const DEFAULT_FORMATS: Record<string, DocFormat> = {
  zlecenia: { enabled: true, prefix: 'ZL', reset: 'yearly', dateOrder: 'YYYY', separator: '/', padding: 4, startNumber: 1 },
  faktury: { enabled: true, prefix: 'FV', reset: 'monthly', dateOrder: 'MM-YYYY', separator: '/', padding: 3, startNumber: 1 },
  korekty: { enabled: true, prefix: 'KOR', reset: 'monthly', dateOrder: 'MM-YYYY', separator: '/', padding: 3, startNumber: 1 },
  proformy: { enabled: true, prefix: 'PRO', reset: 'monthly', dateOrder: 'MM-YYYY', separator: '/', padding: 3, startNumber: 1 },
  paragony: { enabled: false, prefix: 'PAR', reset: 'daily', dateOrder: 'YYYY-MM-DD', separator: '/', padding: 4, startNumber: 1 },
  wyceny: { enabled: true, prefix: 'WC', reset: 'yearly', dateOrder: 'YYYY', separator: '/', padding: 4, startNumber: 1 },
  przyjecia: { enabled: false, prefix: 'PZ', reset: 'monthly', dateOrder: 'MM-YYYY', separator: '/', padding: 3, startNumber: 1 },
  wydania: { enabled: false, prefix: 'WZ', reset: 'monthly', dateOrder: 'MM-YYYY', separator: '/', padding: 3, startNumber: 1 },
};

const DOC_LABEL_KEYS: Record<string, string> = {
  zlecenia: 'workshop.settings.docNumbering.doc.workshopOrders',
  faktury: 'workshop.settings.docNumbering.doc.vatInvoices',
  korekty: 'workshop.settings.docNumbering.doc.correctionInvoices',
  proformy: 'workshop.settings.docNumbering.doc.proformaInvoices',
  paragony: 'workshop.settings.docNumbering.doc.receipts',
  wyceny: 'workshop.settings.docNumbering.doc.estimates',
  przyjecia: 'workshop.settings.docNumbering.doc.warehouseReceipts',
  wydania: 'workshop.settings.docNumbering.doc.warehouseIssues',
};

const RESET_LABEL_KEYS: Record<ResetCycle, string> = {
  never: 'workshop.settings.docNumbering.reset.never',
  yearly: 'workshop.settings.docNumbering.reset.yearly',
  monthly: 'workshop.settings.docNumbering.reset.monthly',
  daily: 'workshop.settings.docNumbering.reset.daily',
};

const DATE_LABEL_KEYS: Record<DateOrder, string> = {
  'YYYY-MM-DD': 'workshop.settings.docNumbering.dateOrder.ymd',
  'DD-MM-YYYY': 'workshop.settings.docNumbering.dateOrder.dmy',
  'MM-YYYY': 'workshop.settings.docNumbering.dateOrder.my',
  'YYYY-MM': 'workshop.settings.docNumbering.dateOrder.ym',
  'YYYY': 'workshop.settings.docNumbering.dateOrder.y',
  'none': 'workshop.settings.docNumbering.dateOrder.none',
};

function buildPreview(fmt: DocFormat): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const num = String(fmt.startNumber).padStart(fmt.padding, '0');
  const sep = fmt.separator;

  let datePart = '';
  switch (fmt.dateOrder) {
    case 'YYYY-MM-DD': datePart = `${yyyy}${sep}${mm}${sep}${dd}`; break;
    case 'DD-MM-YYYY': datePart = `${dd}${sep}${mm}${sep}${yyyy}`; break;
    case 'MM-YYYY': datePart = `${mm}${sep}${yyyy}`; break;
    case 'YYYY-MM': datePart = `${yyyy}${sep}${mm}`; break;
    case 'YYYY': datePart = `${yyyy}`; break;
    case 'none': datePart = ''; break;
  }
  const parts = [fmt.prefix, datePart, num].filter(Boolean);
  return parts.join(sep);
}

function DocumentNumberingSettings({ providerId }: { providerId: string }) {
  const { t } = useTranslation();
  const storageKey = `workshop_doc_numbering_${providerId}`;
  const [formats, setFormats] = useState<Record<string, DocFormat>>(DEFAULT_FORMATS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setFormats({ ...DEFAULT_FORMATS, ...parsed });
      }
    } catch { /* ignore */ }
  }, [providerId]);

  const update = (docKey: string, patch: Partial<DocFormat>) => {
    setFormats(prev => ({ ...prev, [docKey]: { ...prev[docKey], ...patch } }));
  };

  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(formats));
      toast.success(t('workshop.settings.docNumbering.saved'));
    } catch (e: any) {
      toast.error(t('workshop.settings.docNumbering.saveError', { error: e.message }));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">
            {t('workshop.settings.docNumbering.intro')}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {Object.entries(formats).map(([key, fmt]) => (
          <Card key={key}>
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <Switch checked={fmt.enabled} onCheckedChange={(v) => update(key, { enabled: v })} />
                  <div>
                    <h4 className="font-semibold">{DOC_LABEL_KEYS[key] ? t(DOC_LABEL_KEYS[key]) : key}</h4>
                    {fmt.enabled && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t('workshop.settings.docNumbering.preview')} <code className="bg-muted px-2 py-0.5 rounded text-foreground">{buildPreview(fmt)}</code>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {fmt.enabled && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t">
                  <div className="space-y-1">
                    <Label className="text-xs">{t('workshop.settings.docNumbering.prefix')}</Label>
                    <Input value={fmt.prefix} onChange={e => update(key, { prefix: e.target.value.toUpperCase().slice(0, 8) })} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('workshop.settings.docNumbering.counterReset')}</Label>
                    <Select value={fmt.reset} onValueChange={(v) => update(key, { reset: v as ResetCycle })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(RESET_LABEL_KEYS).map(([v, lk]) => <SelectItem key={v} value={v}>{t(lk)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('workshop.settings.docNumbering.dateFormat')}</Label>
                    <Select value={fmt.dateOrder} onValueChange={(v) => update(key, { dateOrder: v as DateOrder })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(DATE_LABEL_KEYS).map(([v, lk]) => <SelectItem key={v} value={v}>{t(lk)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('workshop.settings.docNumbering.separator')}</Label>
                    <Select value={fmt.separator} onValueChange={(v) => update(key, { separator: v as '/' | '-' | '.' })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="/">{t('workshop.settings.docNumbering.sep.slash')}</SelectItem>
                        <SelectItem value="-">{t('workshop.settings.docNumbering.sep.dash')}</SelectItem>
                        <SelectItem value=".">{t('workshop.settings.docNumbering.sep.dot')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('workshop.settings.docNumbering.digitCount')}</Label>
                    <Input type="number" min={1} max={8} value={fmt.padding}
                      onChange={e => update(key, { padding: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })}
                      className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('workshop.settings.docNumbering.startNumber')}</Label>
                    <Input type="number" min={1} value={fmt.startNumber}
                      onChange={e => update(key, { startNumber: Math.max(1, Number(e.target.value) || 1) })}
                      className="h-9" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end sticky bottom-4">
        <Button onClick={save} className="gap-2 shadow-lg"><Save className="h-4 w-4" /> {t('workshop.settings.docNumbering.saveNumbering')}</Button>
      </div>
    </div>
  );
}


function CompanyDataSettings() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="py-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('workshop.settings.companyData.companyName')}</Label>
            <Input placeholder={t('workshop.settings.companyData.companyNamePlaceholder')} />
          </div>
          <div className="space-y-2">
            <Label>NIP</Label>
            <Input placeholder="0000000000" />
          </div>
          <div className="space-y-2">
            <Label>{t('workshop.settings.companyData.address')}</Label>
            <Input placeholder="ul. Przykładowa 1" />
          </div>
          <div className="space-y-2">
            <Label>{t('workshop.settings.companyData.postalCodeCity')}</Label>
            <Input placeholder={t('workshop.settings.companyData.postalCodeCityPlaceholder')} />
          </div>
          <div className="space-y-2">
            <Label>{t('workshop.settings.companyData.phone')}</Label>
            <Input placeholder="+48 000 000 000" />
          </div>
          <div className="space-y-2">
            <Label>{t('workshop.settings.companyData.email')}</Label>
            <Input type="email" placeholder="kontakt@warsztat.pl" />
          </div>
          <div className="space-y-2">
            <Label>{t('workshop.settings.companyData.website')}</Label>
            <Input placeholder="https://warsztat.pl" />
          </div>
          <div className="space-y-2">
            <Label>{t('workshop.settings.companyData.bankAccount')}</Label>
            <Input placeholder="PL 00 0000 0000 0000 0000 0000 0000" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t('workshop.settings.companyData.companyLogo')}</Label>
          <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
            <p className="text-sm">{t('workshop.settings.companyData.logoDropzone')}</p>
            <Button variant="outline" size="sm" className="mt-2">{t('workshop.settings.companyData.selectFile')}</Button>
          </div>
        </div>
        <div className="flex justify-end">
          <Button className="gap-2"><Save className="h-4 w-4" /> {t('common.save')}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusSettings({ statuses }: { statuses: any[] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="py-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('workshop.settings.statuses.intro')}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead>{t('workshop.settings.statuses.colName')}</TableHead>
              <TableHead>{t('workshop.settings.statuses.colColor')}</TableHead>
              <TableHead>{t('workshop.settings.statuses.colOrder')}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statuses.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell><GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" /></TableCell>
                <TableCell className="font-medium">{translateWorkshopStatus(s.name, t)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded" style={{ backgroundColor: s.color }} />
                    <span className="text-xs text-muted-foreground">{s.color}</span>
                  </div>
                </TableCell>
                <TableCell>{s.sort_order}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" /> {t('workshop.settings.statuses.addStatus')}</Button>
      </CardContent>
    </Card>
  );
}

// ---- FUNCTIONAL Workstation Settings ----
function WorkstationSettings({ providerId }: { providerId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');

  const { data: workstations = [], isLoading } = useQuery({
    queryKey: ['workshop-workstations', providerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_workstations')
        .select('*')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('workshop_workstations')
        .insert({ provider_id: providerId, name, is_active: true });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-workstations'] });
      toast.success(t('workshop.settings.station.added'));
      setDialogOpen(false);
      setName('');
    },
    onError: (e: any) => {
      console.error('Workstation add error:', e);
      toast.error(t('workshop.settings.station.error', { error: e.message }));
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('workshop_workstations')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-workstations'] });
      toast.success(t('workshop.settings.station.removed'));
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="py-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('workshop.settings.station.intro')}
        </p>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('workshop.settings.station.colName')}</TableHead>
                <TableHead>{t('workshop.settings.station.colActive')}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workstations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    {t('workshop.settings.station.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                workstations.map((ws: any) => (
                  <TableRow key={ws.id}>
                    <TableCell className="font-medium">{ws.name}</TableCell>
                    <TableCell>
                      <Badge variant={ws.is_active ? 'default' : 'secondary'}>
                        {ws.is_active ? t('ui.yes') : t('ui.no')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMut.mutate(ws.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
        <Button variant="outline" className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> {t('workshop.settings.station.addWorkstation')}
        </Button>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('workshop.settings.station.addWorkstation')}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('workshop.settings.station.nameLabel')}</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('workshop.settings.station.namePlaceholder')} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={() => addMut.mutate()} disabled={!name.trim() || addMut.isPending}>
                {addMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t('workshop.settings.station.add')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ---- FUNCTIONAL Worker Settings ----
function WorkerSettings({ providerId }: { providerId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [empName, setEmpName] = useState('');
  const [phone, setPhone] = useState('');

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['workshop-employees', providerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_employees')
        .select('*')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('workshop_employees')
        .insert({
          provider_id: providerId,
          name: empName,
          phone: phone || null,
          is_active: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-employees'] });
      toast.success(t('workshop.settings.worker.added'));
      setDialogOpen(false);
      setEmpName('');
      setPhone('');
    },
    onError: (e: any) => {
      console.error('Employee add error:', e);
      toast.error(t('workshop.settings.worker.error', { error: e.message }));
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('workshop_employees')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-employees'] });
      toast.success(t('workshop.settings.worker.removed'));
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="py-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('workshop.settings.worker.intro')}
        </p>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('workshop.settings.worker.colFullName')}</TableHead>
                <TableHead>{t('workshop.settings.worker.colPhone')}</TableHead>
                <TableHead>{t('workshop.settings.worker.colActive')}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {t('workshop.settings.worker.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((emp: any) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">{emp.name}</TableCell>
                    <TableCell>{emp.phone || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={emp.is_active ? 'default' : 'secondary'}>
                        {emp.is_active ? t('ui.yes') : t('ui.no')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMut.mutate(emp.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
        <Button variant="outline" className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> {t('workshop.settings.worker.addEmployee')}
        </Button>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('workshop.settings.worker.addEmployee')}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('workshop.settings.worker.fullNameLabel')}</Label>
                <Input value={empName} onChange={e => setEmpName(e.target.value)} placeholder="Jan Kowalski" />
              </div>
              <div className="space-y-2">
                <Label>{t('workshop.settings.worker.phoneLabel')}</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+48 000 000 000" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={() => addMut.mutate()} disabled={!empName.trim() || addMut.isPending}>
                {addMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t('workshop.settings.worker.add')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function WorkingHoursSettings() {
  const { t } = useTranslation();
  const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return (
    <Card>
      <CardContent className="py-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('workshop.settings.workingHours.intro')}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('workshop.settings.workingHours.colDay')}</TableHead>
              <TableHead>{t('workshop.settings.workingHours.colOpen')}</TableHead>
              <TableHead>{t('workshop.settings.workingHours.colFrom')}</TableHead>
              <TableHead>{t('workshop.settings.workingHours.colTo')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dayKeys.map((dayKey, i) => (
              <TableRow key={dayKey}>
                <TableCell className="font-medium">{t(`workshop.settings.workingHours.day.${dayKey}`)}</TableCell>
                <TableCell><Switch defaultChecked={i < 5} /></TableCell>
                <TableCell><Input type="time" defaultValue={i < 5 ? '08:00' : ''} className="w-28" disabled={i >= 5} /></TableCell>
                <TableCell><Input type="time" defaultValue={i < 5 ? '17:00' : ''} className="w-28" disabled={i >= 5} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-end">
          <Button className="gap-2"><Save className="h-4 w-4" /> {t('common.save')}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderCardSettings() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="py-6 space-y-4">
        <h3 className="font-semibold">{t('workshop.settings.orderCard.title')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('workshop.settings.orderCard.subtitle')}
        </p>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{t('workshop.settings.orderCard.requireProtocolSignature')}</p>
              <p className="text-xs text-muted-foreground">{t('workshop.settings.orderCard.requireProtocolSignatureDesc')}</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{t('workshop.settings.orderCard.requireEstimateAcceptance')}</p>
              <p className="text-xs text-muted-foreground">{t('workshop.settings.orderCard.requireEstimateAcceptanceDesc')}</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{t('workshop.settings.orderCard.showCompanyLogo')}</p>
              <p className="text-xs text-muted-foreground">{t('workshop.settings.orderCard.showCompanyLogoDesc')}</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{t('workshop.settings.orderCard.notifyEstimateChanges')}</p>
              <p className="text-xs text-muted-foreground">{t('workshop.settings.orderCard.notifyEstimateChangesDesc')}</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="space-y-2">
            <Label>{t('workshop.settings.orderCard.gdprLabel')}</Label>
            <Textarea
              rows={3}
              defaultValue={t('workshop.settings.orderCard.gdprDefault')}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button className="gap-2"><Save className="h-4 w-4" /> {t('common.save')}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
