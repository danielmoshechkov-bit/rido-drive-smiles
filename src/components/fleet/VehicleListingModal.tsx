import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X, Phone, Mail, Loader2 } from "lucide-react";

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
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load current photos and existing listing data when modal opens
  useEffect(() => {
    if (open) {
      const loadData = async () => {
        // Load vehicle photos
        const { data: vehicleData } = await supabase
          .from("vehicles")
          .select("photos")
          .eq("id", vehicle.id)
          .single();

        setPhotos(vehicleData?.photos || vehicle.photos || []);

        // Load existing listing if any
        const { data: listingData } = await supabase
          .from("vehicle_listings")
          .select("weekly_price, contact_phone, contact_email, description")
          .eq("vehicle_id", vehicle.id)
          .single();

        if (listingData) {
          setWeeklyPrice(listingData.weekly_price?.toString() || "");
          setContactPhone(listingData.contact_phone || "");
          setContactEmail(listingData.contact_email || "");
          setDescription((listingData as any).description || "");
        }
      };
      loadData();
    }
  }, [open, vehicle.id, vehicle.photos]);

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    const uploadedUrls: string[] = [];

    try {
      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${vehicle.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { data, error } = await supabase.storage
          .from('documents')
          .upload(fileName, file);

        if (error) {
          console.error("Upload error:", error);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(fileName);
        
        uploadedUrls.push(publicUrl);
      }

      if (uploadedUrls.length > 0) {
        const newPhotos = [...photos, ...uploadedUrls];
        setPhotos(newPhotos);
        
        // Save to vehicles.photos
        await supabase.from('vehicles')
          .update({ photos: newPhotos })
          .eq('id', vehicle.id);
        
        toast.success(`Dodano ${uploadedUrls.length} zdjęć`);
      }
    } catch (error) {
      console.error("Photo upload error:", error);
      toast.error("Błąd podczas wysyłania zdjęć");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = async (indexToRemove: number) => {
    const newPhotos = photos.filter((_, index) => index !== indexToRemove);
    setPhotos(newPhotos);
    
    await supabase.from('vehicles')
      .update({ photos: newPhotos })
      .eq('id', vehicle.id);
  };

  const handleSubmit = async () => {
    if (!weeklyPrice || Number(weeklyPrice) <= 0) {
      toast.error("Podaj cenę wynajmu");
      return;
    }

    if (!contactPhone.trim()) {
      toast.error("Numer telefonu jest wymagany");
      return;
    }

    if (photos.length === 0) {
      toast.error("Dodaj co najmniej jedno zdjęcie");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie zalogowany");

      const listingData: any = {
        vehicle_id: vehicle.id,
        weekly_price: Number(weeklyPrice),
        contact_phone: contactPhone.trim(),
        contact_email: contactEmail.trim() || null,
        description: description.trim() || null,
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
            <Label className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Numer telefonu kontaktowy *
            </Label>
            <Input
              type="tel"
              value={contactPhone}
              onChange={(e) => {
                // Allow only digits, +, -, spaces, and parentheses
                const cleaned = e.target.value.replace(/[^\d+\-() ]/g, '');
                setContactPhone(cleaned);
              }}
              placeholder="+48 123 456 789"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Ten numer będzie widoczny dla zainteresowanych kierowców
            </p>
          </div>

          <div>
            <Label className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email kontaktowy (opcjonalnie)
            </Label>
            <Input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="kontakt@email.pl"
            />
          </div>

          <div>
            <Label>Opis (opcjonalnie)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="np. Auto w świetnym stanie, niski przebieg, ekonomiczne..."
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Maksymalnie 500 znaków
            </p>
          </div>

          <div>
            <Label>Zdjęcia pojazdu *</Label>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handlePhotoUpload(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full mt-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Wysyłanie...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Dodaj zdjęcia
                </>
              )}
            </Button>
            
            {photos.length > 0 && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {photos.map((photo, index) => (
                  <div key={index} className="aspect-square rounded-lg overflow-hidden border relative group">
                    <img src={photo} alt="" className="w-full h-full object-cover" />
                    <span className="absolute top-1 left-1 bg-background/80 text-foreground text-xs px-1.5 py-0.5 rounded font-medium">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(index)}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={handleSubmit} disabled={saving || uploading || photos.length === 0 || !contactPhone.trim()}>
            {saving ? "Publikowanie..." : "Opublikuj na giełdzie"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
