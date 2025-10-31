import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TabsPill, useDriverId } from "@/ridoUiPack";
import { AddOwnCarModal } from "@/components/driver/AddOwnCarModal";
import { TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { UniversalCard } from "@/components/UniversalCard";
import { AddCarForm } from "@/components/AddCarForm";
import { VehicleList } from "@/components/VehicleList";
import { SettlementPlanSelector } from "@/components/SettlementPlanSelector";
import { ChatFab } from "@/components/chat/ChatFab";
import { LeasedCarWrapper } from "@/components/driver/LeasedCarWrapper";
import { OwnCarsWrapper } from "@/components/driver/OwnCarsWrapper";
import { UniversalSelector } from "@/components/UniversalSelector";
import { DriverSettlements } from "@/components/DriverSettlements";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { toast } from "sonner";
import { 
  MessageCircle, 
  Send, 
  X, 
  FileText, 
  Calendar, 
  Car,
  Building2,
  ChevronDown,
  Plus
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

const DriverDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('weekly-report');
  const [user, setUser] = useState<any>(null);
  const [driverData, setDriverData] = useState<any>(null);

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
        .select("*")
        .eq("id", driverAppUser.driver_id)
        .maybeSingle();
      
      // Ustaw dane nawet jeśli drivers jest puste - dzięki temu strona się załaduje
      setDriverData({
        driver_id: driverAppUser.driver_id,
        drivers: driverDetails || {},
        city_id: driverAppUser.city_id
      });
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
            <h1 className="text-xl font-bold text-primary">Panel Kierowcy</h1>
            <span className="text-muted-foreground">
              - {driverData.drivers?.first_name || 'Kierowca'} {driverData.drivers?.last_name || ''}
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="outline" onClick={handleLogout} className="rounded-lg">
              Wyloguj
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
          <TabsTrigger value="weekly-report">Rozliczenie tygodniowe</TabsTrigger>
          <TabsTrigger value="cars">Samochód</TabsTrigger>
          <TabsTrigger value="documents">Dokumenty</TabsTrigger>
          <TabsTrigger value="fuel">Paliwo</TabsTrigger>

          {/* Tab Content */}
          <TabsContent value="weekly-report">
              <WeeklyResults driverData={driverData} />
            </TabsContent>
          
          <TabsContent value="cars">
            <CarsSection driverData={driverData} />
          </TabsContent>
          
          <TabsContent value="documents">
            <DriverDocuments driverData={driverData} />
          </TabsContent>
          
          <TabsContent value="fuel">
            <FuelLogs driverData={driverData} />
          </TabsContent>
        </TabsPill>
      </div>
    </div>
  );
};

// Komponent sekcji samochodów z przyciskiem dodaj auto
function CarsSection({ driverData }: { driverData: any }) {
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
          Dodaj auto
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

// Komponent wyników tygodnia z poprawionym kalendarzem
function WeeklyResults({ driverData }: { driverData: any }) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeek());
  const [initialized, setInitialized] = useState(false);
  const [weekData, setWeekData] = useState({
    from: "",
    to: "",
    earnings: {
      uber: 0,
      bolt: 0,
      freenow: 0
    },
    fuel: 0,
    rental: 0,
    plan: "50+8%"
  });

  function getCurrentWeek() {
    const now = new Date();
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const daysFromJan1 = Math.floor((now.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000));
    return Math.ceil((daysFromJan1 + jan1.getDay()) / 7);
  }

  // Funkcja do obliczania tygodni zgodnie z kalendarzem (poniedziałek-niedziela)
  const getWeekDates = (year: number) => {
    const weeks = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    
    let currentDate = new Date(year, 0, 1);
    
    // Znajdź pierwszy poniedziałek roku
    while (currentDate.getDay() !== 1) {
      currentDate.setDate(currentDate.getDate() + 1);
      if (currentDate.getMonth() > 0) {
        currentDate = new Date(year, 0, 1);
        break;
      }
    }

    let weekNumber = 1;
    
    while (currentDate.getFullYear() === year) {
      const startDate = new Date(currentDate);
      const endDate = new Date(currentDate);
      endDate.setDate(endDate.getDate() + 6);
      
      if (endDate.getFullYear() > year) {
        break;
      }
      
      // Skip future weeks in current year
      if (year === currentYear && startDate > now) {
        break;
      }
      
      const startDay = format(startDate, 'EEE', { locale: pl });
      const endDay = format(endDate, 'EEE', { locale: pl });
      
      weeks.push({
        week: weekNumber,
        startDate: format(startDate, 'd MMM', { locale: pl }),
        endDate: format(endDate, 'd MMM', { locale: pl }),
        fromISO: format(startDate, 'yyyy-MM-dd'),
        toISO: format(endDate, 'yyyy-MM-dd'),
        label: `Tydz. ${weekNumber} (${format(startDate, 'd MMM', { locale: pl })} - ${format(endDate, 'd MMM', { locale: pl })} ${startDay}-${endDay})`
      });
      
      currentDate.setDate(currentDate.getDate() + 7);
      weekNumber++;
    }
    
    return weeks.reverse(); // Najnowsze tygodnie na górze
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).sort((a, b) => b - a);
  const weekDates = getWeekDates(selectedYear);

  const loadWeekData = async () => {
    const weekInfo = weekDates.find(w => w.week === selectedWeek);
    if (!weekInfo) {
      console.log('❌ No week info found for week:', selectedWeek);
      return;
    }

    console.log('📅 Loading data for:', { 
      driverId: driverData.driver_id, 
      from: weekInfo.fromISO, 
      to: weekInfo.toISO 
    });

    setWeekData(prev => ({
      ...prev,
      from: weekInfo.fromISO,
      to: weekInfo.toISO
    }));

    // Ładowanie rzeczywistych danych z bazy
    const { data: settlements, error: settlementsError } = await supabase
      .from("settlements")
      .select("*")
      .eq("driver_id", driverData.driver_id)
      .gte("period_from", weekInfo.fromISO)
      .lte("period_to", weekInfo.toISO);
    
    if (settlementsError) {
      console.error('❌ Error loading settlements:', settlementsError);
      toast.error(`Błąd ładowania rozliczeń: ${settlementsError.message}`);
      return;
    }
    
    console.log("📊 Loaded settlements:", settlements?.length || 0, "records");
    
    if (!settlements || settlements.length === 0) {
      console.log('⚠️ No settlements found for this week');
      toast.info('Brak rozliczeń dla wybranego tygodnia');
    }
    
    // Pobierz opłatę za wynajem z przypisanego pojazdu
    const { data: assignment, error } = await supabase
      .from("driver_vehicle_assignments")
      .select(`
        id,
        vehicle_id,
        vehicles(weekly_rental_fee)
      `)
      .eq("driver_id", driverData.driver_id)
      .eq("status", "active")
      .order('assigned_at', { ascending: false })
      .limit(1)
      .single();
    
    const rentalFee = assignment?.vehicles?.weekly_rental_fee || 0;
    
    // Zsumuj dane z CSV (pole amounts)
    if (settlements && settlements.length > 0) {
      const totals = settlements.reduce((acc, settlement) => {
        const amounts = (settlement.amounts || {}) as any;
        return {
          uber: acc.uber + (amounts.uber || 0),
          uberCashless: acc.uberCashless + (amounts.uber_cashless || 0),
          bolt: acc.bolt + (amounts.bolt_gross || 0),
          boltNet: acc.boltNet + (amounts.bolt_net || 0),
          freenow: acc.freenow + (amounts.freenow_gross || 0),
          freenowNet: acc.freenowNet + (amounts.freenow_net || 0),
          fuel: acc.fuel + (amounts.fuel || 0)
        };
      }, { uber: 0, uberCashless: 0, bolt: 0, boltNet: 0, freenow: 0, freenowNet: 0, fuel: 0 });
      
      console.log("💰 Calculated totals:", totals);
      
      setWeekData(prev => ({
        ...prev,
        earnings: {
          uber: totals.uber,
          bolt: totals.bolt,
          freenow: totals.freenow
        },
        fuel: totals.fuel,
        rental: rentalFee
      }));
    } else {
      // Reset jeśli brak danych
      setWeekData(prev => ({
        ...prev,
        earnings: {
          uber: 0,
          bolt: 0,
          freenow: 0
        },
        fuel: 0,
        rental: rentalFee
      }));
    }
  };

  useEffect(() => {
    // On first mount, jump to the latest available settlement period for this driver
    if (initialized) return;
    (async () => {
      const { data } = await supabase
        .from('settlements')
        .select('period_from, period_to')
        .eq('driver_id', driverData.driver_id)
        .order('period_from', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const latest = data[0];
        const year = new Date(latest.period_from).getFullYear();
        const weeksForYear = getWeekDates(year);
        const found = weeksForYear.find(w => latest.period_from >= w.fromISO && latest.period_to <= w.toISO);
        if (found) {
          setSelectedYear(year);
          setSelectedWeek(found.week);
        }
      }
      setInitialized(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-load data when year/week changes after initialization
  useEffect(() => {
    if (initialized && selectedYear && selectedWeek) {
      loadWeekData();
    }
  }, [selectedYear, selectedWeek, initialized]);

  const chartData = [
    { name: "Uber", value: weekData.earnings.uber, fill: "#000000" },
    { name: "Bolt", value: weekData.earnings.bolt, fill: "#34D399" },
    { name: "FREE NOW", value: weekData.earnings.freenow, fill: "#EF4444" }
  ];

  console.log('📊 Chart data:', chartData);
  console.log('💰 Week earnings:', weekData.earnings);

  const totalEarnings = weekData.earnings.uber + weekData.earnings.bolt + weekData.earnings.freenow;
  
  const calculateNetAmount = (earnings: number, fuel: number, rental: number, plan: string) => {
    let deductions = fuel + rental;
    if (plan === "50+8%") {
      deductions += 50 + Math.round(earnings * 0.08);
    } else if (plan === "tylko 159") {
      deductions += 159;
    }
    return earnings - deductions;
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-xl shadow-soft">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 mb-4">
            <CardTitle className="text-h2">Wynik tygodniowy</CardTitle>
          </div>
          
          {/* Kontrolki rok, okres i plan */}
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-shrink-0">
              <label className="text-xs text-muted-foreground block mb-1">Rok</label>
              <UniversalSelector
                id="year-selector"
                items={years.map(year => ({ id: year.toString(), name: year.toString() }))}
                currentValue={selectedYear.toString()}
                placeholder={selectedYear.toString()}
                showSearch={false}
                showAdd={false}
                allowClear={false}
                onSelect={(item) => item && setSelectedYear(parseInt(item.id))}
                className="w-28"
              />
            </div>
            
            <div className="flex-1 min-w-[240px] max-w-md">
              <label className="text-xs text-muted-foreground block mb-1">Okres</label>
              <UniversalSelector
                id="week-selector"
                items={weekDates.map((w) => ({
                  id: w.week.toString(),
                  name: w.label
                }))}
                currentValue={selectedWeek.toString()}
                placeholder={weekDates.find(w => w.week === selectedWeek) ? `Tydz. ${selectedWeek}` : "Wybierz"}
                showSearch={true}
                showAdd={false}
                allowClear={false}
                onSelect={(item) => item && setSelectedWeek(parseInt(item.id))}
                className="w-full"
              />
            </div>
            
            <SettlementPlanSelector 
              driverData={driverData} 
              currentPlanId={null} 
              onPlanChange={(plan) => setWeekData(prev => ({ ...prev, plan }))} 
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Szczegółowa tabela rozliczeń z wbudowanym wykresem */}
          <DriverSettlements 
            driverId={driverData.driver_id}
            preSelectedYear={selectedYear}
            preSelectedWeek={selectedWeek}
            hideControls={true}
          />
        </CardContent>
      </Card>
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
    <Card className="rounded-xl shadow-soft">
      <CardHeader>
        <CardTitle>Dokumenty</CardTitle>
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
  );
}

// Function removed - fleet info is now integrated into the car section

// Komponent logów paliwa
function FuelLogs({ driverData }: { driverData: any }) {
  return (
    <Card className="rounded-xl shadow-soft">
      <CardHeader>
        <CardTitle>Logi paliwa</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          Historia tankowania pojawi się tutaj.
        </p>
      </CardContent>
    </Card>
  );
}

export default DriverDashboard;