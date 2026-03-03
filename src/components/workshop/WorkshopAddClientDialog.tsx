import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useCreateWorkshopClient } from '@/hooks/useWorkshop';
import { Users, Building, User, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  onCreated?: (client: any) => void;
}

function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 5);
  if (digits.length > 2) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return digits;
}

export function WorkshopAddClientDialog({ open, onOpenChange, providerId, onCreated }: Props) {
  const create = useCreateWorkshopClient();
  const [clientType, setClientType] = useState<'individual' | 'company'>('individual');
  const [form, setForm] = useState({
    company_name: '', nip: '', first_name: '', last_name: '',
    phone: '', email: '', postal_code: '', city: '', street: '', house_number: '', apartment_number: '',
    country: 'Polska', description: '', marketing_consent: true,
    contact_first_name: '', contact_last_name: '', contact_phone: '', contact_email: '',
  });

  const set = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }));

  const handlePostalCode = (val: string) => {
    set('postal_code', formatPostalCode(val));
  };

  const capitalizeFirst = (val: string) => {
    if (!val) return val;
    return val.charAt(0).toUpperCase() + val.slice(1);
  };

  const handleSubmit = async () => {
    const displayName = clientType === 'company' ? form.company_name : `${form.first_name} ${form.last_name}`;
    if (!displayName.trim()) return;

    const fullStreet = [form.street, form.house_number, form.apartment_number ? `m. ${form.apartment_number}` : ''].filter(Boolean).join(' ');

    const client = await create.mutateAsync({
      provider_id: providerId,
      client_type: clientType,
      company_name: clientType === 'company' ? form.company_name : null,
      nip: form.nip || null,
      first_name: clientType === 'company' ? capitalizeFirst(form.contact_first_name) || null : capitalizeFirst(form.first_name) || null,
      last_name: clientType === 'company' ? capitalizeFirst(form.contact_last_name) || null : capitalizeFirst(form.last_name) || null,
      phone: clientType === 'company' ? form.contact_phone || form.phone || null : form.phone || null,
      email: clientType === 'company' ? form.contact_email || form.email || null : form.email || null,
      postal_code: form.postal_code || null,
      city: form.city || null,
      street: fullStreet || null,
      country: form.country || 'Polska',
      description: form.description || null,
      marketing_consent: form.marketing_consent,
    });
    onCreated?.(client);
    setForm({ company_name: '', nip: '', first_name: '', last_name: '', phone: '', email: '', postal_code: '', city: '', street: '', house_number: '', apartment_number: '', country: 'Polska', description: '', marketing_consent: true, contact_first_name: '', contact_last_name: '', contact_phone: '', contact_email: '' });
    onOpenChange(false);
  };

  const AddressFields = () => (
    <>
      <div className="grid grid-cols-[1fr_auto_auto] gap-3">
        <div className="space-y-1.5">
          <Label>Ulica</Label>
          <Input value={form.street} onChange={e => set('street', e.target.value)} placeholder="Ulica" />
        </div>
        <div className="space-y-1.5 w-24">
          <Label>Nr domu</Label>
          <Input value={form.house_number} onChange={e => set('house_number', e.target.value)} placeholder="Nr" />
        </div>
        <div className="space-y-1.5 w-24">
          <Label>Nr lokalu</Label>
          <Input value={form.apartment_number} onChange={e => set('apartment_number', e.target.value)} placeholder="Lok." />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Kod pocztowy</Label>
          <Input value={form.postal_code} onChange={e => handlePostalCode(e.target.value)} placeholder="00-000" />
        </div>
        <div className="space-y-1.5">
          <Label>Miasto</Label>
          <Input value={form.city} onChange={e => set('city', e.target.value)} placeholder="Miasto" />
        </div>
        <div className="space-y-1.5">
          <Label>Kraj</Label>
          <Input value={form.country} onChange={e => set('country', e.target.value)} />
        </div>
      </div>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Dodaj nowego klienta
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2 justify-center">
            <Button variant={clientType === 'individual' ? 'default' : 'outline'} size="sm" onClick={() => setClientType('individual')} className="gap-2">
              <User className="h-4 w-4" /> Osoba prywatna
            </Button>
            <Button variant={clientType === 'company' ? 'default' : 'outline'} size="sm" onClick={() => setClientType('company')} className="gap-2">
              <Building className="h-4 w-4" /> Firma
            </Button>
          </div>

          {clientType === 'company' ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nazwa firmy *</Label>
                  <Input value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Nazwa firmy" />
                </div>
                <div className="space-y-1.5">
                  <Label>NIP</Label>
                  <Input value={form.nip} onChange={e => set('nip', e.target.value)} placeholder="NIP firmy" />
                </div>
              </div>
              <AddressFields />
              {/* Contact person */}
              <div className="border-t pt-4">
                <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">Osoba kontaktowa</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Imię</Label>
                    <Input value={form.contact_first_name} onChange={e => set('contact_first_name', e.target.value)} placeholder="Imię" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nazwisko</Label>
                    <Input value={form.contact_last_name} onChange={e => set('contact_last_name', e.target.value)} placeholder="Nazwisko" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="space-y-1.5">
                    <Label>Numer telefonu</Label>
                    <div className="flex gap-2">
                      <span className="flex items-center px-3 border rounded-md bg-muted text-sm">+48</span>
                      <Input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="Numer telefonu" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>E-mail</Label>
                    <Input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder="E-mail" />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Imię *</Label>
                  <Input value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Imię" />
                </div>
                <div className="space-y-1.5">
                  <Label>Nazwisko</Label>
                  <Input value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Nazwisko" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Numer telefonu</Label>
                  <div className="flex gap-2">
                    <span className="flex items-center px-3 border rounded-md bg-muted text-sm">+48</span>
                    <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Numer telefonu" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="E-mail" />
                </div>
              </div>
              <AddressFields />
            </>
          )}

          <div className="space-y-1.5">
            <Label>Uwagi</Label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Uwagi o kliencie" rows={2} />
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.marketing_consent} onCheckedChange={v => set('marketing_consent', v)} />
            <Label className="text-sm">Zgoda na treści marketingowe</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button onClick={handleSubmit} disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Zapisz
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
