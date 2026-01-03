import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { LeasedCarCard } from "./LeasedCarCard";
import { VehicleAssignmentHistory } from "./VehicleAssignmentHistory";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

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
  const { t } = useTranslation();
  const [activeAssignment, setActiveAssignment] = useState<VehicleAssignment | null>(null);
  const [historicalAssignments, setHistoricalAssignments] = useState<VehicleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const loadVehicleAssignments = async () => {
      try {
        console.log('🚗 [LeasedCarWrapper] Loading vehicle assignments for driver_id:', driverData.driver_id);
        
        // Step 1: Load assignments (no nested selects)
        const { data: assignments, error: assignmentsError } = await supabase
          .from("driver_vehicle_assignments")
          .select("id, vehicle_id, fleet_id, assigned_at, unassigned_at, status")
          .eq("driver_id", driverData.driver_id)
          .order("assigned_at", { ascending: false });

        if (assignmentsError) {
          console.error("❌ [LeasedCarWrapper] Error loading assignments:", assignmentsError);
          setLoading(false);
          return;
        }

        if (!assignments || assignments.length === 0) {
          console.log('ℹ️ [LeasedCarWrapper] No assignments found');
          setActiveAssignment(null);
          setHistoricalAssignments([]);
          setLoading(false);
          return;
        }

        console.log('✅ [LeasedCarWrapper] Found assignments:', assignments);

        // Step 2: Get unique vehicle IDs and fleet IDs
        const vehicleIds = [...new Set(assignments.map(a => a.vehicle_id).filter(Boolean))];
        const fleetIds = [...new Set(assignments.map(a => a.fleet_id).filter(Boolean))];

        // Step 3: Load vehicles separately
        const { data: vehicles } = await supabase
          .from("vehicles")
          .select("id, brand, model, plate, year, color, vin, weekly_rental_fee, fleet_id")
          .in("id", vehicleIds);

        // Step 4: Load fleets separately
        const { data: fleets } = await supabase
          .from("fleets")
          .select("id, name, nip, city, postal_code, street, house_number, contact_name, phone, contact_phone_for_drivers, owner_name, owner_phone")
          .in("id", fleetIds);

        console.log('🚗 [LeasedCarWrapper] Loaded vehicles:', vehicles);
        console.log('🚗 [LeasedCarWrapper] Loaded fleets:', fleets);

        // Step 5: Merge data
        const enrichedAssignments = assignments.map(assignment => {
          const vehicle = vehicles?.find(v => v.id === assignment.vehicle_id);
          const fleet = fleets?.find(f => f.id === (assignment.fleet_id || vehicle?.fleet_id));

          return {
            ...assignment,
            vehicles: vehicle ? {
              ...vehicle,
              fleets: fleet
            } : null
          };
        });

        console.log('🚗 [LeasedCarWrapper] Enriched assignments:', enrichedAssignments);

        // Step 6: Separate active and historical - ONLY show fleet vehicles
        const active = enrichedAssignments.find(
          (a: any) => a.status === 'active' && a.unassigned_at === null && a.vehicles?.fleets
        );
        const historical = enrichedAssignments.filter(
          (a: any) => (a.status === 'inactive' || a.unassigned_at !== null) && a.vehicles?.fleets
        );

        setActiveAssignment(active || null);
        setHistoricalAssignments(historical);
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

  // Don't render anything if no active fleet assignment
  if (!activeAssignment) {
    return null;
  }

  return (
    <>
      <LeasedCarCard
        vehicle={activeAssignment.vehicles}
        assignment={activeAssignment}
        fleet={activeAssignment.vehicles?.fleets}
        readOnlyRent={true}
      />
      
      {historicalAssignments.length > 0 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="mt-4">
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full flex items-center justify-between">
              <span>{t('driver.cars.rentalHistory')} ({historicalAssignments.length})</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <VehicleAssignmentHistory assignments={historicalAssignments} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  );
};