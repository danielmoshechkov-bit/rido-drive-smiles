import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus } from 'lucide-react';

interface AddFleetDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  fleetId: string;
  onSuccess: (driverId: string) => void;
}

export function AddFleetDriverModal({
  isOpen,
  onClose,
  fleetId,
  onSuccess,
}: AddFleetDriverModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    getrido_id: '',
    uber_id: '',
    bolt_id: '',
    freenow_id: '',
    iban: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      toast({
        title: 'Błąd',
        description: 'Imię i nazwisko są wymagane',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Create the driver
      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .insert({
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          email: formData.email.trim() || null,
          phone: formData.phone.trim() || null,
          getrido_id: formData.getrido_id.trim() || null,
          iban: formData.iban.trim() || null,
          fleet_id: fleetId,
          city_id: null, // Will be set later if needed
        })
        .select('id')
        .single();

      if (driverError) throw driverError;

      // Add platform IDs
      const platformIds: { driver_id: string; platform: string; platform_id: string }[] = [];
      if (formData.uber_id.trim()) platformIds.push({ driver_id: driver.id, platform: 'uber', platform_id: formData.uber_id.trim() });
      if (formData.bolt_id.trim()) platformIds.push({ driver_id: driver.id, platform: 'bolt', platform_id: formData.bolt_id.trim() });
      if (formData.freenow_id.trim()) platformIds.push({ driver_id: driver.id, platform: 'freenow', platform_id: formData.freenow_id.trim() });

      if (platformIds.length > 0) {
        await supabase.from('driver_platform_ids').insert(platformIds);
      }

      // Create fleet relation
      await supabase
        .from('driver_fleet_relations')
        .insert({
          driver_id: driver.id,
          fleet_id: fleetId,
          relation_type: 'both',
          is_active: true,
        });

      toast({
        title: 'Sukces',
        description: 'Kierowca został dodany',
      });

      onSuccess(driver.id);
      handleClose();
    } catch (error) {
      console.error('Error adding driver:', error);
      toast({
        title: 'Błąd',
        description: 'Nie udało się dodać kierowcy',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      getrido_id: '',
      uber_id: '',
      bolt_id: '',
      freenow_id: '',
      iban: '',
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Dodaj kierowcę
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">Imię *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                placeholder="Jan"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Nazwisko *</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                placeholder="Kowalski"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              placeholder="jan@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefon</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+48 123 456 789"
            />
          </div>

          {/* Platform IDs */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Identyfikatory platform (opcjonalne)</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="GetRido ID"
                value={formData.getrido_id}
                onChange={e => setFormData({ ...formData, getrido_id: e.target.value })}
              />
              <Input
                placeholder="Uber ID"
                value={formData.uber_id}
                onChange={e => setFormData({ ...formData, uber_id: e.target.value })}
              />
              <Input
                placeholder="Bolt ID"
                value={formData.bolt_id}
                onChange={e => setFormData({ ...formData, bolt_id: e.target.value })}
              />
              <Input
                placeholder="FreeNow ID"
                value={formData.freenow_id}
                onChange={e => setFormData({ ...formData, freenow_id: e.target.value })}
              />
            </div>
          </div>

          {/* IBAN */}
          <div className="space-y-2">
            <Label htmlFor="iban">Numer konta (IBAN)</Label>
            <Input
              id="iban"
              value={formData.iban}
              onChange={e => setFormData({ ...formData, iban: e.target.value })}
              placeholder="PL00 0000 0000 0000 0000 0000 0000"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">Konto do wypłat dla kierowcy</p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
              Anuluj
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Dodaj
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
