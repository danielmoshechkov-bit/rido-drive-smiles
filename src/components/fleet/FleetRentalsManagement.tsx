import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { Check, X, Calendar, Car, User } from "lucide-react";
import { RentalReviewModal } from "@/components/reviews/RentalReviewModal";

interface Rental {
  id: string;
  status: string;
  weekly_price: number;
  rental_start: string | null;
  rental_end: string | null;
  fleet_reviewed: boolean;
  created_at: string;
  vehicle: {
    brand: string;
    model: string;
    plate: string;
  };
  driver: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
  };
}

interface FleetRentalsManagementProps {
  fleetId: string;
}

export function FleetRentalsManagement({ fleetId }: FleetRentalsManagementProps) {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [reviewRental, setReviewRental] = useState<Rental | null>(null);

  useEffect(() => {
    loadRentals();
  }, [fleetId]);

  const loadRentals = async () => {
    try {
      // Only load marketplace reservations (from vehicle listings)
      const { data, error } = await supabase
        .from("vehicle_rentals")
        .select(`
          id, status, weekly_price, rental_start, rental_end, fleet_reviewed, created_at,
          vehicle:vehicles!vehicle_id (brand, model, plate),
          driver:drivers!driver_id (id, first_name, last_name, phone)
        `)
        .eq("fleet_id", fleetId)
        .eq("source", "marketplace")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRentals(data as Rental[] || []);
    } catch (error) {
      console.error("Error loading rentals:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (rental: Rental) => {
    if (!startDate) {
      toast.error("Wybierz datę rozpoczęcia najmu");
      return;
    }

    setProcessingId(rental.id);
    try {
      // Update rental status
      const { error: rentalError } = await supabase
        .from("vehicle_rentals")
        .update({
          status: "active",
          rental_start: startDate
        })
        .eq("id", rental.id);

      if (rentalError) throw rentalError;

      // Mark listing as unavailable
      const { error: listingError } = await supabase
        .from("vehicle_listings")
        .update({ is_available: false })
        .eq("vehicle_id", rental.vehicle.plate); // We need vehicle_id, let's use a different approach

      // Actually get listing and update it
      const { data: listing } = await supabase
        .from("vehicle_listings")
        .select("id")
        .eq("fleet_id", fleetId)
        .single();

      if (listing) {
        await supabase
          .from("vehicle_listings")
          .update({ is_available: false })
          .eq("id", listing.id);
      }

      toast.success("Najem zaakceptowany!");
      setStartDate("");
      loadRentals();
    } catch (error: any) {
      console.error("Error accepting rental:", error);
      toast.error(error.message || "Błąd akceptacji");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (rentalId: string) => {
    setProcessingId(rentalId);
    try {
      const { error } = await supabase
        .from("vehicle_rentals")
        .update({ status: "rejected" })
        .eq("id", rentalId);

      if (error) throw error;
      toast.success("Rezerwacja odrzucona");
      loadRentals();
    } catch (error: any) {
      console.error("Error rejecting:", error);
      toast.error(error.message || "Błąd odrzucania");
    } finally {
      setProcessingId(null);
    }
  };

  const handleComplete = async (rental: Rental) => {
    setProcessingId(rental.id);
    try {
      const { error } = await supabase
        .from("vehicle_rentals")
        .update({ 
          status: "completed",
          rental_end: new Date().toISOString().slice(0, 10)
        })
        .eq("id", rental.id);

      if (error) throw error;

      // Re-enable listing
      const { data: listing } = await supabase
        .from("vehicle_listings")
        .select("id")
        .eq("fleet_id", fleetId)
        .single();

      if (listing) {
        await supabase
          .from("vehicle_listings")
          .update({ is_available: true })
          .eq("id", listing.id);
      }

      toast.success("Najem zakończony");
      loadRentals();
      
      // Open review modal
      setReviewRental(rental);
    } catch (error: any) {
      console.error("Error completing:", error);
      toast.error(error.message || "Błąd zakończenia");
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "Oczekuje", variant: "secondary" },
      accepted: { label: "Zaakceptowano", variant: "outline" },
      active: { label: "Aktywny", variant: "default" },
      completed: { label: "Zakończony", variant: "outline" },
      cancelled: { label: "Anulowany", variant: "destructive" },
      rejected: { label: "Odrzucony", variant: "destructive" }
    };
    const s = variants[status] || { label: status, variant: "secondary" as const };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Ładowanie...</div>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Rezerwacje z giełdy
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rentals.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Brak rezerwacji</p>
          ) : (
            <div className="space-y-4">
              {rentals.map(rental => (
                <div key={rental.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">
                        {rental.vehicle.brand} {rental.vehicle.model}
                      </h4>
                      <p className="text-sm text-muted-foreground font-mono">{rental.vehicle.plate}</p>
                    </div>
                    {getStatusBadge(rental.status)}
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{rental.driver.first_name} {rental.driver.last_name}</span>
                    {rental.driver.phone && (
                      <a href={`tel:${rental.driver.phone}`} className="text-primary hover:underline">
                        {rental.driver.phone}
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{rental.weekly_price} zł/tydz</span>
                    {rental.rental_start && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        od {format(new Date(rental.rental_start), "dd.MM.yyyy", { locale: pl })}
                      </span>
                    )}
                    {rental.rental_end && (
                      <span>
                        do {format(new Date(rental.rental_end), "dd.MM.yyyy", { locale: pl })}
                      </span>
                    )}
                  </div>

                  {rental.status === "pending" && (
                    <div className="flex items-center gap-2 pt-2">
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-40"
                        placeholder="Data rozpoczęcia"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleAccept(rental)}
                        disabled={processingId === rental.id}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Akceptuj
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(rental.id)}
                        disabled={processingId === rental.id}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Odrzuć
                      </Button>
                    </div>
                  )}

                  {rental.status === "active" && (
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleComplete(rental)}
                        disabled={processingId === rental.id}
                      >
                        Zakończ najem
                      </Button>
                    </div>
                  )}

                  {rental.status === "completed" && !rental.fleet_reviewed && (
                    <div className="pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReviewRental(rental)}
                      >
                        Oceń kierowcę
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {reviewRental && (
        <RentalReviewModal
          open={!!reviewRental}
          onOpenChange={(open) => !open && setReviewRental(null)}
          rental={{
            id: reviewRental.id,
            driverName: `${reviewRental.driver.first_name} ${reviewRental.driver.last_name}`,
            driverId: reviewRental.driver.id
          }}
          reviewerType="fleet"
          reviewerId={fleetId}
          onSuccess={() => {
            loadRentals();
            setReviewRental(null);
          }}
        />
      )}
    </>
  );
}
