import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OwnCarCard } from "./OwnCarCard";

interface OwnCarsWrapperProps {
  driverData: any;
}

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

export const OwnCarsWrapper = ({ driverData }: OwnCarsWrapperProps) => {
  const [ownVehicles, setOwnVehicles] = useState<OwnVehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOwnVehicles = async () => {
      try {
        const { data, error } = await supabase
          .from("driver_vehicle_assignments")
          .select(`
            assigned_at,
            vehicles!inner (
              id,
              brand,
              model,
              plate,
              year,
              color,
              vin,
              vehicle_inspections (
                valid_to
              ),
              vehicle_policies (
                valid_to,
                type
              )
            )
          `)
          .eq("driver_id", driverData.driver_id)
          .is("unassigned_at", null)
          .eq("status", "active")
          .is("vehicles.fleet_id", null)  // Only own cars (no fleet)
          .order("assigned_at", { ascending: false });

        if (error) {
          console.error("Error loading own vehicles:", error);
        } else if (data) {
          const vehicles = data.map(assignment => ({
            ...assignment.vehicles,
            assigned_at: assignment.assigned_at
          })) as OwnVehicle[];
          setOwnVehicles(vehicles);
        }
      } catch (error) {
        console.error("Error loading own vehicles:", error);
      } finally {
        setLoading(false);
      }
    };

    if (driverData.driver_id) {
      loadOwnVehicles();
    }
  }, [driverData.driver_id]);

  if (loading) {
    return (
      <div className="rounded-2xl border bg-card shadow-soft p-5">
        <div className="animate-pulse">
          <div className="h-4 bg-muted rounded w-1/3 mb-3"></div>
          <div className="h-6 bg-muted rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-muted rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (ownVehicles.length === 0) {
    return (
      <div className="rounded-2xl border bg-card shadow-soft p-5">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Nie dodano jeszcze własnego auta</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ownVehicles.map((vehicle) => (
        <OwnCarCard key={vehicle.id} vehicle={vehicle} />
      ))}
    </div>
  );
};