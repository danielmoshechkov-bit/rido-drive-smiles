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
  vehicleId: string;
};

export function AddVehicleDocumentModal({ isOpen, onClose, vehicleId }: Props) {
  const [type, setType] = useState("Inny dokument");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const uploadAndSave = async () => {
    if (!file) {
      toast.error("Wybierz plik");
      return;
    }
    setLoading(true);
    try {
      const path = `${vehicleId}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("documents").getPublicUrl(path);
      const fileUrl = pub?.publicUrl;

      const { error: dErr } = await supabase.from("documents").insert([{
        type,
        vehicle_id: vehicleId,
        file_url: fileUrl,
        file_name: file.name
      }]);
      if (dErr) throw dErr;

      toast.success("Dokument dodany");
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Błąd dodawania dokumentu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dodaj dokument pojazdu</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Typ dokumentu</Label>
            <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="np. Dowód rejestracyjny / Polisa" />
          </div>
          <div>
            <Label>Plik (PDF/JPG/DOCX)</Label>
            <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Anuluj</Button>
          <Button onClick={uploadAndSave} disabled={loading}>{loading ? "Zapisywanie..." : "Zapisz dokument"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}