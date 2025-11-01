import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LeasedCarCard } from "./LeasedCarCard";
import { VehicleAssignmentHistory } from "./VehicleAssignmentHistory";

interface LeasedCarWrapperProps {
  driverData: any;
}

interface VehicleAssignment {
  vehicle_id: string;
  assigned_at: string;
  unassigned_at?: string;
  status: string;
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
      contact_phone_for_drivers?: string;
    };
  };
}

export const LeasedCarWrapper = ({ driverData }: LeasedCarWrapperProps) => {
  const [activeAssignment, setActiveAssignment] = useState<VehicleAssignment | null>(null);
  const [historicalAssignments, setHistoricalAssignments] = useState<VehicleAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVehicleAssignments = async () => {
      try {
        console.log('🚗 [LeasedCarWrapper] Loading vehicle assignments for driver_id:', driverData.driver_id);
        
        // Load ALL assignments (active and historical)
        const { data, error } = await supabase
          .from("driver_vehicle_assignments")
          .select(`
            vehicle_id,
            assigned_at,
            unassigned_at,
            status,
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
          .order("assigned_at", { ascending: false });

        console.log('🚗 [LeasedCarWrapper] Query result:', { data, error });

        if (error) {
          console.error("❌ [LeasedCarWrapper] Error loading vehicle assignments:", error);
        } else if (data && data.length > 0) {
          console.log('✅ [LeasedCarWrapper] Found assignments:', data);
          
          // Separate active and historical assignments
          const active = data.find(
            (a: VehicleAssignment) => a.status === 'active' && a.unassigned_at === null
          );
          const historical = data.filter(
            (a: VehicleAssignment) => a.status === 'inactive' || a.unassigned_at !== null
          );

          setActiveAssignment(active || null);
          setHistoricalAssignments(historical);
        } else {
          console.log('ℹ️ [LeasedCarWrapper] No assignments found');
          setActiveAssignment(null);
          setHistoricalAssignments([]);
        }
      } catch (error) {
        console.error("❌ [LeasedCarWrapper] Exception:", error);
      } finally {
        setLoading(false);
      }
    };

    if (driverData.driver_id) {
      loadVehicleAssignments();
      
      // Poll every 5 seconds to check for new assignments
      const interval = setInterval(loadVehicleAssignments, 5000);
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
    <>
      <LeasedCarCard
        vehicle={activeAssignment?.vehicles || null}
        assignment={activeAssignment}
        fleet={activeAssignment?.vehicles?.fleets}
        readOnlyRent={true}
      />
      
      {historicalAssignments.length > 0 && (
        <VehicleAssignmentHistory assignments={historicalAssignments} />
      )}
    </>
  );
};