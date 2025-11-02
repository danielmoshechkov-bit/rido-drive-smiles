import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
import { Plus, Calendar, FileText, DollarSign, Car, File, Eye, EyeOff, Info, Menu, ChevronDown, LogOut } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DriverSettlements } from "@/components/DriverSettlements";
import { getAvailableWeeks, getCurrentWeekNumber, cn } from "@/lib/utils";
import { DriverNotificationBell } from "@/components/driver/DriverNotificationBell";
import { useSystemAlerts } from "@/hooks/useSystemAlerts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from 'react-i18next';
import LanguageSelector from "@/components/LanguageSelector";

const DriverDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('weekly-report');
  const [weeklySubTab, setWeeklySubTab] = useState<'my' | 'fuel'>('my');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [driverData, setDriverData] = useState<any>(null);
  const [fleetInfo, setFleetInfo] = useState<{ name: string; contact_name?: string; contact_phone_for_drivers?: string } | null>(null);

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
        <div className="text-center">{t('driver.loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header - compact with dropdown */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="Get RIDO Logo" 
                className="h-8 w-8 flex-shrink-0 cursor-pointer"
                onClick={() => setActiveTab('weekly-report')}
              />
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 px-3 font-medium text-sm hover:bg-muted">
                    {driverData?.drivers?.first_name || t('driver.loading')} {driverData?.drivers?.last_name || ''} 
                    <ChevronDown className="ml-1 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {fleetInfo && (
                    <>
                      <DropdownMenuItem disabled className="flex-col items-start">
                        <span className="text-xs text-muted-foreground">{t('driver.fleet')}</span>
                        <span className="font-medium">{fleetInfo.name}</span>
                      </DropdownMenuItem>
                      {fleetInfo.contact_name && (
                        <DropdownMenuItem disabled className="flex-col items-start">
                          <span className="text-xs text-muted-foreground">{t('driver.caretaker')}</span>
                          <span className="font-medium">{fleetInfo.contact_name} {fleetInfo.contact_phone_for_drivers}</span>
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('driver.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2">
              {driverData?.driver_id && (
                <DriverNotificationBell driverId={driverData.driver_id} />
              )}
              <LanguageSelector />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-3 sm:px-4 lg:px-10 pt-3 pb-20 relative max-w-[1440px]">
        {/* Floating Chat Widget */}
        <div className="fixed bottom-6 right-6 z-50">
          <ChatFab driverData={driverData} />
        </div>
        
        {/* Mobile Navigation - Horizontal with separators */}
        <div className="lg:hidden mb-4">
          <div className="flex items-stretch gap-0 bg-white rounded-full border border-gray-200 shadow-sm overflow-hidden">
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-10 w-10 rounded-full border-2 border-gray-200 bg-white shadow-sm hover:bg-gray-50 flex-shrink-0">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px]">
              <SheetHeader>
                <SheetTitle>{t('driver.panel')}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-2">
                <Button
                  variant={activeTab === 'weekly-report' ? 'default' : 'ghost'}
                  onClick={() => { setActiveTab('weekly-report'); setIsSheetOpen(false); }}
                  className="justify-start gap-2"
                >
                  <DollarSign className="h-4 w-4" />
                  {t('driver.tabs.weekly')}
                </Button>
                <Button
                  variant={activeTab === 'cars' ? 'default' : 'ghost'}
                  onClick={() => { setActiveTab('cars'); setIsSheetOpen(false); }}
                  className="justify-start gap-2"
                >
                  <Car className="h-4 w-4" />
                  {t('driver.tabs.cars')}
                </Button>
                <Button
                  variant={activeTab === 'documents' ? 'default' : 'ghost'}
                  onClick={() => { setActiveTab('documents'); setIsSheetOpen(false); }}
                  className="justify-start gap-2"
                >
                  <FileText className="h-4 w-4" />
                  {t('driver.tabs.documents')}
                </Button>
                <Button
                  variant={activeTab === 'informacje' ? 'default' : 'ghost'}
                  onClick={() => { setActiveTab('informacje'); setIsSheetOpen(false); }}
                  className="justify-start gap-2"
                >
                  <Info className="h-4 w-4" />
                  {t('driver.tabs.info')}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          
          {/* Context buttons for weekly-report - FIOLETOWE PRZYCISKI */}
          {activeTab === 'weekly-report' && (
            <>
              {/* Vertical separator */}
              <div className="w-[1px] bg-gray-200 self-stretch"></div>
              
              <Button 
                variant={weeklySubTab === 'my' ? "default" : "ghost"}
                size="sm"
                onClick={() => setWeeklySubTab('my')}
                className={weeklySubTab === 'my' 
                  ? "h-10 px-3 text-xs font-medium rounded-none flex-1 bg-primary text-white" 
                  : "h-10 px-3 text-xs font-medium rounded-none flex-1 bg-gray-100 hover:bg-primary/20"}
              >
                Wynik tygodniowy
              </Button>
              
              <div className="w-[1px] bg-gray-200 self-stretch"></div>
              
              <Button 
                variant={weeklySubTab === 'fuel' ? "default" : "ghost"}
                size="sm"
                onClick={() => setWeeklySubTab('fuel')}
                className={weeklySubTab === 'fuel' 
                  ? "h-10 px-3 text-xs font-medium rounded-none flex-1 bg-primary text-white" 
                  : "h-10 px-3 text-xs font-medium rounded-none flex-1 bg-gray-100 hover:bg-primary/20"}
              >
                Rozliczenie paliwa
              </Button>
            </>
          )}
          
          {/* Context buttons for cars */}
          {activeTab === 'cars' && (
            <>
              <div className="w-[1px] bg-gray-200 self-stretch"></div>
              
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  const addCarBtn = document.querySelector('[data-add-car-btn]') as HTMLButtonElement;
                  addCarBtn?.click();
                }}
                className="h-10 px-3 text-xs font-medium rounded-none flex-1 hover:bg-gray-100"
              >
                Dodaj auto
              </Button>
            </>
          )}
        </div>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden lg:block mb-6">
          <TabsPill value={activeTab} onValueChange={setActiveTab}>
            <TabsTrigger value="weekly-report">
              <DollarSign className="h-4 w-4 mr-2" />
              {t('driver.tabs.weekly')}
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
              {t('driver.tabs.info')}
            </TabsTrigger>
          </TabsPill>

          {/* Desktop Context Bar - drugi rząd */}
          <div className="mt-4">
            {activeTab === 'weekly-report' && (
              <div className="flex gap-3">
                <Button
                  variant={weeklySubTab === 'my' ? "default" : "outline"}
                  size="default"
                  onClick={() => setWeeklySubTab('my')}
                  className={weeklySubTab === 'my'
                    ? "px-6 py-2.5 rounded-full font-medium text-sm bg-primary text-white shadow-md transition-all"
                    : "px-6 py-2.5 rounded-full font-medium text-sm border-2 border-primary text-primary bg-white hover:bg-primary/10 transition-all"}
                >
                  Moje rozliczenia
                </Button>
                
                <Button
                  variant={weeklySubTab === 'fuel' ? "default" : "outline"}
                  size="default"
                  onClick={() => setWeeklySubTab('fuel')}
                  className={weeklySubTab === 'fuel'
                    ? "px-6 py-2.5 rounded-full font-medium text-sm bg-primary text-white shadow-md transition-all"
                    : "px-6 py-2.5 rounded-full font-medium text-sm border-2 border-primary text-primary bg-white hover:bg-primary/10 transition-all"}
                >
                  Paliwo
                </Button>
              </div>
            )}
            
            {activeTab === 'cars' && (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => {
                    const addCarBtn = document.querySelector('[data-add-car-btn]') as HTMLButtonElement;
                    addCarBtn?.click();
                  }}
                  className="px-6 py-2.5 rounded-full font-medium text-sm border-2 border-primary text-primary bg-white hover:bg-primary/10 transition-all"
                >
                  + Dodaj auto
                </Button>
              </div>
            )}
          </div>

          {/* Tab Content - Desktop */}
          <TabsContent value="weekly-report" className="mt-6">
            <SettlementsWithSubTabs 
              driverData={driverData} 
              activeSubTab={weeklySubTab}
              onSubTabChange={setWeeklySubTab}
            />
          </TabsContent>
        
          <TabsContent value="cars" className="mt-6">
            <CarsSection driverData={driverData} />
          </TabsContent>
          
          <TabsContent value="documents" className="mt-6">
            <DriverDocuments driverData={driverData} />
          </TabsContent>

          <TabsContent value="informacje" className="mt-6">
            <DriverNotifications driverId={driverData.driver_id} />
          </TabsContent>
        </div>

        {/* Tab Content - Mobile only (outside TabsPill) */}
        <div className="lg:hidden">
          {activeTab === 'weekly-report' && (
            <SettlementsWithSubTabs 
              driverData={driverData} 
              activeSubTab={weeklySubTab}
              onSubTabChange={setWeeklySubTab}
            />
          )}
          {activeTab === 'cars' && <CarsSection driverData={driverData} />}
          {activeTab === 'documents' && <DriverDocuments driverData={driverData} />}
          {activeTab === 'informacje' && <DriverNotifications driverId={driverData.driver_id} />}
        </div>
      </div>
    </div>
  );
};

// Komponent sekcji samochodów z przyciskiem dodaj auto
function CarsSection({ driverData }: { driverData: any }) {
  const { t } = useTranslation();
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const driverId = driverData.driver_id;

  return (
    <div className="space-y-4">
      {/* Przycisk Dodaj auto */}
      <div className="flex justify-end">
        <Button 
          data-add-car-btn
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

// PIN Display component with password verification
function PinDisplay({ pin }: { pin: string }) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [password, setPassword] = useState("");
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);

  const handleReveal = async () => {
    if (revealed) {
      setRevealed(false);
      return;
    }
    setShowPasswordPrompt(true);
  };

  const handlePasswordSubmit = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      toast.error(t('driver.pin.cannotVerify'));
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: password
    });

    if (error) {
      toast.error(t('driver.pin.incorrectPassword'));
      setPassword("");
      return;
    }

    setRevealed(true);
    setShowPasswordPrompt(false);
    setPassword("");
    
    // Auto-hide after 30 seconds
    setTimeout(() => setRevealed(false), 30000);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <p className="text-lg font-semibold text-primary">
          {revealed ? pin : "••••"}
        </p>
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={handleReveal}
          className="h-6 w-6 p-0"
        >
          {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </Button>
      </div>

      <Dialog open={showPasswordPrompt} onOpenChange={setShowPasswordPrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('driver.pin.confirm')}</DialogTitle>
            <DialogDescription>
              {t('driver.pin.enterPassword')}
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            placeholder={t('driver.pin.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordPrompt(false)}>
              {t('driver.pin.cancel')}
            </Button>
            <Button onClick={handlePasswordSubmit}>{t('driver.pin.confirmBtn')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Komponent z sub-tabami dla rozliczeń - controlled component
function SettlementsWithSubTabs({ 
  driverData, 
  activeSubTab, 
  onSubTabChange 
}: { 
  driverData: any;
  activeSubTab?: 'my' | 'fuel';
  onSubTabChange?: (tab: 'my' | 'fuel') => void;
}) {
  const { t } = useTranslation();
  // Fallback to internal state if not controlled
  const [internalTab, setInternalTab] = useState<'my' | 'fuel'>("my");
  const currentTab = activeSubTab ?? internalTab;
  
  const handleTabChange = (tab: 'my' | 'fuel') => {
    if (onSubTabChange) {
      onSubTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };
  
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const currentYear = new Date().getFullYear();
    return getCurrentWeekNumber(currentYear);
  });
  
  const subTabs = [
    { value: "my", label: t('weekly.title'), visible: true },
    { value: "fuel", label: t('fuel.title'), visible: true }
  ];

  const weeks = getAvailableWeeks(selectedYear);
  const selectedWeekData = weeks.find(w => w.number === selectedWeek);
  const periodFrom = selectedWeekData?.start;
  const periodTo = selectedWeekData?.end;

  if (currentTab === "fuel") {
    return (
      <div>
        {/* UniversalSubTabBar ukryty */}
        <div className="hidden">
          <UniversalSubTabBar
            activeTab={currentTab}
            onTabChange={handleTabChange}
            tabs={subTabs}
          />
        </div>
        <div className="space-y-4 mt-4">
          {/* Compact horizontal layout - all in one line */}
          <div className="flex gap-3 items-center flex-wrap">
            {/* Year selector */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">{t('weekly.year')}</label>
              <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
                <SelectTrigger className="h-9 px-3 w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[60]" position="popper" sideOffset={6}>
                  {[2023, 2024, 2025, 2026].map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Week selector */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">{t('weekly.week')}</label>
              <Select value={selectedWeek.toString()} onValueChange={(v) => setSelectedWeek(parseInt(v))}>
                <SelectTrigger className="h-9 px-3 w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] z-[60]" position="popper" sideOffset={6}>
                  {weeks.map(week => (
                    <SelectItem key={week.number} value={week.number.toString()}>
                      {week.displayLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Separator */}
            <div className="h-6 w-px bg-border" />

            {/* Fuel Card Number */}
            {driverData.drivers?.fuel_card_number ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t('fuel.card')}:</span>
                <span className="text-sm font-medium">{driverData.drivers.fuel_card_number}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-sm">{t('fuel.noCard')}</span>
              </div>
            )}

            {/* PIN with security */}
            {driverData.drivers?.fuel_card_pin ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t('fuel.pin')}:</span>
                <PinDisplay pin={driverData.drivers.fuel_card_pin} />
              </div>
            ) : driverData.drivers?.fuel_card_number && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-sm">{t('fuel.noPinYet')}</span>
              </div>
            )}
          </div>
          
          <DriverFuelView 
            fuelCardNumber={driverData.drivers?.fuel_card_number || ""} 
            periodFrom={periodFrom} 
            periodTo={periodTo}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* UniversalSubTabBar ukryty */}
      <div className="hidden">
        <UniversalSubTabBar
          activeTab={currentTab}
          onTabChange={handleTabChange}
          tabs={subTabs}
        />
      </div>
      <DriverSettlements 
        driverId={driverData.driver_id} 
        hideControls={false}
      />
    </div>
  );
}

// Component to display driver notifications
function DriverNotifications({ driverId }: { driverId: string }) {
  const { alerts, loading, markAsResolved } = useSystemAlerts();
  const driverAlerts = alerts.filter(a => a.driver_id === driverId && a.status === 'pending');

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
      {driverAlerts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Brak nowych powiadomień</CardTitle>
            <CardDescription>Wszystkie powiadomienia zostały przeczytane</CardDescription>
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

// Komponent dokumentów
function DriverDocuments({ driverData }: { driverData: any }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState("Umowa / RODO");
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
      
      toast.success("Dokument został przesłany");
      setFile(null);
      setType("Umowa / RODO");
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const types = [
    "Umowa / RODO",
    "Prawo jazdy", 
    "Dowód osobisty",
    "Legitymacja kierowcy",
    "Badania lekarskie",
    "Inny dokument"
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Dokumenty</h2>

      <Card className="rounded-xl shadow-soft">
        <CardHeader>
          <CardTitle>Zarządzaj dokumentami</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              className="px-3 py-2 border border-input rounded-lg bg-background"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {types.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <Input 
              type="file" 
              accept=".pdf,.jpg,.jpeg,.png,.docx" 
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="rounded-lg"
            />
            <Button onClick={upload} disabled={!file || loading} className="rounded-lg">
              {loading ? "Przesyłanie..." : "Dodaj dokument"}
            </Button>
          </div>
          
          {docs.length === 0 ? (
            <p className="text-muted-foreground">Brak dokumentów.</p>
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
                      Pobierz
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