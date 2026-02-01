import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Camera, 
  Check, 
  X, 
  Car, 
  Fuel, 
  Armchair, 
  Package2, 
  User,
  Loader2,
  Upload,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { compressPhotoImage } from "@/utils/imageCompression";

interface PhotoCategory {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  required: boolean;
  minPhotos: number;
}

const PHOTO_CATEGORIES: PhotoCategory[] = [
  { 
    id: "corner_front_left", 
    label: "Przód lewy", 
    description: "Stań pod kątem 45° - widoczny przód i lewy bok pojazdu",
    icon: <Car className="h-5 w-5 rotate-[-45deg]" />,
    required: true,
    minPhotos: 1
  },
  { 
    id: "corner_front_right", 
    label: "Przód prawy", 
    description: "Stań pod kątem 45° - widoczny przód i prawy bok pojazdu",
    icon: <Car className="h-5 w-5 rotate-[45deg]" />,
    required: true,
    minPhotos: 1
  },
  { 
    id: "corner_rear_left", 
    label: "Tył lewy", 
    description: "Stań pod kątem 45° - widoczny tył i lewy bok pojazdu",
    icon: <Car className="h-5 w-5 rotate-[-135deg]" />,
    required: true,
    minPhotos: 1
  },
  { 
    id: "corner_rear_right", 
    label: "Tył prawy", 
    description: "Stań pod kątem 45° - widoczny tył i prawy bok pojazdu",
    icon: <Car className="h-5 w-5 rotate-[135deg]" />,
    required: true,
    minPhotos: 1
  },
  { 
    id: "dashboard", 
    label: "Licznik i zegary", 
    description: "Widoczny przebieg, stan paliwa i kontrolki",
    icon: <Fuel className="h-5 w-5" />,
    required: true,
    minPhotos: 1
  },
  { 
    id: "interior_front", 
    label: "Wnętrze przód", 
    description: "Siedzenia przednie, kierownica, konsola",
    icon: <Armchair className="h-5 w-5" />,
    required: true,
    minPhotos: 1
  },
  { 
    id: "interior_rear", 
    label: "Wnętrze tył", 
    description: "Siedzenia tylne i podłoga",
    icon: <Armchair className="h-5 w-5" />,
    required: true,
    minPhotos: 1
  },
  { 
    id: "trunk", 
    label: "Bagażnik", 
    description: "Bagażnik z widocznym kołem zapasowym lub jego brakiem",
    icon: <Package2 className="h-5 w-5" />,
    required: true,
    minPhotos: 1
  },
  { 
    id: "driver_with_vehicle", 
    label: "Kierowca przy pojeździe", 
    description: "Zdjęcie kierowcy stojącego przy wydawanym pojeździe",
    icon: <User className="h-5 w-5" />,
    required: true,
    minPhotos: 1
  },
];

interface RentalPhotoProtocolProps {
  rentalId: string;
  onComplete?: () => void;
  readOnly?: boolean;
}

export function RentalPhotoProtocol({ rentalId, onComplete, readOnly = false }: RentalPhotoProtocolProps) {
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExistingPhotos();
  }, [rentalId]);

  const loadExistingPhotos = async () => {
    setLoading(true);
    try {
      const supabaseAny = supabase as any;
      const { data, error } = await supabaseAny
        .from("driver_rental_documents")
        .select("document_type, file_url")
        .eq("rental_id", rentalId)
        .eq("document_type", "protocol_photo");

      if (!error && data) {
        const photoMap: Record<string, string[]> = {};
        data.forEach((doc: any) => {
          // Extract category from file URL or metadata
          const categoryMatch = doc.file_url?.match(/protocol_([^_]+)/);
          const category = categoryMatch?.[1] || "other";
          if (!photoMap[category]) photoMap[category] = [];
          photoMap[category].push(doc.file_url);
        });
        setPhotos(photoMap);
      }
    } catch (error) {
      console.error("Error loading photos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (categoryId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(categoryId);
    try {
      // Compress the image
      const compressed = await compressPhotoImage(file);
      const fileName = `rental_${rentalId}/protocol_${categoryId}_${Date.now()}.jpg`;

      // Upload to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("driver-documents")
        .upload(fileName, compressed, { contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("driver-documents")
        .getPublicUrl(fileName);

      // Save to database
      const supabaseAny = supabase as any;
      await supabaseAny.from("driver_rental_documents").insert({
        rental_id: rentalId,
        document_type: "protocol_photo",
        file_name: `${categoryId}_photo.jpg`,
        file_url: publicUrl,
      });

      // Update local state
      setPhotos(prev => ({
        ...prev,
        [categoryId]: [...(prev[categoryId] || []), publicUrl]
      }));

      toast.success("Zdjęcie zapisane");
    } catch (error: any) {
      console.error("Error uploading photo:", error);
      toast.error("Błąd przesyłania zdjęcia");
    } finally {
      setUploading(null);
    }
  };

  const getCompletedCount = () => {
    return PHOTO_CATEGORIES.filter(cat => 
      (photos[cat.id]?.length || 0) >= cat.minPhotos
    ).length;
  };

  const allPhotosComplete = () => {
    return PHOTO_CATEGORIES.every(cat => 
      !cat.required || (photos[cat.id]?.length || 0) >= cat.minPhotos
    );
  };

  const handleComplete = async () => {
    if (!allPhotosComplete()) {
      toast.error("Uzupełnij wszystkie wymagane zdjęcia");
      return;
    }

    try {
      // Update rental status to indicate protocol is complete
      await (supabase.from("vehicle_rentals") as any)
        .update({ protocol_completed_at: new Date().toISOString() })
        .eq("id", rentalId);

      toast.success("Protokół zdjęciowy zakończony!");
      onComplete?.();
    } catch (error) {
      console.error("Error completing protocol:", error);
      toast.error("Błąd zapisywania protokołu");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Protokół zdjęciowy</h2>
          <p className="text-sm text-muted-foreground">
            Wykonaj wszystkie wymagane zdjęcia przed wydaniem pojazdu
          </p>
        </div>
        <Badge variant={allPhotosComplete() ? "default" : "secondary"}>
          {getCompletedCount()} / {PHOTO_CATEGORIES.length}
        </Badge>
      </div>

      {/* Warning if not complete */}
      {!allPhotosComplete() && !readOnly && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <p className="font-medium text-destructive">Protokół niekompletny</p>
              <p className="text-sm text-destructive/80">
                Wszystkie zdjęcia są wymagane do zakończenia wydania pojazdu
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Photo Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PHOTO_CATEGORIES.map((category) => {
          const categoryPhotos = photos[category.id] || [];
          const isComplete = categoryPhotos.length >= category.minPhotos;
          const isUploading = uploading === category.id;

          return (
            <Card 
              key={category.id}
              className={cn(
                "overflow-hidden transition-colors",
                isComplete && "border-primary/50 bg-primary/5"
              )}
            >
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {category.icon}
                    <CardTitle className="text-sm font-medium">
                      {category.label}
                    </CardTitle>
                  </div>
                  {isComplete ? (
                    <Check className="h-5 w-5 text-primary" />
                  ) : category.required ? (
                    <Badge variant="outline" className="text-xs">Wymagane</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{category.description}</p>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {categoryPhotos.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {categoryPhotos.map((url, idx) => (
                      <div 
                        key={idx}
                        className="aspect-[4/3] rounded-md overflow-hidden bg-muted"
                      >
                        <img 
                          src={url} 
                          alt={`${category.label} ${idx + 1}`}
                          className="w-full h-full object-cover object-center"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="aspect-[4/3] rounded-md bg-muted flex items-center justify-center mb-3">
                    <Camera className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}

                {!readOnly && (
                  <Label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handlePhotoUpload(category.id, e)}
                      disabled={isUploading}
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full gap-2"
                      disabled={isUploading}
                      asChild
                    >
                      <span>
                        {isUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        {categoryPhotos.length > 0 ? "Dodaj kolejne" : "Dodaj zdjęcie"}
                      </span>
                    </Button>
                  </Label>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Complete Button */}
      {!readOnly && (
        <Button 
          className="w-full gap-2" 
          size="lg"
          onClick={handleComplete}
          disabled={!allPhotosComplete()}
        >
          <Check className="h-5 w-5" />
          Zakończ protokół i wydaj pojazd
        </Button>
      )}
    </div>
  );
}
