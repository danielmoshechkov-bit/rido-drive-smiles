import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { Car, Building2 } from "lucide-react";

interface VehicleHistorySectionProps {
  driverId: string;
  onUpdate: () => void;
}

interface VehicleAssignment {
  id: string;
  vehicle_id: string;
  fleet_id: string;
  assigned_at: string;
  unassigned_at: string | null;
  status: string;
  vehicle: {
    plate: string;
    brand: string;
    model: string;
  };
  fleet: {
    name: string;
  };
}

export function VehicleHistorySection({ driverId, onUpdate }: VehicleHistorySectionProps) {
  const [assignments, setAssignments] = useState<VehicleAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVehicleHistory();
  }, [driverId]);

  const fetchVehicleHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('driver_vehicle_assignments')
        .select(`
          id,
          vehicle_id,
          fleet_id,
          assigned_at,
          unassigned_at,
          status,
          vehicles!inner(
            plate,
            brand,
            model
          ),
          fleets!inner(
            name
          )
        `)
        .eq('driver_id', driverId)
        .order('assigned_at', { ascending: false });

      if (error) throw error;
      
      // Transform data to match interface
      const transformed = (data || []).map((item: any) => ({
        id: item.id,
        vehicle_id: item.vehicle_id,
        fleet_id: item.fleet_id,
        assigned_at: item.assigned_at,
        unassigned_at: item.unassigned_at,
        status: item.status,
        vehicle: item.vehicles,
        fleet: item.fleets,
      }));
      
      setAssignments(transformed);
    } catch (error) {
      console.error('Error fetching vehicle history:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-xs text-muted-foreground">Ładowanie historii...</div>;
  }

  if (assignments.length === 0) {
    return (
      <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded border border-dashed">
        Brak historii wynajmu pojazdów flotowych
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {assignments.map((assignment) => (
        <Card key={assignment.id} className="p-3 bg-muted/30 border-l-2 border-l-primary/30">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Car className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium text-sm">
                    {assignment.vehicle.plate}
                  </span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs">
                    {assignment.vehicle.brand} {assignment.vehicle.model}
                  </span>
                </div>
                {assignment.status === 'active' && (
                  <Badge className="bg-green-500/10 text-green-700 border-green-500/20 text-[10px] px-1.5 py-0">
                    AKTYWNE
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" />
                <span>{assignment.fleet.name}</span>
              </div>

              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Od:</span>{' '}
                {format(new Date(assignment.assigned_at), 'dd MMM yyyy', { locale: pl })}
                {assignment.unassigned_at && (
                  <>
                    {' '}• <span className="font-medium">Do:</span>{' '}
                    {format(new Date(assignment.unassigned_at), 'dd MMM yyyy', { locale: pl })}
                  </>
                )}
                {!assignment.unassigned_at && assignment.status === 'active' && (
                  <span className="ml-1 text-green-600 font-medium">— obecnie</span>
                )}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
