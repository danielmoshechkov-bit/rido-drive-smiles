import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Search, Building2 } from 'lucide-react';
import { toast } from 'sonner';

interface Contractor {
  id: string;
  name: string;
  nip: string | null;
  address_street: string | null;
  address_city: string | null;
  address_postal_code: string | null;
  email: string | null;
  phone: string | null;
  bank_account: string | null;
  verification_status: string | null;
  whitelist_data: Record<string, unknown> | null;
  last_verified_at: string | null;
  created_at: string;
  notes: string | null;
}

interface ContractorEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractor: Contractor;
  onSaved: () => void;
}

export function ContractorEditDialog({
  open,
  onOpenChange,
  contractor,
  onSaved,
}: ContractorEditDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    nip: '',
    address_street: '',
    address_city: '',
    address_postal_code: '',
    email: '',
    phone: '',
    bank_account: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [searchingGus, setSearchingGus] = useState(false);
  const [originalNip, setOriginalNip] = useState('');

  useEffect(() => {
    if (open && contractor) {
      setFormData({
        name: contractor.name || '',
        nip: contractor.nip || '',
        address_street: contractor.address_street || '',
        address_city: contractor.address_city || '',
        address_postal_code: contractor.address_postal_code || '',
        email: contractor.email || '',
        phone: contractor.phone || '',
        bank_account: contractor.bank_account || '',
        notes: contractor.notes || '',
      });
      setOriginalNip(contractor.nip || '');
    }
  }, [open, contractor]);

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const searchGus = async () => {
    const cleanNip = formData.nip.replace(/[\s-]/g, '');
    if (!/^\d{10}$/.test(cleanNip)) {
      toast.error('Nieprawidłowy NIP (wymagane 10 cyfr)');
      return;
    }

    setSearchingGus(true);
    try {
      const { data, error } = await supabase.functions.invoke('registry-gus', {
        body: { nip: cleanNip },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        const gusData = data.data;
        setFormData((prev) => ({
          ...prev,
          name: gusData.name || prev.name,
          address_street: gusData.street
            ? `${gusData.street} ${gusData.propertyNumber || ''}${
                gusData.apartmentNumber ? '/' + gusData.apartmentNumber : ''
              }`.trim()
            : prev.address_street,
          address_city: gusData.city || prev.address_city,
          address_postal_code: gusData.postalCode || prev.address_postal_code,
        }));
        toast.success('Pobrano dane z GUS');
      } else {
        toast.error(data?.error || 'Nie znaleziono w rejestrze GUS');
      }
    } catch (err) {
      console.error('GUS search error:', err);
      toast.error('Błąd wyszukiwania w GUS');
    } finally {
      setSearchingGus(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Nazwa kontrahenta jest wymagana');
      return;
    }

    setSaving(true);
    try {
      const nipChanged = formData.nip !== originalNip;
      
      const updateData: Record<string, unknown> = {
        name: formData.name.trim(),
        nip: formData.nip.trim() || null,
        address_street: formData.address_street.trim() || null,
        address_city: formData.address_city.trim() || null,
        address_postal_code: formData.address_postal_code.trim() || null,
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        bank_account: formData.bank_account.trim() || null,
        notes: formData.notes.trim() || null,
      };

      // If NIP changed, reset verification status
      if (nipChanged) {
        updateData.verification_status = null;
        updateData.whitelist_data = null;
        updateData.last_verified_at = null;
      }

      const { error } = await supabase
        .from('invoice_recipients')
        .update(updateData)
        .eq('id', contractor.id);

      if (error) throw error;

      // If NIP changed and we have a new NIP, verify it
      if (nipChanged && formData.nip.trim()) {
        const cleanNip = formData.nip.replace(/[\s-]/g, '');
        if (/^\d{10}$/.test(cleanNip)) {
          await supabase.functions.invoke('registry-whitelist', {
            body: {
              nip: cleanNip,
              recipientId: contractor.id,
              bankAccount: formData.bank_account.trim() || null,
            },
          });
        }
      }

      toast.success('Zapisano zmiany');
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Błąd zapisywania');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Edytuj kontrahenta
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nazwa firmy *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Nazwa kontrahenta"
            />
          </div>

          {/* NIP with GUS search */}
          <div className="space-y-2">
            <Label htmlFor="nip">NIP</Label>
            <div className="flex gap-2">
              <Input
                id="nip"
                value={formData.nip}
                onChange={(e) => handleChange('nip', e.target.value)}
                placeholder="0000000000"
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                onClick={searchGus}
                disabled={searchingGus || !formData.nip}
              >
                {searchingGus ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Kliknij lupę, aby pobrać dane z rejestru GUS
            </p>
          </div>

          {/* Address */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="address_street">Ulica i numer</Label>
              <Input
                id="address_street"
                value={formData.address_street}
                onChange={(e) => handleChange('address_street', e.target.value)}
                placeholder="ul. Przykładowa 1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address_postal_code">Kod pocztowy</Label>
              <Input
                id="address_postal_code"
                value={formData.address_postal_code}
                onChange={(e) => handleChange('address_postal_code', e.target.value)}
                placeholder="00-000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address_city">Miasto</Label>
              <Input
                id="address_city"
                value={formData.address_city}
                onChange={(e) => handleChange('address_city', e.target.value)}
                placeholder="Warszawa"
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
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="kontakt@firma.pl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="+48 000 000 000"
              />
            </div>
          </div>

          {/* Bank Account */}
          <div className="space-y-2">
            <Label htmlFor="bank_account">Numer konta bankowego</Label>
            <Input
              id="bank_account"
              value={formData.bank_account}
              onChange={(e) => handleChange('bank_account', e.target.value)}
              placeholder="00 0000 0000 0000 0000 0000 0000"
              className="font-mono"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notatki</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Dodatkowe informacje..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Zapisz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
