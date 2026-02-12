import { useEffect, useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isValid } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

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

// Simple Calendar Component
function SimpleCalendar({ 
  selected, 
  onSelect,
  month,
  onMonthChange
}: { 
  selected?: Date; 
  onSelect: (date: Date) => void;
  month: Date;
  onMonthChange: (date: Date) => void;
}) {
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  
  const days = [];
  for (let i = 0; i < adjustedFirstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const weekDays = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

  return (
    <div className="p-2">
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map(day => (
          <div key={day} className="text-center text-xs text-muted-foreground font-medium py-1">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} />;
          }
          const date = new Date(month.getFullYear(), month.getMonth(), day);
          const isSelected = selected && 
            selected.getDate() === day && 
            selected.getMonth() === month.getMonth() && 
            selected.getFullYear() === month.getFullYear();
          const isToday = new Date().toDateString() === date.toDateString();
          
          return (
            <button
              key={day}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(date);
              }}
              className={cn(
                "w-8 h-8 rounded-md text-sm flex items-center justify-center transition-colors",
                isSelected && "bg-primary text-primary-foreground",
                !isSelected && isToday && "bg-accent",
                !isSelected && !isToday && "hover:bg-muted"
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Inline Date Picker Modal
function DatePickerModal({ 
  isOpen,
  onClose,
  selected, 
  onSelect,
  title
}: { 
  isOpen: boolean;
  onClose: () => void;
  selected?: Date; 
  onSelect: (date: Date) => void;
  title: string;
}) {
  const [month, setMonth] = useState(selected || new Date());
  const [inputValue, setInputValue] = useState(selected ? format(selected, "ddMMyyyy") : "");
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMonth(selected || new Date());
      setInputValue(selected ? format(selected, "ddMMyyyy") : "");
    }
  }, [isOpen, selected]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 8);
    setInputValue(val);
  };

  const confirmManualInput = () => {
    if (inputValue.length === 8) {
      const day = parseInt(inputValue.slice(0, 2), 10);
      const monthNum = parseInt(inputValue.slice(2, 4), 10);
      const yearNum = parseInt(inputValue.slice(4, 8), 10);
      
      const parsed = new Date(yearNum, monthNum - 1, day);
      if (isValid(parsed) && parsed.getDate() === day && monthNum >= 1 && monthNum <= 12) {
        onSelect(parsed);
        onClose();
      } else {
        toast.error("Nieprawidłowa data");
      }
    }
  };

  const formatInputDisplay = (val: string) => {
    if (val.length <= 2) return val;
    if (val.length <= 4) return `${val.slice(0,2)}.${val.slice(2)}`;
    return `${val.slice(0,2)}.${val.slice(2,4)}.${val.slice(4)}`;
  };

  const handleDaySelect = (date: Date) => {
    onSelect(date);
    onClose();
  };

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);
  const months = [
    "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
    "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={(e) => e.stopPropagation()}>
      <div 
        ref={modalRef}
        className="bg-popover border rounded-lg shadow-lg w-[320px]" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 border-b">
          <span className="font-medium text-sm">{title}</span>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="p-3 space-y-3">
          {/* Manual input */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Wpisz datę (ddmmrrrr):</label>
            <div className="flex gap-2">
              <Input
                value={formatInputDisplay(inputValue)}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmManualInput();
                  }
                }}
                placeholder="dd.mm.rrrr"
                className="text-center font-mono flex-1"
                maxLength={10}
                autoFocus
              />
              <Button size="sm" onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                confirmManualInput();
              }} disabled={inputValue.length !== 8}>
                OK
              </Button>
            </div>
          </div>
          
          {/* Month/Year selectors */}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="icon"
              type="button"
              className="h-7 w-7"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1));
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex gap-1">
              <select
                value={month.getMonth()}
                onChange={(e) => {
                  e.stopPropagation();
                  setMonth(prev => new Date(prev.getFullYear(), parseInt(e.target.value)));
                }}
                onClick={(e) => e.stopPropagation()}
                className="text-sm border rounded px-2 py-1 bg-background"
              >
                {months.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
              
              <select
                value={month.getFullYear()}
                onChange={(e) => {
                  e.stopPropagation();
                  setMonth(prev => new Date(parseInt(e.target.value), prev.getMonth()));
                }}
                onClick={(e) => e.stopPropagation()}
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
              type="button"
              className="h-7 w-7"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1));
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Calendar */}
          <SimpleCalendar
            selected={selected}
            onSelect={handleDaySelect}
            month={month}
            onMonthChange={setMonth}
          />
        </div>
      </div>
    </div>
  );
}

export function ExpiryBadges({ vehicleId }: { vehicleId: string }) {
  const [policyTo, setPolicyTo] = useState<string | undefined>();
  const [inspTo, setInspTo] = useState<string | undefined>();
  const [terminationDate, setTerminationDate] = useState<string | undefined>();
  const [policyOpen, setPolicyOpen] = useState(false);
  const [inspOpen, setInspOpen] = useState(false);
  const [terminationOpen, setTerminationOpen] = useState(false);

  const load = async () => {
    setPolicyTo(await getLatestPolicyValidTo(vehicleId));
    setInspTo(await getLatestInspectionValidTo(vehicleId));
    // Load contract termination date from vehicles table
    const { data } = await supabase
      .from("vehicles")
      .select("contract_termination_date")
      .eq("id", vehicleId)
      .maybeSingle();
    setTerminationDate((data as any)?.contract_termination_date || undefined);
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

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {/* OC Policy */}
      <Badge 
        className={`rounded-full cursor-pointer hover:opacity-80 ${colorFor(policyTo)}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setPolicyOpen(true);
        }}
      >
        OC: {formatDisplayDate(policyTo)}
      </Badge>

      {/* Inspection */}
      <Badge 
        className={`rounded-full cursor-pointer hover:opacity-80 ${colorFor(inspTo)}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setInspOpen(true);
        }}
      >
        Przegląd: {formatDisplayDate(inspTo)}
      </Badge>

      {/* Contract Termination */}
      {terminationDate && (
        <Badge 
          className={`rounded-full cursor-pointer hover:opacity-80 ${colorFor(terminationDate)}`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setTerminationOpen(true);
          }}
        >
          Wypow.: {formatDisplayDate(terminationDate)}
        </Badge>
      )}
      {!terminationDate && (
        <Badge 
          className="rounded-full cursor-pointer hover:opacity-80 bg-muted text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setTerminationOpen(true);
          }}
        >
          + Wypow.
        </Badge>
      )}

      {/* Date Picker Modals */}
      <DatePickerModal
        isOpen={policyOpen}
        onClose={() => setPolicyOpen(false)}
        selected={policyTo ? new Date(policyTo) : undefined}
        onSelect={(date) => saveDate("policy", date)}
        title="Data ważności OC"
      />

      <DatePickerModal
        isOpen={inspOpen}
        onClose={() => setInspOpen(false)}
        selected={inspTo ? new Date(inspTo) : undefined}
        onSelect={(date) => saveDate("insp", date)}
        title="Data ważności przeglądu"
      />

      <DatePickerModal
        isOpen={terminationOpen}
        onClose={() => setTerminationOpen(false)}
        selected={terminationDate ? new Date(terminationDate) : undefined}
        onSelect={async (date) => {
          const value = format(date, "yyyy-MM-dd");
          const { error } = await supabase
            .from("vehicles")
            .update({ contract_termination_date: value } as any)
            .eq("id", vehicleId);
          if (error) return toast.error(error.message);
          setTerminationDate(value);
          setTerminationOpen(false);
          toast.success("Zapisano datę wypowiedzenia");
        }}
        title="Data wypowiedzenia umowy"
      />
    </div>
  );
}