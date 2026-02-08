import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

interface FuelCardAssignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardNumber: string;
  fleetId: string;
  onComplete: () => void;
}

interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string;
  fuel_card_number?: string;
}

export function FuelCardAssignModal({
  open,
  onOpenChange,
  cardNumber,
  fleetId,
  onComplete,
}: FuelCardAssignModalProps) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  useEffect(() => {
    if (open && fleetId) {
      fetchDrivers();
    }
  }, [open, fleetId]);

  const fetchDrivers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, first_name, last_name, phone, fuel_card_number")
        .eq("fleet_id", fleetId)
        .order("last_name");

      if (error) throw error;
      setDrivers(data || []);
    } catch (err) {
      console.error("Error fetching drivers:", err);
      toast.error("Błąd pobierania listy kierowców");
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedDriverId) {
      toast.error("Wybierz kierowcę");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("drivers")
        .update({ fuel_card_number: cardNumber })
        .eq("id", selectedDriverId);

      if (error) throw error;

      toast.success("Karta paliwowa została przypisana");
      onComplete();
      onOpenChange(false);
    } catch (err) {
      console.error("Error assigning fuel card:", err);
      toast.error("Błąd przypisania karty");
    } finally {
      setSaving(false);
    }
  };

  const filteredDrivers = drivers.filter((driver) => {
    const fullName = `${driver.first_name} ${driver.last_name}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const selectedDriver = drivers.find((d) => d.id === selectedDriverId);

  // Format card number in readable chunks
  const formatCardNumber = (num: string) => {
    return num.replace(/(\d{4})/g, '$1 ').trim();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Przypisz kartę paliwową
          </DialogTitle>
          <DialogDescription>
            Przypisz kartę <span className="font-mono tabular-nums text-foreground">{formatCardNumber(cardNumber)}</span> do kierowcy
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Wyszukaj kierowcę</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Wpisz imię lub nazwisko..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="border rounded-md max-h-60 overflow-y-auto">
              {filteredDrivers.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Nie znaleziono kierowców
                </div>
              ) : (
                <div className="divide-y">
                  {filteredDrivers.map((driver) => (
                    <div
                      key={driver.id}
                      className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                        selectedDriverId === driver.id ? "bg-primary/10 border-l-2 border-primary" : ""
                      }`}
                      onClick={() => setSelectedDriverId(driver.id)}
                    >
                      <div className="font-medium">
                        {driver.first_name} {driver.last_name}
                      </div>
                      {driver.phone && (
                        <div className="text-sm text-muted-foreground">{driver.phone}</div>
                      )}
                      {driver.fuel_card_number && (
                        <div className="text-xs text-amber-600 mt-1">
                          Aktualna karta: {formatCardNumber(driver.fuel_card_number)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedDriver && (
              <div className="p-3 bg-primary/5 rounded-md border border-primary/20">
                <div className="text-sm text-muted-foreground">Wybrany kierowca:</div>
                <div className="font-semibold text-primary">
                  {selectedDriver.first_name} {selectedDriver.last_name}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={handleAssign} disabled={saving || !selectedDriverId}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Zapisuję...
              </>
            ) : (
              "Przypisz kartę"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
