import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { Car, Calendar, Phone } from "lucide-react";
import { RentalReviewModal } from "@/components/reviews/RentalReviewModal";

interface Rental {
  id: string;
  status: string;
  weekly_price: number;
  rental_start: string | null;
  rental_end: string | null;
  driver_reviewed: boolean;
  created_at: string;
  vehicle: {
    brand: string;
    model: string;
    plate: string;
  };
  fleet: {
    id: string;
    name: string;
    contact_phone_for_drivers: string;
    phone: string;
  };
}

interface DriverRentalsViewProps {
  driverId: string;
}

export function DriverRentalsView({ driverId }: DriverRentalsViewProps) {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewRental, setReviewRental] = useState<Rental | null>(null);
  const [mandatoryReview, setMandatoryReview] = useState<Rental | null>(null);

  useEffect(() => {
    loadRentals();
  }, [driverId]);

  const loadRentals = async () => {
    try {
      const { data, error } = await supabase
        .from("vehicle_rentals")
        .select(`
          id, status, weekly_price, rental_start, rental_end, driver_reviewed, created_at,
          vehicle:vehicles!vehicle_id (brand, model, plate),
          fleet:fleets!fleet_id (id, name, contact_phone_for_drivers, phone)
        `)
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const rentalData = data as Rental[] || [];
      setRentals(rentalData);

      // Check for completed rentals without review
      const needsReview = rentalData.find(r => r.status === "completed" && !r.driver_reviewed);
      if (needsReview) {
        setMandatoryReview(needsReview);
      }
    } catch (error) {
      console.error("Error loading rentals:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "Oczekuje na akceptację", variant: "secondary" },
      accepted: { label: "Zaakceptowano", variant: "outline" },
      active: { label: "Aktywny najem", variant: "default" },
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
            Moje rezerwacje z giełdy
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rentals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Brak rezerwacji</p>
              <p className="text-sm mt-2">
                Przejdź na <a href="/gielda" className="text-primary hover:underline">giełdę aut</a> aby znaleźć auto do wynajęcia
              </p>
            </div>
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

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{rental.fleet.name}</span>
                    <span className="font-medium">{rental.weekly_price} zł/tydz</span>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
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

                  {rental.status === "active" && (
                    <div className="flex items-center gap-2 pt-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a 
                        href={`tel:${rental.fleet.contact_phone_for_drivers || rental.fleet.phone}`}
                        className="text-primary hover:underline"
                      >
                        {rental.fleet.contact_phone_for_drivers || rental.fleet.phone}
                      </a>
                    </div>
                  )}

                  {rental.status === "completed" && !rental.driver_reviewed && (
                    <div className="pt-2">
                      <Button
                        size="sm"
                        onClick={() => setReviewRental(rental)}
                      >
                        Oceń flotę
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Voluntary review */}
      {reviewRental && (
        <RentalReviewModal
          open={!!reviewRental}
          onOpenChange={(open) => !open && setReviewRental(null)}
          rental={{
            id: reviewRental.id,
            fleetName: reviewRental.fleet.name,
            fleetId: reviewRental.fleet.id
          }}
          reviewerType="driver"
          reviewerId={driverId}
          onSuccess={() => {
            loadRentals();
            setReviewRental(null);
          }}
        />
      )}

      {/* Mandatory review for completed rentals */}
      {mandatoryReview && (
        <RentalReviewModal
          open={!!mandatoryReview}
          onOpenChange={() => {}}
          rental={{
            id: mandatoryReview.id,
            fleetName: mandatoryReview.fleet.name,
            fleetId: mandatoryReview.fleet.id
          }}
          reviewerType="driver"
          reviewerId={driverId}
          onSuccess={() => {
            loadRentals();
            setMandatoryReview(null);
          }}
          mandatory={true}
        />
      )}
    </>
  );
}
