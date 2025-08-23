import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DriverRentalBadgeProps {
  driverId: string;
  driverData: any;
  cityId: string;
  onUpdate: () => void;
}

export const DriverRentalBadge = ({ driverId, driverData, cityId, onUpdate }: DriverRentalBadgeProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showVehicleList, setShowVehicleList] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [assignedVehicle, setAssignedVehicle] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Sprawdź czy kierowca ma przypisane auto
  useEffect(() => {
    const checkAssignment = async () => {
      const { data } = await supabase
        .from('driver_vehicle_assignments')
        .select(`
          *,
          vehicles(brand, model, plate)
        `)
        .eq('driver_id', driverId)
        .eq('status', 'active')
        .single();

      if (data) {
        setAssignedVehicle(data.vehicles);
      }
    };

    checkAssignment();
  }, [driverId]);

  // Pobierz dostępne pojazdy - sprawdź flotę, potem miasto
  const loadFleetVehicles = async () => {
    setLoading(true);
    try {
      let data = [];
      
      // Najpierw spróbuj znaleźć pojazdy w tej samej flocie
      if (driverData.fleet_id) {
        const { data: fleetVehicles } = await supabase
          .from('vehicles')
          .select('*')
          .eq('fleet_id', driverData.fleet_id)
          .eq('status', 'aktywne')
          .order('brand', { ascending: true });
        
        data = fleetVehicles || [];
      }
      
      // Jeśli nie ma floty lub nie znaleziono pojazdów, szukaj w mieście
      if (data.length === 0) {
        const { data: cityVehicles } = await supabase
          .from('vehicles')
          .select('*')
          .eq('city_id', cityId)
          .eq('status', 'aktywne')
          .order('brand', { ascending: true });
        
        data = cityVehicles || [];
      }

      console.log('Found vehicles:', data.length, 'Driver fleet_id:', driverData.fleet_id, 'City:', cityId);
      setVehicles(data);
    } catch (error) {
      console.error('Error loading vehicles:', error);
      toast.error('Błąd podczas ładowania pojazdów');
    } finally {
      setLoading(false);
    }
  };

  const assignVehicle = async (vehicleId: string) => {
    try {
      // Zakończ poprzednie przypisania kierowcy
      await supabase
        .from('driver_vehicle_assignments')
        .update({ 
          status: 'inactive',
          unassigned_at: new Date().toISOString()
        })
        .eq('driver_id', driverId)
        .eq('status', 'active');

      // Zakończ poprzednie przypisania pojazdu
      await supabase
        .from('driver_vehicle_assignments')
        .update({ 
          status: 'inactive',
          unassigned_at: new Date().toISOString()
        })
        .eq('vehicle_id', vehicleId)
        .eq('status', 'active');

      // Utwórz nowe przypisanie
      const { error } = await supabase
        .from('driver_vehicle_assignments')
        .insert([{
          driver_id: driverId,
          vehicle_id: vehicleId,
          fleet_id: driverData.fleet_id,
          status: 'active',
          assigned_at: new Date().toISOString()
        }]);

      if (error) throw error;

      toast.success('Pojazd został przypisany do kierowcy');
      setShowVehicleList(false);
      onUpdate();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const removeAssignment = async () => {
    if (!assignedVehicle) return;

    try {
      const { error } = await supabase
        .from('driver_vehicle_assignments')
        .update({ 
          status: 'inactive',
          unassigned_at: new Date().toISOString()
        })
        .eq('driver_id', driverId)
        .eq('status', 'active');

      if (error) throw error;

      toast.success('Przypisanie pojazdu zostało usunięte');
      setAssignedVehicle(null);
      onUpdate();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const filteredVehicles = vehicles.filter(vehicle => 
    `${vehicle.brand} ${vehicle.model} ${vehicle.plate}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRentalClick = () => {
    setShowVehicleList(true);
    loadFleetVehicles();
  };

  if (assignedVehicle) {
    return (
      <div className="relative">
        <Badge 
          className="bg-orange-500/10 text-orange-700 border-orange-500/20 cursor-pointer hover:bg-orange-500/20"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={removeAssignment}
        >
          WYNAJMUJE: {assignedVehicle.brand} {assignedVehicle.model} • {assignedVehicle.plate}
          {isHovered && <span className="ml-2">✕</span>}
        </Badge>
      </div>
    );
  }

  return (
    <div className="relative">
      <Badge 
        variant="outline"
        className="cursor-pointer hover:bg-muted"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleRentalClick}
      >
        {isHovered ? 'Wynajem' : 'Własne auto'}
      </Badge>

      {showVehicleList && (
        <div className="absolute z-50 mt-2 w-80 bg-background border rounded-xl shadow-lg max-h-96 flex flex-col">
          <div className="p-3 border-b flex justify-between items-center">
            <h3 className="font-medium text-sm">Wybierz pojazd</h3>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowVehicleList(false)}
              className="h-6 w-6 p-0"
            >
              ✕
            </Button>
          </div>
          
          <div className="p-3 border-b">
            <Input
              placeholder="Szukaj pojazdu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="flex-1 p-2 overflow-y-auto">
            {loading ? (
              <div className="text-center py-4 text-sm">Ładowanie pojazdów...</div>
            ) : filteredVehicles.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                {vehicles.length === 0 
                  ? 'Brak dostępnych pojazdów'
                  : 'Nie znaleziono pojazdów'
                }
              </div>
            ) : (
              <div className="space-y-1">
                {filteredVehicles.map(vehicle => (
                  <div
                    key={vehicle.id}
                    className="border rounded-lg p-2 hover:bg-muted cursor-pointer transition-colors"
                    onClick={() => assignVehicle(vehicle.id)}
                  >
                    <div className="font-medium text-sm">
                      {vehicle.brand} {vehicle.model}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {vehicle.plate} • {vehicle.year || '?'} • {vehicle.color || '?'}
                    </div>
                    {vehicle.odometer && (
                      <div className="text-xs text-muted-foreground">
                        {vehicle.odometer} km
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};