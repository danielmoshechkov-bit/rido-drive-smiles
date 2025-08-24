import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronUp, Search, Filter, Plus, Trash2, Car, X } from "lucide-react";
import { AddVehicleModal } from "./AddVehicleModal";
import { VehicleInfoTab } from "./VehicleInfoTab";
import { VehicleServiceTab } from "./VehicleServiceTab";
import { VehicleDocuments } from "./VehicleDocuments";
import { VehicleDriverHistory } from "./VehicleDriverHistory";
import { VehicleFleetSelector } from "./VehicleFleetSelector";
import { VehicleRentBlock } from "./ui/VehicleRentBlock";
import { FleetTabManagement } from "./FleetTabManagement";
import { useGlobalDropdown } from "@/hooks/useGlobalDropdown";
import { ExpiryBadges } from "./ExpiryBadges";
import { InlineEdit } from "./InlineEdit";
import { DriverAssignmentDropdown } from "./DriverAssignmentDropdown";

interface FleetManagementProps {
  cityId?: string | null;
  cityName: string;
}

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
  fleet?: {
    name: string;
  } | null;
  assignedDriver?: {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    assigned_at: string;
  } | null;
};

export function FleetManagement({ cityId, cityName }: FleetManagementProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState("vehicles");
  const { openDropdown, setOpenDropdown } = useGlobalDropdown();

  const fetchVehicles = async () => {
    let vehiclesQuery = supabase
      .from("vehicles")
      .select(`
        *,
        fleets(name)
      `)
      .order("created_at", { ascending: false });
      
    if (cityId) vehiclesQuery = vehiclesQuery.eq("city_id", cityId);
    
    const { data: allVehicles, error: vehiclesError } = await vehiclesQuery;
    
    if (vehiclesError) {
      toast.error("Błąd ładowania pojazdów");
      return;
    }
    
    // Pobierz aktywne przypisania kierowców
    const { data: assignments } = await supabase
      .from("driver_vehicle_assignments")
      .select(`
        vehicle_id,
        assigned_at,
        drivers(id, first_name, last_name, email)
      `)
      .eq("status", "active");
    
    // Połącz dane pojazdów z przypisaniami
    const vehiclesWithAssignments = allVehicles?.map(vehicle => {
      const assignment = assignments?.find(a => a.vehicle_id === vehicle.id);
      return {
        ...vehicle,
        fleet: vehicle.fleets,
        assignedDriver: assignment?.drivers 
          ? {
              id: assignment.drivers.id,
              first_name: assignment.drivers.first_name,
              last_name: assignment.drivers.last_name,
              email: assignment.drivers.email,
              assigned_at: assignment.assigned_at
            }
          : null
      };
    }) || [];
    
    setVehicles(vehiclesWithAssignments as Vehicle[]);
  };
  
  useEffect(() => {
    fetchVehicles();
  }, [cityId]);

  const filtered = vehicles.filter(v => {
    const text = `${v.plate} ${v.brand} ${v.model} ${v.vin ?? ""}`.toLowerCase();
    const okText = text.includes(query.toLowerCase());
    const okStatus = status === "all" ? true : v.status === status;
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
    // Zamknij wszystkie otwarte dropdowny
    setOpenDropdown(null);
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

  const updateWeeklyRentalFee = async (vehicleId: string, feeString: string) => {
    const fee = parseFloat(feeString) || 0;
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

  const saveVehicleInfo = async (vehicleId: string, field: string, value: string) => {
    try {
      let updateData: any = { [field]: value };
      
      if (field === 'plate') updateData.plate = value.toUpperCase();
      if (field === 'vin') updateData.vin = value.toUpperCase();
      
      const { error } = await supabase
        .from("vehicles")
        .update(updateData)
        .eq("id", vehicleId);

      if (error) throw error;
      
      toast.success("Zapisano");
      fetchVehicles();
    } catch (error) {
      toast.error("Błąd podczas aktualizacji pojazdu");
    }
  };

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Flota - {cityName}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Zarządzaj flotą w mieście {cityName}
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="vehicles">Auta</TabsTrigger>
            <TabsTrigger value="fleets">Floty</TabsTrigger>
          </TabsList>

          <TabsContent value="vehicles" className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div></div>
              <div className="flex items-center space-x-4">
                <div className="relative w-72">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Szukaj po numerze rejestracyjnym"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="px-3 py-2 border rounded-md text-sm bg-background"
                >
                  <option value="all">Status</option>
                  <option value="aktywne">Aktywne</option>
                  <option value="serwis">Serwis</option>
                  <option value="sprzedane">Sprzedane</option>
                </select>
                <Button onClick={() => setShowAddModal(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Dodaj pojazd
                </Button>
              </div>
            </div>

            {/* Lista pojazdów */}
            <div className="space-y-4">
              {filtered.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Brak pojazdów spełniających kryteria wyszukiwania
                </div>
              ) : (
                filtered.map((vehicle) => (
                  <Collapsible
                    key={vehicle.id}
                    open={expandedVehicles.has(vehicle.id)}
                    onOpenChange={() => toggleExpanded(vehicle.id)}
                  >
                    <Card className="border rounded-lg">
                      <CollapsibleTrigger asChild>
                        <div className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between">
                            {/* Pierwszy rząd - podstawowe info */}
                            <div className="flex-1 space-y-3">
                               <div className="flex items-center gap-6">
                                  <div className="min-w-[120px]">
                                    <span className="font-medium text-sm text-muted-foreground">Nr rej.:</span>
                                    <div className="font-semibold">{vehicle.plate}</div>
                                  </div>
                                  <div className="min-w-[150px]">
                                    <span className="font-medium text-sm text-muted-foreground">Pojazd:</span>
                                    <div className="font-semibold">{vehicle.brand} {vehicle.model}</div>
                                  </div>
                                   <div className="min-w-[100px]">
                                     <span className="font-medium text-sm text-muted-foreground">Flota:</span>
                                     <div onClick={(e) => e.stopPropagation()}>
                                       <VehicleFleetSelector 
                                         vehicleId={vehicle.id}
                                         currentFleetId={vehicle.fleet_id}
                                         onFleetUpdate={fetchVehicles}
                                       />
                                     </div>
                                   </div>
                                    <div className="min-w-[120px]" onClick={(e) => e.stopPropagation()}>
                                      <VehicleRentBlock
                                        value={vehicle.weekly_rental_fee}
                                        onChange={(value) => updateWeeklyRentalFee(vehicle.id, value.toString())}
                                      />
                                    </div>
                               </div>
                              
                               {/* Drugi rząd - kierowca i daty */}
                               <div className="flex items-center gap-6 pt-2 border-t border-muted/30">
                                   <div className="min-w-[150px]">
                                     <span className="font-medium text-sm text-muted-foreground">Kierowca:</span>
                                     <DriverAssignmentDropdown
                                       vehicleId={vehicle.id}
                                       currentDriver={vehicle.assignedDriver}
                                       onAssignmentChange={fetchVehicles}
                                     />
                                   </div>
                                  <div className="min-w-[200px]">
                                    <span className="font-medium text-sm text-muted-foreground">Dokumenty:</span>
                                    <div className="font-semibold">
                                      <ExpiryBadges vehicleId={vehicle.id} />
                                    </div>
                                  </div>
                               </div>
                            </div>
                            
                            {/* Przycisk rozwijania */}
                            <div className="ml-4">
                              {expandedVehicles.has(vehicle.id) ? 
                                <ChevronUp className="h-5 w-5" /> : 
                                <ChevronDown className="h-5 w-5" />
                              }
                            </div>
                          </div>
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="border-t p-4">
                          <Tabs defaultValue="info" className="w-full">
                            <TabsList className="grid w-full grid-cols-4 rounded-lg">
                              <TabsTrigger value="info">Info</TabsTrigger>
                              <TabsTrigger value="documents">Dokumenty</TabsTrigger>
                              <TabsTrigger value="history">Historia Kierowców</TabsTrigger>
                              <TabsTrigger value="service">Serwis</TabsTrigger>
                            </TabsList>

                            <div className="mt-4">
                              <TabsContent value="info">
                                <VehicleInfoTab 
                                  vehicle={vehicle} 
                                  onSave={(field, value) => saveVehicleInfo(vehicle.id, field, value)}
                                />
                              </TabsContent>

                              <TabsContent value="documents">
                                <VehicleDocuments vehicleId={vehicle.id} />
                              </TabsContent>

                              <TabsContent value="history">
                                <VehicleDriverHistory vehicleId={vehicle.id} />
                              </TabsContent>

                              <TabsContent value="service">
                                <VehicleServiceTab vehicleId={vehicle.id} />
                              </TabsContent>
                            </div>
                          </Tabs>

                        </div>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="fleets" className="space-y-6">
            <FleetTabManagement cityId={cityId} />
          </TabsContent>
        </Tabs>
      </CardContent>

      <AddVehicleModal 
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        cityId={cityId}
        onSuccess={fetchVehicles}
      />
    </Card>
  );
}