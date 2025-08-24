import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function DriverFleetBadgeSelector({ driverId, fleetId, onFleetChange }:{
  driverId: string; 
  fleetId?: string|null;
  onFleetChange?: () => void;
}) {
  const [fleets, setFleets] = useState<{id:string;name:string}[]>([]);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("Flota: brak");

  const load = async ()=>{
    const { data, error } = await supabase.from("fleets").select("id,name").order("name");
    if (!error && data) setFleets(data);
  };
  
  useEffect(()=>{ load(); },[]);

  useEffect(()=>{
    const current = fleets.find(f=>f.id===fleetId);
    if (current) setLabel(`Flota: ${current.name}`);
    else setLabel("Flota: brak");
  },[fleets, fleetId]);

  const setFleet = async (name: string) => {
    // jeśli nie istnieje w słowniku – utwórz
    let id = fleets.find(f=>f.name===name)?.id;
    if (!id) {
      const { data, error } = await supabase.from("fleets").insert([{ name }]).select("id").single();
      if (error) return toast.error(error.message);
      id = data.id;
      load();
    }
    
    const { error } = await supabase.from("drivers").update({
      fleet_id: id
    }).eq("id", driverId);
    
    if (error) return toast.error(error.message);
    toast.success("Zmieniono flotę kierowcy");
    setLabel(`Flota: ${name}`);
    setOpen(false);
    onFleetChange?.();
  };

  const removeFleet = async () => {
    const { error } = await supabase.from("drivers").update({
      fleet_id: null
    }).eq("id", driverId);
    
    if (error) return toast.error(error.message);
    toast.success("Usunięto flotę kierowcy");
    setLabel("Flota: brak");
    setOpen(false);
    onFleetChange?.();
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <Badge 
          variant="secondary" 
          onClick={()=>setOpen(o=>!o)} 
          className="cursor-pointer hover:bg-secondary/80 transition-colors"
        >
          {label}
        </Badge>
        {fleetId && (
          <button 
            onClick={removeFleet}
            className="w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center hover:bg-destructive/80 transition-colors"
            title="Usuń flotę"
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-10 mt-2 w-56 bg-popover border rounded-xl shadow-lg p-2">
          {fleets.map(f=>(
            <div key={f.id} className="px-3 py-2 rounded hover:bg-muted cursor-pointer transition-colors"
                 onClick={()=>setFleet(f.name)}>
              {f.name}
            </div>
          ))}
          <div className="px-3 pt-2 text-xs text-muted-foreground">Dodaj nową flotę</div>
          <div className="flex gap-2 p-2">
            <input id="newDriverFleet" className="border border-input rounded px-2 py-1 text-sm flex-1 bg-background" placeholder="np. GetRido"/>
            <button
              className="border border-input rounded px-2 text-sm hover:bg-muted transition-colors bg-background"
              onClick={()=>{
                const el = (document.getElementById("newDriverFleet") as HTMLInputElement);
                if (el?.value) setFleet(el.value.trim());
              }}
            >Dodaj</button>
          </div>
        </div>
      )}
    </div>
  );
}