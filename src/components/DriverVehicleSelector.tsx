import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Car } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
        
        if (currentVehicleId) {
          const currentVehicle = data.find(v => v.id === currentVehicleId);
          if (currentVehicle) {
            const fleetName = (currentVehicle as any).fleets?.name || "Brak floty";
            setSelectedVehicleText(`${fleetName} • ${currentVehicle.brand} ${currentVehicle.model}`);
          } else {
            setSelectedVehicleText("Własne auto");
          }
        } else {
          setSelectedVehicleText("Własne auto");
        }
      }
    };

    fetchVehicles();
  }, [fleetId, currentVehicleId]);

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
      }

      setSelectedVehicleText(vehicleText);
      toast.success(`Zmieniono pojazd na: ${vehicleText}`);
      
      if (onVehicleUpdate) {
        onVehicleUpdate();
      }
    } catch (error) {
      toast.error("Błąd podczas przypisywania pojazdu");
    } finally {
      setLoading(false);
    }
  };

  if (!fleetId || vehicles.length === 0) {
    return (
      <Button
        variant="outline"
        className="h-8 px-3 border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary rounded-lg text-sm flex items-center gap-2"
        disabled
      >
        <Car size={14} />
        <span>Własne auto</span>
        <ChevronDown className="h-3 w-3" />
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="outline"
          className="h-8 px-3 border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary rounded-lg text-sm flex items-center gap-2"
          disabled={loading}
        >
          <Car size={14} />
          {selectedVehicleText}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 bg-popover border shadow-lg z-50 rounded-lg" align="start">
        <div className="space-y-2">
          <Button
            variant="ghost"
            className="w-full justify-start text-sm h-10 px-3 rounded-lg hover:bg-primary/10"
            onClick={() => assignVehicle(null, "Własne auto")}
          >
            Własne auto
          </Button>
          {vehicles.map((vehicle) => {
            const fleetName = (vehicle as any).fleets?.name || "Brak floty";
            return (
              <Button
                key={vehicle.id}
                variant="ghost"
                className="w-full justify-start text-sm h-10 px-3 rounded-lg hover:bg-primary/10"
                onClick={() => assignVehicle(
                  vehicle.id, 
                  `${fleetName} • ${vehicle.brand} ${vehicle.model}`
                )}
              >
                {fleetName} • {vehicle.brand} {vehicle.model} • {vehicle.plate}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};