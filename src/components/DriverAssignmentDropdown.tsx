import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X, ChevronDown } from 'lucide-react';

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
  const [isOpen, setIsOpen] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const filteredDrivers = drivers.filter(driver => 
    `${driver.first_name} ${driver.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    (driver.email && driver.email.toLowerCase().includes(search.toLowerCase()))
  );

  const loadDrivers = async () => {
    const { data } = await supabase
      .from('drivers')
      .select('id, first_name, last_name, email')
      .order('first_name');
    setDrivers(data || []);
  };

  useEffect(() => {
    if (isOpen) {
      loadDrivers();
    }
  }, [isOpen]);

  const assignDriver = async (driverId: string) => {
    setLoading(true);
    
    // Zakończ wszystkie poprzednie przypisania dla tego kierowcy
    const { error: deactivateDriverError } = await supabase
      .from('driver_vehicle_assignments')
      .update({ 
        status: 'inactive',
        unassigned_at: new Date().toISOString()
      })
      .eq('driver_id', driverId)
      .eq('status', 'active');

    if (deactivateDriverError) {
      toast.error('Błąd przy dezaktywacji poprzednich przypisań kierowcy');
      setLoading(false);
      return;
    }

    // Zakończ poprzednie przypisania pojazdu
    const { error: updateError } = await supabase
      .from('driver_vehicle_assignments')
      .update({ 
        status: 'inactive',
        unassigned_at: new Date().toISOString()
      })
      .eq('vehicle_id', vehicleId)
      .eq('status', 'active');

    if (updateError) {
      toast.error('Błąd przy usuwaniu poprzedniego przypisania');
      setLoading(false);
      return;
    }

    // Dodaj nowe przypisanie
    const { error } = await supabase
      .from('driver_vehicle_assignments')
      .insert([{
        vehicle_id: vehicleId,
        driver_id: driverId,
        assigned_at: new Date().toISOString(),
        status: 'active'
      }]);

    if (error) {
      toast.error('Błąd przy przypisywaniu kierowcy');
    } else {
      toast.success('Kierowca przypisany do pojazdu');
      onAssignmentChange();
      setIsOpen(false);
      setSearch('');
    }
    
    setLoading(false);
  };

  const removeAssignment = async () => {
    if (!currentDriver) return;
    
    setLoading(true);
    const { error } = await supabase
      .from('driver_vehicle_assignments')
      .update({ status: 'inactive', unassigned_at: new Date().toISOString() })
      .eq('vehicle_id', vehicleId)
      .eq('driver_id', currentDriver.id)
      .eq('status', 'active');

    if (error) {
      toast.error('Błąd przy usuwaniu przypisania');
    } else {
      toast.success('Przypisanie usunięte');
      onAssignmentChange();
    }
    
    setLoading(false);
  };

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
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
            className="text-primary hover:text-primary/80 flex items-center gap-1"
          >
            Brak przypisania
            <ChevronDown className="h-3 w-3" />
          </button>
        )}
      </div>

      {isOpen && !currentDriver && (
        <div className="absolute z-50 mt-2 w-96 bg-popover border rounded-xl shadow-lg p-4">
          <div className="space-y-3">
            <Input
              placeholder="Szukaj kierowcy..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 rounded-lg"
            />
            
            <div className="max-h-64 overflow-y-auto space-y-2">
              {filteredDrivers.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Brak kierowców
                </div>
              ) : (
                filteredDrivers.map((driver) => (
                  <div
                    key={driver.id}
                    onClick={() => assignDriver(driver.id)}
                    className="p-4 rounded-lg hover:bg-primary/10 cursor-pointer transition-colors border border-transparent hover:border-primary/20"
                  >
                    <div className="font-semibold text-base">{driver.first_name} {driver.last_name}</div>
                    <div className="text-sm text-muted-foreground mt-1">{driver.email || "Brak email"}</div>
                  </div>
                ))
              )}
            </div>
            
            <div className="flex justify-end">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsOpen(false)}
                className="rounded-lg"
              >
                Anuluj
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}