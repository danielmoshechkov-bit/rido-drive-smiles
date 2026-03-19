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
import { AdminAuthUsersPanel } from '@/components/admin/AdminAuthUsersPanel';
import { AdminApiKeysTab } from '@/components/admin/AdminApiKeysTab';
import { AdminIntegrationsTab } from '@/components/admin/AdminIntegrationsTab';
import { AdminPaymentsTab } from '@/components/admin/AdminPaymentsTab';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { UserDropdown } from '@/components/UserDropdown';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Palette, Users, Wrench, Calculator, LayoutGrid, Bot, Key, TicketCheck, Briefcase, Plug, Wallet } from 'lucide-react';

export default function AdminPortal() {
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ai-assistant');
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
              className="rounded-full p-1 shadow-lg"
              style={{ backgroundColor: 'var(--nav-bar-color, #6C3CF0)' }}
            >
              <TabsList 
                className="flex w-full items-center gap-1 overflow-x-auto scrollbar-hide rounded-full px-1 min-h-[44px] bg-transparent"
              >
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="px-4 h-10 flex items-center gap-2 rounded-full text-sm whitespace-nowrap transition text-white data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-white/20 focus-visible:outline-none"
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </div>

          {/* Mobile - simplified tabs */}
          <div className="md:hidden overflow-x-auto">
            <div className="flex gap-2 pb-2">
              {tabs.slice(0, 5).map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`px-3 py-2 rounded-full text-sm whitespace-nowrap flex items-center gap-1 ${
                    activeTab === tab.value 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <tab.icon className="h-3 w-3" />
                  {tab.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* AI Assistant Tab */}
          <TabsContent value="ai-assistant">
            <AdminAIAssistant />
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LayoutGrid className="h-5 w-5" />
                  Zarządzanie portalami
                </CardTitle>
                <CardDescription>
                  Konfiguracja kafelków i kategorii na stronach portali (Motoryzacja, Nieruchomości, Usługi)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PortalCategoriesManager />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Branding Tab */}
          <TabsContent value="branding">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Wygląd portalu
                </CardTitle>
                <CardDescription>
                  Personalizacja logo, kolorów i brandingu
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <Palette className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>Ustawienia wyglądu wkrótce</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-6">
            {/* All Auth Users Panel */}
            <AdminAuthUsersPanel />
            
            {/* Admin Roles Manager */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Administratorzy systemu
                </CardTitle>
                <CardDescription>
                  Zarządzanie uprawnieniami administratorów
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UserRolesManager />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Workspace Tab */}
          <TabsContent value="workspace" className="space-y-6">
            <WorkspaceManagement />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
