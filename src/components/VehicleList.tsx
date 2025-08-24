import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Car, Calendar, Shield, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UniversalCard } from "./UniversalCard";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { AddCarForm } from "./AddCarForm";

interface VehicleListProps {
  driverId: string;
}

export const VehicleList = ({ driverId }: VehicleListProps) => {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const handleCarAdded = () => {
    setShowAddForm(false);
    loadVehicles();
  };

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Moje samochody</h3>
        <Button 
          onClick={() => setShowAddForm(true)}
          className="bg-primary hover:bg-primary-hover text-primary-foreground"
        >
          <Plus className="w-4 h-4 mr-2" />
          Dodaj auto
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Ładowanie...</p>
        </div>
      ) : vehicles.length === 0 ? (
        <UniversalCard title="Brak samochodów">
          <div className="text-center py-8">
            <Car className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">
              Nie masz jeszcze dodanych samochodów
            </p>
            <Button 
              onClick={() => setShowAddForm(true)}
              className="bg-primary hover:bg-primary-hover text-primary-foreground"
            >
              <Plus className="w-4 h-4 mr-2" />
              Dodaj pierwszy samochód
            </Button>
          </div>
        </UniversalCard>
      ) : (
        <div className="grid gap-4">
          {vehicles.map((vehicle) => (
            <UniversalCard 
              key={vehicle.id} 
              title={`${vehicle.brand} ${vehicle.model}`}
              className="max-w-2xl"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Nr rejestracji</Label>
                    <p className="text-sm font-semibold">{vehicle.plate}</p>
                  </div>
                  {vehicle.year && (
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Rok</Label>
                      <p className="text-sm">{vehicle.year}</p>
                    </div>
                  )}
                  {vehicle.color && (
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Kolor</Label>
                      <p className="text-sm">{vehicle.color}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {/* Przegląd techniczny */}
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground flex items-center">
                      <Calendar className="w-3 h-3 mr-1" />
                      Przegląd techniczny
                    </Label>
                    {vehicle.vehicle_inspections?.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <Badge variant={new Date(vehicle.vehicle_inspections[0].valid_to) > new Date() ? "default" : "destructive"}>
                          {vehicle.vehicle_inspections[0].valid_to ? 
                            new Date(vehicle.vehicle_inspections[0].valid_to).toLocaleDateString('pl-PL') : 
                            'Brak daty'
                          }
                        </Badge>
                      </div>
                    ) : (
                      <Badge variant="secondary">Nie dodano</Badge>
                    )}
                  </div>

                  {/* Ubezpieczenie */}
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground flex items-center">
                      <Shield className="w-3 h-3 mr-1" />
                      Ubezpieczenie OC
                    </Label>
                    {vehicle.vehicle_policies?.find((p: any) => p.type === 'OC') ? (
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          new Date(vehicle.vehicle_policies.find((p: any) => p.type === 'OC').valid_to) > new Date() ? 
                          "default" : "destructive"
                        }>
                          {new Date(vehicle.vehicle_policies.find((p: any) => p.type === 'OC').valid_to).toLocaleDateString('pl-PL')}
                        </Badge>
                      </div>
                    ) : (
                      <Badge variant="secondary">Nie dodano</Badge>
                    )}
                  </div>

                  {/* Wynajem tygodniowy */}
                  {vehicle.weekly_rental_fee && (
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Wynajem tygodniowy</Label>
                      <p className="text-sm font-bold text-green-600">{vehicle.weekly_rental_fee} zł</p>
                    </div>
                  )}
                </div>
              </div>

              {vehicle.vin && (
                <div className="pt-3 mt-3 border-t border-border">
                  <Label className="text-xs font-medium text-muted-foreground">VIN</Label>
                  <p className="text-xs font-mono">{vehicle.vin}</p>
                </div>
              )}
            </UniversalCard>
          ))}
        </div>
      )}
    </div>
  );
};