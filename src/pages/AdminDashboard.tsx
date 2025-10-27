import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import LanguageSelector from "@/components/LanguageSelector";
import { CitySelector } from "@/components/CitySelector";
import { CSVUpload } from "@/components/CSVUpload";
import { useCities, City } from "@/hooks/useCities";
import { useDrivers } from "@/hooks/useDrivers";
import { DriversManagement } from "@/components/DriversManagement";
import { SettlementsManagement } from "@/components/SettlementsManagement";
import { FleetManagement } from "@/components/FleetManagement";
import { DocumentsManagement } from "@/components/DocumentsManagement";
import RidoSettings from "@/components/RidoSettings";
import { SystemAlertsButton } from "@/components/SystemAlertsButton";
import { SettlementVisibilitySettings } from "@/components/SettlementVisibilitySettings";
import { RebuildDriversModal } from "@/components/RebuildDriversModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const AdminDashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('weekly-report');
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [cleaningAccounts, setCleaningAccounts] = useState(false);
  const [creatingAccounts, setCreatingAccounts] = useState(false);
  const [showRebuildModal, setShowRebuildModal] = useState(false);
  const [sanitizing, setSanitizing] = useState(false);
  
  const { cities } = useCities();
  const { drivers, loading: driversLoading, refetch: refetchDrivers } = useDrivers(selectedCity?.id);

  // Auto-select Warszawa or first city when cities load
  useEffect(() => {
    if (cities.length > 0 && !selectedCity) {
      const warszawa = cities.find(city => city.name === 'Warszawa');
      setSelectedCity(warszawa || cities[0]);
    }
  }, [cities, selectedCity]);

  const handleLogout = () => {
    navigate('/');
  };

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
        description: `Wyczyszczono ${data.sanitized_count} z ${data.total_checked} kierowców. ${
          data.sanitized_count > 0 
            ? "Nieprawidłowe GetRido ID (UUID, email, numeryczne, platform ID) zostały wyczyszczone."
            : "Wszystkie GetRido ID są poprawne."
        }`,
      });
    } catch (error: any) {
      console.error('Sanitize error:', error);
      toast({
        title: "Błąd podczas czyszczenia GetRido ID",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSanitizing(false);
    }
  };

  // Dynamic stats based on real data
  const weeklyStats = {
    totalDrivers: drivers.length,
    totalEarnings: 0, // TODO: Calculate from settlements
    totalTrips: 0, // TODO: Calculate from settlements
    averageRating: 0 // TODO: Calculate from settlements
  };

  const getServiceColor = (service: string) => {
    switch (service.toLowerCase()) {
      case 'uber': return 'bg-black text-white';
      case 'bolt': return 'bg-green-500 text-white';
      case 'freenow': return 'bg-red-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const handleCleanupFakeAccounts = async () => {
    setCleaningAccounts(true);
    try {
      const { data, error } = await supabase.functions.invoke('cleanup-fake-auth-accounts');
      
      if (error) throw error;
      
      toast({
        title: "Czyszczenie zakończone",
        description: `Usunięto ${data.results.deleted} kont z @rido.internal. Błędów: ${data.results.errors.length}`,
      });
    } catch (error) {
      console.error('Error cleaning up accounts:', error);
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
        description: `Utworzono: ${data.results.created}, Istniało: ${data.results.already_exists}, Błędów: ${data.results.errors.length}`,
      });
    } catch (error) {
      console.error('Error creating accounts:', error);
      toast({
        title: "Błąd",
        description: error instanceof Error ? error.message : "Nie udało się utworzyć kont",
        variant: "destructive",
      });
    } finally {
      setCreatingAccounts(false);
    }
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
            <h1 className="text-xl font-bold text-primary">{t('admin.dashboard')}</h1>
          </div>
          <div className="flex items-center space-x-4">
            <SystemAlertsButton />
            <LanguageSelector />
            <Button variant="outline" onClick={handleLogout}>
              {t('admin.logout')}
            </Button>
          </div>
        </div>
      </div>

      {/* City Selector */}
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Wybierz miasto:</h2>
          <CitySelector selectedCity={selectedCity} onCitySelect={setSelectedCity} />
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-gradient-hero text-primary-foreground rounded-lg p-1 shadow-purple h-9 w-full grid grid-cols-9">
            <TabsTrigger 
              value="weekly-report" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/5 transition-all px-4 py-1.5 text-sm font-medium"
            >
              {t('admin.weeklyReport')}
            </TabsTrigger>
            <TabsTrigger 
              value="settlements" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/5 transition-all px-4 py-1.5 text-sm font-medium"
            >
              {t('admin.settlements')}
            </TabsTrigger>
            <TabsTrigger 
              value="drivers-list" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/5 transition-all px-4 py-1.5 text-sm font-medium"
            >
              {t('admin.driversList')}
            </TabsTrigger>
            <TabsTrigger 
              value="fleet" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/5 transition-all px-4 py-1.5 text-sm font-medium"
            >
              Flota
            </TabsTrigger>
            <TabsTrigger 
              value="documents" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/5 transition-all px-4 py-1.5 text-sm font-medium"
            >
              Dokumenty
            </TabsTrigger>
            <TabsTrigger 
              value="visibility" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/5 transition-all px-4 py-1.5 text-sm font-medium"
            >
              Widoczność
            </TabsTrigger>
            <TabsTrigger 
              value="data-import" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/5 transition-all px-4 py-1.5 text-sm font-medium"
            >
              {t('admin.dataImport')}
            </TabsTrigger>
            <TabsTrigger 
              value="settings" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/5 transition-all px-4 py-1.5 text-sm font-medium"
            >
              {t('admin.settings')}
            </TabsTrigger>
            <TabsTrigger 
              value="reports" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/5 transition-all px-4 py-1.5 text-sm font-medium"
            >
              {t('admin.reports')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="weekly-report" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Łączna liczba kierowców
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{weeklyStats.totalDrivers}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Łączne zarobki
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{weeklyStats.totalEarnings.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Łączna liczba kursów
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{weeklyStats.totalTrips}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Średnia ocena
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{weeklyStats.averageRating}/5</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settlements" className="space-y-6">
            {!selectedCity ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">Wybierz miasto aby zobaczyć rozliczenia</p>
                </CardContent>
              </Card>
            ) : (
              <SettlementsManagement 
                cityId={selectedCity.id}
                cityName={selectedCity.name}
              />
            )}
          </TabsContent>

          <TabsContent value="drivers-list" className="space-y-6">
            {!selectedCity ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">Wybierz miasto aby zobaczyć listę kierowców</p>
                </CardContent>
              </Card>
            ) : (
              <DriversManagement 
                cityId={selectedCity.id}
                cityName={selectedCity.name}
                onDriverUpdate={refetchDrivers}
              />
            )}
          </TabsContent>

          <TabsContent value="fleet" className="space-y-6">
            {!selectedCity ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">Wybierz miasto aby zobaczyć flotę</p>
                </CardContent>
              </Card>
            ) : (
              <FleetManagement 
                cityId={selectedCity.id}
                cityName={selectedCity.name}
              />
            )}
          </TabsContent>

          <TabsContent value="documents" className="space-y-6">
            {!selectedCity ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">Wybierz miasto aby zarządzać dokumentami</p>
                </CardContent>
              </Card>
            ) : (
              <DocumentsManagement 
                cityId={selectedCity.id}
                cityName={selectedCity.name}
              />
            )}
          </TabsContent>

          <TabsContent value="visibility" className="space-y-6">
            <SettlementVisibilitySettings />
          </TabsContent>

          <TabsContent value="data-import" className="space-y-6">
            {!selectedCity ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">Wybierz miasto aby zaimportować dane</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Import danych CSV - {selectedCity.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Importuj kierowców z różnych platform transportowych
                    </p>
                  </CardHeader>
                </Card>
                <CSVUpload cityId={selectedCity.id} onUploadComplete={refetchDrivers} />
              </>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <RidoSettings />
            
            <Card>
              <CardHeader>
                <CardTitle>Zarządzanie kontami Auth</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Narzędzia do zarządzania kontami uwierzytelniania kierowców
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="border-l-4 border-yellow-500 bg-yellow-50 p-4 rounded">
                    <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Ważne</h3>
                    <p className="text-sm text-yellow-700">
                      Najpierw wyczyść stare konta z @rido.internal, a następnie utwórz nowe konta dla kierowców z prawdziwymi emailami.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <h4 className="font-semibold mb-2">Krok 1: Wyczyść stare konta</h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Usuwa wszystkie konta Auth z fałszywymi emailami (@rido.internal)
                      </p>
                      <Button 
                        onClick={handleCleanupFakeAccounts} 
                        disabled={cleaningAccounts}
                        variant="destructive"
                      >
                        {cleaningAccounts ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Czyszczenie...
                          </>
                        ) : (
                          "🧹 Wyczyść stare konta (@rido.internal)"
                        )}
                      </Button>
                    </div>

                    <div className="pt-4 border-t">
                      <h4 className="font-semibold mb-2">Krok 2: Utwórz konta dla kierowców</h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Tworzy konta Auth dla wszystkich kierowców z prawdziwymi emailami. Hasło: Test12345!
                      </p>
                      <Button 
                        onClick={handleCreateDriverAccounts} 
                        disabled={creatingAccounts}
                      >
                        {creatingAccounts ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Tworzenie...
                          </>
                        ) : (
                          "✨ Utwórz konta dla wszystkich kierowców"
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Rebuild kierowców z CSV</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Przebuduj bazę kierowców z kompletnego arkusza CSV (aktualizuje GetRido ID, nazwy i ID platform)
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded">
                  <h3 className="font-semibold text-blue-800 mb-2">ℹ️ Informacja</h3>
                  <p className="text-sm text-blue-700">
                    Ta funkcja pozwala na pełną rekonstrukcję danych kierowców z CSV. 
                    Naprawia GetRido ID (kolumna X), aktualizuje imiona/nazwiska (kolumna F) 
                    i synchronizuje wszystkie ID platform (Uber, Bolt, FreeNow).
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button 
                    onClick={() => setShowRebuildModal(true)}
                    disabled={!selectedCity}
                    variant="default"
                  >
                    🔧 Rebuild kierowców z CSV
                  </Button>
                  
                  <Button 
                    onClick={handleSanitizeGetRidoIds}
                    disabled={!selectedCity || sanitizing}
                    variant="outline"
                  >
                    {sanitizing ? "Czyszczenie..." : "🧹 Napraw GetRido ID (sanitize)"}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  💡 Zalecana kolejność: najpierw użyj "Napraw GetRido ID", potem "Rebuild" z CSV
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.reports')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">Dodatkowe raporty i analizy zostaną wkrótce dodane.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Rebuild Modal */}
      {selectedCity && (
        <RebuildDriversModal
          isOpen={showRebuildModal}
          onClose={() => setShowRebuildModal(false)}
          cityId={selectedCity.id}
          cityName={selectedCity.name}
          onSuccess={refetchDrivers}
        />
      )}
    </div>
  );
};

export default AdminDashboard;