import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parse, isValid } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

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

// Calendar with month/year navigation
function DatePickerWithNav({ 
  selected, 
  onSelect,
  onClose
}: { 
  selected?: Date; 
  onSelect: (date: Date) => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(selected || new Date());
  const [inputValue, setInputValue] = useState(selected ? format(selected, "ddMMyyyy") : "");
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 8);
    setInputValue(val);
    
    // Auto-parse when 8 digits entered
    if (val.length === 8) {
      const parsed = parse(val, "ddMMyyyy", new Date());
      if (isValid(parsed)) {
        onSelect(parsed);
        onClose();
      }
    }
  };

  const formatInputDisplay = (val: string) => {
    if (val.length <= 2) return val;
    if (val.length <= 4) return `${val.slice(0,2)}.${val.slice(2)}`;
    return `${val.slice(0,2)}.${val.slice(2,4)}.${val.slice(4)}`;
  };

  const handleDaySelect = (date: Date | undefined) => {
    if (date) {
      onSelect(date);
      onClose();
    }
  };

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);
  const months = [
    "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
    "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"
  ];

  return (
    <div className="p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
      {/* Manual input */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Wpisz datę (ddmmrrrr):</label>
        <Input
          value={formatInputDisplay(inputValue)}
          onChange={handleInputChange}
          placeholder="dd.mm.rrrr"
          className="text-center font-mono"
          maxLength={10}
        />
      </div>
      
      {/* Month/Year selectors */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => setMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <div className="flex gap-1">
          <select
            value={month.getMonth()}
            onChange={(e) => setMonth(prev => new Date(prev.getFullYear(), parseInt(e.target.value)))}
            className="text-sm border rounded px-2 py-1 bg-background"
          >
            {months.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>
          
          <select
            value={month.getFullYear()}
            onChange={(e) => setMonth(prev => new Date(parseInt(e.target.value), prev.getMonth()))}
            className="text-sm border rounded px-2 py-1 bg-background"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => setMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Calendar */}
      <Calendar
        mode="single"
        selected={selected}
        onSelect={handleDaySelect}
        month={month}
        onMonthChange={setMonth}
        locale={pl}
        className={cn("p-0 pointer-events-auto")}
      />
    </div>
  );
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

  const saveDate = async (kind: "policy" | "insp", date: Date) => {
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

  const handleBadgeClick = (e: React.MouseEvent, kind: "policy" | "insp") => {
    e.stopPropagation();
    e.preventDefault();
    if (kind === "policy") {
      setPolicyOpen(true);
    } else {
      setInspOpen(true);
    }
  };

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {/* OC Policy */}
      <Popover open={policyOpen} onOpenChange={setPolicyOpen}>
        <PopoverTrigger asChild>
          <Badge 
            className={`rounded-full cursor-pointer hover:opacity-80 ${colorFor(policyTo)}`}
            onClick={(e) => handleBadgeClick(e, "policy")}
          >
            OC: {formatDisplayDate(policyTo)}
          </Badge>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-[100]" align="start" onClick={(e) => e.stopPropagation()}>
          <DatePickerWithNav
            selected={policyTo ? new Date(policyTo) : undefined}
            onSelect={(date) => saveDate("policy", date)}
            onClose={() => setPolicyOpen(false)}
          />
        </PopoverContent>
      </Popover>

      {/* Inspection */}
      <Popover open={inspOpen} onOpenChange={setInspOpen}>
        <PopoverTrigger asChild>
          <Badge 
            className={`rounded-full cursor-pointer hover:opacity-80 ${colorFor(inspTo)}`}
            onClick={(e) => handleBadgeClick(e, "insp")}
          >
            Przegląd: {formatDisplayDate(inspTo)}
          </Badge>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-[100]" align="start" onClick={(e) => e.stopPropagation()}>
          <DatePickerWithNav
            selected={inspTo ? new Date(inspTo) : undefined}
            onSelect={(date) => saveDate("insp", date)}
            onClose={() => setInspOpen(false)}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}