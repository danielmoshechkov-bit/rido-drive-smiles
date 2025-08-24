import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UniversalSelector } from "./UniversalSelector";

interface Fleet {
  id: string;
  name: string;
}

interface VehicleFleetSelectorProps {
  vehicleId: string;
  currentFleetId?: string | null;
  onFleetUpdate?: () => void;
}

export const VehicleFleetSelector = ({ vehicleId, currentFleetId, onFleetUpdate }: VehicleFleetSelectorProps) => {
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchFleets = async () => {
      const { data } = await supabase
        .from("fleets")
        .select("id, name")
        .order("name", { ascending: true });
      
      if (data) {
        setFleets(data);
      }
    };

    fetchFleets();
  }, []);

  const updateVehicleFleet = async (fleetId: string | null, fleetName: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("vehicles")
        .update({ fleet_id: fleetId })
        .eq("id", vehicleId);

      if (error) throw error;

      toast.success(`Zmieniono flotę na: ${fleetName}`);
      
      if (onFleetUpdate) {
        onFleetUpdate();
      }
    } catch (error) {
      toast.error("Błąd podczas zmiany floty");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (item: {id: string; name: string} | null) => {
    if (!item) {
      await updateVehicleFleet(null, "Brak floty");
      return;
    }
    
    await updateVehicleFleet(item.id, item.name);
  };

  // Add "Brak floty" option
  const allItems = [
    { id: 'none', name: 'Brak floty' },
    ...fleets
  ];

  const currentValue = currentFleetId || 'none';
  const currentFleetName = fleets.find(f => f.id === currentFleetId)?.name || "Brak floty";

  return (
    <UniversalSelector
      id={`vehicle-fleet-${vehicleId}`}
      items={allItems}
      currentValue={currentValue}
      placeholder={currentFleetName}
      searchPlaceholder="Szukaj floty..."
      noResultsText="Brak flot"
      showSearch={true}
      showAdd={false}
      onSelect={handleSelect}
      disabled={loading}
      className="inline-block"
    />
  );
};