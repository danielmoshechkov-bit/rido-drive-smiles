import { useEffect, useState } from 'react';
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
import { Save, Plus, Trash2, Users, Building2, Monitor, UserPlus, Sparkles } from 'lucide-react';
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
import { DEFAULT_SERVICE_PROVIDER_PRIMARY_TABS, SERVICE_PROVIDER_TAB_LABELS, SERVICE_PROVIDER_TAB_ORDER, type ServiceProviderNavTabKey } from '@/components/service-provider/navConfig';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SettingsPanelProps {
  providerId: string | null;
  settingsForm: any;
  setSettingsForm: (fn: (prev: any) => any) => void;
  websiteBuilderEnabled?: boolean;
  onPrimaryTabsSaved?: (tabs: string[]) => void;
}

export function SettingsPanel({ providerId, settingsForm, setSettingsForm, websiteBuilderEnabled = false, onPrimaryTabsSaved }: SettingsPanelProps) {
  const [settingsTab, setSettingsTab] = useState('konto');
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showAddWorkstation, setShowAddWorkstation] = useState(false);
  const [empForm, setEmpForm] = useState({ name: '', phone: '', email: '', salary: '' });
  const [wsName, setWsName] = useState('');
  const [primaryTabs, setPrimaryTabs] = useState<ServiceProviderNavTabKey[]>(DEFAULT_SERVICE_PROVIDER_PRIMARY_TABS);
  const queryClient = useQueryClient();

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
      toast.success('Pracownik dodany');
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
      toast.success('Pracownik usunięty');
    },
  });

  const addWorkstationMut = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await (supabase as any)
        .from('workshop_workstations')
        .insert({ provider_id: providerId, name, sort_order: workstations.length });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-workstations'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-workstations'] });
      queryClient.invalidateQueries({ queryKey: ['workshop-workstations'] });
      toast.success('Stanowisko dodane');
    },
    onError: (e: any) => toast.error(e.message),
  });

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
      toast.success('Stanowisko usunięte');
    },
  });

  const handleSaveSettings = async () => {
    if (!providerId) return;
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
      })
      .eq('id', providerId);
    if (error) {
      toast.error('Błąd zapisu: ' + error.message);
    } else {
      toast.success('Ustawienia zapisane');
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

  const handleAddWorkstation = () => {
    if (!wsName.trim()) return;
    addWorkstationMut.mutate(wsName.trim());
    setWsName('');
    setShowAddWorkstation(false);
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
      toast.error('Nie udało się zapisać układu paska');
      return;
    }

    onPrimaryTabsSaved?.(nextPrimaryTabs);
    queryClient.invalidateQueries({ queryKey: ['nav-preferences'] });
    toast.success('Układ paska zapisany');
  };

  const settingsSubTabs = [
    { value: 'konto', label: 'Konto i firma', visible: true },
    { value: 'warsztat', label: 'Warsztat', visible: true },
    { value: 'pracownicy', label: 'Pracownicy', visible: true },
    { value: 'stanowiska', label: 'Stanowiska', visible: true },
    { value: 'kalendarz', label: 'Kalendarz', visible: true },
    { value: 'statusy', label: 'Statusy zleceń', visible: true },
    { value: 'rodzaje', label: 'Rodzaje zleceń', visible: true },
    { value: 'szablony', label: 'Szablony zadań', visible: true },
    { value: 'listy-kontrolne', label: 'Listy kontrolne', visible: true },
    { value: 'numeracja', label: 'Numeracja', visible: true },
    { value: 'integracje', label: 'Integracje', visible: true },
    { value: 'rido-price', label: 'Rido Price', visible: true },
  ];

  return (
    <div className="space-y-6">
      <UniversalSubTabBar activeTab={settingsTab} onTabChange={setSettingsTab} tabs={settingsSubTabs} />

      {settingsTab === 'konto' && (
        <div className="space-y-6">
            <Card className="border-dashed">
              <CardContent className="pt-6 space-y-4">
                <div>
                  <h3 className="font-semibold">Menu główne</h3>
                  <p className="text-sm text-muted-foreground">Wybierz, które moduły mają być widoczne bezpośrednio na pasku. Pozostałe trafią do zakładki „Więcej”.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {SERVICE_PROVIDER_TAB_ORDER.filter(tab => tab !== 'settings' && (websiteBuilderEnabled || tab !== 'website')).map((tab, idx) => (
                    <label key={tab} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                      <Checkbox
                        checked={primaryTabs.includes(tab)}
                        onCheckedChange={(checked) => handlePrimaryTabToggle(tab, checked === true)}
                      />
                      <span className="text-sm font-medium flex-1">{SERVICE_PROVIDER_TAB_LABELS[tab]}</span>
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
                  <Button type="button" variant="outline" onClick={handleSavePrimaryTabs}>Zapisz układ paska</Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label>Typ konta</Label>
              <Select value={settingsForm.business_type} onValueChange={v => setSettingsForm((p: any) => ({ ...p, business_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="firma">Firma</SelectItem>
                  <SelectItem value="osoba">Osoba prywatna</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {settingsForm.business_type === 'firma' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Nazwa firmy</Label><Input value={settingsForm.company_name} onChange={e => setSettingsForm((p: any) => ({ ...p, company_name: e.target.value }))} /></div>
                <div className="space-y-2"><Label>NIP</Label><Input value={settingsForm.nip} onChange={e => setSettingsForm((p: any) => ({ ...p, nip: e.target.value }))} placeholder="0000000000" /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Imię</Label><Input value={settingsForm.first_name} onChange={e => setSettingsForm((p: any) => ({ ...p, first_name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Nazwisko</Label><Input value={settingsForm.last_name} onChange={e => setSettingsForm((p: any) => ({ ...p, last_name: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={settingsForm.email} onChange={e => setSettingsForm((p: any) => ({ ...p, email: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Telefon</Label><Input value={settingsForm.phone} onChange={e => setSettingsForm((p: any) => ({ ...p, phone: e.target.value }))} placeholder="+48 000 000 000" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Adres</Label><Input value={settingsForm.address} onChange={e => setSettingsForm((p: any) => ({ ...p, address: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Miasto</Label><Input value={settingsForm.city} onChange={e => setSettingsForm((p: any) => ({ ...p, city: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Kod pocztowy</Label><Input value={settingsForm.postal_code} onChange={e => setSettingsForm((p: any) => ({ ...p, postal_code: e.target.value }))} placeholder="00-000" /></div>
            </div>
            <div className="space-y-2"><Label>Strona WWW</Label><Input value={settingsForm.website} onChange={e => setSettingsForm((p: any) => ({ ...p, website: e.target.value }))} placeholder="https://" /></div>
            <div className="space-y-2"><Label>Opis działalności</Label><Textarea rows={3} value={settingsForm.bio} onChange={e => setSettingsForm((p: any) => ({ ...p, bio: e.target.value }))} placeholder="Krótki opis Twojej firmy..." /></div>
            <div className="flex justify-end">
              <Button className="gap-2" onClick={handleSaveSettings}><Save className="h-4 w-4" /> Zapisz ustawienia</Button>
            </div>
          </div>
        )}

        {settingsTab === 'pracownicy' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Pracownicy</h3>
                <p className="text-sm text-muted-foreground">Zarządzaj zespołem — pracownicy widoczni w kalendarzu</p>
              </div>
              <Button onClick={() => setShowAddEmployee(true)} className="gap-2">
                <UserPlus className="h-4 w-4" /> Dodaj pracownika
              </Button>
            </div>
            {employees.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Brak pracowników</p>
                <p className="text-sm">Dodaj pracowników, aby przypisywać ich do zdarzeń w kalendarzu</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Imię i nazwisko</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Pensja</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((emp: any) => (
                    <TableRow key={emp.id}>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell>{emp.phone || '—'}</TableCell>
                      <TableCell>{emp.email || '—'}</TableCell>
                      <TableCell className="text-right">{emp.salary ? `${emp.salary} zł` : '—'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeEmployeeMut.mutate(emp.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <Dialog open={showAddEmployee} onOpenChange={setShowAddEmployee}>
              <DialogContent>
                <DialogHeader><DialogTitle>Dodaj pracownika</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Imię i nazwisko *</Label>
                    <Input value={empForm.name} onChange={e => setEmpForm(p => ({ ...p, name: e.target.value }))} placeholder="Jan Kowalski" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Telefon</Label><Input value={empForm.phone} onChange={e => setEmpForm(p => ({ ...p, phone: e.target.value }))} placeholder="+48..." /></div>
                    <div className="space-y-2"><Label>Email</Label><Input type="email" value={empForm.email} onChange={e => setEmpForm(p => ({ ...p, email: e.target.value }))} /></div>
                  </div>
                  <div className="space-y-2"><Label>Pensja (zł/mies.)</Label><Input type="number" value={empForm.salary} onChange={e => setEmpForm(p => ({ ...p, salary: e.target.value }))} placeholder="0" /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddEmployee(false)}>Anuluj</Button>
                  <Button onClick={handleAddEmployee} disabled={!empForm.name.trim()}>Dodaj</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {settingsTab === 'stanowiska' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Stanowiska robocze</h3>
                <p className="text-sm text-muted-foreground">Stanowiska widoczne w kalendarzu i terminarzu</p>
              </div>
              <Button onClick={() => setShowAddWorkstation(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Dodaj stanowisko
              </Button>
            </div>
            {workstations.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Monitor className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Brak stanowisk</p>
                <p className="text-sm">Dodaj stanowiska robocze (np. Podnośnik 1, Stanowisko detailingowe)</p>
              </div>
            ) : (
              <div className="space-y-2">
                {workstations.map((ws: any) => (
                  <div key={ws.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Monitor className="h-5 w-5 text-primary" />
                      <span className="font-medium">{ws.name}</span>
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
                <DialogHeader><DialogTitle>Dodaj stanowisko</DialogTitle></DialogHeader>
                <div className="space-y-2">
                  <Label>Nazwa stanowiska *</Label>
                  <Input value={wsName} onChange={e => setWsName(e.target.value)} placeholder="np. Podnośnik 1, Stanowisko detailingowe" />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddWorkstation(false)}>Anuluj</Button>
                  <Button onClick={handleAddWorkstation} disabled={!wsName.trim()}>Dodaj</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {settingsTab === 'warsztat' && (
          <WorkshopSettingsPage />
        )}

        {settingsTab === 'pracownicy' && (
          <WorkshopEmployeesPage providerId={providerId} />
        )}


        {settingsTab === 'kalendarz' && (
          <CalendarSettingsPage providerId={providerId} />
        )}

        {settingsTab === 'statusy' && <OrderStatusesPage />}

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
              <p className="text-center py-8 text-muted-foreground">Brak providera</p>
            )}
          </div>
        )}

        {settingsTab === 'rido-price' && (
          <div className="space-y-6">
            {providerId ? (
              <RidoPriceSettingsTab providerId={providerId} />
            ) : (
              <p className="text-center py-8 text-muted-foreground">Brak providera</p>
            )}
          </div>
        )}
    </div>
  );
}
