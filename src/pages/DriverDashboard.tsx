import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function DriverDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("week");
  const [user, setUser] = useState<any>(null);
  const [driverData, setDriverData] = useState<any>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser(session.user);
      
      // Pobierz dane kierowcy
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
    await supabase.auth.signOut();
    navigate("/");
  };

  if (!user || !driverData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">Ładowanie...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5">
      {/* Header */}
      <header className="bg-background border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Panel Kierowcy</h1>
            <p className="text-muted-foreground">
              Witaj, {driverData.drivers.first_name} {driverData.drivers.last_name}
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            Wyloguj
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
            <TabsTrigger value="week">Wyniki</TabsTrigger>
            <TabsTrigger value="docs">Dokumenty</TabsTrigger>
            <TabsTrigger value="car">Auto</TabsTrigger>
            <TabsTrigger value="fuel">Paliwo</TabsTrigger>
            <TabsTrigger value="chat">Czat</TabsTrigger>
            <TabsTrigger value="settings">Ustawienia</TabsTrigger>
          </TabsList>

          <TabsContent value="week">
            <WeeklyResults driverData={driverData} />
          </TabsContent>

          <TabsContent value="docs">
            <DriverDocuments driverData={driverData} />
          </TabsContent>

          <TabsContent value="car">
            <DriverCar driverData={driverData} />
          </TabsContent>

          <TabsContent value="fuel">
            <FuelLogs driverData={driverData} />
          </TabsContent>

          <TabsContent value="chat">
            <DriverChat driverData={driverData} />
          </TabsContent>

          <TabsContent value="settings">
            <DriverSettings driverData={driverData} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Komponent wyników tygodnia
function WeeklyResults({ driverData }: { driverData: any }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [split, setSplit] = useState([
    { name: "Uber", value: 0, fill: "#000000" },
    { name: "Bolt", value: 0, fill: "#34D399" },
    { name: "FREE NOW", value: 0, fill: "#F59E0B" }
  ]);

  const load = async () => {
    // Tutaj można dodać logikę ładowania danych z settlements
    toast.success("Funkcja będzie dostępna po połączeniu z danymi rozliczeń");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Wyniki tygodnia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button onClick={load}>Pokaż</Button>
        </div>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={split}
                dataKey="value"
                nameKey="name"
                outerRadius={100}
                label={({ name, value }) => `${name}: ${value}`}
              />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
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

    if (!error) {
      setText("");
      load();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Czat z administratorem</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 h-64 overflow-auto border rounded p-3 bg-muted/30">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`p-3 rounded ${
                msg.from_role === 'driver' 
                  ? 'bg-primary/10 ml-auto max-w-[80%]' 
                  : 'bg-muted mr-auto max-w-[80%]'
              }`}
            >
              <div>{msg.content}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(msg.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Napisz wiadomość..."
            onKeyPress={(e) => e.key === 'Enter' && send()}
          />
          <Button onClick={send}>Wyślij</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Komponent ustawień
function DriverSettings({ driverData }: { driverData: any }) {
  const [plan, setPlan] = useState(driverData.plan_type || '39+8');

  const savePlan = async () => {
    const { error } = await supabase
      .from("driver_app_users")
      .update({ plan_type: plan })
      .eq("user_id", driverData.user_id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Model rozliczeń został zaktualizowany");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ustawienia rozliczeń</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <select
            className="border rounded px-3 py-2 flex-1 bg-background"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          >
            <option value="39+8">39 zł + 8% podatku</option>
            <option value="159+0">159 zł + 0% podatku</option>
          </select>
          <Button onClick={savePlan}>Zapisz</Button>
        </div>
        
        <div className="text-sm text-muted-foreground">
          <p>Aktualny plan: <strong>{plan === '39+8' ? '39 zł + 8% podatku' : '159 zł + 0% podatku'}</strong></p>
          <p className="mt-2">
            {plan === '39+8' 
              ? 'Płacisz 39 zł tygodniowo plus 8% podatku od przychodów'
              : 'Płacisz 159 zł tygodniowo, bez dodatkowego podatku'
            }
          </p>
        </div>
      </CardContent>
    </Card>
  );
}