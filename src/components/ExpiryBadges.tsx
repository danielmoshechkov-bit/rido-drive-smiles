import { useEffect, useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";

function colorFor(dateStr?: string | null) {
  if (!dateStr) return "bg-destructive text-destructive-foreground";
  const d = new Date(dateStr);
  const today = new Date();
  const diff = Math.ceil((d.getTime() - today.setHours(0, 0, 0, 0)) / 86400000);
  if (diff > 7) return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100";
  if (diff >= 1) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-100";
  return "bg-destructive text-destructive-foreground";
}

async function getLatestPolicyValidTo(vehicleId: string) {
  const { data } = await supabase
    .from("vehicle_policies")
    .select("valid_to")
    .eq("vehicle_id", vehicleId)
    .order("valid_to", { ascending: false })
    .limit(1);
  return data?.[0]?.valid_to as string | undefined;
}

async function getLatestInspectionValidTo(vehicleId: string) {
  const { data } = await supabase
    .from("vehicle_inspections")
    .select("valid_to")
    .eq("vehicle_id", vehicleId)
    .order("valid_to", { ascending: false })
    .limit(1);
  return data?.[0]?.valid_to as string | undefined;
}

export function ExpiryBadges({ vehicleId }: { vehicleId: string }) {
  const [policyTo, setPolicyTo] = useState<string | undefined>();
  const [inspTo, setInspTo] = useState<string | undefined>();
  const [policyOpen, setPolicyOpen] = useState(false);
  const [inspOpen, setInspOpen] = useState(false);

  const load = async () => {
    setPolicyTo(await getLatestPolicyValidTo(vehicleId));
    setInspTo(await getLatestInspectionValidTo(vehicleId));
  };

  useEffect(() => {
    load();
  }, [vehicleId]);

  const saveDate = async (kind: "policy" | "insp", date: Date | undefined) => {
    if (!date) return;
    
    const value = format(date, "yyyy-MM-dd");
    
    if (kind === "policy") {
      const { error } = await supabase.from("vehicle_policies").insert([{
        vehicle_id: vehicleId,
        type: "OC",
        policy_no: "TBA",
        provider: "TBA",
        valid_from: new Date().toISOString().slice(0, 10),
        valid_to: value
      }]);
      if (error) return toast.error(error.message);
      setPolicyTo(value);
      setPolicyOpen(false);
    } else {
      const { error } = await supabase.from("vehicle_inspections").insert([{
        vehicle_id: vehicleId,
        date: new Date().toISOString().slice(0, 10),
        valid_to: value,
        result: "pozytywny"
      }]);
      if (error) return toast.error(error.message);
      setInspTo(value);
      setInspOpen(false);
    }
    toast.success("Zapisano datę");
  };

  const formatDisplayDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      return format(new Date(dateStr), "yyyy-MM-dd");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* OC Policy */}
      <Popover open={policyOpen} onOpenChange={setPolicyOpen}>
        <PopoverTrigger asChild>
          <Badge 
            className={`rounded-full cursor-pointer ${colorFor(policyTo)}`}
          >
            OC: {formatDisplayDate(policyTo)}
          </Badge>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={policyTo ? new Date(policyTo) : undefined}
            onSelect={(date) => saveDate("policy", date)}
            locale={pl}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>

      {/* Inspection */}
      <Popover open={inspOpen} onOpenChange={setInspOpen}>
        <PopoverTrigger asChild>
          <Badge 
            className={`rounded-full cursor-pointer ${colorFor(inspTo)}`}
          >
            Przegląd: {formatDisplayDate(inspTo)}
          </Badge>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={inspTo ? new Date(inspTo) : undefined}
            onSelect={(date) => saveDate("insp", date)}
            locale={pl}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
