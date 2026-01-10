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
import { Plus, Calendar, FileText, DollarSign, Car, File, Info, Menu, MoreVertical, Download, ShoppingCart, Repeat, User, Truck, Building2, Link, UserPlus } from "lucide-react";
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
import { PriceChangeModal } from "@/components/driver/PriceChangeModal";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { AccountSwitcherPanel } from "@/components/AccountSwitcherPanel";
import { DriverDocumentsPanel } from "@/components/driver/DriverDocumentsPanel";

const DriverDashboard = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { features, isMarketplaceEnabled } = useFeatureToggles();
  const [activeTab, setActiveTab] = useState('weekly-report');
  const [activeSubTab, setActiveSubTab] = useState('my');
  const [user, setUser] = useState<any>(null);
  const [driverData, setDriverData] = useState<any>(null);
  const [fleetInfo, setFleetInfo] = useState<{ name: string; contact_name?: string; contact_phone_for_drivers?: string } | null>(null);
  const [showAddOwnCarModal, setShowAddOwnCarModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [priceChangeNotification, setPriceChangeNotification] = useState<any>(null);
  const [isFleetAccount, setIsFleetAccount] = useState(false);
  const [isMarketplaceAccount, setIsMarketplaceAccount] = useState(false);

  // Check for other account types
  useEffect(() => {
    const checkAccounts = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Check for fleet account
      const { data: fleetRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["fleet_settlement", "fleet_rental"]);
      setIsFleetAccount(!!fleetRoles && fleetRoles.length > 0);

      // Check for marketplace account
      const { data: marketplaceProfile } = await supabase
        .from("marketplace_user_profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      setIsMarketplaceAccount(!!marketplaceProfile);
    };
    checkAccounts();
  }, []);

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

  // Auth state listener to prevent logout on refresh
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setDriverData(null);
        navigate('/auth');
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          setUser(session.user);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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

      // Check for unread price change notifications
      const { data: notifications } = await supabase
        .from("price_change_notifications")
        .select(`
          id,
          vehicle_id,
          old_price,
          new_price,
          created_at,
          vehicles:vehicle_id (brand, model, plate)
        `)
        .eq("driver_id", driverAppUser.driver_id)
        .eq("is_accepted", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (notifications && notifications.length > 0) {
        const notif = notifications[0];
        setPriceChangeNotification({
          id: notif.id,
          vehicle_id: notif.vehicle_id,
          old_price: notif.old_price,
          new_price: notif.new_price,
          created_at: notif.created_at,
          vehicle: notif.vehicles
        });
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
      {/* Price Change Notification Modal - blocks everything until accepted */}
      {priceChangeNotification && (
        <PriceChangeModal
          notification={priceChangeNotification}
          onAccepted={() => setPriceChangeNotification(null)}
        />
      )}

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
        <div className="hidden md:block mb-6">
          <TabsPill value={activeTab} onValueChange={setActiveTab}>
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
            {isMarketplaceEnabled && (
              <TabsTrigger value="marketplace">
                <ShoppingCart className="h-4 w-4 mr-2" />
                {t('driver.tabs.marketplace')}
              </TabsTrigger>
            )}
            {features.account_switching_enabled && (
              <TabsTrigger value="accounts">
                <Repeat className="h-4 w-4 mr-2" />
                Przełącz konto
              </TabsTrigger>
            )}
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
                  {isMarketplaceEnabled && (
                    <SheetTrigger asChild>
                      <Button 
                        variant={activeTab === 'marketplace' ? 'default' : 'ghost'} 
                        className="w-full justify-start rounded-xl transition-all"
                        onClick={() => setActiveTab('marketplace')}
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        {t('driver.tabs.marketplace')}
                      </Button>
                    </SheetTrigger>
                  )}
                  
                  {features.account_switching_enabled && (
                    <SheetTrigger asChild>
                      <Button 
                        variant={activeTab === 'accounts' ? 'default' : 'ghost'} 
                        className="w-full justify-start rounded-xl transition-all"
                        onClick={() => setActiveTab('accounts')}
                      >
                        <Repeat className="h-4 w-4 mr-2" />
                        Przełącz konto
                      </Button>
                    </SheetTrigger>
                  )}
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
        {activeTab === 'marketplace' && <MarketplaceRedirect navigate={navigate} />}
        {activeTab === 'accounts' && (
          <AccountSwitcherPanel 
            isDriverAccount={true}
            isFleetAccount={isFleetAccount}
            isMarketplaceAccount={isMarketplaceAccount}
            isMarketplaceEnabled={isMarketplaceEnabled}
            currentAccountType="driver"
            navigate={navigate}
          />
        )}
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

// Component to display driver notifications and settings with sub-tabs
function DriverNotifications({ driverId, userId }: { driverId: string; userId: string }) {
  const [activeSubTab, setActiveSubTab] = useState("payment");
  const { t } = useTranslation();

  const subTabs = [
    { value: "payment", label: t('driver.paymentMethod') },
    { value: "fleet", label: "Flota" },
    { value: "contact", label: "Dane kontaktowe (giełda)" }
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <UniversalSubTabBar
        activeTab={activeSubTab}
        onTabChange={setActiveSubTab}
        tabs={subTabs.map(t => ({ ...t, visible: true }))}
      />

      {activeSubTab === "payment" && (
        <PaymentMethodSettings driverId={driverId} userId={userId} />
      )}

      {activeSubTab === "fleet" && (
        <FleetSettings driverId={driverId} />
      )}

      {activeSubTab === "contact" && (
        <MarketplaceContactSettings driverId={driverId} />
      )}
    </div>
  );
}

// Fleet settings component - change fleet via registration code
function FleetSettings({ driverId }: { driverId: string }) {
  const [fleetInfo, setFleetInfo] = useState<{ name: string; registered_via_code?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [newFleetCode, setNewFleetCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [validatingCode, setValidatingCode] = useState(false);
  const [validatedFleet, setValidatedFleet] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    loadFleetInfo();
  }, [driverId]);

  const loadFleetInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('fleet_id, registered_via_code, fleets(name)')
        .eq('id', driverId)
        .single();
      
      if (error) throw error;
      if (data?.fleets) {
        setFleetInfo({ 
          name: (data.fleets as any).name, 
          registered_via_code: data.registered_via_code 
        });
      }
    } catch (error) {
      console.error('Error loading fleet info:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateFleetCode = async (code: string) => {
    if (code.length < 4) {
      setValidatedFleet(null);
      return;
    }
    
    setValidatingCode(true);
    try {
      const { data } = await supabase
        .from('fleets')
        .select('id, name')
        .eq('registration_code', code.toUpperCase())
        .maybeSingle();
      
      setValidatedFleet(data);
    } catch (error) {
      console.error('Error validating code:', error);
    } finally {
      setValidatingCode(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const code = e.target.value.toUpperCase();
    setNewFleetCode(code);
    validateFleetCode(code);
  };

  const handleChangeFleet = async () => {
    if (!validatedFleet) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('drivers')
        .update({ 
          fleet_id: validatedFleet.id,
          registered_via_code: newFleetCode 
        })
        .eq('id', driverId);
      
      if (error) throw error;
      
      toast.success(`Zmieniono flotę na: ${validatedFleet.name}`);
      setFleetInfo({ name: validatedFleet.name, registered_via_code: newFleetCode });
      setNewFleetCode("");
      setValidatedFleet(null);
    } catch (error) {
      console.error('Error changing fleet:', error);
      toast.error('Błąd podczas zmiany floty');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Ładowanie...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Current Fleet Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Twoja flota
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fleetInfo ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Nazwa floty:</span>
                <span className="font-semibold">{fleetInfo.name}</span>
              </div>
              {fleetInfo.registered_via_code && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Kod rejestracji:</span>
                  <span className="font-mono bg-muted px-2 py-0.5 rounded">{fleetInfo.registered_via_code}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">Nie jesteś przypisany do żadnej floty.</p>
          )}
        </CardContent>
      </Card>

      {/* Change Fleet */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Zmień flotę
          </CardTitle>
          <CardDescription>
            Wpisz kod rejestracyjny nowej floty, aby zostać do niej przypisanym.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Kod floty</Label>
            <Input
              value={newFleetCode}
              onChange={handleCodeChange}
              placeholder="np. ABC12345"
              className="font-mono uppercase"
            />
          </div>
          
          {validatingCode && (
            <p className="text-sm text-muted-foreground">Sprawdzanie kodu...</p>
          )}
          
          {newFleetCode.length >= 4 && !validatingCode && (
            validatedFleet ? (
              <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-200 flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Znaleziono flotę: <strong>{validatedFleet.name}</strong>
                </p>
              </div>
            ) : (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200">
                  ⚠️ Nieprawidłowy kod floty
                </p>
              </div>
            )
          )}
          
          <Button 
            onClick={handleChangeFleet} 
            disabled={!validatedFleet || saving}
            className="w-full"
          >
            {saving ? 'Zapisywanie...' : 'Zmień flotę'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// Payment method settings component
function PaymentMethodSettings({ driverId, userId }: { driverId: string; userId: string }) {
  const { alerts, loading, markAsResolved } = useSystemAlerts();
  const driverAlerts = alerts.filter(a => a.driver_id === driverId && a.status === 'pending');
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const { t } = useTranslation();
  
  // Settlement plan & frequency state
  const [settlementPlans, setSettlementPlans] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [settlementFrequency, setSettlementFrequency] = useState<string>("weekly");
  const [fleetPlanSelectionDisabled, setFleetPlanSelectionDisabled] = useState(false);
  const [fleetFrequencyEnabled, setFleetFrequencyEnabled] = useState(false);
  const [fleetVatRate, setFleetVatRate] = useState<number | null>(null);
  const [fleetBaseFee, setFleetBaseFee] = useState<number | null>(null);
  const [payoutRequested, setPayoutRequested] = useState(false);

  useEffect(() => {
    loadDriverInfo();
    loadSettlementSettings();
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
  
  const loadSettlementSettings = async () => {
    try {
      // Get driver's fleet
      const { data: driver } = await supabase
        .from('drivers')
        .select('fleet_id')
        .eq('id', driverId)
        .maybeSingle();
      
      if (!driver?.fleet_id) return;
      
      // Get fleet settings (including VAT and base_fee)
      const { data: fleet } = await supabase
        .from('fleets')
        .select('driver_plan_selection_enabled, settlement_frequency_enabled, vat_rate, base_fee')
        .eq('id', driver.fleet_id)
        .maybeSingle();
      
      if (fleet) {
        setFleetPlanSelectionDisabled(fleet.driver_plan_selection_enabled === false);
        setFleetFrequencyEnabled(fleet.settlement_frequency_enabled ?? false);
        setFleetVatRate((fleet as any).vat_rate ?? null);
        setFleetBaseFee((fleet as any).base_fee ?? null);
      }
      
      // Get settlement plans
      const { data: plans } = await supabase
        .from('settlement_plans')
        .select('*')
        .eq('is_active', true)
        .eq('is_visible', true)
        .order('base_fee');
      
      if (plans) {
        setSettlementPlans(plans);
      }
      
      // Get driver's current settings
      const { data: appUser } = await supabase
        .from('driver_app_users')
        .select('settlement_plan_id, settlement_frequency, payout_requested_at')
        .eq('driver_id', driverId)
        .maybeSingle();
      
      if (appUser) {
        setSelectedPlanId(appUser.settlement_plan_id || "");
        setSettlementFrequency(appUser.settlement_frequency || "weekly");
        setPayoutRequested(!!(appUser as any).payout_requested_at);
      }
    } catch (error) {
      console.error('Error loading settlement settings:', error);
    }
  };
  
  const handlePlanChange = async (planId: string) => {
    try {
      const { error } = await supabase
        .from('driver_app_users')
        .update({ settlement_plan_id: planId })
        .eq('driver_id', driverId);
      
      if (error) throw error;
      
      setSelectedPlanId(planId);
      const plan = settlementPlans.find(p => p.id === planId);
      toast.success(`Plan zmieniony na: ${plan?.name || planId}`);
    } catch (error: any) {
      toast.error('Błąd zmiany planu: ' + error.message);
    }
  };
  
  const handleFrequencyChange = async (newFrequency: string) => {
    try {
      const { error } = await supabase
        .from('driver_app_users')
        .update({ settlement_frequency: newFrequency })
        .eq('driver_id', driverId);
      
      if (error) throw error;
      
      setSettlementFrequency(newFrequency);
      
      const frequencyLabels: Record<string, string> = {
        weekly: 'Co tydzień',
        biweekly: 'Co 2 tygodnie',
        triweekly: 'Co 3 tygodnie',
        monthly: 'Raz w miesiącu'
      };
      
      toast.success(`Częstotliwość rozliczeń zmieniona na: ${frequencyLabels[newFrequency]}`);
    } catch (error: any) {
      toast.error('Błąd zmiany częstotliwości: ' + error.message);
    }
  };

  const handlePaymentMethodChange = async (method: string) => {
    try {
      const { error } = await supabase
        .from('drivers')
        .update({ payment_method: method })
        .eq('id', driverId);
      
      if (error) throw error;
      
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

  // Determine what to display: fleet settings if set, otherwise plan
  const displayVat = fleetVatRate !== null ? fleetVatRate : null;
  const displayBaseFee = fleetBaseFee !== null ? fleetBaseFee : null;
  const hasFleetSettings = displayVat !== null && displayBaseFee !== null && (displayVat > 0 || displayBaseFee > 0);
  
  return (
    <div className="space-y-4">
      {/* Row 1: Payment Method + Settlement Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {/* Payment Method Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('driver.paymentMethod')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
                <Label htmlFor="iban" className="text-sm">{t('driver.iban')}</Label>
                <Input 
                  id="iban"
                  value={driverInfo?.iban || ''} 
                  onChange={handleIbanChange}
                  placeholder="PL XX XXXX XXXX XXXX XXXX XXXX XXXX"
                />
              </div>
            )}
            
            {/* Request payout button - only for non-weekly frequencies */}
            {settlementFrequency !== 'weekly' && (
              <div className="pt-3 border-t">
                <Button 
                  variant={payoutRequested ? "secondary" : "outline"}
                  className="w-full gap-2"
                  onClick={async () => {
                    try {
                      const { error } = await supabase
                        .from('driver_app_users')
                        .update({ payout_requested_at: new Date().toISOString() })
                        .eq('driver_id', driverId);
                      
                      if (error) throw error;
                      setPayoutRequested(true);
                      toast.success('Wypłata zlecona! Otrzymasz ją przy najbliższym terminie.');
                    } catch (error) {
                      console.error('Error requesting payout:', error);
                      toast.error('Błąd zlecania wypłaty');
                    }
                  }}
                  disabled={payoutRequested}
                >
                  {payoutRequested ? (
                    <>✓ Wypłata zlecona</>
                  ) : (
                    <>💰 Zleć wypłatę</>
                  )}
                </Button>
                {payoutRequested && (
                  <p className="text-xs text-green-600 mt-2 text-center">
                    Twoja wypłata trafi do najbliższej listy wypłat
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Settlement Plan & Frequency Settings */}
        {(hasFleetSettings || !fleetPlanSelectionDisabled || fleetFrequencyEnabled) ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ustawienia rozliczeń</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Show fleet VAT + base_fee if set */}
              {hasFleetSettings && (
                <div className="p-3 bg-primary/10 rounded-lg">
                  <p className="text-sm font-medium">
                    {displayBaseFee} zł + {displayVat}%
                  </p>
                  <p className="text-xs text-muted-foreground">Stawki floty</p>
                </div>
              )}
              
              {/* Plan Selection - only show if fleet allows AND has plans */}
              {!fleetPlanSelectionDisabled && settlementPlans.length > 0 && !hasFleetSettings && (
                <div className="space-y-2">
                  <Label className="text-sm">Plan rozliczeń</Label>
                  <Select value={selectedPlanId} onValueChange={handlePlanChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {settlementPlans.map(plan => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name} ({plan.base_fee} zł + {plan.tax_percentage}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {/* Frequency Selection */}
              {fleetFrequencyEnabled && (
                <div className="space-y-2">
                  <Label className="text-sm">Częstotliwość rozliczeń</Label>
                  <Select value={settlementFrequency} onValueChange={handleFrequencyChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Co tydzień</SelectItem>
                      <SelectItem value="biweekly">Co 2 tygodnie</SelectItem>
                      <SelectItem value="triweekly">Co 3 tygodnie</SelectItem>
                      <SelectItem value="monthly">Raz w miesiącu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ustawienia rozliczeń</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Brak ustawień</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Row 2: Push Notifications + Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Push Notification Settings */}
        <NotificationSettings userId={userId} />

        {/* Notifications */}
        {driverAlerts.length === 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('driver.noNotifications')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t('driver.allNotificationsRead')}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Powiadomienia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {driverAlerts.slice(0, 3).map(alert => (
                <div key={alert.id} className="flex items-start justify-between gap-2 p-2 border rounded-md">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{alert.title}</span>
                      <Badge variant={getAlertColor(alert.type) as any} className="text-xs">
                        {alert.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{alert.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => markAsResolved(alert.id)}
                  >
                    ✓
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// Marketplace contact settings for each vehicle
function MarketplaceContactSettings({ driverId }: { driverId: string }) {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editValues, setEditValues] = useState<Record<string, { phone: string; email: string }>>({});

  useEffect(() => {
    loadVehicles();
  }, [driverId]);

  const loadVehicles = async () => {
    try {
      // Get vehicles owned by this driver
      const { data: assignments } = await supabase
        .from("driver_vehicle_assignments")
        .select("vehicle_id")
        .eq("driver_id", driverId)
        .eq("status", "active");

      if (!assignments?.length) {
        setVehicles([]);
        setLoading(false);
        return;
      }

      const vehicleIds = assignments.map(a => a.vehicle_id).filter(Boolean);

      // Get vehicles with listing data
      const { data: vehiclesData } = await supabase
        .from("vehicles")
        .select("id, plate, brand, model")
        .in("id", vehicleIds);

      // Get listings for these vehicles
      const { data: listings } = await supabase
        .from("vehicle_listings")
        .select("vehicle_id, contact_phone, contact_email")
        .in("vehicle_id", vehicleIds);

      const listingMap: Record<string, any> = {};
      listings?.forEach(l => {
        listingMap[l.vehicle_id] = l;
      });

      const vehiclesWithListings = (vehiclesData || []).map(v => ({
        ...v,
        listing: listingMap[v.id] || null
      }));

      setVehicles(vehiclesWithListings);
      
      // Initialize edit values with current data
      const initialValues: Record<string, { phone: string; email: string }> = {};
      vehiclesWithListings.forEach(v => {
        initialValues[v.id] = {
          phone: v.listing?.contact_phone || "",
          email: v.listing?.contact_email || ""
        };
      });
      setEditValues(initialValues);
    } catch (error) {
      console.error("Error loading vehicles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (vehicleId: string, field: "phone" | "email", value: string) => {
    // Only allow numbers and phone characters for phone field
    const cleanedValue = field === "phone" 
      ? value.replace(/[^\d+\-() ]/g, '') 
      : value;
    
    setEditValues(prev => ({
      ...prev,
      [vehicleId]: {
        ...prev[vehicleId],
        [field]: cleanedValue
      }
    }));
  };

  const saveContact = async (vehicleId: string, field: "phone" | "email") => {
    const value = editValues[vehicleId]?.[field] || "";
    const dbField = field === "phone" ? "contact_phone" : "contact_email";
    
    // Check if value actually changed
    const vehicle = vehicles.find(v => v.id === vehicleId);
    const currentValue = field === "phone" 
      ? vehicle?.listing?.contact_phone 
      : vehicle?.listing?.contact_email;
    
    if (value === (currentValue || "")) {
      return; // No change, don't save
    }
    
    try {
      // Check if listing exists
      const { data: existing } = await supabase
        .from("vehicle_listings")
        .select("id")
        .eq("vehicle_id", vehicleId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("vehicle_listings")
          .update({ [dbField]: value || null })
          .eq("vehicle_id", vehicleId);
      } else {
        // Create listing with contact info (not available yet)
        await supabase
          .from("vehicle_listings")
          .insert([{
            vehicle_id: vehicleId,
            weekly_price: 0,
            is_available: false,
            created_by: driverId,
            [dbField]: value || null
          }]);
      }

      toast.success("Dane kontaktowe zapisane");
      loadVehicles();
    } catch (error) {
      console.error("Error updating contact:", error);
      toast.error("Błąd zapisu danych");
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Ładowanie...</div>;
  }

  if (vehicles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dane kontaktowe (giełda)</CardTitle>
          <CardDescription>
            Nie masz jeszcze żadnych pojazdów. Dodaj auto, aby móc ustawić dane kontaktowe dla giełdy.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Dane kontaktowe (giełda)</CardTitle>
          <CardDescription>
            Te dane będą widoczne w ogłoszeniach na giełdzie. Możesz podać inne dane niż w profilu.
          </CardDescription>
        </CardHeader>
      </Card>

      {vehicles.map(vehicle => (
        <Card key={vehicle.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {vehicle.brand} {vehicle.model} – {vehicle.plate}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm">Nr telefonu *</Label>
              <Input
                value={editValues[vehicle.id]?.phone || ""}
                onChange={(e) => handleInputChange(vehicle.id, "phone", e.target.value)}
                onBlur={() => saveContact(vehicle.id, "phone")}
                placeholder="Wpisz nr telefonu"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm">Email (opcjonalnie)</Label>
              <Input
                value={editValues[vehicle.id]?.email || ""}
                onChange={(e) => handleInputChange(vehicle.id, "email", e.target.value)}
                onBlur={() => saveContact(vehicle.id, "email")}
                placeholder="Wpisz adres email"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Komponent dokumentów - wrapper dla nowego panelu
function DriverDocuments({ driverData }: { driverData: any }) {
  return <DriverDocumentsPanel driverId={driverData.driver_id} />;
}

// Komponent przekierowania do giełdy aut
function MarketplaceRedirect({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useTranslation();
  
  useEffect(() => {
    navigate('/gielda');
  }, [navigate]);

  return (
    <div className="text-center py-8 text-muted-foreground">
      {t('common.loading')}
    </div>
  );
}

export default DriverDashboard;