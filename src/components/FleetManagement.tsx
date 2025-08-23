import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, ExternalLink, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AddVehicleModal } from "./AddVehicleModal";

type Vehicle = {
  id: string;
  plate: string;
  vin: string | null;
  brand: string;
  model: string;
  year: number | null;
  color: string | null;
  odometer: number | null;
  status: "aktywne" | "serwis" | "sprzedane";
  owner_name: string | null;
};

export function FleetManagement({ cityId, cityName }: { cityId?: string | null; cityName: string }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"Wszystkie" | Vehicle["status"]>("Wszystkie");
  const [showAdd, setShowAdd] = useState(false);

  const fetchVehicles = async () => {
    let q = supabase.from("vehicles").select("*").order("created_at", { ascending: false });
    if (cityId) q = q.eq("city_id", cityId);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    if (data) setVehicles(data as any);
  };
  useEffect(() => { fetchVehicles(); /* eslint-disable-next-line */ }, [cityId]);

  const filtered = vehicles.filter(v => {
    const text = `${v.plate} ${v.brand} ${v.model} ${v.vin ?? ""}`.toLowerCase();
    const okText = text.includes(query.toLowerCase());
    const okStatus = status === "Wszystkie" ? true : v.status === status;
    return okText && okStatus;
  });

  const quickUpdate = async (id: string, patch: Partial<Vehicle>) => {
    if (patch.plate) patch.plate = patch.plate.toUpperCase();
    if (patch.vin) patch.vin = patch.vin.toUpperCase();
    const { error } = await supabase.from("vehicles").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Zapisano");
    fetchVehicles();
  };

  const openDetailsInNewTab = (id: string) => {
    window.open(`/admin/fleet/${id}`, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Flota – {cityName}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Znaleziono {filtered.length} z {vehicles.length} pojazdów
              </p>
            </div>
            <Button onClick={() => setShowAdd(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Dodaj pojazd
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Szukaj po rejestracji, VIN, marce..." className="max-w-sm" />
            <select
              className="border rounded-md px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option>Wszystkie</option>
              <option value="aktywne">Aktywne</option>
              <option value="serwis">Serwis</option>
              <option value="sprzedane">Sprzedane</option>
            </select>
          </div>
        </CardHeader>

        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-muted-foreground py-8">Brak pojazdów. Dodaj pierwszy pojazd.</div>
          ) : (
            <div className="space-y-3">
              {filtered.map(v => (
                <div key={v.id} className="border rounded-xl p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex-1 min-w-[280px]">
                      {/* Klikalna nazwa – otwiera szczegóły w nowej karcie */}
                      <button onClick={()=>openDetailsInNewTab(v.id)} className="text-left">
                        <div className="text-lg font-semibold flex items-center gap-2">
                          {v.brand} {v.model} <span className="text-muted-foreground">• {v.plate}</span>
                          <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </button>
                      <div className="text-sm text-muted-foreground">
                        {v.year ? `${v.year} • ` : ""}{v.color || "—"}{v.owner_name ? ` • Flota: ${v.owner_name}` : ""}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="rounded-full">{v.status}</Badge>
                      {/* szybka edycja – otwiera proste prompty */}
                      <Button variant="ghost" size="sm" onClick={async()=>{
                        const nv = prompt("Nowy nr rejestracyjny:", v.plate);
                        if (nv !== null) await quickUpdate(v.id, { plate: nv });
                      }}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={async()=>{
                        const nb = prompt("Nowa marka:", v.brand);
                        if (nb !== null) await quickUpdate(v.id, { brand: nb });
                      }}><span className="text-xs">M</span></Button>
                      <Button variant="ghost" size="sm" onClick={async()=>{
                        const nm = prompt("Nowy model:", v.model);
                        if (nm !== null) await quickUpdate(v.id, { model: nm });
                      }}><span className="text-xs">Mo</span></Button>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    VIN: {v.vin ?? "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddVehicleModal
        isOpen={showAdd}
        onClose={()=>setShowAdd(false)}
        onSuccess={()=>{ setShowAdd(false); fetchVehicles(); }}
        cityId={cityId ?? null}
      />
    </>
  );
}