import React from "react";
import { Car, Calendar, Building2 } from "lucide-react";
import { VehicleRentBlock } from "@/components/ui/VehicleRentBlock";

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

  const formatDate = (dateString: string) => {
    if (!dateString) return "—";
    try {
      return new Date(dateString).toLocaleDateString("pl-PL");
    } catch (error) {
      return "—";
    }
  };

  return (
    <div className="rounded-2xl border bg-card shadow-soft p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-lg font-semibold text-primary">
          <Car className="h-5 w-5" />
          Wynajęte auto
        </div>
        {vehicle?.weekly_rental_fee && (
          <VehicleRentBlock 
            value={vehicle.weekly_rental_fee} 
            readOnly={readOnlyRent} 
          />
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <span className="font-medium text-sm text-muted-foreground">Numer rejestracyjny</span>
          <div className="font-semibold text-lg">{vehicle.plate}</div>
        </div>
        <div>
          <span className="font-medium text-sm text-muted-foreground">Pojazd</span>
          <div className="font-semibold">{vehicle.brand} {vehicle.model}</div>
        </div>
        <div>
          <span className="font-medium text-sm text-muted-foreground">Rok produkcji</span>
          <div>{vehicle.year || "—"}</div>
        </div>
        <div>
          <span className="font-medium text-sm text-muted-foreground">Kolor</span>
          <div>{vehicle.color || "—"}</div>
        </div>
        <div>
          <span className="font-medium text-sm text-muted-foreground">VIN</span>
          <div className="font-mono text-sm">{vehicle.vin || "—"}</div>
        </div>
        <div>
          <span className="font-medium text-sm text-muted-foreground">Przypisany od</span>
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {formatDate(assignment?.assigned_at)}
          </div>
        </div>
      </div>

      {fleet && (
        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-3 text-muted-foreground">
            <Building2 className="h-4 w-4" />
            <span className="font-medium">Informacje o flocie</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Nazwa floty:</span>
              <div className="font-medium">{fleet.name}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Kontakt:</span>
              <div className="font-medium">{fleet.contact_name || "—"}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Telefon:</span>
              <div className="font-medium">{fleet.contact_phone_for_drivers || fleet.phone || "—"}</div>
            </div>
            <div>
              <span className="text-muted-foreground">NIP:</span>
              <div className="font-medium">{fleet.nip || "—"}</div>
            </div>
          </div>
        </div>
      )}
      
      <div className="border-t pt-4 mt-4">
        <div className="flex gap-2">
          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">OC ważne</span>
          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Przegląd ważny</span>
        </div>
      </div>
    </div>
  );
}