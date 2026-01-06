import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import LanguageSelector from "@/components/LanguageSelector";
import { CitySelector } from "@/components/CitySelector";
import { useCities, City } from "@/hooks/useCities";
import { useDrivers } from "@/hooks/useDrivers";
import { DriversManagement } from "@/components/DriversManagement";
import { AdminSettlementsView } from "@/components/AdminSettlementsView";
import { FleetManagement } from "@/components/FleetManagement";
import { DocumentsManagement } from "@/components/DocumentsManagement";
import { SystemAlertsButton } from "@/components/SystemAlertsButton";
import { RebuildDriversModal } from "@/components/RebuildDriversModal";
import { AdminSettingsView } from "@/components/AdminSettingsView";
import SystemAlerts from "@/pages/SystemAlerts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Menu, Download, ShoppingCart } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { TabsPill } from "@/components/ui/TabsPill";
import { UserDropdown } from "@/components/UserDropdown";

const AdminDashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [activeTab, setActiveTab] = useState('weekly-report');
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [showRebuildModal, setShowRebuildModal] = useState(false);
  const [sanitizing, setSanitizing] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  
  const { cities } = useCities();
  const { drivers, loading: driversLoading, refetch: refetchDrivers } = useDrivers({ cityId: selectedCity?.id });

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

  // Admin role guard - redirect if not admin
  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      toast({
        title: "Brak dostępu",
        description: "Nie masz uprawnień administratora",
        variant: "destructive"
      });
      navigate('/auth');
    }
  }, [roleLoading, isAdmin, navigate]);

  // Auto-select Warszawa or first city when cities load
  useEffect(() => {
    if (cities.length > 0 && !selectedCity) {
      const warszawa = cities.find(city => city.name === 'Warszawa');
      setSelectedCity(warszawa || cities[0]);
    }
  }, [cities, selectedCity]);

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
              <h1 className="text-base font-bold text-primary">{t('admin.dashboard')}</h1>
            </div>
            <div className="flex items-center space-x-3">
              <UserDropdown 
                userName="Administrator"
                userRole="Administrator"
                userEmail={userEmail}
                onLogout={handleLogout}
              />
              {!isAppInstalled && (
                <Button variant="outline" size="sm" onClick={handleInstallClick} className="rounded-lg">
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
              <span className="text-sm font-semibold text-primary">Panel Admin</span>
            </div>
            <div className="flex items-center space-x-2">
              <SystemAlertsButton />
              {!isAppInstalled && (
                <Button variant="outline" size="icon" onClick={handleInstallClick} className="rounded-lg h-8 w-8">
                  <Download className="h-4 w-4" />
                </Button>
              )}
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

      {/* City Selector */}
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('admin.selectCity')}</h2>
          <CitySelector selectedCity={selectedCity} onCitySelect={setSelectedCity} />
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Desktop - TabsPill */}
          <div className="hidden md:block">
            <TabsPill value={activeTab} onValueChange={setActiveTab}>
              <TabsTrigger value="weekly-report">
                {t('admin.weeklyReport')}
              </TabsTrigger>
              <TabsTrigger value="settlements">
                {t('admin.settlements')}
              </TabsTrigger>
              <TabsTrigger value="drivers-list">
                {t('admin.driversList')}
              </TabsTrigger>
              <TabsTrigger value="fleet">
                {t('admin.fleet')}
              </TabsTrigger>
              <TabsTrigger value="documents">
                {t('admin.documents')}
              </TabsTrigger>
              <TabsTrigger value="marketplace" onClick={() => navigate('/admin/marketplace')}>
                <ShoppingCart className="h-4 w-4 mr-1" />
                Marketplace
              </TabsTrigger>
              <TabsTrigger value="settings">
                {t('admin.settings')}
              </TabsTrigger>
              <TabsTrigger value="reports">
                {t('admin.reports')}
              </TabsTrigger>
              <TabsTrigger value="system-alerts">
                {t('admin.information')}
              </TabsTrigger>
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
                  <SheetTrigger asChild>
                    <Button 
                      variant={activeTab === 'weekly-report' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => setActiveTab('weekly-report')}
                    >
                      {t('admin.weeklyReport')}
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={activeTab === 'settlements' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => setActiveTab('settlements')}
                    >
                      {t('admin.settlements')}
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={activeTab === 'drivers-list' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => setActiveTab('drivers-list')}
                    >
                      {t('admin.driversList')}
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={activeTab === 'fleet' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => setActiveTab('fleet')}
                    >
                      {t('admin.fleet')}
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={activeTab === 'documents' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => setActiveTab('documents')}
                    >
                      {t('admin.documents')}
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => navigate('/admin/marketplace')}
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Marketplace
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={activeTab === 'settings' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => setActiveTab('settings')}
                    >
                      {t('admin.settings')}
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={activeTab === 'reports' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => setActiveTab('reports')}
                    >
                      {t('admin.reports')}
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={activeTab === 'system-alerts' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => setActiveTab('system-alerts')}
                    >
                      {t('admin.information')}
                    </Button>
                  </SheetTrigger>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <TabsContent value="weekly-report" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t('admin.totalDrivers')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{weeklyStats.totalDrivers}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t('admin.totalEarnings')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{weeklyStats.totalEarnings.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t('admin.totalTrips')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{weeklyStats.totalTrips}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t('admin.averageRating')}
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
              <AdminSettlementsView 
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

          <TabsContent value="settings" className="space-y-6">
            <AdminSettingsView />
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

          <TabsContent value="system-alerts" className="space-y-6">
            <SystemAlerts />
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