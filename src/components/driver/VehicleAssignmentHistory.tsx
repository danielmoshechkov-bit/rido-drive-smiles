import React from "react";
import { Calendar, Car, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface HistoricalAssignment {
  vehicle_id: string;
  assigned_at: string;
  unassigned_at?: string;
  vehicles: {
    brand: string;
    model: string;
    plate: string;
    vin?: string;
    weekly_rental_fee?: number;
    fleets?: {
      name: string;
      contact_phone_for_drivers?: string;
    };
  };
}

interface VehicleAssignmentHistoryProps {
  assignments: HistoricalAssignment[];
}

export const VehicleAssignmentHistory = ({ assignments }: VehicleAssignmentHistoryProps) => {
  if (!assignments || assignments.length === 0) {
    return null;
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Historia wynajmów
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {assignments.map((assignment, index) => (
          <div
            key={`${assignment.vehicle_id}-${index}`}
            className="rounded-xl border bg-muted/30 p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-primary font-semibold">
                  <Car className="h-4 w-4" />
                  <span>
                    {assignment.vehicles.brand} {assignment.vehicles.model}
                  </span>
                </div>
                <div className="text-sm font-medium text-foreground mt-1">
                  {assignment.vehicles.plate}
                </div>
                {assignment.vehicles.vin && (
                  <div className="text-xs text-muted-foreground mt-1 font-mono">
                    VIN: {assignment.vehicles.vin}
                  </div>
                )}
              </div>

              {assignment.vehicles.fleets && (
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{assignment.vehicles.fleets.name}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm pt-3 border-t">
              <div>
                <div className="text-muted-foreground text-xs">Od kiedy:</div>
                <div className="font-medium">
                  {new Date(assignment.assigned_at).toLocaleDateString("pl-PL", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Do kiedy:</div>
                <div className="font-medium">
                  {assignment.unassigned_at
                    ? new Date(assignment.unassigned_at).toLocaleDateString("pl-PL", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "—"}
                </div>
              </div>
            </div>

            {assignment.vehicles.weekly_rental_fee && (
              <div className="pt-3 border-t">
                <div className="text-xs text-muted-foreground">Opłata tygodniowa:</div>
                <div className="text-lg font-semibold text-primary">
                  {assignment.vehicles.weekly_rental_fee.toFixed(2)} zł
                </div>
              </div>
            )}

            {assignment.vehicles.fleets?.contact_phone_for_drivers && (
              <div className="text-xs text-muted-foreground">
                Kontakt: {assignment.vehicles.fleets.contact_phone_for_drivers}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
