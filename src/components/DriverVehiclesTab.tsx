import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown, ChevronUp, Car, User } from "lucide-react";
import { VehicleInfoTab } from "./VehicleInfoTab";
import { VehicleServiceTab } from "./VehicleServiceTab";
import { VehicleDocuments } from "./VehicleDocuments";
import { VehicleDriverHistory } from "./VehicleDriverHistory";
import { ExpiryBadges } from "./ExpiryBadges";
import { toast } from "sonner";

interface DriverVehicle {
  id: string;
  plate: string;
  vin: string | null;
  brand: string;
  model: string;
  year: number | null;
  color: string | null;
  odometer: number | null;
  status: string;
  created_at: string;
  assignedDriver?: {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    assigned_at: string;
  } | null;
}

export function DriverVehiclesTab() {
  const [vehicles, setVehicles] = useState<DriverVehicle[]>([]);
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchDriverVehicles = async () => {
    setLoading(true);
    try {
      // Fetch vehicles where fleet_id IS NULL (driver's own cars)
      const { data: vehiclesData, error: vehiclesError } = await supabase
        .from("vehicles")
        .select("*")
        .is("fleet_id", null)
        .order("created_at", { ascending: false });

      if (vehiclesError) throw vehiclesError;

      // Get vehicle IDs
      const vehicleIds = vehiclesData?.map(v => v.id) || [];

      // Fetch active assignments for these vehicles
      const { data: assignments } = await supabase
        .from("driver_vehicle_assignments")
        .select(`
          vehicle_id,
          assigned_at,
          drivers(id, first_name, last_name, email)
        `)
        .in("vehicle_id", vehicleIds)
        .eq("status", "active");

      // Merge vehicles with assignments
      const vehiclesWithDrivers = vehiclesData?.map(vehicle => {
        const assignment = assignments?.find(a => a.vehicle_id === vehicle.id);
        return {
          ...vehicle,
          assignedDriver: assignment?.drivers
            ? {
                id: assignment.drivers.id,
                first_name: assignment.drivers.first_name,
                last_name: assignment.drivers.last_name,
                email: assignment.drivers.email,
                assigned_at: assignment.assigned_at
              }
            : null
        };
      }) || [];

      setVehicles(vehiclesWithDrivers);
    } catch (error) {
      console.error("Error fetching driver vehicles:", error);
      toast.error("Błąd ładowania aut kierowców");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDriverVehicles();
  }, []);

  const toggleExpanded = (vehicleId: string) => {
    const newExpanded = new Set(expandedVehicles);
    if (newExpanded.has(vehicleId)) {
      newExpanded.delete(vehicleId);
    } else {
      newExpanded.add(vehicleId);
    }
    setExpandedVehicles(newExpanded);
  };

  const saveVehicleInfo = async (vehicleId: string, field: string, value: string) => {
    try {
      let updateData: any = { [field]: value };
      if (field === 'plate') updateData.plate = value.toUpperCase();
      if (field === 'vin') updateData.vin = value.toUpperCase();
      
      const { error } = await supabase
        .from("vehicles")
        .update(updateData)
        .eq("id", vehicleId);

      if (error) throw error;
      
      toast.success("Zapisano");
      fetchDriverVehicles();
    } catch (error) {
      toast.error("Błąd podczas aktualizacji pojazdu");
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Ładowanie aut kierowców...
      </div>
    );
  }

  if (vehicles.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Car className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Brak aut dodanych przez kierowców</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground">
          Łącznie: {vehicles.length} {vehicles.length === 1 ? 'auto' : 'aut'}
        </div>
      </div>

      {vehicles.map((vehicle) => (
        <Collapsible
          key={vehicle.id}
          open={expandedVehicles.has(vehicle.id)}
          onOpenChange={() => toggleExpanded(vehicle.id)}
        >
          <Card className="border rounded-lg">
            <CollapsibleTrigger asChild>
              <div className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-6">
                      <div className="min-w-[120px]">
                        <span className="font-medium text-sm text-muted-foreground">Nr rej.:</span>
                        <div className="font-semibold">{vehicle.plate}</div>
                      </div>
                      <div className="min-w-[150px]">
                        <span className="font-medium text-sm text-muted-foreground">Pojazd:</span>
                        <div className="font-semibold">{vehicle.brand} {vehicle.model}</div>
                      </div>
                      <div className="min-w-[200px]">
                        <span className="font-medium text-sm text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />
                          Kierowca (właściciel):
                        </span>
                        <div className="font-semibold text-sm">
                          {vehicle.assignedDriver 
                            ? `${vehicle.assignedDriver.first_name} ${vehicle.assignedDriver.last_name}`
                            : <Badge variant="outline">Nieprzypisany</Badge>
                          }
                        </div>
                      </div>
                      <div className="min-w-[200px]">
                        <span className="font-medium text-sm text-muted-foreground">Dokumenty:</span>
                        <div className="font-semibold">
                          <ExpiryBadges vehicleId={vehicle.id} />
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="ml-4">
                    {expandedVehicles.has(vehicle.id) ? 
                      <ChevronUp className="h-5 w-5" /> : 
                      <ChevronDown className="h-5 w-5" />
                    }
                  </div>
                </div>
              </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="border-t p-4">
                <Tabs defaultValue="info" className="w-full">
                  <TabsList className="grid w-full grid-cols-4 rounded-lg">
                    <TabsTrigger value="info">Info</TabsTrigger>
                    <TabsTrigger value="documents">Dokumenty</TabsTrigger>
                    <TabsTrigger value="history">Historia Kierowców</TabsTrigger>
                    <TabsTrigger value="service">Serwis</TabsTrigger>
                  </TabsList>

                  <div className="mt-4">
                    <TabsContent value="info">
                      <VehicleInfoTab 
                        vehicle={vehicle} 
                        onSave={(field, value) => saveVehicleInfo(vehicle.id, field, value)}
                      />
                    </TabsContent>

                    <TabsContent value="documents">
                      <VehicleDocuments vehicleId={vehicle.id} />
                    </TabsContent>

                    <TabsContent value="history">
                      <VehicleDriverHistory vehicleId={vehicle.id} />
                    </TabsContent>

                    <TabsContent value="service">
                      <VehicleServiceTab vehicleId={vehicle.id} />
                    </TabsContent>
                  </div>
                </Tabs>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ))}
    </div>
  );
}
