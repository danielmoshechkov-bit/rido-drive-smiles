import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function VehicleServiceTab({ vehicleId }: { vehicleId: string }) {
  const [types, setTypes] = useState<string[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [form, setForm] = useState({ 
    type: "", 
    date: "", 
    mileage: "", 
    cost: "", 
    notes: "", 
    file: null as File | null, 
    workshop: "" 
  });

  const load = async () => {
    const t = await supabase.from("service_types").select("name").order("name");
    setTypes((t.data || []).map(x => x.name));
    const e = await supabase.from("vehicle_services").select("*").eq("vehicle_id", vehicleId).order("date", { ascending: false });
    setEntries(e.data || []);
  };
  
  useEffect(() => { load(); }, [vehicleId]);

  const addType = async () => {
    const name = prompt("Nazwa nowego typu serwisu:");
    if (!name) return;
    const { error } = await supabase.from("service_types").insert([{ name }]);
    if (error) return toast.error(error.message);
    toast.success("Dodano typ");
    load();
  };

  const addEntry = async () => {
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
    setForm({ type: "", date: "", mileage: "", cost: "", notes: "", file: null, workshop: "" });
    load();
  };

  return (
    <Card>
      <CardHeader><CardTitle>Serwis i naprawy</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select className="border rounded-md px-3 py-2" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option value="">Wybierz typ</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <Button variant="outline" onClick={addType}>Dodaj typ serwisu</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Input type="number" placeholder="Przebieg (km)" value={form.mileage} onChange={e => setForm({ ...form, mileage: e.target.value })} />
          <Input type="number" placeholder="Koszt (zł)" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} />
          <Input placeholder="Opis / warsztat" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="md:col-span-2" />
          <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setForm({ ...form, file: e.target.files?.[0] ?? null })} />
          <Button onClick={addEntry}>Zapisz wpis</Button>
        </div>

        {entries.length === 0 ? <p className="text-muted-foreground">Brak wpisów serwisowych.</p> :
          <div className="space-y-2">
            {entries.map(e => (
              <div key={e.id} className="border rounded-lg p-3">
                <div className="font-medium">{e.type} • {e.date}</div>
                <div className="text-sm text-muted-foreground">
                  {e.odometer ? `Przebieg: ${e.odometer} km • ` : ""}{e.cost ? `Koszt: ${e.cost} zł • ` : ""}{e.description || ""}
                  {e.provider ? ` • Warsztat: ${e.provider}` : ""}
                </div>
              </div>
            ))}
          </div>
        }
      </CardContent>
    </Card>
  );
}