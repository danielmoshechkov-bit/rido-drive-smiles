import { useState, useRef, useEffect, useCallback } from "react";
import { 
  MessageCircle, X, Send, Loader2, Upload, Image as ImageIcon, CheckCircle, Lock, ZoomIn
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface RidoAssistantWidgetProps {
  defaultOpen?: boolean;
}

export function RidoAssistantWidget({ defaultOpen = false }: RidoAssistantWidgetProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAllowed, setIsAllowed] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) {
        setIsLoggedIn(false);
        setIsAllowed(false);
        return;
      }
      setIsLoggedIn(true);
      setUserEmail(session.user.email);

      // Check DB whitelist
      const { data: whitelist } = await (supabase as any)
        .from('support_ticket_whitelist')
        .select('email')
        .eq('is_active', true);

      const whitelistEmails = (whitelist || []).map((w: any) => w.email.toLowerCase());
      
      // Fallback hardcoded list
      const hardcoded = [
        'daniel.moshechkov@gmail.com',
        'anastasiia.shapovalova1991@gmail.com',
      ];

      const allAllowed = [...new Set([...whitelistEmails, ...hardcoded])];
      setIsAllowed(allAllowed.includes(session.user.email.toLowerCase()));
    };
    
    checkAccess();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user?.email) {
        setIsLoggedIn(false);
        setIsAllowed(false);
      } else {
        setIsLoggedIn(true);
        setUserEmail(session.user.email);
        checkAccess();
      }
    });
    
    return () => subscription.unsubscribe();
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
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    setAttachedFiles(prev => [...prev, ...files].slice(0, 5));
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
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

      const { error: ticketError } = await supabase
        .from('support_tickets')
        .insert({
          submitted_by_email: user.email,
          description: description.trim(),
          screenshot_urls: screenshotUrls,
          status: 'new',
        } as any);
      if (ticketError) throw ticketError;

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

  // Determine if user can submit
  const canSubmit = isLoggedIn && isAllowed;

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
          <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-primary/10 to-primary/5">
            <div>
              <h3 className="font-semibold">Zgłoś uwagę</h3>
              <p className="text-xs text-muted-foreground">Pomóż nam ulepszyć portal</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setIsOpen(false); resetForm(); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {!canSubmit ? (
            /* BLOCKED STATE - not logged in or not on whitelist */
            <div className="p-8 text-center space-y-4">
              <Lock className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
              <div>
                <p className="font-semibold text-lg">Funkcja chwilowo wyłączona</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Pracujemy nad systemem zgłoszeń. Niedługo uruchomimy tę funkcję dla wszystkich użytkowników.
                </p>
                {!isLoggedIn && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Zaloguj się, aby sprawdzić dostęp.
                  </p>
                )}
              </div>
            </div>
          ) : sent ? (
            <div className="p-8 text-center space-y-4">
              <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
              <div>
                <p className="font-semibold text-lg">Dziękujemy!</p>
                <p className="text-sm text-muted-foreground">Twoje zgłoszenie zostało wysłane.</p>
              </div>
              <Button variant="outline" onClick={resetForm}>Wyślij kolejne</Button>
            </div>
          ) : (
            <div className="p-4 space-y-4">
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

              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer",
                  isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
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

              {/* Photo thumbnails with preview */}
              {attachedFiles.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {attachedFiles.map((file, idx) => {
                    const url = URL.createObjectURL(file);
                    return (
                      <div key={idx} className="relative group">
                        <img
                          src={url}
                          className="h-16 w-16 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                          alt={file.name}
                          onClick={() => setPreviewImage(url)}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-4 w-4 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setPreviewImage(url)}
                          className="absolute bottom-0 right-0 bg-background/80 rounded-tl p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <ZoomIn className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
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

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-2xl p-2">
          {previewImage && (
            <img src={previewImage} className="w-full rounded" alt="Podgląd" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
