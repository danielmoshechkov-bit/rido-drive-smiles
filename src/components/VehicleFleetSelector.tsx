import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Search } from "lucide-react";
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
  const [searchTerm, setSearchTerm] = useState<string>("");

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

  const filteredFleets = fleets.filter(fleet => 
    fleet.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      setSearchTerm(""); // Clear search after selection
      
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
          className="h-auto p-0 text-left font-semibold text-primary hover:bg-transparent cursor-pointer"
          disabled={loading}
        >
          {selectedFleetName}
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 bg-popover border shadow-lg z-50 rounded-lg" align="start">
        {/* Search input */}
        <div className="relative mb-3">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Szukaj floty..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        
        <div className="space-y-2 max-h-56 overflow-y-auto">
          <Button
            variant="ghost"
            className="w-full justify-start text-sm h-10 px-3 rounded-lg hover:bg-primary/10"
            onClick={() => updateVehicleFleet(null, "Brak floty")}
          >
            Brak floty
          </Button>
          {filteredFleets.map((fleet) => (
            <Button
              key={fleet.id}
              variant="ghost"
              className="w-full justify-start text-sm h-10 px-3 rounded-lg hover:bg-primary/10"
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