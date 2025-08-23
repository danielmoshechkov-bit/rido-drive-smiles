import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  vehicleId: string;
};

export function VehicleHistoryModal({ isOpen, onClose, vehicleId }: Props) {
  const [type, setType] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [odometer, setOdometer] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState<number | "">("");
  const [provider, setProvider] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!type || !description) {
      toast.error("Uzupełnij typ i opis");
      return;
    }
    setLoading(true);
    try {
      // Zapisz wpis serwisowy
      const { data: service, error: serviceErr } = await supabase
        .from("vehicle_services")
        .insert([{
          vehicle_id: vehicleId,
          type,
          date,
          odometer: odometer === "" ? null : Number(odometer),
          description,
          cost: cost === "" ? null : Number(cost),
          provider: provider || null
        }])
        .select("id")
        .single();

      if (serviceErr) throw serviceErr;

      // Jeśli jest plik, wgraj go i zapisz jako dokument
      if (file && service?.id) {
        const path = `services/${vehicleId}/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
        if (upErr) throw upErr;

        const { data: pub } = supabase.storage.from("documents").getPublicUrl(path);
        
        await supabase.from("documents").insert([{
          type: `Serwis - ${type}`,
          vehicle_id: vehicleId,
          file_url: pub?.publicUrl,
          file_name: file.name
        }]);
      }

      toast.success("Wpis serwisowy dodany");
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Błąd dodawania wpisu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dodaj wpis do historii pojazdu</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Typ serwisu *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz typ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Wymiana oleju">Wymiana oleju</SelectItem>
                <SelectItem value="Przegląd">Przegląd</SelectItem>
                <SelectItem value="Naprawa">Naprawa</SelectItem>
                <SelectItem value="Wymiana części">Wymiana części</SelectItem>
                <SelectItem value="Inne">Inne</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Data *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div>
            <Label>Przebieg (km)</Label>
            <Input type="number" value={odometer} onChange={(e) => setOdometer(e.target.value === "" ? "" : Number(e.target.value))} placeholder="np. 145000" />
          </div>

          <div>
            <Label>Opis *</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Szczegółowy opis wykonanych prac..." />
          </div>

          <div>
            <Label>Koszt (zł)</Label>
            <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value === "" ? "" : Number(e.target.value))} placeholder="np. 250.00" />
          </div>

          <div>
            <Label>Serwis/Warsztat</Label>
            <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="np. AutoSerwis XYZ" />
          </div>

          <div>
            <Label>Dokument (faktura, raport)</Label>
            <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Anuluj</Button>
          <Button onClick={handleSave} disabled={loading}>{loading ? "Zapisywanie..." : "Zapisz wpis"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}