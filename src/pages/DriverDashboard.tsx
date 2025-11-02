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
import { Plus, Calendar, FileText, DollarSign, Car, File, Eye, EyeOff, Info } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DriverSettlements } from "@/components/DriverSettlements";
import { getAvailableWeeks, getCurrentWeekNumber } from "@/lib/utils";
import { DriverNotificationBell } from "@/components/driver/DriverNotificationBell";
import { useSystemAlerts } from "@/hooks/useSystemAlerts";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from 'react-i18next';
import LanguageSelector from "@/components/LanguageSelector";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

const DriverDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('weekly-report');
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
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header - responsive with mobile wrap */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <img 
              src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
              alt="Get RIDO Logo" 
              className="h-8 w-8 flex-shrink-0"
            />
            <div className="flex flex-col gap-1 max-w-full overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-primary text-xs sm:text-sm whitespace-nowrap">
                  {t('driver.panel')}
                </span>
                
                {driverData?.drivers?.first_name && (
                  <span className="font-medium text-xs sm:text-sm truncate max-w-[200px] sm:max-w-none">
                    {driverData.drivers.first_name} {driverData.drivers.last_name}
                  </span>
                )}
              </div>
              
              {fleetInfo && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] sm:text-xs">
                  <span className="font-medium text-primary whitespace-nowrap">
                    {t('driver.fleet')}: {fleetInfo.name}
                  </span>
                  {fleetInfo.contact_name && fleetInfo.contact_phone_for_drivers && (
                    <span className="text-muted-foreground whitespace-nowrap">
                      {t('driver.caretaker')}: {fleetInfo.contact_name} {fleetInfo.contact_phone_for_drivers}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2 md:space-x-3">
            {driverData?.driver_id && (
              <DriverNotificationBell driverId={driverData.driver_id} />
            )}
            <LanguageSelector />
            <Button variant="outline" onClick={handleLogout} className="rounded-lg text-xs md:text-sm px-2 md:px-4">
              {t('driver.logout')}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 pt-4 pb-24 relative">
        {/* Floating Chat Widget */}
        <div className="fixed bottom-6 right-6 z-50">
          <ChatFab driverData={driverData} />
        </div>
        
        {/* Hamburger Menu for Mobile */}
        <div className="md:hidden mb-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-10 w-10">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px]">
              <div className="flex flex-col gap-3 mt-8">
                <Button
                  variant={activeTab === 'weekly-report' ? 'default' : 'ghost'}
                  className="w-full justify-start gap-2"
                  onClick={() => setActiveTab('weekly-report')}
                >
                  <DollarSign className="h-4 w-4" />
                  {t('driver.tabs.weekly')}
                </Button>
                <Button
                  variant={activeTab === 'cars' ? 'default' : 'ghost'}
                  className="w-full justify-start gap-2"
                  onClick={() => setActiveTab('cars')}
                >
                  <Car className="h-4 w-4" />
                  {t('driver.tabs.cars')}
                </Button>
                <Button
                  variant={activeTab === 'documents' ? 'default' : 'ghost'}
                  className="w-full justify-start gap-2"
                  onClick={() => setActiveTab('documents')}
                >
                  <FileText className="h-4 w-4" />
                  {t('driver.tabs.documents')}
                </Button>
                <Button
                  variant={activeTab === 'informacje' ? 'default' : 'ghost'}
                  className="w-full justify-start gap-2"
                  onClick={() => setActiveTab('informacje')}
                >
                  <Info className="h-4 w-4" />
                  {t('driver.tabs.info')}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop Tabs - Hidden on Mobile */}
        <TabsPill value={activeTab} onValueChange={setActiveTab} className="mb-6 hidden md:flex">
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

          {/* Tab Content - Desktop only (wrapped in TabsPill) */}
          <TabsContent value="weekly-report">
              <SettlementsWithSubTabs driverData={driverData} />
            </TabsContent>
          
          <TabsContent value="cars">
            <CarsSection driverData={driverData} />
          </TabsContent>
          
          <TabsContent value="documents">
            <DriverDocuments driverData={driverData} />
          </TabsContent>

          <TabsContent value="informacje">
            <DriverNotifications driverId={driverData.driver_id} />
          </TabsContent>
        </TabsPill>

        {/* Tab Content - Mobile only (outside TabsPill) */}
        <div className="md:hidden">
          {activeTab === 'weekly-report' && <SettlementsWithSubTabs driverData={driverData} />}
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

// Komponent z sub-tabami dla rozliczeń - identyczny układ jak w portalu flotowym
function SettlementsWithSubTabs({ driverData }: { driverData: any }) {
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState("my");
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

  if (activeSubTab === "fuel") {
    return (
      <div>
        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />
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
      <UniversalSubTabBar
        activeTab={activeSubTab}
        onTabChange={setActiveSubTab}
        tabs={subTabs}
      />
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