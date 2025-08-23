import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Vehicle = {
  id: string; plate: string; vin: string | null; brand: string; model: string;
  year: number | null; color: string | null; odometer: number | null;
  status: "aktywne"|"serwis"|"sprzedane"; owner_name: string | null;
};

export default function FleetVehicleDetails() {
  const { id } = useParams();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [tab, setTab] = useState("info");

  useEffect(()=>{ (async ()=>{
    const { data, error } = await supabase.from("vehicles").select("*").eq("id", id).single();
    if (error) toast.error(error.message);
    setVehicle(data as any);
  })(); },[id]);

  const saveInfo = async (patch: Partial<Vehicle>) => {
    if (!id) return;
    if (patch.plate) patch.plate = patch.plate.toUpperCase();
    if (patch.vin) patch.vin = patch.vin.toUpperCase();
    const { error, data } = await supabase.from("vehicles").update(patch).eq("id", id).select("*").single();
    if (error) return toast.error(error.message);
    setVehicle(data as any);
    toast.success("Zapisano");
  };

  if (!vehicle) {
    return <Card><CardContent className="p-6">Ładowanie pojazdu…</CardContent></Card>;
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-3">
            {vehicle.brand} {vehicle.model} • {vehicle.plate}
            <Badge variant="outline" className="rounded-full">{vehicle.status}</Badge>
            {vehicle.owner_name && <Badge className="rounded-full">Flota: {vehicle.owner_name}</Badge>}
          </CardTitle>
        </CardHeader>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex flex-wrap gap-2">
          <TabsTrigger value="info">Informacje</TabsTrigger>
          <TabsTrigger value="docs">Dokumenty</TabsTrigger>
          <TabsTrigger value="drivers">Historia kierowców</TabsTrigger>
          <TabsTrigger value="service">Serwis</TabsTrigger>
        </TabsList>

        {/* INFORMACJE */}
        <TabsContent value="info">
          <Card>
            <CardHeader><CardTitle>Dane pojazdu</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label>Nr rejestracyjny</label><Input defaultValue={vehicle.plate} onBlur={e=>saveInfo({ plate: e.target.value })} className="uppercase" /></div>
              <div><label>VIN</label><Input defaultValue={vehicle.vin ?? ""} onBlur={e=>saveInfo({ vin: e.target.value })} className="uppercase" /></div>
              <div><label>Marka</label><Input defaultValue={vehicle.brand} onBlur={e=>saveInfo({ brand: e.target.value })} /></div>
              <div><label>Model</label><Input defaultValue={vehicle.model} onBlur={e=>saveInfo({ model: e.target.value })} /></div>
              <div><label>Rok</label><Input type="number" defaultValue={vehicle.year ?? ""} onBlur={e=>saveInfo({ year: e.target.value? Number(e.target.value): null })} /></div>
              <div><label>Kolor</label><Input defaultValue={vehicle.color ?? ""} onBlur={e=>saveInfo({ color: e.target.value || null })} /></div>
              <div><label>Przebieg</label><Input type="number" defaultValue={vehicle.odometer ?? ""} onBlur={e=>saveInfo({ odometer: e.target.value? Number(e.target.value): null })} /></div>
              <div><label>Własność / Flota</label><Input defaultValue={vehicle.owner_name ?? ""} onBlur={e=>saveInfo({ owner_name: e.target.value || null })} /></div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DOKUMENTY */}
        <TabsContent value="docs">
          <VehicleDocuments vehicleId={vehicle.id} />
        </TabsContent>

        {/* HISTORIA KIEROWCÓW */}
        <TabsContent value="drivers">
          <VehicleDriverHistory vehicleId={vehicle.id} />
        </TabsContent>

        {/* SERWIS */}
        <TabsContent value="service">
          <VehicleServiceTab vehicleId={vehicle.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---- Podkomponenty strony szczegółów ----

// Dokumenty pojazdu
function VehicleDocuments({ vehicleId }: { vehicleId: string }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [file, setFile] = useState<File|null>(null);
  const [type, setType] = useState("Inny dokument");

  const fetchDocs = async ()=> {
    const { data } = await supabase.from("documents").select("*").eq("vehicle_id", vehicleId).order("created_at",{ascending:false});
    setDocs(data || []);
  };
  useEffect(()=>{ fetchDocs(); },[vehicleId]);

  const upload = async ()=> {
    if (!file) return;
    const path = `${vehicleId}/${Date.now()}_${file.name}`;
    const up = await supabase.storage.from("documents").upload(path, file, { upsert: true });
    if (up.error) return toast.error(up.error.message);
    const pub = supabase.storage.from("documents").getPublicUrl(path);
    const fileUrl = pub.data?.publicUrl;
    const { error } = await supabase.from("documents").insert([{ type, vehicle_id: vehicleId, file_url: fileUrl }]);
    if (error) return toast.error(error.message);
    toast.success("Dodano dokument");
    setFile(null); fetchDocs();
  };

  return (
    <Card>
      <CardHeader><CardTitle>Dokumenty</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input value={type} onChange={e=>setType(e.target.value)} placeholder="Typ dokumentu" />
          <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={e=>setFile(e.target.files?.[0] ?? null)} />
          <Button onClick={upload}>Dodaj</Button>
        </div>
        {docs.length===0 ? <p className="text-muted-foreground">Brak dokumentów.</p> :
          <ul className="list-disc pl-5">
            {docs.map(d=>(
              <li key={d.id}><a className="text-primary underline" href={d.file_url} target="_blank" rel="noreferrer">{d.type} • {new Date(d.created_at).toLocaleString()}</a></li>
            ))}
          </ul>
        }
      </CardContent>
    </Card>
  );
}

// Historia kierowców (po Assignments)
function VehicleDriverHistory({ vehicleId }: { vehicleId: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>Historia kierowców</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground">
          Funkcjonalność historii kierowców wymaga tabeli przypisań pojazdów do kierowców. 
          Ta funkcja będzie dostępna po utworzeniu odpowiedniej struktury bazy danych.
        </p>
      </CardContent>
    </Card>
  );
}

// Serwis: lista, dodawanie wpisu i dodawanie nowego typu
function VehicleServiceTab({ vehicleId }: { vehicleId: string }) {
  const [types, setTypes] = useState<string[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [form, setForm] = useState({ type:"", date:"", mileage:"", cost:"", notes:"", file: null as File | null, workshop:"" });

  const load = async ()=>{
    const t = await supabase.from("service_types").select("name").order("name");
    setTypes((t.data || []).map(x=>x.name));
    const e = await supabase.from("vehicle_services").select("*").eq("vehicle_id", vehicleId).order("date",{ascending:false});
    setEntries(e.data || []);
  };
  useEffect(()=>{ load(); /* eslint-disable-next-line*/ },[vehicleId]);

  const addType = async ()=>{
    const name = prompt("Nazwa nowego typu serwisu:");
    if (!name) return;
    const { error } = await supabase.from("service_types").insert([{ name }]);
    if (error) return toast.error(error.message);
    toast.success("Dodano typ");
    load();
  };

  const addEntry = async ()=>{
    if (!form.type || !form.date) return toast.error("Uzupełnij typ i datę");
    let fileUrl: string | null = null;
    if (form.file) {
      const path = `${vehicleId}/service/${Date.now()}_${form.file.name}`;
      const up = await supabase.storage.from("documents").upload(path, form.file, { upsert: true });
      if (up.error) return toast.error(up.error.message);
      fileUrl = supabase.storage.from("documents").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.from("vehicle_services").insert([{
      vehicle_id: vehicleId,
      type: form.type,
      date: form.date,
      odometer: form.mileage ? Number(form.mileage) : null,
      cost: form.cost ? Number(form.cost) : null,
      description: form.notes || null,
      provider: form.workshop || null,
    }]);
    if (error) return toast.error(error.message);
    toast.success("Zapisano wpis serwisowy");
    setForm({ type:"", date:"", mileage:"", cost:"", notes:"", file:null, workshop:"" });
    load();
  };

  return (
    <Card>
      <CardHeader><CardTitle>Serwis i naprawy</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select className="border rounded-md px-3 py-2" value={form.type} onChange={e=>setForm({...form, type:e.target.value})}>
            <option value="">Wybierz typ</option>
            {types.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <Button variant="outline" onClick={addType}>Dodaj typ serwisu</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input type="date" value={form.date} onChange={e=>setForm({...form, date:e.target.value})} />
          <Input type="number" placeholder="Przebieg (km)" value={form.mileage} onChange={e=>setForm({...form, mileage:e.target.value})} />
          <Input type="number" placeholder="Koszt (zł)" value={form.cost} onChange={e=>setForm({...form, cost:e.target.value})} />
          <Input placeholder="Opis / warsztat" value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} className="md:col-span-2" />
          <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setForm({...form, file: e.target.files?.[0] ?? null})} />
          <Button onClick={addEntry}>Zapisz wpis</Button>
        </div>

        {entries.length===0 ? <p className="text-muted-foreground">Brak wpisów serwisowych.</p> :
          <div className="space-y-2">
            {entries.map(e=>(
              <div key={e.id} className="border rounded-lg p-3">
                <div className="font-medium">{e.type} • {e.date}</div>
                <div className="text-sm text-muted-foreground">
                  {e.odometer ? `Przebieg: ${e.odometer} km • ` : ""}{e.cost ? `Koszt: ${e.cost} zł • ` : ""}{e.description || ""}
                </div>
              </div>
            ))}
          </div>
        }
      </CardContent>
    </Card>
  );
}