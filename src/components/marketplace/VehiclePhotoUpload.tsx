import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Upload, X, Sparkles, Loader2, Image as ImageIcon, 
  ArrowLeft, ArrowRight, Check, AlertCircle, Wand2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { addWatermark } from "@/lib/watermark";
import { useUserCredits } from "@/hooks/useUserCredits";

interface VehiclePhotoUploadProps {
  photos: string[];
  aiPhotos: string[];
  hasAiPhotos: boolean;
  onPhotosChange: (photos: string[]) => void;
  onAiPhotosChange: (photos: string[]) => void;
  onHasAiPhotosChange: (value: boolean) => void;
  userId?: string;
  maxPhotos?: number;
}

// Always compress images for optimal storage - accepts all formats
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    img.onload = () => {
      let { width, height } = img;
      const maxDimension = 2000;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = (height / width) * maxDimension;
          width = maxDimension;
        } else {
          width = (width / height) * maxDimension;
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            // Fallback - return original file
            resolve(file);
          }
        },
        "image/jpeg",
        0.85
      );
    };

    img.onerror = () => {
      // Fallback on error - return original file
      resolve(file);
    };

    img.src = URL.createObjectURL(file);
  });
}

export function VehiclePhotoUpload({
  photos,
  aiPhotos,
  hasAiPhotos,
  onPhotosChange,
  onAiPhotosChange,
  onHasAiPhotosChange,
  userId,
  maxPhotos = 15,
}: VehiclePhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [customPrompt, setCustomPrompt] = useState("");
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [previewPairs, setPreviewPairs] = useState<{ original: string; ai: string }[]>([]);
  const [selectedForAi, setSelectedForAi] = useState<number[]>([]);
  
  const { credits, deductCredits, loading: creditsLoading } = useUserCredits(userId);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = maxPhotos - photos.length;
    if (files.length > remainingSlots) {
      toast.error(`Możesz dodać jeszcze ${remainingSlots} zdjęć`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const newPhotos: string[] = [];
      const totalFiles = files.length;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Always compress for optimal storage
        const blob = await compressImage(file);

        // Add watermark
        const watermarkedBlob = await addWatermark(blob);

        // Upload to Supabase
        const fileName = `vehicle-${Date.now()}-${i}.jpg`;
        const filePath = `vehicle-listings/${userId || 'anonymous'}/${fileName}`;

        const { data, error } = await supabase.storage
          .from("documents")
          .upload(filePath, watermarkedBlob, {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (error) {
          console.error("Upload error:", error);
          toast.error(`Błąd przesyłania: ${file.name}`);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("documents")
          .getPublicUrl(data.path);

        newPhotos.push(urlData.publicUrl);
        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
      }

      onPhotosChange([...photos, ...newPhotos]);
      toast.success(`Dodano ${newPhotos.length} zdjęć`);
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Błąd podczas przesyłania zdjęć");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [photos, maxPhotos, userId, onPhotosChange]);

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    onPhotosChange(newPhotos);
    
    if (aiPhotos.length > index) {
      const newAiPhotos = aiPhotos.filter((_, i) => i !== index);
      onAiPhotosChange(newAiPhotos);
    }
  };

  const movePhoto = (fromIndex: number, toIndex: number) => {
    const newPhotos = [...photos];
    const [movedPhoto] = newPhotos.splice(fromIndex, 1);
    newPhotos.splice(toIndex, 0, movedPhoto);
    onPhotosChange(newPhotos);
  };

  const handleAiEnhance = async () => {
    if (photos.length === 0) {
      toast.error("Najpierw dodaj zdjęcia");
      return;
    }
    
    // Calculate cost
    const selectedCount = selectedForAi.length > 0 ? selectedForAi.length : photos.length;
    const costPerPhoto = 10; // From ai_pricing
    const totalCost = selectedCount * costPerPhoto;
    
    if (credits < totalCost) {
      toast.error(`Brak kredytów. Potrzebujesz ${totalCost} kredytów.`);
      return;
    }

    setAiProcessing(true);
    setAiProgress(0);
    setPreviewPairs([]);

    try {
      const photosToProcess = selectedForAi.length > 0 
        ? selectedForAi.map(i => photos[i])
        : photos;

      const results: { original: string; ai: string }[] = [];
      
      const studioPrompt = useCustomPrompt && customPrompt 
        ? customPrompt 
        : `Przekształć to zdjęcie pojazdu w profesjonalne zdjęcie studyjne:
- Zachowaj dokładnie ten sam kąt, pozycję i proporcje pojazdu
- Zachowaj WSZYSTKIE szczegóły pojazdu: uszkodzenia, rysy, wgniecenia - NIE naprawiaj!
- Zakryj tablicę rejestracyjną delikatnym rozmyciem
- Zmień tło na neutralne studyjne (ciemnoszary gradient)
- Dodaj profesjonalne oświetlenie studyjne
- Dodaj delikatne odbicie na podłodze (efekt showroom)
- Kolory pojazdu mają pozostać takie same
- Wynik ma wyglądać jak sesja zdjęciowa w salonie dealera`;

      for (let i = 0; i < photosToProcess.length; i++) {
        const photoUrl = photosToProcess[i];
        
        const { data, error } = await supabase.functions.invoke("ai-photo-edit", {
          body: {
            imageUrl: photoUrl,
            instruction: studioPrompt,
            listingType: "vehicle",
            listingId: "draft",
            photoIndex: i,
            userId,
          },
        });

        if (error || !data?.editedUrl) {
          console.error("AI edit error:", error || data?.error);
          toast.error(`Błąd edycji zdjęcia ${i + 1}`);
          continue;
        }

        results.push({ original: photoUrl, ai: data.editedUrl });
        setAiProgress(Math.round(((i + 1) / photosToProcess.length) * 100));
      }

      // Deduct credits
      await deductCredits(totalCost, "vehicle_photo_enhance");

      setPreviewPairs(results);
      
      // Update AI photos
      const newAiPhotos = [...photos];
      results.forEach((result, idx) => {
        const originalIndex = selectedForAi.length > 0 
          ? selectedForAi[idx]
          : idx;
        newAiPhotos[originalIndex] = result.ai;
      });
      
      onAiPhotosChange(newAiPhotos);
      toast.success(`Poprawiono ${results.length} zdjęć z AI!`);
    } catch (err) {
      console.error("AI enhance error:", err);
      toast.error("Błąd podczas poprawiania zdjęć");
    } finally {
      setAiProcessing(false);
      setAiProgress(0);
    }
  };

  const acceptAiPhotos = () => {
    onHasAiPhotosChange(true);
    setShowAiModal(false);
    toast.success("Zdjęcia AI zostały wybrane");
  };

  const rejectAiPhotos = () => {
    onAiPhotosChange([]);
    onHasAiPhotosChange(false);
    setShowAiModal(false);
  };

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
          "hover:border-primary/50 hover:bg-muted/50",
          photos.length >= maxPhotos && "opacity-50 cursor-not-allowed"
        )}
        onClick={() => photos.length < maxPhotos && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,image/bmp,image/tiff,image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          disabled={photos.length >= maxPhotos}
        />
        
        {uploading ? (
          <div className="space-y-4">
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
            <Progress value={uploadProgress} className="max-w-xs mx-auto" />
            <p className="text-sm text-muted-foreground">Przesyłanie... {uploadProgress}%</p>
          </div>
        ) : (
          <>
            <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
            <p className="font-medium">Przeciągnij zdjęcia lub kliknij, aby wybrać</p>
            <p className="text-sm text-muted-foreground mt-1">
              Dodano {photos.length} z {maxPhotos} zdjęć
            </p>
          </>
        )}
      </div>

      {/* Photos grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {photos.map((photo, index) => (
            <div
              key={index}
              className={cn(
                "relative aspect-[4/3] rounded-lg overflow-hidden group",
                "border-2",
                hasAiPhotos && aiPhotos[index] ? "border-primary" : "border-transparent"
              )}
            >
              <img
                src={hasAiPhotos && aiPhotos[index] ? aiPhotos[index] : photo}
                alt={`Zdjęcie ${index + 1}`}
                className="w-full h-full object-cover"
              />
              
              {/* Badge for main photo */}
              {index === 0 && (
                <div className="absolute top-1 left-1 bg-primary text-white text-xs px-2 py-0.5 rounded">
                  Główne
                </div>
              )}
              
              {/* AI badge */}
              {hasAiPhotos && aiPhotos[index] && (
                <div className="absolute top-1 right-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  AI
                </div>
              )}

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {index > 0 && (
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); movePhoto(index, index - 1); }}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                
                <Button
                  size="icon"
                  variant="destructive"
                  className="h-8 w-8"
                  onClick={(e) => { e.stopPropagation(); removePhoto(index); }}
                >
                  <X className="h-4 w-4" />
                </Button>
                
                {index < photos.length - 1 && (
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); movePhoto(index, index + 1); }}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Enhancement button */}
      {photos.length > 0 && (
        <Card className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/20">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                <Wand2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  Popraw zdjęcia z AI
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                    Powered by Rido AI
                  </span>
                </h3>
                <p className="text-sm text-muted-foreground">
                  Zamień zwykłe zdjęcia w profesjonalne sesje studyjne. Koszt: 10 kredytów/zdjęcie.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Twoje kredyty: <span className="font-semibold text-primary">{credits}</span>
                </p>
              </div>
            </div>
            
            <Button
              onClick={() => setShowAiModal(true)}
              className="gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              disabled={creditsLoading}
            >
              <Sparkles className="h-4 w-4" />
              Popraw zdjęcia
            </Button>
          </div>
        </Card>
      )}

      {/* AI Modal */}
      <Dialog open={showAiModal} onOpenChange={setShowAiModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Popraw zdjęcia z Rido AI
            </DialogTitle>
            <DialogDescription>
              AI przekształci Twoje zdjęcia w profesjonalne sesje studyjne
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Before/After example */}
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm font-medium mb-3">Przykład transformacji:</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground text-center">Przed</p>
                  <div className="aspect-[4/3] bg-muted rounded-lg flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground text-center">Po (AI)</p>
                  <div className="aspect-[4/3] bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <Sparkles className="h-6 w-6 mx-auto mb-1 text-primary" />
                      <p className="text-xs text-white/70">Studio look</p>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                Tło zostanie zamienione na profesjonalne studyjne. Wszystkie szczegóły pojazdu (w tym uszkodzenia) pozostaną bez zmian.
              </p>
            </div>

            {/* Cost info */}
            <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-primary" />
                <span className="text-sm">
                  Koszt: <strong>{photos.length * 10} kredytów</strong> ({photos.length} zdjęć × 10)
                </span>
              </div>
              <span className="text-sm">
                Twoje kredyty: <strong className="text-primary">{credits}</strong>
              </span>
            </div>

            {/* Custom prompt option */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch
                  checked={useCustomPrompt}
                  onCheckedChange={setUseCustomPrompt}
                />
                <Label>Użyj własnego opisu (zaawansowane)</Label>
              </div>
              
              {useCustomPrompt && (
                <Textarea
                  placeholder="Opisz jak ma wyglądać zdjęcie, np. 'tło plaża o zachodzie słońca' lub 'studio z niebieskim światłem'"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  rows={3}
                />
              )}
            </div>

            {/* Progress */}
            {aiProcessing && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm">Przetwarzanie zdjęć...</span>
                </div>
                <Progress value={aiProgress} />
              </div>
            )}

            {/* Preview pairs */}
            {previewPairs.length > 0 && (
              <div className="space-y-3">
                <p className="font-medium">Podgląd wyników:</p>
                <div className="grid grid-cols-2 gap-4 max-h-60 overflow-y-auto">
                  {previewPairs.map((pair, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2">
                      <img src={pair.original} alt="Oryginał" className="aspect-[4/3] object-cover rounded" />
                      <img src={pair.ai} alt="AI" className="aspect-[4/3] object-cover rounded border-2 border-primary" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {previewPairs.length > 0 ? (
                <>
                  <Button variant="outline" className="flex-1" onClick={rejectAiPhotos}>
                    Użyj oryginalnych
                  </Button>
                  <Button className="flex-1 gap-2" onClick={acceptAiPhotos}>
                    <Check className="h-4 w-4" />
                    Użyj zdjęć AI
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" className="flex-1" onClick={() => setShowAiModal(false)}>
                    Anuluj
                  </Button>
                  <Button 
                    className="flex-1 gap-2"
                    onClick={handleAiEnhance}
                    disabled={aiProcessing || credits < photos.length * 10}
                  >
                    {aiProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Generuj ({photos.length * 10} kredytów)
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tips */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>💡 <strong>Wskazówki:</strong></p>
        <ul className="list-disc list-inside space-y-0.5 ml-2">
          <li>Zdjęcia powinny być w formacie 4:3</li>
          <li>Pokaż szczegółowo wszelkie istniejące uszkodzenia</li>
          <li>Unikaj zdjęć niewyraźnych, prześwietlonych lub zbyt ciemnych</li>
          <li>Zalecamy zamieszczenie co najmniej 8-10 zdjęć</li>
        </ul>
      </div>
    </div>
  );
}
