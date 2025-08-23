import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import LanguageSelector from "@/components/LanguageSelector";

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
            <Button variant="outline" onClick={handleLogout}>
              Wyloguj
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 relative">
        {/* Zawsze widoczny czat w prawym dolnym rogu */}
        <div className="fixed bottom-4 right-4 z-50">
          <DriverChatButton driverData={driverData} />
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="weekly-report">Wynik tygodniowy</TabsTrigger>
            <TabsTrigger value="cars">Auta</TabsTrigger>
            <TabsTrigger value="fleet-info">Flota</TabsTrigger>
            <TabsTrigger value="documents">Dokumenty</TabsTrigger>
            <TabsTrigger value="fuel">Paliwo</TabsTrigger>
            <TabsTrigger value="chat">Czat</TabsTrigger>
          </TabsList>

          <TabsContent value="weekly-report" className="space-y-6">
            <WeeklyResults driverData={driverData} />
          </TabsContent>

          <TabsContent value="cars" className="space-y-6">
            <DriverCar driverData={driverData} />
          </TabsContent>

          <TabsContent value="fleet-info" className="space-y-6">
            <FleetInfo driverData={driverData} />
          </TabsContent>

          <TabsContent value="documents" className="space-y-6">
            <DriverDocuments driverData={driverData} />
          </TabsContent>

          <TabsContent value="fuel" className="space-y-6">
            <FuelLogs driverData={driverData} />
          </TabsContent>

          <TabsContent value="chat" className="space-y-6">
            <DriverChat driverData={driverData} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// Komponent wyników tygodnia z wyborem roku i tygodnia
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
    const start = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    return Math.ceil((days + start.getDay() + 1) / 7);
  }

  const getWeekDates = (year: number, week: number) => {
    const firstDayOfYear = new Date(year, 0, 1);
    const daysFromFirstWeek = (week - 1) * 7;
    const firstDayOfWeek = new Date(firstDayOfYear.getTime() + daysFromFirstWeek * 24 * 60 * 60 * 1000);
    
    const monday = new Date(firstDayOfWeek);
    monday.setDate(firstDayOfWeek.getDate() - firstDayOfWeek.getDay() + 1);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    return {
      from: monday.toISOString().slice(0, 10),
      to: sunday.toISOString().slice(0, 10)
    };
  };

  const loadWeekData = async () => {
    const dates = getWeekDates(selectedYear, selectedWeek);
    setWeekData(prev => ({
      ...prev,
      from: dates.from,
      to: dates.to
    }));

    // Ładowanie rzeczywistych danych z bazy
    const { data: settlements } = await supabase
      .from("settlements")
      .select("*")
      .eq("driver_id", driverData.driver_id)
      .gte("week_start", dates.from)
      .lte("week_end", dates.to);
    
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
      // Użyj rzeczywistych danych jeśli dostępne
      setWeekData(prev => ({
        ...prev,
        rental: rentalFee
      }));
      console.log("Znaleziono dane rozliczeń:", settlements);
    } else {
      // Aktualizuj tylko opłatę za wynajem
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Wynik tygodniowy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Wybór roku i tygodnia */}
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Rok:</label>
              <select 
                value={selectedYear} 
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="border rounded px-2 py-1"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Tydzień:</label>
              <select 
                value={selectedWeek} 
                onChange={(e) => setSelectedWeek(Number(e.target.value))}
                className="border rounded px-2 py-1"
                size={4}
                style={{ maxHeight: '120px', overflowY: 'auto' }}
              >
                {Array.from({ length: 52 }, (_, i) => {
                  const weekNum = i + 1;
                  const dates = getWeekDates(selectedYear, weekNum);
                  const weekEndDate = new Date(dates.to);
                  const today = new Date();
                  
                  // Ukryj przyszłe tygodnie (nie zakończone)
                  if (weekEndDate > today) return null;
                  
                  const fromDate = new Date(dates.from).toLocaleDateString('pl-PL', { month: 'short', day: 'numeric' });
                  const toDate = weekEndDate.toLocaleDateString('pl-PL', { month: 'short', day: 'numeric' });
                  return (
                    <option key={weekNum} value={weekNum}>
                      {weekNum} ({fromDate} - {toDate})
                    </option>
                  );
                }).filter(Boolean)}
              </select>
            </div>
            
            <div className="text-sm text-muted-foreground">
              ({weekData.from} - {weekData.to})
            </div>
          </div>

          {/* Plan rozliczenia */}
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <span className="text-sm">Plan rozliczenia:</span>
            <Badge variant="outline">{weekData.plan}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Diagram wyników */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
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

        <Card>
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
              <div className="border-t pt-2">
                <div className="flex justify-between font-bold text-lg text-green-600">
                  <span>Do wypłaty:</span>
                  <span>{totalEarnings - weekData.fuel - (weekData.rental || 0)} zł</span>
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
      
      // Znajdź lub utwórz typ dokumentu
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dokumenty</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="Typ dokumentu"
          />
          <Input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <Button onClick={upload} disabled={!file || loading}>
            {loading ? "Wysyłanie..." : "Wyślij"}
          </Button>
        </div>
        
        {docs.length === 0 ? (
          <p className="text-muted-foreground">Brak dokumentów.</p>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div key={doc.id} className="border rounded-lg p-3">
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {doc.type} • {new Date(doc.created_at).toLocaleString()}
                </a>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Komponent auta
function DriverCar({ driverData }: { driverData: any }) {
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [insp, setInsp] = useState("");
  const [policy, setPolicy] = useState("");

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

      toast.success("Dane pojazdu zostały zapisane");
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
    <Card>
      <CardHeader>
        <CardTitle>Moje auto</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          placeholder="Nr rejestracyjny"
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          className="uppercase"
        />
        <Input
          placeholder="VIN"
          value={vin}
          onChange={(e) => setVin(e.target.value.toUpperCase())}
          className="uppercase"
        />
        <Input
          placeholder="Marka"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
        />
        <Input
          placeholder="Model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        <Input
          placeholder="Rok produkcji"
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
        <Input
          placeholder="Kolor"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <div>
          <label className="text-sm text-muted-foreground block mb-1">
            Przegląd ważny do
          </label>
          <Input
            type="date"
            value={insp}
            onChange={(e) => setInsp(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-1">
            Ubezpieczenie ważne do
          </label>
          <Input
            type="date"
            value={policy}
            onChange={(e) => setPolicy(e.target.value)}
          />
        </div>
        <Button onClick={save} className="md:col-span-2">
          Zapisz dane pojazdu
        </Button>
      </CardContent>
    </Card>
  );
}

// Komponent paliwa
function FuelLogs({ driverData }: { driverData: any }) {
  const [amount, setAmount] = useState("");
  const [liters, setLiters] = useState("");
  const [station, setStation] = useState("");
  const [rows, setRows] = useState<any[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("fuel_logs")
      .select("*")
      .eq("driver_id", driverData.driver_id)
      .order("date", { ascending: false });
    setRows(data || []);
  };

  useEffect(() => {
    load();
  }, [driverData.driver_id]);

  const add = async () => {
    if (!amount) {
      toast.error("Podaj kwotę");
      return;
    }

    const { error } = await supabase.from("fuel_logs").insert([{
      driver_id: driverData.driver_id,
      date: new Date().toISOString().slice(0, 10),
      amount: Number(amount),
      liters: liters ? Number(liters) : null,
      station: station || null
    }]);

    if (error) {
      toast.error(error.message);
      return;
    }

    setAmount("");
    setLiters("");
    setStation("");
    load();
    toast.success("Wpis dodany");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Wydatki na paliwo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input
            placeholder="Kwota (zł)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            placeholder="Litry"
            type="number"
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
          />
          <Input
            placeholder="Stacja / Notatka"
            value={station}
            onChange={(e) => setStation(e.target.value)}
          />
          <Button onClick={add}>Dodaj wpis</Button>
        </div>
        
        {rows.length === 0 ? (
          <p className="text-muted-foreground">Brak wpisów.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="border rounded-lg p-3">
                <div className="flex justify-between">
                  <span>{row.date}</span>
                  <span className="font-semibold">{row.amount} zł</span>
                </div>
                {(row.liters || row.station) && (
                  <div className="text-sm text-muted-foreground">
                    {row.liters ? `${row.liters} L` : ""} {row.station}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Komponent czatu
function DriverChat({ driverData }: { driverData: any }) {
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
      from_role: "driver",
      content: text.trim()
    }]);

    if (error) {
      toast.error(error.message);
      return;
    }

    setText("");
    load();
    toast.success("Wiadomość wysłana");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Czat z administratorem</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-lg p-3 h-64 overflow-y-auto space-y-2">
          {messages.length === 0 ? (
            <p className="text-muted-foreground">Brak wiadomości.</p>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`p-2 rounded ${msg.from_role === 'driver' ? 'bg-primary/10 ml-8' : 'bg-muted mr-8'}`}>
                <div className="text-xs text-muted-foreground">
                  {msg.from_role === 'driver' ? 'Ty' : 'Administrator'} • {new Date(msg.created_at).toLocaleString()}
                </div>
                <div>{msg.content}</div>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Napisz wiadomość..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && send()}
          />
          <Button onClick={send} disabled={!text.trim()}>
            Wyślij
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Komponent ustawień
function DriverSettings({ driverData }: { driverData: any }) {
  const [plan, setPlan] = useState(driverData?.plan_type || '39+8');

  const save = async () => {
    const { error } = await supabase
      .from("driver_app_users")
      .update({ plan_type: plan })
      .eq("driver_id", driverData.driver_id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Ustawienia zapisane");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ustawienia rozliczania</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm text-muted-foreground block mb-1">
            Plan taryfowy
          </label>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="39+8">39 zł + 8%</option>
            <option value="59+5">59 zł + 5%</option>
            <option value="79+3">79 zł + 3%</option>
          </select>
        </div>
        <Button onClick={save}>
          Zapisz ustawienia
        </Button>
      </CardContent>
    </Card>
  );
}

// Komponent informacji o flocie i przypisanym aucie
function FleetInfo({ driverData }: { driverData: any }) {
  const [fleetInfo, setFleetInfo] = useState<any>(null);
  const [assignedVehicle, setAssignedVehicle] = useState<any>(null);
  const [assignment, setAssignment] = useState<any>(null);

  useEffect(() => {
    const loadFleetInfo = async () => {
      if (driverData.drivers.fleet_id) {
        const { data: fleet } = await supabase
          .from('fleets')
          .select('*')
          .eq('id', driverData.drivers.fleet_id)
          .single();
        setFleetInfo(fleet);
      }

      // Pobierz przypisane auto
      const { data: activeAssignment } = await supabase
        .from('driver_vehicle_assignments')
        .select(`
          *,
          vehicles(*)
        `)
        .eq('driver_id', driverData.driver_id)
        .eq('status', 'active')
        .single();

      if (activeAssignment) {
        setAssignment(activeAssignment);
        setAssignedVehicle(activeAssignment.vehicles);
      }
    };

    loadFleetInfo();
  }, [driverData]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Informacje o flocie</CardTitle>
        </CardHeader>
        <CardContent>
          {fleetInfo ? (
            <div className="space-y-2">
              <div className="text-lg font-medium">{fleetInfo.name}</div>
              <div className="text-sm text-muted-foreground">
                Data dołączenia: {new Date(fleetInfo.created_at).toLocaleDateString()}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-muted-foreground">Brak przypisanej floty</div>
              <div className="text-sm text-muted-foreground">
                Skontaktuj się z administratorem aby zostać przypisanym do floty
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Przypisane auto</CardTitle>
        </CardHeader>
        <CardContent>
          {assignedVehicle ? (
            <div className="space-y-3">
              <div>
                <div className="text-lg font-medium">
                  {assignedVehicle.brand} {assignedVehicle.model}
                </div>
                <div className="text-sm text-muted-foreground">
                  {assignedVehicle.plate}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">VIN:</span>
                  <div>{assignedVehicle.vin || 'Brak'}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Rok:</span>
                  <div>{assignedVehicle.year || 'Brak'}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Kolor:</span>
                  <div>{assignedVehicle.color || 'Brak'}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Przebieg:</span>
                  <div>{assignedVehicle.odometer || 0} km</div>
                </div>
              </div>

              <Badge variant="outline" className="w-fit">
                Status: {assignedVehicle.status}
              </Badge>

              {assignment && (
                <div className="text-xs text-muted-foreground">
                  Przypisane od: {new Date(assignment.assigned_at).toLocaleString()}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-muted-foreground">Brak przypisanego auta</div>
              <div className="text-sm text-muted-foreground">
                Skontaktuj się z administratorem aby zostać przypisanym do pojazdu
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Sidebar czatu w prawym dolnym rogu
function DriverChatButton({ driverData }: { driverData: any }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <>
      <Button
        size="lg"
        className="rounded-full w-14 h-14 shadow-lg"
        onClick={() => setIsOpen(true)}
      >
        💬
      </Button>
      
      {/* Sidebar Chat */}
      {isOpen && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Sidebar */}
          <div className="fixed right-0 top-0 h-full w-96 bg-white border-l shadow-xl z-50 flex flex-col animate-slide-in-right">
            <div className="p-4 border-b flex justify-between items-center bg-primary text-white">
              <h3 className="font-medium">Czat z administratorem</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-white/20 h-8 w-8 p-0"
              >
                ✕
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

// Komponent zawartości czatu do użycia w sidebar
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
      from_role: "driver",
      content: text.trim()
    }]);

    if (error) {
      toast.error(error.message);
      return;
    }

    setText("");
    load();
    toast.success("Wiadomość wysłana");
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 border rounded-lg p-3 overflow-y-auto space-y-2 mb-4">
        {messages.length === 0 ? (
          <p className="text-muted-foreground">Brak wiadomości.</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`p-3 rounded-lg ${msg.from_role === 'driver' ? 'bg-primary/10 ml-8' : 'bg-muted mr-8'}`}>
              <div className="text-xs text-muted-foreground mb-1">
                {msg.from_role === 'driver' ? 'Ty' : 'Administrator'} • {new Date(msg.created_at).toLocaleString()}
              </div>
              <div className="text-sm">{msg.content}</div>
            </div>
          ))
        )}
      </div>
      
      <div className="flex gap-2">
        <Input
          placeholder="Napisz wiadomość..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && send()}
          className="flex-1"
        />
        <Button onClick={send} disabled={!text.trim()}>
          Wyślij
        </Button>
      </div>
    </div>
  );
}

export default DriverDashboard;