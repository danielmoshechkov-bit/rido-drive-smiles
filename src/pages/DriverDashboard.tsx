import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TabsPill, AddOwnCarModal, useDriverId } from "@/ridoUiPack";
import { TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { UniversalCard } from "@/components/UniversalCard";
import { AddCarForm } from "@/components/AddCarForm";
import { VehicleList } from "@/components/VehicleList";
import { SettlementPlanSelector } from "@/components/SettlementPlanSelector";
import { ChatFab } from "@/components/chat/ChatFab";
import { LeasedCarWrapper } from "@/components/driver/LeasedCarWrapper";
import { DriverFleetBadgeSelector } from "@/components/DriverFleetBadgeSelector";
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
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const DriverDashboard = () => {
  const navigate = useNavigate();
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
      
      // Standardowe pobieranie dla autentycznych użytkowników
      const { data } = await supabase
        .from("driver_app_users")
        .select(`
          *,
          drivers!inner(*)
        `)
        .eq("user_id", session.user.id)
        .single();
        
      if (data) {
        setDriverData(data);
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
            <h1 className="text-xl font-bold text-primary">Panel Kierowcy</h1>
            <span className="text-muted-foreground">
              - {driverData.drivers.first_name} {driverData.drivers.last_name}
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
  const driverId = useDriverId();

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

      {/* Selektor floty */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Flota:</span>
        <DriverFleetBadgeSelector 
          driverId={driverData.driver_id}
          fleetId={driverData.drivers?.fleet_id}
          onFleetChange={() => setRefreshTrigger(prev => prev + 1)}
        />
      </div>

      {/* Karta wynajętego auta */}
      <LeasedCarWrapper key={refreshTrigger} driverData={driverData} />

      {/* Modal dodawania auta */}
      <AddOwnCarModal 
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        driverId={driverId}
      />
    </div>
  );
}

// Komponent wyników tygodnia z poprawionym kalendarzem
function WeeklyResults({ driverData }: { driverData: any }) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeek());
  const [weekData, setWeekData] = useState({
    from: "",
    to: "",
    earnings: {
      uber: 1250,
      bolt: 890,
      freenow: 450
    },
    fuel: 320,
    rental: 0,
    plan: "39+8%"
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
    
    // Znajdź pierwszy poniedziałek roku lub rozpocznij od 1 stycznia jeśli to poniedziałek
    while (currentDate.getDay() !== 1) {
      currentDate.setDate(currentDate.getDate() + 1);
      // Jeśli doszliśmy do lutego, znaczy że 1 stycznia nie było poniedziałkiem
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
      
      // Jeśli koniec tygodnia wypada w przyszłym roku, przerwij
      if (endDate.getFullYear() > year) {
        break;
      }
      
      // Tylko dodaj tygodnie, które już się skończyły lub obecny tydzień
      if (year < currentYear || (year === currentYear && startDate <= now)) {
        weeks.push({
          week: weekNumber,
          startDate: startDate.toLocaleDateString("pl-PL", { day: "numeric", month: "long" }),
          endDate: endDate.toLocaleDateString("pl-PL", { day: "numeric", month: "long" }),
          fromISO: startDate.toISOString().slice(0, 10),
          toISO: endDate.toISOString().slice(0, 10)
        });
      }
      
      currentDate.setDate(currentDate.getDate() + 7);
      weekNumber++;
    }
    
    return weeks.reverse(); // Najnowsze tygodnie na górze
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);
  const weekDates = getWeekDates(selectedYear);

  const loadWeekData = async () => {
    const weekInfo = weekDates.find(w => w.week === selectedWeek);
    if (!weekInfo) return;

    setWeekData(prev => ({
      ...prev,
      from: weekInfo.fromISO,
      to: weekInfo.toISO
    }));

    // Ładowanie rzeczywistych danych z bazy
    const { data: settlements } = await supabase
      .from("settlements")
      .select("*")
      .eq("driver_id", driverData.driver_id)
      .gte("week_start", weekInfo.fromISO)
      .lte("week_end", weekInfo.toISO);
    
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
    
    console.log("Assignment data:", assignment);
    console.log("Assignment error:", error);
    console.log("Driver ID:", driverData.driver_id);
    
    if (error) {
      console.error("Error fetching assignment:", error);
    }
    
    const rentalFee = assignment?.vehicles?.weekly_rental_fee || 0;
    console.log("Rental fee extracted:", rentalFee);
    console.log("Full vehicles object:", assignment?.vehicles);
    
    if (settlements && settlements.length > 0) {
      setWeekData(prev => ({
        ...prev,
        rental: rentalFee
      }));
    } else {
      setWeekData(prev => ({
        ...prev,
        rental: rentalFee
      }));
    }
  };

  useEffect(() => {
    loadWeekData();
  }, [selectedYear, selectedWeek, driverData.driver_id]);

  const chartData = [
    { name: "Uber", value: weekData.earnings.uber, fill: "#000000" },
    { name: "Bolt", value: weekData.earnings.bolt, fill: "#34D399" },
    { name: "FREE NOW", value: weekData.earnings.freenow, fill: "#EF4444" }
  ];

  const totalEarnings = weekData.earnings.uber + weekData.earnings.bolt + weekData.earnings.freenow;
  
  const calculateNetAmount = (earnings: number, fuel: number, rental: number, plan: string) => {
    let deductions = fuel + rental;
    if (plan === "39+8%") {
      deductions += 39 + Math.round(earnings * 0.08);
    } else if (plan === "tylko 159") {
      deductions += 159;
    }
    return earnings - deductions;
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-xl shadow-soft">
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <CardTitle className="text-h2">Wynik tygodniowy</CardTitle>
            
            {/* Compact Controls Row */}
            <div className="flex gap-3 items-center flex-wrap">
              <div className="filter-tile min-w-0">
                <label className="text-xs text-muted-foreground block mb-1">Rok</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" className="h-6 p-0 text-sm font-medium hover:bg-transparent">
                      {selectedYear}
                      <ChevronDown className="ml-1 h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-32 p-2 rounded-lg">
                    {years.map(year => (
                      <Button
                        key={year}
                        variant="ghost"
                        className="w-full justify-start rounded-md text-sm"
                        onClick={() => setSelectedYear(year)}
                      >
                        {year}
                      </Button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="filter-tile min-w-0 max-w-64">
                <label className="text-xs text-muted-foreground block mb-1">Okres</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" className="h-6 p-0 text-sm font-medium hover:bg-transparent justify-start">
                      <span className="truncate">
                        {weekDates.find(w => w.week === selectedWeek) 
                          ? `Tydz. ${selectedWeek}`
                          : "Wybierz"}
                      </span>
                      <ChevronDown className="ml-1 h-3 w-3 flex-shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-2 rounded-lg max-h-64 overflow-y-auto">
                    {weekDates.map(({ week, startDate, endDate }) => (
                      <Button
                        key={week}
                        variant="ghost"
                        className="w-full justify-start text-left rounded-md"
                        onClick={() => setSelectedWeek(week)}
                      >
                        <div className="flex flex-col items-start">
                          <span className="font-medium text-sm">Tydzień {week}</span>
                          <span className="text-xs text-muted-foreground">{startDate} - {endDate}</span>
                        </div>
                      </Button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>

              <div className="filter-tile">
                <SettlementPlanSelector driverData={driverData} currentPlan="" onPlanChange={(plan) => setWeekData(prev => ({ ...prev, plan }))} />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Diagram wyników */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-xl shadow-soft">
              <CardHeader className="pb-4">
                <CardTitle className="text-h3">Zarobki według platform</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ width: "100%", height: 300 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={chartData}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={100}
                        label={({ name, value }) => `${name}: ${value} zł`}
                      />
                      <Tooltip formatter={(value) => [`${value} zł`, 'Zarobki']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-xl shadow-soft">
              <CardHeader className="pb-4">
                <CardTitle className="text-h3">Podsumowanie tygodnia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Uber:</span>
                    <span className="font-medium">{weekData.earnings.uber} zł</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bolt:</span>
                    <span className="font-medium">{weekData.earnings.bolt} zł</span>
                  </div>
                  <div className="flex justify-between">
                    <span>FREE NOW:</span>
                    <span className="font-medium">{weekData.earnings.freenow} zł</span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex justify-between font-medium text-lg">
                      <span>Razem:</span>
                      <span>{totalEarnings} zł</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>Paliwo:</span>
                    <span>-{weekData.fuel} zł</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>Wynajem auta:</span>
                    <span>-{weekData.rental || 0} zł</span>
                  </div>
                  {weekData.plan === "39+8%" && (
                    <>
                      <div className="flex justify-between text-red-600">
                        <span>Opłata stała:</span>
                        <span>-39 zł</span>
                      </div>
                      <div className="flex justify-between text-red-600">
                        <span>Podatek (8%):</span>
                        <span>-{Math.round(totalEarnings * 0.08)} zł</span>
                      </div>
                    </>
                  )}
                  {weekData.plan === "tylko 159" && (
                    <div className="flex justify-between text-red-600">
                      <span>Opłata miesięczna:</span>
                      <span>-159 zł</span>
                    </div>
                  )}
                  <div className="border-t pt-2">
                    <div className="flex justify-between font-bold text-lg text-green-600">
                      <span>Do wypłaty:</span>
                      <span>{calculateNetAmount(totalEarnings, weekData.fuel, weekData.rental || 0, weekData.plan)} zł</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
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