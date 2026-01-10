import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { TabsPill } from '@/components/ui/TabsPill';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { UserDropdown } from '@/components/UserDropdown';
import { AdminPortalSwitcher } from '@/components/admin/AdminPortalSwitcher';
import { SystemAlertsButton } from '@/components/SystemAlertsButton';
import {
  Building2,
  Users,
  FileText,
  Settings,
  Menu,
  Download,
  Eye,
  CheckCircle,
  Clock,
  XCircle,
  LayoutDashboard,
  CreditCard,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Agency {
  id: string;
  company_name: string;
  company_nip: string;
  company_city: string;
  owner_first_name: string;
  owner_last_name: string;
  owner_email: string;
  owner_phone: string;
  status: string;
  active_listings_count: number;
  created_at: string;
}

interface DashboardStats {
  totalAgencies: number;
  verifiedAgencies: number;
  pendingAgencies: number;
  totalListings: number;
  activeListings: number;
}

const AdminRealEstate = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [userEmail, setUserEmail] = useState('');
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalAgencies: 0,
    verifiedAgencies: 0,
    pendingAgencies: 0,
    totalListings: 0,
    activeListings: 0,
  });
  const [loading, setLoading] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);

  // PWA install prompt detection
  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsAppInstalled(true);
    }

    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsAppInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      navigate('/install');
    }
  };

  // Admin role guard
  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      toast({
        title: 'Brak dostępu',
        description: 'Nie masz uprawnień administratora',
        variant: 'destructive',
      });
      navigate('/auth');
    }
  }, [roleLoading, isAdmin, navigate]);

  // Fetch user email
  useEffect(() => {
    const fetchUserEmail = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
      }
    };
    fetchUserEmail();
  }, []);

  // Fetch agencies and stats
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch agencies
        const { data: agenciesData, error: agenciesError } = await supabase
          .from('real_estate_agents')
          .select('*')
          .is('parent_agent_id', null)
          .order('created_at', { ascending: false });

        if (agenciesError) throw agenciesError;

        setAgencies(agenciesData || []);

        // Calculate stats
        const verified = agenciesData?.filter((a) => a.status === 'verified').length || 0;
        const pending = agenciesData?.filter((a) => a.status === 'pending').length || 0;

        // Fetch listings count
        const { count: listingsCount } = await supabase
          .from('real_estate_listings')
          .select('*', { count: 'exact', head: true });

        const { count: activeListingsCount } = await supabase
          .from('real_estate_listings')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active');

        setStats({
          totalAgencies: agenciesData?.length || 0,
          verifiedAgencies: verified,
          pendingAgencies: pending,
          totalListings: listingsCount || 0,
          activeListings: activeListingsCount || 0,
        });
      } catch (error) {
        console.error('Error fetching data:', error);
        toast({
          title: 'Błąd',
          description: 'Nie udało się pobrać danych',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  const handleLogout = () => {
    navigate('/');
  };

  const handleVerifyAgency = async (agencyId: string) => {
    try {
      const { error } = await supabase
        .from('real_estate_agents')
        .update({ status: 'verified' })
        .eq('id', agencyId);

      if (error) throw error;

      setAgencies((prev) =>
        prev.map((a) => (a.id === agencyId ? { ...a, status: 'verified' } : a))
      );
      setStats((prev) => ({
        ...prev,
        verifiedAgencies: prev.verifiedAgencies + 1,
        pendingAgencies: prev.pendingAgencies - 1,
      }));

      toast({
        title: 'Sukces',
        description: 'Agencja została zweryfikowana',
      });
    } catch (error) {
      console.error('Error verifying agency:', error);
      toast({
        title: 'Błąd',
        description: 'Nie udało się zweryfikować agencji',
        variant: 'destructive',
      });
    }
  };

  const handleSuspendAgency = async (agencyId: string) => {
    try {
      const { error } = await supabase
        .from('real_estate_agents')
        .update({ status: 'suspended' })
        .eq('id', agencyId);

      if (error) throw error;

      setAgencies((prev) =>
        prev.map((a) => (a.id === agencyId ? { ...a, status: 'suspended' } : a))
      );

      toast({
        title: 'Sukces',
        description: 'Agencja została zawieszona',
      });
    } catch (error) {
      console.error('Error suspending agency:', error);
      toast({
        title: 'Błąd',
        description: 'Nie udało się zawiesić agencji',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
            <CheckCircle className="h-3 w-3 mr-1" />
            Zweryfikowana
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
            <Clock className="h-3 w-3 mr-1" />
            Oczekuje
          </Badge>
        );
      case 'suspended':
        return (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
            <XCircle className="h-3 w-3 mr-1" />
            Zawieszona
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const tabItems = [
    { value: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { value: 'agencies', label: 'Agencje', icon: Building2 },
    { value: 'agents', label: 'Agenci', icon: Users },
    { value: 'listings', label: 'Ogłoszenia', icon: FileText },
    { value: 'paid-services', label: 'Płatne usługi', icon: CreditCard },
    { value: 'settings', label: 'Ustawienia', icon: Settings },
  ];

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

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
                alt="Get RIDO Logo"
                className="h-6 w-6"
              />
              <AdminPortalSwitcher />
            </div>
            <div className="flex items-center space-x-3">
              <UserDropdown
                userName="Administrator"
                userRole="Admin Nieruchomości"
                userEmail={userEmail}
                onLogout={handleLogout}
              />
              {!isAppInstalled && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleInstallClick}
                  className="rounded-lg"
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
              <div className="scale-90">
                <SystemAlertsButton />
              </div>
            </div>
          </div>

          {/* Mobile header */}
          <div className="md:hidden flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <img
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png"
                alt="Get RIDO Logo"
                className="h-6 w-6"
              />
              <span className="text-sm font-semibold text-primary">
                Admin Nieruchomości
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <AdminPortalSwitcher />
              <SystemAlertsButton />
              <UserDropdown
                userName="Admin"
                userRole="Administrator"
                userEmail={userEmail}
                onLogout={handleLogout}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Desktop - TabsPill */}
          <div className="hidden md:block">
            <TabsPill value={activeTab} onValueChange={setActiveTab}>
              {tabItems.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  <item.icon className="h-4 w-4 mr-2" />
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsPill>
          </div>

          {/* Mobile - Hamburger menu */}
          <div className="md:hidden mb-3">
            <Sheet>
              <SheetTrigger asChild>
                <div className="rounded-xl bg-primary shadow-sm p-1.5 w-fit">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:bg-primary/90"
                  >
                    <Menu className="h-4 w-4 text-white" />
                  </Button>
                </div>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-64 bg-gradient-to-b from-primary/5 to-background"
              >
                <div className="space-y-2 mt-6">
                  {tabItems.map((item) => (
                    <SheetTrigger key={item.value} asChild>
                      <Button
                        variant={activeTab === item.value ? 'default' : 'ghost'}
                        className="w-full justify-start rounded-xl transition-all"
                        onClick={() => setActiveTab(item.value)}
                      >
                        <item.icon className="h-4 w-4 mr-2" />
                        {item.label}
                      </Button>
                    </SheetTrigger>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Wszystkie agencje
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalAgencies}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Zweryfikowane
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {stats.verifiedAgencies}
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
                  <div className="text-2xl font-bold text-yellow-600">
                    {stats.pendingAgencies}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Aktywne ogłoszenia
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {stats.activeListings}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Pending agencies */}
            {stats.pendingAgencies > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-yellow-600" />
                    Agencje oczekujące na weryfikację
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {agencies
                      .filter((a) => a.status === 'pending')
                      .map((agency) => (
                        <div
                          key={agency.id}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                        >
                          <div>
                            <p className="font-medium">{agency.company_name}</p>
                            <p className="text-sm text-muted-foreground">
                              NIP: {agency.company_nip} • {agency.company_city}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleVerifyAgency(agency.id)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Weryfikuj
                          </Button>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Agencies Tab */}
          <TabsContent value="agencies" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Lista agencji nieruchomości
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : agencies.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    Brak zarejestrowanych agencji
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nazwa firmy</TableHead>
                        <TableHead>NIP</TableHead>
                        <TableHead>Miasto</TableHead>
                        <TableHead>Właściciel</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ogłoszenia</TableHead>
                        <TableHead>Akcje</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agencies.map((agency) => (
                        <TableRow key={agency.id}>
                          <TableCell className="font-medium">
                            {agency.company_name}
                          </TableCell>
                          <TableCell>{agency.company_nip}</TableCell>
                          <TableCell>{agency.company_city}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {agency.owner_first_name} {agency.owner_last_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {agency.owner_email}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(agency.status)}</TableCell>
                          <TableCell>{agency.active_listings_count}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {agency.status === 'pending' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleVerifyAgency(agency.id)}
                                >
                                  Weryfikuj
                                </Button>
                              )}
                              {agency.status === 'verified' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600"
                                  onClick={() => handleSuspendAgency(agency.id)}
                                >
                                  Zawieś
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Agents Tab */}
          <TabsContent value="agents" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Agenci nieruchomości
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-center py-8 text-muted-foreground">
                  Lista agentów (pracowników) agencji - w przygotowaniu
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Listings Tab */}
          <TabsContent value="listings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Ogłoszenia nieruchomości
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-center py-8 text-muted-foreground">
                  Moderacja ogłoszeń - w przygotowaniu
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Paid Services Tab */}
          <TabsContent value="paid-services" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Płatne usługi
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-center py-8 text-muted-foreground">
                  Promowanie ogłoszeń i pakiety premium - w przygotowaniu
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Ustawienia modułu nieruchomości
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-center py-8 text-muted-foreground">
                  Limity, reguły publikacji, konfiguracja - w przygotowaniu
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminRealEstate;
