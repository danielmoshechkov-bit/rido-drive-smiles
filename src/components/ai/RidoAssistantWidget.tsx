import { useState, useRef, useEffect, useCallback } from "react";
import { 
  MessageCircle, X, Send, Loader2, Paperclip, Upload, Image as ImageIcon, CheckCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RidoAssistantWidgetProps {
  defaultOpen?: boolean;
}

export function RidoAssistantWidget({ defaultOpen = false }: RidoAssistantWidgetProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isAllowed, setIsAllowed] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const allowedEmails = [
        'daniel.moshechkov@gmail.com',
        'anastasiia.shapovalova1991@gmail.com',
        'piotrkrolakartcom@o2.pl',
      ];
      if (user?.email) {
        setUserEmail(user.email);
        if (allowedEmails.includes(user.email.toLowerCase())) {
          setIsAllowed(true);
        }
      }
    };
    checkAccess();
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    setAttachedFiles(prev => [...prev, ...files].slice(0, 5));
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setAttachedFiles(prev => [...prev, ...files].slice(0, 5));
    }
  };

  const removeFile = (idx: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setIsSending(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie zalogowany');

      // Upload screenshots
      const screenshotUrls: string[] = [];
      for (const file of attachedFiles) {
        const ext = file.name.split('.').pop();
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('ticket-screenshots')
          .upload(path, file);
        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('ticket-screenshots')
            .getPublicUrl(path);
          screenshotUrls.push(urlData.publicUrl);
        }
      }

      // Insert ticket
      await (supabase as any)
        .from('support_tickets')
        .insert({
          submitted_by: user.id,
          submitted_by_email: user.email,
          description: description.trim(),
          screenshot_urls: screenshotUrls,
          status: 'new',
        });

      setSent(true);
      toast.success('Zgłoszenie wysłane!');
    } catch (err: any) {
      toast.error('Błąd: ' + (err.message || 'Spróbuj ponownie'));
    } finally {
      setIsSending(false);
    }
  };

  const resetForm = () => {
    setDescription("");
    setAttachedFiles([]);
    setSent(false);
  };

  if (!isAllowed) return null;

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center hover:scale-105"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-[400px] max-w-[calc(100vw-2rem)] bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-primary/10 to-primary/5">
            <div>
              <h3 className="font-semibold">Zgłoś uwagę</h3>
              <p className="text-xs text-muted-foreground">Pomóż nam ulepszyć portal</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setIsOpen(false); resetForm(); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {sent ? (
            <div className="p-8 text-center space-y-4">
              <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
              <div>
                <p className="font-semibold text-lg">Dziękujemy!</p>
                <p className="text-sm text-muted-foreground">Twoje zgłoszenie zostało wysłane. Zajmiemy się nim jak najszybciej.</p>
              </div>
              <Button variant="outline" onClick={resetForm}>Wyślij kolejne</Button>
            </div>
          ) : (
            <div 
              ref={dropRef}
              className="p-4 space-y-4"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                🔧 Pracujemy nad ulepszeniem portalu! Jeśli masz uwagi dotyczące zmian, dodania funkcji, nazwy lub układu — napisz do nas, dodaj screen i wyślij. My to poprawimy!
              </div>

              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Opisz co chciałbyś zmienić lub dodać..."
                rows={4}
                className="resize-none"
              />

              {/* Drop zone / file attachment */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer",
                  isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Przeciągnij pliki tutaj lub <span className="text-primary font-medium">kliknij aby wybrać</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">Screenshoty, zdjęcia (max 5 plików)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {/* Attached files */}
              {attachedFiles.length > 0 && (
                <div className="space-y-2">
                  {attachedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm bg-muted rounded-lg px-3 py-2">
                      <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="truncate flex-1">{file.name}</span>
                      <button onClick={() => removeFile(idx)} className="text-destructive hover:text-destructive/80">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={!description.trim() || isSending}
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Wyślij zgłoszenie
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
