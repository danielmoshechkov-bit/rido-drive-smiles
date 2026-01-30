import { useState, useEffect } from 'react';
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
import { Loader2, UserCog } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  pesel: string | null;
  address_street: string | null;
  address_city: string | null;
  address_postal_code: string | null;
  license_number: string | null;
}

interface EditDriverDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  driver: Driver;
  missingFields: string[];
  onSuccess: (updatedDriver: Driver) => void;
}

export function EditDriverDataModal({
  isOpen,
  onClose,
  driver,
  missingFields,
  onSuccess,
}: EditDriverDataModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    pesel: '',
    address_street: '',
    address_city: '',
    address_postal_code: '',
    license_number: '',
  });

  useEffect(() => {
    if (driver) {
      setFormData({
        first_name: driver.first_name || '',
        last_name: driver.last_name || '',
        email: driver.email || '',
        phone: driver.phone || '',
        pesel: driver.pesel || '',
        address_street: driver.address_street || '',
        address_city: driver.address_city || '',
        address_postal_code: driver.address_postal_code || '',
        license_number: driver.license_number || '',
      });
    }
  }, [driver]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      toast.error('Imię i nazwisko są wymagane');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('drivers')
        .update({
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          email: formData.email.trim() || null,
          phone: formData.phone.trim() || null,
          pesel: formData.pesel.trim() || null,
          address_street: formData.address_street.trim() || null,
          address_city: formData.address_city.trim() || null,
          address_postal_code: formData.address_postal_code.trim() || null,
          license_number: formData.license_number.trim() || null,
        })
        .eq('id', driver.id);

      if (error) throw error;

      toast.success('Dane kierowcy zostały zaktualizowane');
      
      const updatedDriver: Driver = {
        ...driver,
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        pesel: formData.pesel.trim() || null,
        address_street: formData.address_street.trim() || null,
        address_city: formData.address_city.trim() || null,
        address_postal_code: formData.address_postal_code.trim() || null,
        license_number: formData.license_number.trim() || null,
      };
      
      onSuccess(updatedDriver);
      onClose();
    } catch (error) {
      console.error('Error updating driver:', error);
      toast.error('Nie udało się zaktualizować danych');
    } finally {
      setLoading(false);
    }
  };

  const isFieldMissing = (fieldName: string) => {
    const fieldMap: Record<string, string> = {
      pesel: 'PESEL',
      email: 'E-mail',
      phone: 'Telefon',
      license_number: 'Numer prawa jazdy',
      address_street: 'Adres',
      address_city: 'Adres',
    };
    return missingFields.some(f => 
      f === fieldMap[fieldName] || 
      (fieldName.startsWith('address_') && f === 'Adres')
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Uzupełnij dane kierowcy
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Uzupełnij brakujące dane, aby kontynuować proces wynajmu.
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <form id="edit-driver-form" onSubmit={handleSubmit} className="space-y-4 pb-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">
                  Imię <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">
                  Nazwisko <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pesel" className={isFieldMissing('pesel') ? 'text-destructive' : ''}>
                PESEL {isFieldMissing('pesel') && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="pesel"
                value={formData.pesel}
                onChange={e => setFormData({ ...formData, pesel: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                placeholder="00000000000"
                maxLength={11}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="license_number" className={isFieldMissing('license_number') ? 'text-destructive' : ''}>
                Numer prawa jazdy {isFieldMissing('license_number') && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="license_number"
                value={formData.license_number}
                onChange={e => setFormData({ ...formData, license_number: e.target.value.toUpperCase() })}
                placeholder="np. ABC123456"
                className="uppercase"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className={isFieldMissing('email') ? 'text-destructive' : ''}>
                E-mail {isFieldMissing('email') && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="jan@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className={isFieldMissing('phone') ? 'text-destructive' : ''}>
                Telefon {isFieldMissing('phone') && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+48 123 456 789"
              />
            </div>

            <div className="border-t pt-4">
              <p className={`text-sm font-medium mb-3 ${isFieldMissing('address_street') ? 'text-destructive' : 'text-muted-foreground'}`}>
                Adres zamieszkania {isFieldMissing('address_street') && <span className="text-destructive">*</span>}
              </p>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="address_street">Ulica i numer</Label>
                  <Input
                    id="address_street"
                    value={formData.address_street}
                    onChange={e => setFormData({ ...formData, address_street: e.target.value })}
                    placeholder="np. ul. Przykładowa 10/5"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="address_postal_code">Kod pocztowy</Label>
                    <Input
                      id="address_postal_code"
                      value={formData.address_postal_code}
                      onChange={e => setFormData({ ...formData, address_postal_code: e.target.value })}
                      placeholder="00-000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address_city">Miasto</Label>
                    <Input
                      id="address_city"
                      value={formData.address_city}
                      onChange={e => setFormData({ ...formData, address_city: e.target.value })}
                      placeholder="Warszawa"
                    />
                  </div>
                </div>
              </div>
            </div>
          </form>
        </ScrollArea>

        <div className="flex gap-3 p-6 pt-4 border-t bg-background">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Anuluj
          </Button>
          <Button type="submit" form="edit-driver-form" disabled={loading} className="flex-1">
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Zapisz
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
