import React from "react";
import { Car, Calendar } from "lucide-react";

export function OwnCarCard({
  vehicle,
  assignment,
}: {
  vehicle: any;
  assignment?: any;
}) {
  if (!vehicle) {
    return null;
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
            <span className="font-medium text-sm text-muted-foreground">Dodane:</span>
            <div className="font-semibold flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(assignment?.assigned_at)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}