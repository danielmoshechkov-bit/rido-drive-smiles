import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
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
        <Button
          variant="outline"
          onClick={()=>setOpen(o=>!o)}
          className="h-8 px-3 border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary rounded-lg text-sm flex items-center gap-2"
        >
          {label}
          <ChevronDown className="h-3 w-3" />
        </Button>
        {fleetId && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              removeFleet();
            }}
            className="w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center hover:bg-destructive/80 transition-colors ml-1"
            title="Usuń flotę"
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-2 w-64 bg-popover border border-border rounded-xl shadow-lg p-3">
          <div className="space-y-1 mb-3">
            {fleets.map(f=>(
              <div 
                key={f.id} 
                className="px-3 py-2 rounded-lg hover:bg-primary/10 cursor-pointer transition-colors text-sm"
                onClick={()=>setFleet(f.name)}
              >
                {f.name}
              </div>
            ))}
          </div>
          
          <div className="border-t pt-3">
            <div className="text-xs text-muted-foreground mb-2">Dodaj nową flotę:</div>
            <div className="flex gap-2">
              <input 
                id="newDriverFleet" 
                className="border border-input rounded-lg px-3 py-2 text-sm flex-1 bg-background" 
                placeholder="np. GetRido"
              />
              <Button
                size="sm"
                onClick={()=>{
                  const el = (document.getElementById("newDriverFleet") as HTMLInputElement);
                  if (el?.value) setFleet(el.value.trim());
                }}
              >
                Dodaj
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}