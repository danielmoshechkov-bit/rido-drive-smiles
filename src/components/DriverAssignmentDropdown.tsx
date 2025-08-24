import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { X, ChevronDown } from 'lucide-react';
import { UniversalSelector } from './UniversalSelector';

interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
}

interface DriverAssignmentDropdownProps {
  vehicleId: string;
  currentDriver?: Driver;
  onAssignmentChange: () => void;
}

export function DriverAssignmentDropdown({ 
  vehicleId, 
  currentDriver, 
  onAssignmentChange 
}: DriverAssignmentDropdownProps) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDrivers = async () => {
    const { data } = await supabase
      .from('drivers')
      .select('id, first_name, last_name, email')
      .order('first_name');
    setDrivers(data || []);
  };

  useEffect(() => {
    loadDrivers();
  }, []);

  const assignDriver = async (driverId: string) => {
    setLoading(true);
    
    try {
      // Zakończ wszystkie poprzednie przypisania dla tego kierowcy
      const { error: deactivateDriverError } = await supabase
        .from('driver_vehicle_assignments')
        .update({ 
          status: 'inactive',
          unassigned_at: new Date().toISOString()
        })
        .eq('driver_id', driverId)
        .eq('status', 'active');

      if (deactivateDriverError) throw deactivateDriverError;

      // Zakończ poprzednie przypisania pojazdu
      const { error: updateError } = await supabase
        .from('driver_vehicle_assignments')
        .update({ 
          status: 'inactive',
          unassigned_at: new Date().toISOString()
        })
        .eq('vehicle_id', vehicleId)
        .eq('status', 'active');

      if (updateError) throw updateError;

      // Dodaj nowe przypisanie
      const { error } = await supabase
        .from('driver_vehicle_assignments')
        .insert([{
          vehicle_id: vehicleId,
          driver_id: driverId,
          assigned_at: new Date().toISOString(),
          status: 'active'
        }]);

      if (error) throw error;
      
      toast.success('Kierowca przypisany do pojazdu');
      onAssignmentChange();
    } catch (error) {
      toast.error('Błąd przy przypisywaniu kierowcy');
    } finally {
      setLoading(false);
    }
  };

  const removeAssignment = async () => {
    if (!currentDriver) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('driver_vehicle_assignments')
        .update({ status: 'inactive', unassigned_at: new Date().toISOString() })
        .eq('vehicle_id', vehicleId)
        .eq('driver_id', currentDriver.id)
        .eq('status', 'active');

      if (error) throw error;
      
      toast.success('Przypisanie usunięte');
      onAssignmentChange();
    } catch (error) {
      toast.error('Błąd przy usuwaniu przypisania');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (item: {id: string; name: string} | null) => {
    if (item) {
      await assignDriver(item.id);
    }
  };

  // Transform drivers for UniversalSelector
  const driverItems = drivers.map(driver => ({
    id: driver.id,
    name: `${driver.first_name} ${driver.last_name}${driver.email ? ` (${driver.email})` : ''}`
  }));

  return (
    <div className="relative">
      <div className="font-semibold flex items-center gap-2">
        {currentDriver ? (
          <>
            <span className="text-primary flex items-center gap-1">
              {currentDriver.first_name} {currentDriver.last_name}
              <ChevronDown className="h-3 w-3" />
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeAssignment();
              }}
              className="text-red-500 hover:text-red-700 p-1"
              disabled={loading}
            >
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <UniversalSelector
            id={`vehicle-driver-${vehicleId}`}
            items={driverItems}
            currentValue={null}
            placeholder="Brak przypisania"
            searchPlaceholder="Szukaj kierowcy..."
            noResultsText="Brak kierowców"
            showSearch={true}
            showAdd={false}
            onSelect={handleSelect}
            disabled={loading}
          />
        )}
      </div>
    </div>
  );
}