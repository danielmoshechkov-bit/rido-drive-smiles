import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, AlertCircle, ChevronDown } from "lucide-react";
import { RentalContractViewer } from "@/components/fleet/RentalContractViewer";
import { SignaturePad } from "@/components/fleet/SignaturePad";
import logoSrc from "@/assets/logo.svg";

type PortalStep = "loading" | "error" | "contract" | "signature" | "complete";

export default function RentalClientPortal() {
  const { rentalId } = useParams<{ rentalId: string }>();
  const [searchParams] = useSearchParams();
  const accessToken = searchParams.get("token");

  const [step, setStep] = useState<PortalStep>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [rentalData, setRentalData] = useState<any>(null);
  const [isSigning, setIsSigning] = useState(false);
  
  // Contract acceptance state
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
  const [acceptContract, setAcceptContract] = useState(false);
  const [acceptOWU, setAcceptOWU] = useState(false);
  const [acceptRODO, setAcceptRODO] = useState(false);
  const contractRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rentalId) {
      setStep("error");
      setErrorMessage("Nieprawidłowy link do umowy");
      return;
    }
    validateAccess();
    if (accessToken) {
      logAction("contract_viewed");
    }
  }, [rentalId, accessToken]);

  const logAction = async (actionType: string, metadata: Record<string, any> = {}) => {
    if (!rentalId) return;
    try {
      await (supabase.from("contract_signature_logs") as any).insert({
        rental_id: rentalId,
        action_type: actionType,
        actor_type: "driver",
        ip_address: null, // Will be enhanced server-side
        user_agent: navigator.userAgent,
        metadata
      });
    } catch (error) {
      console.error("Error logging action:", error);
    }
  };

  const validateAccess = async () => {
    try {
      // First try to find rental by ID (for fleet managers opening link)
      let query = (supabase.from("vehicle_rentals") as any)
        .select(`
          id,
          status,
          driver_signed_at,
          portal_access_token,
          contract_locked_at,
          vehicle:vehicle_id (brand, model, plate),
          driver:driver_id (first_name, last_name)
        `)
        .eq("id", rentalId);
      
      // If token is provided, validate it
      if (accessToken) {
        query = query.eq("portal_access_token", accessToken);
      }
      
      const { data, error } = await query.single();

      if (error || !data) {
        console.error("Rental not found:", error);
        setStep("error");
        setErrorMessage("Link jest nieprawidłowy lub wygasł");
        return;
      }

      // If no token in URL but rental has token, require it for non-authenticated access
      if (!accessToken && data.portal_access_token) {
        // Check if user is authenticated and is fleet manager
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setStep("error");
          setErrorMessage("Link jest nieprawidłowy lub wygasł");
          return;
        }
      }

      setRentalData(data);

      // Check if already signed
      if (data.driver_signed_at) {
        setStep("complete");
      } else {
        setStep("contract");
      }
    } catch (error: any) {
      console.error("Validation error:", error);
      setStep("error");
      setErrorMessage("Wystąpił błąd. Spróbuj ponownie później.");
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const isAtBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 50;
    if (isAtBottom && !hasScrolledToEnd) {
      setHasScrolledToEnd(true);
    }
  };

  const canProceedToSignature = hasScrolledToEnd && acceptContract && acceptOWU && acceptRODO;

  const handleContractAccepted = () => {
    logAction("checkboxes_accepted", {
      acceptContract,
      acceptOWU,
      acceptRODO,
      scrolledToEnd: hasScrolledToEnd
    });
    setStep("signature");
  };

  const handleSignatureSubmit = async (signatureDataUrl: string) => {
    if (!rentalId) return;

    setIsSigning(true);
    try {
      await logAction("signature_drawn");

      // 1. Sprawdź czy rental istnieje
      const { data: existingRental, error: checkError } = await (supabase
        .from("vehicle_rentals") as any)
        .select("id, status, portal_access_token")
        .eq("id", rentalId)
        .single();
      
      if (checkError || !existingRental) {
        console.error("Rental not found:", checkError);
        toast.error("Nie znaleziono umowy");
        return;
      }

      console.log("Found rental:", existingRental.id, "status:", existingRental.status);

      // 2. Upload signature to storage
      const blob = await (await fetch(signatureDataUrl)).blob();
      const fileName = `driver_signatures/${rentalId}/${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from("driver-documents")
        .upload(fileName, blob, { contentType: "image/png" });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("driver-documents")
        .getPublicUrl(fileName);

      console.log("Signature uploaded:", publicUrl);

      // 3. Update rental - BEZ filtra po tokenie (już zweryfikowaliśmy dostęp wcześniej)
      const { error: updateError } = await (supabase
        .from("vehicle_rentals") as any)
        .update({
          driver_signed_at: new Date().toISOString(),
          driver_signature_url: publicUrl,
          driver_signature_user_agent: navigator.userAgent,
          status: "client_signed",
        })
        .eq("id", rentalId);

      if (updateError) {
        console.error("Update error:", updateError);
        throw updateError;
      }

      await logAction("signature_submitted", { signature_url: publicUrl });

      toast.success("Umowa podpisana pomyślnie!");
      setStep("complete");
    } catch (error: any) {
      console.error("Signature error:", error);
      toast.error("Błąd zapisywania podpisu: " + (error?.message || "Nieznany błąd"));
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-center">
          <img src={logoSrc} alt="GetRido" className="h-8" />
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Loading */}
        {step === "loading" && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <Card className="border-destructive">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-destructive mb-2">
                Nie można otworzyć umowy
              </h1>
              <p className="text-muted-foreground">{errorMessage}</p>
            </CardContent>
          </Card>
        )}

        {/* Contract Viewer - uses RentalContractViewer which has its own checkboxes */}
        {step === "contract" && rentalId && (
          <div className="space-y-6">
            {/* RentalContractViewer handles everything: document, scroll tracking, checkboxes, and button */}
            <RentalContractViewer
              rentalId={rentalId}
              accessToken={accessToken || undefined}
              onSigned={() => setStep("signature")}
            />
          </div>
        )}

        {/* Signature */}
        {step === "signature" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold">Podpis elektroniczny</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Złóż podpis palcem lub rysikiem w polu poniżej
              </p>
            </div>

            <SignaturePad
              title="Twój podpis"
              onSign={handleSignatureSubmit}
              onCancel={() => setStep("contract")}
            />

            {isSigning && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Zapisywanie podpisu...</span>
              </div>
            )}
          </div>
        )}

        {/* Complete */}
        {step === "complete" && (
          <Card className="border-primary">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="h-8 w-8 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-primary mb-2">
                Umowa została podpisana
              </h1>
              <p className="text-muted-foreground mb-4">
                Dziękujemy! Dokumenty zostały zapisane i zostaną przesłane na Twój adres e-mail po podpisaniu przez przedstawiciela floty.
              </p>
              {rentalData && (
                <div className="p-4 bg-muted rounded-lg text-left text-sm">
                  <p>
                    <span className="text-muted-foreground">Pojazd:</span>{" "}
                    <span className="font-medium">
                      {rentalData.vehicle?.brand} {rentalData.vehicle?.model} ({rentalData.vehicle?.plate})
                    </span>
                  </p>
                  <p className="mt-1">
                    <span className="text-muted-foreground">Najemca:</span>{" "}
                    <span className="font-medium">
                      {rentalData.driver?.first_name} {rentalData.driver?.last_name}
                    </span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="container mx-auto px-4 py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} GetRido. Wszystkie prawa zastrzeżone.
        </div>
      </footer>
    </div>
  );
}