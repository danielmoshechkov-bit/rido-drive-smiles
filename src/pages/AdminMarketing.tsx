import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { AdminPortalSwitcher } from '@/components/admin/AdminPortalSwitcher';
import { UserDropdown } from '@/components/UserDropdown';
import { UniversalHomeButton } from '@/components/UniversalHomeButton';
import { MyGetRidoButton } from '@/components/MyGetRidoButton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, LayoutDashboard, Plug, BarChart3, Users, Bot, Sparkles, Shield, Settings, FileText } from 'lucide-react';
import { MarketingDashboardTab } from '@/components/marketing/MarketingDashboardTab';
import { MarketingConnectionsTab } from '@/components/marketing/MarketingConnectionsTab';
import { MarketingCampaignsTab } from '@/components/marketing/MarketingCampaignsTab';
import { MarketingClientsTab } from '@/components/marketing/MarketingClientsTab';
import { MarketingAIAgentTab } from '@/components/marketing/MarketingAIAgentTab';
import { MarketingCreatorTab } from '@/components/marketing/MarketingCreatorTab';
import { MarketingTeamTab } from '@/components/marketing/MarketingTeamTab';
import { MarketingSettingsTab } from '@/components/marketing/MarketingSettingsTab';
import { MarketingOrdersTab } from '@/components/marketing/MarketingOrdersTab';

export default function AdminMarketing() {
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [userEmail, setUserEmail] = useState('');
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (!user) navigate('/auth');
      else setUserEmail(user.email || '');
      setLoading(false);
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (!roleLoading && !loading && user && !isAdmin) navigate('/');
  }, [roleLoading, isAdmin, user, loading]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) setActiveTab(tab);

    // Load pending orders count
    (supabase as any).from('provider_ad_orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }: any) => setPendingOrdersCount(count || 0));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', activeTab);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
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

  if (!isAdmin) return null;

  const tabs = [
    { value: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { value: 'orders', label: 'Zlecenia', icon: FileText, badge: pendingOrdersCount },
    { value: 'connections', label: 'Połączenia API', icon: Plug },
    { value: 'campaigns', label: 'Kampanie', icon: BarChart3 },
    { value: 'clients', label: 'Klienci', icon: Users },
    { value: 'ai-agent', label: 'AI Agent', icon: Bot },
    { value: 'creator', label: 'Kreator Reklam', icon: Sparkles },
    { value: 'team', label: 'Zespół', icon: Shield },
    { value: 'settings', label: 'Ustawienia', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <UniversalHomeButton />
              <AdminPortalSwitcher />
              <div className="hidden md:block">
                <h1 className="text-lg font-semibold">Marketing Agency</h1>
                <p className="text-xs text-muted-foreground">Agencja reklamowa i kampanie AI</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MyGetRidoButton user={user} />
              <UserDropdown
                userName="Administrator"
                userRole="Marketing Admin"
                userEmail={userEmail}
                onLogout={handleLogout}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Desktop tabs */}
          <div className="hidden md:block">
            <div className="rounded-full p-1 shadow-lg" style={{ backgroundColor: 'var(--nav-bar-color, #6C3CF0)' }}>
              <TabsList className="flex w-full items-center gap-1 overflow-x-auto scrollbar-hide rounded-full px-1 min-h-[44px] bg-transparent">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="px-4 h-10 flex items-center gap-2 rounded-full text-sm whitespace-nowrap transition text-white data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-white/20 focus-visible:outline-none"
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                    {(tab as any).badge > 0 && (
                      <span className="ml-1 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.2rem] text-center font-medium">
                        {(tab as any).badge}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </div>

          {/* Mobile tabs */}
          <div className="md:hidden overflow-x-auto">
            <div className="flex gap-2 pb-2">
              {tabs.map(tab => (
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

          <TabsContent value="dashboard"><MarketingDashboardTab /></TabsContent>
          <TabsContent value="orders"><MarketingOrdersTab /></TabsContent>
          <TabsContent value="connections"><MarketingConnectionsTab /></TabsContent>
          <TabsContent value="campaigns"><MarketingCampaignsTab /></TabsContent>
          <TabsContent value="clients"><MarketingClientsTab /></TabsContent>
          <TabsContent value="ai-agent"><MarketingAIAgentTab /></TabsContent>
          <TabsContent value="creator"><MarketingCreatorTab /></TabsContent>
          <TabsContent value="team"><MarketingTeamTab /></TabsContent>
          <TabsContent value="settings"><MarketingSettingsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}