import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { 
  FileText, 
  Calendar, 
  Car, 
  User, 
  Download, 
  Send, 
  Eye, 
  Camera,
  CheckCircle,
  Clock,
  AlertCircle,
  Plus,
  Loader2
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RentalPhotoProtocol } from "./RentalPhotoProtocol";

interface VehicleRental {
  id: string;
  status: string;
  weekly_rental_fee: number | null;
  rental_start: string | null;
  rental_end: string | null;
  is_indefinite: boolean | null;
  rental_type: string | null;
  created_at: string;
  driver_signed_at: string | null;
  vehicle: {
    id: string;
    brand: string;
    model: string;
    plate: string;
    year: number | null;
  } | null;
  driver: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}

interface FleetActiveRentalsProps {
  fleetId: string;
}

export function FleetActiveRentals({ fleetId }: FleetActiveRentalsProps) {
  const [rentals, setRentals] = useState<VehicleRental[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRental, setSelectedRental] = useState<VehicleRental | null>(null);
  const [showPhotoProtocol, setShowPhotoProtocol] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadRentals();
  }, [fleetId]);

  const loadRentals = async () => {
    try {
      const { data, error } = await supabase
        .from("vehicle_rentals")
        .select(`
          id, status, weekly_rental_fee, rental_start, rental_end, 
          is_indefinite, rental_type, created_at, driver_signed_at,
          vehicle:vehicles!vehicle_id (id, brand, model, plate, year),
          driver:drivers!driver_id (id, first_name, last_name, phone, email)
        `)
        .eq("fleet_id", fleetId)
        .in("status", ["draft", "pending_signature", "signed", "finalized", "active"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRentals(data as VehicleRental[] || []);
    } catch (error) {
      console.error("Error loading rentals:", error);
      toast.error("Błąd ładowania umów najmu");
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
      draft: { label: "Szkic", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
      pending_signature: { label: "Oczekuje na podpis", variant: "outline", icon: <AlertCircle className="h-3 w-3" /> },
      signed: { label: "Podpisana", variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
      finalized: { label: "Aktywna", variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
      active: { label: "Aktywna", variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
    };
    return statusMap[status] || { label: status, variant: "secondary" as const, icon: null };
  };

  const getRentalTypeLabel = (type: string | null) => {
    const types: Record<string, string> = {
      taxi: "Taxi",
      private: "Prywatny",
      long_term: "Długoterminowy",
      buyout: "Wykup",
    };
    return types[type || ""] || type || "—";
  };

  const handleSendForSignature = async (rental: VehicleRental) => {
    setProcessingId(rental.id);
    try {
      const { error } = await supabase
        .from("vehicle_rentals")
        .update({ status: "pending_signature" })
        .eq("id", rental.id);

      if (error) throw error;
      toast.success("Umowa wysłana do podpisu");
      loadRentals();
    } catch (error: any) {
      toast.error(error.message || "Błąd wysyłania umowy");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDownloadContract = async (rental: VehicleRental) => {
    // TODO: Implement PDF generation
    toast.info("Funkcja pobierania umowy w przygotowaniu");
  };

  const openSigningLink = (rental: VehicleRental) => {
    const url = `/umowa/${rental.id}`;
    window.open(url, "_blank");
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Aktywne umowy najmu
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rentals.length === 0 ? (
            <div className="text-center py-8">
              <Car className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">Brak aktywnych umów najmu</p>
              <p className="text-sm text-muted-foreground mt-1">
                Użyj przycisku "Wynajmij pojazd" w zakładce Auta, aby utworzyć nową umowę
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pojazd</TableHead>
                    <TableHead>Kierowca</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Stawka tyg.</TableHead>
                    <TableHead>Data rozpoczęcia</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rentals.map((rental) => {
                    const statusInfo = getStatusInfo(rental.status);
                    return (
                      <TableRow 
                        key={rental.id}
                        className="hover:bg-muted/50 cursor-pointer"
                        onClick={() => setSelectedRental(rental)}
                      >
                        <TableCell>
                          {rental.vehicle ? (
                            <div>
                              <p className="font-medium">
                                {rental.vehicle.brand} {rental.vehicle.model}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {rental.vehicle.plate}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {rental.driver ? (
                            <div>
                              <p className="font-medium">
                                {rental.driver.first_name} {rental.driver.last_name}
                              </p>
                              {rental.driver.phone && (
                                <p className="text-xs text-muted-foreground">
                                  {rental.driver.phone}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getRentalTypeLabel(rental.rental_type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {rental.weekly_rental_fee 
                            ? `${rental.weekly_rental_fee} zł` 
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {rental.rental_start 
                            ? format(new Date(rental.rental_start), "dd.MM.yyyy", { locale: pl })
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusInfo.variant} className="gap-1">
                            {statusInfo.icon}
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {rental.status === "draft" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSendForSignature(rental);
                                }}
                                disabled={processingId === rental.id}
                              >
                                <Send className="h-3 w-3 mr-1" />
                                Wyślij
                              </Button>
                            )}
                            {rental.status === "pending_signature" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openSigningLink(rental);
                                }}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                Podgląd
                              </Button>
                            )}
                            {(rental.status === "signed" || rental.status === "finalized" || rental.status === "active") && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadContract(rental);
                                  }}
                                >
                                  <Download className="h-3 w-3 mr-1" />
                                  PDF
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedRental(rental);
                                    setShowPhotoProtocol(true);
                                  }}
                                >
                                  <Camera className="h-3 w-3 mr-1" />
                                  Zdjęcia
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo Protocol Dialog */}
      {selectedRental && showPhotoProtocol && (
        <Dialog open={showPhotoProtocol} onOpenChange={setShowPhotoProtocol}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Protokół zdjęciowy - {selectedRental.vehicle?.brand} {selectedRental.vehicle?.model}
              </DialogTitle>
            </DialogHeader>
            <RentalPhotoProtocol 
              rentalId={selectedRental.id}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Rental Details Dialog */}
      {selectedRental && !showPhotoProtocol && (
        <Dialog open={!!selectedRental && !showPhotoProtocol} onOpenChange={() => setSelectedRental(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Szczegóły umowy najmu
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Pojazd</h4>
                  <p className="font-medium">
                    {selectedRental.vehicle?.brand} {selectedRental.vehicle?.model} ({selectedRental.vehicle?.year || "—"})
                  </p>
                  <p className="text-sm font-mono">{selectedRental.vehicle?.plate}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Kierowca</h4>
                  <p className="font-medium">
                    {selectedRental.driver?.first_name} {selectedRental.driver?.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground">{selectedRental.driver?.phone}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Typ najmu</h4>
                  <p>{getRentalTypeLabel(selectedRental.rental_type)}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Stawka tygodniowa</h4>
                  <p>{selectedRental.weekly_rental_fee ? `${selectedRental.weekly_rental_fee} zł` : "—"}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Data rozpoczęcia</h4>
                  <p>
                    {selectedRental.rental_start 
                      ? format(new Date(selectedRental.rental_start), "dd.MM.yyyy", { locale: pl })
                      : "—"}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Data zakończenia</h4>
                  <p>
                    {selectedRental.is_indefinite 
                      ? "Bezterminowa" 
                      : selectedRental.rental_end 
                        ? format(new Date(selectedRental.rental_end), "dd.MM.yyyy", { locale: pl })
                        : "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t">
                {selectedRental.status === "draft" && (
                  <Button onClick={() => handleSendForSignature(selectedRental)}>
                    <Send className="h-4 w-4 mr-2" />
                    Wyślij do podpisu
                  </Button>
                )}
                {selectedRental.status === "pending_signature" && (
                  <Button onClick={() => openSigningLink(selectedRental)}>
                    <Eye className="h-4 w-4 mr-2" />
                    Otwórz link do podpisu
                  </Button>
                )}
                {(selectedRental.status === "signed" || selectedRental.status === "finalized" || selectedRental.status === "active") && (
                  <>
                    <Button variant="outline" onClick={() => handleDownloadContract(selectedRental)}>
                      <Download className="h-4 w-4 mr-2" />
                      Pobierz umowę
                    </Button>
                    <Button onClick={() => setShowPhotoProtocol(true)}>
                      <Camera className="h-4 w-4 mr-2" />
                      Protokół zdjęciowy
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
