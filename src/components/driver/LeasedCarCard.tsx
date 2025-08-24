import React from "react";
import { Car, Calendar, Building2 } from "lucide-react";
import { VehicleRentBlock } from "@/components/ui/VehicleRentBlock";

// LeasedCarCard — karta auta w panelu kierowcy (spójna z adminem)
export function LeasedCarCard({
  vehicle,
  assignment,
  fleet,
  readOnlyRent = true,
}: {
  vehicle: any;
  assignment?: any;
  fleet?: any;
  readOnlyRent?: boolean;
}) {
  if (!vehicle) {
    return (
      <div className="rounded-2xl border bg-card shadow-soft p-5">
        <div className="text-center py-8 text-muted-foreground">
          <Car className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Brak przypisanego pojazdu</p>
          <p className="text-sm mt-1">Skontaktuj się z administratorem</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card shadow-soft p-5 hover:shadow-purple/10 transition-all duration-300">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-2 text-lg font-semibold text-primary mb-3">
            <Car className="h-5 w-5" />
            Wynajęte auto
          </div>
          
          <h3 className="text-2xl font-bold text-foreground">
            {vehicle.brand} {vehicle.model}
          </h3>
          <div className="text-xl font-semibold text-primary uppercase tracking-wider">
            {vehicle.plate}
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-4 text-sm">
            <div className="text-muted-foreground">Rok produkcji:</div>
            <div className="font-medium">{vehicle.year || "—"}</div>
            <div className="text-muted-foreground">Kolor:</div>
            <div className="font-medium">{vehicle.color || "—"}</div>
          </div>

          {/* Wynajem — etykieta w 1 rzędzie, kwota POD spodem */}
          <div className="mt-4">
            <VehicleRentBlock
              value={vehicle.weekly_rental_fee || 0}
              readOnly={readOnlyRent}
            />
          </div>

          {vehicle.vin && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-muted-foreground text-sm">VIN:</div>
              <div className="font-mono text-sm text-foreground break-all mt-1">
                {vehicle.vin}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-[260px] space-y-3">
          {fleet && (
            <div className="bg-primary/5 rounded-2xl p-4">
              <Building2 className="h-5 w-5 text-primary mb-2" />
              <div className="text-muted-foreground text-sm">Flota:</div>
              <div className="font-semibold text-foreground">{fleet.name}</div>
            </div>
          )}
          
          <div className="bg-primary/5 rounded-2xl p-4">
            <Calendar className="h-5 w-5 text-primary mb-2" />
            <div className="text-muted-foreground text-sm">
              Od kiedy korzystasz z auta:
            </div>
            <div className="font-semibold text-foreground">
              {assignment?.assigned_at
                ? new Date(assignment.assigned_at).toLocaleDateString("pl-PL", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}