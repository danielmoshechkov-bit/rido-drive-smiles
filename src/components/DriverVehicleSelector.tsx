import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UniversalSelector } from "./UniversalSelector";

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  plate: string;
}

interface DriverVehicleSelectorProps {
  driverId: string;
  currentVehicleId?: string | null;
  fleetId?: string | null;
  onVehicleUpdate?: () => void;
}

export const DriverVehicleSelector = ({ 
  driverId, 
  currentVehicleId, 
  fleetId, 
  onVehicleUpdate 
}: DriverVehicleSelectorProps) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVehicleText, setSelectedVehicleText] = useState<string>("Własne auto");

  useEffect(() => {
    const fetchVehicles = async () => {
      if (!fleetId) {
        setVehicles([]);
        setSelectedVehicleText("Własne auto");
        return;
      }

      const { data } = await supabase
        .from("vehicles")
        .select(`
          id, 
          brand, 
          model, 
          plate,
          fleets(name)
        `)
        .eq("fleet_id", fleetId)
        .eq("status", "aktywne")
        .order("brand", { ascending: true });
      
      if (data) {
        setVehicles(data);
      }
    };

    fetchVehicles();
  }, [fleetId]);

  useEffect(() => {
    if (currentVehicleId && vehicles.length > 0) {
      const currentVehicle = vehicles.find(v => v.id === currentVehicleId);
      if (currentVehicle) {
        const fleetName = (currentVehicle as any).fleets?.name || "Brak floty";
        setSelectedVehicleText(`${fleetName} • ${currentVehicle.brand} ${currentVehicle.model}`);
        return;
      }
    }
    setSelectedVehicleText("Własne auto");
  }, [currentVehicleId, vehicles]);

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
        // Create new assignment
        const { error } = await supabase
          .from("driver_vehicle_assignments")
          .insert({
            driver_id: driverId,
            vehicle_id: vehicleId,
            fleet_id: fleetId,
            status: "active",
            assigned_at: new Date().toISOString()
          });

        if (error) throw error;
        toast.success(`Przypisano pojazd flotowy`);
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
    const fleetName = (v as any).fleets?.name || "Brak floty";
    return {
      id: v.id,
      name: `${fleetName} • ${v.brand} ${v.model} • ${v.plate}`
    };
  });

  // Add "Własne auto" option
  const allItems = [
    { id: 'own', name: 'Własne auto' },
    ...vehicleItems
  ];

  // If no fleetId, show disabled own car option
  if (!fleetId || vehicles.length === 0) {
    return (
      <UniversalSelector
        id={`driver-vehicle-${driverId}`}
        items={[{ id: 'own', name: 'Własne auto' }]}
        currentValue="own"
        placeholder="Własne auto"
        showSearch={false}
        showAdd={false}
        disabled={true}
        onSelect={() => {}}
      />
    );
  }

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
      onSelect={handleSelect}
      disabled={loading}
    />
  );
};