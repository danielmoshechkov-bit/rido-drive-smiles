import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import LanguageSelector from "@/components/LanguageSelector";
import { SettlementPlanSelector } from "@/components/SettlementPlanSelector";
import { FileText, MessageCircle, X, Send, ChevronDown } from "lucide-react";
import { AddCarForm } from "@/components/AddCarForm";

const DriverDashboard = () => {
  const { t } = useTranslation();
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
            <LanguageSelector />
            <Button variant="outline" onClick={handleLogout} className="rounded-lg">
              Wyloguj
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 relative">
        {/* Kompaktowy chat widget w prawym dolnym rogu */}
        <div className="fixed bottom-4 right-4 z-50">
          <DriverChatButton driverData={driverData} />
        </div>
        
        <div className="bg-gradient-hero text-primary-foreground rounded-lg p-2 shadow-purple h-14 mb-6">
          <div className="grid grid-cols-5 h-full gap-1">
            <button
              onClick={() => setActiveTab('weekly-report')}
              className={`rounded-md px-6 py-3 text-base font-medium transition-all ${
                activeTab === 'weekly-report' 
                  ? 'bg-white text-primary' 
                  : 'hover:bg-white/20 hover:text-white'
              }`}
            >
              Rozliczenie tygodniowe
            </button>
            <button
              onClick={() => setActiveTab('cars')}
              className={`rounded-md px-6 py-3 text-base font-medium transition-all ${
                activeTab === 'cars' 
                  ? 'bg-white text-primary' 
                  : 'hover:bg-white/20 hover:text-white'
              }`}
            >
              Samochód
            </button>
            <button
              onClick={() => setActiveTab('fleet-info')}
              className={`rounded-md px-6 py-3 text-base font-medium transition-all ${
                activeTab === 'fleet-info' 
                  ? 'bg-white text-primary' 
                  : 'hover:bg-white/20 hover:text-white'
              }`}
            >
              Informacje flotowe
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              className={`rounded-md px-6 py-3 text-base font-medium transition-all ${
                activeTab === 'documents' 
                  ? 'bg-white text-primary' 
                  : 'hover:bg-white/20 hover:text-white'
              }`}
            >
              Dokumenty
            </button>
            <button
              onClick={() => setActiveTab('fuel')}
              className={`rounded-md px-6 py-3 text-base font-medium transition-all ${
                activeTab === 'fuel' 
                  ? 'bg-white text-primary' 
                  : 'hover:bg-white/20 hover:text-white'
              }`}
            >
              Paliwo
            </button>
          </div>
        </div>

        
        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'weekly-report' && <WeeklyResults driverData={driverData} />}
          {activeTab === 'cars' && <AddCarForm driverId={driverData.driver_id} />}
          {activeTab === 'fleet-info' && <FleetInfo driverData={driverData} />}
          {activeTab === 'documents' && <DriverDocuments driverData={driverData} />}
          {activeTab === 'fuel' && <FuelLogs driverData={driverData} />}
        </div>
      </div>
    </div>
  );
};

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
  // Pokazuje tylko przeszłe tygodnie i obecny tydzień
  const getWeekDates = (year: number) => {
    const weeks = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    
    let currentDate = new Date(year, 0, 1);
    
    // Znajdź pierwszy poniedziałek roku lub rozpocznij od 1 stycznia jeśli to poniedziałek
    while (currentDate.getDay() !== 1) {
      currentDate.setDate(currentDate.getDate() + 1);
      // Jeśli doszliśmy do lutego, znaczy że 1 stycznia nie było poniedziałkiem
      // W takim przypadku pierwszym tygodniem będzie tydzień z 1 stycznia
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
      // Nie pokazuj przyszłych tygodni
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
    const { data: assignment } = await supabase
      .from("driver_vehicle_assignments")
      .select(`
        vehicles(weekly_rental_fee)
      `)
      .eq("driver_id", driverData.driver_id)
      .eq("status", "active")
      .single();
    
    const rentalFee = assignment?.vehicles?.weekly_rental_fee || 0;
    
    if (settlements && settlements.length > 0) {
      setWeekData(prev => ({
        ...prev,
        rental: rentalFee
      }));
      console.log("Znaleziono dane rozliczeń:", settlements);
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
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Wynik tygodniowy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Elegancki wybór roku, tygodnia i planu rozliczenia */}
          <div className="flex gap-4 items-center mb-6 flex-wrap">
            <Card className="p-4 rounded-lg shadow-md">
              <div className="flex flex-col">
                <label className="text-sm font-medium text-muted-foreground mb-2">Rok</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-24 justify-center rounded-lg">
                      {selectedYear}
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-32 p-2 rounded-lg">
                    {years.map(year => (
                      <Button
                        key={year}
                        variant="ghost"
                        className="w-full justify-start rounded-md"
                        onClick={() => setSelectedYear(year)}
                      >
                        {year}
                      </Button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
            </Card>
            
            <Card className="p-4 rounded-lg shadow-md">
              <div className="flex flex-col">
                <label className="text-sm font-medium text-muted-foreground mb-2">Okres</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-64 justify-between rounded-lg">
                      <span className="truncate">
                        {weekDates.find(w => w.week === selectedWeek) 
                          ? `Tydzień ${selectedWeek}: ${weekDates.find(w => w.week === selectedWeek)?.startDate} - ${weekDates.find(w => w.week === selectedWeek)?.endDate}`
                          : "Wybierz tydzień"}
                      </span>
                      <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0" />
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
                          <span className="font-medium">Tydzień {week}</span>
                          <span className="text-sm text-muted-foreground">{startDate} - {endDate}</span>
                        </div>
                      </Button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
            </Card>

            <SettlementPlanSelector driverData={driverData} currentPlan="" onPlanChange={(plan) => setWeekData(prev => ({ ...prev, plan }))} />
          </div>
        </CardContent>
      </Card>

      {/* Diagram wyników */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Zarobki według platform</CardTitle>
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

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Podsumowanie tygodnia</CardTitle>
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
    <Card className="rounded-lg">
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

// Komponent auta - funkcjonalność dodawania/edycji aut
function DriverCar({ driverData }: { driverData: any }) {
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [insp, setInsp] = useState("");
  const [policy, setPolicy] = useState("");
  const [rentalFee, setRentalFee] = useState<number>(0);

  useEffect(() => {
    // Pobierz dane o wynajętym aucie
    const fetchCarData = async () => {
      const { data: assignment } = await supabase
        .from("driver_vehicle_assignments")
        .select(`
          vehicles(
            plate, brand, model, year, color, vin,
            weekly_rental_fee,
            vehicle_policies(valid_to, type),
            vehicle_inspections(valid_to)
          )
        `)
        .eq("driver_id", driverData.driver_id)
        .eq("status", "active")
        .single();
      
      if (assignment?.vehicles) {
        const vehicle = assignment.vehicles;
        setPlate(vehicle.plate || "");
        setBrand(vehicle.brand || "");
        setModel(vehicle.model || "");
        setYear(vehicle.year?.toString() || "");
        setColor(vehicle.color || "");
        setVin(vehicle.vin || "");
        setRentalFee(vehicle.weekly_rental_fee || 0);
      }
    };

    if (driverData.driver_id) {
      fetchCarData();
    }
  }, [driverData.driver_id]);

  const save = async () => {
    if (!plate || !brand || !model) {
      toast.error("Uzupełnij wymagane pola");
      return;
    }

    try {
      const { data: vehicle, error: vehicleError } = await supabase
        .from("vehicles")
        .insert([{
          plate: plate.toUpperCase(),
          vin: vin ? vin.toUpperCase() : null,
          brand,
          model,
          year: year ? parseInt(year) : null,
          color: color || null,
          status: "aktywne",
          owner_name: "Prywatne",
          city_id: driverData.city_id
        }])
        .select("id")
        .single();

      if (vehicleError) throw vehicleError;

      if (insp) {
        await supabase.from("vehicle_inspections").insert([{
          vehicle_id: vehicle.id,
          date: new Date().toISOString().slice(0, 10),
          valid_to: insp,
          result: "pozytywny"
        }]);
      }

      if (policy) {
        await supabase.from("vehicle_policies").insert([{
          vehicle_id: vehicle.id,
          type: "OC",
          policy_no: "TBA",
          provider: "TBA",
          valid_from: new Date().toISOString().slice(0, 10),
          valid_to: policy
        }]);
      }

      toast.success("Auto dodane");
      // Reset form
      setPlate("");
      setVin("");
      setBrand("");
      setModel("");
      setYear("");
      setColor("");
      setInsp("");
      setPolicy("");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Wynajęte auto</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {plate ? (
          // Wyświetl dane wynajętego auta
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Numer rejestracyjny</Label>
                <div className="font-semibold text-lg">{plate}</div>
              </div>
              <div>
                <Label>Marka i model</Label>
                <div className="font-medium">{brand} {model}</div>
              </div>
              {year && (
                <div>
                  <Label>Rok produkcji</Label>
                  <div>{year}</div>
                </div>
              )}
              {color && (
                <div>
                  <Label>Kolor</Label>
                  <div>{color}</div>
                </div>
              )}
              {vin && (
                <div>
                  <Label>VIN</Label>
                  <div className="font-mono text-sm">{vin}</div>
                </div>
              )}
              <div>
                <Label>Opłata za wynajem</Label>
                <div className="font-semibold text-primary">{rentalFee} zł/tydzień</div>
              </div>
            </div>
          </div>
        ) : (
          // Formularz dodawania nowego auta
          <div className="space-y-4">
            <p className="text-muted-foreground">Nie masz przypisanego pojazdu. Dodaj swoje auto:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="plate">Nr rejestracyjny *</Label>
                <Input id="plate" value={plate} onChange={(e) => setPlate(e.target.value)} className="rounded-lg" />
              </div>
              <div>
                <Label htmlFor="vin">VIN</Label>
                <Input id="vin" value={vin} onChange={(e) => setVin(e.target.value)} className="rounded-lg" />
              </div>
              <div>
                <Label htmlFor="brand">Marka *</Label>
                <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} className="rounded-lg" />
              </div>
              <div>
                <Label htmlFor="model">Model *</Label>
                <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} className="rounded-lg" />
              </div>
              <div>
                <Label htmlFor="year">Rok</Label>
                <Input id="year" type="number" value={year} onChange={(e) => setYear(e.target.value)} className="rounded-lg" />
              </div>
              <div>
                <Label htmlFor="color">Kolor</Label>
                <Input id="color" value={color} onChange={(e) => setColor(e.target.value)} className="rounded-lg" />
              </div>
              <div>
                <Label htmlFor="insp">Przegląd ważny do</Label>
                <Input id="insp" type="date" value={insp} onChange={(e) => setInsp(e.target.value)} className="rounded-lg" />
              </div>
              <div>
                <Label htmlFor="policy">OC ważne do</Label>
                <Input id="policy" type="date" value={policy} onChange={(e) => setPolicy(e.target.value)} className="rounded-lg" />
              </div>
            </div>
            <Button onClick={save} className="w-full rounded-lg">Dodaj auto</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Komponent informacji flotowych - pokazuje wynajęte auto i informacje o flocie
function FleetInfo({ driverData }: { driverData: any }) {
  const [vehicleData, setVehicleData] = useState<any>(null);
  const [fleetData, setFleetData] = useState<any>(null);
  const [assignmentData, setAssignmentData] = useState<any>(null);

  useEffect(() => {
    const fetchFleetInfo = async () => {
      // Pobierz dane o wynajętym aucie i flocie wraz z datą rozpoczęcia
      const { data: assignment } = await supabase
        .from("driver_vehicle_assignments")
        .select(`
          *,
          vehicles(
            plate, brand, model, year, color, vin,
            weekly_rental_fee,
            fleets(name)
          )
        `)
        .eq("driver_id", driverData.driver_id)
        .eq("status", "active")
        .single();
      
      if (assignment?.vehicles) {
        setVehicleData(assignment.vehicles);
        setFleetData(assignment.vehicles.fleets);
        setAssignmentData(assignment);
      }
    };

    fetchFleetInfo();
  }, [driverData.driver_id]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  return (
    <div className="max-w-4xl space-y-4">
      {/* Wynajęte auto */}
      <Card className="rounded-lg">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Wynajęte auto</CardTitle>
        </CardHeader>
        <CardContent>
          {vehicleData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Marka i model</Label>
                  <p className="text-base font-semibold">{vehicleData.brand} {vehicleData.model}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Nr rejestracji</Label>
                  <p className="text-base font-semibold">{vehicleData.plate}</p>
                </div>
                {vehicleData.year && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Rok produkcji</Label>
                    <p className="text-base">{vehicleData.year}</p>
                  </div>
                )}
                {vehicleData.color && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Kolor</Label>
                    <p className="text-base">{vehicleData.color}</p>
                  </div>
                )}
                {assignmentData?.assigned_date && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Data wynajmu</Label>
                    <p className="text-base">{formatDate(assignmentData.assigned_date)}</p>
                  </div>
                )}
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Wynajem tygodniowy</Label>
                  <p className="text-base font-semibold text-green-600">{vehicleData.weekly_rental_fee || 0} zł</p>
                </div>
              </div>
              {vehicleData.vin && (
                <div className="pt-2 border-t">
                  <Label className="text-sm font-medium text-muted-foreground">VIN</Label>
                  <p className="text-sm font-mono mt-1">{vehicleData.vin}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-base text-muted-foreground">Nie masz przypisanego pojazdu.</p>
          )}
        </CardContent>
      </Card>

      {/* Informacje o flocie */}
      <Card className="rounded-lg">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Informacje o flocie</CardTitle>
        </CardHeader>
        <CardContent>
          {fleetData ? (
            <div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Nazwa floty</Label>
                <p className="text-base font-semibold">{fleetData.name}</p>
              </div>
            </div>
          ) : (
            <p className="text-base text-muted-foreground">
              Nie jesteś przypisany do żadnej floty.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Komponent logów paliwa
function FuelLogs({ driverData }: { driverData: any }) {
  return (
    <Card className="rounded-lg">
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

// Kompaktowy chat widget w prawym dolnym rogu
function DriverChatButton({ driverData }: { driverData: any }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <>
      {/* Floating chat button */}
      <Button
        onClick={() => setIsOpen(true)}
        className="rounded-full w-14 h-14 shadow-lg bg-primary hover:bg-primary/90"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>
      
      {/* Compact chat sidebar */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setIsOpen(false)} />
          
          {/* Chat sidebar */}
          <div className="fixed right-0 top-0 h-full w-96 bg-background border-l shadow-xl z-50 flex flex-col rounded-l-lg">
            <div className="p-4 border-b flex justify-between items-center bg-primary text-primary-foreground rounded-tl-lg">
              <h3 className="font-medium">Czat z administratorem</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsOpen(false)}
                className="text-primary-foreground hover:bg-primary-foreground/10 rounded-lg"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex-1 p-4 overflow-hidden">
              <DriverChatContent driverData={driverData} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

// Komponent zawartości czatu
function DriverChatContent({ driverData }: { driverData: any }) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<any[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("driver_id", driverData.driver_id)
      .order("created_at", { ascending: true });
    setMessages(data || []);
  };

  useEffect(() => {
    load();
  }, [driverData.driver_id]);

  const send = async () => {
    if (!text.trim()) return;

    const { error } = await supabase.from("messages").insert([{
      driver_id: driverData.driver_id,
      content: text.trim(),
      from_role: "driver"
    }]);

    if (error) {
      toast.error(error.message);
      return;
    }

    setText("");
    load();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Rozpocznij rozmowę z administratorem</p>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.from_role === 'driver' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                msg.from_role === 'driver' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted'
              }`}>
                <div>{msg.content}</div>
                <div className={`text-xs mt-1 opacity-70 ${
                  msg.from_role === 'driver' ? 'text-primary-foreground' : 'text-muted-foreground'
                }`}>
                  {new Date(msg.created_at).toLocaleTimeString('pl-PL', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <div className="border-t pt-3">
        <div className="flex gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Napisz wiadomość..."
            className="flex-1 min-h-[40px] max-h-[100px] resize-none rounded-lg"
            rows={1}
          />
          <Button 
            onClick={send} 
            disabled={!text.trim()}
            size="sm"
            className="rounded-lg"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default DriverDashboard;
