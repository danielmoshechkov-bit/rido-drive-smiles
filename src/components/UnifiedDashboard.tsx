import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SystemAlertsButton } from "@/components/SystemAlertsButton";
import { useSystemAlerts } from "@/hooks/useSystemAlerts";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { CitySelector } from "@/components/CitySelector";
import { CSVUpload } from "@/components/CSVUpload";
import { useCities, City } from "@/hooks/useCities";
import { useDrivers } from "@/hooks/useDrivers";
import { DriversManagement } from "@/components/DriversManagement";
import { SettlementsManagement } from "@/components/SettlementsManagement";
import { FleetManagement } from "@/components/FleetManagement";
import { DocumentsManagement } from "@/components/DocumentsManagement";
import RidoSettings from "@/components/RidoSettings";
import { SettlementVisibilitySettings } from "@/components/SettlementVisibilitySettings";
import { SettlementPlansManagement } from "@/components/SettlementPlansManagement";
import { FleetAccountsManagement } from "@/components/FleetAccountsManagement";
import { UserRolesManager } from "@/components/UserRolesManager";
import { TabVisibilityManager } from "@/components/TabVisibilityManager";
import { FleetSettlementsView } from "@/components/FleetSettlementsView";
import { DriverSettlements } from "@/components/DriverSettlements";
import { FleetVehicleRevenue } from "@/components/FleetVehicleRevenue";
import { useTabPermissions } from "@/hooks/useTabPermissions";
import { useUserRole } from "@/hooks/useUserRole";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, FileText, Users, DollarSign, Car, BarChart, Settings, BarChart3, Info, Menu, Download, ShoppingCart } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import LanguageSelector from "@/components/LanguageSelector";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { TabsPill } from "@/components/ui/TabsPill";
import { UserDropdown } from "@/components/UserDropdown";

interface UnifiedDashboardProps {
  userType: 'admin' | 'fleet';
  fleetId?: string | null;
  fleetName?: string;
  userName?: string;
  userEmail?: string;
  onLogout: () => void;
}

export function UnifiedDashboard({ userType, fleetId, fleetName, userName, userEmail, onLogout }: UnifiedDashboardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('');
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [sanitizing, setSanitizing] = useState(false);
  const [cleaningAccounts, setCleaningAccounts] = useState(false);
  const [creatingAccounts, setCreatingAccounts] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  
  const { cities } = useCities();
  const { drivers, loading: driversLoading, refetch: refetchDrivers } = useDrivers({ cityId: selectedCity?.id });
  const { canViewTab, loading: permissionsLoading } = useTabPermissions();
  const { roles } = useUserRole();
  const { isMarketplaceEnabled } = useFeatureToggles();
  const [myDriverId, setMyDriverId] = useState<string | null>(null);

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

  // Set initial tab based on permissions
  useEffect(() => {
    if (!permissionsLoading && !activeTab) {
      if (canViewTab('settlements')) setActiveTab('settlements');
      else if (canViewTab('fleet')) setActiveTab('fleet');
      else if (canViewTab('drivers-list')) setActiveTab('drivers-list');
      else if (canViewTab('weekly-report')) setActiveTab('weekly-report');
      else if (canViewTab('documents')) setActiveTab('documents');
      else if (canViewTab('reports')) setActiveTab('reports');
    }
  }, [canViewTab, permissionsLoading, activeTab]);

  // Auto-select Warszawa or first city when cities load (admin only)
  useEffect(() => {
    if (userType === 'admin' && cities.length > 0 && !selectedCity) {
      const warszawa = cities.find(city => city.name === 'Warszawa');
      setSelectedCity(warszawa || cities[0]);
    }
  }, [cities, selectedCity, userType]);

  // Fetch my driver_id if I'm also a driver
  useEffect(() => {
    if (roles.includes('driver')) {
      const fetchMyDriverId = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('driver_app_users')
            .select('driver_id')
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (data?.driver_id) {
            setMyDriverId(data.driver_id);
          }
        }
      };
      fetchMyDriverId();
    }
  }, [roles]);

  const handleSanitizeGetRidoIds = async () => {
    if (!selectedCity) {
      toast({ title: "Błąd", description: "Wybierz miasto", variant: "destructive" });
      return;
    }

    setSanitizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sanitize-getrido', {
        body: { city_id: selectedCity.id }
      });

      if (error) throw error;

      toast({
        title: "Sukces",
        description: `Wyczyszczono ${data.sanitized_count} z ${data.total_checked} kierowców.`,
      });
    } catch (error: any) {
      toast({
        title: "Błąd podczas czyszczenia GetRido ID",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSanitizing(false);
    }
  };

  const handleCleanupFakeAccounts = async () => {
    setCleaningAccounts(true);
    try {
      const { data, error } = await supabase.functions.invoke('cleanup-fake-auth-accounts');
      
      if (error) throw error;
      
      toast({
        title: "Czyszczenie zakończone",
        description: `Usunięto ${data.results.deleted} kont z @rido.internal.`,
      });
    } catch (error) {
      toast({
        title: "Błąd",
        description: error instanceof Error ? error.message : "Nie udało się wyczyścić kont",
        variant: "destructive",
      });
    } finally {
      setCleaningAccounts(false);
    }
  };

  const handleCreateDriverAccounts = async () => {
    setCreatingAccounts(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-driver-accounts');
      
      if (error) throw error;
      
      toast({
        title: "Tworzenie kont zakończone",
        description: `Utworzono: ${data.results.created}, Istniało: ${data.results.already_exists}`,
      });
    } catch (error) {
      toast({
        title: "Błąd",
        description: error instanceof Error ? error.message : "Nie udało się utworzyć kont",
        variant: "destructive",
      });
    } finally {
      setCreatingAccounts(false);
    }
  };

  if (permissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const weeklyStats = {
    totalDrivers: drivers.length,
    totalEarnings: 0,
    totalTrips: 0,
    averageRating: 0
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-3">
          {/* Desktop header */}
          <div className="hidden md:flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="Get RIDO Logo" 
                className="h-6 w-6"
              />
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-primary">
                  {userType === 'admin' ? 'Panel Administracyjny' : `Panel Flotowy - ${fleetName}`}
                </span>
                {userName && (
                  <>
                    <span className="text-muted-foreground">-</span>
                    <span className="font-medium text-foreground">{userName}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {isMarketplaceEnabled && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => navigate('/gielda')} 
                  className="rounded-lg gap-2"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Giełda aut
                </Button>
              )}
              <UserDropdown 
                userName={userName || (userType === 'admin' ? 'Admin' : 'Fleet Manager')}
                userRole={userType === 'admin' ? 'Administrator' : 'Fleet Manager'}
                userEmail={userEmail}
                fleetName={userType === 'fleet' ? fleetName : undefined}
                onLogout={onLogout}
              />
              {!isAppInstalled && (
                <Button variant="outline" size="sm" onClick={handleInstallClick} className="rounded-lg">
                  <Download className="h-4 w-4" />
                </Button>
              )}
              <div className="scale-90">
                <SystemAlertsButton userType={userType} fleetId={fleetId || undefined} />
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
              <span className="text-sm font-semibold text-primary truncate max-w-[150px]">
                {userType === 'admin' ? 'Panel Admin' : fleetName}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <SystemAlertsButton userType={userType} fleetId={fleetId || undefined} />
              {!isAppInstalled && (
                <Button variant="outline" size="icon" onClick={handleInstallClick} className="rounded-lg h-8 w-8">
                  <Download className="h-4 w-4" />
                </Button>
              )}
              <UserDropdown 
                userName={userName || (userType === 'admin' ? 'Admin' : 'User')}
                userRole={userType === 'admin' ? 'Administrator' : 'Fleet Manager'}
                userEmail={userEmail}
                fleetName={userType === 'fleet' ? fleetName : undefined}
                onLogout={onLogout}
              />
            </div>
          </div>
        </div>
      </div>

      {/* City Selector (admin only) */}
      {userType === 'admin' && (
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Wybierz miasto:</h2>
            <CitySelector selectedCity={selectedCity} onCitySelect={setSelectedCity} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Desktop - TabsPill */}
          <div className="hidden md:block">
            <TabsPill value={activeTab} onValueChange={setActiveTab}>
              {canViewTab('weekly-report') && (
                <TabsTrigger value="weekly-report">
                  <BarChart className="h-4 w-4 mr-2" />
                  {t('admin.weeklyReport')}
                </TabsTrigger>
              )}
              {canViewTab('settlements') && (
                <TabsTrigger value="settlements">
                  <DollarSign className="h-4 w-4 mr-2" />
                  {t('admin.settlements')}
                </TabsTrigger>
              )}
              {canViewTab('drivers-list') && (
                <TabsTrigger value="drivers-list">
                  <Users className="h-4 w-4 mr-2" />
                  {t('admin.driversList')}
                </TabsTrigger>
              )}
              {canViewTab('fleet') && (
                <TabsTrigger value="fleet">
                  <Car className="h-4 w-4 mr-2" />
                  Flota
                </TabsTrigger>
              )}
              {canViewTab('documents') && (
                <TabsTrigger value="documents">
                  <FileText className="h-4 w-4 mr-2" />
                  Dokumenty
                </TabsTrigger>
              )}
              {canViewTab('system-alerts') && (
                <TabsTrigger value="system-alerts">
                  <Info className="h-4 w-4 mr-2" />
                  Informacje
                </TabsTrigger>
              )}
              {canViewTab('fleet-accounts') && (
                <TabsTrigger value="fleet-accounts">
                  Konta flotowe
                </TabsTrigger>
              )}
              {canViewTab('user-roles') && (
                <TabsTrigger value="user-roles">
                  Uprawnienia
                </TabsTrigger>
              )}
              {canViewTab('plans') && (
                <TabsTrigger value="plans">
                  Plany
                </TabsTrigger>
              )}
              {canViewTab('visibility') && (
                <TabsTrigger value="visibility">
                  Widoczność
                </TabsTrigger>
              )}
              {canViewTab('tab-visibility') && (
                <TabsTrigger value="tab-visibility">
                  Widoczność zakładek
                </TabsTrigger>
              )}
              {canViewTab('data-import') && (
                <TabsTrigger value="data-import">
                  {t('admin.dataImport')}
                </TabsTrigger>
              )}
              {canViewTab('settings') && (
                <TabsTrigger value="settings">
                  <Settings className="h-4 w-4 mr-2" />
                  {t('admin.settings')}
                </TabsTrigger>
              )}
              {userType === 'fleet' && (
                <TabsTrigger value="informacje">
                  <Info className="h-4 w-4 mr-2" />
                  Informacje
                </TabsTrigger>
              )}
              {roles.includes('driver') && myDriverId && !roles.includes('fleet_rental') && !roles.includes('fleet_settlement') && (
                <TabsTrigger value="my-settlements">
                  <DollarSign className="h-4 w-4 mr-2" />
                  Moje rozliczenia
                </TabsTrigger>
              )}
            </TabsPill>
          </div>

          {/* Mobile - Hamburger menu */}
          <div className="md:hidden mb-3">
            <Sheet>
              <SheetTrigger asChild>
                <div className="rounded-xl bg-primary shadow-sm p-1.5 w-fit">
                  <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-primary/90">
                    <Menu className="h-4 w-4 text-white" />
                  </Button>
                </div>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 bg-gradient-to-b from-primary/5 to-background">
                <div className="space-y-2 mt-6">
                  {canViewTab('weekly-report') && (
                    <SheetTrigger asChild>
                      <Button 
                        variant={activeTab === 'weekly-report' ? 'default' : 'ghost'} 
                        className="w-full justify-start rounded-xl transition-all"
                        onClick={() => setActiveTab('weekly-report')}
                      >
                        <BarChart className="h-4 w-4 mr-2" />
                        {t('admin.weeklyReport')}
                      </Button>
                    </SheetTrigger>
                  )}
                  {canViewTab('settlements') && (
                    <SheetTrigger asChild>
                      <Button 
                        variant={activeTab === 'settlements' ? 'default' : 'ghost'} 
                        className="w-full justify-start rounded-xl transition-all"
                        onClick={() => setActiveTab('settlements')}
                      >
                        <DollarSign className="h-4 w-4 mr-2" />
                        {t('admin.settlements')}
                      </Button>
                    </SheetTrigger>
                  )}
                  {canViewTab('drivers-list') && (
                    <SheetTrigger asChild>
                      <Button 
                        variant={activeTab === 'drivers-list' ? 'default' : 'ghost'} 
                        className="w-full justify-start rounded-xl transition-all"
                        onClick={() => setActiveTab('drivers-list')}
                      >
                        <Users className="h-4 w-4 mr-2" />
                        {t('admin.driversList')}
                      </Button>
                    </SheetTrigger>
                  )}
                  {canViewTab('fleet') && (
                    <SheetTrigger asChild>
                      <Button 
                        variant={activeTab === 'fleet' ? 'default' : 'ghost'} 
                        className="w-full justify-start rounded-xl transition-all"
                        onClick={() => setActiveTab('fleet')}
                      >
                        <Car className="h-4 w-4 mr-2" />
                        Flota
                      </Button>
                    </SheetTrigger>
                  )}
                  {canViewTab('documents') && (
                    <SheetTrigger asChild>
                      <Button 
                        variant={activeTab === 'documents' ? 'default' : 'ghost'} 
                        className="w-full justify-start rounded-xl transition-all"
                        onClick={() => setActiveTab('documents')}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Dokumenty
                      </Button>
                    </SheetTrigger>
                  )}
                  {canViewTab('system-alerts') && (
                    <SheetTrigger asChild>
                      <Button 
                        variant={activeTab === 'system-alerts' ? 'default' : 'ghost'} 
                        className="w-full justify-start rounded-xl transition-all"
                        onClick={() => setActiveTab('system-alerts')}
                      >
                        <Info className="h-4 w-4 mr-2" />
                        Informacje
                      </Button>
                    </SheetTrigger>
                  )}
                  {canViewTab('settings') && (
                    <SheetTrigger asChild>
                      <Button 
                        variant={activeTab === 'settings' ? 'default' : 'ghost'} 
                        className="w-full justify-start rounded-xl transition-all"
                        onClick={() => setActiveTab('settings')}
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        {t('admin.settings')}
                      </Button>
                    </SheetTrigger>
                  )}
                  {userType === 'fleet' && (
                    <SheetTrigger asChild>
                      <Button 
                        variant={activeTab === 'informacje' ? 'default' : 'ghost'} 
                        className="w-full justify-start rounded-xl transition-all"
                        onClick={() => setActiveTab('informacje')}
                      >
                        <Info className="h-4 w-4 mr-2" />
                        Informacje
                      </Button>
                    </SheetTrigger>
                  )}
                  {roles.includes('driver') && myDriverId && (
                    <SheetTrigger asChild>
                      <Button 
                        variant={activeTab === 'my-settlements' ? 'default' : 'ghost'} 
                        className="w-full justify-start rounded-xl transition-all"
                        onClick={() => setActiveTab('my-settlements')}
                      >
                        <DollarSign className="h-4 w-4 mr-2" />
                        Moje rozliczenia
                      </Button>
                    </SheetTrigger>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {canViewTab('weekly-report') && (
            <TabsContent value="weekly-report" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="text-sm text-muted-foreground mb-2">Łączna liczba kierowców</div>
                    <div className="text-2xl font-bold">{weeklyStats.totalDrivers}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="text-sm text-muted-foreground mb-2">Łączne zarobki</div>
                    <div className="text-2xl font-bold">{weeklyStats.totalEarnings.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="text-sm text-muted-foreground mb-2">Łączna liczba kursów</div>
                    <div className="text-2xl font-bold">{weeklyStats.totalTrips}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="text-sm text-muted-foreground mb-2">Średnia ocena</div>
                    <div className="text-2xl font-bold">{weeklyStats.averageRating}/5</div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}

          {canViewTab('settlements') && (
            <TabsContent value="settlements" className="space-y-6">
              {userType === 'fleet' ? (
                <FleetSettlementsView 
                  fleetId={fleetId!}
                  viewType="settlement"
                />
              ) : userType === 'admin' && !selectedCity ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">Wybierz miasto aby zobaczyć rozliczenia</p>
                  </CardContent>
                </Card>
              ) : (
                <SettlementsManagement 
                  cityId={selectedCity?.id || null}
                  cityName={selectedCity?.name || ''}
                  userType="admin"
                />
              )}
            </TabsContent>
          )}

          {roles.includes('driver') && myDriverId && (
            <TabsContent value="my-settlements" className="space-y-6">
              <DriverSettlements 
                driverId={myDriverId}
                hideControls={false}
              />
            </TabsContent>
          )}

          {canViewTab('drivers-list') && (
            <TabsContent value="drivers-list" className="space-y-6">
              {userType === 'admin' && !selectedCity ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">Wybierz miasto aby zobaczyć listę kierowców</p>
                  </CardContent>
                </Card>
              ) : (
                <DriversManagement 
                  cityId={userType === 'admin' ? selectedCity?.id : null}
                  cityName={userType === 'admin' ? selectedCity?.name || '' : fleetName || ''}
                  onDriverUpdate={refetchDrivers}
                  fleetId={userType === 'fleet' ? fleetId : null}
                  mode={userType}
                />
              )}
            </TabsContent>
          )}

          {canViewTab('fleet') && (
            <TabsContent value="fleet" className="space-y-6">
              {userType === 'admin' && !selectedCity ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">Wybierz miasto aby zobaczyć flotę</p>
                  </CardContent>
                </Card>
              ) : (
              <FleetManagement 
                cityId={userType === 'admin' ? selectedCity?.id : null}
                cityName={userType === 'admin' ? selectedCity?.name || '' : fleetName || ''}
                fleetId={userType === 'fleet' ? fleetId : null}
                userType={userType}
              />
              )}
            </TabsContent>
          )}

          {canViewTab('documents') && (
            <TabsContent value="documents" className="space-y-6">
              {userType === 'admin' && !selectedCity ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">Wybierz miasto aby zarządzać dokumentami</p>
                  </CardContent>
                </Card>
              ) : (
                <DocumentsManagement 
                  cityId={userType === 'admin' ? selectedCity?.id : null}
                  cityName={userType === 'admin' ? selectedCity?.name || '' : fleetName || ''}
                />
              )}
            </TabsContent>
          )}

          {canViewTab('system-alerts') && fleetId && (
            <TabsContent value="system-alerts" className="space-y-6">
              <FleetSystemAlerts fleetId={fleetId} />
            </TabsContent>
          )}

          {canViewTab('system-alerts') && fleetId && (
            <TabsContent value="system-alerts" className="space-y-6">
              <FleetSystemAlerts fleetId={fleetId} />
            </TabsContent>
          )}

          {canViewTab('plans') && (
            <TabsContent value="plans" className="space-y-6">
              <SettlementPlansManagement />
            </TabsContent>
          )}

          {canViewTab('fleet-accounts') && (
            <TabsContent value="fleet-accounts" className="space-y-6">
              <FleetAccountsManagement />
            </TabsContent>
          )}

          {canViewTab('user-roles') && (
            <TabsContent value="user-roles" className="space-y-6">
              <UserRolesManager />
            </TabsContent>
          )}

          {canViewTab('visibility') && (
            <TabsContent value="visibility" className="space-y-6">
              <SettlementVisibilitySettings />
            </TabsContent>
          )}

          {canViewTab('tab-visibility') && (
            <TabsContent value="tab-visibility" className="space-y-6">
              <TabVisibilityManager />
            </TabsContent>
          )}

          {canViewTab('data-import') && userType === 'admin' && (
            <TabsContent value="data-import" className="space-y-6">
              {!selectedCity ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">Wybierz miasto aby zaimportować dane</p>
                  </CardContent>
                </Card>
              ) : (
                <CSVUpload cityId={selectedCity.id} onUploadComplete={refetchDrivers} />
              )}
            </TabsContent>
          )}

          {canViewTab('settings') && userType === 'admin' && (
            <TabsContent value="settings" className="space-y-6">
              <RidoSettings />
              
              <Card>
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-semibold">Zarządzanie kontami Auth</h3>
                  <div className="flex gap-2">
                    <Button onClick={handleCleanupFakeAccounts} disabled={cleaningAccounts} variant="outline">
                      {cleaningAccounts && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Wyczyść stare konta
                    </Button>
                    <Button onClick={handleCreateDriverAccounts} disabled={creatingAccounts} variant="outline">
                      {creatingAccounts && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Utwórz konta kierowców
                    </Button>
                    <Button onClick={handleSanitizeGetRidoIds} disabled={sanitizing} variant="outline">
                      {sanitizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Sanityzuj GetRido ID
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}


          {userType === 'fleet' && fleetId && (
            <TabsContent value="informacje" className="space-y-6">
              <FleetSystemAlerts fleetId={fleetId} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

// Component to display system alerts for fleet
function FleetSystemAlerts({ fleetId }: { fleetId: string }) {
  const { alerts, loading, markAsResolved } = useSystemAlerts({ fleetId });
  const pendingAlerts = alerts.filter(a => a.status === 'pending');

  if (loading) {
    return <div className="text-center py-8">Ładowanie powiadomień...</div>;
  }

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'error': return 'destructive';
      case 'warning': return 'secondary';
      case 'new_driver': return 'default';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-4">
      {pendingAlerts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Brak nowych powiadomień</CardTitle>
            <CardDescription>Wszystkie powiadomienia zostały przeczytane</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        pendingAlerts.map(alert => (
          <Card key={alert.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{alert.title}</CardTitle>
                    <Badge variant={getAlertColor(alert.type) as any}>
                      {alert.type}
                    </Badge>
                  </div>
                  <CardDescription>{alert.description}</CardDescription>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(alert.created_at), 'dd MMM yyyy, HH:mm', { locale: pl })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markAsResolved(alert.id)}
                >
                  Oznacz jako przeczytane
                </Button>
              </div>
            </CardHeader>
          </Card>
        ))
      )}
    </div>
  );
}
