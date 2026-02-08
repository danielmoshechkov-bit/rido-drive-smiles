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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Link2, Loader2, Search, UserPlus, Car, Fuel } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface UnmappedDriver {
  id: string;
  full_name: string;
  uber_id?: string;
  bolt_id?: string;
  freenow_id?: string;
  phone?: string;
  email?: string;
  platform?: string;
}

interface ExistingDriver {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
}

interface UnmappedFuelCard {
  card_number: string;
  total_amount: number;
  transaction_count: number;
}

interface UnmappedDriversModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unmappedDrivers: UnmappedDriver[];
  fleetId: string;
  onComplete: () => void;
}

export function UnmappedDriversModal({
  open,
  onOpenChange,
  unmappedDrivers,
  fleetId,
  onComplete,
}: UnmappedDriversModalProps) {
  const [existingDrivers, setExistingDrivers] = useState<ExistingDriver[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [fuelMappings, setFuelMappings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [unmappedFuelCards, setUnmappedFuelCards] = useState<UnmappedFuelCard[]>([]);

  // Filter drivers by platform
  const uberDrivers = unmappedDrivers.filter(d => d.uber_id);
  const boltDrivers = unmappedDrivers.filter(d => d.bolt_id);
  const freenowDrivers = unmappedDrivers.filter(d => d.freenow_id);

  useEffect(() => {
    if (open && fleetId) {
      fetchExistingDrivers();
      fetchUnmappedFuelCards();
    }
  }, [open, fleetId]);

  const fetchExistingDrivers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, first_name, last_name, phone")
        .eq("fleet_id", fleetId)
        .order("last_name");

      if (error) throw error;
      setExistingDrivers(data || []);
    } catch (err) {
      console.error("Error fetching drivers:", err);
      toast.error("Błąd pobierania listy kierowców");
    } finally {
      setLoading(false);
    }
  };

  const fetchUnmappedFuelCards = async () => {
    try {
      // Get all drivers' fuel card numbers
      const { data: drivers } = await supabase
        .from("drivers")
        .select("fuel_card_number")
        .eq("fleet_id", fleetId)
        .not("fuel_card_number", "is", null);

      const assignedCards = new Set<string>();
      drivers?.forEach(d => {
        if (d.fuel_card_number) {
          assignedCards.add(d.fuel_card_number);
          assignedCards.add(d.fuel_card_number.replace(/^0+/, ''));
          assignedCards.add('0' + d.fuel_card_number);
          assignedCards.add('00' + d.fuel_card_number);
        }
      });

      // Get recent fuel transactions
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      const { data: transactions } = await supabase
        .from("fuel_transactions")
        .select("card_number, total_amount")
        .gte("transaction_date", lastMonth.toISOString().split('T')[0]);

      // Group by card and filter unassigned
      const cardTotals: Record<string, { amount: number; count: number }> = {};
      transactions?.forEach(t => {
        const normalized = t.card_number.replace(/^0+/, '');
        const isAssigned = assignedCards.has(t.card_number) || 
                          assignedCards.has(normalized) ||
                          assignedCards.has('0' + t.card_number);
        
        if (!isAssigned) {
          if (!cardTotals[t.card_number]) {
            cardTotals[t.card_number] = { amount: 0, count: 0 };
          }
          cardTotals[t.card_number].amount += t.total_amount || 0;
          cardTotals[t.card_number].count += 1;
        }
      });

      const unassigned = Object.entries(cardTotals).map(([card, data]) => ({
        card_number: card,
        total_amount: data.amount,
        transaction_count: data.count
      }));

      setUnmappedFuelCards(unassigned);
    } catch (err) {
      console.error("Error fetching unmapped fuel cards:", err);
    }
  };

  const handleMapping = (unmappedId: string, existingDriverId: string) => {
    if (existingDriverId === "_clear") {
      const newMappings = { ...mappings };
      delete newMappings[unmappedId];
      setMappings(newMappings);
    } else {
      setMappings(prev => ({
        ...prev,
        [unmappedId]: existingDriverId,
      }));
    }
  };

  const handleFuelMapping = (cardNumber: string, driverId: string) => {
    if (driverId === "_clear") {
      const newMappings = { ...fuelMappings };
      delete newMappings[cardNumber];
      setFuelMappings(newMappings);
    } else {
      setFuelMappings(prev => ({
        ...prev,
        [cardNumber]: driverId,
      }));
    }
  };

  const handleSave = async () => {
    const totalMappings = Object.keys(mappings).length + Object.keys(fuelMappings).length;
    
    if (totalMappings === 0) {
      toast.info("Nie wybrano żadnych powiązań");
      onComplete();
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      // Process platform driver mappings
      for (const [unmappedId, existingDriverId] of Object.entries(mappings)) {
        if (existingDriverId === "_new") continue;

        const unmapped = unmappedDrivers.find(d => d.id === unmappedId);
        if (!unmapped) continue;

        // Add platform IDs to the existing driver
        const platformIds = [];
        if (unmapped.uber_id) {
          platformIds.push({ driver_id: existingDriverId, platform: "uber", platform_id: unmapped.uber_id });
        }
        if (unmapped.bolt_id) {
          platformIds.push({ driver_id: existingDriverId, platform: "bolt", platform_id: unmapped.bolt_id });
        }
        if (unmapped.freenow_id) {
          platformIds.push({ driver_id: existingDriverId, platform: "freenow", platform_id: unmapped.freenow_id });
        }

        if (platformIds.length > 0) {
          const { error: pidError } = await supabase
            .from("driver_platform_ids")
            .upsert(platformIds, { onConflict: "driver_id,platform" });

          if (pidError) {
            console.error("Error upserting platform IDs:", pidError);
          }
        }

        // Update settlements to point to the correct driver
        // First find what driver_id was auto-created for this unmapped record
        const { data: autoDriver } = await supabase
          .from("drivers")
          .select("id")
          .eq("fleet_id", fleetId)
          .or(`first_name.ilike.%${unmapped.full_name?.split(' ')[0]}%`)
          .single();

        if (autoDriver && autoDriver.id !== existingDriverId) {
          // Transfer settlements from auto-created driver to real driver
          await supabase
            .from("settlements")
            .update({ driver_id: existingDriverId })
            .eq("driver_id", autoDriver.id);
        }

        // Mark unmapped driver as resolved
        await supabase
          .from("unmapped_settlement_drivers")
          .update({
            linked_driver_id: existingDriverId,
            status: "resolved",
            resolved_at: new Date().toISOString()
          })
          .eq("id", unmappedId);
      }

      // Process fuel card mappings
      for (const [cardNumber, driverId] of Object.entries(fuelMappings)) {
        if (driverId === "_new") continue;

        await supabase
          .from("drivers")
          .update({ fuel_card_number: cardNumber })
          .eq("id", driverId);
      }

      toast.success(`Powiązano ${totalMappings} rekordów`);
      onComplete();
      onOpenChange(false);
    } catch (err) {
      console.error("Error saving mappings:", err);
      toast.error("Błąd zapisu powiązań");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    toast.info("Pominięto mapowanie nowych rekordów");
    onComplete();
    onOpenChange(false);
  };

  const getFilteredDrivers = (searchKey: string) => {
    const query = searchQueries[searchKey]?.toLowerCase() || "";
    if (!query) return existingDrivers;
    return existingDrivers.filter(d => {
      const fullName = `${d.first_name} ${d.last_name}`.toLowerCase();
      const phone = d.phone?.toLowerCase() || "";
      return fullName.includes(query) || phone.includes(query);
    });
  };

  const formatCardNumber = (num: string) => {
    return num.replace(/(\d{4})/g, '$1 ').trim();
  };

  const renderDriverSelector = (
    record: UnmappedDriver | UnmappedFuelCard,
    recordId: string,
    selectedValue: string | undefined,
    onSelect: (id: string, value: string) => void,
    searchKey: string
  ) => {
    const filteredDrivers = getFilteredDrivers(searchKey);
    
    return (
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Szukaj kierowcy..."
            className="pl-8 h-8 text-sm"
            value={searchQueries[searchKey] || ""}
            onChange={(e) => setSearchQueries(prev => ({ ...prev, [searchKey]: e.target.value }))}
          />
        </div>
        <div className="border rounded-md max-h-32 overflow-y-auto">
          <div
            className={cn(
              "px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 flex items-center gap-2",
              !selectedValue && "bg-muted/30"
            )}
            onClick={() => onSelect(recordId, "_clear")}
          >
            <span className="text-muted-foreground">— Nie wybrano —</span>
          </div>
          {filteredDrivers.map(driver => (
            <div
              key={driver.id}
              className={cn(
                "px-3 py-2 text-sm cursor-pointer hover:bg-muted/50",
                selectedValue === driver.id && "bg-primary/10 font-medium"
              )}
              onClick={() => onSelect(recordId, driver.id)}
            >
              {driver.first_name} {driver.last_name}
              {driver.phone && (
                <span className="text-muted-foreground ml-1">({driver.phone})</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPlatformTable = (drivers: UnmappedDriver[], platform: string) => {
    if (drivers.length === 0) {
      return (
        <div className="py-8 text-center text-muted-foreground">
          Brak nowych rekordów dla tej platformy
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Imię i nazwisko</TableHead>
            <TableHead>ID platformy</TableHead>
            {platform === "bolt" && <TableHead>Telefon / Email</TableHead>}
            <TableHead className="w-[280px]">Przypisz do kierowcy</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {drivers.map(driver => {
            const platformId = platform === "uber" ? driver.uber_id :
                              platform === "bolt" ? driver.bolt_id :
                              driver.freenow_id;
            
            return (
              <TableRow key={driver.id}>
                <TableCell className="font-medium">
                  {driver.full_name || "Nieznany"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-xs">
                    {platformId ? (platformId.length > 16 ? `${platformId.slice(0, 16)}...` : platformId) : "-"}
                  </Badge>
                </TableCell>
                {platform === "bolt" && (
                  <TableCell className="text-sm text-muted-foreground">
                    {driver.phone || driver.email || "-"}
                  </TableCell>
                )}
                <TableCell>
                  {renderDriverSelector(
                    driver,
                    driver.id,
                    mappings[driver.id],
                    handleMapping,
                    `${platform}-${driver.id}`
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  const renderFuelTable = () => {
    if (unmappedFuelCards.length === 0) {
      return (
        <div className="py-8 text-center text-muted-foreground">
          Wszystkie karty paliwowe są przypisane
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Numer karty</TableHead>
            <TableHead className="text-right">Transakcje</TableHead>
            <TableHead className="text-right">Kwota</TableHead>
            <TableHead className="w-[280px]">Przypisz do kierowcy</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {unmappedFuelCards.map(card => (
            <TableRow key={card.card_number}>
              <TableCell className="font-mono tabular-nums">
                {formatCardNumber(card.card_number)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {card.transaction_count}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {card.total_amount.toFixed(2)} zł
              </TableCell>
              <TableCell>
                {renderDriverSelector(
                  card,
                  card.card_number,
                  fuelMappings[card.card_number],
                  handleFuelMapping,
                  `fuel-${card.card_number}`
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  const totalNewRecords = uberDrivers.length + boltDrivers.length + freenowDrivers.length + unmappedFuelCards.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Nowe rekordy do przypisania
          </DialogTitle>
          <DialogDescription>
            Znaleziono {totalNewRecords} rekordów, które nie są przypisane do kierowców w systemie.
            Możesz je powiązać z istniejącymi kierowcami lub pozostawić na później.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="uber" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="uber" className="flex items-center gap-2">
                <Car className="h-4 w-4" />
                Uber
                {uberDrivers.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{uberDrivers.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="bolt" className="flex items-center gap-2">
                <Car className="h-4 w-4" />
                Bolt
                {boltDrivers.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{boltDrivers.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="freenow" className="flex items-center gap-2">
                <Car className="h-4 w-4" />
                FreeNow
                {freenowDrivers.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{freenowDrivers.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="fuel" className="flex items-center gap-2">
                <Fuel className="h-4 w-4" />
                Paliwo
                {unmappedFuelCards.length > 0 && (
                  <Badge variant="destructive" className="ml-1">{unmappedFuelCards.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto mt-4">
              <TabsContent value="uber" className="mt-0">
                {renderPlatformTable(uberDrivers, "uber")}
              </TabsContent>
              <TabsContent value="bolt" className="mt-0">
                {renderPlatformTable(boltDrivers, "bolt")}
              </TabsContent>
              <TabsContent value="freenow" className="mt-0">
                {renderPlatformTable(freenowDrivers, "freenow")}
              </TabsContent>
              <TabsContent value="fuel" className="mt-0">
                {renderFuelTable()}
              </TabsContent>
            </div>
          </Tabs>
        )}

        <DialogFooter className="gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleSkip}>
            Pomiń
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Zapisuję...
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4 mr-2" />
                Zapisz powiązania
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
