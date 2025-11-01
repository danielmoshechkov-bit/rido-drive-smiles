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
import { UniversalSelector } from "./UniversalSelector";

interface FleetManagementProps {
  cityId?: string | null;
  cityName: string;
  fleetId?: string | null;
  userType?: 'admin' | 'fleet';
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

export function FleetManagement({ cityId, cityName, fleetId, userType = 'admin' }: FleetManagementProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<{id: string; name: string}[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState("vehicles");
  const { openDropdown, setOpenDropdown } = useGlobalDropdown();

  const loadDrivers = async () => {
    let query = supabase
      .from('drivers')
      .select('id, first_name, last_name, email')
      .order('first_name');

    // Dla flotowych - filtruj po fleet_id, dla adminów - po city_id
    if (userType === 'fleet' && fleetId) {
      query = query.eq('fleet_id', fleetId);
    } else if (cityId) {
      query = query.eq('city_id', cityId);
    }

    const { data } = await query;
    const driverItems = (data || []).map(driver => ({
      id: driver.id,
      name: `${driver.first_name} ${driver.last_name}${driver.email ? ` (${driver.email})` : ''}`
    }));
    setDrivers(driverItems);
  };

  const fetchVehicles = async () => {
    let vehiclesQuery = supabase
      .from("vehicles")
      .select(`
        *,
        fleets(name)
      `)
      .order("created_at", { ascending: false });
      
    // Filter by fleetId if provided (fleet user), otherwise by cityId (admin)
    if (fleetId) {
      vehiclesQuery = vehiclesQuery.eq("fleet_id", fleetId);
    } else if (cityId) {
      vehiclesQuery = vehiclesQuery.eq("city_id", cityId);
    }
    
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
    loadDrivers();
  }, [cityId, fleetId]);

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

  const assignDriver = async (vehicleId: string, driverId: string) => {
    try {
      // Zakończ poprzednie przypisania pojazdu
      const { error: updateError } = await supabase
        .from('driver_vehicle_assignments')
        .update({ 
          status: 'inactive',
          unassigned_at: new Date().toISOString()
        })
        .eq('vehicle_id', vehicleId)
        .eq('status', 'active');

      if (updateError) throw updateError;

      // Zakończ poprzednie przypisania kierowcy
      const { error: deactivateDriverError } = await supabase
        .from('driver_vehicle_assignments')
        .update({ 
          status: 'inactive',
          unassigned_at: new Date().toISOString()
        })
        .eq('driver_id', driverId)
        .eq('status', 'active');

      if (deactivateDriverError) throw deactivateDriverError;

      // Dodaj nowe przypisanie
      const { error } = await supabase
        .from('driver_vehicle_assignments')
        .insert([{
          vehicle_id: vehicleId,
          driver_id: driverId,
          assigned_at: new Date().toISOString(),
          status: 'active'
        }]);

      if (error) throw error;
      
      toast.success('Kierowca przypisany do pojazdu');
      fetchVehicles();
    } catch (error) {
      toast.error('Błąd przy przypisywaniu kierowcy');
    }
  };

  const removeDriverAssignment = async (vehicleId: string) => {
    try {
      const { error } = await supabase
        .from('driver_vehicle_assignments')
        .update({ 
          status: 'inactive',
          unassigned_at: new Date().toISOString()
        })
        .eq('vehicle_id', vehicleId)
        .eq('status', 'active');

      if (error) throw error;
      
      toast.success('Przypisanie kierowcy zostało usunięte');
      fetchVehicles();
    } catch (error) {
      toast.error('Błąd podczas usuwania przypisania kierowcy');
    }
  };

  const removeDriverAssignmentOld = async (vehicleId: string, driverId: string) => {
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

  const deleteVehicle = async (vehicleId: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten pojazd? Ta operacja nie może być cofnięta.")) return;
    
    try {
      // Najpierw dezaktywuj wszystkie przypisania
      await supabase
        .from("driver_vehicle_assignments")
        .update({ 
          status: "inactive", 
          unassigned_at: new Date().toISOString() 
        })
        .eq("vehicle_id", vehicleId)
        .eq("status", "active");

      // Następnie usuń pojazd
      const { error } = await supabase
        .from("vehicles")
        .delete()
        .eq("id", vehicleId);

      if (error) throw error;
      
      toast.success("Pojazd został usunięty");
      fetchVehicles();
    } catch (error) {
      console.error("Error deleting vehicle:", error);
      toast.error("Błąd podczas usuwania pojazdu");
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
          <TabsList className={`grid w-full ${userType === 'admin' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <TabsTrigger value="vehicles">Auta</TabsTrigger>
            {userType === 'admin' && (
              <TabsTrigger value="fleets">Floty</TabsTrigger>
            )}
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
                    <Card className="border rounded-lg relative">
                       {/* Delete button */}
                       <Button
                         variant="ghost"
                         size="sm"
                         className="absolute top-2 right-2 h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 z-10"
                         onClick={(e) => {
                           e.stopPropagation();
                           deleteVehicle(vehicle.id);
                         }}
                       >
                         <Trash2 className="h-4 w-4" />
                       </Button>

                       <CollapsibleTrigger asChild>
                         <div className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                           <div className="flex items-center justify-between pr-10">
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
                                       {userType === 'admin' ? (
                                         <VehicleFleetSelector 
                                           vehicleId={vehicle.id}
                                           currentFleetId={vehicle.fleet_id}
                                           onFleetUpdate={fetchVehicles}
                                         />
                                       ) : (
                                         <div className="font-semibold text-sm">
                                           {vehicle.fleet?.name || 'Brak floty'}
                                         </div>
                                       )}
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
                                    <div className="min-w-[150px] flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                       <span className="font-medium text-sm text-muted-foreground flex items-center gap-1">
                                         Kierowca:
                                         <ChevronDown className="h-3 w-3 text-primary" />
                                       </span>
                                       <UniversalSelector
                                         id={`vehicle-driver-${vehicle.id}`}
                                         items={drivers}
                                         currentValue={vehicle.assignedDriver?.id || null}
                                         placeholder={vehicle.assignedDriver 
                                           ? `${vehicle.assignedDriver.first_name} ${vehicle.assignedDriver.last_name}`
                                           : "Brak przypisania"
                                         }
                                         searchPlaceholder="Szukaj kierowcy..."
                                         noResultsText="Brak kierowców"
                                         showSearch={true}
                                         showAdd={false}
                                         allowClear={true}
                                         onSelect={async (item) => {
                                           if (item) {
                                             await assignDriver(vehicle.id, item.id);
                                           } else {
                                             await removeDriverAssignment(vehicle.id);
                                           }
                                         }}
                                         className="inline-block"
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
        userType={fleetId ? 'fleet' : 'admin'}
        fleetId={fleetId}
        fleetName={cityName}
      />
    </Card>
  );
}