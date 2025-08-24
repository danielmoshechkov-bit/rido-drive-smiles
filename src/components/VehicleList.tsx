import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Car, ChevronDown, ChevronUp, X, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { AddCarForm } from "./AddCarForm";
import { VehicleDocuments } from "./VehicleDocuments";
import { VehicleServiceTab } from "./VehicleServiceTab";
import { ExpiryBadges } from "./ExpiryBadges";
import { InlineEdit } from "./InlineEdit";
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    loadVehicles();
  }, [driverId]);

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

  if (vehicles.length === 0) {
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
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Moje samochody ({vehicles.length})</h3>
        <Button 
          onClick={() => setShowAddForm(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
        >
          <Plus className="w-4 h-4" />
          Dodaj auto
        </Button>
      </div>

      {/* Vehicle List */}
      <div className="space-y-4">
        {vehicles.map((vehicle) => {
          const inspection = vehicle.vehicle_inspections?.[0];
          const ocPolicy = vehicle.vehicle_policies?.find(p => p.type === 'OC');
          
          return (
            <Collapsible
              key={vehicle.id}
              open={expandedVehicles.has(vehicle.id)}
              onOpenChange={() => toggleExpanded(vehicle.id)}
            >
              <Card className="border rounded-lg">
                <CollapsibleTrigger asChild>
                         <div className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                           <div className="flex items-center justify-between">
                             {/* Main content */}
                             <div className="flex-1 space-y-3">
                                <div className="flex items-center gap-6">
                                  <div className="min-w-[120px]">
                                    <span className="font-medium text-sm text-muted-foreground">Nr rej.:</span>
                                    <div className="font-semibold">{vehicle.plate}</div>
                                  </div>
                                  <div className="min-w-[150px]">
                                    <span className="font-medium text-sm text-muted-foreground">Pojazd:</span>
                                    <div className="font-semibold">{vehicle.brand} {vehicle.model}</div>
                                  </div>
                                  <div className="min-w-[100px]">
                                    <span className="font-medium text-sm text-muted-foreground">Rok:</span>
                                    <div className="font-semibold">{vehicle.year || "Brak"}</div>
                                  </div>
                                  <div className="min-w-[120px]">
                                    <span className="font-medium text-sm text-muted-foreground">Wynajem:</span>
                                    <div className="font-semibold" onClick={(e) => e.stopPropagation()}>
                                      <InlineEdit
                                        value={vehicle.weekly_rental_fee?.toString() || "0"}
                                        onSave={(value) => updateWeeklyRentalFee(vehicle.id, value)}
                                      />
                                      <span className="text-sm"> zł/tydz.</span>
                                    </div>
                                  </div>
                                </div>
                               
                               {/* Second row - documents */}
                               <div className="flex items-center gap-6 pt-2 border-t border-muted/30">
                                 <div className="min-w-[200px]">
                                   <span className="font-medium text-sm text-muted-foreground">Dokumenty:</span>
                                   <div className="font-semibold">
                                     <ExpiryBadges vehicleId={vehicle.id} />
                                   </div>
                                 </div>
                                 {vehicle.color && (
                                   <div className="min-w-[100px]">
                                     <span className="font-medium text-sm text-muted-foreground">Kolor:</span>
                                     <div className="font-semibold">{vehicle.color}</div>
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

                     {/* Vehicle details */}
                     {vehicle.vin && (
                       <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                         <span className="font-medium text-sm text-muted-foreground">VIN:</span>
                         <div className="font-mono text-sm">{vehicle.vin}</div>
                       </div>
                     )}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
};