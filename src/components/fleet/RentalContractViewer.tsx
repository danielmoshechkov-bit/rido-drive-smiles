import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  FileText, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  PenTool
} from "lucide-react";
import { cn } from "@/lib/utils";
import { generateRentalContractHtml, ContractData } from "@/utils/rentalContractGenerator";

interface RentalContractViewerProps {
  rentalId: string;
  accessToken: string;
  onSigned?: () => void;
}

export function RentalContractViewer({ rentalId, accessToken, onSigned }: RentalContractViewerProps) {
  const [loading, setLoading] = useState(true);
  const [contractData, setContractData] = useState<ContractData | null>(null);
  const [rentalData, setRentalData] = useState<any>(null);
  
  // Document reading state
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [scrollTime, setScrollTime] = useState<Date | null>(null);
  const [acceptedContract, setAcceptedContract] = useState(false);
  const [acceptedOwu, setAcceptedOwu] = useState(false);
  const [acceptedRodo, setAcceptedRodo] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    loadRentalData();
  }, [rentalId, accessToken]);

  const loadRentalData = async () => {
    setLoading(true);
    try {
      // Fetch rental with token validation
      const { data: rental, error } = await (supabase
        .from("vehicle_rentals") as any)
        .select(`
          *,
          vehicles:vehicle_id (id, plate, brand, model, year, vin),
          drivers:driver_id (id, first_name, last_name, email, phone, pesel, address_street, address_city, address_postal_code, license_number),
          fleets:fleet_id (id, name, nip, address_street, address_city, phone, email)
        `)
        .eq("id", rentalId)
        .eq("portal_access_token", accessToken)
        .single();

      if (error) throw error;
      if (!rental) throw new Error("Nie znaleziono umowy");

      setRentalData(rental);

      // Build contract data
      const driver = rental.drivers;
      const vehicle = rental.vehicles;
      const fleet = rental.fleets;
      
      const driverAddress = [
        driver?.address_street,
        driver?.address_postal_code,
        driver?.address_city
      ].filter(Boolean).join(', ');

      const fleetAddress = [
        fleet?.address_street,
        fleet?.address_city
      ].filter(Boolean).join(', ');

      setContractData({
        contractNumber: rental.contract_number || `RNT-${rental.id.slice(0, 8).toUpperCase()}`,
        createdAt: rental.created_at,
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
        rentalType: rental.rental_type,
        rentalStart: rental.rental_start,
        rentalEnd: rental.rental_end,
        isIndefinite: rental.is_indefinite,
        weeklyFee: rental.weekly_rental_fee || 0,
        driverSignatureUrl: rental.driver_signature_url,
        fleetSignatureUrl: rental.fleet_signature_url,
        driverSignedAt: rental.driver_signed_at,
        fleetSignedAt: rental.fleet_signed_at,
      });
    } catch (error: any) {
      console.error("Error loading rental:", error);
      toast.error(error.message || "Błąd ładowania umowy");
    } finally {
      setLoading(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    
    if (isAtBottom && !scrolledToEnd) {
      setScrolledToEnd(true);
      setScrollTime(new Date());
    }
  };

  const canProceedToSign = 
    scrolledToEnd && 
    acceptedContract && 
    acceptedOwu && 
    acceptedRodo;

  const handleProceedToSign = () => {
    if (!canProceedToSign) {
      toast.error("Przewiń dokument do końca i zaakceptuj wszystkie zgody");
      return;
    }
    onSigned?.();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!contractData || !rentalData) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive font-medium">Nie można załadować umowy</p>
          <p className="text-sm text-muted-foreground mt-2">
            Link może być nieprawidłowy lub wygasły
          </p>
        </CardContent>
      </Card>
    );
  }

  // Already signed
  if (rentalData.driver_signed_at) {
    return (
      <Card className="border-primary">
        <CardContent className="p-6 text-center">
          <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
          <p className="text-primary font-medium text-lg">Umowa została podpisana</p>
          <p className="text-sm text-muted-foreground mt-2">
            Dziękujemy za podpisanie umowy. Dokumenty zostały przesłane na Twój adres e-mail.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-lg bg-primary/10">
          <FileText className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Umowa najmu pojazdu</h2>
          <p className="text-sm text-muted-foreground">
            {contractData.vehicleBrand} {contractData.vehicleModel} ({contractData.vehiclePlate})
          </p>
        </div>
        <Badge variant="outline" className="ml-auto">
          Do podpisu
        </Badge>
      </div>

      {/* Contract Content */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea 
            ref={scrollRef}
            className="h-[400px] p-6"
            onScrollCapture={handleScroll}
          >
            <div 
              dangerouslySetInnerHTML={{ 
                __html: generateRentalContractHtml(contractData)
                  .replace(/<html.*?<body>/gs, '')
                  .replace(/<\/body>.*?<\/html>/gs, '')
              }} 
            />
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Scroll indicator */}
      {!scrolledToEnd && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          Przewiń dokument do końca, aby kontynuować
        </div>
      )}
      {scrolledToEnd && scrollTime && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" />
          Dokument przeczytany o {scrollTime.toLocaleTimeString('pl-PL')}
        </div>
      )}

      {/* Acceptances */}
      <Card className={cn(
        "transition-opacity",
        scrolledToEnd ? "opacity-100" : "opacity-50 pointer-events-none"
      )}>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox 
              id="accept-contract" 
              checked={acceptedContract}
              onCheckedChange={(c) => setAcceptedContract(c === true)}
              disabled={!scrolledToEnd}
            />
            <Label htmlFor="accept-contract" className="text-sm cursor-pointer">
              Zapoznałem/am się z treścią Umowy Najmu Pojazdu i akceptuję jej warunki
            </Label>
          </div>
          
          <div className="flex items-start gap-3">
            <Checkbox 
              id="accept-owu" 
              checked={acceptedOwu}
              onCheckedChange={(c) => setAcceptedOwu(c === true)}
              disabled={!scrolledToEnd}
            />
            <Label htmlFor="accept-owu" className="text-sm cursor-pointer">
              Zapoznałem/am się z Ogólnymi Warunkami Umowy (OWU) i akceptuję ich postanowienia
            </Label>
          </div>
          
          <div className="flex items-start gap-3">
            <Checkbox 
              id="accept-rodo" 
              checked={acceptedRodo}
              onCheckedChange={(c) => setAcceptedRodo(c === true)}
              disabled={!scrolledToEnd}
            />
            <Label htmlFor="accept-rodo" className="text-sm cursor-pointer">
              Zapoznałem/am się z informacją o przetwarzaniu danych osobowych (RODO) i wyrażam zgodę
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Action Button */}
      <Button 
        size="lg" 
        className="w-full gap-2"
        onClick={handleProceedToSign}
        disabled={!canProceedToSign}
      >
        <PenTool className="h-5 w-5" />
        Akceptuję i przechodzę do podpisu
      </Button>
    </div>
  );
}
