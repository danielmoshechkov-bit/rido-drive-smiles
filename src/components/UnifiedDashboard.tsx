import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SystemAlertsButton } from "@/components/SystemAlertsButton";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, FileText, Users, DollarSign, Car, BarChart, Settings, BarChart3 } from "lucide-react";
import LanguageSelector from "@/components/LanguageSelector";

interface UnifiedDashboardProps {
  userType: 'admin' | 'fleet';
  fleetId?: string | null;
  fleetName?: string;
  userName?: string;
  onLogout: () => void;
}

export function UnifiedDashboard({ userType, fleetId, fleetName, userName, onLogout }: UnifiedDashboardProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('');
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [sanitizing, setSanitizing] = useState(false);
  const [cleaningAccounts, setCleaningAccounts] = useState(false);
  const [creatingAccounts, setCreatingAccounts] = useState(false);
  
  const { cities } = useCities();
  const { drivers, loading: driversLoading, refetch: refetchDrivers } = useDrivers({ cityId: selectedCity?.id });
  const { canViewTab, loading: permissionsLoading } = useTabPermissions();
  const { roles } = useUserRole();
  const [myDriverId, setMyDriverId] = useState<string | null>(null);

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
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <img 
              src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
              alt="Get RIDO Logo" 
              className="h-8 w-8"
            />
            <h1 className="text-xl font-bold text-primary">
              {userType === 'admin' 
                ? t('admin.dashboard') 
                : `Panel Flotowy - ${fleetName}${userName ? ` - ${userName}` : ''}`
              }
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <SystemAlertsButton userType={userType} fleetId={fleetId || undefined} />
            <LanguageSelector />
            <Button variant="outline" onClick={onLogout}>
              {t('admin.logout')}
            </Button>
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
      <div className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-gradient-hero text-primary-foreground rounded-lg p-1 shadow-purple h-auto w-full flex flex-wrap gap-1">
            {canViewTab('weekly-report') && (
              <TabsTrigger value="weekly-report" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md hover:bg-white/5 transition-all px-3 py-1.5 text-sm font-medium">
                <BarChart className="h-4 w-4 mr-2" />
                {t('admin.weeklyReport')}
              </TabsTrigger>
            )}
            {canViewTab('settlements') && (
              <TabsTrigger value="settlements" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md hover:bg-white/5 transition-all px-3 py-1.5 text-sm font-medium">
                <DollarSign className="h-4 w-4 mr-2" />
                {t('admin.settlements')}
              </TabsTrigger>
            )}
            {canViewTab('drivers-list') && (
              <TabsTrigger value="drivers-list" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md hover:bg-white/5 transition-all px-3 py-1.5 text-sm font-medium">
                <Users className="h-4 w-4 mr-2" />
                {t('admin.driversList')}
              </TabsTrigger>
            )}
            {canViewTab('fleet') && (
              <TabsTrigger value="fleet" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md hover:bg-white/5 transition-all px-3 py-1.5 text-sm font-medium">
                <Car className="h-4 w-4 mr-2" />
                Flota
              </TabsTrigger>
            )}
            {canViewTab('documents') && (
              <TabsTrigger value="documents" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md hover:bg-white/5 transition-all px-3 py-1.5 text-sm font-medium">
                <FileText className="h-4 w-4 mr-2" />
                Dokumenty
              </TabsTrigger>
            )}
            {canViewTab('fleet-accounts') && (
              <TabsTrigger value="fleet-accounts" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md hover:bg-white/5 transition-all px-3 py-1.5 text-sm font-medium">
                Konta flotowe
              </TabsTrigger>
            )}
            {canViewTab('user-roles') && (
              <TabsTrigger value="user-roles" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md hover:bg-white/5 transition-all px-3 py-1.5 text-sm font-medium">
                Uprawnienia
              </TabsTrigger>
            )}
            {canViewTab('plans') && (
              <TabsTrigger value="plans" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md hover:bg-white/5 transition-all px-3 py-1.5 text-sm font-medium">
                Plany
              </TabsTrigger>
            )}
            {canViewTab('visibility') && (
              <TabsTrigger value="visibility" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md hover:bg-white/5 transition-all px-3 py-1.5 text-sm font-medium">
                Widoczność
              </TabsTrigger>
            )}
            {canViewTab('tab-visibility') && (
              <TabsTrigger value="tab-visibility" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md hover:bg-white/5 transition-all px-3 py-1.5 text-sm font-medium">
                Widoczność zakładek
              </TabsTrigger>
            )}
            {canViewTab('data-import') && (
              <TabsTrigger value="data-import" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md hover:bg-white/5 transition-all px-3 py-1.5 text-sm font-medium">
                {t('admin.dataImport')}
              </TabsTrigger>
            )}
            {canViewTab('settings') && (
              <TabsTrigger value="settings" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md hover:bg-white/5 transition-all px-3 py-1.5 text-sm font-medium">
                <Settings className="h-4 w-4 mr-2" />
                {t('admin.settings')}
              </TabsTrigger>
            )}
            {canViewTab('reports') && (
              <TabsTrigger value="reports" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md hover:bg-white/5 transition-all px-3 py-1.5 text-sm font-medium">
                <BarChart3 className="h-4 w-4 mr-2" />
                {t('admin.reports')}
              </TabsTrigger>
            )}
            {roles.includes('driver') && myDriverId && !roles.includes('fleet_rental') && !roles.includes('fleet_settlement') && (
              <TabsTrigger value="my-settlements" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md hover:bg-white/5 transition-all px-3 py-1.5 text-sm font-medium">
                <DollarSign className="h-4 w-4 mr-2" />
                Moje rozliczenia
              </TabsTrigger>
            )}
          </TabsList>

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

          {canViewTab('reports') && (
            <TabsContent value="reports" className="space-y-6">
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">Moduł raportów w budowie</p>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
