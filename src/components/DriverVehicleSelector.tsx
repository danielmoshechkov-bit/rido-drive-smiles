import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UniversalSelector } from "./UniversalSelector";

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  plate: string;
  fleet_id?: string | null;
}

interface DriverVehicleSelectorProps {
  driverId: string;
  currentVehicleId?: string | null;
  fleetId?: string | null;
  onVehicleUpdate?: () => void;
  hideFleetName?: boolean;
}

export const DriverVehicleSelector = ({ 
  driverId, 
  currentVehicleId, 
  fleetId, 
  onVehicleUpdate,
  hideFleetName = false
}: DriverVehicleSelectorProps) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVehicleText, setSelectedVehicleText] = useState<string>("Własne auto");

  useEffect(() => {
    const fetchVehicles = async () => {
      // Pobierz wszystkie dostępne pojazdy, nie tylko z konkretnej floty
      const { data } = await supabase
        .from("vehicles")
        .select(`
          id, 
          brand, 
          model, 
          plate,
          fleet_id,
          fleets(name)
        `)
        .eq("status", "aktywne")
        .order("brand", { ascending: true });

      // Pobierz aktywne przypisania pojazdów (oprócz obecnego kierowcy)
      const { data: assignmentsData } = await supabase
        .from("driver_vehicle_assignments")
        .select("vehicle_id, driver_id")
        .eq("status", "active")
        .neq("driver_id", driverId);

      // Filtruj pojazdy - pokaż tylko te, które nie są przypisane do innych kierowców
      const assignedVehicleIds = new Set(assignmentsData?.map(a => a.vehicle_id) || []);
      const availableVehicles = data?.filter(v => !assignedVehicleIds.has(v.id)) || [];
      
      setVehicles(availableVehicles);
    };

    fetchVehicles();
  }, [driverId]); // Usuń dependency na fleetId żeby ładować wszystkie pojazdy

  useEffect(() => {
    if (currentVehicleId && vehicles.length > 0) {
      const currentVehicle = vehicles.find(v => v.id === currentVehicleId);
      if (currentVehicle) {
        if (hideFleetName) {
          // Dla flotowych: Nr rej • Marka Model
          setSelectedVehicleText(`${currentVehicle.plate} • ${currentVehicle.brand} ${currentVehicle.model}`);
        } else {
          // Dla adminów: Flota • Marka Model
          const fleetName = (currentVehicle as any).fleets?.name || "Brak floty";
          setSelectedVehicleText(`${fleetName} • ${currentVehicle.brand} ${currentVehicle.model}`);
        }
        return;
      }
    }
    setSelectedVehicleText("Własne auto");
  }, [currentVehicleId, vehicles, hideFleetName]);

  const assignVehicle = async (vehicleId: string | null, vehicleText: string) => {
    setLoading(true);
    try {
      // First, deactivate any existing assignments
      await supabase
        .from("driver_vehicle_assignments")
        .update({ status: "inactive", unassigned_at: new Date().toISOString() })
        .eq("driver_id", driverId)
        .eq("status", "active");

      if (vehicleId) {
        // Get the vehicle to get its fleet_id
        const vehicle = vehicles.find(v => v.id === vehicleId);
        const vehicleFleetId = vehicle?.fleet_id || null;
        
        // Create new assignment
        const { error } = await supabase
          .from("driver_vehicle_assignments")
          .insert({
            driver_id: driverId,
            vehicle_id: vehicleId,
            fleet_id: vehicleFleetId,
            status: "active",
            assigned_at: new Date().toISOString()
          });

        if (error) throw error;
        
        if (hideFleetName) {
          toast.success(`Przypisano pojazd: ${vehicle?.plate}`);
        } else {
          toast.success(`Przypisano pojazd flotowy`);
        }
      } else {
        toast.success(`Ustawiono własne auto`);
      }

      // Wywołaj callback jeśli istnieje - to spowoduje odświeżenie danych
      if (onVehicleUpdate) {
        onVehicleUpdate();
      }
    } catch (error) {
      toast.error("Błąd podczas przypisywania pojazdu");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (item: {id: string; name: string} | null) => {
    if (!item || item.id === 'own') {
      await assignVehicle(null, "Własne auto");
      return;
    }
    
    const vehicle = vehicles.find(v => v.id === item.id);
    if (vehicle) {
      const fleetName = (vehicle as any).fleets?.name || "Brak floty";
      await assignVehicle(vehicle.id, `${fleetName} • ${vehicle.brand} ${vehicle.model}`);
    }
  };

  // Transform vehicles for UniversalSelector
  const vehicleItems = vehicles.map(v => {
    if (hideFleetName) {
      // Dla flotowych: Nr rej • Marka Model
      return {
        id: v.id,
        name: `${v.plate} • ${v.brand} ${v.model}`
      };
    } else {
      // Dla adminów: Flota • Marka Model • Nr rej
      const fleetName = (v as any).fleets?.name || "Brak floty";
      return {
        id: v.id,
        name: `${fleetName} • ${v.brand} ${v.model} • ${v.plate}`
      };
    }
  });

  // Add "Własne auto" option
  const allItems = [
    { id: 'own', name: 'Własne auto' },
    ...vehicleItems
  ];

  const currentValue = currentVehicleId || 'own';

  return (
    <UniversalSelector
      id={`driver-vehicle-${driverId}`}
      items={allItems}
      currentValue={currentValue}
      placeholder={selectedVehicleText}
      searchPlaceholder="Szukaj pojazdu..."
      noResultsText="Brak pojazdów"
      showSearch={true}
      showAdd={false}
      allowClear={false}
      onSelect={handleSelect}
      disabled={loading}
    />
  );
};