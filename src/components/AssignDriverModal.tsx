import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, User } from 'lucide-react';

interface AssignDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicleId: string;
  onAssigned: () => void;
}

interface Driver {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  getrido_id: string | null;
}

export function AssignDriverModal({ isOpen, onClose, vehicleId, onAssigned }: AssignDriverModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const searchDrivers = async () => {
    if (!searchQuery.trim()) {
      setDrivers([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, email, phone, getrido_id')
        .or(`phone.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,getrido_id.ilike.%${searchQuery}%`)
        .limit(10);

      if (error) throw error;
      setDrivers(data || []);
    } catch (error: any) {
      toast.error('Błąd wyszukiwania: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (driverId: string) => {
    setAssigning(true);
    try {
      // 1. Zakończ poprzednie przypisanie pojazdu
      await supabase
        .from('driver_vehicle_assignments')
        .update({ status: 'inactive', unassigned_at: new Date().toISOString() })
        .eq('vehicle_id', vehicleId)
        .eq('status', 'active');

      // 2. Zakończ poprzednie przypisanie kierowcy
      await supabase
        .from('driver_vehicle_assignments')
        .update({ status: 'inactive', unassigned_at: new Date().toISOString() })
        .eq('driver_id', driverId)
        .eq('status', 'active');

      // 3. Utworz nowe przypisanie
      const { error } = await supabase
        .from('driver_vehicle_assignments')
        .insert({
          vehicle_id: vehicleId,
          driver_id: driverId,
          assigned_at: new Date().toISOString(),
          status: 'active',
        });

      if (error) throw error;

      toast.success('Kierowca został pomyślnie przypisany do pojazdu');
      onAssigned();
      onClose();
    } catch (error: any) {
      toast.error('Błąd przypisywania: ' + error.message);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Przypisz kierowcę do pojazdu</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Wpisz telefon, email lub GetRido ID"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchDrivers()}
                className="pl-9"
              />
            </div>
            <Button onClick={searchDrivers} disabled={loading}>
              Szukaj
            </Button>
          </div>

          {loading && (
            <div className="text-center py-8 text-muted-foreground">
              Wyszukiwanie...
            </div>
          )}

          {!loading && drivers.length === 0 && searchQuery && (
            <div className="text-center py-8 text-muted-foreground">
              Nie znaleziono kierowców
            </div>
          )}

          {!loading && drivers.length > 0 && (
            <div className="space-y-2">
              {drivers.map((driver) => (
                <div
                  key={driver.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {driver.first_name} {driver.last_name}
                      </p>
                      <div className="text-sm text-muted-foreground space-y-1">
                        {driver.phone && <p>Tel: {driver.phone}</p>}
                        {driver.email && <p>Email: {driver.email}</p>}
                        {driver.getrido_id && <p>GetRido ID: {driver.getrido_id}</p>}
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleAssign(driver.id)}
                    disabled={assigning}
                    size="sm"
                  >
                    Przypisz
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
