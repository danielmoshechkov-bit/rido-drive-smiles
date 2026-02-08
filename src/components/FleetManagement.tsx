import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UniversalSubTabBar } from "./UniversalSubTabBar";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronUp, Search, Filter, Plus, Trash2, Car, X, Store, FileKey } from "lucide-react";
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
import { VehicleListingModal } from "./fleet/VehicleListingModal";
import { FleetRentalsManagement } from "./fleet/FleetRentalsManagement";
import { FleetActiveRentals } from "./fleet/FleetActiveRentals";
import { FleetRentalsTab } from "./fleet/FleetRentalsTab";
import { DriverVehiclesTab } from "./DriverVehiclesTab";
import { CarBrandsManagement } from "./CarBrandsManagement";
import { VehiclePhotosTab } from "./driver/VehiclePhotosTab";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { AddFleetDriverModal } from "./fleet/AddFleetDriverModal";
import { VehicleRentalWizard } from "./fleet/VehicleRentalWizard";
import { FleetContractSettings } from "./fleet/FleetContractSettings";
import { syncRentalAssignments } from "@/hooks/useRentalSync";

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
  const [listingVehicle, setListingVehicle] = useState<Vehicle | null>(null);
  const [listedVehicleIds, setListedVehicleIds] = useState<Set<string>>(new Set());
  const [showAddDriverModal, setShowAddDriverModal] = useState(false);
  const [showRentalWizard, setShowRentalWizard] = useState(false);
  const [fleetInfo, setFleetInfo] = useState<{name: string} | null>(null);
  const { openDropdown, setOpenDropdown } = useGlobalDropdown();
  const { isMarketplaceEnabled } = useFeatureToggles();

  const loadDrivers = async () => {
    let query = supabase
      .from('drivers')
      .select('id, first_name, last_name')
      .order('first_name');

    // Dla flotowych - filtruj po fleet_id, dla adminów - po city_id
    if (userType === 'fleet' && fleetId) {
      query = query.eq('fleet_id', fleetId);
    } else if (cityId) {
      query = query.eq('city_id', cityId);
    }

    const { data } = await query;
    // Only show first name + last name (no email) to keep selector compact
    const driverItems = (data || []).map(driver => ({
      id: driver.id,
      name: `${driver.first_name || ''} ${driver.last_name || ''}`.trim()
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
      // Show fleet vehicles only if fleetId provided, otherwise show all for admin
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
  
  const loadListedVehicles = async () => {
    if (!fleetId) return;
    const { data } = await supabase
      .from("vehicle_listings")
      .select("vehicle_id")
      .eq("fleet_id", fleetId);
    
    setListedVehicleIds(new Set((data || []).map(l => l.vehicle_id)));
  };
  
  useEffect(() => {
    const loadAll = async () => {
      // First sync rentals with assignments
      if (fleetId) {
        await syncRentalAssignments(fleetId);
      }
      
      // Then load data
      fetchVehicles();
      loadDrivers();
      loadListedVehicles();
    };
    
    loadAll();
    
    // Fetch fleet name if fleetId is provided
    if (fleetId) {
      supabase
        .from("fleets")
        .select("name")
        .eq("id", fleetId)
        .single()
        .then(({ data }) => {
          if (data) setFleetInfo(data);
        });
    }
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
      console.log('🚗 Assigning driver:', { vehicleId, driverId });
      
      // Zakończ poprzednie przypisania pojazdu
      const { error: updateError } = await supabase
        .from('driver_vehicle_assignments')
        .update({ 
          status: 'inactive',
          unassigned_at: new Date().toISOString()
        })
        .eq('vehicle_id', vehicleId)
        .eq('status', 'active');

      if (updateError) {
        console.error('Error deactivating vehicle assignments:', updateError);
        throw updateError;
      }

      // Zakończ poprzednie przypisania kierowcy
      const { error: deactivateDriverError } = await supabase
        .from('driver_vehicle_assignments')
        .update({ 
          status: 'inactive',
          unassigned_at: new Date().toISOString()
        })
        .eq('driver_id', driverId)
        .eq('status', 'active');

      if (deactivateDriverError) {
        console.error('Error deactivating driver assignments:', deactivateDriverError);
        throw deactivateDriverError;
      }

      // Dodaj nowe przypisanie
      const { error } = await supabase
        .from('driver_vehicle_assignments')
        .insert([{
          vehicle_id: vehicleId,
          driver_id: driverId,
          assigned_at: new Date().toISOString(),
          status: 'active',
          fleet_id: fleetId
        }]);

      if (error) {
        console.error('Error creating new assignment:', error);
        throw error;
      }
      
      console.log('✅ Driver assigned successfully');
      toast.success('Kierowca przypisany do pojazdu');
      fetchVehicles();
    } catch (error: any) {
      console.error('Full assignment error:', error);
      toast.error(`Błąd przy przypisywaniu kierowcy: ${error?.message || 'Nieznany błąd'}`);
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
      
      // Natychmiastowa aktualizacja stanu lokalnego
      setVehicles(prev => prev.map(v => 
        v.id === vehicleId ? { ...v, assignedDriver: null } : v
      ));
      
      setOpenDropdown(null);
      toast.success('Przypisanie kierowcy zostało usunięte');
      
      // Odśwież dane z serwera
      await fetchVehicles();
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

  const updateAssignedDate = async (vehicleId: string, newDate: Date) => {
    try {
      const { error } = await supabase
        .from("driver_vehicle_assignments")
        .update({ assigned_at: newDate.toISOString() })
        .eq("vehicle_id", vehicleId)
        .eq("status", "active");

      if (error) throw error;

      toast.success("Zaktualizowano datę wynajmu");
      fetchVehicles();
    } catch (error) {
      console.error("Błąd podczas aktualizacji daty wynajmu:", error);
      toast.error("Nie udało się zaktualizować daty wynajmu");
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
      // 1. Dezaktywuj wszystkie przypisania kierowców
      await supabase
        .from("driver_vehicle_assignments")
        .update({ 
          status: "inactive", 
          unassigned_at: new Date().toISOString() 
        })
        .eq("vehicle_id", vehicleId)
        .eq("status", "active");

      // 2. Usuń powiązane zaproszenia flotowe (foreign key constraint)
      await supabase
        .from("fleet_invitations")
        .delete()
        .eq("vehicle_id", vehicleId);

      // 3. Następnie usuń pojazd
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
    <div className="space-y-4">
      {/* UniversalSubTabBar POZA Card - jak w Rozliczeniach */}
      <UniversalSubTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={[
          { value: "vehicles", label: "Auta", visible: true },
          { value: "najem", label: "Najem", visible: userType === 'fleet' && !!fleetId },
          { value: "rentals", label: "Rezerwacje z giełdy", visible: userType === 'fleet' && !!fleetId },
          { value: "settings", label: "Ustawienia umowy", visible: userType === 'fleet' && !!fleetId },
          { value: "fleets", label: "Floty", visible: userType === 'admin' },
          { value: "driver-vehicles", label: "Auta kierowców", visible: userType === 'admin' },
          { value: "car-brands", label: "Lista aut", visible: userType === 'admin' },
        ]}
      />

      {/* Content based on active tab */}
      {activeTab === "vehicles" && (
        <Card className="rounded-lg overflow-x-hidden">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5 shrink-0" />
                <span className="truncate">Flota - {cityName}</span>
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Zarządzaj flotą w mieście {cityName}
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 overflow-x-hidden">

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between mb-4 gap-3">
              {/* Left side - action buttons */}
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <Button onClick={() => setShowAddModal(true)} variant="outline" className="gap-2 text-xs sm:text-sm">
                  <Plus className="h-4 w-4" />
                  <span className="hidden xs:inline">Dodaj pojazd</span>
                  <span className="xs:hidden">Dodaj</span>
                </Button>
                <Button onClick={() => setShowRentalWizard(true)} className="gap-2 text-xs sm:text-sm">
                  <FileKey className="h-4 w-4" />
                  <span className="hidden xs:inline">Wynajmij pojazd</span>
                  <span className="xs:hidden">Wynajem</span>
                </Button>
              </div>
              
              {/* Right side - search and filter */}
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none sm:w-72">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Szukaj..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="px-2 sm:px-3 py-2 border rounded-md text-sm bg-background flex-shrink-0"
                >
                  <option value="all">Status</option>
                  <option value="aktywne">Aktywne</option>
                  <option value="serwis">Serwis</option>
                  <option value="sprzedane">Sprzedane</option>
                </select>
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
                         className="absolute top-2 right-2 h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 z-10"
                         onClick={(e) => {
                           e.stopPropagation();
                           deleteVehicle(vehicle.id);
                         }}
                       >
                         <Trash2 className="h-4 w-4" />
                       </Button>

                       <CollapsibleTrigger asChild>
                         <div className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                           <div className="flex items-start justify-between pr-10">
                             
                             {/* MOBILE VIEW - compact 2 rows */}
                             <div className="md:hidden flex-1 space-y-2">
                               {/* Row 1: Plate + Vehicle */}
                               <div className="flex items-center gap-4">
                                 <div className="min-w-0">
                                   <span className="text-xs text-muted-foreground">Nr rej.:</span>
                                   <div className="font-bold text-sm">{vehicle.plate}</div>
                                 </div>
                                 <div className="min-w-0 flex-1">
                                   <span className="text-xs text-muted-foreground">Pojazd:</span>
                                   <div className="font-semibold text-sm truncate">{vehicle.brand} {vehicle.model}</div>
                                 </div>
                               </div>
                               {/* Row 2: Rent + Documents */}
                               <div className="flex items-center justify-between gap-2">
                                 <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                                   <VehicleRentBlock
                                     value={vehicle.weekly_rental_fee}
                                     onChange={(value) => updateWeeklyRentalFee(vehicle.id, value.toString())}
                                     assignedAt={vehicle.assignedDriver?.assigned_at}
                                     onAssignedAtChange={(date) => updateAssignedDate(vehicle.id, date)}
                                     userRole={userType}
                                   />
                                 </div>
                                 <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                                   <ExpiryBadges vehicleId={vehicle.id} />
                                 </div>
                               </div>
                             </div>
                             
                             {/* DESKTOP VIEW - full layout */}
                             <div className="hidden md:block flex-1 space-y-3">
                                {/* Rząd 1 - podstawowe info */}
                                <div className="flex items-center gap-6">
                                   <div className="min-w-[100px]">
                                     <span className="text-xs text-muted-foreground">Nr rej.:</span>
                                     <div className="font-bold text-sm">{vehicle.plate}</div>
                                   </div>
                                   <div className="min-w-[120px]">
                                     <span className="text-xs text-muted-foreground">Pojazd:</span>
                                     <div className="font-semibold text-sm">{vehicle.brand} {vehicle.model}</div>
                                   </div>
                                    <div className="min-w-[100px]" onClick={(e) => e.stopPropagation()}>
                                      <span className="text-xs text-muted-foreground">Flota:</span>
                                      <div>
                                        {userType === 'admin' ? (
                                          <VehicleFleetSelector 
                                            vehicleId={vehicle.id}
                                            currentFleetId={vehicle.fleet_id}
                                            onFleetUpdate={fetchVehicles}
                                          />
                                        ) : (
                                          <div className="font-semibold text-sm truncate">
                                            {vehicle.fleet?.name || 'Brak floty'}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                      <div className="min-w-[100px]" onClick={(e) => e.stopPropagation()}>
                                        <VehicleRentBlock
                                          value={vehicle.weekly_rental_fee}
                                          onChange={(value) => updateWeeklyRentalFee(vehicle.id, value.toString())}
                                          assignedAt={vehicle.assignedDriver?.assigned_at}
                                          onAssignedAtChange={(date) => updateAssignedDate(vehicle.id, date)}
                                          userRole={userType}
                                        />
                                      </div>
                                </div>
                               
                                {/* Rząd 2 - kierowca i dokumenty */}
                                <div className="flex items-center gap-6 pt-2 border-t border-border/50">
                                     <div className="min-w-[150px]" onClick={(e) => e.stopPropagation()}>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                          Kierowca:
                                          <ChevronDown className="h-3 w-3 text-primary" />
                                        </span>
                                        <UniversalSelector
                                          id={`vehicle-driver-${vehicle.id}`}
                                          items={drivers}
                                          currentValue={vehicle.assignedDriver?.id || null}
                                          placeholder={vehicle.assignedDriver 
                                            ? `${vehicle.assignedDriver.first_name} ${vehicle.assignedDriver.last_name}`
                                            : "Brak"
                                          }
                                          searchPlaceholder="Szukaj kierowcy..."
                                          noResultsText="Brak kierowców"
                                          showSearch={true}
                                          showAdd={false}
                                          showAddNew={userType === 'fleet' && !!fleetId}
                                          addNewButtonText="Dodaj kierowcę"
                                          allowClear={true}
                                          onSelect={async (item) => {
                                            if (item) {
                                              await assignDriver(vehicle.id, item.id);
                                            } else {
                                              await removeDriverAssignment(vehicle.id);
                                            }
                                          }}
                                          onAddNew={() => setShowAddDriverModal(true)}
                                          className="inline-block"
                                        />
                                     </div>
                                    <div className="min-w-[180px]" onClick={(e) => e.stopPropagation()}>
                                      <span className="text-xs text-muted-foreground">Dokumenty:</span>
                                      <div className="overflow-x-auto">
                                        <ExpiryBadges vehicleId={vehicle.id} />
                                      </div>
                                    </div>
                                    {userType === 'fleet' && fleetId && isMarketplaceEnabled && (
                                       <div className="min-w-[100px] flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                         <Switch
                                           checked={listedVehicleIds.has(vehicle.id)}
                                           onCheckedChange={async (checked) => {
                                             if (checked) {
                                               setListingVehicle(vehicle);
                                             } else {
                                               try {
                                                 await supabase
                                                   .from("vehicle_listings")
                                                   .delete()
                                                   .eq("vehicle_id", vehicle.id);
                                                 toast.success("Usunięto z giełdy");
                                                 loadListedVehicles();
                                               } catch (error) {
                                                 toast.error("Błąd usuwania z giełdy");
                                               }
                                             }
                                           }}
                                         />
                                         <span className="text-xs text-muted-foreground">
                                           {listedVehicleIds.has(vehicle.id) ? "Na giełdzie" : "Giełda"}
                                         </span>
                                       </div>
                                     )}
                                 </div>
                             </div>
                             
                             {/* Expand arrow - visible on BOTH mobile and desktop */}
                             <div className="ml-4 mt-1">
                               {expandedVehicles.has(vehicle.id) ? 
                                 <ChevronUp className="h-5 w-5 text-muted-foreground" /> : 
                                 <ChevronDown className="h-5 w-5 text-muted-foreground" />
                               }
                             </div>
                           </div>
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="border-t p-4">
                          {/* Mobile: Show additional fields first */}
                          <div className="md:hidden space-y-4 mb-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div onClick={(e) => e.stopPropagation()}>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  Kierowca:
                                  <ChevronDown className="h-3 w-3 text-primary" />
                                </span>
                                <UniversalSelector
                                  id={`vehicle-driver-mobile-${vehicle.id}`}
                                  items={drivers}
                                  currentValue={vehicle.assignedDriver?.id || null}
                                  placeholder={vehicle.assignedDriver 
                                    ? `${vehicle.assignedDriver.first_name} ${vehicle.assignedDriver.last_name}`
                                    : "Brak"
                                  }
                                  searchPlaceholder="Szukaj kierowcy..."
                                  noResultsText="Brak kierowców"
                                  showSearch={true}
                                  showAdd={false}
                                  showAddNew={userType === 'fleet' && !!fleetId}
                                  addNewButtonText="Dodaj kierowcę"
                                  allowClear={true}
                                  onSelect={async (item) => {
                                    if (item) {
                                      await assignDriver(vehicle.id, item.id);
                                    } else {
                                      await removeDriverAssignment(vehicle.id);
                                    }
                                  }}
                                  onAddNew={() => setShowAddDriverModal(true)}
                                  className="inline-block"
                                />
                              </div>
                              <div>
                                <span className="text-xs text-muted-foreground">Flota:</span>
                                <div className="font-semibold text-sm truncate">
                                  {vehicle.fleet?.name || 'Brak floty'}
                                </div>
                              </div>
                            </div>
                            {userType === 'fleet' && fleetId && isMarketplaceEnabled && (
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <Switch
                                  checked={listedVehicleIds.has(vehicle.id)}
                                  onCheckedChange={async (checked) => {
                                    if (checked) {
                                      setListingVehicle(vehicle);
                                    } else {
                                      try {
                                        await supabase
                                          .from("vehicle_listings")
                                          .delete()
                                          .eq("vehicle_id", vehicle.id);
                                        toast.success("Usunięto z giełdy");
                                        loadListedVehicles();
                                      } catch (error) {
                                        toast.error("Błąd usuwania z giełdy");
                                      }
                                    }
                                  }}
                                />
                                <span className="text-xs text-muted-foreground">
                                  {listedVehicleIds.has(vehicle.id) ? "Na giełdzie" : "Giełda"}
                                </span>
                              </div>
                            )}
                          </div>
                          
                          {/* Tabs - for both mobile and desktop */}
                          <Tabs defaultValue="info" className="w-full">
                            <TabsList className="grid w-full grid-cols-5 rounded-lg text-xs md:text-sm">
                              <TabsTrigger value="info">Info</TabsTrigger>
                              <TabsTrigger value="documents">Dokumenty</TabsTrigger>
                              <TabsTrigger value="history" className="hidden md:inline-flex">Historia Kierowców</TabsTrigger>
                              <TabsTrigger value="history" className="md:hidden">Historia</TabsTrigger>
                              <TabsTrigger value="service">Serwis</TabsTrigger>
                              <TabsTrigger value="photos">Zdjęcia</TabsTrigger>
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

                              <TabsContent value="photos">
                                <VehiclePhotosTab vehicleId={vehicle.id} />
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
          </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "fleets" && (
        <FleetTabManagement cityId={cityId} />
      )}

      {activeTab === "driver-vehicles" && userType === 'admin' && (
        <DriverVehiclesTab />
      )}

      {activeTab === "najem" && userType === 'fleet' && fleetId && (
        <FleetRentalsTab fleetId={fleetId} />
      )}

      {activeTab === "rentals" && userType === 'fleet' && fleetId && (
        <FleetRentalsManagement fleetId={fleetId} />
      )}

      {activeTab === "settings" && userType === 'fleet' && fleetId && (
        <FleetContractSettings fleetId={fleetId} />
      )}

      {activeTab === "car-brands" && userType === 'admin' && (
        <CarBrandsManagement />
      )}

      <AddVehicleModal 
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        cityId={cityId}
        onSuccess={fetchVehicles}
        userType={fleetId ? 'fleet' : 'admin'}
        fleetId={fleetId}
        fleetName={fleetInfo?.name || cityName}
      />

      {listingVehicle && fleetId && (
        <VehicleListingModal
          open={!!listingVehicle}
          onOpenChange={(open) => !open && setListingVehicle(null)}
          vehicle={{
            id: listingVehicle.id,
            brand: listingVehicle.brand,
            model: listingVehicle.model,
            plate: listingVehicle.plate,
            photos: []
          }}
          fleetId={fleetId}
          onSuccess={() => {
            loadListedVehicles();
            setListingVehicle(null);
          }}
        />
      )}

      {/* Add Driver Modal */}
      {fleetId && (
        <AddFleetDriverModal
          isOpen={showAddDriverModal}
          onClose={() => setShowAddDriverModal(false)}
          fleetId={fleetId}
          onSuccess={() => {
            loadDrivers();
            setShowAddDriverModal(false);
          }}
        />
      )}

      {/* Vehicle Rental Wizard */}
      {fleetId && (
        <VehicleRentalWizard
          open={showRentalWizard}
          onOpenChange={setShowRentalWizard}
          fleetId={fleetId}
          onComplete={() => {
            fetchVehicles();
          }}
        />
      )}
    </div>
  );
}