import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OwnCarCard } from "./OwnCarCard";

interface OwnCarWrapperProps {
  driverData: any;
  refreshTrigger?: number;
}

interface VehicleAssignment {
  vehicle_id: string;
  assigned_at: string;
  unassigned_at?: string;
  vehicles: {
    brand: string;
    model: string;
    plate: string;
    year?: number;
    color?: string;
    vin?: string;
    fleet_id?: string;
  };
}

export const OwnCarWrapper = ({ driverData, refreshTrigger }: OwnCarWrapperProps) => {
  const [assignment, setAssignment] = useState<VehicleAssignment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOwnVehicleAssignment = async () => {
      try {
        const { data, error } = await supabase
          .from("driver_vehicle_assignments")
          .select(`
            vehicle_id,
            assigned_at,
            unassigned_at,
            vehicles (
              brand,
              model,
              plate,
              year,
              color,
              vin,
              fleet_id
            )
          `)
          .eq("driver_id", driverData.driver_id)
          .is("unassigned_at", null)
          .eq("status", "active")
          .is("vehicles.fleet_id", null) // Only personal cars (not fleet cars)
          .order("assigned_at", { ascending: false })
          .limit(1)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error("Error loading own vehicle assignment:", error);
        } else if (data) {
          setAssignment(data as VehicleAssignment);
        }
      } catch (error) {
        console.error("Error loading own vehicle assignment:", error);
      } finally {
        setLoading(false);
      }
    };

    if (driverData.driver_id) {
      loadOwnVehicleAssignment();
    }
  }, [driverData.driver_id, refreshTrigger]);

  if (loading) {
    return (
      <div className="rounded-lg border bg-card shadow-sm p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-muted rounded w-1/3 mb-3"></div>
          <div className="h-6 bg-muted rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-muted rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return null; // Don't show anything if no personal car
  }

  return (
    <OwnCarCard
      vehicle={assignment?.vehicles || null}
      assignment={assignment}
    />
  );
};