import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { AdminPortalSwitcher } from '@/components/admin/AdminPortalSwitcher';
import { UserDropdown } from '@/components/UserDropdown';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Brain, Key, Route, ToggleLeft, Shield, Activity, Plug, Mic, Phone, ListTodo } from 'lucide-react';
import { AIHubPanel } from '@/components/admin/AIHubPanel';
import { AIFunctionMappingPanel } from '@/components/admin/AIFunctionMappingPanel';
import { AIVoiceAgentSettings } from '@/components/admin/AIVoiceAgentSettings';
import { AICallAdminPanel } from '@/components/admin/AICallAdminPanel';

export default function AdminAIBrain() {
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('hub');
  const [userEmail, setUserEmail] = useState('');

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
    const tabParam = params.get('tab');
    if (tabParam) setActiveTab(tabParam);
  }, []);

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

  if (!isAdmin) return null;

  const tabs = [
    { value: 'hub', label: 'Dostawcy & API', icon: Key },
    { value: 'mapping', label: 'Funkcje → AI', icon: Route },
    { value: 'voice-agent', label: 'AI Voice Agent', icon: Mic },
    { value: 'call-admin', label: 'AI Call Admin', icon: Phone },
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="hidden md:flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <img src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" alt="GetRido Logo" className="h-6 w-6" />
              <AdminPortalSwitcher />
            </div>
            <div className="flex items-center space-x-3">
              <UserDropdown userName="Administrator" userRole="Centrum AI" userEmail={userEmail} onLogout={handleLogout} />
            </div>
          </div>
          <div className="md:hidden flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Brain className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold text-primary">Centrum AI</span>
            </div>
            <UserDropdown userName="Admin" userRole="AI" userEmail={userEmail} onLogout={handleLogout} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Brain className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Centrum AI – Mózg Platformy</h1>
            <p className="text-sm text-muted-foreground">Zarządzaj kluczami API, routingiem i przypisaniem funkcji do dostawców AI</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
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
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </div>

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

          <TabsContent value="hub">
            <AIHubPanel />
          </TabsContent>

          <TabsContent value="mapping">
            <AIFunctionMappingPanel />
          </TabsContent>

          <TabsContent value="voice-agent">
            <AIVoiceAgentSettings />
          </TabsContent>

          <TabsContent value="call-admin">
            <AICallAdminPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
