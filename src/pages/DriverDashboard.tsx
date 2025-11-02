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
import { Plus, Calendar, FileText, DollarSign, Car, File, Info } from "lucide-react";
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
import { PinDisplay } from "@/components/PinDisplay";
import LanguageSelector from "@/components/LanguageSelector";

const DriverDashboard = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
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
        <div className="text-center">Ładowanie...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header - identyczny jak AdminDashboard */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <img 
              src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
              alt="Get RIDO Logo" 
              className="h-8 w-8"
            />
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-primary">Panel kierowcy</span>
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
                  <span className="font-medium text-primary">Flota: {fleetInfo.name}</span>
                  {fleetInfo.contact_name && fleetInfo.contact_phone_for_drivers && (
                    <>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-sm text-muted-foreground">
                        Opiekun: {fleetInfo.contact_name} {fleetInfo.contact_phone_for_drivers}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {driverData?.driver_id && (
              <DriverNotificationBell driverId={driverData.driver_id} />
            )}
            <LanguageSelector />
            <Button variant="outline" onClick={handleLogout} className="rounded-lg">
              {t('auth.logout')}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 pt-4 pb-8 relative">
        {/* Floating Chat Widget */}
        <div className="fixed bottom-6 right-6 z-50">
          <ChatFab driverData={driverData} />
        </div>
        
        {/* Slim Pill Tabs */}
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

          {/* Tab Content */}
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
                <div className="flex justify-start px-6">
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
function SettlementsWithSubTabs({ driverData }: { driverData: any }) {
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState("my");
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
      <UniversalSubTabBar
        activeTab={activeSubTab}
        onTabChange={setActiveSubTab}
        tabs={subTabs}
      />
      
      {activeSubTab === "fuel" ? (
        <div className="mt-4">
          <DriverFuelView 
            fuelCardNumber={driverData.drivers?.fuel_card_number || ""} 
            fuelCardPin={driverData.drivers?.fuel_card_pin}
          />
        </div>
      ) : (
        <DriverSettlements 
          driverId={driverData.driver_id} 
          hideControls={false}
        />
      )}
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