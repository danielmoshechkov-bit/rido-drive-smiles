import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, User, Mail, Phone, Hash } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  getrido_id: string;
  platform_ids?: Array<{ platform: string; platform_id: string }>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  fleetId: string;
  availableVehicles: Array<{ id: string; plate: string; brand: string; model: string }>;
}

export function AddFleetDriverModal({ isOpen, onClose, onSuccess, fleetId, availableVehicles }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundDrivers, setFoundDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  const normalizePhone = (phone: string): string[] => {
    if (!phone) return [];
    const cleaned = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
    const variants = [cleaned];
    
    if (cleaned.startsWith('+48')) {
      variants.push(cleaned.substring(3));
    } else if (cleaned.startsWith('48')) {
      variants.push(cleaned.substring(2));
      variants.push('+' + cleaned);
    } else if (!cleaned.startsWith('+')) {
      variants.push('+48' + cleaned);
      variants.push('48' + cleaned);
    }
    
    return [...new Set(variants)];
  };

  const searchDrivers = async () => {
    if (!searchQuery.trim()) {
      toast.error('Wprowadź dane do wyszukania');
      return;
    }

    setSearching(true);
    setFoundDrivers([]);
    setSelectedDriver(null);

    try {
      const query = searchQuery.trim();
      const phoneVariants = normalizePhone(query);
      
      // Search by getrido_id, email, phone, or platform IDs
      const { data: drivers, error } = await supabase
        .from('drivers')
        .select(`
          id,
          first_name,
          last_name,
          email,
          phone,
          getrido_id,
          driver_platform_ids(platform, platform_id)
        `)
        .or(`getrido_id.ilike.%${query}%,email.ilike.%${query}%,phone.in.(${phoneVariants.join(',')}),first_name.ilike.%${query}%,last_name.ilike.%${query}%`);

      if (error) throw error;

      // Also search by platform IDs
      const { data: platformMatches, error: platformError } = await supabase
        .from('driver_platform_ids')
        .select('driver_id, platform, platform_id, drivers!inner(id, first_name, last_name, email, phone, getrido_id)')
        .ilike('platform_id', `%${query}%`);

      if (platformError) throw platformError;

      // Combine results
      const allDrivers = [...(drivers || [])];
      
      if (platformMatches) {
        platformMatches.forEach(match => {
          if (!allDrivers.find(d => d.id === match.driver_id)) {
            allDrivers.push({
              id: match.driver_id,
              ...(match.drivers as any),
            });
          }
        });
      }

      if (allDrivers.length === 0) {
        toast.error('Kierowca nie znaleziony w bazie');
      } else {
        // Format platform IDs for display
        const driversWithPlatforms = allDrivers.map(driver => ({
          ...driver,
          platform_ids: (driver as any).driver_platform_ids || []
        }));
        
        setFoundDrivers(driversWithPlatforms);
        toast.success(`Znaleziono ${driversWithPlatforms.length} kierowców`);
      }
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Błąd podczas wyszukiwania');
    } finally {
      setSearching(false);
    }
  };

  const assignDriver = async () => {
    if (!selectedDriver) {
      toast.error('Wybierz kierowcę');
      return;
    }

    if (!selectedVehicleId) {
      toast.error('Wybierz pojazd');
      return;
    }

    setAssigning(true);

    try {
      // Check if driver is already assigned to a vehicle in this fleet
      const { data: existing, error: checkError } = await supabase
        .from('driver_vehicle_assignments')
        .select('id')
        .eq('driver_id', selectedDriver.id)
        .eq('fleet_id', fleetId)
        .eq('status', 'active')
        .single();

      if (checkError && checkError.code !== 'PGRST116') throw checkError;

      if (existing) {
        toast.error('Ten kierowca jest już przypisany do pojazdu w tej flocie');
        return;
      }

      // Assign driver to vehicle
      const { error: assignError } = await supabase
        .from('driver_vehicle_assignments')
        .insert({
          driver_id: selectedDriver.id,
          vehicle_id: selectedVehicleId,
          fleet_id: fleetId,
          status: 'active'
        });

      if (assignError) throw assignError;

      toast.success(`Kierowca ${selectedDriver.first_name} ${selectedDriver.last_name} został dodany do floty`);
      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Assignment error:', error);
      toast.error('Błąd podczas przypisywania kierowcy');
    } finally {
      setAssigning(false);
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setFoundDrivers([]);
    setSelectedDriver(null);
    setSelectedVehicleId('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dodaj kierowcę do floty</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Wyszukaj kierowcę</Label>
            <div className="flex gap-2">
              <Input
                placeholder="GetRido ID, email, telefon, Uber ID, Bolt ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchDrivers()}
              />
              <Button onClick={searchDrivers} disabled={searching}>
                <Search className="w-4 h-4 mr-2" />
                Szukaj
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Możesz wyszukać po: GetRido ID, email, telefon (+48607894077 lub 607894077), Platform ID (Uber, Bolt, FreeNow)
            </p>
          </div>

          {foundDrivers.length > 0 && (
            <div className="space-y-2">
              <Label>Znalezieni kierowcy ({foundDrivers.length})</Label>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {foundDrivers.map((driver) => (
                  <Card
                    key={driver.id}
                    className={`p-4 cursor-pointer transition-colors ${
                      selectedDriver?.id === driver.id
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-accent'
                    }`}
                    onClick={() => setSelectedDriver(driver)}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <User className="w-4 h-4" />
                        {driver.first_name} {driver.last_name}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        {driver.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {driver.email}
                          </div>
                        )}
                        {driver.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {driver.phone}
                          </div>
                        )}
                        {driver.getrido_id && (
                          <div className="flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            GetRido: {driver.getrido_id}
                          </div>
                        )}
                      </div>
                      {driver.platform_ids && driver.platform_ids.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {driver.platform_ids.map((pid: any, idx: number) => (
                            <span key={idx} className="text-xs bg-accent px-2 py-1 rounded">
                              {pid.platform}: {pid.platform_id}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {selectedDriver && (
            <div className="space-y-2">
              <Label htmlFor="vehicle">Przypisz do pojazdu</Label>
              <select
                id="vehicle"
                className="w-full border rounded-md p-2"
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
              >
                <option value="">Wybierz pojazd</option>
                {availableVehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.plate} - {vehicle.brand} {vehicle.model}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose}>
              Anuluj
            </Button>
            <Button
              onClick={assignDriver}
              disabled={!selectedDriver || !selectedVehicleId || assigning}
            >
              {assigning ? 'Dodawanie...' : 'Dodaj do floty'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
