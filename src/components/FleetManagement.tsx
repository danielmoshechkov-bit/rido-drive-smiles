import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AddVehicleModal } from "./AddVehicleModal";
import { AddVehicleDocumentModal } from "./AddVehicleDocumentModal";
import { VehicleHistoryModal } from "./VehicleHistoryModal";

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
  const [newVehicleId, setNewVehicleId] = useState<string | null>(null);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const fetchVehicles = async () => {
    let q = supabase.from("vehicles").select("*").order("created_at", { ascending: false });
    if (cityId) q = q.eq("city_id", cityId);
    const { data, error } = await q;
    if (!error && data) setVehicles(data as any);
  };

  useEffect(() => { fetchVehicles(); }, [cityId]);

  const filtered = vehicles.filter(v => {
    const text = `${v.plate} ${v.brand} ${v.model} ${v.vin ?? ""} ${v.owner_name ?? ""}`.toLowerCase();
    const okText = text.includes(query.toLowerCase());
    const okStatus = status === "Wszystkie" ? true : v.status === status;
    return okText && okStatus;
  });

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
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj po rejestracji, VIN, marce, właścicielu..."
              className="max-w-sm"
            />
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
            <div className="text-muted-foreground py-8">Brak pojazdów w tym mieście. Dodaj pierwszy pojazd.</div>
          ) : (
            <div className="space-y-3">
              {filtered.map(v => (
                <div key={v.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-lg font-semibold">
                        {v.brand} {v.model} <span className="text-muted-foreground">• {v.plate}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {v.year ? `${v.year} • ` : ""}{v.color || "—"}
                        {v.owner_name ? ` • Flota: ${v.owner_name}` : ""}
                        {v.odometer ? ` • ${v.odometer.toLocaleString()} km` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="rounded-full">{v.status}</Badge>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          setSelectedVehicleId(v.id);
                          setShowDocModal(true);
                        }}
                        className="gap-1"
                      >
                        <FileText className="h-4 w-4" />
                        Dokumenty
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setSelectedVehicleId(v.id);
                          setShowHistoryModal(true);
                        }}
                        className="gap-1"
                      >
                        <Wrench className="h-4 w-4" />
                        Historia
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal dodawania pojazdu */}
      <AddVehicleModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={(vid) => {
          setNewVehicleId(vid);
          setShowDocModal(true);
          fetchVehicles();
        }}
        cityId={cityId ?? null}
      />

      {/* Modal dodania dokumentu do świeżo dodanego auta */}
      {(newVehicleId || selectedVehicleId) && (
        <AddVehicleDocumentModal
          isOpen={showDocModal}
          onClose={() => { 
            setShowDocModal(false); 
            setNewVehicleId(null);
            setSelectedVehicleId(null);
          }}
          vehicleId={newVehicleId || selectedVehicleId || ""}
        />
      )}

      {/* Modal historii serwisu */}
      {selectedVehicleId && (
        <VehicleHistoryModal
          isOpen={showHistoryModal}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedVehicleId(null);
          }}
          vehicleId={selectedVehicleId}
        />
      )}
    </>
  );
}