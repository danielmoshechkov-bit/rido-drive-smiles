import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Loader2 } from "lucide-react";

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
  platform_ids?: Array<{ platform: string; platform_id: string }>;
}

interface FleetInvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  fleetId: string;
  availableVehicles: Vehicle[];
}

export function FleetInvitationModal({ isOpen, onClose, onSuccess, fleetId, availableVehicles }: FleetInvitationModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [foundDrivers, setFoundDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);

  const searchDrivers = async () => {
    if (!searchQuery.trim()) {
      toast.error("Wpisz dane kierowcy do wyszukania");
      return;
    }

    setSearching(true);
    try {
      console.log('Searching for drivers:', searchQuery);
      
      const { data, error } = await supabase.functions.invoke('drivers-search', {
        body: { q: searchQuery }
      });

      if (error) {
        console.error('Search error:', error);
        throw error;
      }

      console.log('Search results:', data);
      setFoundDrivers(data?.drivers || []);
      
      if (!data?.drivers || data.drivers.length === 0) {
        toast.info("Nie znaleziono kierowcy");
      }
    } catch (error: any) {
      console.error('Error searching drivers:', error);
      toast.error("Błąd wyszukiwania: " + error.message);
    } finally {
      setSearching(false);
    }
  };

  const sendInvitation = async () => {
    if (!selectedDriver) {
      toast.error("Wybierz kierowcę");
      return;
    }

    if (!selectedVehicleId) {
      toast.error("Wybierz pojazd");
      return;
    }

    setSending(true);
    try {
      console.log('Sending invitation:', {
        driver_id: selectedDriver.id,
        fleet_id: fleetId,
        vehicle_id: selectedVehicleId
      });

      const { data, error } = await supabase.functions.invoke('fleet-invitations/send', {
        body: {
          driver_id: selectedDriver.id,
          fleet_id: fleetId,
          vehicle_id: selectedVehicleId
        }
      });

      if (error) {
        console.error('Invitation error:', error);
        throw error;
      }

      console.log('Invitation sent:', data);
      toast.success("Wysłano zaproszenie do kierowcy");
      handleClose();
      onSuccess();
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      toast.error("Błąd wysyłania zaproszenia: " + error.message);
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setSearchQuery("");
    setFoundDrivers([]);
    setSelectedDriver(null);
    setSelectedVehicleId("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Zaproś kierowcę do floty</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!selectedDriver ? (
            <>
              <div className="space-y-2">
                <Label>Wyszukaj kierowcę</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Imię, nazwisko, GetRido ID, email, telefon, ID platformy..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchDrivers()}
                  />
                  <Button onClick={searchDrivers} disabled={searching}>
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {foundDrivers.length > 0 && (
                <div className="space-y-2">
                  <Label>Znalezieni kierowcy:</Label>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {foundDrivers.map((driver) => (
                      <div
                        key={driver.id}
                        className="p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => setSelectedDriver(driver)}
                      >
                        <div className="font-medium">
                          {driver.first_name} {driver.last_name}
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          {driver.email && <div>Email: {driver.email}</div>}
                          {driver.phone && <div>Tel: {driver.phone}</div>}
                          {driver.getrido_id && <div>GetRido ID: {driver.getrido_id}</div>}
                          {driver.platform_ids && driver.platform_ids.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-1">
                              {driver.platform_ids.map((pid, idx) => (
                                <span key={idx} className="text-xs bg-secondary px-2 py-1 rounded">
                                  {pid.platform}: {pid.platform_id}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="p-4 border rounded-lg bg-accent/50">
                <Label>Wybrany kierowca:</Label>
                <div className="mt-2 font-medium">
                  {selectedDriver.first_name} {selectedDriver.last_name}
                </div>
                <div className="text-sm text-muted-foreground">
                  {selectedDriver.email && <div>{selectedDriver.email}</div>}
                  {selectedDriver.phone && <div>{selectedDriver.phone}</div>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDriver(null)}
                  className="mt-2"
                >
                  Zmień kierowcę
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Wybierz pojazd</Label>
                <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz pojazd..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVehicles.map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        {vehicle.plate} - {vehicle.brand} {vehicle.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Anuluj
          </Button>
          {selectedDriver && (
            <Button onClick={sendInvitation} disabled={sending || !selectedVehicleId}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Wyślij zaproszenie
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
