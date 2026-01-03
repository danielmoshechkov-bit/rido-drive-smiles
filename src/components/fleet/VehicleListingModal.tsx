import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Image, AlertCircle } from "lucide-react";

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
  fleetId: string | null;
  onSuccess: () => void;
}

export function VehicleListingModal({ open, onOpenChange, vehicle, fleetId, onSuccess }: VehicleListingModalProps) {
  const [weeklyPrice, setWeeklyPrice] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Load current photos from vehicle when modal opens
  useEffect(() => {
    if (open) {
      const loadVehiclePhotos = async () => {
        const { data } = await supabase
          .from("vehicles")
          .select("photos")
          .eq("id", vehicle.id)
          .single();

        setPhotos(data?.photos || vehicle.photos || []);
      };
      loadVehiclePhotos();
    }
  }, [open, vehicle.id, vehicle.photos]);

  const handleSubmit = async () => {
    if (!weeklyPrice || Number(weeklyPrice) <= 0) {
      toast.error("Podaj cenę wynajmu");
      return;
    }

    if (photos.length === 0) {
      toast.error("Dodaj zdjęcia w zakładce Zdjęcia przed publikacją");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie zalogowany");

      const listingData: any = {
        vehicle_id: vehicle.id,
        weekly_price: Number(weeklyPrice),
        is_available: true,
        created_by: user.id
      };

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
            {photos.length > 0 ? (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {photos.slice(0, 4).map((photo, index) => (
                  <div key={index} className="aspect-square rounded-lg overflow-hidden border relative">
                    <img src={photo} alt="" className="w-full h-full object-cover" />
                    <span className="absolute top-1 left-1 bg-background/80 text-foreground text-xs px-1.5 py-0.5 rounded font-medium">
                      {index + 1}
                    </span>
                  </div>
                ))}
                {photos.length > 4 && (
                  <div className="aspect-square rounded-lg border flex items-center justify-center bg-muted">
                    <span className="text-sm text-muted-foreground">+{photos.length - 4}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Dodaj zdjęcia w zakładce "Zdjęcia" przed publikacją
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Zdjęcia możesz dodać i uporządkować w zakładce "Zdjęcia"
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={handleSubmit} disabled={saving || photos.length === 0}>
            {saving ? "Publikowanie..." : "Opublikuj na giełdzie"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
