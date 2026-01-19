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
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Upload, X, Sparkles, Loader2, Image as ImageIcon, 
  ArrowLeft, ArrowRight, Check, AlertCircle, Wand2, Star, GripVertical
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
  const [isDragging, setIsDragging] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [draggedPhotoIndex, setDraggedPhotoIndex] = useState<number | null>(null);
  
  const { credits, deductCredits, loading: creditsLoading } = useUserCredits(userId);

  // Shared function to process files (used by both input and drag & drop)
  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    // Filter only images
    const imageFiles = files.filter(f => f.type.startsWith('image/') || f.name.match(/\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff)$/i));
    if (imageFiles.length === 0) {
      toast.error("Wybierz pliki graficzne");
      return;
    }

    const remainingSlots = maxPhotos - photos.length;
    if (imageFiles.length > remainingSlots) {
      toast.error(`Możesz dodać jeszcze ${remainingSlots} zdjęć`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const newPhotos: string[] = [];
      const totalFiles = imageFiles.length;

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        
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
    }
  }, [photos, maxPhotos, userId, onPhotosChange]);

  // Drag & drop handlers for upload zone
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (photos.length >= maxPhotos) {
      toast.error("Osiągnięto limit zdjęć");
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    await processFiles(files);
  }, [photos.length, maxPhotos, processFiles]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await processFiles(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [processFiles]);

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    onPhotosChange(newPhotos);
    
    if (aiPhotos.length > index) {
      const newAiPhotos = aiPhotos.filter((_, i) => i !== index);
      onAiPhotosChange(newAiPhotos);
    }
  };

  const movePhoto = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= photos.length) return;
    const newPhotos = [...photos];
    const [movedPhoto] = newPhotos.splice(fromIndex, 1);
    newPhotos.splice(toIndex, 0, movedPhoto);
    onPhotosChange(newPhotos);
    
    // Also move AI photos if they exist
    if (aiPhotos.length > 0) {
      const newAiPhotos = [...aiPhotos];
      const [movedAiPhoto] = newAiPhotos.splice(fromIndex, 1);
      newAiPhotos.splice(toIndex, 0, movedAiPhoto);
      onAiPhotosChange(newAiPhotos);
    }
  };

  // Photo reordering via drag
  const handlePhotoDragStart = (e: React.DragEvent, index: number) => {
    setDraggedPhotoIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handlePhotoDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handlePhotoDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedPhotoIndex !== null && draggedPhotoIndex !== targetIndex) {
      movePhoto(draggedPhotoIndex, targetIndex);
    }
    setDraggedPhotoIndex(null);
  };

  const handlePhotoDragEnd = () => {
    setDraggedPhotoIndex(null);
  };

  // AI selection helpers
  const togglePhotoForAi = (index: number) => {
    setSelectedForAi(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const selectAllForAi = () => {
    setSelectedForAi(photos.map((_, i) => i));
  };

  const deselectAllForAi = () => {
    setSelectedForAi([]);
  };

  const aiCost = (selectedForAi.length > 0 ? selectedForAi.length : photos.length) * 10;

  const handleAiEnhance = async () => {
    if (photos.length === 0) {
      toast.error("Najpierw dodaj zdjęcia");
      return;
    }
    
    const selectedCount = selectedForAi.length > 0 ? selectedForAi.length : photos.length;
    const totalCost = selectedCount * 10;
    
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

      await deductCredits(totalCost, "vehicle_photo_enhance");

      setPreviewPairs(results);
      
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
      {/* Upload zone with drag & drop */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer",
          "hover:border-primary/50 hover:bg-muted/50",
          isDragging && "border-primary bg-primary/10 scale-[1.02]",
          photos.length >= maxPhotos && "opacity-50 cursor-not-allowed"
        )}
        onClick={() => photos.length < maxPhotos && fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          disabled={photos.length >= maxPhotos}
        />
        
        {isDragging ? (
          <div className="space-y-4">
            <Upload className="h-10 w-10 mx-auto text-primary animate-bounce" />
            <p className="font-medium text-primary">Upuść zdjęcia tutaj!</p>
          </div>
        ) : uploading ? (
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

      {/* Photos grid with numbering, drag reorder, and delete on hover */}
      {photos.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Kolejność wyświetlania na portalu • Przeciągnij aby zmienić
            </p>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
            <TooltipProvider>
              {photos.map((photo, index) => (
                <Tooltip key={index}>
                  <TooltipTrigger asChild>
                    <div
                      draggable
                      onDragStart={(e) => handlePhotoDragStart(e, index)}
                      onDragOver={handlePhotoDragOver}
                      onDrop={(e) => handlePhotoDrop(e, index)}
                      onDragEnd={handlePhotoDragEnd}
                      className={cn(
                        "relative aspect-[4/3] rounded-lg overflow-hidden group cursor-grab active:cursor-grabbing",
                        "border-2 transition-all",
                        index === 0 ? "border-primary ring-2 ring-primary/30" : "border-transparent",
                        hasAiPhotos && aiPhotos[index] && "border-purple-500",
                        draggedPhotoIndex === index && "opacity-50 scale-95"
                      )}
                    >
                      <img
                        src={hasAiPhotos && aiPhotos[index] ? aiPhotos[index] : photo}
                        alt={`Zdjęcie ${index + 1}`}
                        className="w-full h-full object-cover"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewPhoto(hasAiPhotos && aiPhotos[index] ? aiPhotos[index] : photo);
                        }}
                      />
                      
                      {/* Main photo badge with star */}
                      {index === 0 && (
                        <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded flex items-center gap-1 shadow">
                          <Star className="h-3 w-3" />
                          Główne
                        </div>
                      )}
                      
                      {/* AI badge */}
                      {hasAiPhotos && aiPhotos[index] && (
                        <div className="absolute top-1 right-8 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          AI
                        </div>
                      )}

                      {/* Delete button - always visible in corner on hover */}
                      <button
                        className="absolute top-1 right-1 h-6 w-6 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-lg z-10"
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          removePhoto(index); 
                        }}
                      >
                        <X className="h-4 w-4" />
                      </button>

                      {/* Photo number - bottom left */}
                      <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-2 py-0.5 rounded font-medium">
                        {index + 1}
                      </div>

                      {/* Drag indicator on hover */}
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <GripVertical className="h-6 w-6 text-white" />
                      </div>

                      {/* Move buttons */}
                      <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {index > 0 && (
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-6 w-6"
                            onClick={(e) => { e.stopPropagation(); movePhoto(index, index - 1); }}
                          >
                            <ArrowLeft className="h-3 w-3" />
                          </Button>
                        )}
                        {index < photos.length - 1 && (
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-6 w-6"
                            onClick={(e) => { e.stopPropagation(); movePhoto(index, index + 1); }}
                          >
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {index === 0 ? "Zdjęcie główne - wyświetlane jako pierwsze" : `Zdjęcie ${index + 1}`}
                  </TooltipContent>
                </Tooltip>
              ))}
            </TooltipProvider>
          </div>
        </>
      )}

      {/* Before/After AI Example - shown when photos are added */}
      {photos.length > 0 && (
        <Card className="p-4 bg-gradient-to-r from-purple-500/5 to-pink-500/5 border-purple-500/20">
          <p className="text-sm font-medium mb-3 text-center flex items-center justify-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Zobacz różnicę z AI
          </p>
          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground text-center font-medium uppercase tracking-wide">Przed</div>
              <img 
                src="/example-before.jpg" 
                className="aspect-[4/3] object-cover rounded-lg border shadow-sm" 
                alt="Przykład przed"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-primary text-center font-medium uppercase tracking-wide">Po (AI)</div>
              <img 
                src="/example-after.jpg" 
                className="aspect-[4/3] object-cover rounded-lg border-2 border-primary shadow-lg" 
                alt="Przykład po"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Profesjonalne tło studyjne, idealne oświetlenie • <strong className="text-primary">10 kredytów/zdjęcie</strong>
          </p>
        </Card>
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
              onClick={() => {
                setSelectedForAi([]);
                setShowAiModal(true);
              }}
              className="gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              disabled={creditsLoading}
            >
              <Sparkles className="h-4 w-4" />
              Popraw zdjęcia
            </Button>
          </div>
        </Card>
      )}

      {/* AI Modal with photo selection */}
      <Dialog open={showAiModal} onOpenChange={setShowAiModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Popraw zdjęcia z Rido AI
            </DialogTitle>
            <DialogDescription>
              Wybierz które zdjęcia chcesz przekształcić w profesjonalne sesje studyjne
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Photo selection grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Wybierz zdjęcia do poprawy:</span>
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={selectAllForAi}
                    disabled={selectedForAi.length === photos.length}
                  >
                    Zaznacz wszystkie
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={deselectAllForAi}
                    disabled={selectedForAi.length === 0}
                  >
                    Odznacz
                  </Button>
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-2">
                {photos.map((photo, i) => (
                  <div 
                    key={i}
                    className={cn(
                      "relative aspect-[4/3] rounded-lg cursor-pointer border-2 transition-all overflow-hidden",
                      selectedForAi.includes(i) ? "border-primary ring-2 ring-primary/30" : "border-muted hover:border-muted-foreground/50"
                    )}
                    onClick={() => togglePhotoForAi(i)}
                  >
                    <img src={photo} className="w-full h-full object-cover" alt={`Zdjęcie ${i + 1}`} />
                    {selectedForAi.includes(i) && (
                      <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                    <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                      {i + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cost summary */}
            <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-primary" />
                <span className="text-sm">
                  Wybrano: <strong>{selectedForAi.length > 0 ? selectedForAi.length : photos.length}</strong> zdjęć × 10 = <strong className="text-primary">{aiCost} kredytów</strong>
                </span>
              </div>
              <span className="text-sm">
                Twoje: <strong className={cn(credits >= aiCost ? "text-green-600" : "text-destructive")}>{credits}</strong>
              </span>
            </div>

            {/* Before/After example in modal */}
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm font-medium mb-3">Przykład transformacji:</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground text-center uppercase tracking-wide">Przed</p>
                  <img 
                    src="/example-before.jpg" 
                    className="aspect-[4/3] object-cover rounded-lg border" 
                    alt="Przed"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-primary text-center uppercase tracking-wide">Po (AI)</p>
                  <img 
                    src="/example-after.jpg" 
                    className="aspect-[4/3] object-cover rounded-lg border-2 border-primary" 
                    alt="Po"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                Tło zostanie zamienione na profesjonalne studyjne. Wszystkie szczegóły pojazdu (w tym uszkodzenia) pozostaną bez zmian.
              </p>
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
                    disabled={aiProcessing || credits < aiCost}
                  >
                    {aiProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Generuj ({aiCost} kredytów)
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox preview */}
      <Dialog open={!!previewPhoto} onOpenChange={() => setPreviewPhoto(null)}>
        <DialogContent className="max-w-4xl p-2">
          <img 
            src={previewPhoto || ""} 
            className="w-full h-auto rounded-lg" 
            alt="Podgląd zdjęcia"
          />
        </DialogContent>
      </Dialog>

      {/* Tips */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>💡 <strong>Wskazówki:</strong></p>
        <ul className="list-disc list-inside space-y-0.5 ml-2">
          <li>Pierwsze zdjęcie będzie wyświetlane jako główne na liście</li>
          <li>Przeciągnij zdjęcia aby zmienić ich kolejność</li>
          <li>Pokaż szczegółowo wszelkie istniejące uszkodzenia</li>
          <li>Zalecamy zamieszczenie co najmniej 8-10 zdjęć</li>
        </ul>
      </div>
    </div>
  );
}
