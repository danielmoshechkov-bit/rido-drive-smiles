import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
    uber_id: '',
    bolt_id: '',
    freenow_id: '',
    payment_method: 'cash' as 'cash' | 'transfer',
    iban: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      toast.error('Imię i nazwisko są wymagane');
      return;
    }

    setLoading(true);
    try {
      let cityId: string | null = null;
      
      const { data: existingDriver } = await supabase
        .from('drivers')
        .select('city_id')
        .eq('fleet_id', fleetId)
        .not('city_id', 'is', null)
        .limit(1)
        .maybeSingle();
      
      if (existingDriver?.city_id) {
        cityId = existingDriver.city_id;
      } else {
        const { data: cities } = await supabase
          .from('cities')
          .select('id')
          .limit(1)
          .maybeSingle();
        cityId = cities?.id || null;
      }

      if (!cityId) {
        toast.error('Brak skonfigurowanego miasta w systemie');
        setLoading(false);
        return;
      }

      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .insert({
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          email: formData.email.trim() || null,
          phone: formData.phone.trim() || null,
          payment_method: formData.payment_method,
          iban: formData.payment_method === 'transfer' ? (formData.iban.trim() || null) : null,
          fleet_id: fleetId,
          city_id: cityId,
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

      toast.success('Kierowca został dodany');
      onSuccess(driver.id);
      handleClose();
    } catch (error) {
      console.error('Error adding driver:', error);
      toast.error('Nie udało się dodać kierowcy');
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
      uber_id: '',
      bolt_id: '',
      freenow_id: '',
      payment_method: 'cash',
      iban: '',
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Dodaj kierowcę
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <form id="add-driver-form" onSubmit={handleSubmit} className="space-y-4 pb-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">Imię <span className="text-destructive">*</span></Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                  placeholder="Jan"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Nazwisko <span className="text-destructive">*</span></Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                  placeholder="Kowalski"
                  required
                />
              </div>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-2 gap-4">
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
            </div>

            {/* Platform IDs */}
            <div className="border-t pt-4 mt-4">
              <p className="text-sm font-medium text-muted-foreground mb-3">Identyfikatory platform (opcjonalne)</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="uber_id" className="text-xs">Uber ID</Label>
                  <Input
                    id="uber_id"
                    placeholder="Uber ID"
                    value={formData.uber_id}
                    onChange={e => setFormData({ ...formData, uber_id: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bolt_id" className="text-xs">
                    Bolt ID
                  </Label>
                  <Input
                    id="bolt_id"
                    placeholder="nr telefonu"
                    value={formData.bolt_id}
                    onChange={e => setFormData({ ...formData, bolt_id: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground">Numer telefonu używany w aplikacji Bolt</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="freenow_id" className="text-xs">
                    FreeNow ID
                  </Label>
                  <Input
                    id="freenow_id"
                    placeholder="ID kierowcy"
                    value={formData.freenow_id}
                    onChange={e => setFormData({ ...formData, freenow_id: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground">ID kierowcy z panelu FreeNow</p>
                </div>
              </div>
            </div>

            {/* Payment method */}
            <div className="border-t pt-4 mt-4">
              <p className="text-sm font-medium text-muted-foreground mb-3">Metoda wypłaty</p>
              <div className="space-y-3">
                <Select
                  value={formData.payment_method}
                  onValueChange={(val: 'cash' | 'transfer') => setFormData({ ...formData, payment_method: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Gotówka</SelectItem>
                    <SelectItem value="transfer">Przelew bankowy</SelectItem>
                  </SelectContent>
                </Select>

                {formData.payment_method === 'transfer' && (
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
                )}
              </div>
            </div>
          </form>
        </ScrollArea>

        <div className="flex gap-3 p-6 pt-4 border-t bg-background">
          <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
            Anuluj
          </Button>
          <Button type="submit" form="add-driver-form" disabled={loading} className="flex-1">
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Dodaj kierowcę
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
