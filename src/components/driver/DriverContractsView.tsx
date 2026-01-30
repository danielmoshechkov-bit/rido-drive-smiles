import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { 
  FileText, 
  Car, 
  Download, 
  CheckCircle,
  Clock,
  Loader2,
  Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import { generateRentalContractHtml, ContractData } from "@/utils/rentalContractGenerator";

interface DriverContract {
  id: string;
  contract_number: string | null;
  status: string;
  rental_start: string | null;
  rental_end: string | null;
  is_indefinite: boolean;
  rental_type: string;
  weekly_rental_fee: number | null;
  driver_signed_at: string | null;
  fleet_signed_at: string | null;
  created_at: string;
  vehicle: {
    plate: string;
    brand: string;
    model: string;
    vin: string | null;
    year: number | null;
  };
  fleet: {
    name: string;
    phone: string | null;
    email: string | null;
  };
}

interface DriverContractsViewProps {
  driverId: string;
}

export function DriverContractsView({ driverId }: DriverContractsViewProps) {
  const [contracts, setContracts] = useState<DriverContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewContract, setViewContract] = useState<DriverContract | null>(null);
  const [contractHtml, setContractHtml] = useState("");

  useEffect(() => {
    loadContracts();
  }, [driverId]);

  const loadContracts = async () => {
    setLoading(true);
    try {
      const supabaseAny = supabase as any;
      const { data, error } = await supabaseAny
        .from("vehicle_rentals")
        .select(`
          id, contract_number, status, rental_start, rental_end, is_indefinite, 
          rental_type, weekly_rental_fee, driver_signed_at, fleet_signed_at, created_at,
          vehicle:vehicle_id (plate, brand, model, vin, year),
          fleet:fleet_id (name, phone, email)
        `)
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setContracts(data || []);
    } catch (error) {
      console.error("Error loading contracts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewContract = async (contract: DriverContract) => {
    setViewContract(contract);
    
    // Get driver data
    const { data: driver } = await supabase
      .from("drivers")
      .select("first_name, last_name, pesel, phone, email, address_street, address_city, address_postal_code, license_number")
      .eq("id", driverId)
      .single();

    if (driver && contract.vehicle && contract.fleet) {
      const contractData: ContractData = {
        contractNumber: contract.contract_number || `RNT-${contract.id.slice(0, 8).toUpperCase()}`,
        createdAt: contract.created_at,
        vehicleBrand: contract.vehicle.brand,
        vehicleModel: contract.vehicle.model,
        vehiclePlate: contract.vehicle.plate,
        vehicleVin: contract.vehicle.vin || "",
        vehicleYear: contract.vehicle.year || undefined,
        driverFirstName: driver.first_name || "",
        driverLastName: driver.last_name || "",
        driverPesel: driver.pesel || "",
        driverAddress: [driver.address_street, driver.address_postal_code, driver.address_city].filter(Boolean).join(", "),
        driverPhone: driver.phone || "",
        driverEmail: driver.email || "",
        driverLicenseNumber: driver.license_number || "",
        fleetName: contract.fleet.name,
        fleetPhone: contract.fleet.phone || undefined,
        fleetEmail: contract.fleet.email || undefined,
        rentalType: contract.rental_type as "standard" | "taxi" | "long_term" | "buyout",
        rentalStart: contract.rental_start || "",
        rentalEnd: contract.rental_end || undefined,
        isIndefinite: contract.is_indefinite,
        weeklyFee: contract.weekly_rental_fee || 0,
        driverSignedAt: contract.driver_signed_at || undefined,
        fleetSignedAt: contract.fleet_signed_at || undefined,
      };

      const html = generateRentalContractHtml(contractData);
      setContractHtml(html);
    }
  };

  const getStatusBadge = (contract: DriverContract) => {
    if (contract.fleet_signed_at && contract.driver_signed_at) {
      return <Badge className="bg-primary text-primary-foreground gap-1">
        <CheckCircle className="h-3 w-3" /> Podpisana
      </Badge>;
    }
    if (contract.driver_signed_at) {
      return <Badge className="bg-yellow-500 text-white gap-1">
        <Clock className="h-3 w-3" /> Oczekuje na flotę
      </Badge>;
    }
    return <Badge variant="secondary">Draft</Badge>;
  };

  const getRentalTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      standard: "Prywatny",
      taxi: "Taxi",
      long_term: "Długoterminowy",
      buyout: "Z wykupem"
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (contracts.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Brak umów najmu</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {contracts.map(contract => (
          <Card 
            key={contract.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => handleViewContract(contract)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Car className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">
                      {contract.vehicle?.brand} {contract.vehicle?.model}
                    </span>
                    <span className="text-sm text-muted-foreground font-mono">
                      {contract.vehicle?.plate}
                    </span>
                  </div>

                  <p className="text-sm text-muted-foreground mb-2">
                    {contract.fleet?.name}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">{getRentalTypeLabel(contract.rental_type)}</Badge>
                    {contract.weekly_rental_fee && (
                      <span className="text-muted-foreground">
                        {contract.weekly_rental_fee} zł/tydz
                      </span>
                    )}
                    {contract.rental_start && (
                      <span className="text-muted-foreground">
                        od {format(new Date(contract.rental_start), "dd.MM.yyyy", { locale: pl })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {getStatusBadge(contract)}
                  <Button variant="ghost" size="sm" className="gap-1">
                    <Eye className="h-4 w-4" />
                    Podgląd
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Contract Viewer Modal */}
      <Dialog open={!!viewContract} onOpenChange={(open) => !open && setViewContract(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Umowa najmu - {viewContract?.vehicle?.plate}
            </DialogTitle>
          </DialogHeader>

          {viewContract && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                {getStatusBadge(viewContract)}
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" />
                  Pobierz PDF
                </Button>
              </div>

              <div 
                className="border rounded-lg p-6 bg-white max-h-[60vh] overflow-y-auto"
                dangerouslySetInnerHTML={{ 
                  __html: contractHtml
                    .replace(/<html.*?<body>/gs, '')
                    .replace(/<\/body>.*?<\/html>/gs, '')
                }} 
              />

              {viewContract.driver_signed_at && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Podpisano przez Ciebie: {format(new Date(viewContract.driver_signed_at), "dd.MM.yyyy HH:mm", { locale: pl })}
                </div>
              )}

              {viewContract.fleet_signed_at && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Podpisano przez flotę: {format(new Date(viewContract.fleet_signed_at), "dd.MM.yyyy HH:mm", { locale: pl })}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
