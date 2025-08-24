import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Car, ChevronDown, ChevronUp, X, Search, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { AddCarForm } from "./AddCarForm";
import { VehicleDocuments } from "./VehicleDocuments";
import { VehicleServiceTab } from "./VehicleServiceTab";
import { ExpiryBadges } from "./ExpiryBadges";
import { InlineEdit } from "./InlineEdit";
import { VehicleFleetSelector } from "./VehicleFleetSelector";
import { toast } from "sonner";

interface VehicleListProps {
  driverId: string;
}

interface Vehicle {
  id: string;
  plate: string;
  vin: string | null;
  brand: string;
  model: string;
  year: number | null;
  color: string | null;
  status: string;
  weekly_rental_fee: number | null;
  vehicle_inspections?: Array<{
    date: string;
    valid_to: string;
    result: string;
  }>;
  vehicle_policies?: Array<{
    type: string;
    valid_from: string;
    valid_to: string;
    policy_no: string;
    provider: string;
  }>;
}

export const VehicleList = ({ driverId }: VehicleListProps) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");

  const updateWeeklyRentalFee = async (vehicleId: string, feeString: string) => {
    const fee = parseFloat(feeString) || 0;
    try {
      const { error } = await supabase
        .from("vehicles")
        .update({ weekly_rental_fee: fee })
        .eq("id", vehicleId);

      if (error) throw error;
      
      toast.success("Zaktualizowano opłatę za wynajem");
      loadVehicles();
    } catch (error) {
      toast.error("Błąd podczas aktualizacji opłaty za wynajem");
    }
  };

  const loadVehicles = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("vehicles")
      .select(`
        *,
        vehicle_inspections(date, valid_to, result),
        vehicle_policies(type, valid_from, valid_to, policy_no, provider),
        driver_vehicle_assignments!inner(driver_id, status)
      `)
      .eq("driver_vehicle_assignments.driver_id", driverId)
      .eq("driver_vehicle_assignments.status", "active");
    
    setVehicles(data || []);
    setLoading(false);
  };

  const deleteVehicle = async (vehicleId: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten pojazd?")) return;
    
    try {
      // First deactivate assignments
      await supabase
        .from("driver_vehicle_assignments")
        .update({ status: "inactive", unassigned_at: new Date().toISOString() })
        .eq("vehicle_id", vehicleId)
        .eq("status", "active");

      // Then delete the vehicle
      const { error } = await supabase
        .from("vehicles")
        .delete()
        .eq("id", vehicleId);

      if (error) throw error;
      
      toast.success("Pojazd został usunięty");
      loadVehicles();
    } catch (error) {
      toast.error("Błąd podczas usuwania pojazdu");
    }
  };

  useEffect(() => {
    loadVehicles();
  }, [driverId]);

  useEffect(() => {
    const filtered = vehicles.filter(vehicle =>
      vehicle.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${vehicle.brand} ${vehicle.model}`.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredVehicles(filtered);
  }, [vehicles, searchTerm]);

  const toggleExpanded = (vehicleId: string) => {
    const newExpanded = new Set(expandedVehicles);
    if (newExpanded.has(vehicleId)) {
      newExpanded.delete(vehicleId);
    } else {
      newExpanded.add(vehicleId);
    }
    setExpandedVehicles(newExpanded);
  };

  const handleCarAdded = () => {
    setShowAddForm(false);
    loadVehicles();
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Ładowanie...</p>
      </div>
    );
  }

  if (showAddForm) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Dodaj nowy samochód</h3>
          <Button 
            variant="outline" 
            onClick={() => setShowAddForm(false)}
            className="text-sm"
          >
            Anuluj
          </Button>
        </div>
        <AddCarForm driverId={driverId} onCarAdded={handleCarAdded} />
      </div>
    );
  }

  if (filteredVehicles.length === 0 && vehicles.length === 0) {
    return (
      <div className="text-center py-12">
        <Car className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
        <h3 className="text-lg font-medium mb-2">Brak samochodów</h3>
        <p className="text-muted-foreground mb-6">
          Nie masz jeszcze dodanych samochodów
        </p>
        <Button 
          onClick={() => setShowAddForm(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
        >
          <Plus className="w-4 h-4" />
          Dodaj auto
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Moje samochody ({vehicles.length})</h3>
        <Button 
          onClick={() => setShowAddForm(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
        >
          <Plus className="w-4 h-4" />
          Dodaj auto
        </Button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Szukaj po nr rejestracyjnym lub marce..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Vehicle List */}
      <div className="space-y-4">
        {filteredVehicles.length === 0 && searchTerm ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Brak wyników dla "{searchTerm}"</p>
          </div>
        ) : (
          filteredVehicles.map((vehicle) => {
          const inspection = vehicle.vehicle_inspections?.[0];
          const ocPolicy = vehicle.vehicle_policies?.find(p => p.type === 'OC');
          
          return (
            <Collapsible
              key={vehicle.id}
              open={expandedVehicles.has(vehicle.id)}
              onOpenChange={() => toggleExpanded(vehicle.id)}
            >
              <Card className="border rounded-lg relative">
                {/* Delete button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteVehicle(vehicle.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>

                <CollapsibleTrigger asChild>
                  <div className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between pr-10">
                      {/* Main content */}
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <div className="font-semibold">{vehicle.brand} {vehicle.model}</div>
                            <div className="font-semibold text-primary">{vehicle.plate}</div>
                            {vehicle.year && <div className="text-sm text-muted-foreground">{vehicle.year}</div>}
                            {vehicle.color && <div className="text-sm text-muted-foreground">{vehicle.color}</div>}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-6">
                          <div className="min-w-[100px]">
                            <span className="font-medium text-sm text-muted-foreground">Flota:</span>
                            <div className="font-semibold" onClick={(e) => e.stopPropagation()}>
                              <VehicleFleetSelector 
                                vehicleId={vehicle.id}
                                currentFleetId={(vehicle as any).fleet_id}
                                onFleetUpdate={loadVehicles}
                              />
                            </div>
                          </div>
                          <div className="min-w-[140px]">
                            <div className="font-semibold flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <span className="text-sm text-muted-foreground">Wynajem:</span>
                              <InlineEdit
                                value={vehicle.weekly_rental_fee?.toString() || "0"}
                                onSave={(value) => updateWeeklyRentalFee(vehicle.id, value)}
                              />
                              <span className="text-sm text-muted-foreground">zł/tydz.</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Second row - documents and VIN */}
                        <div className="flex items-center gap-6 pt-2 border-t border-muted/30">
                          <div className="min-w-[200px]">
                            <span className="font-medium text-sm text-muted-foreground">Dokumenty:</span>
                            <div className="font-semibold">
                              <ExpiryBadges vehicleId={vehicle.id} />
                            </div>
                          </div>
                          {vehicle.vin && (
                            <div className="min-w-[200px]">
                              <span className="font-medium text-sm text-muted-foreground">VIN:</span>
                              <div className="font-mono text-sm">{vehicle.vin}</div>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Expand button */}
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
                    <Tabs defaultValue="documents" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 rounded-lg">
                        <TabsTrigger value="documents">Dokumenty</TabsTrigger>
                        <TabsTrigger value="service">Serwis</TabsTrigger>
                      </TabsList>

                      <div className="mt-4">
                         <TabsContent value="documents">
                           <VehicleDocuments vehicleId={vehicle.id} />
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
          );
         }))}
      </div>
    </div>
  );
};