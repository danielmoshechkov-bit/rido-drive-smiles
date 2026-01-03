import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X, Image } from "lucide-react";

interface VehicleListingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: {
    id: string;
    brand: string;
    model: string;
    plate: string;
    photos?: string[];
  };
  fleetId: string | null; // null for driver's own cars
  onSuccess: () => void;
}

export function VehicleListingModal({ open, onOpenChange, vehicle, fleetId, onSuccess }: VehicleListingModalProps) {
  const [weeklyPrice, setWeeklyPrice] = useState("");
  const [photos, setPhotos] = useState<string[]>(vehicle.photos || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const newPhotos: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = `vehicles/${vehicle.id}/${Date.now()}_${file.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(path, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("documents").getPublicUrl(path);
        newPhotos.push(data.publicUrl);
      }

      setPhotos(prev => [...prev, ...newPhotos]);
      toast.success(`Dodano ${newPhotos.length} zdjęć`);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Błąd przesyłania zdjęć");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!weeklyPrice || Number(weeklyPrice) <= 0) {
      toast.error("Podaj cenę wynajmu");
      return;
    }

    setSaving(true);
    try {
      // Update vehicle photos
      const { error: vehicleError } = await supabase
        .from("vehicles")
        .update({ photos })
        .eq("id", vehicle.id);

      if (vehicleError) throw vehicleError;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie zalogowany");

      // Create or update listing - fleet_id is null for driver's own cars
      const listingData: any = {
        vehicle_id: vehicle.id,
        weekly_price: Number(weeklyPrice),
        is_available: true,
        created_by: user.id
      };
      
      // Only include fleet_id if it's a fleet vehicle
      if (fleetId) {
        listingData.fleet_id = fleetId;
      }

      const { error: listingError } = await supabase
        .from("vehicle_listings")
        .upsert(listingData, { onConflict: "vehicle_id" });

      if (listingError) throw listingError;

      toast.success("Auto opublikowane na giełdzie!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating listing:", error);
      toast.error(error.message || "Błąd publikacji");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dodaj na giełdę - {vehicle.brand} {vehicle.model}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Cena wynajmu (zł/tydzień) *</Label>
            <Input
              type="number"
              value={weeklyPrice}
              onChange={(e) => setWeeklyPrice(e.target.value)}
              placeholder="np. 500"
              min="1"
            />
          </div>

          <div>
            <Label>Zdjęcia pojazdu</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {photos.map((photo, index) => (
                <div key={index} className="relative aspect-square rounded-lg overflow-hidden border">
                  <img src={photo} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(index)}
                    className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              
              <label className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                  disabled={uploading}
                />
                {uploading ? (
                  <span className="text-xs text-muted-foreground">Ładowanie...</span>
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                    <span className="text-xs text-muted-foreground">Dodaj zdjęcia</span>
                  </>
                )}
              </label>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Dodaj zdjęcia aby zwiększyć atrakcyjność ogłoszenia
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Publikowanie..." : "Opublikuj na giełdzie"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
