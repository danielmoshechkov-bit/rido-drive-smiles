import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  ExternalLink,
  Phone,
  Pencil,
  Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SignaturePad } from "./SignaturePad";
import { RentalPhotoProtocol } from "./RentalPhotoProtocol";
import { RentalContractViewer } from "./RentalContractViewer";
import { EditDriverDataModal } from "./EditDriverDataModal";
import { generateRentalContractHtml, ContractData } from "@/utils/rentalContractGenerator";

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
  invitation_phone: string | null;
  invitation_sent_at: string | null;
  invitation_sms_sent_at: string | null;
  invitation_method: string | null;
  contract_locked_at: string | null;
  vehicle: {
    id: string;
    plate: string;
    brand: string;
    model: string;
  };
  driver: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    pesel: string | null;
    address_street: string | null;
    address_city: string | null;
    address_postal_code: string | null;
    license_number: string | null;
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
  const [invitationMethod, setInvitationMethod] = useState<"email" | "sms" | "both">("email");
  const [showContractPreview, setShowContractPreview] = useState(false);
  const [showEditDriver, setShowEditDriver] = useState(false);

  // Check if contract is locked (after both signatures)
  const isContractLocked = rental?.contract_locked_at !== null;

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
          vehicle:vehicle_id (id, plate, brand, model),
          driver:driver_id (id, first_name, last_name, email, phone, pesel, address_street, address_city, address_postal_code, license_number)
        `)
        .eq("id", rentalId)
        .single();

      if (error) throw error;
      setRental(data);
      if (data?.invitation_method) {
        setInvitationMethod(data.invitation_method);
      }
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

  const logSignatureAction = async (actionType: string, metadata: Record<string, any> = {}) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase.from("contract_signature_logs") as any).insert({
        rental_id: rentalId,
        action_type: actionType,
        actor_type: "fleet",
        actor_email: user?.email,
        ip_address: null, // Will be set by edge function for better accuracy
        user_agent: navigator.userAgent,
        metadata
      });
    } catch (error) {
      console.error("Error logging action:", error);
    }
  };

  const handleSendInvitation = async () => {
    if (!rental) return;
    
    const canSendEmail = rental.invitation_email && (invitationMethod === "email" || invitationMethod === "both");
    const canSendSMS = rental.invitation_phone && (invitationMethod === "sms" || invitationMethod === "both");
    
    if (!canSendEmail && !canSendSMS) {
      toast.error("Brak danych kontaktowych kierowcy");
      return;
    }

    setSendingInvitation(true);
    try {
      const portalLink = `${window.location.origin}/umowa/${rentalId}?token=${rental.portal_access_token}`;
      let emailSent = false;
      let smsSent = false;

      // Send email
      if (canSendEmail) {
        const { error } = await supabase.functions.invoke("send-rental-invitation", {
          body: {
            rentalId,
            driverEmail: rental.invitation_email,
            driverName: `${rental.driver.first_name} ${rental.driver.last_name}`,
            vehicleInfo: `${rental.vehicle.brand} ${rental.vehicle.model} (${rental.vehicle.plate})`,
            portalLink,
          },
        });
        if (!error) {
          emailSent = true;
          await logSignatureAction("email_sent", { email: rental.invitation_email, portalLink });
        }
      }

      // Send SMS
      if (canSendSMS) {
        const { error } = await supabase.functions.invoke("send-sms", {
          body: {
            to: rental.invitation_phone,
            message: `GetRido: Umowa najmu pojazdu ${rental.vehicle.plate} czeka na Twój podpis. Kliknij: ${portalLink}`,
          },
        });
        if (!error) {
          smsSent = true;
          await logSignatureAction("sms_sent", { phone: rental.invitation_phone, portalLink });
        }
      }

      // Update rental status
      const updateData: Record<string, any> = { 
        status: "sent_to_client",
        invitation_method: invitationMethod
      };
      if (emailSent) updateData.invitation_sent_at = new Date().toISOString();
      if (smsSent) updateData.invitation_sms_sent_at = new Date().toISOString();

      await (supabase.from("vehicle_rentals") as any)
        .update(updateData)
        .eq("id", rentalId);

      const messages = [];
      if (emailSent) messages.push("e-mail");
      if (smsSent) messages.push("SMS");
      
      if (messages.length > 0) {
        toast.success(`Zaproszenie wysłane (${messages.join(" i ")})!`);
      } else {
        toast.error("Nie udało się wysłać zaproszenia");
      }
      
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

      // Sign the rental with legal logging
      await (supabase.from("vehicle_rentals") as any)
        .update({
          fleet_signed_at: new Date().toISOString(),
          fleet_signature_url: publicUrl,
          fleet_signature_user_agent: navigator.userAgent,
          status: "fleet_signed",
        })
        .eq("id", rentalId);

      await logSignatureAction("fleet_signed", { signature_url: publicUrl });

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
          fleet_signature_user_agent: navigator.userAgent,
          status: "fleet_signed",
        })
        .eq("id", rentalId);

      await logSignatureAction("fleet_signed", { signature_url: fleetSig.signature_url, auto_sign: true });

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
      // Lock the contract and update status
      await (supabase.from("vehicle_rentals") as any)
        .update({ 
          status: "finalized",
          contract_locked_at: new Date().toISOString()
        })
        .eq("id", rentalId);

      await logSignatureAction("contract_locked", {});

      // Update vehicle status
      if (rental?.vehicle) {
        await supabase
          .from("vehicles")
          .update({ status: "wynajęty" })
          .eq("id", rental.vehicle.id);
      }

      // Send confirmation email with signed contract
      if (rental?.invitation_email) {
        await supabase.functions.invoke("send-rental-confirmation", {
          body: {
            rentalId,
            driverEmail: rental.invitation_email,
            driverName: `${rental.driver.first_name} ${rental.driver.last_name}`,
            vehicleInfo: `${rental.vehicle.brand} ${rental.vehicle.model} (${rental.vehicle.plate})`,
          },
        }).catch(err => console.log("Confirmation email error (non-blocking):", err));
      }

      toast.success("Umowa sfinalizowana! Przejdź do protokołu zdjęciowego.");
    } catch (error) {
      console.error("Error finalizing:", error);
    }
  };

  const handleDriverUpdate = (updatedDriver: any) => {
    if (rental) {
      setRental({
        ...rental,
        driver: updatedDriver
      });

      // Also update invitation email/phone if changed
      if (updatedDriver.email || updatedDriver.phone) {
        (supabase.from("vehicle_rentals") as any)
          .update({
            invitation_email: updatedDriver.email,
            invitation_phone: updatedDriver.phone
          })
          .eq("id", rentalId);
      }
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

      {/* Action Buttons - Always visible */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => setShowContractPreview(true)}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              Podgląd umowy
            </Button>
            {!isContractLocked && (
              <Button
                variant="outline"
                onClick={() => setShowEditDriver(true)}
                className="gap-2"
              >
                <Pencil className="h-4 w-4" />
                Edytuj dane
              </Button>
            )}
            <Badge variant="secondary" className="ml-auto">
              {rental.contract_number || `RNT-${rental.id.slice(0, 8).toUpperCase()}`}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Rental Info */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="font-semibold">
                {rental.vehicle.brand} {rental.vehicle.model} ({rental.vehicle.plate})
              </p>
              <p className="text-sm text-muted-foreground">
                Kierowca: {rental.driver.first_name} {rental.driver.last_name}
              </p>
              {rental.driver.email && (
                <p className="text-xs text-muted-foreground">{rental.driver.email}</p>
              )}
              {rental.driver.phone && (
                <p className="text-xs text-muted-foreground">{rental.driver.phone}</p>
              )}
            </div>
          </div>
          {isContractLocked && (
            <div className="mt-2 p-2 bg-muted rounded text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Umowa zablokowana - edycja niemożliwa po podpisaniu
            </div>
          )}
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
              Klient otrzyma link do portalu, gdzie zapozna się z umową i złoży podpis elektroniczny.
            </p>
            
            {/* Contact info */}
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {rental.invitation_email || <span className="text-destructive">Brak e-maila</span>}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {rental.invitation_phone || <span className="text-destructive">Brak telefonu</span>}
                </span>
              </div>
            </div>

            {/* Method selection */}
            <div className="space-y-2">
              <Label>Metoda wysyłki</Label>
              <RadioGroup value={invitationMethod} onValueChange={(v) => setInvitationMethod(v as any)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="email" id="email" disabled={!rental.invitation_email} />
                  <Label htmlFor="email" className={!rental.invitation_email ? "text-muted-foreground" : ""}>
                    E-mail
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sms" id="sms" disabled={!rental.invitation_phone} />
                  <Label htmlFor="sms" className={!rental.invitation_phone ? "text-muted-foreground" : ""}>
                    SMS
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem 
                    value="both" 
                    id="both" 
                    disabled={!rental.invitation_email || !rental.invitation_phone} 
                  />
                  <Label 
                    htmlFor="both" 
                    className={(!rental.invitation_email || !rental.invitation_phone) ? "text-muted-foreground" : ""}
                  >
                    E-mail i SMS
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowEditDriver(true)}
                className="gap-2"
              >
                <Pencil className="h-4 w-4" />
                Uzupełnij dane
              </Button>
              <Button 
                className="flex-1 gap-2" 
                onClick={handleSendInvitation}
                disabled={sendingInvitation || (!rental.invitation_email && !rental.invitation_phone)}
              >
                {sendingInvitation ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Wyślij zaproszenie
              </Button>
            </div>
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
                E-mail wysłano: {new Date(rental.invitation_sent_at).toLocaleString("pl-PL")}
              </p>
            )}
            {rental.invitation_sms_sent_at && (
              <p className="text-xs text-muted-foreground">
                SMS wysłano: {new Date(rental.invitation_sms_sent_at).toLocaleString("pl-PL")}
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

      {/* Edit Driver Modal */}
      {rental && showEditDriver && (
        <EditDriverDataModal
          isOpen={showEditDriver}
          onClose={() => setShowEditDriver(false)}
          driver={rental.driver}
          missingFields={[]}
          onSuccess={handleDriverUpdate}
        />
      )}

      {/* Contract Preview Modal */}
      <Dialog open={showContractPreview} onOpenChange={setShowContractPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Podgląd umowy najmu
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[70vh] pr-4">
            {rental && (
              <ContractPreview rental={rental} />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Contract preview component
function ContractPreview({ rental }: { rental: RentalData }) {
  const [contractHtml, setContractHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadContract = async () => {
      try {
        // Fetch full rental data including fleet info
        const { data: fullRental } = await (supabase
          .from("vehicle_rentals") as any)
          .select(`
            *,
            vehicles:vehicle_id (id, plate, brand, model, year, vin),
            drivers:driver_id (id, first_name, last_name, email, phone, pesel, address_street, address_city, address_postal_code, license_number),
            fleets:fleet_id (id, name, nip, address_street, address_city, phone, email)
          `)
          .eq("id", rental.id)
          .single();

        if (fullRental) {
          const driver = fullRental.drivers;
          const vehicle = fullRental.vehicles;
          const fleet = fullRental.fleets;
          
          const driverAddress = [
            driver?.address_street,
            driver?.address_postal_code,
            driver?.address_city
          ].filter(Boolean).join(', ');

          const fleetAddress = [
            fleet?.address_street,
            fleet?.address_city
          ].filter(Boolean).join(', ');

          const contractData: ContractData = {
            contractNumber: fullRental.contract_number || `RNT-${rental.id.slice(0, 8).toUpperCase()}`,
            createdAt: fullRental.created_at,
            vehicleBrand: vehicle?.brand || '',
            vehicleModel: vehicle?.model || '',
            vehiclePlate: vehicle?.plate || '',
            vehicleVin: vehicle?.vin || '',
            vehicleYear: vehicle?.year,
            driverFirstName: driver?.first_name || '',
            driverLastName: driver?.last_name || '',
            driverPesel: driver?.pesel || '',
            driverAddress,
            driverPhone: driver?.phone || '',
            driverEmail: driver?.email || '',
            driverLicenseNumber: driver?.license_number || '',
            fleetName: fleet?.name || '',
            fleetNip: fleet?.nip,
            fleetAddress,
            fleetPhone: fleet?.phone,
            fleetEmail: fleet?.email,
            rentalType: fullRental.rental_type,
            rentalStart: fullRental.rental_start,
            rentalEnd: fullRental.rental_end,
            isIndefinite: fullRental.is_indefinite,
            weeklyFee: fullRental.weekly_rental_fee || 0,
            driverSignatureUrl: fullRental.driver_signature_url,
            fleetSignatureUrl: fullRental.fleet_signature_url,
            driverSignedAt: fullRental.driver_signed_at,
            fleetSignedAt: fullRental.fleet_signed_at,
          };

          const html = generateRentalContractHtml(contractData)
            .replace(/<html.*?<body>/gs, '')
            .replace(/<\/body>.*?<\/html>/gs, '');
          
          setContractHtml(html);
        }
      } catch (error) {
        console.error("Error loading contract:", error);
      } finally {
        setLoading(false);
      }
    };

    loadContract();
  }, [rental.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div 
      className="prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: contractHtml }} 
    />
  );
}