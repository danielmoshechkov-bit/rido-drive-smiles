import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Loader2, CheckCircle2, UserPlus } from "lucide-react";

interface Vehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
}

interface Driver {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  getrido_id: string | null;
  driver_platform_ids?: Array<{ platform: string; platform_id: string }>;
}

interface FleetInvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  fleetId: string;
  availableVehicles: Vehicle[];
}

export function FleetInvitationModal({ isOpen, onClose, onSuccess, fleetId, availableVehicles }: FleetInvitationModalProps) {
  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [getridoId, setGetridoId] = useState("");
  const [uberId, setUberId] = useState("");
  const [boltId, setBoltId] = useState("");
  const [freenowId, setFreenowId] = useState("");
  const [iban, setIban] = useState("");
  
  // Search results
  const [foundDrivers, setFoundDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [addingDriver, setAddingDriver] = useState(false);

  const searchDrivers = async () => {
    // Validate required fields
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Imię i nazwisko są wymagane");
      return;
    }

    // At least one contact/ID field
    if (!email.trim() && !phone.trim() && !getridoId.trim() && !uberId.trim() && !boltId.trim() && !freenowId.trim()) {
      toast.error("Podaj przynajmniej jeden kontakt lub ID platformy");
      return;
    }

    setSearching(true);
    setSearchPerformed(true);
    try {
      // Send separate fields to edge function
      const { data, error } = await supabase.functions.invoke("drivers-search", {
        body: { 
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          getrido_id: getridoId.trim() || undefined,
          uber_id: uberId.trim() || undefined,
          bolt_id: boltId.trim() || undefined,
          freenow_id: freenowId.trim() || undefined
        }
      });

      if (error) throw error;

      const drivers = data?.drivers || [];
      
      // Map platform_ids to driver_platform_ids for compatibility
      const driversFormatted = drivers.map((d: any) => ({
        ...d,
        driver_platform_ids: d.platform_ids || []
      }));
      
      setFoundDrivers(driversFormatted);
      
      if (driversFormatted.length > 0) {
        toast.success(`Znaleziono ${driversFormatted.length} kierowców`);
      } else {
        toast.info("Nie znaleziono kierowców pasujących do kryteriów");
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Błąd podczas wyszukiwania");
    } finally {
      setSearching(false);
    }
  };

  const addNewDriver = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Imię i nazwisko są wymagane");
      return;
    }

    setAddingDriver(true);
    try {
      // Get default city - fleets don't have city_id, so we get the first available city
      const { data: cities } = await supabase
        .from('cities')
        .select('id')
        .limit(1)
        .single();
      
      let cityId = cities?.id;
      
      if (!cityId) {
        // Fallback: check if there are drivers with city in this fleet
        const { data: existingDriver } = await supabase
          .from('drivers')
          .select('city_id')
          .eq('fleet_id', fleetId)
          .not('city_id', 'is', null)
          .limit(1)
          .single();
        cityId = existingDriver?.city_id || null;
      }

      if (!cityId) {
        toast.error("Brak skonfigurowanego miasta w systemie");
        setAddingDriver(false);
        return;
      }

      // Create driver
      const { data: newDriver, error: driverError } = await supabase
        .from('drivers')
        .insert({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          getrido_id: getridoId.trim() || null,
          iban: iban.trim() || null,
          fleet_id: fleetId,
          city_id: cityId,
        })
        .select('id')
        .single();

      if (driverError) throw driverError;

      // Add platform IDs
      const platformIds: { driver_id: string; platform: string; platform_id: string }[] = [];
      if (uberId.trim()) platformIds.push({ driver_id: newDriver.id, platform: 'uber', platform_id: uberId.trim() });
      if (boltId.trim()) platformIds.push({ driver_id: newDriver.id, platform: 'bolt', platform_id: boltId.trim() });
      if (freenowId.trim()) platformIds.push({ driver_id: newDriver.id, platform: 'freenow', platform_id: freenowId.trim() });

      if (platformIds.length > 0) {
        await supabase.from('driver_platform_ids').insert(platformIds);
      }

      // Create fleet relation
      await supabase
        .from('driver_fleet_relations')
        .insert({
          driver_id: newDriver.id,
          fleet_id: fleetId,
          relation_type: 'both',
          is_active: true,
        });

      toast.success(`Dodano kierowcę: ${firstName} ${lastName}`);
      handleClose();
      onSuccess();
    } catch (error: any) {
      console.error("Error adding driver:", error);
      toast.error("Błąd podczas dodawania kierowcy: " + error.message);
    } finally {
      setAddingDriver(false);
    }
  };

  const sendInvitation = async () => {
    if (!selectedDriver) {
      toast.error("Wybierz kierowcę");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("fleet-invitations/send", {
        body: {
          driver_id: selectedDriver.id,
          fleet_id: fleetId,
          vehicle_id: selectedVehicleId || null
        }
      });

      if (error) throw error;

      toast.success("Wysłano zaproszenie do kierowcy");
      handleClose();
      onSuccess();
    } catch (error: any) {
      console.error("Error sending invitation:", error);
      toast.error("Błąd wysyłania zaproszenia: " + error.message);
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setGetridoId("");
    setUberId("");
    setBoltId("");
    setFreenowId("");
    setIban("");
    setFoundDrivers([]);
    setSelectedDriver(null);
    setSelectedVehicleId("");
    setSearchPerformed(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Zaproś kierowcę do floty</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto flex-1 pr-2">
          {/* Personal + Contact Data - 2x2 grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">
                Imię <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                placeholder="Jan"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="lastName">
                Nazwisko <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastName"
                placeholder="Kowalski"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="jan.kowalski@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                placeholder="+48 123 456 789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          {/* Platform IDs with badges */}
          <div className="space-y-4">
            <Label>Identyfikatory platform (opcjonalne)</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* GetRido */}
              <div>
                <Label htmlFor="getridoId" className="text-sm mb-2 block">GetRido ID</Label>
                <Input
                  id="getridoId"
                  placeholder="123456"
                  value={getridoId}
                  onChange={(e) => setGetridoId(e.target.value)}
                />
              </div>
              {/* Uber */}
              <div>
                <Label htmlFor="uberId" className="text-sm mb-2 block">Uber ID</Label>
                <Input
                  id="uberId"
                  placeholder="abc123"
                  value={uberId}
                  onChange={(e) => setUberId(e.target.value)}
                />
              </div>
              {/* Bolt */}
              <div>
                <Label htmlFor="boltId" className="text-sm mb-2 block">Bolt ID</Label>
                <Input
                  id="boltId"
                  placeholder="bolt456"
                  value={boltId}
                  onChange={(e) => setBoltId(e.target.value)}
                />
              </div>
              {/* FreeNow */}
              <div>
                <Label htmlFor="freenowId" className="text-sm mb-2 block">FreeNow ID</Label>
                <Input
                  id="freenowId"
                  placeholder="fn789"
                  value={freenowId}
                  onChange={(e) => setFreenowId(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Bank Account (IBAN) */}
          <div className="space-y-2">
            <Label htmlFor="iban">Numer konta bankowego (IBAN)</Label>
            <Input
              id="iban"
              placeholder="PL00 0000 0000 0000 0000 0000 0000"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">Numer konta do przelewów wypłat dla kierowcy</p>
          </div>

          {/* Search Button */}
          <Button 
            onClick={searchDrivers} 
            disabled={searching}
            className="w-full"
            size="lg"
          >
            {searching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Szukam...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Szukaj
              </>
            )}
          </Button>

          {/* Found Drivers List */}
          {searchPerformed && (
            <div className="space-y-2">
              {foundDrivers.length > 0 ? (
                <>
                  <Label>Znalezieni kierowcy - wybierz jednego:</Label>
                  <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                    {foundDrivers.map((driver) => (
                      <Card
                        key={driver.id}
                        className={`p-4 cursor-pointer transition-all ${
                          selectedDriver?.id === driver.id 
                            ? "border-primary bg-accent shadow-sm" 
                            : "hover:bg-accent/50 border-transparent"
                        }`}
                        onClick={() => setSelectedDriver(driver)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="font-semibold flex items-center gap-2">
                              {driver.first_name} {driver.last_name}
                              {selectedDriver?.id === driver.id && (
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground space-y-0.5">
                              {driver.email && <div>📧 {driver.email}</div>}
                              {driver.phone && <div>📱 {driver.phone}</div>}
                              {driver.getrido_id && <div>🚗 GetRido: {driver.getrido_id}</div>}
                              {driver.driver_platform_ids && driver.driver_platform_ids.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {driver.driver_platform_ids.map((pid: any, idx: number) => (
                                    <span key={idx} className="text-xs bg-secondary px-2 py-0.5 rounded">
                                      {pid.platform}: {pid.platform_id}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-6 text-muted-foreground border rounded-lg space-y-4">
                  <div>
                    <p>Nie znaleziono kierowców pasujących do kryteriów</p>
                    <p className="text-sm mt-2">Sprawdź dane i spróbuj ponownie lub dodaj nowego kierowcę</p>
                  </div>
                  <Button 
                    onClick={addNewDriver} 
                    disabled={addingDriver || !firstName.trim() || !lastName.trim()}
                    variant="default"
                  >
                    {addingDriver ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Dodawanie...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Dodaj nowego kierowcę
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Vehicle Selection */}
          {selectedDriver && (
            <div className="space-y-2">
              <Label>
                Wybierz pojazd <span className="text-muted-foreground">(opcjonalne)</span>
              </Label>
              <Select value={selectedVehicleId || "no-vehicle"} onValueChange={(value) => setSelectedVehicleId(value === "no-vehicle" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Przydziel później..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-vehicle">Bez pojazdu (przydziel później)</SelectItem>
                  {availableVehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.plate} - {vehicle.brand} {vehicle.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t shrink-0">
          <Button variant="outline" onClick={handleClose}>
            Anuluj
          </Button>
          {selectedDriver && (
            <Button onClick={sendInvitation} disabled={sending}>
              {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Wyślij zaproszenie
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
