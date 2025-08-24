import React from "react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface OwnVehicle {
  id: string;
  brand: string;
  model: string;
  plate: string;
  year?: number;
  color?: string;
  vin?: string;
  assigned_at: string;
  vehicle_inspections?: Array<{
    valid_to: string;
  }>;
  vehicle_policies?: Array<{
    valid_to: string;
    type: string;
  }>;
}

interface OwnCarCardProps {
  vehicle: OwnVehicle;
}

export const OwnCarCard = ({ vehicle }: OwnCarCardProps) => {
  // Get latest inspection and OC policy
  const latestInspection = vehicle.vehicle_inspections?.[0];
  const latestOC = vehicle.vehicle_policies?.find(p => p.type === 'OC');

  // Helper function to get expiry status
  const getExpiryStatus = (dateString: string) => {
    const expiryDate = new Date(dateString);
    const today = new Date();
    const diffDays = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
    
    if (diffDays < 0) return { variant: "destructive" as const, text: "Wygasło" };
    if (diffDays <= 30) return { variant: "secondary" as const, text: `${diffDays} dni` };
    return { variant: "outline" as const, text: `${diffDays} dni` };
  };

  return (
    <div className="rounded-2xl border bg-card shadow-soft p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Moje auto</h3>
        <Badge variant="outline" className="text-xs">
          Dodano: {format(new Date(vehicle.assigned_at), "dd.MM.yyyy", { locale: pl })}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Marka:</span>
            <span className="text-sm font-medium">{vehicle.brand}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Model:</span>
            <span className="text-sm font-medium">{vehicle.model}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Nr rej.:</span>
            <span className="text-sm font-medium font-mono">{vehicle.plate}</span>
          </div>
        </div>

        <div className="space-y-2">
          {vehicle.year && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Rok:</span>
              <span className="text-sm font-medium">{vehicle.year}</span>
            </div>
          )}
          {vehicle.color && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Kolor:</span>
              <span className="text-sm font-medium">{vehicle.color}</span>
            </div>
          )}
          {vehicle.vin && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">VIN:</span>
              <span className="text-sm font-medium font-mono text-xs">{vehicle.vin}</span>
            </div>
          )}
        </div>
      </div>

      {/* Document statuses */}
      <div className="flex gap-3 pt-3 border-t">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Przegląd:</span>
          {latestInspection ? (
            <Badge variant={getExpiryStatus(latestInspection.valid_to).variant} className="text-xs">
              {getExpiryStatus(latestInspection.valid_to).text}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">Brak danych</Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">OC:</span>
          {latestOC ? (
            <Badge variant={getExpiryStatus(latestOC.valid_to).variant} className="text-xs">
              {getExpiryStatus(latestOC.valid_to).text}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">Brak danych</Badge>
          )}
        </div>
      </div>
    </div>
  );
};