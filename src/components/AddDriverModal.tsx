import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface AddDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityId: string;
  onSuccess: () => void;
}

interface PlatformId {
  platform: string;
  platform_id: string;
}

export const AddDriverModal = ({ isOpen, onClose, cityId, onSuccess }: AddDriverModalProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: ''
  });
  const [platformIds, setPlatformIds] = useState<PlatformId[]>([]);

  const platforms = [
    { id: 'uber', name: 'Uber', color: 'bg-black text-white' },
    { id: 'bolt', name: 'Bolt', color: 'bg-green-500 text-white' },
    { id: 'freenow', name: 'FreeNow', color: 'bg-red-500 text-white' },
  ];

  const getServiceColor = (service: string) => {
    const platform = platforms.find(p => p.id === service.toLowerCase());
    return platform?.color || 'bg-gray-500 text-white';
  };

  const removePlatformId = (index: number) => {
    setPlatformIds(platformIds.filter((_, i) => i !== index));
  };

  const checkForDuplicates = async (firstName: string, lastName: string) => {
    // Simple name similarity check - you can enhance this with more sophisticated algorithms
    const { data: existingDrivers } = await supabase
      .from('drivers')
      .select('*')
      .eq('city_id', cityId);

    if (!existingDrivers) return null;

    const fullName = `${firstName} ${lastName}`.toLowerCase();
    
    for (const driver of existingDrivers) {
      const existingName = `${driver.first_name} ${driver.last_name}`.toLowerCase();
      
      // Check for exact match or very similar names
      if (existingName === fullName || 
          Math.abs(existingName.length - fullName.length) <= 2 && 
          existingName.replace(/[^a-z]/g, '') === fullName.replace(/[^a-z]/g, '')) {
        return driver;
      }
    }
    
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.first_name || !formData.last_name) {
      toast.error('Imię i nazwisko są wymagane');
      return;
    }

    setLoading(true);

    try {
      // Check for duplicates
      const duplicateDriver = await checkForDuplicates(formData.first_name, formData.last_name);
      
      if (duplicateDriver) {
        const confirmed = window.confirm(
          `Znaleziono podobnego kierowcę: ${duplicateDriver.first_name} ${duplicateDriver.last_name}. 
          Czy chcesz kontynuować i dodać nowego kierowcę?`
        );
        
        if (!confirmed) {
          setLoading(false);
          return;
        }
      }

      // Create new driver
      const { data: newDriver, error: driverError } = await supabase
        .from('drivers')
        .insert({
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email || null,
          phone: formData.phone || null,
          city_id: cityId
        })
        .select()
        .single();

      if (driverError) throw driverError;

      // Add platform IDs
      if (platformIds.length > 0) {
        const platformData = platformIds.map(p => ({
          driver_id: newDriver.id,
          platform: p.platform,
          platform_id: p.platform_id
        }));

        const { error: platformError } = await supabase
          .from('driver_platform_ids')
          .insert(platformData);

        if (platformError) throw platformError;
      }

      toast.success('Kierowca został dodany pomyślnie');
      onSuccess();
      
      // Reset form
      setFormData({ first_name: '', last_name: '', email: '', phone: '' });
      setPlatformIds([]);
      
    } catch (error) {
      toast.error(`Błąd podczas dodawania kierowcy: ${error instanceof Error ? error.message : 'Nieznany błąd'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Dodaj nowego kierowcę</DialogTitle>
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

          {/* Platform IDs - Direct input fields */}
          <div className="space-y-4">
            <Label>Identyfikatory platform (opcjonalne)</Label>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {platforms.map(platform => (
                <div key={platform.id} className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <Badge className={`${platform.color} text-xs px-2 py-1`}>
                      {platform.name}
                    </Badge>
                    ID
                  </Label>
                  <Input
                    placeholder={`ID kierowcy w ${platform.name}`}
                    value={platformIds.find(p => p.platform === platform.id)?.platform_id || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPlatformIds(prev => {
                        const filtered = prev.filter(p => p.platform !== platform.id);
                        if (value) {
                          return [...filtered, { platform: platform.id, platform_id: value }];
                        }
                        return filtered;
                      });
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Show added platforms */}
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
              {loading ? 'Dodawanie...' : 'Dodaj kierowcę'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};