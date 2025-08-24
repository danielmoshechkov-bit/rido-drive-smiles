import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UniversalSelector } from "./UniversalSelector";

export function DriverFleetBadgeSelector({ driverId, fleetId, onFleetChange, allowAdd = true }:{
  driverId: string; 
  fleetId?: string|null;
  onFleetChange?: () => void;
  allowAdd?: boolean;
}) {
  const [fleets, setFleets] = useState<{id:string;name:string}[]>([]);

  const load = async ()=>{
    const { data, error } = await supabase.from("fleets").select("id,name").order("name");
    if (!error && data) setFleets(data);
  };
  
  useEffect(()=>{ load(); },[]);

  const handleSelect = async (item: {id: string; name: string} | null) => {
    if (!item) {
      // Remove fleet
      const { error } = await supabase.from("drivers").update({
        fleet_id: null
      }).eq("id", driverId);
      
      if (error) return toast.error(error.message);
      toast.success("Usunięto flotę kierowcy");
      onFleetChange?.();
      return;
    }

    // Set fleet
    const { error } = await supabase.from("drivers").update({
      fleet_id: item.id
    }).eq("id", driverId);
    
    if (error) return toast.error(error.message);
    toast.success("Zmieniono flotę kierowcy");
    onFleetChange?.();
  };

  const handleAdd = async (name: string) => {
    const { data, error } = await supabase.from("fleets").insert([{ name }]).select("id").single();
    if (error) return toast.error(error.message);
    
    load(); // Reload fleets
    
    // Auto-select the new fleet
    const { error: updateError } = await supabase.from("drivers").update({
      fleet_id: data.id
    }).eq("id", driverId);
    
    if (updateError) return toast.error(updateError.message);
    toast.success("Dodano i przypisano nową flotę");
    onFleetChange?.();
  };

  const currentFleetName = fleets.find(f => f.id === fleetId)?.name || "Flota: brak";

  return (
    <UniversalSelector
      id={`driver-fleet-${driverId}`}
      items={fleets}
      currentValue={fleetId}
      placeholder={currentFleetName}
      searchPlaceholder="Szukaj floty..."
      addPlaceholder="Dodaj nową flotę"
      addButtonText="Dodaj"
      noResultsText="Brak flot"
      showSearch={true}
      showAdd={allowAdd}
      allowClear={true}
      onSelect={handleSelect}
      onAdd={allowAdd ? handleAdd : undefined}
    />
  );
}