import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UniversalSelector } from "./UniversalSelector";
import { X } from "lucide-react";

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
      let query = supabase
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

      if (fleetId) {
        query = query.eq("fleet_id", fleetId);
      }

      const { data } = await query;

      const { data: assignmentsData } = await supabase
        .from("driver_vehicle_assignments")
        .select("vehicle_id, driver_id")
        .eq("status", "active")
        .neq("driver_id", driverId);

      const assignedVehicleIds = new Set(assignmentsData?.map(a => a.vehicle_id) || []);
      const availableVehicles = data?.filter(v => !assignedVehicleIds.has(v.id)) || [];
      
      setVehicles(availableVehicles);
    };

    fetchVehicles();
  }, [driverId, fleetId]);

  useEffect(() => {
    if (currentVehicleId && vehicles.length > 0) {
      const currentVehicle = vehicles.find(v => v.id === currentVehicleId);
      if (currentVehicle) {
        if (hideFleetName) {
          setSelectedVehicleText(`${currentVehicle.plate} • ${currentVehicle.brand} ${currentVehicle.model}`);
        } else {
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
      await supabase
        .from("driver_vehicle_assignments")
        .update({ status: "inactive", unassigned_at: new Date().toISOString() })
        .eq("driver_id", driverId)
        .eq("status", "active");

      if (vehicleId) {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        const vehicleFleetId = vehicle?.fleet_id || null;
        
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

      if (onVehicleUpdate) {
        onVehicleUpdate();
      }
    } catch (error) {
      toast.error("Błąd podczas przypisywania pojazdu");
    } finally {
      setLoading(false);
    }
  };

  const handleUnassign = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setLoading(true);
    try {
      await supabase
        .from("driver_vehicle_assignments")
        .update({ status: "inactive", unassigned_at: new Date().toISOString() })
        .eq("driver_id", driverId)
        .eq("status", "active");
      
      toast.success("Usunięto przypisanie pojazdu");
      if (onVehicleUpdate) onVehicleUpdate();
    } catch (error) {
      toast.error("Błąd podczas usuwania przypisania");
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

  const vehicleItems = vehicles.map(v => {
    if (hideFleetName) {
      return {
        id: v.id,
        name: `${v.plate} • ${v.brand} ${v.model}`
      };
    } else {
      const fleetName = (v as any).fleets?.name || "Brak floty";
      return {
        id: v.id,
        name: `${fleetName} • ${v.brand} ${v.model} • ${v.plate}`
      };
    }
  });

  const allItems = [
    { id: 'own', name: 'Własne auto' },
    ...vehicleItems
  ];

  const currentValue = currentVehicleId || 'own';
  const hasActiveAssignment = currentVehicleId && currentVehicleId !== 'own';

  return (
    <div className="flex items-center gap-1">
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
      {hasActiveAssignment && (
        <button
          onClick={handleUnassign}
          disabled={loading}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
          title="Usuń przypisanie pojazdu"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};