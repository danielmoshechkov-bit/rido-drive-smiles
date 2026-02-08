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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertTriangle, Link2, Loader2, Search, Plus, Car, Fuel, ChevronDown, X, Check } from "lucide-react";
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
  const [openSelectors, setOpenSelectors] = useState<Record<string, boolean>>({});

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

  // Compact driver selector with popover
  const renderCompactDriverSelector = (
    recordId: string,
    selectedValue: string | undefined,
    onSelect: (id: string, value: string) => void,
    searchKey: string
  ) => {
    const isOpen = openSelectors[searchKey] || false;
    const filteredDrivers = getFilteredDrivers(searchKey);
    const selectedDriver = existingDrivers.find(d => d.id === selectedValue);

    return (
      <div className="flex items-center gap-1.5">
        <Popover 
          open={isOpen} 
          onOpenChange={(open) => setOpenSelectors(prev => ({ ...prev, [searchKey]: open }))}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "w-44 justify-between h-8 text-xs",
                selectedValue && "bg-primary/5 border-primary/30"
              )}
            >
              <span className="truncate">
                {selectedDriver 
                  ? `${selectedDriver.first_name} ${selectedDriver.last_name}` 
                  : "Wybierz kierowcę"
                }
              </span>
              <ChevronDown className="h-3.5 w-3.5 ml-1 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Szukaj..."
                  className="h-8 text-sm pl-7"
                  value={searchQueries[searchKey] || ""}
                  onChange={(e) => setSearchQueries(prev => ({ ...prev, [searchKey]: e.target.value }))}
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredDrivers.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  Nie znaleziono kierowców
                </div>
              ) : (
                filteredDrivers.map(driver => (
                  <div
                    key={driver.id}
                    className={cn(
                      "px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 flex items-center gap-2",
                      selectedValue === driver.id && "bg-primary/10"
                    )}
                    onClick={() => {
                      onSelect(recordId, driver.id);
                      setOpenSelectors(prev => ({ ...prev, [searchKey]: false }));
                      setSearchQueries(prev => ({ ...prev, [searchKey]: "" }));
                    }}
                  >
                    {selectedValue === driver.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    <span className="truncate">
                      {driver.first_name} {driver.last_name}
                    </span>
                    {driver.phone && (
                      <span className="text-muted-foreground text-xs ml-auto shrink-0">
                        {driver.phone}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
        
        {/* Plus button for new driver */}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => {
            toast.info("Funkcja dodawania nowego kierowcy - użyj modułu Kierowcy");
          }}
          title="Dodaj nowego kierowcę"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        
        {/* Clear button */}
        {selectedValue && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onSelect(recordId, "_clear")}
            title="Wyczyść wybór"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  };

  const renderPlatformList = (drivers: UnmappedDriver[], platform: string) => {
    if (drivers.length === 0) {
      return (
        <div className="py-8 text-center text-muted-foreground">
          Brak nowych rekordów dla tej platformy
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {drivers.map(driver => {
          const platformId = platform === "uber" ? driver.uber_id :
                            platform === "bolt" ? driver.bolt_id :
                            driver.freenow_id;
          
          return (
            <div 
              key={driver.id} 
              className="flex items-center gap-3 py-2 px-3 border rounded-md bg-muted/20"
            >
              <div className="w-36 shrink-0">
                <span className="font-medium text-sm truncate block">
                  {driver.full_name || "Nieznany"}
                </span>
              </div>
              <Badge variant="outline" className="font-mono text-xs shrink-0 max-w-32">
                <span className="truncate">
                  {platformId ? (platformId.length > 12 ? `${platformId.slice(0, 12)}...` : platformId) : "-"}
                </span>
              </Badge>
              {platform === "bolt" && (driver.phone || driver.email) && (
                <span className="text-xs text-muted-foreground truncate max-w-24">
                  {driver.phone || driver.email}
                </span>
              )}
              <div className="ml-auto">
                {renderCompactDriverSelector(
                  driver.id,
                  mappings[driver.id],
                  handleMapping,
                  `${platform}-${driver.id}`
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderFuelList = () => {
    if (unmappedFuelCards.length === 0) {
      return (
        <div className="py-8 text-center text-muted-foreground">
          Wszystkie karty paliwowe są przypisane
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {unmappedFuelCards.map(card => (
          <div 
            key={card.card_number} 
            className="flex items-center gap-3 py-2 px-3 border rounded-md bg-muted/20"
          >
            <div className="w-36 shrink-0">
              <span className="font-medium text-sm tabular-nums">
                {formatCardNumber(card.card_number)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground shrink-0">
              <span className="tabular-nums">{card.transaction_count}</span> transakcji
            </div>
            <div className="text-sm font-medium tabular-nums shrink-0">
              {card.total_amount.toFixed(2)} zł
            </div>
            <div className="ml-auto">
              {renderCompactDriverSelector(
                card.card_number,
                fuelMappings[card.card_number],
                handleFuelMapping,
                `fuel-${card.card_number}`
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const totalNewRecords = uberDrivers.length + boltDrivers.length + freenowDrivers.length + unmappedFuelCards.length;
  const totalMappingsCount = Object.keys(mappings).length + Object.keys(fuelMappings).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
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
              <TabsTrigger value="uber" className="flex items-center gap-1.5 text-xs">
                <Car className="h-3.5 w-3.5" />
                Uber
                {uberDrivers.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{uberDrivers.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="bolt" className="flex items-center gap-1.5 text-xs">
                <Car className="h-3.5 w-3.5" />
                Bolt
                {boltDrivers.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{boltDrivers.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="freenow" className="flex items-center gap-1.5 text-xs">
                <Car className="h-3.5 w-3.5" />
                FreeNow
                {freenowDrivers.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{freenowDrivers.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="fuel" className="flex items-center gap-1.5 text-xs">
                <Fuel className="h-3.5 w-3.5" />
                Paliwo
                {unmappedFuelCards.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">{unmappedFuelCards.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto mt-4 pr-1">
              <TabsContent value="uber" className="mt-0">
                {renderPlatformList(uberDrivers, "uber")}
              </TabsContent>
              <TabsContent value="bolt" className="mt-0">
                {renderPlatformList(boltDrivers, "bolt")}
              </TabsContent>
              <TabsContent value="freenow" className="mt-0">
                {renderPlatformList(freenowDrivers, "freenow")}
              </TabsContent>
              <TabsContent value="fuel" className="mt-0">
                {renderFuelList()}
              </TabsContent>
            </div>
          </Tabs>
        )}

        <DialogFooter className="gap-2 pt-4 border-t">
          {totalMappingsCount > 0 && (
            <span className="text-sm text-muted-foreground mr-auto">
              Wybrano: {totalMappingsCount} powiązań
            </span>
          )}
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
