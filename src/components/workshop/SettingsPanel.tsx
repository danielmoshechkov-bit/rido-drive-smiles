import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UniversalSubTabBar } from '@/components/UniversalSubTabBar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Save, Plus, Trash2, Users, Building2, Monitor, UserPlus, Sparkles, Search, Loader2, Upload, X } from 'lucide-react';
import { WorkshopPartsIntegrationsSettings } from './parts/WorkshopPartsIntegrationsSettings';
import { RidoPriceSettingsTab } from './pricing/RidoPriceSettingsTab';
import { WorkshopSettingsPage } from './WorkshopSettingsPage';
import { WorkshopEmployeesPage } from './WorkshopEmployeesPage';
import { DocumentNumberingPage } from './DocumentNumberingPage';
import { OrderStatusesPage } from './settings/OrderStatusesPage';
import { OrderTypesPage } from './settings/OrderTypesPage';
import { TaskTemplatesPage } from './settings/TaskTemplatesPage';
import { ChecklistItemsPage } from './settings/ChecklistItemsPage';
import { CalendarSettingsPage } from './settings/CalendarSettingsPage';
import { DEFAULT_SERVICE_PROVIDER_PRIMARY_TABS, SERVICE_PROVIDER_TAB_LABELS, SERVICE_PROVIDER_TAB_LABEL_KEYS, SERVICE_PROVIDER_TAB_ORDER, type ServiceProviderNavTabKey } from '@/components/service-provider/navConfig';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { NotificationsSettings } from '@/components/notifications/NotificationsSettings';

interface SettingsPanelProps {
  providerId: string | null;
  settingsForm: any;
  setSettingsForm: (fn: (prev: any) => any) => void;
  websiteBuilderEnabled?: boolean;
  onPrimaryTabsSaved?: (tabs: string[]) => void;
  initialSubTab?: string;
}

export function SettingsPanel({ providerId, settingsForm, setSettingsForm, websiteBuilderEnabled = false, onPrimaryTabsSaved, initialSubTab }: SettingsPanelProps) {
  const { t } = useTranslation();
  const [settingsTab, setSettingsTab] = useState(initialSubTab || 'konto');
  useEffect(() => { if (initialSubTab) setSettingsTab(initialSubTab); }, [initialSubTab]);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showAddWorkstation, setShowAddWorkstation] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [empForm, setEmpForm] = useState({ name: '', phone: '', email: '', salary: '' });
  const [wsName, setWsName] = useState('');
  const [wsCategory, setWsCategory] = useState('Warsztat');
  const [activeWsCategory, setActiveWsCategory] = useState('Warsztat');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [primaryTabs, setPrimaryTabs] = useState<ServiceProviderNavTabKey[]>(DEFAULT_SERVICE_PROVIDER_PRIMARY_TABS);
  const queryClient = useQueryClient();
  const [nipSearching, setNipSearching] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Employees
  const { data: employees = [] } = useQuery({
    queryKey: ['settings-employees', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_employees')
        .select('*')
        .eq('provider_id', providerId)
        .eq('is_active', true)
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
  });

  // Workstations
  const { data: workstations = [] } = useQuery({
    queryKey: ['settings-workstations', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_workstations')
        .select('*')
        .eq('provider_id', providerId)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  const addEmployeeMut = useMutation({
    mutationFn: async (emp: any) => {
      const { error } = await (supabase as any)
        .from('workshop_employees')
        .insert({ provider_id: providerId, ...emp });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-employees'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-employees'] });
      toast.success(t('workshop.settingsPanel.employeeAdded'));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeEmployeeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('workshop_employees')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-employees'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-employees'] });
      toast.success(t('workshop.settingsPanel.employeeRemoved'));
    },
  });

  const addWorkstationMut = useMutation({
    mutationFn: async ({ name, category }: { name: string; category: string }) => {
      const { error } = await (supabase as any)
        .from('workshop_workstations')
        .insert({ provider_id: providerId, name, category, sort_order: workstations.length });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-workstations'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-workstations'] });
      queryClient.invalidateQueries({ queryKey: ['workshop-workstations'] });
      toast.success(t('workshop.settingsPanel.workstationAdded'));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleAddWorkstation = () => {
    if (!wsName.trim()) return;
    addWorkstationMut.mutate({ name: wsName.trim(), category: wsCategory });
    setWsName('');
    setShowAddWorkstation(false);
  };

  const removeWorkstationMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('workshop_workstations')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-workstations'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-workstations'] });
      queryClient.invalidateQueries({ queryKey: ['workshop-workstations'] });
      toast.success(t('workshop.settingsPanel.workstationRemoved'));
    },
  });

  const handleNipSearch = async () => {
    const cleanNip = (settingsForm.nip || '').replace(/[\s-]/g, '');
    if (!cleanNip || cleanNip.length !== 10) {
      toast.error(t('workshop.settingsPanel.invalidNip'));
      return;
    }
    setNipSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('registry-gus', {
        body: { nip: cleanNip },
      });
      if (error) throw error;
      // registry-gus zwraca { success, data: {...} }
      const company = data?.data || data;
      if (company?.name) {
        setSettingsForm((p: any) => ({
          ...p,
          company_name: company.name,
          address: company.address || company.street || p.address,
          city: company.city || p.city,
          postal_code: company.postalCode || company.zipCode || p.postal_code,
        }));
        toast.success(t('workshop.settingsPanel.companyDataFetched'));
      } else {
        toast.info(data?.error || t('workshop.settingsPanel.companyNotFound'));
      }
    } catch (e: any) {
      toast.error(t('workshop.settingsPanel.searchError', { error: e.message || t('workshop.settingsPanel.unknownError') }));
    } finally {
      setNipSearching(false);
    }
  };

  const handleLogoDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      if (file.size <= 2 * 1024 * 1024) setLogoFile(file);
      else toast.error(t('workshop.settingsPanel.fileMax2mb'));
    }
  }, []);

  const handleSaveSettings = async () => {
    if (!providerId) return;
    setSavingSettings(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('workshop.settingsPanel.noAuth'));

      let uploadedLogoUrl = settingsForm.logo_url || '';
      if (logoFile) {
        const path = `workshop-logos/${user.id}/${Date.now()}-${logoFile.name}`;
        const { error: upErr } = await supabase.storage.from('documents').upload(path, logoFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
        uploadedLogoUrl = urlData.publicUrl;
      }

      const { error } = await supabase
        .from('service_providers')
        .update({
          company_name: settingsForm.company_name,
          company_nip: settingsForm.nip,
          owner_first_name: settingsForm.first_name,
          owner_last_name: settingsForm.last_name,
          owner_email: settingsForm.email,
          company_phone: settingsForm.phone,
          company_address: settingsForm.address,
          company_city: settingsForm.city,
          company_postal_code: settingsForm.postal_code,
          company_website: settingsForm.website,
          description: settingsForm.bio,
          logo_url: uploadedLogoUrl || null,
        })
        .eq('id', providerId);
      if (error) throw error;

      // Sync to workshop_settings
      const wsPayload: any = {
        firm_name: settingsForm.company_name,
        short_name: settingsForm.short_name || '',
        nip: (settingsForm.nip || '').replace(/[\s-]/g, ''),
        address: settingsForm.address,
        city: settingsForm.city,
        postal_code: settingsForm.postal_code,
        phone: settingsForm.phone,
        email: settingsForm.email,
        website: settingsForm.website,
        bank_account: settingsForm.bank_account || '',
        logo_url: uploadedLogoUrl || '',
        updated_at: new Date().toISOString(),
      };

      const { data: existingWs } = await (supabase as any).from('workshop_settings').select('id').eq('user_id', user.id).maybeSingle();
      if (existingWs) {
        await (supabase as any).from('workshop_settings').update(wsPayload).eq('id', existingWs.id);
      } else {
        await (supabase as any).from('workshop_settings').insert({ ...wsPayload, user_id: user.id });
      }

      setSettingsForm((p: any) => ({ ...p, logo_url: uploadedLogoUrl }));
      setLogoFile(null);
      toast.success(t('workshop.settingsPanel.settingsSaved'));
    } catch (err: any) {
      toast.error(t('workshop.settingsPanel.saveError', { error: err.message || t('workshop.settingsPanel.unknownError') }));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddEmployee = () => {
    if (!empForm.name.trim()) return;
    addEmployeeMut.mutate({
      name: empForm.name.trim(),
      phone: empForm.phone.trim() || null,
      email: empForm.email.trim() || null,
      salary: empForm.salary ? parseFloat(empForm.salary) : null,
    });
    setEmpForm({ name: '', phone: '', email: '', salary: '' });
    setShowAddEmployee(false);
  };



  useEffect(() => {
    if (!providerId) return;
    const loadNavPreferences = async () => {
      const { data } = await (supabase as any)
        .from('service_provider_nav_preferences')
        .select('primary_tabs')
        .eq('provider_id', providerId)
        .maybeSingle();

      const allowed = SERVICE_PROVIDER_TAB_ORDER.filter(tab => tab !== 'settings' && (websiteBuilderEnabled || tab !== 'website'));
      const saved = Array.isArray(data?.primary_tabs) ? data.primary_tabs.filter((tab: string) => allowed.includes(tab as ServiceProviderNavTabKey)) : [];
      setPrimaryTabs(saved.length ? saved as ServiceProviderNavTabKey[] : DEFAULT_SERVICE_PROVIDER_PRIMARY_TABS.filter(tab => allowed.includes(tab)));
    };

    loadNavPreferences();
  }, [providerId, websiteBuilderEnabled]);

  const handlePrimaryTabToggle = (tab: ServiceProviderNavTabKey, checked: boolean) => {
    setPrimaryTabs(prev => {
      if (checked) {
        return [...prev, tab];
      }
      return prev.filter(item => item !== tab);
    });
  };

  const handleSavePrimaryTabs = async () => {
    if (!providerId) return;

    const fallbackTabs = DEFAULT_SERVICE_PROVIDER_PRIMARY_TABS.filter(tab => websiteBuilderEnabled || tab !== 'website');
    const nextPrimaryTabs = (primaryTabs.length ? primaryTabs : fallbackTabs).filter(tab => tab !== 'settings');
    const nextMoreTabs = SERVICE_PROVIDER_TAB_ORDER.filter(tab => tab !== 'settings' && !nextPrimaryTabs.includes(tab) && (websiteBuilderEnabled || tab !== 'website')).concat('settings');

    const { error } = await (supabase as any)
      .from('service_provider_nav_preferences')
      .upsert(
        {
          provider_id: providerId,
          primary_tabs: nextPrimaryTabs,
          more_tabs: nextMoreTabs,
        },
        { onConflict: 'provider_id' }
      );

    if (error) {
      toast.error(t('workshop.settingsPanel.barLayoutSaveError'));
      return;
    }

    onPrimaryTabsSaved?.(nextPrimaryTabs);
    queryClient.invalidateQueries({ queryKey: ['nav-preferences'] });
    toast.success(t('workshop.settingsPanel.barLayoutSaved'));
  };

  const settingsSubTabs = [
    { value: 'konto', label: t('workshop.settingsPanel.tabs.account'), visible: true },
    { value: 'warsztat', label: t('workshop.settingsPanel.tabs.workshop'), visible: true },
    { value: 'pracownicy', label: t('workshop.settingsPanel.tabs.employees'), visible: true },
    { value: 'stanowiska', label: t('workshop.settingsPanel.tabs.workstations'), visible: true },
    { value: 'kalendarz', label: t('workshop.settingsPanel.tabs.calendar'), visible: true },
    { value: 'statusy', label: t('workshop.settingsPanel.tabs.orderStatuses'), visible: true },
    { value: 'rodzaje', label: t('workshop.settingsPanel.tabs.orderTypes'), visible: true },
    { value: 'szablony', label: t('workshop.settingsPanel.tabs.taskTemplates'), visible: true },
    { value: 'listy-kontrolne', label: t('workshop.settingsPanel.tabs.checklists'), visible: true },
    { value: 'numeracja', label: t('workshop.settingsPanel.tabs.numbering'), visible: true },
    { value: 'integracje', label: t('workshop.settingsPanel.tabs.integrations'), visible: true },
    { value: 'powiadomienia', label: t('workshop.settingsPanel.tabs.notifications'), visible: true },
    { value: 'rido-price', label: t('workshop.settingsPanel.tabs.ridoPrice'), visible: true },
  ];

  return (
    <div className="space-y-6">
      <UniversalSubTabBar activeTab={settingsTab} onTabChange={setSettingsTab} tabs={settingsSubTabs} />

      {settingsTab === 'konto' && (
        <div className="space-y-6">
            <Card className="border-dashed">
              <CardContent className="pt-6 space-y-4">
                <div>
                  <h3 className="font-semibold">{t('workshop.settingsPanel.mainMenu')}</h3>
                  <p className="text-sm text-muted-foreground">{t('workshop.settingsPanel.mainMenuDesc')}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {SERVICE_PROVIDER_TAB_ORDER.filter(tab => tab !== 'settings' && (websiteBuilderEnabled || tab !== 'website')).map((tab, idx) => (
                    <label key={tab} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                      <Checkbox
                        checked={primaryTabs.includes(tab)}
                        onCheckedChange={(checked) => handlePrimaryTabToggle(tab, checked === true)}
                      />
                      <span className="text-sm font-medium flex-1">{t(SERVICE_PROVIDER_TAB_LABEL_KEYS[tab])}</span>
                      {primaryTabs.includes(tab) && (
                        <Select
                          value={String(primaryTabs.indexOf(tab) + 1)}
                          onValueChange={(v) => {
                            const newIdx = parseInt(v) - 1;
                            setPrimaryTabs(prev => {
                              const filtered = prev.filter(t => t !== tab);
                              filtered.splice(Math.min(newIdx, filtered.length), 0, tab);
                              return [...filtered];
                            });
                          }}
                        >
                          <SelectTrigger className="w-16 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {primaryTabs.map((_, i) => (
                              <SelectItem key={i} value={String(i + 1)}>{i + 1}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </label>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button type="button" variant="outline" onClick={handleSavePrimaryTabs}>{t('workshop.settingsPanel.saveBarLayout')}</Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label>{t('workshop.settingsPanel.accountType')}</Label>
              <Select value={settingsForm.business_type} onValueChange={v => setSettingsForm((p: any) => ({ ...p, business_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="firma">{t('workshop.settingsPanel.company')}</SelectItem>
                  <SelectItem value="osoba">{t('workshop.settingsPanel.individual')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {settingsForm.business_type === 'firma' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>{t('workshop.settingsPanel.companyName')}</Label><Input value={settingsForm.company_name} onChange={e => setSettingsForm((p: any) => ({ ...p, company_name: e.target.value }))} placeholder={t('workshop.settingsPanel.companyNamePlaceholder')} /></div>
                  <div className="space-y-2">
                    <Label>NIP</Label>
                    <div className="flex gap-2">
                      <Input value={settingsForm.nip} onChange={e => setSettingsForm((p: any) => ({ ...p, nip: e.target.value }))} placeholder="0000000000" className="flex-1" />
                      <Button variant="outline" size="icon" onClick={handleNipSearch} disabled={nipSearching} title={t('workshop.settingsPanel.nipSearchTooltip')}>
                        {nipSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>{t('workshop.settingsPanel.shortName')}</Label><Input value={settingsForm.short_name || ''} onChange={e => setSettingsForm((p: any) => ({ ...p, short_name: e.target.value }))} placeholder={t('workshop.settingsPanel.shortNamePlaceholder')} /></div>
                  <div className="space-y-2"><Label>{t('workshop.settingsPanel.address')}</Label><Input value={settingsForm.address} onChange={e => setSettingsForm((p: any) => ({ ...p, address: e.target.value }))} placeholder="ul. Przykładowa 1" /></div>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('workshop.settingsPanel.postalCodeCity')}</Label>
                <div className="flex gap-2">
                  <Input value={settingsForm.postal_code} onChange={e => setSettingsForm((p: any) => ({ ...p, postal_code: e.target.value }))} placeholder="00-000" maxLength={6} className="w-28" />
                  <Input value={settingsForm.city} onChange={e => setSettingsForm((p: any) => ({ ...p, city: e.target.value }))} placeholder={t('workshop.settingsPanel.cityPlaceholder')} className="flex-1" />
                </div>
              </div>
              <div className="space-y-2"><Label>{t('workshop.settingsPanel.phone')}</Label><Input value={settingsForm.phone} onChange={e => setSettingsForm((p: any) => ({ ...p, phone: e.target.value }))} placeholder="+48 000 000 000" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t('workshop.settingsPanel.firstName')}</Label><Input value={settingsForm.first_name} onChange={e => setSettingsForm((p: any) => ({ ...p, first_name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>{t('workshop.settingsPanel.lastName')}</Label><Input value={settingsForm.last_name} onChange={e => setSettingsForm((p: any) => ({ ...p, last_name: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t('workshop.settingsPanel.email')}</Label><Input type="email" value={settingsForm.email} onChange={e => setSettingsForm((p: any) => ({ ...p, email: e.target.value }))} /></div>
              <div className="space-y-2"><Label>{t('workshop.settingsPanel.website')}</Label><Input value={settingsForm.website} onChange={e => setSettingsForm((p: any) => ({ ...p, website: e.target.value }))} placeholder="https://warsztat.pl" /></div>
            </div>
            <div className="space-y-2"><Label>{t('workshop.settingsPanel.bankAccount')}</Label><Input value={settingsForm.bank_account || ''} onChange={e => setSettingsForm((p: any) => ({ ...p, bank_account: e.target.value }))} placeholder="PL 00 0000 0000 0000 0000 0000 0000" /></div>

            {/* Logo upload */}
            <div className="space-y-2">
              <Label>{t('workshop.settingsPanel.companyLogo')}</Label>
              <div
                className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragOver ? 'border-primary bg-primary/10' : logoFile || settingsForm.logo_url ? 'border-primary/30 bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }`}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
                onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
                onDrop={handleLogoDrop}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/png,image/jpeg';
                  input.onchange = (ev: any) => {
                    const file = ev.target.files?.[0];
                    if (file && file.size <= 2 * 1024 * 1024) setLogoFile(file);
                    else if (file) toast.error(t('workshop.settingsPanel.fileMax2mb'));
                  };
                  input.click();
                }}
              >
                {(logoFile || settingsForm.logo_url) ? (
                  <div className="flex items-center justify-center gap-4">
                    <img
                      src={logoFile ? URL.createObjectURL(logoFile) : settingsForm.logo_url}
                      alt={t('workshop.settingsPanel.logoAlt')}
                      className="h-16 w-16 object-contain rounded border"
                    />
                    <div className="text-left">
                      <p className="text-sm font-medium">{logoFile ? logoFile.name : t('workshop.settingsPanel.currentLogo')}</p>
                      <p className="text-xs text-muted-foreground">{t('workshop.settingsPanel.clickOrDragToChange')}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={e => { e.stopPropagation(); setLogoFile(null); setSettingsForm((p: any) => ({ ...p, logo_url: '' })); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="py-2">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{t('workshop.settingsPanel.logoDropzone')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('workshop.settingsPanel.logoFormats')}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2"><Label>{t('workshop.settingsPanel.businessDescription')}</Label><Textarea rows={3} value={settingsForm.bio} onChange={e => setSettingsForm((p: any) => ({ ...p, bio: e.target.value }))} placeholder={t('workshop.settingsPanel.businessDescriptionPlaceholder')} /></div>
            <div className="flex justify-end">
              <Button className="gap-2" onClick={handleSaveSettings} disabled={savingSettings}>
                {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('workshop.settingsPanel.saveSettings')}
              </Button>
            </div>
          </div>
        )}

        {/* Stara wbudowana tabela pracowników została usunięta — pełną listę renderuje <WorkshopEmployeesPage /> poniżej */}

        {settingsTab === 'stanowiska' && (() => {
          const wsCategories: string[] = Array.from(new Set<string>(workstations.map((w: any) => (w.category as string) || 'Warsztat')));
          if (wsCategories.length === 0) wsCategories.push('Warsztat');
          const currentCat: string = wsCategories.includes(activeWsCategory) ? activeWsCategory : wsCategories[0];
          const filteredWs = workstations.filter((w: any) => (w.category || 'Warsztat') === currentCat);
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{t('workshop.settingsPanel.workstations.title')}</h3>
                  <p className="text-sm text-muted-foreground">{t('workshop.settingsPanel.workstations.subtitle')}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowAddCategory(true)} className="gap-2">
                    <Plus className="h-4 w-4" /> {t('workshop.settingsPanel.workstations.category')}
                  </Button>
                  <Button onClick={() => { setWsCategory(currentCat); setShowAddWorkstation(true); }} className="gap-2">
                    <Plus className="h-4 w-4" /> {t('workshop.settingsPanel.workstations.addWorkstation')}
                  </Button>
                </div>
              </div>

              {/* Pill-tabs kategorii */}
              <div className="flex gap-2 flex-wrap border-b pb-2">
                {wsCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveWsCategory(cat)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      currentCat === cat
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground hover:bg-muted/80'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {filteredWs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Monitor className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>{t('workshop.settingsPanel.workstations.emptyInCategory', { category: currentCat })}</p>
                  <p className="text-sm">{t('workshop.settingsPanel.workstations.emptyHint')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredWs.map((ws: any) => (
                    <div key={ws.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Monitor className="h-5 w-5 text-primary" />
                        <span className="font-medium">{ws.name}</span>
                        <Badge variant="secondary" className="text-xs">{ws.category || 'Warsztat'}</Badge>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeWorkstationMut.mutate(ws.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <Dialog open={showAddWorkstation} onOpenChange={setShowAddWorkstation}>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t('workshop.settingsPanel.workstations.addDialogTitle')}</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t('workshop.settingsPanel.workstations.categoryLabel')}</Label>
                      <Select value={wsCategory} onValueChange={setWsCategory}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {wsCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('workshop.settingsPanel.workstations.nameLabel')}</Label>
                      <Input value={wsName} onChange={e => setWsName(e.target.value)} placeholder={t('workshop.settingsPanel.workstations.namePlaceholder')} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowAddWorkstation(false)}>{t('common.cancel')}</Button>
                    <Button onClick={handleAddWorkstation} disabled={!wsName.trim()}>{t('workshop.settingsPanel.add')}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={showAddCategory} onOpenChange={setShowAddCategory}>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t('workshop.settingsPanel.workstations.newCategoryTitle')}</DialogTitle></DialogHeader>
                  <div className="space-y-2">
                    <Label>{t('workshop.settingsPanel.workstations.categoryNameLabel')}</Label>
                    <Input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder={t('workshop.settingsPanel.workstations.categoryNamePlaceholder')} />
                    <p className="text-xs text-muted-foreground">{t('workshop.settingsPanel.workstations.categoryHint')}</p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowAddCategory(false)}>{t('common.cancel')}</Button>
                    <Button
                      onClick={() => {
                        if (!newCategoryName.trim()) return;
                        const cat = newCategoryName.trim();
                        addWorkstationMut.mutate({ name: `${cat} 1`, category: cat });
                        setActiveWsCategory(cat);
                        setNewCategoryName('');
                        setShowAddCategory(false);
                      }}
                      disabled={!newCategoryName.trim()}
                    >
                      {t('workshop.settingsPanel.add')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          );
        })()}

        {settingsTab === 'warsztat' && (
          <WorkshopSettingsPage />
        )}

        {settingsTab === 'pracownicy' && (
          <WorkshopEmployeesPage providerId={providerId} />
        )}


        {settingsTab === 'kalendarz' && (
          <CalendarSettingsPage providerId={providerId} />
        )}

        {settingsTab === 'statusy' && <OrderStatusesPage providerId={providerId || undefined} />}

        {settingsTab === 'rodzaje' && <OrderTypesPage />}

        {settingsTab === 'szablony' && <TaskTemplatesPage />}

        {settingsTab === 'listy-kontrolne' && <ChecklistItemsPage />}

        {settingsTab === 'numeracja' && (
          <DocumentNumberingPage />
        )}

        {settingsTab === 'integracje' && (
          <div className="space-y-6">
            {providerId ? (
              <WorkshopPartsIntegrationsSettings providerId={providerId} />
            ) : (
              <p className="text-center py-8 text-muted-foreground">{t('workshop.settingsPanel.noProvider')}</p>
            )}
          </div>
        )}

        {settingsTab === 'powiadomienia' && (
          <NotificationsSettings
            visibleModules={['warsztat', 'ksef']}
            userEmail={settingsForm?.email}
            userPhone={settingsForm?.phone}
          />
        )}

        {settingsTab === 'rido-price' && (
          <div className="space-y-6">
            {providerId ? (
              <RidoPriceSettingsTab providerId={providerId} />
            ) : (
              <p className="text-center py-8 text-muted-foreground">{t('workshop.settingsPanel.noProvider')}</p>
            )}
          </div>
        )}
    </div>
  );
}
