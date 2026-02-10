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
  // Drivers without any platform ID (need manual assignment)
  const noPlatformDrivers = unmappedDrivers.filter(d => 
    !d.uber_id && !d.bolt_id && !d.freenow_id
  );

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
      console.log('🔍 FUEL: Fetching all drivers with fuel cards...');
      
      // Get all drivers' fuel card numbers from ALL drivers globally
      const { data: allDrivers, error: driversError } = await supabase
        .from("drivers")
        .select("id, fuel_card_number")
        .not("fuel_card_number", "is", null);

      if (driversError) {
        console.error('Error fetching drivers fuel cards:', driversError);
      }

      // Build comprehensive set for comparison - all possible formats
      const assignedCardsSet = new Set<string>();
      allDrivers?.forEach(d => {
        if (d.fuel_card_number && d.fuel_card_number.trim()) {
          const raw = d.fuel_card_number.trim();
          const normalized = raw.replace(/^0+/, ''); // Remove all leading zeros
          
          // Add ALL possible formats to catch any match
          assignedCardsSet.add(raw);                          // Original: "0010206980198"
          assignedCardsSet.add(normalized);                   // No zeros: "10206980198"
          assignedCardsSet.add('00' + normalized);            // 2 zeros: "0010206980198"
          assignedCardsSet.add('0' + normalized);             // 1 zero: "010206980198"
          assignedCardsSet.add('000' + normalized);           // 3 zeros: "00010206980198"
        }
      });

      console.log('🔍 FUEL: Assigned cards (all formats):', Array.from(assignedCardsSet));

      // Get ALL fuel transactions (last 6 months for better coverage)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const { data: transactions, error: txError } = await supabase
        .from("fuel_transactions")
        .select("card_number, total_amount, transaction_date")
        .gte("transaction_date", sixMonthsAgo.toISOString().split('T')[0]);

      if (txError) {
        console.error('Error fetching fuel transactions:', txError);
        return;
      }

      console.log('🔍 FUEL: Found', transactions?.length || 0, 'transactions in last 6 months');

      // Get unique card numbers from transactions for debugging
      const uniqueCards = [...new Set((transactions || []).map(t => t.card_number).filter(Boolean))];
      console.log('🔍 FUEL: Unique transaction card numbers:', uniqueCards);

      // Group by normalized card number and filter unassigned
      const cardTotals: Record<string, { amount: number; count: number; originalCards: Set<string> }> = {};
      
      (transactions || []).forEach(t => {
        if (!t.card_number || !t.card_number.trim()) return;
        
        const cardRaw = t.card_number.trim();
        const cardNormalized = cardRaw.replace(/^0+/, ''); // Normalize by removing leading zeros
        
        // Check if this card (in ANY format) is assigned to a driver
        const isAssigned = assignedCardsSet.has(cardRaw) || 
                          assignedCardsSet.has(cardNormalized);
        
        console.log(`🔍 FUEL: Card "${cardRaw}" (normalized: "${cardNormalized}"): isAssigned=${isAssigned}`);
        
        if (!isAssigned) {
          // Use normalized as key to group different formats of same card
          if (!cardTotals[cardNormalized]) {
            cardTotals[cardNormalized] = { amount: 0, count: 0, originalCards: new Set() };
          }
          cardTotals[cardNormalized].amount += t.total_amount || 0;
          cardTotals[cardNormalized].count += 1;
          cardTotals[cardNormalized].originalCards.add(cardRaw);
        }
      });

      // Convert to array, using original card number format for display
      const unassigned = Object.entries(cardTotals).map(([normalizedCard, data]) => {
        // Use one of the original card formats for display (first one found)
        const displayCard = data.originalCards.values().next().value || normalizedCard;
        return {
          card_number: displayCard,
          total_amount: data.amount,
          transaction_count: data.count
        };
      });

      console.log('🔍 FUEL: FINAL Unassigned cards:', unassigned);
      setUnmappedFuelCards(unassigned);
    } catch (err) {
      console.error("Error fetching unmapped fuel cards:", err);
    }
  };

  // Helper to mark unmapped record as resolved
  const resolveUnmappedRecord = async (unmappedId: string, linkedDriverId: string) => {
    await supabase
      .from('unmapped_settlement_drivers')
      .update({
        linked_driver_id: linkedDriverId,
        status: 'resolved',
        resolved_at: new Date().toISOString()
      })
      .eq('id', unmappedId);
  };

  // Function to add a new driver with platform ID
  const handleAddNewDriver = async (unmappedDriver: UnmappedDriver, platform: string) => {
    try {
      // Check if driver with this platform ID already exists
      const platformId = platform === 'uber' ? unmappedDriver.uber_id :
                         platform === 'bolt' ? unmappedDriver.bolt_id :
                         platform === 'freenow' ? unmappedDriver.freenow_id : null;
      
      if (platformId) {
        // Check if this platform ID exists anywhere (including other fleets)
        // Fetch FULL driver data including all platform IDs for complete transfer
        const { data: existingPlatformId } = await supabase
          .from('driver_platform_ids')
          .select(`
            driver_id, 
            drivers!inner(
              id, first_name, last_name, fleet_id, 
              phone, email, fuel_card_number, fuel_card_pin,
              iban, payment_method, billing_method, getrido_id
            )
          `)
          .eq('platform', platform)
          .eq('platform_id', platformId)
          .maybeSingle();
        
        if (existingPlatformId?.driver_id) {
          const existingDriver = existingPlatformId.drivers as any;
          
          // If driver already belongs to THIS fleet, just map them
          if (existingDriver.fleet_id === fleetId) {
            await resolveUnmappedRecord(unmappedDriver.id, existingPlatformId.driver_id);
            await fetchExistingDrivers();
            handleMapping(unmappedDriver.id, existingPlatformId.driver_id);
            toast.success(`Kierowca ${existingDriver.first_name} ${existingDriver.last_name} już jest w Twojej flocie - przypisano.`);
            return;
          }
          
          // Driver exists in ANOTHER fleet - transfer them to this fleet!
          // All driver data (phone, email, platform IDs, fuel cards) is PRESERVED
          // because we're only changing fleet_id - driver record and all related data stays intact
          console.log(`🔄 Transferring driver ${existingPlatformId.driver_id} from fleet ${existingDriver.fleet_id} to ${fleetId}`);
          console.log(`📋 Driver data preserved: phone=${existingDriver.phone}, email=${existingDriver.email}, fuel_card=${existingDriver.fuel_card_number}`);
          
          // Update driver's fleet_id to transfer them (all other data is preserved automatically)
          const { error: transferError } = await supabase
            .from('drivers')
            .update({ fleet_id: fleetId })
            .eq('id', existingPlatformId.driver_id);
          
          if (transferError) {
            console.error('Error transferring driver:', transferError);
            toast.error('Błąd podczas przenoszenia kierowcy');
            return;
          }
          
          // Fetch all platform IDs this driver has (to show in toast)
          const { data: allPlatformIds } = await supabase
            .from('driver_platform_ids')
            .select('platform, platform_id')
            .eq('driver_id', existingPlatformId.driver_id);
          
          const platformsInfo = allPlatformIds?.map(p => p.platform).join(', ') || platform;
          
          // Refresh existing drivers list
          await fetchExistingDrivers();
          
           // Map the unmapped record to the transferred driver
          await resolveUnmappedRecord(unmappedDriver.id, existingPlatformId.driver_id);
          handleMapping(unmappedDriver.id, existingPlatformId.driver_id);
          
          toast.success(
            `Przeniesiono kierowcę ${existingDriver.first_name} ${existingDriver.last_name} do Twojej floty!`,
            { description: `Platformy: ${platformsInfo}. Dane kontaktowe i karty paliwowe zachowane.` }
          );
          return;
        }
      }

      // Extract first and last name from full_name
      const nameParts = (unmappedDriver.full_name || 'Nieznany').split(' ');
      const firstName = nameParts[0] || 'Nieznany';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Check if driver with same name already exists in fleet
      const { data: existingDriverByName } = await supabase
        .from('drivers')
        .select('id')
        .eq('fleet_id', fleetId)
        .ilike('first_name', firstName)
        .ilike('last_name', lastName)
        .maybeSingle();

      if (existingDriverByName) {
        // Link platform ID to existing driver instead of creating new
        if (platformId) {
          await supabase
            .from('driver_platform_ids')
            .upsert({
              driver_id: existingDriverByName.id,
              platform: platform,
              platform_id: platformId,
            }, { onConflict: 'driver_id,platform' });
        }
        
        await resolveUnmappedRecord(unmappedDriver.id, existingDriverByName.id);
        await fetchExistingDrivers();
        handleMapping(unmappedDriver.id, existingDriverByName.id);
        toast.success(`Przypisano platformę do istniejącego kierowcy: ${firstName} ${lastName}`);
        return;
      }

      // Get city_id from first driver in fleet (fallback)
      const { data: firstDriver } = await supabase
        .from('drivers')
        .select('city_id')
        .eq('fleet_id', fleetId)
        .limit(1)
        .maybeSingle();

      // Create new driver
      const { data: newDriver, error: driverError } = await supabase
        .from('drivers')
        .insert({
          first_name: firstName,
          last_name: lastName,
          fleet_id: fleetId,
          city_id: firstDriver?.city_id || 'f6ecca60-ca80-4227-8409-8a44f5d342fd',
          phone: unmappedDriver.phone,
          email: unmappedDriver.email,
        })
        .select('id')
        .single();

      if (driverError) throw driverError;

      // Add platform ID
      if (platformId && newDriver) {
        await supabase
          .from('driver_platform_ids')
          .insert({
            driver_id: newDriver.id,
            platform: platform,
            platform_id: platformId,
          });
      }

      // Create driver_app_users entry
      if (newDriver) {
        await supabase
          .from('driver_app_users')
          .insert({
            driver_id: newDriver.id,
            user_id: newDriver.id, // Use driver_id as placeholder
          });
      }

      // Mark unmapped record as resolved immediately
      await supabase
        .from('unmapped_settlement_drivers')
        .update({
          linked_driver_id: newDriver.id,
          status: 'resolved',
          resolved_at: new Date().toISOString()
        })
        .eq('id', unmappedDriver.id);

      // Refresh existing drivers list
      await fetchExistingDrivers();
      
      // Auto-select the new driver
      handleMapping(unmappedDriver.id, newDriver.id);
      
      toast.success(`Dodano kierowcę: ${firstName} ${lastName}`);
    } catch (err) {
      console.error('Error adding new driver:', err);
      toast.error('Błąd dodawania kierowcy');
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

        // CRITICAL: Create or update driver_app_users entry so driver is no longer "new"
        // First check if entry already exists
        const { data: existingDau } = await supabase
          .from("driver_app_users")
          .select("id")
          .eq("driver_id", existingDriverId)
          .maybeSingle();

        if (!existingDau) {
          // Create a placeholder entry
          await supabase
            .from("driver_app_users")
            .insert({
              driver_id: existingDriverId,
              user_id: existingDriverId, // Use driver_id as placeholder until real user registers
            });
        }

        // Handle auto-created driver records (from unmapped ID with "auto-" prefix)
        if (unmappedId.startsWith('auto-')) {
          const autoDriverId = unmappedId.replace('auto-', '');
          
          if (autoDriverId !== existingDriverId) {
            // Transfer settlements from auto-created driver to real driver
            await supabase
              .from("settlements")
              .update({ driver_id: existingDriverId })
              .eq("driver_id", autoDriverId);
            
            // Transfer platform IDs
            await supabase
              .from("driver_platform_ids")
              .update({ driver_id: existingDriverId })
              .eq("driver_id", autoDriverId);
            
            // Delete the auto-created driver record
            await supabase.from("driver_app_users").delete().eq("driver_id", autoDriverId);
            await supabase.from("drivers").delete().eq("id", autoDriverId);
          }
        } else {
          // Regular unmapped_settlement_drivers record
          await supabase
            .from("unmapped_settlement_drivers")
            .update({
              linked_driver_id: existingDriverId,
              status: "resolved",
              resolved_at: new Date().toISOString()
            })
            .eq("id", unmappedId);
        }
      }

      // Process fuel card mappings - normalize card number before saving
      for (const [cardNumber, driverId] of Object.entries(fuelMappings)) {
        if (driverId === "_new") continue;

        // Normalize card number by removing leading zeros for storage
        const normalizedCardNumber = cardNumber.replace(/^0+/, '');
        
        await supabase
          .from("drivers")
          .update({ fuel_card_number: normalizedCardNumber })
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
    searchKey: string,
    unmappedDriver?: UnmappedDriver,
    platform?: string
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
        
        {/* Plus button for new driver - adds driver to database with platform ID */}
        {unmappedDriver && platform && (
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0 hover:bg-primary/10 hover:border-primary/50"
            onClick={() => handleAddNewDriver(unmappedDriver, platform)}
            title={`Dodaj "${unmappedDriver.full_name}" jako nowego kierowcę`}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
        
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
                  `${platform}-${driver.id}`,
                  driver,
                  platform
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

  const totalNewRecords = uberDrivers.length + boltDrivers.length + freenowDrivers.length + noPlatformDrivers.length + unmappedFuelCards.length;
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
          <Tabs defaultValue={noPlatformDrivers.length > 0 ? "no_platform" : "uber"} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="no_platform" className="flex items-center gap-1.5 text-xs">
                <Car className="h-3.5 w-3.5" />
                Bez platformy
                {noPlatformDrivers.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">{noPlatformDrivers.length}</Badge>
                )}
              </TabsTrigger>
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
              <TabsContent value="no_platform" className="mt-0">
                {noPlatformDrivers.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    Brak kierowców bez przypisanej platformy
                  </div>
                ) : (
                  <div className="space-y-2">
                    {noPlatformDrivers.map(driver => (
                      <div 
                        key={driver.id} 
                        className="flex items-center gap-3 py-2 px-3 border rounded-md bg-muted/20"
                      >
                        <div className="w-36 shrink-0">
                          <span className="font-medium text-sm truncate block">
                            {driver.full_name || "Nieznany"}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0 bg-amber-50 text-amber-700 border-amber-200">
                          Bez platformy
                        </Badge>
                        {driver.phone && (
                          <span className="text-xs text-muted-foreground truncate max-w-24">
                            {driver.phone}
                          </span>
                        )}
                        <div className="ml-auto">
                          {renderCompactDriverSelector(
                            driver.id,
                            mappings[driver.id],
                            handleMapping,
                            `no_platform-${driver.id}`,
                            driver,
                            "no_platform"
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
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
