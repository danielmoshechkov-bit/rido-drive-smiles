import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Car, Calendar, Building2 } from "lucide-react";

interface LeasedCarCardProps {
  driverData: any;
}

interface VehicleAssignment {
  vehicle_id: string;
  assigned_at: string;
  vehicles: {
    brand: string;
    model: string;
    plate: string;
    year?: number;
    color?: string;
    vin?: string;
    weekly_rental_fee?: number;
  };
  fleets?: {
    name: string;
  };
}

export const LeasedCarCard = ({ driverData }: LeasedCarCardProps) => {
  const [assignment, setAssignment] = useState<VehicleAssignment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVehicleAssignment = async () => {
      try {
        const { data, error } = await supabase
          .from("driver_vehicle_assignments")
          .select(`
            vehicle_id,
            assigned_at,
            vehicles (
              brand,
              model,
              plate,
              year,
              color,
              vin,
              weekly_rental_fee,
              fleet_id
            ),
            fleets (
              name
            )
          `)
          .eq("driver_id", driverData.driver_id)
          .is("unassigned_at", null)
          .eq("status", "active")
          .order("assigned_at", { ascending: false })
          .limit(1)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error("Error loading vehicle assignment:", error);
        } else if (data) {
          setAssignment(data as VehicleAssignment);
        }
      } catch (error) {
        console.error("Error loading vehicle assignment:", error);
      } finally {
        setLoading(false);
      }
    };

    if (driverData.driver_id) {
      loadVehicleAssignment();
    }
  }, [driverData.driver_id]);

  if (loading) {
    return (
      <Card className="rounded-xl shadow-soft">
        <CardContent className="p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded w-1/3 mb-3"></div>
            <div className="h-6 bg-muted rounded w-1/2 mb-2"></div>
            <div className="h-4 bg-muted rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!assignment) {
    return (
      <Card className="rounded-xl shadow-soft border border-muted/50">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Car className="h-5 w-5 text-muted-foreground" />
            Wynajęte auto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Car className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Brak przypisanego pojazdu</p>
            <p className="text-sm mt-1">Skontaktuj się z administratorem</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pl-PL", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  };

  return (
    <Card className="rounded-xl shadow-soft hover:shadow-purple/10 transition-all duration-300">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Car className="h-5 w-5 text-primary" />
          Wynajęte auto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Vehicle Details */}
          <div className="space-y-3">
            <div>
              <h3 className="text-xl font-bold text-foreground">
                {assignment.vehicles.brand} {assignment.vehicles.model}
              </h3>
              <p className="text-lg font-medium text-muted-foreground uppercase tracking-wider">
                {assignment.vehicles.plate}
              </p>
            </div>
            
            <div className="space-y-2 text-sm">
              {assignment.vehicles.year && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rok produkcji:</span>
                  <span className="font-medium">{assignment.vehicles.year}</span>
                </div>
              )}
              {assignment.vehicles.color && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kolor:</span>
                  <span className="font-medium">{assignment.vehicles.color}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Wynajem:</span>
                <span className="font-bold text-primary">
                  {assignment.vehicles.weekly_rental_fee || 0} zł/tydz.
                </span>
              </div>
            </div>

            {assignment.vehicles.vin && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">VIN:</p>
                <p className="font-mono text-sm text-foreground break-all">
                  {assignment.vehicles.vin}
                </p>
              </div>
            )}
          </div>

          {/* Right Column - Fleet & Assignment Info */}
          <div className="space-y-4">
            {assignment.fleets && (
              <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                <Building2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Flota:</p>
                  <p className="font-semibold text-foreground">{assignment.fleets.name}</p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg">
              <Calendar className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">Od kiedy korzystasz z auta:</p>
                <p className="font-semibold text-foreground">
                  {formatDate(assignment.assigned_at)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};