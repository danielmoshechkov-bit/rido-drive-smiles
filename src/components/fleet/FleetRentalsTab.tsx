import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Loader2,
  Pencil,
  ExternalLink,
  Search,
  Trash2,
  X,
  FileCheck,
  FileX,
  MoreHorizontal,
  Printer,
  XCircle
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RentalPhotoProtocol } from "./RentalPhotoProtocol";
import { RentalContractSignatureFlow } from "./RentalContractSignatureFlow";
import { cn } from "@/lib/utils";

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
  fleet_signed_at: string | null;
  portal_access_token: string | null;
  contract_number: string | null;
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

interface FleetRentalsTabProps {
  fleetId: string;
}

type SubTab = "aktywne" | "do-podpisu" | "zakonczone";

export function FleetRentalsTab({ fleetId }: FleetRentalsTabProps) {
  const [rentals, setRentals] = useState<VehicleRental[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("aktywne");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRental, setSelectedRental] = useState<VehicleRental | null>(null);
  const [showPhotoProtocol, setShowPhotoProtocol] = useState(false);
  const [showEditFlow, setShowEditFlow] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deleteRental, setDeleteRental] = useState<VehicleRental | null>(null);

  useEffect(() => {
    loadRentals();
  }, [fleetId]);

  const loadRentals = async () => {
    try {
      const { data, error } = await supabase
        .from("vehicle_rentals")
        .select(`
          id, status, weekly_rental_fee, rental_start, rental_end, 
          is_indefinite, rental_type, created_at, driver_signed_at, fleet_signed_at,
          portal_access_token, contract_number,
          vehicle:vehicles!vehicle_id (id, brand, model, plate, year),
          driver:drivers!driver_id (id, first_name, last_name, phone, email)
        `)
        .eq("fleet_id", fleetId)
        .neq("source", "marketplace")
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
      sent_to_client: { label: "Wysłana", variant: "outline", icon: <Send className="h-3 w-3" /> },
      client_signed: { label: "Podpis klienta", variant: "outline", icon: <FileCheck className="h-3 w-3" /> },
      fleet_signed: { label: "Podpisana", variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
      finalized: { label: "Aktywna", variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
      active: { label: "Aktywna", variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
      completed: { label: "Zakończona", variant: "secondary", icon: <FileX className="h-3 w-3" /> },
      cancelled: { label: "Anulowana", variant: "destructive", icon: <X className="h-3 w-3" /> },
    };
    return statusMap[status] || { label: status, variant: "secondary" as const, icon: null };
  };

  const getRentalTypeLabel = (type: string | null) => {
    const types: Record<string, string> = {
      standard: "Standardowy",
      taxi: "Taxi",
      private: "Prywatny",
      long_term: "Długoterminowy",
      buyout: "Wykup",
    };
    return types[type || ""] || type || "—";
  };

  // Filter rentals based on sub-tab
  const filteredByTab = rentals.filter(rental => {
    switch (activeSubTab) {
      case "aktywne":
        return ["finalized", "active", "fleet_signed"].includes(rental.status);
      case "do-podpisu":
        return ["draft", "sent_to_client", "client_signed"].includes(rental.status);
      case "zakonczone":
        return ["completed", "cancelled"].includes(rental.status);
      default:
        return true;
    }
  });

  // Filter by search query
  const filtered = filteredByTab.filter(rental => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const driverName = `${rental.driver?.first_name || ""} ${rental.driver?.last_name || ""}`.toLowerCase();
    const plate = (rental.vehicle?.plate || "").toLowerCase();
    const vehicleInfo = `${rental.vehicle?.brand || ""} ${rental.vehicle?.model || ""}`.toLowerCase();
    return driverName.includes(query) || plate.includes(query) || vehicleInfo.includes(query);
  });

  const handleDeleteRental = async () => {
    if (!deleteRental) return;
    
    setProcessingId(deleteRental.id);
    try {
      const { error } = await supabase
        .from("vehicle_rentals")
        .delete()
        .eq("id", deleteRental.id);

      if (error) throw error;
      toast.success("Umowa została usunięta");
      loadRentals();
    } catch (error: any) {
      console.error("Error deleting rental:", error);
      toast.error(error.message || "Błąd usuwania umowy");
    } finally {
      setProcessingId(null);
      setDeleteRental(null);
    }
  };

  const canDelete = (rental: VehicleRental) => {
    // Only drafts and sent_to_client (before any signature) can be deleted
    return ["draft", "sent_to_client"].includes(rental.status) && !rental.driver_signed_at;
  };

  const openSigningLink = (rental: VehicleRental) => {
    let url = `/umowa/${rental.id}`;
    if (rental.portal_access_token) {
      url += `?token=${rental.portal_access_token}`;
    }
    window.open(url, "_blank");
  };

  const subTabs = [
    { value: "aktywne", label: "Aktywne", visible: true },
    { value: "do-podpisu", label: "Do podpisu", visible: true },
    { value: "zakonczone", label: "Zakończone", visible: true },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      {/* All content in one Card - sub-tabs inside */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Umowy najmu
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-4 md:p-6 pt-2">
          {/* Tabs + Search row - tabs FIRST, smaller search */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            {/* Sub-tabs FIRST */}
            <div className="flex gap-1 bg-muted rounded-lg p-1 shrink-0">
              {subTabs.map(tab => (
                <Button
                  key={tab.value}
                  size="sm"
                  variant={activeSubTab === tab.value ? "default" : "ghost"}
                  onClick={() => setActiveSubTab(tab.value as SubTab)}
                  className="text-xs sm:text-sm whitespace-nowrap"
                >
                  {tab.label}
                </Button>
              ))}
            </div>
            {/* Search SECOND - smaller width */}
            <div className="relative w-full sm:max-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Szukaj..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <Car className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {activeSubTab === "aktywne" && "Brak aktywnych umów najmu"}
                  {activeSubTab === "do-podpisu" && "Brak umów oczekujących na podpis"}
                  {activeSubTab === "zakonczone" && "Brak zakończonych umów"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-2 sm:mx-0">
                <div className="min-w-[600px] sm:min-w-0 px-2 sm:px-0">
                  <div className="rounded-md border">
                    <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pojazd</TableHead>
                      <TableHead>Kierowca</TableHead>
                      <TableHead className="hidden md:table-cell">Typ</TableHead>
                      <TableHead className="hidden sm:table-cell">Stawka</TableHead>
                      <TableHead className="hidden lg:table-cell">Data rozpoczęcia</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Akcje</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((rental) => {
                      const statusInfo = getStatusInfo(rental.status);
                      return (
                        <TableRow 
                          key={rental.id}
                          className="hover:bg-muted/50 cursor-pointer"
                          onClick={() => {
                            setSelectedRental(rental);
                            setShowEditFlow(true);
                          }}
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
                          <TableCell className="hidden md:table-cell">
                            <Badge variant="outline">
                              {getRentalTypeLabel(rental.rental_type)}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {rental.weekly_rental_fee 
                              ? `${rental.weekly_rental_fee} zł` 
                              : "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
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
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button size="sm" variant="ghost">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-popover">
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRental(rental);
                                  setShowEditFlow(true);
                                }}>
                                  <Eye className="h-4 w-4 mr-2" /> Podgląd
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  openSigningLink(rental);
                                }}>
                                  <ExternalLink className="h-4 w-4 mr-2" /> Otwórz link
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  // Print functionality
                                  openSigningLink(rental);
                                }}>
                                  <Printer className="h-4 w-4 mr-2" /> Wydrukuj
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  toast.info("Pobieranie PDF...");
                                }}>
                                  <Download className="h-4 w-4 mr-2" /> Pobierz PDF
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  toast.info("Wysyłanie do klienta...");
                                }}>
                                  <Send className="h-4 w-4 mr-2" /> Wyślij do klienta
                                </DropdownMenuItem>
                                {canDelete(rental) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteRental(rental);
                                      }}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" /> Usuń
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {["finalized", "active", "fleet_signed"].includes(rental.status) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toast.info("Zakończenie umowy...");
                                      }}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <XCircle className="h-4 w-4 mr-2" /> Zakończ umowę
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
        </CardContent>
      </Card>

      {/* Rental Edit Flow Dialog */}
      {selectedRental && showEditFlow && (
        <Dialog open={showEditFlow} onOpenChange={() => {
          setShowEditFlow(false);
          setSelectedRental(null);
        }}>
          <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
            <DialogHeader className="pb-2">
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                Umowa najmu - {selectedRental.vehicle?.brand} {selectedRental.vehicle?.model}
              </DialogTitle>
            </DialogHeader>
            <RentalContractSignatureFlow
              rentalId={selectedRental.id}
              fleetId={fleetId}
              onComplete={() => {
                loadRentals();
                setShowEditFlow(false);
                setSelectedRental(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

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
            <RentalPhotoProtocol rentalId={selectedRental.id} />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteRental} onOpenChange={() => setDeleteRental(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usuń umowę najmu</AlertDialogTitle>
            <AlertDialogDescription>
              Czy na pewno chcesz usunąć tę umowę najmu? Ta operacja jest nieodwracalna.
              {deleteRental && (
                <div className="mt-2 p-3 bg-muted rounded-md">
                  <p className="font-medium">
                    {deleteRental.vehicle?.brand} {deleteRental.vehicle?.model} ({deleteRental.vehicle?.plate})
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Kierowca: {deleteRental.driver?.first_name} {deleteRental.driver?.last_name}
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteRental}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Usuń umowę
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
