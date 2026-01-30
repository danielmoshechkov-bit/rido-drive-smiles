import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, AlertCircle } from "lucide-react";
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

  useEffect(() => {
    if (!rentalId || !accessToken) {
      setStep("error");
      setErrorMessage("Nieprawidłowy link do umowy");
      return;
    }
    validateAccess();
  }, [rentalId, accessToken]);

  const validateAccess = async () => {
    try {
      const { data, error } = await (supabase
        .from("vehicle_rentals") as any)
        .select(`
          id,
          status,
          driver_signed_at,
          portal_access_token,
          vehicle:vehicle_id (brand, model, plate),
          driver:driver_id (first_name, last_name)
        `)
        .eq("id", rentalId)
        .eq("portal_access_token", accessToken)
        .single();

      if (error || !data) {
        setStep("error");
        setErrorMessage("Link jest nieprawidłowy lub wygasł");
        return;
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

  const handleContractAccepted = () => {
    setStep("signature");
  };

  const handleSignatureSubmit = async (signatureDataUrl: string) => {
    if (!rentalId) return;

    setIsSigning(true);
    try {
      // Upload signature to storage
      const blob = await (await fetch(signatureDataUrl)).blob();
      const fileName = `driver_signatures/${rentalId}/${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from("driver-documents")
        .upload(fileName, blob, { contentType: "image/png" });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("driver-documents")
        .getPublicUrl(fileName);

      // Update rental with signature
      const { error: updateError } = await (supabase
        .from("vehicle_rentals") as any)
        .update({
          driver_signed_at: new Date().toISOString(),
          driver_signature_url: publicUrl,
          status: "client_signed",
        })
        .eq("id", rentalId)
        .eq("portal_access_token", accessToken);

      if (updateError) throw updateError;

      toast.success("Umowa podpisana pomyślnie!");
      setStep("complete");
    } catch (error: any) {
      console.error("Signature error:", error);
      toast.error("Błąd zapisywania podpisu. Spróbuj ponownie.");
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

        {/* Contract Viewer */}
        {step === "contract" && rentalId && accessToken && (
          <RentalContractViewer
            rentalId={rentalId}
            accessToken={accessToken}
            onSigned={handleContractAccepted}
          />
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
