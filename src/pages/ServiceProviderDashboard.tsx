import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { UniversalHomeButton } from '@/components/UniversalHomeButton';
import { MyGetRidoButton } from '@/components/MyGetRidoButton';
import { AccountSwitcherPanel } from '@/components/AccountSwitcherPanel';
import { TabsPill } from '@/components/ui/TabsPill';
import { TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUserRole } from '@/hooks/useUserRole';
import { useFeatureToggles } from '@/hooks/useFeatureToggles';
import { WebsiteBuilderWizard } from '@/components/website-builder/WebsiteBuilderWizard';
import { WorkshopDashboard } from '@/components/workshop/WorkshopDashboard';
import { SettingsPanel } from '@/components/workshop/SettingsPanel';
import { CalendarView } from '@/components/calendar/CalendarView';
import { AgentTypeSelector } from '@/components/ai-agents/AgentTypeSelector';
import { KnowledgeBaseEditor } from '@/components/ai-agents/KnowledgeBaseEditor';
import { ConversationAnalytics } from '@/components/ai-agents/ConversationAnalytics';
import { GlobalLearningPanel } from '@/components/ai-agents/GlobalLearningPanel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  LayoutDashboard, Wrench, Calendar, ClipboardList, Settings, Phone,
  Users, Clock, Star, Globe, Bot, Hammer, Plus, Trash2, Edit, Save, Image,
  Upload, X, ImageIcon
} from 'lucide-react';
import { toast } from 'sonner';

interface ServiceItem {
  id: string;
  name: string;
  short_description: string;
  description: string;
  price_from: number;
  price_to: number;
  category: string;
  is_active: boolean;
  photos: string[];
}

export default function ServiceProviderDashboard() {
  const navigate = useNavigate();
  const { roles, loading: roleLoading } = useUserRole();
  const { features } = useFeatureToggles();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [configData, setConfigData] = useState<any>(null);
  const [selectedAgentType, setSelectedAgentType] = useState<string | null>(null);
  const [aiAgentSubTab, setAiAgentSubTab] = useState<'overview' | 'knowledge' | 'analytics' | 'learning'>('overview');
  const [providerId, setProviderId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalBookings: 0,
    pendingBookings: 0,
    completedThisMonth: 0,
    averageRating: 0
  });

  // Services state
  const [serviceDialog, setServiceDialog] = useState(false);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [serviceForm, setServiceForm] = useState({
    name: '', short_description: '', description: '', price_from: '', price_to: '', category: 'ogolne', is_active: true
  });
  const [servicePhotos, setServicePhotos] = useState<File[]>([]);
  const serviceFileRef = useRef<HTMLInputElement>(null);
  const [isDraggingService, setIsDraggingService] = useState(false);

  // Settings state
  const [settingsForm, setSettingsForm] = useState({
    business_type: 'firma', company_name: '', first_name: '', last_name: '',
    email: '', phone: '', address: '', city: '', postal_code: '', nip: '', website: '', bio: ''
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    if (roleLoading) return;
    const isServiceProvider = roles.some(r => r === 'service_provider');
    if (!isServiceProvider) {
      toast.error('Brak uprawnień do panelu usługodawcy');
      navigate('/auth');
      return;
    }
    checkAuth();
  }, [roleLoading, roles]);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate('/auth'); return; }
    setUser(user);

    const { data: config } = await supabase
      .from('ai_agent_configs')
      .select('*, ai_call_business_profiles(*)')
      .eq('user_id', user.id)
      .single();
    if (config) setConfigData(config);

    const { data: provider } = await supabase
      .from('service_providers')
      .select('id, rating_avg, rating_count, company_name, description, company_phone, company_address, company_city, company_postal_code, company_nip, company_website, owner_first_name, owner_last_name, owner_email')
      .eq('user_id', user.id)
      .maybeSingle();

    if (provider) {
      setProviderId(provider.id);
      const { count: totalCount } = await supabase
        .from('booking_appointments')
        .select('*', { count: 'exact', head: true })
        .eq('provider_id', provider.id);
      const { count: pendingCount } = await supabase
        .from('booking_appointments')
        .select('*', { count: 'exact', head: true })
        .eq('provider_id', provider.id)
        .eq('status', 'pending');
      setStats({
        totalBookings: totalCount || 0,
        pendingBookings: pendingCount || 0,
        completedThisMonth: 0,
        averageRating: provider.rating_avg || 0
      });

      setSettingsForm(prev => ({
        ...prev,
        company_name: provider.company_name || '',
        first_name: provider.owner_first_name || '',
        last_name: provider.owner_last_name || '',
        email: provider.owner_email || user.email || '',
        phone: provider.company_phone || '',
        address: provider.company_address || '',
        city: provider.company_city || '',
        postal_code: provider.company_postal_code || '',
        nip: provider.company_nip || '',
        website: provider.company_website || '',
        bio: provider.description || '',
      }));
    }

    setLoading(false);
  };

  // ---- DB-backed services ----
  const { data: services = [] } = useQuery({
    queryKey: ['provider-services', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('provider_services')
        .select('*')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ServiceItem[];
    },
  });

  const createServiceMut = useMutation({
    mutationFn: async (svc: any) => {
      const { error } = await (supabase as any)
        .from('provider_services')
        .insert({ ...svc, provider_id: providerId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-services'] });
      toast.success('Usługa dodana');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateServiceMut = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { error } = await (supabase as any)
        .from('provider_services')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-services'] });
      toast.success('Usługa zaktualizowana');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteServiceMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('provider_services')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-services'] });
      toast.success('Usługa usunięta');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSaveService = async () => {
    if (!serviceForm.name || !providerId) {
      toast.error('Podaj nazwę usługi');
      return;
    }

    try {
      // Upload photos
      const photoUrls: string[] = editingService?.photos || [];
      for (const file of servicePhotos) {
        const ext = file.name.split('.').pop();
        const path = `services/${providerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('documents').upload(path, file);
        if (uploadErr) {
          console.error('Upload error:', uploadErr);
          continue;
        }
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
        photoUrls.push(urlData.publicUrl);
      }

      const svcData = {
        name: serviceForm.name,
        short_description: serviceForm.short_description,
        description: serviceForm.description,
        price_from: parseFloat(serviceForm.price_from) || 0,
        price_to: parseFloat(serviceForm.price_to) || 0,
        category: serviceForm.category,
        is_active: serviceForm.is_active,
        photos: photoUrls,
      };

      if (editingService) {
        await updateServiceMut.mutateAsync({ id: editingService.id, ...svcData });
      } else {
        await createServiceMut.mutateAsync(svcData);
      }
      setServiceDialog(false);
      resetServiceForm();
    } catch (err: any) {
      console.error('Save service error:', err);
      toast.error('Błąd zapisu: ' + (err?.message || 'Spróbuj ponownie'));
    }
  };

  const resetServiceForm = () => {
    setEditingService(null);
    setServicePhotos([]);
    setServiceForm({ name: '', short_description: '', description: '', price_from: '', price_to: '', category: 'ogolne', is_active: true });
  };

  const openEditService = (service: ServiceItem) => {
    setEditingService(service);
    setServicePhotos([]);
    setServiceForm({
      name: service.name,
      short_description: service.short_description || '',
      description: service.description || '',
      price_from: service.price_from?.toString() || '',
      price_to: service.price_to?.toString() || '',
      category: service.category || 'ogolne',
      is_active: service.is_active,
    });
    setServiceDialog(true);
  };

  const handleServiceFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingService(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    setServicePhotos(prev => [...prev, ...files].slice(0, 10));
  }, []);

  const handleServiceFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
      setServicePhotos(prev => [...prev, ...files].slice(0, 10));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <UniversalHomeButton />
            <div className="hidden sm:block">
              <h1 className="font-semibold text-lg">Panel Usługodawcy</h1>
              <p className="text-xs text-muted-foreground">
                {configData?.company_name || settingsForm.company_name || 'Twoja firma'}
              </p>
            </div>
          </div>
          <MyGetRidoButton user={user} />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <TabsPill value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsTrigger value="dashboard">
            <LayoutDashboard className="h-4 w-4 mr-1.5" />
            Pulpit
          </TabsTrigger>
          <TabsTrigger value="services">
            <Wrench className="h-4 w-4 mr-1.5" />
            Moje usługi
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <Calendar className="h-4 w-4 mr-1.5" />
            Kalendarz
          </TabsTrigger>
          <TabsTrigger value="bookings">
            <ClipboardList className="h-4 w-4 mr-1.5" />
            Rezerwacje
          </TabsTrigger>
          <TabsTrigger value="workshop">
            <Hammer className="h-4 w-4 mr-1.5" />
            Zarządzanie
          </TabsTrigger>
          <TabsTrigger value="ai-agent">
            <Bot className="h-4 w-4 mr-1.5" />
            AI Agenci
          </TabsTrigger>
          {features.website_builder_enabled && (
            <TabsTrigger value="website">
              <Globe className="h-4 w-4 mr-1.5" />
              Strona WWW
            </TabsTrigger>
          )}
          <TabsTrigger value="account">
            <Users className="h-4 w-4 mr-1.5" />
            Wybierz moduł
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-1.5" />
            Ustawienia
          </TabsTrigger>

          {/* Pulpit / Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Wszystkie rezerwacje</CardTitle></CardHeader>
                <CardContent><div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" /><span className="text-2xl font-bold">{stats.totalBookings}</span></div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Oczekujące</CardTitle></CardHeader>
                <CardContent><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-yellow-500" /><span className="text-2xl font-bold">{stats.pendingBookings}</span></div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Średnia ocena</CardTitle></CardHeader>
                <CardContent><div className="flex items-center gap-2"><Star className="h-5 w-5 text-yellow-400 fill-yellow-400" /><span className="text-2xl font-bold">{stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '-'}</span></div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">AI Agent</CardTitle></CardHeader>
                <CardContent><div className="flex items-center gap-2"><Phone className="h-5 w-5 text-primary" /><Badge variant={configData?.is_active ? 'default' : 'secondary'}>{configData?.is_active ? 'Aktywny' : 'Nieaktywny'}</Badge></div></CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader><CardTitle>Szybkie akcje</CardTitle><CardDescription>Najczęściej używane funkcje</CardDescription></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Button variant="outline" onClick={() => setActiveTab('bookings')}><ClipboardList className="h-4 w-4 mr-2" />Rezerwacje</Button>
                <Button variant="outline" onClick={() => setActiveTab('calendar')}><Calendar className="h-4 w-4 mr-2" />Kalendarz</Button>
                <Button variant="outline" onClick={() => setActiveTab('ai-agent')}><Phone className="h-4 w-4 mr-2" />AI Agent</Button>
                <Button variant="outline" onClick={() => setActiveTab('services')}><Wrench className="h-4 w-4 mr-2" />Usługi</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Services Tab */}
          <TabsContent value="services" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Moje usługi</CardTitle>
                    <CardDescription>Zarządzaj listą świadczonych usług — widoczne w portalu dla klientów</CardDescription>
                  </div>
                  <Button onClick={() => { resetServiceForm(); setServiceDialog(true); }} className="gap-2">
                    <Plus className="h-4 w-4" /> Dodaj usługę
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {services.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Wrench className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p className="font-medium">Brak usług</p>
                    <p className="text-sm">Dodaj pierwszą usługę, która pojawi się na Twoim profilu w portalu</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nazwa usługi</TableHead>
                        <TableHead>Kategoria</TableHead>
                        <TableHead className="text-right">Cena od</TableHead>
                        <TableHead className="text-right">Cena do</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {services.map((service: ServiceItem) => (
                        <TableRow key={service.id}>
                          <TableCell className="font-medium">{service.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{service.category}</TableCell>
                          <TableCell className="text-right">{service.price_from} zł</TableCell>
                          <TableCell className="text-right">{service.price_to > 0 ? `${service.price_to} zł` : '—'}</TableCell>
                          <TableCell>
                            <Badge variant={service.is_active ? 'default' : 'secondary'}>
                              {service.is_active ? 'Aktywna' : 'Nieaktywna'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditService(service)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteServiceMut.mutate(service.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Service Add/Edit Dialog */}
            <Dialog open={serviceDialog} onOpenChange={setServiceDialog}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingService ? 'Edytuj usługę' : 'Dodaj nową usługę'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                  <div className="space-y-2">
                    <Label>Nazwa usługi *</Label>
                    <Input value={serviceForm.name} onChange={e => setServiceForm(p => ({ ...p, name: e.target.value }))} placeholder="np. Wymiana oleju, Korekta lakieru" />
                  </div>
                  <div className="space-y-2">
                    <Label>Krótki opis</Label>
                    <Input value={serviceForm.short_description} onChange={e => setServiceForm(p => ({ ...p, short_description: e.target.value }))} placeholder="Krótkie podsumowanie widoczne na liście" />
                  </div>
                  <div className="space-y-2">
                    <Label>Pełny opis</Label>
                    <Textarea rows={4} value={serviceForm.description} onChange={e => setServiceForm(p => ({ ...p, description: e.target.value }))} placeholder="Szczegółowy opis usługi..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Cena od (zł)</Label>
                      <Input type="number" value={serviceForm.price_from} onChange={e => setServiceForm(p => ({ ...p, price_from: e.target.value }))} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label>Cena do (zł)</Label>
                      <Input type="number" value={serviceForm.price_to} onChange={e => setServiceForm(p => ({ ...p, price_to: e.target.value }))} placeholder="0" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Kategoria</Label>
                    <Select value={serviceForm.category} onValueChange={v => setServiceForm(p => ({ ...p, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ogolne">Ogólne</SelectItem>
                        <SelectItem value="mechanika">Mechanika</SelectItem>
                        <SelectItem value="detailing">Detailing</SelectItem>
                        <SelectItem value="lakiernictwo">Lakiernictwo</SelectItem>
                        <SelectItem value="elektryka">Elektryka</SelectItem>
                        <SelectItem value="opony">Opony / Wulkanizacja</SelectItem>
                        <SelectItem value="diagnostyka">Diagnostyka</SelectItem>
                        <SelectItem value="inne">Inne</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Zdjęcia usługi</Label>
                    <div
                      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${isDraggingService ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'}`}
                      onClick={() => serviceFileRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setIsDraggingService(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setIsDraggingService(false); }}
                      onDrop={handleServiceFileDrop}
                    >
                      <Upload className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm text-muted-foreground">Przeciągnij zdjęcia lub <span className="text-primary font-medium">kliknij aby wybrać</span></p>
                      <input ref={serviceFileRef} type="file" multiple accept="image/*" className="hidden" onChange={handleServiceFileSelect} />
                    </div>
                    {/* Show existing photos */}
                    {editingService?.photos && editingService.photos.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {editingService.photos.map((url, i) => (
                          <img key={i} src={url} className="h-16 w-16 object-cover rounded" alt="" />
                        ))}
                      </div>
                    )}
                    {/* Show new photos as thumbnails */}
                    {servicePhotos.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {servicePhotos.map((file, idx) => (
                          <div key={idx} className="relative group">
                            <img src={URL.createObjectURL(file)} className="h-16 w-16 object-cover rounded border" alt={file.name} />
                            <button
                              onClick={() => setServicePhotos(prev => prev.filter((_, i) => i !== idx))}
                              className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-4 w-4 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={serviceForm.is_active} onCheckedChange={v => setServiceForm(p => ({ ...p, is_active: v }))} />
                    <Label>Usługa aktywna (widoczna w portalu)</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setServiceDialog(false)}>Anuluj</Button>
                  <Button onClick={handleSaveService} disabled={!serviceForm.name || createServiceMut.isPending || updateServiceMut.isPending}>
                    <Save className="h-4 w-4 mr-2" />Zapisz
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Calendar Tab */}
          <TabsContent value="calendar" className="mt-6">
            <CalendarView />
          </TabsContent>

          {/* Bookings Tab */}
          <TabsContent value="bookings" className="mt-6">
            <Card>
              <CardHeader><CardTitle>Rezerwacje</CardTitle><CardDescription>Nadchodzące i zakończone zlecenia</CardDescription></CardHeader>
              <CardContent><p className="text-muted-foreground text-center py-8">Brak aktywnych rezerwacji</p></CardContent>
            </Card>
          </TabsContent>

          {/* AI Agent Tab */}
          <TabsContent value="ai-agent" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5" /> AI Agent Telefoniczny</CardTitle>
                <CardDescription>Automatyczna obsługa połączeń przychodzących</CardDescription>
              </CardHeader>
              <CardContent>
                {configData ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between"><span className="font-medium">Status:</span><Badge variant={configData.is_active ? 'default' : 'secondary'}>{configData.is_active ? 'Aktywny' : 'Nieaktywny'}</Badge></div>
                    <div className="flex items-center justify-between"><span className="font-medium">Firma:</span><span>{configData.company_name}</span></div>
                    <Button className="w-full mt-4" onClick={() => setActiveTab('settings')}><Settings className="h-4 w-4 mr-2" /> Konfiguruj AI Agenta</Button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Phone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">AI Agent nie został jeszcze skonfigurowany</p>
                    <Button>Rozpocznij konfigurację</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Website Builder Tab */}
          {features.website_builder_enabled && (
            <TabsContent value="website" className="mt-6">
              <WebsiteBuilderWizard />
            </TabsContent>
          )}

          {/* Account Switcher Tab */}
          <TabsContent value="account" className="mt-6">
            <AccountSwitcherPanel
              isDriverAccount={roles.includes('driver')}
              isFleetAccount={roles.includes('fleet_settlement') || roles.includes('fleet_rental')}
              isMarketplaceAccount={roles.includes('marketplace_user')}
              isRealEstateAccount={roles.includes('real_estate_agent') || roles.includes('real_estate_admin')}
              isAdminAccount={roles.includes('admin')}
              isSalesAdmin={roles.includes('sales_admin')}
              isSalesRep={roles.includes('sales_rep')}
              isServiceProvider={true}
              isMarketplaceEnabled={true}
              currentAccountType="service_provider"
              navigate={navigate}
            />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="mt-6 space-y-6">
            <SettingsPanel providerId={providerId} settingsForm={settingsForm} setSettingsForm={setSettingsForm} />
          </TabsContent>

          {/* Workshop Tab */}
          <TabsContent value="workshop" className="mt-6">
            <WorkshopDashboard />
          </TabsContent>
        </TabsPill>
      </main>
    </div>
  );
}
