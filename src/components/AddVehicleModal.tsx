import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CarBrandModelSelector } from "@/components/CarBrandModelSelector";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (vehicleId: string) => void;
  cityId?: string | null;
  fleetId?: string | null;
  fleetName?: string;
  userType?: 'admin' | 'fleet';
  variant?: 'standard' | 'rental';
};

const BODY_TYPES = [
  { value: "sedan", label: "Sedan" },
  { value: "kombi", label: "Kombi" },
  { value: "hatchback", label: "Hatchback" },
  { value: "suv", label: "SUV" },
  { value: "coupe", label: "Coupe" },
  { value: "cabrio", label: "Cabrio" },
  { value: "minivan", label: "Minivan" },
  { value: "pickup", label: "Pickup" },
];

const FUEL_TYPES = [
  { value: "benzyna", label: "Benzyna" },
  { value: "diesel", label: "Diesel" },
  { value: "hybryda", label: "Hybryda" },
  { value: "elektryczny", label: "Elektryczny" },
  { value: "lpg", label: "LPG" },
  { value: "hybryda_gaz", label: "Hybryda + Gaz" },
];

export function AddVehicleModal({ isOpen, onClose, onSuccess, cityId, fleetId, fleetName, userType = 'admin', variant = 'standard' }: Props) {
  const isFleetUser = userType === 'fleet' && fleetId;
  const isRentalVariant = variant === 'rental';
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());

  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [color, setColor] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [weeklyRentalFee, setWeeklyRentalFee] = useState<number | "">("");
  const [ownerName, setOwnerName] = useState(fleetName || "");
  const [inspValidTo, setInspValidTo] = useState<string>("");
  const [policyValidTo, setPolicyValidTo] = useState<string>("");
  const [ocPremium, setOcPremium] = useState<number | "">("");
  const [hasAC, setHasAC] = useState(false);
  const [acValidTo, setAcValidTo] = useState<string>("");
  const [acPremium, setAcPremium] = useState<number | "">("");

  const handleSave = async () => {
    const errors = new Set<string>();
    if (!plate) errors.add('plate');
    if (!brand) errors.add('brand');
    if (!model) errors.add('model');
    if (!fuelType) errors.add('fuelType');
    if (isRentalVariant) {
      if (!year) errors.add('year');
      if (!color) errors.add('color');
      if (!weeklyRentalFee) errors.add('weeklyRentalFee');
    } else {
      if (!bodyType) errors.add('bodyType');
    }
    setValidationErrors(errors);
    if (errors.size > 0) {
      toast.error("Uzupełnij wymagane pola podświetlone na czerwono.");
      return;
    }
    setLoading(true);
    try {
      // 1) Wstaw pojazd
      const { data: vIns, error: vErr } = await supabase
        .from("vehicles")
        .insert([{
          plate: plate.trim().toUpperCase(),
          vin: vin || null,
          brand: brand,
          model: model,
          year: year === "" ? null : Number(year),
          color: color || null,
          body_type: bodyType,
          fuel_type: fuelType,
          weekly_rental_fee: weeklyRentalFee === "" ? null : Number(weeklyRentalFee),
          odometer: 0,
          status: "aktywne",
          owner_name: ownerName || null,
          fleet_id: isFleetUser ? fleetId : null,
          ...(cityId ? { city_id: cityId } : {})
        }])
        .select("id")
        .single();

      if (vErr || !vIns?.id) throw vErr || new Error("Nie udało się dodać pojazdu");

      // 2) Opcjonalnie dodaj rekordy przeglądu / polisy, jeśli podano daty
      if (inspValidTo) {
        const { error: iErr } = await supabase.from("vehicle_inspections").insert([{
          vehicle_id: vIns.id,
          date: new Date().toISOString().slice(0,10),
          valid_to: inspValidTo,
          result: "pozytywny"
        }]);
        if (iErr) console.warn("Warn: nie zapisano przeglądu:", iErr.message);
      }
      if (policyValidTo) {
        const { error: pErr } = await supabase.from("vehicle_policies").insert([{
          vehicle_id: vIns.id,
          type: "OC",
          policy_no: "TBA",
          provider: "TBA",
          valid_from: new Date().toISOString().slice(0,10),
          valid_to: policyValidTo,
          premium: ocPremium === "" ? null : Number(ocPremium)
        }]);
        if (pErr) console.warn("Warn: nie zapisano polisy OC:", pErr.message);
      }

      // Dodaj polisę AC jeśli zaznaczona
      if (hasAC && acValidTo) {
        const { error: acErr } = await supabase.from("vehicle_policies").insert([{
          vehicle_id: vIns.id,
          type: "AC",
          policy_no: "TBA",
          provider: "TBA",
          valid_from: new Date().toISOString().slice(0,10),
          valid_to: acValidTo,
          premium: acPremium === "" ? null : Number(acPremium)
        }]);
        if (acErr) console.warn("Warn: nie zapisano polisy AC:", acErr.message);
      }

      toast.success("Pojazd dodany");
      onSuccess(vIns.id);
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Błąd podczas zapisu pojazdu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-4 sm:p-6 pb-0">
          <DialogTitle>Dodaj pojazd</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-4 sm:px-6 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className={validationErrors.has('plate') ? 'text-destructive' : ''}>Nr rejestracyjny *</Label>
            <Input value={plate} onChange={(e) => { setPlate(e.target.value.toUpperCase()); setValidationErrors(prev => { const n = new Set(prev); n.delete('plate'); return n; }); }} placeholder="np. WX1234A" className={`uppercase ${validationErrors.has('plate') ? 'border-destructive ring-1 ring-destructive' : ''}`} />
          </div>
          <div>
            <Label>VIN</Label>
            <Input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} placeholder="17 znaków" className="uppercase" />
          </div>
          
          {/* Car Brand/Model Selector - spans full width */}
          <div className="md:col-span-2">
            <CarBrandModelSelector
              brand={brand}
              model={model}
              onBrandChange={setBrand}
              onModelChange={setModel}
            />
          </div>

          <div>
            <Label>Rok {isRentalVariant && '*'}</Label>
            <Input type="number" value={year} onChange={(e) => setYear(e.target.value === "" ? "" : Number(e.target.value))} placeholder="np. 2018" />
          </div>
          <div>
            <Label>Kolor {isRentalVariant && '*'}</Label>
            <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="np. biały" />
          </div>

          <div>
            <Label>Rodzaj nadwozia {!isRentalVariant && '*'}</Label>
            <Select value={bodyType} onValueChange={setBodyType}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz rodzaj nadwozia" />
              </SelectTrigger>
              <SelectContent>
                {BODY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Rodzaj paliwa *</Label>
            <Select value={fuelType} onValueChange={setFuelType}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz rodzaj paliwa" />
              </SelectTrigger>
              <SelectContent>
                {FUEL_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Kwota za wynajem {isRentalVariant ? '*' : '(opcjonalnie)'}</Label>
            <Input 
              type="number" 
              value={weeklyRentalFee} 
              onChange={(e) => setWeeklyRentalFee(e.target.value === "" ? "" : Number(e.target.value))} 
              placeholder="zł/tydzień" 
            />
          </div>
          <div>
            <Label>Właściciel / Flota (nazwa spółki)</Label>
            <Input 
              value={ownerName} 
              onChange={(e) => setOwnerName(e.target.value)} 
              placeholder="np. RIDO Sp. z o.o."
              disabled={!!isFleetUser}
              className={isFleetUser ? 'bg-muted cursor-not-allowed' : ''}
            />
            {isFleetUser && (
              <p className="text-sm text-muted-foreground mt-1">
                Auto zostanie automatycznie przypisane do Twojej floty
              </p>
            )}
          </div>

          <div>
            <Label>Przegląd ważny do</Label>
            <Input type="date" value={inspValidTo} onChange={(e) => setInspValidTo(e.target.value)} />
          </div>
          
          {/* OC Section */}
          <div className="md:col-span-2 border-t pt-4 mt-2">
            <p className="text-sm font-medium text-muted-foreground mb-3">Ubezpieczenie OC</p>
          </div>
          <div>
            <Label>Polisa OC ważna do</Label>
            <Input type="date" value={policyValidTo} onChange={(e) => setPolicyValidTo(e.target.value)} />
          </div>
          <div>
            <Label>Składka OC (zł/rok)</Label>
            <Input 
              type="number" 
              value={ocPremium} 
              onChange={(e) => setOcPremium(e.target.value === "" ? "" : Number(e.target.value))} 
              placeholder="np. 1200" 
              min="0"
            />
          </div>
          
          {/* AC Section */}
          <div className="md:col-span-2 border-t pt-4 mt-2">
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="hasAC" 
                checked={hasAC} 
                onChange={(e) => setHasAC(e.target.checked)} 
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="hasAC" className="text-sm font-medium text-muted-foreground cursor-pointer">
                Pojazd posiada ubezpieczenie AC
              </Label>
            </div>
          </div>
          
          {hasAC && (
            <>
              <div>
                <Label>Polisa AC ważna do</Label>
                <Input type="date" value={acValidTo} onChange={(e) => setAcValidTo(e.target.value)} />
              </div>
              <div>
                <Label>Składka AC (zł/rok)</Label>
                <Input 
                  type="number" 
                  value={acPremium} 
                  onChange={(e) => setAcPremium(e.target.value === "" ? "" : Number(e.target.value))} 
                  placeholder="np. 2500" 
                  min="0"
                />
              </div>
            </>
          )}
          </div>
        </div>

        <DialogFooter className="border-t p-4 sm:p-6 pt-4 shrink-0 bg-background">
          <Button variant="outline" onClick={onClose}>Anuluj</Button>
          <Button onClick={handleSave} disabled={loading}>{loading ? "Zapisywanie..." : "Zapisz pojazd"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}