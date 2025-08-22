import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface EditDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverId: string;
  onSuccess: () => void;
}

interface PlatformId {
  id?: string;
  platform: string;
  platform_id: string;
}

export const EditDriverModal = ({ isOpen, onClose, driverId, onSuccess }: EditDriverModalProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: ''
  });
  const [platformIds, setPlatformIds] = useState<PlatformId[]>([]);
  const [newPlatform, setNewPlatform] = useState({ platform: '', platform_id: '' });

  const platforms = [
    { id: 'uber', name: 'Uber', color: 'bg-black text-white' },
    { id: 'bolt', name: 'Bolt', color: 'bg-green-500 text-white' },
    { id: 'freenow', name: 'FreeNow', color: 'bg-red-500 text-white' },
  ];

  useEffect(() => {
    if (isOpen && driverId) {
      loadDriverData();
    }
  }, [isOpen, driverId]);

  const loadDriverData = async () => {
    try {
      setLoading(true);
      
      // Load driver basic info
      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('*')
        .eq('id', driverId)
        .single();

      if (driverError) throw driverError;

      setFormData({
        first_name: driver.first_name || '',
        last_name: driver.last_name || '',
        email: driver.email || '',
        phone: driver.phone || ''
      });

      // Load platform IDs
      const { data: platforms, error: platformsError } = await supabase
        .from('driver_platform_ids')
        .select('*')
        .eq('driver_id', driverId);

      if (platformsError) throw platformsError;

      setPlatformIds(platforms || []);
      
    } catch (error) {
      toast.error('Błąd podczas ładowania danych kierowcy');
    } finally {
      setLoading(false);
    }
  };

  const addPlatformId = () => {
    if (newPlatform.platform && newPlatform.platform_id) {
      // Check if platform already exists
      if (platformIds.some(p => p.platform === newPlatform.platform)) {
        toast.error('Ta platforma już została dodana');
        return;
      }
      
      setPlatformIds([...platformIds, newPlatform]);
      setNewPlatform({ platform: '', platform_id: '' });
    }
  };

  const removePlatformId = async (index: number) => {
    const platform = platformIds[index];
    
    // If it has an ID, it exists in database and needs to be deleted
    if (platform.id) {
      try {
        const { error } = await supabase
          .from('driver_platform_ids')
          .delete()
          .eq('id', platform.id);

        if (error) throw error;
        toast.success('Platforma została usunięta');
      } catch (error) {
        toast.error('Błąd podczas usuwania platformy');
        return;
      }
    }
    
    setPlatformIds(platformIds.filter((_, i) => i !== index));
  };

  const getServiceColor = (service: string) => {
    const platform = platforms.find(p => p.id === service.toLowerCase());
    return platform?.color || 'bg-gray-500 text-white';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.first_name || !formData.last_name) {
      toast.error('Imię i nazwisko są wymagane');
      return;
    }

    setLoading(true);

    try {
      // Update driver basic info
      const { error: driverError } = await supabase
        .from('drivers')
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email || null,
          phone: formData.phone || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', driverId);

      if (driverError) throw driverError;

      // Add new platform IDs (ones without 'id' field)
      const newPlatformIds = platformIds.filter(p => !p.id);
      if (newPlatformIds.length > 0) {
        const platformData = newPlatformIds.map(p => ({
          driver_id: driverId,
          platform: p.platform,
          platform_id: p.platform_id
        }));

        const { error: platformError } = await supabase
          .from('driver_platform_ids')
          .insert(platformData);

        if (platformError) throw platformError;
      }

      toast.success('Dane kierowcy zostały zaktualizowane');
      onSuccess();
      
    } catch (error) {
      toast.error(`Błąd podczas aktualizacji: ${error instanceof Error ? error.message : 'Nieznany błąd'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edytuj kierowcę</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">Imię *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Nazwisko *</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>

          {/* Platform IDs */}
          <div className="space-y-4">
            <Label>Identyfikatory platform</Label>
            
            {/* Add new platform */}
            <div className="flex gap-2">
              <select
                value={newPlatform.platform}
                onChange={(e) => setNewPlatform({ ...newPlatform, platform: e.target.value })}
                className="px-3 py-2 border rounded-md"
              >
                <option value="">Wybierz platformę</option>
                {platforms.map(platform => (
                  <option key={platform.id} value={platform.id}>
                    {platform.name}
                  </option>
                ))}
              </select>
              <Input
                placeholder="ID kierowcy"
                value={newPlatform.platform_id}
                onChange={(e) => setNewPlatform({ ...newPlatform, platform_id: e.target.value })}
                className="flex-1"
              />
              <Button
                type="button"
                onClick={addPlatformId}
                disabled={!newPlatform.platform || !newPlatform.platform_id}
                size="sm"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Current platform IDs */}
            {platformIds.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm">Dodane platformy:</Label>
                <div className="flex flex-wrap gap-2">
                  {platformIds.map((platform, index) => (
                    <Badge 
                      key={index} 
                      className={`${getServiceColor(platform.platform)} px-3 py-1 text-sm flex items-center gap-2`}
                    >
                      {platform.platform.toUpperCase()}: {platform.platform_id}
                      <button
                        type="button"
                        onClick={() => removePlatformId(index)}
                        className="hover:bg-white/20 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Zapisywanie...' : 'Zapisz zmiany'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};