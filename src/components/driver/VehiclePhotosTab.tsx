import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X, GripVertical, Image } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VehiclePhotosTabProps {
  vehicleId: string;
  photos?: string[];
  onPhotosChange?: (photos: string[]) => void;
}

export function VehiclePhotosTab({ vehicleId, photos: initialPhotos, onPhotosChange }: VehiclePhotosTabProps) {
  const [photos, setPhotos] = useState<string[]>(initialPhotos || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Load photos from database on mount
  useEffect(() => {
    const loadPhotos = async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("photos")
        .eq("id", vehicleId)
        .single();

      if (data && !error && data.photos) {
        setPhotos(data.photos);
      }
    };

    if (!initialPhotos) {
      loadPhotos();
    }
  }, [vehicleId, initialPhotos]);

  const savePhotos = async (newPhotos: string[]) => {
    setSaving(true);
    const { error } = await supabase
      .from("vehicles")
      .update({ photos: newPhotos })
      .eq("id", vehicleId);

    if (error) {
      toast.error("Błąd zapisu zdjęć");
      console.error(error);
    } else {
      onPhotosChange?.(newPhotos);
    }
    setSaving(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const newPhotos: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = `vehicles/${vehicleId}/${Date.now()}_${i}_${file.name}`;

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(path, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("documents").getPublicUrl(path);
        newPhotos.push(data.publicUrl);
      }

      const updatedPhotos = [...photos, ...newPhotos];
      setPhotos(updatedPhotos);
      await savePhotos(updatedPhotos);
      toast.success(`Dodano ${newPhotos.length} zdjęć`);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Błąd przesyłania zdjęć");
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = "";
    }
  };

  const removePhoto = async (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    setPhotos(newPhotos);
    await savePhotos(newPhotos);
    toast.success("Zdjęcie usunięte");
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newPhotos = [...photos];
    const [draggedPhoto] = newPhotos.splice(draggedIndex, 1);
    newPhotos.splice(dropIndex, 0, draggedPhoto);

    setPhotos(newPhotos);
    setDraggedIndex(null);
    setDragOverIndex(null);
    await savePhotos(newPhotos);
    toast.success("Kolejność zmieniona");
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">Zdjęcia pojazdu</h4>
          <p className="text-xs text-muted-foreground">
            Przeciągnij aby zmienić kolejność. Zdjęcia będą wyświetlane na giełdzie w tej kolejności.
          </p>
        </div>
        {saving && (
          <span className="text-xs text-muted-foreground">Zapisywanie...</span>
        )}
      </div>

      {photos.length === 0 ? (
        <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 text-center">
          <Image className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">Brak zdjęć</p>
          <label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoUpload}
              className="hidden"
              disabled={uploading}
            />
            <Button variant="outline" asChild disabled={uploading}>
              <span className="cursor-pointer">
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? "Ładowanie..." : "Dodaj zdjęcia"}
              </span>
            </Button>
          </label>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((photo, index) => (
              <div
                key={`${photo}-${index}`}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`relative aspect-square rounded-lg overflow-hidden border-2 cursor-move transition-all ${
                  draggedIndex === index ? "opacity-50 scale-95" : ""
                } ${
                  dragOverIndex === index ? "border-primary ring-2 ring-primary/30" : "border-border"
                }`}
              >
                {/* Number badge */}
                <div className="absolute top-2 left-2 z-10 bg-background/90 text-foreground px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 shadow-sm">
                  <GripVertical className="h-3 w-3" />
                  {index + 1}
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removePhoto(index);
                  }}
                  className="absolute top-2 right-2 z-10 bg-destructive text-destructive-foreground rounded-full p-1.5 hover:bg-destructive/90 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>

                {/* Photo */}
                <img
                  src={photo}
                  alt={`Zdjęcie ${index + 1}`}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>
            ))}

            {/* Add more button */}
            <label className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors">
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
                  <span className="text-xs text-muted-foreground">Dodaj więcej</span>
                </>
              )}
            </label>
          </div>

          <p className="text-xs text-muted-foreground">
            Zdjęcie nr 1 będzie głównym zdjęciem na giełdzie
          </p>
        </>
      )}
    </div>
  );
}
