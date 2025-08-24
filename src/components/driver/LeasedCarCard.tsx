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
    <div className="rounded-lg border bg-card shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-lg font-semibold text-primary">
          <Car className="h-5 w-5" />
          Moje auto
        </div>
      </div>
      
      {/* Format similar to fleet table - simplified */}
      <div className="space-y-4">
        {/* First row - basic info */}
        <div className="flex items-center gap-6">
          <div className="min-w-[120px]">
            <span className="font-medium text-sm text-muted-foreground">Nr rej.:</span>
            <div className="font-semibold">{vehicle.plate}</div>
          </div>
          <div className="min-w-[150px]">
            <span className="font-medium text-sm text-muted-foreground">Pojazd:</span>
            <div className="font-semibold">{vehicle.brand} {vehicle.model}</div>
          </div>
          <div className="min-w-[80px]">
            <span className="font-medium text-sm text-muted-foreground">Rok:</span>
            <div className="font-semibold">{vehicle.year || "—"}</div>
          </div>
        </div>
        
        {/* Second row - documents */}
        <div className="flex items-center gap-6 pt-2 border-t border-muted/30">
          <div className="min-w-[200px]">
            <span className="font-medium text-sm text-muted-foreground">Dokumenty:</span>
            <div className="flex gap-2 mt-1">
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">OC ważne</span>
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Przegląd ważny</span>
            </div>
          </div>
          <div className="min-w-[150px]">
            <span className="font-medium text-sm text-muted-foreground">Od kiedy:</span>
            <div className="font-semibold">
              {assignment?.assigned_at
                ? new Date(assignment.assigned_at).toLocaleDateString("pl-PL")
                : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}