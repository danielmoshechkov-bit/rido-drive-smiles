import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  FileText, 
  PenTool, 
  CheckCircle, 
  Mail, 
  Camera, 
  Loader2,
  Send,
  AlertCircle,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SignaturePad } from "./SignaturePad";
import { RentalPhotoProtocol } from "./RentalPhotoProtocol";
import { RentalContractViewer } from "./RentalContractViewer";

type RentalStatus = "draft" | "sent_to_client" | "client_signed" | "fleet_signed" | "finalized";

interface RentalData {
  id: string;
  status: RentalStatus;
  contract_number: string | null;
  driver_signed_at: string | null;
  driver_signature_url: string | null;
  fleet_signed_at: string | null;
  fleet_signature_url: string | null;
  protocol_completed_at: string | null;
  portal_access_token: string | null;
  invitation_email: string | null;
  invitation_sent_at: string | null;
  vehicle: {
    plate: string;
    brand: string;
    model: string;
  };
  driver: {
    first_name: string;
    last_name: string;
    email: string | null;
  };
}

interface RentalContractSignatureFlowProps {
  rentalId: string;
  fleetId: string;
  onComplete?: () => void;
}

export function RentalContractSignatureFlow({ rentalId, fleetId, onComplete }: RentalContractSignatureFlowProps) {
  const [loading, setLoading] = useState(true);
  const [rental, setRental] = useState<RentalData | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [sendingInvitation, setSendingInvitation] = useState(false);
  const [signingAsFleet, setSigningAsFleet] = useState(false);
  const [fleetHasSavedSignature, setFleetHasSavedSignature] = useState(false);
  const [fleetAutoSign, setFleetAutoSign] = useState(true);

  useEffect(() => {
    loadRentalData();
    checkFleetSignature();
  }, [rentalId]);

  const loadRentalData = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from("vehicle_rentals") as any)
        .select(`
          *,
          vehicle:vehicle_id (plate, brand, model),
          driver:driver_id (first_name, last_name, email)
        `)
        .eq("id", rentalId)
        .single();

      if (error) throw error;
      setRental(data);
    } catch (error) {
      console.error("Error loading rental:", error);
      toast.error("Błąd ładowania danych najmu");
    } finally {
      setLoading(false);
    }
  };

  const checkFleetSignature = async () => {
    try {
      const supabaseAny = supabase as any;
      const { data, error } = await supabaseAny
        .from("fleet_signatures")
        .select("*")
        .eq("fleet_id", fleetId)
        .eq("is_active", true)
        .single();

      if (!error && data) {
        setFleetHasSavedSignature(true);
        setFleetAutoSign(data.auto_sign_enabled !== false);
      }
    } catch (error) {
      // No signature found
    }
  };

  const handleSendInvitation = async () => {
    if (!rental?.invitation_email) {
      toast.error("Brak adresu e-mail kierowcy");
      return;
    }

    setSendingInvitation(true);
    try {
      // Generate portal link
      const portalLink = `${window.location.origin}/umowa/${rentalId}?token=${rental.portal_access_token}`;

      // Call edge function to send email
      const { error } = await supabase.functions.invoke("send-rental-invitation", {
        body: {
          rentalId,
          driverEmail: rental.invitation_email,
          driverName: `${rental.driver.first_name} ${rental.driver.last_name}`,
          vehicleInfo: `${rental.vehicle.brand} ${rental.vehicle.model} (${rental.vehicle.plate})`,
          portalLink,
        },
      });

      if (error) throw error;

      // Update rental status
      await (supabase.from("vehicle_rentals") as any)
        .update({ 
          status: "sent_to_client",
          invitation_sent_at: new Date().toISOString()
        })
        .eq("id", rentalId);

      toast.success("Zaproszenie wysłane do klienta!");
      loadRentalData();
    } catch (error: any) {
      console.error("Error sending invitation:", error);
      toast.error(error.message || "Błąd wysyłania zaproszenia");
    } finally {
      setSendingInvitation(false);
    }
  };

  const handleFleetSign = async (signatureDataUrl: string) => {
    setSigningAsFleet(true);
    try {
      // Upload signature to storage
      const blob = await (await fetch(signatureDataUrl)).blob();
      const fileName = `fleet_signatures/${fleetId}/${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from("driver-documents")
        .upload(fileName, blob, { contentType: "image/png" });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("driver-documents")
        .getPublicUrl(fileName);

      // Save fleet signature for future use
      const supabaseAny = supabase as any;
      await supabaseAny.from("fleet_signatures").upsert({
        fleet_id: fleetId,
        signature_url: publicUrl,
        is_active: true,
        auto_sign_enabled: true,
      }, { onConflict: "fleet_id" });

      // Sign the rental
      await (supabase.from("vehicle_rentals") as any)
        .update({
          fleet_signed_at: new Date().toISOString(),
          fleet_signature_url: publicUrl,
          status: "fleet_signed",
        })
        .eq("id", rentalId);

      toast.success("Umowa podpisana przez flotę!");
      setShowSignaturePad(false);
      setFleetHasSavedSignature(true);
      await finalizeContract();
      loadRentalData();
    } catch (error: any) {
      console.error("Error signing:", error);
      toast.error("Błąd zapisywania podpisu");
    } finally {
      setSigningAsFleet(false);
    }
  };

  const handleAutoSign = async () => {
    setSigningAsFleet(true);
    try {
      // Get saved signature
      const supabaseAny = supabase as any;
      const { data: fleetSig } = await supabaseAny
        .from("fleet_signatures")
        .select("signature_url")
        .eq("fleet_id", fleetId)
        .eq("is_active", true)
        .single();

      if (!fleetSig?.signature_url) {
        toast.error("Brak zapisanego podpisu floty");
        setShowSignaturePad(true);
        return;
      }

      // Sign the rental
      await (supabase.from("vehicle_rentals") as any)
        .update({
          fleet_signed_at: new Date().toISOString(),
          fleet_signature_url: fleetSig.signature_url,
          status: "fleet_signed",
        })
        .eq("id", rentalId);

      toast.success("Umowa podpisana automatycznie!");
      await finalizeContract();
      loadRentalData();
    } catch (error: any) {
      console.error("Error auto-signing:", error);
      toast.error("Błąd auto-podpisu");
    } finally {
      setSigningAsFleet(false);
    }
  };

  const finalizeContract = async () => {
    try {
      // Update status to finalized
      await (supabase.from("vehicle_rentals") as any)
        .update({ status: "finalized" })
        .eq("id", rentalId);

      // Update vehicle status
      if (rental?.vehicle) {
        await supabase
          .from("vehicles")
          .update({ status: "wynajęty" })
          .eq("plate", rental.vehicle.plate);
      }

      // TODO: Generate PDF and send emails
      toast.success("Umowa sfinalizowana! Przejdź do protokołu zdjęciowego.");
    } catch (error) {
      console.error("Error finalizing:", error);
    }
  };

  const getStatusStep = (): number => {
    if (!rental) return 0;
    switch (rental.status) {
      case "draft": return 1;
      case "sent_to_client": return 2;
      case "client_signed": return 3;
      case "fleet_signed": return 4;
      case "finalized": return rental.protocol_completed_at ? 6 : 5;
      default: return 0;
    }
  };

  const currentStep = getStatusStep();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!rental) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive">Nie znaleziono danych najmu</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-between overflow-x-auto pb-2">
        {[
          { step: 1, label: "Wygenerowana", icon: FileText },
          { step: 2, label: "Wysłana", icon: Mail },
          { step: 3, label: "Podpis klienta", icon: PenTool },
          { step: 4, label: "Podpis floty", icon: PenTool },
          { step: 5, label: "Finalizacja", icon: CheckCircle },
          { step: 6, label: "Protokół", icon: Camera },
        ].map((item, idx) => (
          <div key={item.step} className="flex items-center">
            <div className={cn(
              "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors",
              currentStep >= item.step
                ? "bg-primary border-primary text-primary-foreground"
                : "border-muted-foreground/30 text-muted-foreground"
            )}>
              {currentStep > item.step ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <item.icon className="h-5 w-5" />
              )}
            </div>
            <span className={cn(
              "ml-2 text-xs font-medium whitespace-nowrap hidden md:inline",
              currentStep >= item.step ? "text-foreground" : "text-muted-foreground"
            )}>
              {item.label}
            </span>
            {idx < 5 && (
              <div className={cn(
                "w-8 h-0.5 mx-2",
                currentStep > item.step ? "bg-primary" : "bg-muted-foreground/30"
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Rental Info */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">
                {rental.vehicle.brand} {rental.vehicle.model} ({rental.vehicle.plate})
              </p>
              <p className="text-sm text-muted-foreground">
                Kierowca: {rental.driver.first_name} {rental.driver.last_name}
              </p>
            </div>
            <Badge variant={currentStep >= 5 ? "default" : "secondary"}>
              {rental.contract_number || `RNT-${rental.id.slice(0, 8).toUpperCase()}`}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Send Invitation */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Wyślij zaproszenie do klienta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Klient otrzyma e-mail z linkiem do portalu, gdzie zapozna się z umową i złoży podpis elektroniczny.
            </p>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <span className="text-muted-foreground">E-mail:</span>{" "}
                <span className="font-medium">{rental.invitation_email || "—"}</span>
              </p>
            </div>
            <Button 
              className="w-full gap-2" 
              onClick={handleSendInvitation}
              disabled={sendingInvitation || !rental.invitation_email}
            >
              {sendingInvitation ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Wyślij zaproszenie
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Waiting for client */}
      {currentStep === 2 && (
        <Card className="border-primary/50">
          <CardContent className="p-6 text-center">
            <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
            <p className="font-medium">Oczekiwanie na klienta</p>
            <p className="text-sm text-muted-foreground mt-2">
              Zaproszenie zostało wysłane. Czekamy na zapoznanie się z umową i podpis klienta.
            </p>
            {rental.invitation_sent_at && (
              <p className="text-xs text-muted-foreground mt-4">
                Wysłano: {new Date(rental.invitation_sent_at).toLocaleString("pl-PL")}
              </p>
            )}
            <Button 
              variant="outline" 
              className="mt-4 gap-2"
              onClick={() => window.open(`/umowa/${rentalId}?token=${rental.portal_access_token}`, "_blank")}
            >
              <ExternalLink className="h-4 w-4" />
              Podgląd portalu klienta
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Client signed, fleet needs to sign */}
      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PenTool className="h-5 w-5" />
              Podpis flotowego
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {rental.driver_signed_at && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">
                  Klient podpisał: {new Date(rental.driver_signed_at).toLocaleString("pl-PL")}
                </span>
              </div>
            )}

            {showSignaturePad ? (
              <SignaturePad
                title="Podpis przedstawiciela floty"
                onSign={handleFleetSign}
                onCancel={() => setShowSignaturePad(false)}
              />
            ) : fleetHasSavedSignature && fleetAutoSign ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Masz zapisany podpis. Możesz podpisać automatycznie lub złożyć nowy podpis.
                </p>
                <div className="flex gap-2">
                  <Button 
                    className="flex-1 gap-2"
                    onClick={handleAutoSign}
                    disabled={signingAsFleet}
                  >
                    {signingAsFleet ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    Podpisz automatycznie
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => setShowSignaturePad(true)}
                  >
                    Nowy podpis
                  </Button>
                </div>
              </div>
            ) : (
              <Button 
                className="w-full gap-2"
                onClick={() => setShowSignaturePad(true)}
              >
                <PenTool className="h-4 w-4" />
                Złóż podpis
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4-5: Finalized, need photo protocol */}
      {(currentStep === 4 || currentStep === 5) && (
        <div className="space-y-6">
          <Card className="border-primary">
            <CardContent className="p-6 text-center">
              <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
              <p className="font-medium text-lg">Umowa podpisana przez obie strony!</p>
              <p className="text-sm text-muted-foreground mt-2">
                Wykonaj protokół zdjęciowy, aby zakończyć wydanie pojazdu.
              </p>
            </CardContent>
          </Card>

          <RentalPhotoProtocol 
            rentalId={rentalId}
            onComplete={() => {
              toast.success("Pojazd wydany! Proces zakończony.");
              onComplete?.();
            }}
          />
        </div>
      )}

      {/* Step 6: Complete */}
      {currentStep === 6 && (
        <Card className="border-primary">
          <CardContent className="p-6 text-center">
            <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
            <p className="font-medium text-lg text-primary">Proces zakończony!</p>
            <p className="text-sm text-muted-foreground mt-2">
              Umowa podpisana, protokół zdjęciowy wykonany. Pojazd został wydany.
            </p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={onComplete}
            >
              Zamknij
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
