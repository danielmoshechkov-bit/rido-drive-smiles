import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TabsPill } from "@/ridoUiPack";
import { AddOwnCarModal } from "@/components/driver/AddOwnCarModal";
import { TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { ChatFab } from "@/components/chat/ChatFab";
import { LeasedCarWrapper } from "@/components/driver/LeasedCarWrapper";
import { OwnCarsWrapper } from "@/components/driver/OwnCarsWrapper";
import { supabase } from "@/integrations/supabase/client";
import { UniversalSubTabBar } from "@/components/UniversalSubTabBar";
import { DriverFuelView } from "@/components/DriverFuelView";
import { Plus, Calendar, FileText, DollarSign, Car, File, Info, Menu, MoreVertical, Download } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DriverSettlements } from "@/components/DriverSettlements";
import { getAvailableWeeks, getCurrentWeekNumber } from "@/lib/utils";
import { DriverNotificationBell } from "@/components/driver/DriverNotificationBell";
import { NotificationSettings } from "@/components/driver/NotificationSettings";
import { useSystemAlerts } from "@/hooks/useSystemAlerts";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { toast } from "sonner";
import { PinDisplay } from "@/components/PinDisplay";
import LanguageSelector from "@/components/LanguageSelector";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const DriverDashboard = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('weekly-report');
  const [activeSubTab, setActiveSubTab] = useState('my');
  const [user, setUser] = useState<any>(null);
  const [driverData, setDriverData] = useState<any>(null);
  const [fleetInfo, setFleetInfo] = useState<{ name: string; contact_name?: string; contact_phone_for_drivers?: string } | null>(null);
  const [showAddOwnCarModal, setShowAddOwnCarModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);

  // PWA install prompt detection
  useEffect(() => {
    // Check if already installed
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
      // iOS or no prompt available - navigate to install page
      navigate('/install');
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      // Check for test user in localStorage first
      const testUser = localStorage.getItem('testUser');
      if (testUser) {
        const testUserData = JSON.parse(testUser);
        setUser({ email: testUserData.email, id: 'test-user' });
        
        // Znajdź kierowcę po emailu testowym
        const { data: driverRecord } = await supabase
          .from("drivers")
          .select("*")
          .eq("email", testUserData.email)
          .single();
          
        if (driverRecord) {
          setDriverData({
            driver_id: driverRecord.id,
            drivers: driverRecord,
            city_id: driverRecord.city_id
          });
        } else {
          // Jeśli nie ma kierowcy w bazie, stwórz minimalny obiekt dla testów
          setDriverData({
            driver_id: 'test-driver',
            drivers: { 
              first_name: testUserData.email === 'anastasia.loktionova1991@gmail.com' ? 'Anastasia' : 'Test',
              last_name: testUserData.email === 'anastasia.loktionova1991@gmail.com' ? 'Loktionova' : 'Driver',
              email: testUserData.email
            },
            city_id: null
          });
        }
        return;
      }
      
      // Check for real Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser(session.user);
      
      // Pobierz driver_app_users BEZ inner join - to pozwoli załadować stronę nawet gdy RLS blokuje drivers
      const { data: driverAppUser, error: dauError } = await supabase
        .from("driver_app_users")
        .select("driver_id, city_id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      
      if (dauError) {
        console.error("Błąd ładowania driver_app_users:", dauError);
        toast({
          title: "Błąd",
          description: "Nie można załadować danych użytkownika",
        });
        return;
      }
        
      if (!driverAppUser) {
        toast({
          title: "Brak powiązania",
          description: "Twoje konto nie jest połączone z profilem kierowcy. Skontaktuj się z administratorem.",
        });
        return;
      }

      // Osobno spróbuj pobrać dane z drivers - jeśli RLS zablokuje, ustaw pusty obiekt
      const { data: driverDetails } = await supabase
        .from("drivers")
        .select("*, fleets(name)")
        .eq("id", driverAppUser.driver_id)
        .maybeSingle();
      
      // Ustaw dane nawet jeśli drivers jest puste - dzięki temu strona się załaduje
      setDriverData({
        driver_id: driverAppUser.driver_id,
        drivers: driverDetails || {},
        city_id: driverAppUser.city_id
      });

      // Load fleet info if driver has a fleet
      if (driverDetails?.fleet_id) {
        const { data: fleetData } = await supabase
          .from("fleets")
          .select("name, contact_name, contact_phone_for_drivers")
          .eq("id", driverDetails.fleet_id)
          .single();
        
        if (fleetData) {
          setFleetInfo(fleetData);
        }
      }
    };

    checkAuth();
  }, [navigate]);

  const handleLogout = async () => {
    // Clear test user data if exists
    localStorage.removeItem('testUser');
    
    // Sign out from Supabase if there's a session
    try {
      await supabase.auth.signOut();
    } catch (error) {
      // Ignore errors, just redirect
    }
    
    navigate('/auth');
  };

  if (!user || !driverData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header - responsywny z hamburger menu na mobile */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          {/* Desktop header */}
          <div className="hidden md:flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="Get RIDO Logo" 
                className="h-6 w-6"
              />
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-primary">{t('common.driverPanel')}</span>
                {driverData?.drivers?.first_name && driverData?.drivers?.last_name && (
                  <>
                    <span className="text-muted-foreground">-</span>
                    <span className="font-medium text-foreground">
                      {driverData.drivers.first_name} {driverData.drivers.last_name}
                    </span>
                  </>
                )}
                {fleetInfo && (
                  <>
                    <span className="text-muted-foreground">-</span>
                    <span className="font-medium text-primary">{t('common.fleet')}: {fleetInfo.name}</span>
                    {fleetInfo.contact_name && fleetInfo.contact_phone_for_drivers && (
                      <>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-sm text-muted-foreground">
                          {t('common.supervisor')}: {fleetInfo.contact_name} {fleetInfo.contact_phone_for_drivers}
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {driverData?.driver_id && (
                <div className="scale-90">
                  <DriverNotificationBell driverId={driverData.driver_id} />
                </div>
              )}
              <div className="scale-90">
                <LanguageSelector />
              </div>
              {!isAppInstalled && (
                <Button variant="outline" onClick={handleInstallClick} size="sm" className="rounded-lg text-sm">
                  <Download className="h-4 w-4" />
                </Button>
              )}
              <Button variant="outline" onClick={handleLogout} size="sm" className="rounded-lg text-sm">
                {t('auth.logout')}
              </Button>
            </div>
          </div>

          {/* Mobile header - hamburger menu */}
          <div className="md:hidden flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="Get RIDO Logo" 
                className="h-6 w-6"
              />
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80">
                  <div className="space-y-4 mt-4">
                    <div className="text-sm font-semibold text-primary border-b pb-2">{t('common.driverPanel')}</div>
                    {driverData?.drivers?.first_name && driverData?.drivers?.last_name && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">{t('driver.info.driver')}:</div>
                        <div className="font-medium">
                          {driverData.drivers.first_name} {driverData.drivers.last_name}
                        </div>
                      </div>
                    )}
                    {fleetInfo && (
                      <>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">{t('common.fleet')}:</div>
                          <div className="font-medium text-primary">{fleetInfo.name}</div>
                        </div>
                        {fleetInfo.contact_name && fleetInfo.contact_phone_for_drivers && (
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">{t('common.supervisor')}:</div>
                            <div className="text-sm">
                              {fleetInfo.contact_name}<br />
                              {fleetInfo.contact_phone_for_drivers}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            <div className="flex items-center space-x-2">
              {driverData?.driver_id && (
                <DriverNotificationBell driverId={driverData.driver_id} />
              )}
              <LanguageSelector />
              {!isAppInstalled && (
                <Button variant="outline" size="icon" onClick={handleInstallClick} className="rounded-lg h-8 w-8">
                  <Download className="h-4 w-4" />
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-lg">
                {t('auth.logout')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 pt-4 pb-8 relative">
        {/* Floating Chat Widget */}
        <div className="fixed bottom-6 right-6 z-50">
          <ChatFab driverData={driverData} />
        </div>
        
        {/* Desktop Tabs */}
        <div className="hidden md:block">
          <TabsPill value={activeTab} onValueChange={setActiveTab} className="mb-6">
            <TabsTrigger value="weekly-report">
              <DollarSign className="h-4 w-4 mr-2" />
              {t('driver.tabs.settlements')}
            </TabsTrigger>
            <TabsTrigger value="cars">
              <Car className="h-4 w-4 mr-2" />
              {t('driver.tabs.cars')}
            </TabsTrigger>
            <TabsTrigger value="documents">
              <FileText className="h-4 w-4 mr-2" />
              {t('driver.tabs.documents')}
            </TabsTrigger>
            <TabsTrigger value="informacje">
              <Info className="h-4 w-4 mr-2" />
              {t('driver.tabs.information')}
            </TabsTrigger>
          </TabsPill>
        </div>

        {/* Mobile Hamburger Menu - Redesigned */}
        <div className="md:hidden mb-3">
          <div className="flex items-center gap-3">
            {/* Hamburger w zaokrąglonym kontenerze */}
            <Sheet>
              <SheetTrigger asChild>
                <div className="rounded-xl bg-primary shadow-sm p-1.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-primary/90">
                    <Menu className="h-4 w-4 text-white" />
                  </Button>
                </div>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 bg-gradient-to-b from-primary/5 to-background">
                <div className="space-y-2 mt-4">
                  <SheetTrigger asChild>
                    <Button 
                      variant={activeTab === 'weekly-report' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => setActiveTab('weekly-report')}
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      {t('driver.tabs.settlements')}
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={activeTab === 'cars' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => setActiveTab('cars')}
                    >
                      <Car className="h-4 w-4 mr-2" />
                      {t('driver.tabs.cars')}
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={activeTab === 'documents' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => setActiveTab('documents')}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      {t('driver.tabs.documents')}
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={activeTab === 'informacje' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => setActiveTab('informacje')}
                    >
                      <Info className="h-4 w-4 mr-2" />
                      {t('driver.tabs.information')}
                    </Button>
                  </SheetTrigger>
                </div>
              </SheetContent>
            </Sheet>

            {/* Sub-tab buttons obok hamburgera - tylko dla zakładki rozliczenia */}
            {activeTab === 'weekly-report' && (
              <div className="flex gap-2 flex-1">
                <Button
                  variant={activeSubTab === 'my' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full px-4 shadow-sm text-xs flex-1"
                  onClick={() => setActiveSubTab('my')}
                >
                  {t('driver.settlements.mySettlements')}
                </Button>
                <Button
                  variant={activeSubTab === 'fuel' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full px-4 shadow-sm text-xs flex-1"
                  onClick={() => setActiveSubTab('fuel')}
                >
                  {t('driver.settlements.fuel')}
                </Button>
              </div>
            )}

            {/* Przycisk Dodaj auto obok hamburgera - dla zakładki cars */}
            {activeTab === 'cars' && (
              <Button 
                className="flex-1 rounded-full"
                onClick={() => setShowAddOwnCarModal(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('driver.cars.addCar')}
              </Button>
            )}
          </div>
        </div>

        {/* Tab Content - rendered based on activeTab state */}
        {activeTab === 'weekly-report' && <SettlementsWithSubTabs driverData={driverData} activeSubTab={activeSubTab} setActiveSubTab={setActiveSubTab} />}
        {activeTab === 'cars' && <CarsSection driverData={driverData} showAddModal={showAddOwnCarModal} setShowAddModal={setShowAddOwnCarModal} />}
        {activeTab === 'documents' && <DriverDocuments driverData={driverData} />}
        {activeTab === 'informacje' && user && <DriverNotifications driverId={driverData.driver_id} userId={user.id} />}
      </div>
    </div>
  );
};

// Komponent sekcji samochodów z przyciskiem dodaj auto
function CarsSection({ driverData, showAddModal, setShowAddModal }: { driverData: any; showAddModal: boolean; setShowAddModal: (show: boolean) => void }) {
  const { t } = useTranslation();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const driverId = driverData.driver_id;

  return (
    <div className="space-y-8">
      {/* Przycisk Dodaj auto */}
                <div className="flex justify-start px-8">
                  <Button 
                    onClick={() => setShowAddModal(true)}
                    className="gap-2 rounded-2xl shadow-[0_10px_30px_rgba(108,60,240,0.18)]"
                  >
                    <Plus className="h-4 w-4" />
                    {t('driver.cars.addCar')}
                  </Button>
                </div>


      {/* Karta wynajętego auta */}
      <LeasedCarWrapper key={refreshTrigger} driverData={driverData} />

      {/* Karta własnego auta */}
      <OwnCarsWrapper key={refreshTrigger} driverData={driverData} />

      {/* Modal dodawania auta */}
      <AddOwnCarModal 
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        driverId={driverId}
        onVehicleAdded={() => setRefreshTrigger(prev => prev + 1)}
      />
    </div>
  );
}


// Komponent z sub-tabami dla rozliczeń - identyczny układ jak w portalu flotowym
function SettlementsWithSubTabs({ 
  driverData, 
  activeSubTab, 
  setActiveSubTab 
}: { 
  driverData: any;
  activeSubTab: string;
  setActiveSubTab: (tab: string) => void;
}) {
  const { t } = useTranslation();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const currentYear = new Date().getFullYear();
    return getCurrentWeekNumber(currentYear);
  });
  
  const subTabs = [
    { value: "my", label: t('driver.settlements.mySettlements'), visible: true },
    { value: "fuel", label: t('driver.settlements.fuel'), visible: true }
  ];

  const weeks = getAvailableWeeks(selectedYear);
  const selectedWeekData = weeks.find(w => w.number === selectedWeek);
  const periodFrom = selectedWeekData?.start;
  const periodTo = selectedWeekData?.end;

  return (
    <div>
      {/* Sub-tab bar - ukryty na mobile bo pokazuje się przy hamburgerze */}
      <div className="hidden md:block">
        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />
      </div>
      
      <div className="pt-0 md:pt-0 mt-4 md:mt-0">
        {activeSubTab === "fuel" ? (
          <DriverFuelView 
            fuelCardNumber={driverData.drivers?.fuel_card_number || ""} 
            fuelCardPin={driverData.drivers?.fuel_card_pin}
          />
        ) : (
          <DriverSettlements 
            driverId={driverData.driver_id} 
            hideControls={false}
          />
        )}
      </div>
    </div>
  );
}

// Component to display driver notifications and settings
function DriverNotifications({ driverId, userId }: { driverId: string; userId: string }) {
  const { alerts, loading, markAsResolved } = useSystemAlerts();
  const driverAlerts = alerts.filter(a => a.driver_id === driverId && a.status === 'pending');
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    loadDriverInfo();
  }, [driverId]);

  const loadDriverInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('payment_method, iban')
        .eq('id', driverId)
        .single();
      
      if (error) throw error;
      setDriverInfo(data);
    } catch (error) {
      console.error('Error loading driver info:', error);
    } finally {
      setLoadingInfo(false);
    }
  };

  const handlePaymentMethodChange = async (method: string) => {
    try {
      const { error } = await supabase
        .from('drivers')
        .update({ payment_method: method })
        .eq('id', driverId);
      
      if (error) throw error;
      
      // Natychmiastowa aktualizacja lokalnego stanu - to naprawi badge
      setDriverInfo((prev: any) => ({ ...prev, payment_method: method }));
      toast.success('Zaktualizowano sposób rozliczenia');
    } catch (error) {
      console.error('Error updating payment method:', error);
      toast.error('Błąd aktualizacji sposobu rozliczenia');
    }
  };

  const handleIbanChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const iban = e.target.value;
    
    try {
      const { error } = await supabase
        .from('drivers')
        .update({ iban })
        .eq('id', driverId);
      
      if (error) throw error;
      setDriverInfo({ ...driverInfo, iban });
    } catch (error) {
      console.error('Error updating IBAN:', error);
      toast.error('Błąd aktualizacji numeru konta');
    }
  };

  if (loading || loadingInfo) {
    return <div className="text-center py-8">{t('common.loading')}</div>;
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
      {/* Payment Method Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t('driver.paymentMethod')}</CardTitle>
          <CardDescription>{t('driver.paymentMethodDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select 
            value={driverInfo?.payment_method || 'transfer'} 
            onValueChange={handlePaymentMethodChange}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('driver.paymentMethod')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="transfer">💳 {t('driver.paymentMethodTransfer')}</SelectItem>
              <SelectItem value="cash">💵 {t('driver.paymentMethodCash')}</SelectItem>
            </SelectContent>
          </Select>
          
          {driverInfo?.payment_method === 'transfer' && (
            <div className="space-y-2">
              <Label htmlFor="iban">{t('driver.iban')}</Label>
              <Input 
                id="iban"
                value={driverInfo?.iban || ''} 
                onChange={handleIbanChange}
                placeholder="PL XX XXXX XXXX XXXX XXXX XXXX XXXX"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Push Notification Settings */}
      <NotificationSettings userId={userId} />

      {/* Notifications */}
      {driverAlerts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('driver.noNotifications')}</CardTitle>
            <CardDescription>{t('driver.allNotificationsRead')}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        driverAlerts.map(alert => (
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
                  {t('driver.markAsRead')}
                </Button>
              </div>
            </CardHeader>
          </Card>
        ))
      )}
    </div>
  );
}

// Komponent dokumentów
function DriverDocuments({ driverData }: { driverData: any }) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState(t('driver.documents.contractRodo'));
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("driver_documents")
      .select("*")
      .eq("driver_id", driverData.driver_id)
      .order("created_at", { ascending: false });
    setDocs(data || []);
  };

  useEffect(() => {
    load();
  }, [driverData.driver_id]);

  const upload = async () => {
    if (!file) return;
    
    setLoading(true);
    try {
      const path = `${driverData.driver_id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("driver-documents")
        .upload(path, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from("driver-documents")
        .getPublicUrl(path);
      
      let typeId: string;
      const { data: existingType } = await supabase
        .from("document_types")
        .select("id")
        .eq("name", type)
        .single();
      
      if (existingType) {
        typeId = existingType.id;
      } else {
        const { data: newType, error: typeError } = await supabase
          .from("document_types")
          .insert([{ name: type }])
          .select("id")
          .single();
        if (typeError) throw typeError;
        typeId = newType.id;
      }
      
      const { error } = await supabase.from("driver_documents").insert([{
        driver_id: driverData.driver_id,
        document_type_id: typeId,
        file_url: publicUrl,
        file_name: file.name
      }]);
      
      if (error) throw error;
      
      toast.success(t('driver.documents.uploaded'));
      setFile(null);
      setType(t('driver.documents.contractRodo'));
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const types = [
    t('driver.documents.contractRodo'),
    t('driver.documents.drivingLicense'), 
    t('driver.documents.idCard'),
    t('driver.documents.driverLicense'),
    t('driver.documents.medicalExam'),
    t('driver.documents.otherDocument')
  ];

  return (
    <div className="space-y-4">
      {/* Mobile header with hamburger menu */}
      <div className="md:hidden bg-primary text-primary-foreground px-4 py-3 rounded-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <h2 className="text-lg font-semibold">{t('driver.documents.title')}</h2>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground hover:bg-primary-hover">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-64">
            <div className="space-y-4 mt-4">
              <h3 className="font-semibold text-sm text-muted-foreground">{t('driver.documents.options')}</h3>
              <Button variant="ghost" className="w-full justify-start">
                <FileText className="h-4 w-4 mr-2" />
                {t('driver.documents.allDocuments')}
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <Calendar className="h-4 w-4 mr-2" />
                {t('driver.documents.sortByDate')}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop header */}
      <h2 className="hidden md:block text-xl font-semibold">{t('driver.documents.title')}</h2>

      <Card className="rounded-xl shadow-soft">
        <CardHeader>
          <CardTitle>{t('driver.documents.manageDocuments')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              className="px-3 py-2 border border-input rounded-lg bg-background"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {types.map(docType => (
                <option key={docType} value={docType}>{docType}</option>
              ))}
            </select>
            <Input 
              type="file" 
              accept=".pdf,.jpg,.jpeg,.png,.docx" 
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="rounded-lg"
            />
            <Button onClick={upload} disabled={!file || loading} className="rounded-lg">
              {loading ? t('driver.documents.uploading') : t('driver.documents.addDocument')}
            </Button>
          </div>
          
          {docs.length === 0 ? (
            <p className="text-muted-foreground">{t('driver.documents.noDocuments')}</p>
          ) : (
            <div className="space-y-2">
              {docs.map(d => (
                <div key={d.id} className="flex items-center justify-between p-3 border border-border/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{d.file_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(d.created_at).toLocaleDateString('pl-PL')}
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild className="rounded-lg">
                    <a href={d.file_url} target="_blank" rel="noreferrer">
                      {t('driver.documents.download')}
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default DriverDashboard;