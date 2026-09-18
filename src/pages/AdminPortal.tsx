import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { AdminPortalSwitcher } from '@/components/admin/AdminPortalSwitcher';

import { FeatureTogglesManagement } from '@/components/FeatureTogglesManagement';
import { UserRolesManager } from '@/components/UserRolesManager';

import { AccountingModuleSettings } from '@/components/admin/AccountingModuleSettings';
import { PortalCategoriesManager } from '@/components/admin/PortalCategoriesManager';
import { AdminAIAssistant } from '@/components/admin/AdminAIAssistant';
import { WorkspaceManagement } from '@/components/admin/WorkspaceManagement';
import { SupportTicketsPanel } from '@/components/admin/SupportTicketsPanel';
import { SupportInboxPanel } from '@/components/admin/SupportInboxPanel';
import { AdminAuthUsersPanel } from '@/components/admin/AdminAuthUsersPanel';
import { AdminApiKeysTab } from '@/components/admin/AdminApiKeysTab';
import { AdminIntegrationsTab } from '@/components/admin/AdminIntegrationsTab';
import { KsefAdminPanel } from '@/components/admin/KsefAdminPanel';
import { AdminPaymentsTab } from '@/components/admin/AdminPaymentsTab';
import { AIAgentsPanel } from '@/components/admin/AIAgentsPanel';
import { LeadyAgentaPanel } from '@/components/admin/LeadyAgentaPanel';
import { SeoAgent } from '@/components/admin/SeoAgent';
import { WeeklyDebtRebuildPanel } from '@/components/admin/WeeklyDebtRebuildPanel';
import { ReferralSystemPanel } from '@/components/admin/ReferralSystemPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useSupportInbox } from '@/hooks/useSupportChat';
import { UserDropdown } from '@/components/UserDropdown';
import { Loader2, Palette, Users, Wrench, Calculator, LayoutGrid, Bot, Key, TicketCheck, Briefcase, Plug, Wallet, Shield, Cpu, Globe, RefreshCcw, Gift, MessageSquare } from 'lucide-react';

export default function AdminPortal() {
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ai-assistant');

  /**
   * Nieprzeczytane rozmowy — liczba WPROST NA PASKU.
   *
   * 16.09.2026 klient napisał na czacie, SMS przyszedł, a wiadomość „zniknęła":
   * była w bazie i na swoim ekranie, tylko nic w panelu nie mówiło, że tam na
   * kogoś czeka. Panel otwiera się na „AI Asystent", więc bez tej liczby trzeba
   * wiedzieć, że ma się gdzie kliknąć.
   *
   * To ten sam klucz zapytania, którego używa sama skrzynka (`useSupportInbox`),
   * więc TanStack nie robi drugiego odpytania — jedno źródło, jedna liczba.
   */
  const { data: rozmowy = [] } = useSupportInbox();
  const nieprzeczytane = rozmowy.reduce((suma, r) => suma + (r.unread_for_admin || 0), 0);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (!user) {
        navigate('/auth');
      } else {
        setUserEmail(user.email || '');
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  // Check admin access after roles are loaded
  useEffect(() => {
    if (!roleLoading && !loading && user) {
      if (!isAdmin) {
        navigate('/');
      }
    }
  }, [roleLoading, isAdmin, user, loading]);

  // Read tab from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, []);

  // Update URL when tab changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeTab) {
      params.set('tab', activeTab);
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    }
  }, [activeTab]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const tabs: { value: string; label: string; icon: React.ComponentType<any> }[] = [
    { value: 'ai-assistant', label: 'AI Asystent', icon: Bot },
    // Nazwa „Czat" myliła się z dymkiem na stronie — a to jest SKRZYNKA rozmów
    // z klientami. `value` zostaje: trzyma je adres `?tab=support-inbox` i SMS.
    { value: 'support-inbox', label: 'Komunikacja', icon: MessageSquare },
    { value: 'tickets', label: 'Zgłoszenia', icon: TicketCheck },
    { value: 'api', label: 'Klucze API', icon: Key },
    { value: 'integrations', label: 'Integracje', icon: Plug },
    { value: 'payments', label: 'Płatności', icon: Wallet },
    { value: 'accounting', label: 'Księgowość', icon: Calculator },
    { value: 'features', label: 'Funkcje', icon: Wrench },
    { value: 'portals', label: 'Portale', icon: LayoutGrid },
    { value: 'branding', label: 'Wygląd', icon: Palette },
    { value: 'users', label: 'Użytkownicy', icon: Users },
    { value: 'workspace', label: 'Workspace', icon: Briefcase },
    { value: 'ksef-admin', label: 'KSeF Admin', icon: Shield },
    { value: 'ai-agents', label: 'Agenci AI', icon: Cpu },
    { value: 'leady-agenta', label: 'Leady asystentki', icon: Cpu },
    { value: 'seo-agent', label: 'Agent SEO', icon: Globe },
    { value: 'fleet-debt-rebuild', label: 'Przebudowa długów', icon: RefreshCcw },
    { value: 'referrals', label: 'Polecenia', icon: Gift },
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-3">
          {/* Desktop header */}
          <div className="hidden md:flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="GetRido Logo" 
                className="h-6 w-6"
              />
              <AdminPortalSwitcher />
            </div>
            <div className="flex items-center space-x-3">
              <UserDropdown 
                userName="Administrator"
                userRole="Admin Portalu"
                userEmail={userEmail}
                onLogout={handleLogout}
              />
            </div>
          </div>

          {/* Mobile header */}
          <div className="md:hidden flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="GetRido Logo" 
                className="h-6 w-6"
              />
              <span className="text-sm font-semibold text-primary">Admin Portalu</span>
            </div>
            <UserDropdown 
              userName="Admin"
              userRole="Administrator"
              userEmail={userEmail}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Desktop - Purple pill tabs */}
          <div className="hidden md:block">
            <div 
              className="rounded-3xl p-1.5 shadow-lg"
              style={{ backgroundColor: 'var(--nav-bar-color, #6C3CF0)' }}
            >
              {/* ZAWIJANIE ZAMIAST PRZEWIJANIA W BOK.
                  Osiemnaście pigułek nie mieści się w jednym rzędzie, a przy
                  `overflow-x-auto scrollbar-hide` nie było ŻADNEGO sygnału, że
                  pasek jedzie dalej — zakładka mogła stać poza ekranem i nic tego
                  nie zdradzało. Zawinięty pasek zajmuje dwa rzędy i pokazuje
                  wszystko naraz. */}
              {/* 🔴 `h-auto` JEST TU NAJWAŻNIEJSZE.
                  Prymityw `TabsList` z shadcn ma w bazowych klasach `h-10`,
                  czyli SZTYWNE 40 px. `min-h-[44px]` tego nie zdejmuje — to inna
                  właściwość, więc `tailwind-merge` zostawia obie i element ma
                  44 px niezależnie od zawartości. Drugi rząd pigułek wychodził
                  wtedy poza fioletowe tło i nachodził na kartę pod spodem.
                  `h-auto` wygrywa z `h-10` przy scalaniu klas i pasek rośnie
                  razem z rzędami. `gap-y` daje odstęp MIĘDZY rzędami. */}
              <TabsList 
                className="flex w-full h-auto flex-wrap items-center gap-x-1 gap-y-1.5 rounded-[18px] px-1 py-1 bg-transparent"
              >
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="px-4 h-10 flex items-center gap-2 rounded-full text-sm whitespace-nowrap transition text-white data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-white/20 focus-visible:outline-none"
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                    {tab.value === 'support-inbox' && nieprzeczytane > 0 && (
                      <span className="ml-1 min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold inline-flex items-center justify-center">
                        {nieprzeczytane}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </div>

          {/* Mobile - scrollable tabs */}
          <div className="md:hidden overflow-x-auto scrollbar-hide -mx-4 px-4">
            <div className="flex gap-1.5 pb-2 flex-nowrap">
              {tabs.map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`px-2.5 py-2 rounded-full text-xs whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${
                    activeTab === tab.value 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <tab.icon className="h-3 w-3" />
                  {tab.label.split(' ')[0]}
                  {tab.value === 'support-inbox' && nieprzeczytane > 0 && (
                    <span className="min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold inline-flex items-center justify-center">
                      {nieprzeczytane}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* AI Assistant Tab */}
          <TabsContent value="ai-assistant">
            <AdminAIAssistant />
          </TabsContent>

          {/* Czat wsparcia — rozmowy z klientami na żywo */}
          <TabsContent value="support-inbox">
            <SupportInboxPanel />
          </TabsContent>

          {/* Tickets Tab */}
          <TabsContent value="tickets">
            <SupportTicketsPanel />
          </TabsContent>


          {/* API Keys Tab */}
          <TabsContent value="api">
            <AdminApiKeysTab />
          </TabsContent>

          {/* Integrations Tab */}
          <TabsContent value="integrations">
            <AdminIntegrationsTab />
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments">
            <AdminPaymentsTab />
          </TabsContent>

          {/* Accounting Module Tab */}
          <TabsContent value="accounting">
            <AccountingModuleSettings />
          </TabsContent>

          {/* Feature Toggles Tab */}
          <TabsContent value="features">
            <FeatureTogglesManagement />
          </TabsContent>

          {/* Portals Tab */}
          <TabsContent value="portals">
            <PortalCategoriesManager />
          </TabsContent>

          {/* Branding Tab */}
          <TabsContent value="branding">
            <div className="text-center py-8 text-muted-foreground">
              <Palette className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Ustawienia wyglądu wkrótce</p>
            </div>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-6">
            <AdminAuthUsersPanel />
            <UserRolesManager />
          </TabsContent>

          {/* Workspace Tab */}
          <TabsContent value="workspace" className="space-y-6">
            <WorkspaceManagement />
          </TabsContent>

          {/* KSeF Admin Tab */}
          <TabsContent value="ksef-admin">
            <KsefAdminPanel />
          </TabsContent>

          {/* AI Agents Tab */}
          <TabsContent value="leady-agenta">
            <LeadyAgentaPanel />
          </TabsContent>

          <TabsContent value="ai-agents">
            <AIAgentsPanel />
          </TabsContent>

          {/* SEO Agent Tab */}
          <TabsContent value="seo-agent">
            <SeoAgent />
          </TabsContent>

          {/* Weekly Debt Rebuild Tab */}
          <TabsContent value="fleet-debt-rebuild">
            <WeeklyDebtRebuildPanel />
          </TabsContent>

          {/* Referrals Tab */}
          <TabsContent value="referrals">
            <ReferralSystemPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
