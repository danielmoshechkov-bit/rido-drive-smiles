import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles, Loader2, CheckCircle, Wand2 } from "lucide-react";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { useAIFeatureFlags } from "@/hooks/useAIFeatureFlags";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle
} from "@/components/ui/dialog";

interface AIPhotoSectionProps {
  listingId: string;
  userId: string;
  photos: { id: string; url: string; is_ai_enhanced?: boolean }[];
  onPhotosUpdated: () => void;
}

export function AIPhotoSection({ listingId, userId, photos, onPhotosUpdated }: AIPhotoSectionProps) {
  const { flags, loading: flagsLoading } = useAIFeatureFlags();
  const [showDialog, setShowDialog] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Check feature flag
  const aiPhotoEnabled = flags["ai_photo_edit"] !== false;

  const nonAiPhotos = photos.filter(p => !p.is_ai_enhanced);
  const photosToProcess = Math.min(nonAiPhotos.length, 5);
  const hasAiPhotos = photos.some(p => p.is_ai_enhanced);

  if (photosToProcess === 0 && !hasAiPhotos) return null;

  const handlePurchase = async () => {
    if (photosToProcess === 0) {
      toast.error("Brak zdjęć do obróbki");
      return;
    }

    setProcessing(true);
    setShowDialog(false);
    setProgress(10);

    try {
      // Create order (stub payment - instant success)
      const { data: order, error: orderErr } = await supabase
        .from("ai_photo_orders")
        .insert({
          listing_id: listingId,
          user_id: userId,
          photos_count: photosToProcess,
          amount: 5.00,
          status: "processing",
        })
        .select("id")
        .single();

      if (orderErr) throw orderErr;

      setProgress(30);

      // Process each photo through ai-photo-edit
      const processedUrls: string[] = [];
      for (let i = 0; i < photosToProcess; i++) {
        const photo = nonAiPhotos[i];
        setProgress(30 + ((i + 1) / photosToProcess) * 50);

        try {
          const { data, error } = await supabase.functions.invoke("ai-photo-edit", {
            body: {
              imageUrl: photo.url,
              instruction: "auto-enhance",
              listingType: "vehicle",
              listingId: listingId,
              photoIndex: i,
              userId: userId,
            }
          });

          if (error) {
            console.error("AI photo edit error:", error);
            continue;
          }

          if (data?.editedUrl) {
            processedUrls.push(data.editedUrl);

            // Update photo record
            await supabase
              .from("general_listing_photos")
              .update({
                url: data.editedUrl,
                is_ai_enhanced: true,
                is_protected: true,
              })
              .eq("id", photo.id);
          }
        } catch (err) {
          console.error("Photo processing failed:", err);
        }
      }

      setProgress(90);

      // Update order
      await supabase
        .from("ai_photo_orders")
        .update({
          status: processedUrls.length > 0 ? "completed" : "failed",
          processed_photos: processedUrls,
        })
        .eq("id", order.id);

      setProgress(100);

      if (processedUrls.length > 0) {
        toast.success(`Przetworzono ${processedUrls.length} zdjęć z AI!`);
        onPhotosUpdated();
      } else {
        toast.error("Nie udało się przetworzyć zdjęć. Spróbuj ponownie.");
      }
    } catch (err: any) {
      toast.error(err.message || "Błąd przetwarzania");
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  return (
    <>
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-primary" />
            Ulepsz zdjęcia z AI — 5 zł za pakiet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Before/After demo */}
          <BeforeAfterSlider
            beforeUrl="https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&q=60"
            afterUrl="https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&q=80&sat=30&con=15&bri=10"
          />

          <p className="text-sm text-muted-foreground">
            Twoje zdjęcia mogą wyglądać tak! AI poprawia kolory, jasność, kontrast i kadrowanie.
            Zdjęcia AI są chronione przed kopiowaniem.
          </p>

          {hasAiPhotos && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              Część zdjęć jest już ulepszona przez AI
            </div>
          )}

          {processing ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Trwa obróbka zdjęć...
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Przetwarzanie {photosToProcess} zdjęć — może potrwać do 2 minut
              </p>
            </div>
          ) : (
            photosToProcess > 0 && (
              <Button
                variant="outline"
                className="w-full gap-2 border-primary/40 text-primary hover:bg-primary/5"
                onClick={() => setShowDialog(true)}
              >
                <Wand2 className="h-4 w-4" />
                Kup pakiet AI — 5 zł ({photosToProcess} zdjęć)
              </Button>
            )
          )}
        </CardContent>
      </Card>

      {/* Purchase dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Pakiet AI zdjęć — 5 zł
            </DialogTitle>
            <DialogDescription>
              Profesjonalna obróbka zdjęć przez sztuczną inteligencję
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">{photosToProcess}</Badge>
              <span>zdjęć zostanie przetworzonych</span>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>• Poprawa jasności, kolorów i kontrastu</p>
              <p>• Profesjonalne kadrowanie</p>
              <p>• Ochrona przed kopiowaniem</p>
              <p>• Czas obróbki: ~2 minuty</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Anuluj
            </Button>
            <Button onClick={handlePurchase} className="gap-2">
              <Wand2 className="h-4 w-4" />
              Zapłać 5 zł
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
