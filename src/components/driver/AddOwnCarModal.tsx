import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// AddOwnCarModal — kierowca dodaje swoje auto (bez pola Flota)
export function AddOwnCarModal({
  open,
  onClose,
  driverId,
  onVehicleAdded,
}: {
  open: boolean;
  onClose: () => void;
  driverId: string;
  onVehicleAdded?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [color, setColor] = useState("");
  const [inspValidTo, setInspValidTo] = useState<string>("");
  const [policyValidTo, setPolicyValidTo] = useState<string>("");

  const save = async () => {
    if (!plate || !brand || !model) {
      toast.error("Uzupełnij: nr rejestracyjny, marka, model");
      return;
    }

    if (!driverId) {
      toast.error("Błąd: Brak ID kierowcy. Spróbuj ponownie zalogować się.");
      console.error("AddOwnCarModal: driverId is empty:", driverId);
      return;
    }

    setLoading(true);
    try {
      // Pobierz city_id kierowcy - sprawdź najpierw w drivers, potem w driver_app_users
      let cityId = null;
      
      const { data: driverData } = await supabase
        .from('drivers')
        .select('city_id')
        .eq('id', driverId)
        .maybeSingle();

      if (driverData?.city_id) {
        cityId = driverData.city_id;
      } else {
        // Fallback: sprawdź w driver_app_users
        const { data: appUserData } = await supabase
          .from('driver_app_users')
          .select('city_id')
          .eq('driver_id', driverId)
          .maybeSingle();
        
        cityId = appUserData?.city_id;
      }

      if (!cityId) {
        console.error("AddOwnCarModal: No cityId found for driverId:", driverId);
        toast.error("Nie można określić miasta kierowcy. Spróbuj ponownie zalogować się lub skontaktuj się z administratorem.");
        return;
      }

      // Dodaj pojazd
      const { data: veh, error: vehicleError } = await supabase
        .from("vehicles")
        .insert({
          plate: plate.toUpperCase().trim(),
          vin: vin.toUpperCase().trim() || null,
          brand: brand.trim(),
          model: model.trim(),
          year: year || null,
          color: color || null,
          status: "aktywne",
          city_id: cityId,
          odometer: 0
        })
        .select("id")
        .single();
        
      if (vehicleError || !veh?.id) {
        throw vehicleError || new Error("Nie udało się dodać pojazdu");
      }

      // Automatycznie utwórz rekordy przeglądu i polisy jeśli podano daty
      if (inspValidTo) {
        const { error: inspError } = await supabase
          .from("vehicle_inspections")
          .insert({
            vehicle_id: veh.id,
            date: new Date().toISOString().slice(0, 10),
            valid_to: inspValidTo,
            result: "pozytywny"
          });
        if (inspError) console.warn("Ostrzeżenie: nie zapisano przeglądu:", inspError.message);
      }

      if (policyValidTo) {
        const { error: policyError } = await supabase
          .from("vehicle_policies")
          .insert({
            vehicle_id: veh.id,
            type: "OC",
            policy_no: "TBA",
            provider: "TBA",
            valid_from: new Date().toISOString().slice(0, 10),
            valid_to: policyValidTo
          });
        if (policyError) console.warn("Ostrzeżenie: nie zapisano polisy:", policyError.message);
      }

      // Automatyczne przypisanie do kierowcy od dziś
      const { error: assignError } = await supabase
        .from("driver_vehicle_assignments")
        .insert({ 
          driver_id: driverId, 
          vehicle_id: veh.id, 
          assigned_at: new Date().toISOString(),
          unassigned_at: null,
          status: "active"
        });
        
      if (assignError) {
        throw new Error("Błąd przypisywania pojazdu: " + assignError.message);
      }
      
      toast.success("Pojazd dodany i przypisany");
      onVehicleAdded?.();
      onClose();
    } catch (error: any) {
      console.error("Error adding vehicle:", error);
      toast.error(error?.message || "Błąd dodawania pojazdu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dodaj pojazd</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nr rejestracyjny *</Label>
            <Input 
              value={plate} 
              onChange={(e) => setPlate(e.target.value.toUpperCase())} 
              placeholder="np. WX1234A" 
              className="uppercase" 
            />
          </div>
          <div>
            <Label>VIN</Label>
            <Input 
              value={vin} 
              onChange={(e) => setVin(e.target.value.toUpperCase())} 
              placeholder="17 znaków" 
              className="uppercase" 
            />
          </div>
          <div>
            <Label>Marka *</Label>
            <Input 
              value={brand} 
              onChange={(e) => setBrand(e.target.value)} 
              placeholder="np. Toyota" 
            />
          </div>
          <div>
            <Label>Model *</Label>
            <Input 
              value={model} 
              onChange={(e) => setModel(e.target.value)} 
              placeholder="np. Auris" 
            />
          </div>
          <div>
            <Label>Rok</Label>
            <Input 
              type="number" 
              value={year} 
              onChange={(e) => setYear(e.target.value === "" ? "" : Number(e.target.value))} 
              placeholder="np. 2018" 
            />
          </div>
          <div>
            <Label>Kolor</Label>
            <Input 
              value={color} 
              onChange={(e) => setColor(e.target.value)} 
              placeholder="np. biały" 
            />
          </div>
          <div>
            <Label>Przegląd ważny do (opcjonalnie)</Label>
            <Input 
              type="date" 
              value={inspValidTo} 
              onChange={(e) => setInspValidTo(e.target.value)} 
            />
          </div>
          <div>
            <Label>Polisa OC ważna do (opcjonalnie)</Label>
            <Input 
              type="date" 
              value={policyValidTo} 
              onChange={(e) => setPolicyValidTo(e.target.value)} 
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Anuluj
          </Button>
          <Button onClick={save} disabled={loading}>
            {loading ? "Zapisywanie..." : "Zapisz pojazd"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}