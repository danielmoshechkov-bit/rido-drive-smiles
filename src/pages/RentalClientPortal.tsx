import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { odczytajBladFunkcji } from "@/utils/bladFunkcji";
import { Loader2, AlertCircle, ChevronDown } from "lucide-react";
import { RentalContractViewer } from "@/components/fleet/RentalContractViewer";
import { SignaturePad } from "@/components/fleet/SignaturePad";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
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

  /**
   * Zdarzenia dziennika idą przez `rental-sign`, nie wprost do bazy.
   *
   * Powód: polityka RLS przepuszczała zapis warunkiem `portal_access_token
   * IS NOT NULL` — sprawdzała, że umowa MA token, nie że wołający go ZNA.
   * Każdy mógł dopisać dowolne zdarzenie do dowolnej umowy, z dowolnym IP.
   * Teraz token porównuje serwer, a adres i przeglądarkę ustala z nagłówków
   * żądania zamiast wierzyć w to, co przyszło z przeglądarki.
   */
  const logAction = async (actionType: string, metadata: Record<string, any> = {}) => {
    if (!rentalId) return;
    try {
      await supabase.functions.invoke("rental-sign", {
        body: { rentalId, token: accessToken, action: actionType, metadata },
      });
    } catch (error) {
      console.error("Error logging action:", error);
    }
  };

  const validateAccess = async () => {
    try {
      // Umowę oddaje `rental-portal-get`, nie zapytanie z przeglądarki.
      //
      // Polityka RLS przepuszczała odczyt warunkiem `portal_access_token
      // IS NOT NULL` — sprawdzała, że umowa MA token, a nie że wołający go ZNA.
      // Filtr po tokenie dokładał ten kod i wystarczyło go pominąć, żeby
      // pobrać dowolną umowę. Teraz token porównuje serwer.
      const { data: odpowiedz, error } = await supabase.functions.invoke("rental-portal-get", {
        body: { rentalId, token: accessToken },
      });

      const data = (odpowiedz as any)?.umowa;

      if (error || !data) {
        const blad = error ? await odczytajBladFunkcji(error) : null;
        setStep("error");
        setErrorMessage(blad?.komunikat ?? "Link jest nieprawidłowy lub wygasł");
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

      // Sprawdzenia „czy umowa istnieje" nie robimy tutaj. Robił je odczyt
      // z przeglądarki, pobierając przy okazji `portal_access_token` — czyli
      // pytał bazę o sekret, który miał dopiero potwierdzić. `rental-sign`
      // weryfikuje istnienie umowy, token i status po stronie serwera
      // i odmawia czytelnym komunikatem.

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

      // 3. Podpis zapisuje SERWER, nie przeglądarka.
      //
      // Poprzedni komentarz brzmiał „już zweryfikowaliśmy dostęp wcześniej" —
      // ale ta weryfikacja działa się w przeglądarce, a polityka RLS wymagała
      // tylko, żeby umowa miała jakikolwiek token. Każdy mógł oznaczyć dowolną
      // umowę jako podpisaną, podstawiając własny obrazek.
      //
      // `rental-sign` porównuje token z wierszem umowy, odmawia przy nieważnym,
      // odmawia przy umowie już podpisanej i sam ustala IP oraz przeglądarkę.
      // Zdarzenie dziennika zapisuje w tym samym wywołaniu.
      const { data: wynik, error: bladPodpisu } = await supabase.functions.invoke("rental-sign", {
        body: {
          rentalId,
          token: accessToken,
          action: "signature_submitted",
          signatureUrl: publicUrl,
          metadata: { signature_url: publicUrl },
        },
      });

      if (bladPodpisu) {
        const blad = await odczytajBladFunkcji(bladPodpisu);
        throw new Error(blad.komunikat);
      }
      if ((wynik as any)?.error) {
        throw new Error((wynik as any).message || "Nie udało się zapisać podpisu");
      }

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
        <div className="container mx-auto px-4 py-4 relative flex items-center justify-center">
          <img src={logoSrc} alt="GetRido" className="h-8" />
          <div className="absolute right-4">
            <LanguageSwitcher />
          </div>
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