import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

interface FleetInvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  fleetId: string;
  availableVehicles: Array<{ id: string; plate: string; brand: string; model: string }>;
}

export function FleetInvitationModal({ isOpen, onClose, onSuccess, fleetId }: FleetInvitationModalProps) {
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
  const [addingDriver, setAddingDriver] = useState(false);

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
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Zaproś kierowcę do floty</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
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
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Anuluj
          </Button>
          <Button 
            onClick={addNewDriver} 
            disabled={addingDriver || !firstName.trim() || !lastName.trim()}
          >
            {addingDriver ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Dodaję...
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                Dodaj kierowcę
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
