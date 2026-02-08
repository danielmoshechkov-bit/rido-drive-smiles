import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { AdminPortalSwitcher } from '@/components/admin/AdminPortalSwitcher';
import { AISettingsPanel } from '@/components/ai/AISettingsPanel';
import { FeatureTogglesManagement } from '@/components/FeatureTogglesManagement';
import { UserRolesManager } from '@/components/UserRolesManager';
import { RegistryIntegrationsPanel } from '@/components/admin/RegistryIntegrationsPanel';
import { TTSSettingsPanel } from '@/components/admin/TTSSettingsPanel';
import { AccountingModuleSettings } from '@/components/admin/AccountingModuleSettings';
import { PortalCategoriesManager } from '@/components/admin/PortalCategoriesManager';
import { AdminAIAssistant } from '@/components/admin/AdminAIAssistant';
import { EmailSettings } from '@/components/EmailSettings';
import { AdminAuthUsersPanel } from '@/components/admin/AdminAuthUsersPanel';
import { SecurityApiKeysPanel } from '@/components/admin/SecurityApiKeysPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { UserDropdown } from '@/components/UserDropdown';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Settings, Palette, Users, Wrench, Volume2, Building2, Calculator, LayoutGrid, Bot, Mail, Shield } from 'lucide-react';

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

  const tabs = [
    { value: 'ai-assistant', label: 'AI Asystent', icon: Bot },
    { value: 'api', label: 'API i Integracje', icon: Settings },
    { value: 'security', label: 'Zabezpieczenia', icon: Shield },
    { value: 'voice', label: 'Głos i TTS', icon: Volume2 },
    { value: 'email', label: 'Poczta email', icon: Mail },
    { value: 'registries', label: 'Rejestry', icon: Building2 },
    { value: 'accounting', label: 'Księgowość', icon: Calculator },
    { value: 'features', label: 'Funkcje', icon: Wrench },
    { value: 'portals', label: 'Portale', icon: LayoutGrid },
    { value: 'branding', label: 'Wygląd', icon: Palette },
    { value: 'users', label: 'Użytkownicy', icon: Users },
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

          {/* API & Integrations Tab */}
          <TabsContent value="api">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Ustawienia AI
                </CardTitle>
                <CardDescription>
                  Konfiguracja kluczy API dla OpenAI, Gemini i innych usług AI
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AISettingsPanel />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security & API Keys Tab */}
          <TabsContent value="security">
            <SecurityApiKeysPanel />
          </TabsContent>

          {/* Voice / TTS Tab */}
          <TabsContent value="voice">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Volume2 className="h-5 w-5" />
                  Ustawienia głosu
                </CardTitle>
                <CardDescription>
                  Konfiguracja TTS (synteza mowy) dla nawigacji i asystenta
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TTSSettingsPanel />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Email Settings Tab */}
          <TabsContent value="email">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Ustawienia poczty email
                </CardTitle>
                <CardDescription>
                  Konfiguracja serwera SMTP i szablonów wiadomości
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <EmailSettings />
              </CardContent>
            </Card>
          </TabsContent>

          {/* External Registries Tab */}
          <TabsContent value="registries">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Rejestry zewnętrzne
                </CardTitle>
                <CardDescription>
                  Integracje z GUS REGON, Białą Listą VAT i KSeF
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RegistryIntegrationsPanel />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Accounting Module Tab */}
          <TabsContent value="accounting">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  Moduł księgowy
                </CardTitle>
                <CardDescription>
                  Ustawienia fakturowania, integracje GUS, biała lista VAT i KSeF
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AccountingModuleSettings />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Feature Toggles Tab */}
          <TabsContent value="features">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  Funkcje portalu
                </CardTitle>
                <CardDescription>
                  Włączanie i wyłączanie modułów portalu
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FeatureTogglesManagement />
              </CardContent>
            </Card>
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
        </Tabs>
      </div>
    </div>
  );
}
