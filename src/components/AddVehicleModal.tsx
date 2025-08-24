import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (vehicleId: string) => void;
  cityId?: string | null;
};

export function AddVehicleModal({ isOpen, onClose, onSuccess, cityId }: Props) {
  const [loading, setLoading] = useState(false);

  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [color, setColor] = useState("");
  const [odometer, setOdometer] = useState<number | "">("");
  const [ownerName, setOwnerName] = useState("");
  const [inspValidTo, setInspValidTo] = useState<string>("");
  const [policyValidTo, setPolicyValidTo] = useState<string>("");

  const handleSave = async () => {
    if (!plate || !brand || !model) {
      toast.error("Uzupełnij przynajmniej: nr rejestracyjny, markę i model.");
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
          odometer: 0,
          status: "aktywne",
          owner_name: ownerName || null,
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
          valid_to: policyValidTo
        }]);
        if (pErr) console.warn("Warn: nie zapisano polisy:", pErr.message);
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dodaj pojazd</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nr rejestracyjny *</Label>
            <Input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="np. WX1234A" className="uppercase" />
          </div>
          <div>
            <Label>VIN</Label>
            <Input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} placeholder="17 znaków" className="uppercase" />
          </div>
          <div>
            <Label>Marka *</Label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="np. Toyota" />
          </div>
          <div>
            <Label>Model *</Label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="np. Auris" />
          </div>
          <div>
            <Label>Rok</Label>
            <Input type="number" value={year} onChange={(e) => setYear(e.target.value === "" ? "" : Number(e.target.value))} placeholder="np. 2018" />
          </div>
          <div>
            <Label>Kolor</Label>
            <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="np. biały" />
          </div>
          <div>
            <Label>Właściciel / Flota (nazwa spółki)</Label>
            <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="np. RIDO Sp. z o.o." />
          </div>

          <div>
            <Label>Przegląd ważny do</Label>
            <Input type="date" value={inspValidTo} onChange={(e) => setInspValidTo(e.target.value)} />
          </div>
          <div>
            <Label>Polisa OC ważna do</Label>
            <Input type="date" value={policyValidTo} onChange={(e) => setPolicyValidTo(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Anuluj</Button>
          <Button onClick={handleSave} disabled={loading}>{loading ? "Zapisywanie..." : "Zapisz pojazd"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}