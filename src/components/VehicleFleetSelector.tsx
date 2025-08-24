import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const [selectedFleetName, setSelectedFleetName] = useState<string>("");

  useEffect(() => {
    const fetchFleets = async () => {
      const { data } = await supabase
        .from("fleets")
        .select("id, name")
        .order("name", { ascending: true });
      
      if (data) {
        setFleets(data);
        const currentFleet = data.find(f => f.id === currentFleetId);
        setSelectedFleetName(currentFleet?.name || "Brak floty");
      }
    };

    fetchFleets();
  }, [currentFleetId]);

  const updateVehicleFleet = async (fleetId: string | null, fleetName: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("vehicles")
        .update({ fleet_id: fleetId })
        .eq("id", vehicleId);

      if (error) throw error;

      setSelectedFleetName(fleetName);
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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          className="h-auto p-0 text-left font-medium hover:bg-transparent"
          disabled={loading}
        >
          {selectedFleetName}
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 bg-white border shadow-lg" align="start">
        <div className="space-y-1">
          <Button
            variant="ghost"
            className="w-full justify-start text-sm"
            onClick={() => updateVehicleFleet(null, "Brak floty")}
          >
            Brak floty
          </Button>
          {fleets.map((fleet) => (
            <Button
              key={fleet.id}
              variant="ghost"
              className="w-full justify-start text-sm"
              onClick={() => updateVehicleFleet(fleet.id, fleet.name)}
            >
              {fleet.name}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};