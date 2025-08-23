import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDropdownState } from "@/hooks/useGlobalDropdown";

export function FleetBadgeSelector({ vehicleId, fleetId, ownerName }:{
  vehicleId: string; fleetId?: string|null; ownerName?: string|null;
}) {
  const [fleets, setFleets] = useState<{id:string;name:string}[]>([]);
  const { isOpen: open, toggle: toggleOpen, close: closeDropdown } = useDropdownState(`fleet-${vehicleId}`);
  const [label, setLabel] = useState(ownerName || "Flota: brak");

  const load = async ()=>{
    const { data, error } = await supabase.from("fleets").select("id,name").order("name");
    if (!error && data) setFleets(data);
  };
  useEffect(()=>{ load(); },[]);

  useEffect(()=>{
    const current = fleets.find(f=>f.id===fleetId);
    if (current) setLabel(`Flota: ${current.name}`);
    else if (ownerName) setLabel(`Flota: ${ownerName}`);
    else setLabel("Flota: brak");
  },[fleets, fleetId, ownerName]);

  const setFleet = async (name: string) => {
    // jeśli nie istnieje w słowniku – utwórz
    let id = fleets.find(f=>f.name===name)?.id;
    if (!id) {
      const { data, error } = await supabase.from("fleets").insert([{ name }]).select("id").single();
      if (error) return toast.error(error.message);
      id = data.id;
      load();
    }
    const { error } = await supabase.from("vehicles").update({
      fleet_id: id, owner_name: name
    }).eq("id", vehicleId);
    if (error) return toast.error(error.message);
    toast.success("Zmieniono flotę");
    setLabel(`Flota: ${name}`);
    closeDropdown();
  };

  const removeFleet = async () => {
    const { error } = await supabase.from("vehicles").update({
      fleet_id: null, owner_name: null
    }).eq("id", vehicleId);
    if (error) return toast.error(error.message);
    toast.success("Usunięto z floty");
    setLabel("Flota: brak");
    closeDropdown();
  };

  return (
    <div className="relative">
      <Badge className="cursor-pointer rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center gap-1">
        <span onClick={()=>toggleOpen()}>{label}</span>
        {(fleetId || ownerName) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeFleet();
            }}
            className="ml-1 hover:bg-secondary-foreground/20 rounded-full w-4 h-4 flex items-center justify-center text-xs"
          >
            ✕
          </button>
        )}
      </Badge>
      {open && (
        <div className="absolute z-10 mt-2 w-56 bg-background border rounded-xl shadow-lg p-2">
          {fleets.map(f=>(
            <div key={f.id} className="px-3 py-2 rounded hover:bg-muted cursor-pointer transition-colors"
                 onClick={()=>setFleet(f.name)}>
              {f.name}
            </div>
          ))}
          <div className="px-3 pt-2 text-xs text-muted-foreground">Dodaj nową flotę</div>
          <div className="flex gap-2 p-2">
            <input id="newFleet" className="border rounded px-2 py-1 text-sm flex-1" placeholder="np. GetRido"/>
            <button
              className="border rounded px-2 text-sm hover:bg-muted transition-colors"
              onClick={()=>{
                const el = (document.getElementById("newFleet") as HTMLInputElement);
                if (el?.value) setFleet(el.value.trim());
              }}
            >Dodaj</button>
          </div>
        </div>
      )}
    </div>
  );
}