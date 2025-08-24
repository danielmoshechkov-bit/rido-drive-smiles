import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, ChevronDown, ChevronRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AddVehicleModal } from "./AddVehicleModal";
import { FleetBadgeSelector } from "./FleetBadgeSelector";
import { ExpiryBadges } from "./ExpiryBadges";
import { VehicleDocuments } from "./VehicleDocuments";
import { VehicleDriverHistory } from "./VehicleDriverHistory";
import { VehicleServiceTab } from "./VehicleServiceTab";
import { VehicleInfoTab } from "./VehicleInfoTab";

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
  fleet_id?: string | null;
  weekly_rental_fee?: number | null;
  created_at?: string;
  assignedDriver?: {
    id: string;
    first_name: string;
    last_name: string;
    assigned_at: string;
  } | null;
};

export function FleetManagement({ cityId, cityName }: { cityId?: string | null; cityName: string }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"Wszystkie" | Vehicle["status"]>("Wszystkie");
  const [showAdd, setShowAdd] = useState(false);
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(new Set());

  const fetchVehicles = async () => {
    let q = supabase
      .from("vehicles")
      .select(`
        *,
        driver_vehicle_assignments!inner(
          id,
          assigned_at,
          status,
          drivers(id, first_name, last_name)
        )
      `)
      .eq("driver_vehicle_assignments.status", "active")
      .order("created_at", { ascending: false });
      
    if (cityId) q = q.eq("city_id", cityId);
    
    const { data: assignedVehicles, error: assignedError } = await q;
    
    // Also get unassigned vehicles
    let unassignedQuery = supabase
      .from("vehicles")
      .select("*")
      .order("created_at", { ascending: false });
      
    if (cityId) unassignedQuery = unassignedQuery.eq("city_id", cityId);
    
    const { data: allVehicles, error: allError } = await unassignedQuery;
    
    if (assignedError || allError) {
      toast.error("Błąd ładowania pojazdów");
      return;
    }
    
    // Combine data: mark vehicles with assignments
    const vehiclesWithAssignments = allVehicles?.map(vehicle => {
      const assignment = assignedVehicles?.find(av => av.id === vehicle.id);
      return {
        ...vehicle,
        assignedDriver: assignment?.driver_vehicle_assignments?.[0]?.drivers 
          ? {
              id: assignment.driver_vehicle_assignments[0].drivers.id,
              first_name: assignment.driver_vehicle_assignments[0].drivers.first_name,
              last_name: assignment.driver_vehicle_assignments[0].drivers.last_name,
              assigned_at: assignment.driver_vehicle_assignments[0].assigned_at
            }
          : null
      };
    }) || [];
    
    setVehicles(vehiclesWithAssignments as Vehicle[]);
  };
  
  useEffect(() => { fetchVehicles(); /* eslint-disable-next-line */ }, [cityId]);

  const filtered = vehicles.filter(v => {
    const text = `${v.plate} ${v.brand} ${v.model} ${v.vin ?? ""}`.toLowerCase();
    const okText = text.includes(query.toLowerCase());
    const okStatus = status === "Wszystkie" ? true : v.status === status;
    return okText && okStatus;
  });

  const toggleExpanded = (vehicleId: string) => {
    const newExpanded = new Set(expandedVehicles);
    if (newExpanded.has(vehicleId)) {
      newExpanded.delete(vehicleId);
    } else {
      newExpanded.add(vehicleId);
    }
    setExpandedVehicles(newExpanded);
  };

  const removeDriverAssignment = async (vehicleId: string, driverId: string) => {
    try {
      const { error } = await supabase
        .from("driver_vehicle_assignments")
        .update({ status: "inactive", unassigned_at: new Date().toISOString() })
        .eq("vehicle_id", vehicleId)
        .eq("driver_id", driverId)
        .eq("status", "active");

      if (error) throw error;
      
      toast.success("Kierowca został odłączony od pojazdu");
      fetchVehicles();
    } catch (error) {
      toast.error("Błąd podczas odłączania kierowcy");
    }
  };

  const updateWeeklyRentalFee = async (vehicleId: string, fee: number) => {
    try {
      const { error } = await supabase
        .from("vehicles")
        .update({ weekly_rental_fee: fee })
        .eq("id", vehicleId);

      if (error) throw error;
      
      toast.success("Zaktualizowano opłatę za wynajem");
      fetchVehicles();
    } catch (error) {
      toast.error("Błąd podczas aktualizacji opłaty za wynajem");
    }
  };

  const saveVehicleInfo = async (vehicleId: string, patch: Partial<Vehicle>) => {
    try {
      if (patch.plate) patch.plate = patch.plate.toUpperCase();
      if (patch.vin) patch.vin = patch.vin.toUpperCase();
      
      const { error } = await supabase
        .from("vehicles")
        .update(patch)
        .eq("id", vehicleId);

      if (error) throw error;
      
      toast.success("Zapisano");
      fetchVehicles();
    } catch (error) {
      toast.error("Błąd podczas aktualizacji pojazdu");
    }
  };

  return (
    <>
      <Card className="rounded-lg border border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Flota – {cityName}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Znaleziono {filtered.length} z {vehicles.length} pojazdów
              </p>
            </div>
            <Button onClick={() => setShowAdd(true)} className="gap-2 rounded-lg">
              <Plus className="h-4 w-4" /> Dodaj pojazd
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <Input 
              value={query} 
              onChange={(e) => setQuery(e.target.value)} 
              placeholder="Szukaj po rejestracji, VIN, marce..." 
              className="max-w-sm rounded-lg" 
            />
            <select
              className="border rounded-lg px-3 py-2 text-sm"
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
                <Collapsible key={v.id} open={expandedVehicles.has(v.id)} onOpenChange={() => toggleExpanded(v.id)}>
                  <CollapsibleTrigger asChild>
                    <div className="border border-border/50 rounded-lg p-4 transition-colors hover:bg-muted/30 cursor-pointer">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 grid grid-cols-3 gap-4 items-center">
                          <div className="flex items-center gap-2">
                            {expandedVehicles.has(v.id) ? (
                              <ChevronDown size={16} className="text-muted-foreground" />
                            ) : (
                              <ChevronRight size={16} className="text-muted-foreground" />
                            )}
                            <div className="font-medium">{v.brand}</div>
                          </div>
                          <div className="font-medium text-center">{v.model}</div>
                          <div className="font-medium text-right">{v.plate}</div>
                        </div>
                        
                        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                          <div className="w-2 h-2 rounded-full bg-green-500" title="Aktywny"></div>
                          <FleetBadgeSelector vehicleId={v.id} fleetId={v.fleet_id ?? null} ownerName={v.owner_name ?? null} />
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Wynajem:</span>
                            <Input
                              type="number"
                              value={v.weekly_rental_fee || 0}
                              onBlur={(e) => updateWeeklyRentalFee(v.id, Number(e.target.value))}
                              className="w-16 h-6 text-xs rounded-md"
                              step="1"
                              min="0"
                            />
                            <span className="text-xs text-muted-foreground">zł/tyg</span>
                          </div>
                          <ExpiryBadges vehicleId={v.id} />
                        </div>
                      </div>
                      
                      {v.assignedDriver && (
                        <div className="flex items-center gap-2 text-sm text-primary mt-2">
                          <span>Kierowca: {v.assignedDriver.first_name} {v.assignedDriver.last_name}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeDriverAssignment(v.id, v.assignedDriver!.id);
                            }}
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-sm"
                            title="Usuń przypisanie kierowcy"
                          >
                            <X size={12} />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent className="px-4 pb-4">
                    <div className="mt-3 p-4 bg-muted/30 rounded-lg">
                      <Tabs defaultValue="info" className="w-full">
                        <TabsList className="grid w-full grid-cols-4 rounded-lg">
                          <TabsTrigger value="info" className="rounded-md">Informacje</TabsTrigger>
                          <TabsTrigger value="docs" className="rounded-md">Dokumenty</TabsTrigger>
                          <TabsTrigger value="drivers" className="rounded-md">Historia kierowców</TabsTrigger>
                          <TabsTrigger value="service" className="rounded-md">Serwis</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="info" className="mt-4">
                          <VehicleInfoTab vehicle={v} onSave={saveVehicleInfo} />
                        </TabsContent>
                        
                        <TabsContent value="docs" className="mt-4">
                          <VehicleDocuments vehicleId={v.id} />
                        </TabsContent>
                        
                        <TabsContent value="drivers" className="mt-4">
                          <VehicleDriverHistory vehicleId={v.id} />
                        </TabsContent>
                        
                        <TabsContent value="service" className="mt-4">
                          <VehicleServiceTab vehicleId={v.id} />
                        </TabsContent>
                      </Tabs>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddVehicleModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={() => { setShowAdd(false); fetchVehicles(); }}
        cityId={cityId ?? null}
      />
    </>
  );
}