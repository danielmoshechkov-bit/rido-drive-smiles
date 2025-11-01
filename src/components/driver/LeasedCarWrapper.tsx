import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LeasedCarCard } from "./LeasedCarCard";

interface LeasedCarWrapperProps {
  driverData: any;
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
    weekly_rental_fee?: number;
    fleets?: {
      name: string;
      nip?: string;
      address?: string;
      contact_name?: string;
      phone?: string;
    };
  };
}

export const LeasedCarWrapper = ({ driverData }: LeasedCarWrapperProps) => {
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
            unassigned_at,
            vehicles (
              brand,
              model,
              plate,
              year,
              color,
              vin,
              weekly_rental_fee,
              fleet_id,
              fleets (
                name,
                nip,
                city,
                postal_code,
                street,
                house_number,
                contact_name,
                phone,
                contact_phone_for_drivers,
                owner_name,
                owner_phone
              )
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
        } else {
          setAssignment(null);
        }
      } catch (error) {
        console.error("Error loading vehicle assignment:", error);
      } finally {
        setLoading(false);
      }
    };

    if (driverData.driver_id) {
      loadVehicleAssignment();
      
      // Poll every 5 seconds to check for new assignments
      const interval = setInterval(loadVehicleAssignment, 5000);
      return () => clearInterval(interval);
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

  return (
    <LeasedCarCard
      vehicle={assignment?.vehicles || null}
      assignment={assignment}
      fleet={assignment?.vehicles?.fleets}
      readOnlyRent={true}
    />
  );
};