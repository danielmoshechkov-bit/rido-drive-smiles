import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { 
  FileText, 
  Car, 
  User, 
  Mail, 
  PenTool, 
  Camera, 
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RentalContractSignatureFlow } from "./RentalContractSignatureFlow";

interface RentalContract {
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
  protocol_completed_at: string | null;
  invitation_sent_at: string | null;
  created_at: string;
  vehicle: {
    plate: string;
    brand: string;
    model: string;
  };
  driver: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  };
}

interface FleetContractsManagementProps {
  fleetId: string;
}

export function FleetContractsManagement({ fleetId }: FleetContractsManagementProps) {
  const [contracts, setContracts] = useState<RentalContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContract, setSelectedContract] = useState<RentalContract | null>(null);

  useEffect(() => {
    loadContracts();
  }, [fleetId]);

  const loadContracts = async () => {
    setLoading(true);
    try {
      const supabaseAny = supabase as any;
      const { data, error } = await supabaseAny
        .from("vehicle_rentals")
        .select(`
          id, contract_number, status, rental_start, rental_end, is_indefinite, 
          rental_type, weekly_rental_fee, driver_signed_at, fleet_signed_at,
          protocol_completed_at, invitation_sent_at, created_at, source,
          vehicle:vehicle_id (plate, brand, model),
          driver:driver_id (first_name, last_name, email, phone)
        `)
        .eq("fleet_id", fleetId)
        .or("source.is.null,source.eq.fleet") // Only fleet contracts (not marketplace reservations)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setContracts(data || []);
    } catch (error) {
      console.error("Error loading contracts:", error);
      toast.error("Błąd ładowania umów");
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = (contract: RentalContract) => {
    if (contract.protocol_completed_at) {
      return { 
        label: "Zakończono", 
        color: "bg-primary text-primary-foreground",
        icon: CheckCircle,
        step: 6
      };
    }
    if (contract.status === "finalized" || contract.fleet_signed_at) {
      return { 
        label: "Do protokołu", 
        color: "bg-orange-500 text-white",
        icon: Camera,
        step: 5
      };
    }
    if (contract.driver_signed_at) {
      return { 
        label: "Podpis floty", 
        color: "bg-blue-500 text-white",
        icon: PenTool,
        step: 3
      };
    }
    if (contract.invitation_sent_at) {
      return { 
        label: "Wysłano", 
        color: "bg-yellow-500 text-white",
        icon: Clock,
        step: 2
      };
    }
    return { 
      label: "Draft", 
      color: "bg-muted text-muted-foreground",
      icon: FileText,
      step: 1
    };
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

  return (
    <>
      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">
                {contracts.filter(c => c.protocol_completed_at).length}
              </p>
              <p className="text-xs text-muted-foreground">Aktywne</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-yellow-500">
                {contracts.filter(c => !c.protocol_completed_at && c.invitation_sent_at).length}
              </p>
              <p className="text-xs text-muted-foreground">W toku</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-muted-foreground">
                {contracts.filter(c => !c.invitation_sent_at).length}
              </p>
              <p className="text-xs text-muted-foreground">Drafty</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{contracts.length}</p>
              <p className="text-xs text-muted-foreground">Razem</p>
            </CardContent>
          </Card>
        </div>

        {/* Contract List */}
        {contracts.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Brak umów najmu</p>
              <p className="text-sm text-muted-foreground mt-1">
                Utwórz pierwszą umowę używając przycisku "Wynajmij pojazd"
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {contracts.map(contract => {
              const status = getStatusInfo(contract);
              const StatusIcon = status.icon;

              return (
                <Card 
                  key={contract.id}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md",
                    !contract.protocol_completed_at && "border-l-4 border-l-orange-500"
                  )}
                  onClick={() => setSelectedContract(contract)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Car className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold truncate">
                            {contract.vehicle?.brand} {contract.vehicle?.model}
                          </span>
                          <span className="text-sm text-muted-foreground font-mono">
                            {contract.vehicle?.plate}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                          <User className="h-3 w-3" />
                          <span>
                            {contract.driver?.first_name} {contract.driver?.last_name}
                          </span>
                          {contract.driver?.email && (
                            <>
                              <span>•</span>
                              <span className="truncate">{contract.driver.email}</span>
                            </>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant="outline">{getRentalTypeLabel(contract.rental_type)}</Badge>
                          {contract.weekly_rental_fee && (
                            <span className="text-muted-foreground">
                              {contract.weekly_rental_fee} zł/tydz
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            {format(new Date(contract.created_at), "dd.MM.yyyy", { locale: pl })}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <Badge className={cn("gap-1", status.color)}>
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          {contract.contract_number || `#${contract.id.slice(0, 8)}`}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Contract Detail Modal */}
      <Dialog open={!!selectedContract} onOpenChange={(open) => !open && setSelectedContract(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Szczegóły umowy
            </DialogTitle>
          </DialogHeader>

          {selectedContract && (
            <RentalContractSignatureFlow
              rentalId={selectedContract.id}
              fleetId={fleetId}
              onComplete={() => {
                setSelectedContract(null);
                loadContracts();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
