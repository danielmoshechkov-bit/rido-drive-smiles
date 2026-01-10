import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CarBrandModelSelector } from "@/components/CarBrandModelSelector";

const FUEL_TYPES = [
  { value: "benzyna", label: "Benzyna" },
  { value: "diesel", label: "Diesel" },
  { value: "hybryda", label: "Hybryda" },
  { value: "elektryczny", label: "Elektryczny" },
  { value: "lpg", label: "LPG" },
  { value: "hybryda+gaz", label: "Hybryda + Gaz" },
];

const BODY_TYPES = [
  { value: "sedan", label: "Sedan" },
  { value: "kombi", label: "Kombi" },
  { value: "hatchback", label: "Hatchback" },
  { value: "suv", label: "SUV" },
  { value: "van", label: "Van" },
  { value: "minivan", label: "Minivan" },
];

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
  const [fuelType, setFuelType] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [weeklyPrice, setWeeklyPrice] = useState<number | "">("");
  const [inspValidTo, setInspValidTo] = useState<string>("");
  const [policyValidTo, setPolicyValidTo] = useState<string>("");

  const save = async () => {
    // Validate all required fields
    if (!plate || !vin || !brand || !model || !year || !color || !fuelType || !bodyType) {
      toast.error("Uzupełnij wszystkie wymagane pola oznaczone *");
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
          vin: vin.toUpperCase().trim(),
          brand: brand.trim(),
          model: model.trim(),
          year: Number(year),
          color: color.trim(),
          fuel_type: fuelType,
          body_type: bodyType,
          status: "aktywne",
          city_id: cityId,
          fleet_id: null,
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

      // Jeśli podano cenę wynajmu, utwórz wstępny listing (nieaktywny)
      if (weeklyPrice && Number(weeklyPrice) > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("vehicle_listings").insert({
            vehicle_id: veh.id,
            weekly_price: Number(weeklyPrice),
            is_available: false,
            created_by: user.id
          });
        }
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dodaj pojazd</DialogTitle>
          <p className="text-sm text-muted-foreground">Pola oznaczone * są wymagane</p>
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
            <Label>VIN *</Label>
            <Input 
              value={vin} 
              onChange={(e) => setVin(e.target.value.toUpperCase())} 
              placeholder="17 znaków" 
              className="uppercase" 
            />
          </div>
          
          {/* Car Brand/Model Selector - spans full width */}
          <div className="md:col-span-2">
            <p className="text-sm font-medium mb-1.5">Marka i model *</p>
            <CarBrandModelSelector
              brand={brand}
              model={model}
              onBrandChange={setBrand}
              onModelChange={setModel}
            />
          </div>

          <div>
            <Label>Rok produkcji *</Label>
            <Input 
              type="number" 
              value={year} 
              onChange={(e) => setYear(e.target.value === "" ? "" : Number(e.target.value))} 
              placeholder="np. 2018" 
              min="1990"
              max={new Date().getFullYear() + 1}
            />
          </div>
          <div>
            <Label>Kolor *</Label>
            <Input 
              value={color} 
              onChange={(e) => setColor(e.target.value)} 
              placeholder="np. biały" 
            />
          </div>
          <div>
            <Label>Rodzaj paliwa *</Label>
            <Select value={fuelType} onValueChange={setFuelType}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz..." />
              </SelectTrigger>
              <SelectContent>
                {FUEL_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Rodzaj nadwozia *</Label>
            <Select value={bodyType} onValueChange={setBodyType}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz..." />
              </SelectTrigger>
              <SelectContent>
                {BODY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="md:col-span-2 border-t pt-4 mt-2">
            <p className="text-sm text-muted-foreground mb-3">Pola opcjonalne</p>
          </div>
          
          <div>
            <Label>Cena wynajmu (zł/tydzień)</Label>
            <Input 
              type="number" 
              value={weeklyPrice} 
              onChange={(e) => setWeeklyPrice(e.target.value === "" ? "" : Number(e.target.value))} 
              placeholder="np. 500" 
              min="1"
            />
          </div>
          <div>
            <Label>Przegląd ważny do</Label>
            <Input 
              type="date" 
              value={inspValidTo} 
              onChange={(e) => setInspValidTo(e.target.value)} 
            />
          </div>
          <div>
            <Label>Polisa OC ważna do</Label>
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
          <Button onClick={save} disabled={loading} size="sm" className="h-9 text-sm px-6">
            {loading ? "Zapisywanie..." : "Zapisz pojazd"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
