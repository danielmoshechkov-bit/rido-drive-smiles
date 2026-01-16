import { useState } from 'react';
import { Wand2, Loader2, RotateCcw, Check, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AIPhotoEditorProps {
  imageUrl: string;
  listingType: 'vehicle' | 'real_estate';
  listingId: string;
  photoIndex: number;
  onPhotoEdited: (newUrl: string) => void;
  disabled?: boolean;
}

const QUICK_ACTIONS = [
  { label: 'Rozjaśnij', instruction: 'Rozjaśnij zdjęcie, popraw jasność i kontrast' },
  { label: 'Usuń tło', instruction: 'Usuń rozpraszające elementy z tła, zachowaj główny obiekt' },
  { label: 'Popraw kolory', instruction: 'Popraw nasycenie kolorów i balans bieli' },
  { label: 'Usuń ludzi', instruction: 'Usuń widoczne osoby ze zdjęcia' },
  { label: 'Wyczyść', instruction: 'Usuń śmieci, bałagan i niepotrzebne przedmioty' },
];

export function AIPhotoEditor({
  imageUrl,
  listingType,
  listingId,
  photoIndex,
  onPhotoEdited,
  disabled = false,
}: AIPhotoEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [editedUrl, setEditedUrl] = useState<string | null>(null);
  const [originalUrl] = useState(imageUrl);
  const { toast } = useToast();

  const handleEdit = async (customInstruction?: string) => {
    const editInstruction = customInstruction || instruction;
    if (!editInstruction.trim()) {
      toast({
        title: "Błąd",
        description: "Wpisz instrukcję edycji",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setEditedUrl(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase.functions.invoke('ai-photo-edit', {
        body: {
          imageUrl: originalUrl,
          instruction: editInstruction,
          listingType,
          listingId,
          photoIndex,
          userId: user?.id,
        },
      });

      if (error) throw error;

      if (data?.editedUrl) {
        setEditedUrl(data.editedUrl);
        toast({
          title: "Zdjęcie edytowane",
          description: "Sprawdź podgląd i zaakceptuj lub odrzuć zmiany",
        });
      } else {
        throw new Error(data?.error || 'Nie udało się edytować zdjęcia');
      }
    } catch (error: unknown) {
      console.error('AI Photo edit error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Nie udało się edytować zdjęcia';
      toast({
        title: "Błąd edycji",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAccept = () => {
    if (editedUrl) {
      onPhotoEdited(editedUrl);
      toast({
        title: "Zapisano",
        description: "Edytowane zdjęcie zostało zapisane",
      });
      setIsOpen(false);
      setEditedUrl(null);
      setInstruction('');
    }
  };

  const handleReject = () => {
    setEditedUrl(null);
    toast({
      title: "Odrzucono",
      description: "Zmiany zostały odrzucone",
    });
  };

  const handleReset = () => {
    onPhotoEdited(originalUrl);
    setEditedUrl(null);
    toast({
      title: "Przywrócono",
      description: "Przywrócono oryginalne zdjęcie",
    });
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        className="gap-1"
      >
        <Wand2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">AI</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Edycja zdjęcia AI
            </DialogTitle>
            <DialogDescription>
              Opisz jak chcesz zmodyfikować zdjęcie lub wybierz szybką akcję
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Image comparison */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Oryginał</Label>
                <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                  <img
                    src={originalUrl}
                    alt="Oryginalne zdjęcie"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  {isProcessing ? 'Przetwarzanie...' : editedUrl ? 'Po edycji' : 'Podgląd'}
                </Label>
                <div className="aspect-video rounded-lg overflow-hidden bg-muted relative">
                  {isProcessing ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <span className="text-sm text-muted-foreground">AI pracuje...</span>
                      </div>
                    </div>
                  ) : editedUrl ? (
                    <img
                      src={editedUrl}
                      alt="Edytowane zdjęcie"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm text-muted-foreground">
                        Wybierz akcję lub wpisz instrukcję
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="space-y-2">
              <Label className="text-sm">Szybkie akcje</Label>
              <div className="flex flex-wrap gap-2">
                {QUICK_ACTIONS.map((action) => (
                  <Button
                    key={action.label}
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(action.instruction)}
                    disabled={isProcessing}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom instruction */}
            <div className="space-y-2">
              <Label htmlFor="instruction">Własna instrukcja</Label>
              <div className="flex gap-2">
                <Input
                  id="instruction"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="np. Usuń samochód zaparkowany z prawej strony"
                  disabled={isProcessing}
                  onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
                />
                <Button
                  onClick={() => handleEdit()}
                  disabled={isProcessing || !instruction.trim()}
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-1" />
                      Edytuj
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Action buttons */}
            {editedUrl && (
              <div className="flex justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handleReset}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Przywróć oryginał
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleReject}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Odrzuć
                  </Button>
                  <Button onClick={handleAccept}>
                    <Check className="h-4 w-4 mr-1" />
                    Zaakceptuj
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
