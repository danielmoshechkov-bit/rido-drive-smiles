import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { UniversalHomeButton } from '@/components/UniversalHomeButton';
import { MyGetRidoButton } from '@/components/MyGetRidoButton';
import { AccountSwitcherPanel } from '@/components/AccountSwitcherPanel';
import { TopBarCredits } from '@/components/TopBarCredits';
import { WorkspaceView } from '@/components/workspace/WorkspaceView';
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
import { WorkshopScheduler } from '@/components/workshop/WorkshopScheduler';
import { SettingsPanel } from '@/components/workshop/SettingsPanel';
import { ServiceProviderAccountingView } from '@/components/service-provider/ServiceProviderAccountingView';
import { DEFAULT_SERVICE_PROVIDER_PRIMARY_TABS, SERVICE_PROVIDER_TAB_ORDER } from '@/components/service-provider/navConfig';
import { CalendarView } from '@/components/calendar/CalendarView';
import { AgentTypeSelector } from '@/components/ai-agents/AgentTypeSelector';
import { AISalesAgentsDashboard } from '@/components/ai-sales/AISalesAgentsDashboard';
import { LeadsTab } from '@/components/leads/LeadsTab';
import { AdsTab } from '@/components/ads/AdsTab';
import { AdOrderModal } from '@/components/ads/AdOrderModal';
import { KnowledgeBaseEditor } from '@/components/ai-agents/KnowledgeBaseEditor';
import { ConversationAnalytics } from '@/components/ai-agents/ConversationAnalytics';
import { GlobalLearningPanel } from '@/components/ai-agents/GlobalLearningPanel';
import { CalendarAIAssistant } from '@/components/calendar/CalendarAIAssistant';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Wrench, Calendar, ClipboardList, Settings, Phone,
  Users, Clock, Star, Globe, Bot, Hammer, Plus, Trash2, Edit, Save, Image,
  Upload, X, ImageIcon, Briefcase, MoreHorizontal, Calculator, ChevronDown,
  Megaphone, Target, ShieldCheck, AlertCircle, CheckCircle2
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UniversalSubTabBar } from '@/components/UniversalSubTabBar';
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
  const { t } = useTranslation();
  const { roles, loading: roleLoading } = useUserRole();
  const { features } = useFeatureToggles();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [configData, setConfigData] = useState<any>(null);
  const [selectedAgentType, setSelectedAgentType] = useState<string | null>(null);
  const [aiAgentSubTab, setAiAgentSubTab] = useState<'overview' | 'knowledge' | 'analytics' | 'learning'>('overview');
  const [providerId, setProviderId] = useState<string | null>(null);
  const [calendarSubTab, setCalendarSubTab] = useState<'calendar' | 'bookings'>('calendar');
  const [moreOpen, setMoreOpen] = useState(false);
  const [primaryTabs, setPrimaryTabs] = useState<string[]>(DEFAULT_SERVICE_PROVIDER_PRIMARY_TABS);
  const [adOrderService, setAdOrderService] = useState<{ id: string; name: string } | null>(null);
  
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
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [activationDialog, setActivationDialog] = useState(false);
  const [activationForm, setActivationForm] = useState({
    company_name: '', description: '', company_phone: '', company_email: '',
    company_city: '', company_address: '', company_postal_code: '', company_nip: '',
    category_id: ''
  });
  const [serviceCategories, setServiceCategories] = useState<any[]>([]);
  const [activationSaving, setActivationSaving] = useState(false);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);

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
      toast.error(t('sp.noPermission'));
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
      .select('id, rating_avg, rating_count, company_name, description, company_phone, company_address, company_city, company_postal_code, company_nip, company_website, owner_first_name, owner_last_name, owner_email, status, category_id, cover_image_url, logo_url')
      .eq('user_id', user.id)
      .maybeSingle();

    // Load service categories for activation form
    const { data: cats } = await supabase
      .from('service_categories')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('sort_order');
    if (cats) setServiceCategories(cats);

    if (provider) {
      setProviderId(provider.id);
      setProviderStatus(provider.status);

      // Pre-fill activation form
      setActivationForm({
        company_name: provider.company_name || '',
        description: provider.description || '',
        company_phone: provider.company_phone || '',
        company_email: provider.owner_email || user.email || '',
        company_city: provider.company_city || '',
        company_address: provider.company_address || '',
        company_postal_code: provider.company_postal_code || '',
        company_nip: provider.company_nip || '',
        category_id: provider.category_id || '',
      });

      const { data: navPreferences } = await (supabase as any)
        .from('service_provider_nav_preferences')
        .select('primary_tabs')
        .eq('provider_id', provider.id)
        .maybeSingle();

      const allowedTabs = SERVICE_PROVIDER_TAB_ORDER.filter(tab => tab !== 'settings' && (features.website_builder_enabled || tab !== 'website'));
      const savedPrimaryTabs = Array.isArray(navPreferences?.primary_tabs)
        ? navPreferences.primary_tabs.filter((tab: string) => allowedTabs.includes(tab as any))
        : [];

      setPrimaryTabs(savedPrimaryTabs.length ? savedPrimaryTabs : DEFAULT_SERVICE_PROVIDER_PRIMARY_TABS.filter(tab => allowedTabs.includes(tab)));

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
      toast.success(t('sp.services.added'));
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
      toast.success(t('sp.services.updated'));
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
      toast.success(t('sp.services.deleted'));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSaveService = async () => {
    if (!serviceForm.name.trim()) {
      toast.error(t('sp.services.enterName'));
      return;
    }
    if (!providerId) {
      toast.error(t('sp.services.noProviderId'));
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
      toast.error(t('sp.services.saveError') + ': ' + (err?.message || ''));
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

  const handleActivateProfile = async () => {
    if (!providerId) return;
    const { company_name, description, company_phone, company_city, category_id } = activationForm;
    if (!company_name.trim() || !description.trim() || !company_phone.trim() || !company_city.trim() || !category_id) {
      toast.error('Uzupełnij wszystkie wymagane pola: nazwa firmy, opis, telefon, miasto i kategoria');
      return;
    }
    setActivationSaving(true);
    try {
      let coverUrl: string | null = null;
      if (coverImageFile) {
        const ext = coverImageFile.name.split('.').pop();
        const path = `providers/${providerId}/logo-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('documents').upload(path, coverImageFile, { upsert: true });
        if (uploadError) throw new Error('Błąd wgrywania logo: ' + uploadError.message);
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
        coverUrl = urlData.publicUrl;
      }
      const updateData: any = {
        company_name: activationForm.company_name,
        description: activationForm.description,
        company_phone: activationForm.company_phone,
        company_email: activationForm.company_email,
        company_city: activationForm.company_city,
        company_address: activationForm.company_address,
        company_postal_code: activationForm.company_postal_code,
        company_nip: activationForm.company_nip,
        category_id: activationForm.category_id,
        status: 'active',
      };
      if (coverUrl) updateData.cover_image_url = coverUrl;
      const { error } = await supabase.from('service_providers').update(updateData).eq('id', providerId);
      if (error) throw error;
      setProviderStatus('active');
      setActivationDialog(false);
      toast.success('Profil aktywowany! Twoje usługi są teraz widoczne w portalu.');
    } catch (err: any) {
      toast.error('Błąd aktywacji: ' + (err?.message || ''));
    } finally {
      setActivationSaving(false);
    }
  };

  const isProfileActive = providerStatus === 'active';

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
              <h1 className="font-semibold text-lg">{t('sp.panel')}</h1>
              <p className="text-xs text-muted-foreground">
                {configData?.company_name || settingsForm.company_name || t('sp.yourCompany')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TopBarCredits />
            <MyGetRidoButton user={user} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <TabsPill value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {primaryTabs.includes('dashboard') && (
             <TabsTrigger value="dashboard">
              <LayoutDashboard className="h-4 w-4 mr-1.5" />
              {t('sp.tabs.dashboard')}
            </TabsTrigger>
          )}
          {primaryTabs.includes('services') && (
            <TabsTrigger value="services">
              <Wrench className="h-4 w-4 mr-1.5" />
              {t('sp.tabs.services')}
            </TabsTrigger>
          )}
          {primaryTabs.includes('workshop') && (
            <TabsTrigger value="workshop">
              <Hammer className="h-4 w-4 mr-1.5" />
              {t('sp.tabs.workshop')}
            </TabsTrigger>
          )}
          {primaryTabs.includes('accounting') && (
            <TabsTrigger value="accounting">
              <Calculator className="h-4 w-4 mr-1.5" />
              {t('sp.tabs.accounting')}
            </TabsTrigger>
          )}
          {primaryTabs.includes('calendar') && (
            <TabsTrigger value="calendar">
              <Calendar className="h-4 w-4 mr-1.5" />
              {t('sp.tabs.calendar')}
            </TabsTrigger>
          )}
          {primaryTabs.includes('leads') && (
            <TabsTrigger value="leads">
              <Target className="h-4 w-4 mr-1.5" />
              {t('sp.tabs.leads', 'Leady')}
            </TabsTrigger>
          )}
          {primaryTabs.includes('ads') && (
            <TabsTrigger value="ads">
              <Megaphone className="h-4 w-4 mr-1.5" />
              {t('sp.tabs.ads', 'Reklamy')}
            </TabsTrigger>
          )}
          {primaryTabs.includes('ai-agent') && (
            <TabsTrigger value="ai-agent">
              <Bot className="h-4 w-4 mr-1.5" />
              {t('sp.tabs.aiAgent')}
            </TabsTrigger>
          )}
          {primaryTabs.includes('account') && (
            <TabsTrigger value="account">
              <Users className="h-4 w-4 mr-1.5" />
              {t('sp.tabs.selectModule')}
            </TabsTrigger>
          )}
          {primaryTabs.includes('workspace') && (
            <TabsTrigger value="workspace">
              <Briefcase className="h-4 w-4 mr-1.5" />
              Workspace
            </TabsTrigger>
          )}
          {features.website_builder_enabled && primaryTabs.includes('website') && (
            <TabsTrigger value="website">
              <Globe className="h-4 w-4 mr-1.5" />
              {t('sp.tabs.website')}
            </TabsTrigger>
          )}
          {(() => {
            const TAB_ICONS: Record<string, any> = {
              dashboard: LayoutDashboard, services: Wrench, workshop: Hammer,
              accounting: Calculator, calendar: Calendar, leads: Target,
              ads: Megaphone, 'ai-agent': Bot, account: Users,
              workspace: Briefcase, website: Globe, settings: Settings,
            };
            const TAB_LABELS: Record<string, string> = {
              dashboard: t('sp.tabs.dashboard'), services: t('sp.tabs.services'),
              workshop: t('sp.tabs.workshop'), accounting: t('sp.tabs.accounting'),
              calendar: t('sp.tabs.calendar'), leads: 'Leady',
              ads: 'Reklamy', 'ai-agent': t('sp.tabs.aiAgent'),
              account: t('sp.tabs.selectModule'), workspace: 'Workspace',
              website: t('sp.tabs.website'), settings: t('sp.tabs.settings'),
            };
            const nonPrimaryTabs = SERVICE_PROVIDER_TAB_ORDER.filter(
              tab => !primaryTabs.includes(tab) && (features.website_builder_enabled || tab !== 'website')
            );
            if (nonPrimaryTabs.length === 0) return null;
            return (
              <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="px-5 h-10 flex items-center gap-2 rounded-full text-white text-sm whitespace-nowrap transition-colors hover:bg-white/20 focus-visible:outline-none"
                  >
                    <ChevronDown className="h-4 w-4" />
                    {t('sp.tabs.more')}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-1" align="end">
                  {nonPrimaryTabs.map(tab => {
                    const Icon = TAB_ICONS[tab] || Settings;
                    return (
                      <button key={tab} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors" onClick={() => { setActiveTab(tab); setMoreOpen(false); }}>
                        <Icon className="h-4 w-4" /> {TAB_LABELS[tab] || tab}
                      </button>
                    );
                  })}
                </PopoverContent>
              </Popover>
            );
          })()}

          {/* Pulpit / Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t('sp.dashboard.allBookings')}</CardTitle></CardHeader>
                <CardContent><div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" /><span className="text-2xl font-bold">{stats.totalBookings}</span></div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t('sp.dashboard.pending')}</CardTitle></CardHeader>
                <CardContent><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-warning" /><span className="text-2xl font-bold">{stats.pendingBookings}</span></div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t('sp.dashboard.avgRating')}</CardTitle></CardHeader>
                <CardContent><div className="flex items-center gap-2"><Star className="h-5 w-5 text-warning fill-warning" /><span className="text-2xl font-bold">{stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '-'}</span></div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t('sp.dashboard.aiAgent')}</CardTitle></CardHeader>
                <CardContent><div className="flex items-center gap-2"><Phone className="h-5 w-5 text-primary" /><Badge variant={configData?.is_active ? 'default' : 'secondary'}>{configData?.is_active ? t('sp.dashboard.active') : t('sp.dashboard.inactive')}</Badge></div></CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader><CardTitle>{t('sp.dashboard.quickActions')}</CardTitle><CardDescription>{t('sp.dashboard.quickActionsDesc')}</CardDescription></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Button variant="outline" onClick={() => setActiveTab('bookings')}><ClipboardList className="h-4 w-4 mr-2" />{t('sp.dashboard.bookings')}</Button>
                <Button variant="outline" onClick={() => setActiveTab('calendar')}><Calendar className="h-4 w-4 mr-2" />{t('sp.dashboard.calendar')}</Button>
                <Button variant="outline" onClick={() => setActiveTab('ai-agent')}><Phone className="h-4 w-4 mr-2" />{t('sp.dashboard.aiAgent')}</Button>
                <Button variant="outline" onClick={() => setActiveTab('services')}><Wrench className="h-4 w-4 mr-2" />{t('sp.dashboard.services')}</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Services Tab */}
          <TabsContent value="services" className="mt-6 space-y-4">
            {/* Activation Banner */}
            {!isProfileActive && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4 py-5">
                  <div className="flex items-center gap-3 flex-1">
                    <AlertCircle className="h-8 w-8 text-primary flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-foreground">Twój profil nie jest jeszcze aktywny w portalu</p>
                      <p className="text-sm text-muted-foreground">Uzupełnij dane firmy, opis i zdjęcie — Twoje usługi będą wtedy widoczne publicznie w odpowiedniej kategorii.</p>
                    </div>
                  </div>
                  <Button onClick={() => setActivationDialog(true)} className="gap-2 flex-shrink-0">
                    <ShieldCheck className="h-4 w-4" /> Aktywuj konto
                  </Button>
                </CardContent>
              </Card>
            )}
            {isProfileActive && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span>Profil aktywny — Twoje usługi są widoczne w portalu</span>
              </div>
            )}
            <div className="flex items-center justify-start">
              <Button onClick={() => { resetServiceForm(); setServiceDialog(true); }} className="gap-2">
                <Plus className="h-4 w-4" /> {t('sp.services.addService')}
              </Button>
            </div>

            <Card>
              <CardContent className="pt-6">
                {services.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Wrench className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p className="font-medium">{t('sp.services.noServices')}</p>
                    <p className="text-sm">{t('sp.services.noServicesHint')}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('sp.services.serviceName')}</TableHead>
                        <TableHead>{t('sp.services.category')}</TableHead>
                        <TableHead className="text-right">{t('sp.services.priceFrom')}</TableHead>
                        <TableHead className="text-right">{t('sp.services.priceTo')}</TableHead>
                        <TableHead>{t('sp.services.status')}</TableHead>
                        <TableHead>{t('ads.advertising', 'Reklama')}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {services.map((service: ServiceItem) => (
                        <TableRow key={service.id}>
                          <TableCell className="font-medium">{service.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t(`sp.services.categories.${service.category}`, service.category)}</TableCell>
                          <TableCell className="text-right">{service.price_from} zł</TableCell>
                          <TableCell className="text-right">{service.price_to > 0 ? `${service.price_to} zł` : '—'}</TableCell>
                          <TableCell>
                             <Badge variant={service.is_active ? 'default' : 'secondary'}>
                              {service.is_active ? t('sp.services.activeStatus') : t('sp.services.inactiveStatus')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" className="gap-1 mr-1" onClick={() => setAdOrderService({ id: service.id, name: service.name })}>
                              <Megaphone className="h-3 w-3" /> {t('ads.advertise', 'Reklamuj')}
                            </Button>
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
                  <DialogTitle>{editingService ? t('sp.services.editService') : t('sp.services.addNewService')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                  <div className="space-y-2">
                    <Label>{t('sp.services.serviceNameLabel')}</Label>
                    <Input value={serviceForm.name} onChange={e => setServiceForm(p => ({ ...p, name: e.target.value }))} placeholder={t('sp.services.serviceNamePlaceholder')} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('sp.services.shortDesc')}</Label>
                    <Input value={serviceForm.short_description} onChange={e => setServiceForm(p => ({ ...p, short_description: e.target.value }))} placeholder={t('sp.services.shortDescPlaceholder')} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('sp.services.fullDesc')}</Label>
                    <Textarea rows={4} value={serviceForm.description} onChange={e => setServiceForm(p => ({ ...p, description: e.target.value }))} placeholder={t('sp.services.fullDescPlaceholder')} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('sp.services.priceFromLabel')}</Label>
                      <Input type="number" value={serviceForm.price_from} onChange={e => setServiceForm(p => ({ ...p, price_from: e.target.value }))} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('sp.services.priceToLabel')}</Label>
                      <Input type="number" value={serviceForm.price_to} onChange={e => setServiceForm(p => ({ ...p, price_to: e.target.value }))} placeholder="0" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('sp.services.category')}</Label>
                    <Select value={serviceForm.category} onValueChange={v => setServiceForm(p => ({ ...p, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ogolne">{t('sp.services.categories.ogolne')}</SelectItem>
                        <SelectItem value="mechanika">{t('sp.services.categories.mechanika')}</SelectItem>
                        <SelectItem value="detailing">{t('sp.services.categories.detailing')}</SelectItem>
                        <SelectItem value="lakiernictwo">{t('sp.services.categories.lakiernictwo')}</SelectItem>
                        <SelectItem value="elektryka">{t('sp.services.categories.elektryka')}</SelectItem>
                        <SelectItem value="opony">{t('sp.services.categories.opony')}</SelectItem>
                        <SelectItem value="diagnostyka">{t('sp.services.categories.diagnostyka')}</SelectItem>
                        <SelectItem value="inne">{t('sp.services.categories.inne')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('sp.services.photos')}</Label>
                    <div
                      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${isDraggingService ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'}`}
                      onClick={() => serviceFileRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setIsDraggingService(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setIsDraggingService(false); }}
                      onDrop={handleServiceFileDrop}
                    >
                      <Upload className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm text-muted-foreground">{t('sp.services.photosHint')}</p>
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
                    <Label>{t('sp.services.serviceActive')}</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setServiceDialog(false)}>{t('sp.services.cancel')}</Button>
                  <Button onClick={handleSaveService} disabled={!serviceForm.name || createServiceMut.isPending || updateServiceMut.isPending}>
                    <Save className="h-4 w-4 mr-2" />{t('sp.services.save')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Activation Dialog */}
            <Dialog open={activationDialog} onOpenChange={setActivationDialog}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    Aktywuj profil usługodawcy
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                  <p className="text-sm text-muted-foreground">Uzupełnij dane — po aktywacji Twoja firma i usługi będą widoczne publicznie w portalu.</p>
                  <div className="space-y-2">
                    <Label>Nazwa firmy *</Label>
                    <Input value={activationForm.company_name} onChange={e => setActivationForm(p => ({ ...p, company_name: e.target.value }))} placeholder="Np. Auto Serwis Kowalski" />
                  </div>
                  <div className="space-y-2">
                    <Label>Kategoria główna *</Label>
                    <Select value={activationForm.category_id} onValueChange={v => setActivationForm(p => ({ ...p, category_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Wybierz kategorię" /></SelectTrigger>
                      <SelectContent>
                        {serviceCategories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Opis firmy *</Label>
                    <Textarea rows={3} value={activationForm.description} onChange={e => setActivationForm(p => ({ ...p, description: e.target.value }))} placeholder="Opisz czym zajmuje się Twoja firma..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Telefon *</Label>
                      <Input value={activationForm.company_phone} onChange={e => setActivationForm(p => ({ ...p, company_phone: e.target.value }))} placeholder="+48..." />
                    </div>
                    <div className="space-y-2">
                      <Label>E-mail</Label>
                      <Input value={activationForm.company_email} onChange={e => setActivationForm(p => ({ ...p, company_email: e.target.value }))} placeholder="kontakt@firma.pl" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Miasto *</Label>
                      <Input value={activationForm.company_city} onChange={e => setActivationForm(p => ({ ...p, company_city: e.target.value }))} placeholder="Warszawa" />
                    </div>
                    <div className="space-y-2">
                      <Label>Kod pocztowy</Label>
                      <Input value={activationForm.company_postal_code} onChange={e => setActivationForm(p => ({ ...p, company_postal_code: e.target.value }))} placeholder="00-000" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Adres</Label>
                    <Input value={activationForm.company_address} onChange={e => setActivationForm(p => ({ ...p, company_address: e.target.value }))} placeholder="ul. Przykładowa 1" />
                  </div>
                  <div className="space-y-2">
                    <Label>NIP</Label>
                    <Input value={activationForm.company_nip} onChange={e => setActivationForm(p => ({ ...p, company_nip: e.target.value }))} placeholder="1234567890" />
                  </div>
                  <div className="space-y-2">
                    <Label>Logo firmy</Label>
                    <div
                      className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                        coverImageFile ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.type.startsWith('image/')) setCoverImageFile(file);
                      }}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = (ev: any) => {
                          const file = ev.target.files?.[0];
                          if (file) setCoverImageFile(file);
                        };
                        input.click();
                      }}
                    >
                      {coverImageFile ? (
                        <div className="flex items-center gap-3">
                          <img
                            src={URL.createObjectURL(coverImageFile)}
                            alt="Logo preview"
                            className="h-12 w-12 object-contain rounded border"
                          />
                          <div className="text-left flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{coverImageFile.name}</p>
                            <p className="text-xs text-muted-foreground">{(coverImageFile.size / 1024).toFixed(0)} KB</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={e => { e.stopPropagation(); setCoverImageFile(null); }}
                          >
                            ✕
                          </Button>
                        </div>
                      ) : (
                        <div className="py-2">
                          <p className="text-sm text-muted-foreground">Przeciągnij i upuść lub kliknij aby wybrać</p>
                          <p className="text-xs text-muted-foreground mt-1">PNG, JPG do 5 MB</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setActivationDialog(false)}>Anuluj</Button>
                  <Button onClick={handleActivateProfile} disabled={activationSaving} className="gap-2">
                    {activationSaving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ShieldCheck className="h-4 w-4" />}
                    Aktywuj profil
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Calendar Tab */}
          <TabsContent value="calendar" className="mt-6">
            <UniversalSubTabBar
              activeTab={calendarSubTab}
              onTabChange={(v) => setCalendarSubTab(v as 'calendar' | 'bookings')}
              tabs={[
                { value: 'calendar', label: t('sp.calendar.calendar') },
                { value: 'bookings', label: t('sp.calendar.bookings') },
              ]}
            />
            {calendarSubTab === 'calendar' && (
              <div className="mt-4 flex gap-4">
                <div className="flex-1 min-w-0">
                  {providerId ? (
                    <WorkshopScheduler providerId={providerId} onBack={() => setActiveTab('dashboard')} title="" />
                  ) : (
                    <CalendarView />
                  )}
                </div>
                <div className="hidden lg:block w-[280px] flex-shrink-0">
                  <CalendarAIAssistant providerId={providerId} />
                </div>
              </div>
            )}
            {calendarSubTab === 'bookings' && (
              <div className="mt-4">
                <Card>
                  <CardContent className="pt-6"><p className="text-muted-foreground text-center py-8">{t('sp.calendar.noBookings')}</p></CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Bookings Tab */}
           <TabsContent value="bookings" className="mt-6">
            <Card>
              <CardContent className="pt-6"><p className="text-muted-foreground text-center py-8">{t('sp.calendar.noBookings')}</p></CardContent>
            </Card>
          </TabsContent>

          {/* AI Agent Tab */}
          <TabsContent value="ai-agent" className="mt-6">
            <AISalesAgentsDashboard />
          </TabsContent>

          {/* Website Builder Tab */}
          {features.website_builder_enabled && (
            <TabsContent value="website" className="mt-6">
              <WebsiteBuilderWizard />
            </TabsContent>
          )}

          {/* Workspace Tab */}
          <TabsContent value="workspace" className="mt-6">
            <WorkspaceView />
          </TabsContent>

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
            <SettingsPanel
              providerId={providerId}
              settingsForm={settingsForm}
              setSettingsForm={setSettingsForm}
              websiteBuilderEnabled={features.website_builder_enabled}
              onPrimaryTabsSaved={setPrimaryTabs}
            />
          </TabsContent>

          <TabsContent value="accounting" className="mt-6">
            <ServiceProviderAccountingView />
          </TabsContent>

          <TabsContent value="workshop" className="mt-6">
            <WorkshopDashboard providerId={providerId} />
          </TabsContent>

          {/* Leads Tab */}
          <TabsContent value="leads" className="mt-6">
            <LeadsTab providerId={providerId} userId={user?.id || null} />
          </TabsContent>

          {/* Ads Tab */}
          <TabsContent value="ads" className="mt-6">
            <AdsTab userId={user?.id || null} />
          </TabsContent>
        </TabsPill>

        {/* Ad Order Modal */}
        <AdOrderModal
          open={!!adOrderService}
          onClose={() => setAdOrderService(null)}
          service={adOrderService}
          userId={user?.id || null}
        />
      </main>
    </div>
  );
}
