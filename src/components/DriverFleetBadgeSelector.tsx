import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UniversalSelector } from "./UniversalSelector";

export function DriverFleetBadgeSelector({ driverId, fleetId, onFleetChange, allowAdd = true, managingFleetId }:{
  driverId: string; 
  fleetId?: string|null;
  onFleetChange?: () => void;
  allowAdd?: boolean;
  managingFleetId?: string | null;
}) {
  const [fleets, setFleets] = useState<{id:string;name:string}[]>([]);

  const load = async ()=>{
    if (managingFleetId) {
      // Fleet mode: show only managing fleet + partner fleets for this fleet
      const [ownFleet, partnerships] = await Promise.all([
        supabase.from("fleets").select("id,name").eq("id", managingFleetId).single(),
        supabase.from("driver_fleet_partnerships")
          .select("partner_fleet:fleets!driver_fleet_partnerships_partner_fleet_id_fkey(id, name)")
          .eq("managing_fleet_id", managingFleetId)
          .eq("is_active", true)
      ]);
      
      const result: {id:string;name:string}[] = [];
      if (ownFleet.data) result.push(ownFleet.data);
      if (partnerships.data) {
        for (const p of partnerships.data) {
          const pf = p.partner_fleet as any;
          if (pf?.id && !result.find(r => r.id === pf.id)) {
            result.push({ id: pf.id, name: pf.name });
          }
        }
      }
      setFleets(result);
    } else {
      // Admin mode: show all fleets
      const { data, error } = await supabase.from("fleets").select("id,name").order("name");
      if (!error && data) setFleets(data);
    }
  };
  
  useEffect(()=>{ load(); },[managingFleetId]);

  const handleSelect = async (item: {id: string; name: string} | null) => {
    if (!item) {
      const { error } = await supabase.from("drivers").update({
        fleet_id: null
      }).eq("id", driverId);
      
      if (error) return toast.error(error.message);
      toast.success("Usunięto flotę kierowcy");
      onFleetChange?.();
      return;
    }

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
    
    load();
    
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