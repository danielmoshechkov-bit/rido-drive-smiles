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

const AdminDashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('weekly-report');
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  
  const { cities } = useCities();
  const { drivers, loading: driversLoading, refetch: refetchDrivers } = useDrivers(selectedCity?.id);

  // Auto-select first city when cities load
  useEffect(() => {
    if (cities.length > 0 && !selectedCity) {
      setSelectedCity(cities[0]);
    }
  }, [cities, selectedCity]);

  const handleLogout = () => {
    navigate('/');
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
          <TabsList className="bg-gradient-hero text-primary-foreground rounded-lg p-2 shadow-purple h-14 w-full grid grid-cols-8">
            <TabsTrigger 
              value="weekly-report" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/20 hover:text-white transition-all px-6 py-3 text-base font-medium"
            >
              {t('admin.weeklyReport')}
            </TabsTrigger>
            <TabsTrigger 
              value="drivers-list" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/20 hover:text-white transition-all px-6 py-3 text-base font-medium"
            >
              {t('admin.driversList')}
            </TabsTrigger>
            <TabsTrigger 
              value="settlements" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/20 hover:text-white transition-all px-6 py-3 text-base font-medium"
            >
              {t('admin.settlements')}
            </TabsTrigger>
            <TabsTrigger 
              value="fleet" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/20 hover:text-white transition-all px-6 py-3 text-base font-medium"
            >
              Flota
            </TabsTrigger>
            <TabsTrigger 
              value="documents" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/20 hover:text-white transition-all px-6 py-3 text-base font-medium"
            >
              Dokumenty
            </TabsTrigger>
            <TabsTrigger 
              value="data-import" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/20 hover:text-white transition-all px-6 py-3 text-base font-medium"
            >
              {t('admin.dataImport')}
            </TabsTrigger>
            <TabsTrigger 
              value="settings" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/20 hover:text-white transition-all px-6 py-3 text-base font-medium"
            >
              {t('admin.settings')}
            </TabsTrigger>
            <TabsTrigger 
              value="reports" 
              className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md hover:bg-white/20 hover:text-white transition-all px-6 py-3 text-base font-medium"
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
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.settings')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">Panel ustawień systemu zostanie wkrótce dodany.</p>
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
    </div>
  );
};

export default AdminDashboard;