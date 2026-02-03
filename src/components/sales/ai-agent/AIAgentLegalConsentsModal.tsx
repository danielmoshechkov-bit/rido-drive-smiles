import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Shield, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AIAgentLegalConsentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configId: string;
  userId: string;
  onAccepted: () => void;
  recordingEnabled?: boolean;
}

const CONSENT_VERSION = "v1.0-2026-02-03";

export function AIAgentLegalConsentsModal({
  open,
  onOpenChange,
  configId,
  userId,
  onAccepted,
  recordingEnabled = false,
}: AIAgentLegalConsentsModalProps) {
  const [processing, setProcessing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [consents, setConsents] = useState({
    ai_call_processing: false,
    ai_call_contacting: false,
    ai_call_recording_optional: false,
  });

  const canSubmit = consents.ai_call_processing && consents.ai_call_contacting;

  const handleAccept = async () => {
    if (!canSubmit) return;
    
    setProcessing(true);
    try {
      const consentsToSave = [
        {
          user_id: userId,
          config_id: configId,
          consent_type: "ai_call_processing",
          version: CONSENT_VERSION,
          accepted: true,
          accepted_at: new Date().toISOString(),
          ip_address: "browser",
          user_agent: navigator.userAgent,
        },
        {
          user_id: userId,
          config_id: configId,
          consent_type: "ai_call_contacting",
          version: CONSENT_VERSION,
          accepted: true,
          accepted_at: new Date().toISOString(),
          ip_address: "browser",
          user_agent: navigator.userAgent,
        },
      ];

      if (recordingEnabled && consents.ai_call_recording_optional) {
        consentsToSave.push({
          user_id: userId,
          config_id: configId,
          consent_type: "ai_call_recording_optional",
          version: CONSENT_VERSION,
          accepted: true,
          accepted_at: new Date().toISOString(),
          ip_address: "browser",
          user_agent: navigator.userAgent,
        });
      }

      const { error } = await supabase
        .from("ai_call_legal_consents")
        .upsert(consentsToSave, { 
          onConflict: "user_id,config_id,consent_type",
          ignoreDuplicates: false 
        });

      if (error) throw error;

      toast.success("Zgody zapisane. AI oddzwanianie zostało włączone.");
      onAccepted();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving consents:", error);
      toast.error("Błąd zapisu zgód: " + (error as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Zgody wymagane do AI oddzwaniania
          </DialogTitle>
          <DialogDescription>
            Aby włączyć automatyczne oddzwanianie AI, musisz zaakceptować poniższe zgody.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Consent 1: Processing */}
          <div className="flex items-start space-x-3 p-3 border rounded-lg">
            <Checkbox
              id="consent_processing"
              checked={consents.ai_call_processing}
              onCheckedChange={(checked) =>
                setConsents({ ...consents, ai_call_processing: checked as boolean })
              }
            />
            <div className="space-y-1">
              <Label htmlFor="consent_processing" className="font-medium cursor-pointer">
                Zgoda na przetwarzanie danych do AI Call *
              </Label>
              <p className="text-sm text-muted-foreground">
                Wyrażam zgodę na przetwarzanie danych moich leadów przez system AI w celu 
                automatycznego kontaktu telefonicznego i kwalifikacji.
              </p>
            </div>
          </div>

          {/* Consent 2: Contacting */}
          <div className="flex items-start space-x-3 p-3 border rounded-lg">
            <Checkbox
              id="consent_contacting"
              checked={consents.ai_call_contacting}
              onCheckedChange={(checked) =>
                setConsents({ ...consents, ai_call_contacting: checked as boolean })
              }
            />
            <div className="space-y-1">
              <Label htmlFor="consent_contacting" className="font-medium cursor-pointer">
                Zgoda na kontakt telefoniczny AI *
              </Label>
              <p className="text-sm text-muted-foreground">
                Wyrażam zgodę na wykonywanie połączeń telefonicznych przez system AI 
                w imieniu mojej firmy do osób, które zostawiły swoje dane kontaktowe.
              </p>
            </div>
          </div>

          {/* Consent 3: Recording (optional) */}
          {recordingEnabled && (
            <div className="flex items-start space-x-3 p-3 border rounded-lg bg-muted/50">
              <Checkbox
                id="consent_recording"
                checked={consents.ai_call_recording_optional}
                onCheckedChange={(checked) =>
                  setConsents({ ...consents, ai_call_recording_optional: checked as boolean })
                }
              />
              <div className="space-y-1">
                <Label htmlFor="consent_recording" className="font-medium cursor-pointer">
                  Zgoda na nagrywanie rozmów (opcjonalne)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Wyrażam zgodę na nagrywanie rozmów telefonicznych w celu poprawy jakości 
                  obsługi i szkolenia systemu AI.
                </p>
              </div>
            </div>
          )}

          {/* Version info */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <span>Wersja dokumentu: {CONSENT_VERSION}</span>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs">
              Zobacz pełną treść <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={handleAccept} disabled={!canSubmit || processing}>
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Zapisuję...
              </>
            ) : (
              "Akceptuję i włączam AI oddzwanianie"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
