import { useState, useEffect } from 'react';
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
import { useUserRole } from '@/hooks/useUserRole';
import { 
  LayoutDashboard, 
  Wrench, 
  Calendar, 
  ClipboardList, 
  Settings, 
  Phone,
  Users,
  Clock,
  Star
} from 'lucide-react';
import { toast } from 'sonner';

export default function ServiceProviderDashboard() {
  const navigate = useNavigate();
  const { roles } = useUserRole();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [configData, setConfigData] = useState<any>(null);
  const [stats, setStats] = useState({
    totalBookings: 0,
    pendingBookings: 0,
    completedThisMonth: 0,
    averageRating: 0
  });

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate('/auth');
      return;
    }

    setUser(user);

    // Check if user has service_provider role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (!roles?.some(r => r.role === 'service_provider')) {
      toast.error('Brak uprawnień do panelu usługodawcy');
      navigate('/auth');
      return;
    }

    // Fetch AI agent config for this user
    const { data: config } = await supabase
      .from('ai_agent_configs')
      .select('*, ai_call_business_profiles(*)')
      .eq('user_id', user.id)
      .single();

    if (config) {
      setConfigData(config);
    }

    // Fetch basic stats
    const { data: provider } = await supabase
      .from('service_providers')
      .select('id, rating_avg, rating_count')
      .eq('user_id', user.id)
      .single();

    if (provider) {
      // Get bookings count
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
    }

    setLoading(false);
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
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <UniversalHomeButton />
            <div className="hidden sm:block">
              <h1 className="font-semibold text-lg">Panel Usługodawcy</h1>
              <p className="text-xs text-muted-foreground">
                {configData?.company_name || 'Twoja firma'}
              </p>
            </div>
          </div>
          <MyGetRidoButton user={user} />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <TabsPill value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsTrigger value="dashboard">
            <LayoutDashboard className="h-4 w-4 mr-1.5" />
            Dashboard
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
          <TabsTrigger value="ai-agent">
            <Phone className="h-4 w-4 mr-1.5" />
            AI Agent
          </TabsTrigger>
          <TabsTrigger value="account">
            <Users className="h-4 w-4 mr-1.5" />
            Przełącz konto
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-1.5" />
            Ustawienia
          </TabsTrigger>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Wszystkie rezerwacje
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-primary" />
                    <span className="text-2xl font-bold">{stats.totalBookings}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Oczekujące
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-yellow-500" />
                    <span className="text-2xl font-bold">{stats.pendingBookings}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Średnia ocena
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
                    <span className="text-2xl font-bold">
                      {stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '-'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    AI Agent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Phone className="h-5 w-5 text-primary" />
                    <Badge variant={configData?.is_active ? 'default' : 'secondary'}>
                      {configData?.is_active ? 'Aktywny' : 'Nieaktywny'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Szybkie akcje</CardTitle>
                <CardDescription>Najczęściej używane funkcje</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Button variant="outline" onClick={() => setActiveTab('bookings')}>
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Rezerwacje
                </Button>
                <Button variant="outline" onClick={() => setActiveTab('calendar')}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Kalendarz
                </Button>
                <Button variant="outline" onClick={() => setActiveTab('ai-agent')}>
                  <Phone className="h-4 w-4 mr-2" />
                  AI Agent
                </Button>
                <Button variant="outline" onClick={() => setActiveTab('services')}>
                  <Wrench className="h-4 w-4 mr-2" />
                  Usługi
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Services Tab */}
          <TabsContent value="services" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Moje usługi</CardTitle>
                <CardDescription>Zarządzaj listą świadczonych usług</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Funkcja w przygotowaniu
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Calendar Tab */}
          <TabsContent value="calendar" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Kalendarz dostępności</CardTitle>
                <CardDescription>Ustal godziny pracy i wolne terminy</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Funkcja w przygotowaniu
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bookings Tab */}
          <TabsContent value="bookings" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Rezerwacje</CardTitle>
                <CardDescription>Nadchodzące i zakończone zlecenia</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Brak aktywnych rezerwacji
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Agent Tab */}
          <TabsContent value="ai-agent" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  AI Agent Telefoniczny
                </CardTitle>
                <CardDescription>
                  Automatyczna obsługa połączeń przychodzących
                </CardDescription>
              </CardHeader>
              <CardContent>
                {configData ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Status:</span>
                      <Badge variant={configData.is_active ? 'default' : 'secondary'}>
                        {configData.is_active ? 'Aktywny' : 'Nieaktywny'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Firma:</span>
                      <span>{configData.company_name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Język:</span>
                      <span>{configData.language === 'pl' ? 'Polski' : configData.language}</span>
                    </div>
                    <Button className="w-full mt-4" onClick={() => setActiveTab('settings')}>
                      <Settings className="h-4 w-4 mr-2" />
                      Konfiguruj AI Agenta
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Phone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                      AI Agent nie został jeszcze skonfigurowany
                    </p>
                    <Button>Rozpocznij konfigurację</Button>
                  </div>
                )}
              </CardContent>
            </Card>
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
              isMarketplaceEnabled={true}
              currentAccountType="client"
              navigate={navigate}
            />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Ustawienia</CardTitle>
                <CardDescription>Konfiguracja konta i preferencje</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Funkcja w przygotowaniu
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </TabsPill>
      </main>
    </div>
  );
}
