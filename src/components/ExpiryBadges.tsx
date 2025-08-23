import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function colorFor(dateStr?: string|null){
  if(!dateStr) return "bg-destructive text-destructive-foreground";
  const d = new Date(dateStr);
  const today = new Date();
  const diff = Math.ceil((d.getTime()-today.setHours(0,0,0,0))/86400000);
  if (diff > 7) return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100";
  if (diff >= 1) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-100";
  return "bg-destructive text-destructive-foreground";
}

async function getLatestPolicyValidTo(vehicleId: string){
  const { data } = await supabase
    .from("vehicle_policies")
    .select("valid_to")
    .eq("vehicle_id", vehicleId).order("valid_to",{ascending:false}).limit(1);
  return data?.[0]?.valid_to as string|undefined;
}
async function getLatestInspectionValidTo(vehicleId: string){
  const { data } = await supabase
    .from("vehicle_inspections")
    .select("valid_to")
    .eq("vehicle_id", vehicleId).order("valid_to",{ascending:false}).limit(1);
  return data?.[0]?.valid_to as string|undefined;
}

export function ExpiryBadges({ vehicleId }:{ vehicleId: string }) {
  const [policyTo,setPolicyTo] = useState<string|undefined>();
  const [inspTo,setInspTo] = useState<string|undefined>();
  const [open,setOpen] = useState<"policy"|"insp"|null>(null);

  const load = async ()=>{
    setPolicyTo(await getLatestPolicyValidTo(vehicleId));
    setInspTo(await getLatestInspectionValidTo(vehicleId));
  };
  useEffect(()=>{ load(); },[vehicleId]);

  const saveDate = async (kind: "policy"|"insp", value: string)=>{
    if (kind==="policy"){
      const { error } = await supabase.from("vehicle_policies").insert([{
        vehicle_id: vehicleId, type: "OC", policy_no: "TBA", provider: "TBA",
        valid_from: new Date().toISOString().slice(0,10), valid_to: value
      }]);
      if (error) return toast.error(error.message);
      setPolicyTo(value);
    } else {
      const { error } = await supabase.from("vehicle_inspections").insert([{
        vehicle_id: vehicleId, date: new Date().toISOString().slice(0,10), valid_to: value, result: "pozytywny"
      }]);
      if (error) return toast.error(error.message);
      setInspTo(value);
    }
    toast.success("Zapisano datę");
    setOpen(null);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Badge className={`rounded-full cursor-pointer ${colorFor(policyTo)}`} onClick={()=>setOpen(open==="policy"?null:"policy")}>
          OC: {policyTo ?? "—"}
        </Badge>
        {open==="policy" && (
          <div className="absolute z-10 mt-2 bg-background border rounded-xl shadow-lg p-2">
            <input type="date" className="border rounded px-2 py-1"
                   onChange={e=>saveDate("policy", e.target.value)} />
          </div>
        )}
      </div>
      <div className="relative">
        <Badge className={`rounded-full cursor-pointer ${colorFor(inspTo)}`} onClick={()=>setOpen(open==="insp"?null:"insp")}>
          Przegląd: {inspTo ?? "—"}
        </Badge>
        {open==="insp" && (
          <div className="absolute z-10 mt-2 bg-background border rounded-xl shadow-lg p-2">
            <input type="date" className="border rounded px-2 py-1"
                   onChange={e=>saveDate("insp", e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}