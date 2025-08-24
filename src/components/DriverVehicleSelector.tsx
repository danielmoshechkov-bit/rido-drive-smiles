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
        .select("id, brand, model, plate")
        .eq("fleet_id", fleetId)
        .eq("status", "aktywne")
        .order("brand", { ascending: true });
      
      if (data) {
        setVehicles(data);
        
        if (currentVehicleId) {
          const currentVehicle = data.find(v => v.id === currentVehicleId);
          if (currentVehicle) {
            setSelectedVehicleText(`${currentVehicle.brand} ${currentVehicle.model} • ${currentVehicle.plate}`);
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
      <div className="flex items-center gap-1 text-sm text-primary">
        <Car size={14} />
        <span>Własne auto</span>
        <ChevronDown className="h-3 w-3" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <Car size={14} />
      <Popover>
        <PopoverTrigger asChild>
          <Button 
            variant="ghost" 
            className="h-auto p-0 text-left font-medium hover:bg-transparent text-sm"
            disabled={loading}
          >
            {selectedVehicleText}
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2 bg-white border shadow-lg z-50" align="start">
          <div className="space-y-1">
            <Button
              variant="ghost"
              className="w-full justify-start text-sm"
              onClick={() => assignVehicle(null, "Własne auto")}
            >
              Własne auto
            </Button>
            {vehicles.map((vehicle) => (
              <Button
                key={vehicle.id}
                variant="ghost"
                className="w-full justify-start text-sm"
                onClick={() => assignVehicle(
                  vehicle.id, 
                  `${vehicle.brand} ${vehicle.model} • ${vehicle.plate}`
                )}
              >
                {vehicle.brand} {vehicle.model} • {vehicle.plate}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};