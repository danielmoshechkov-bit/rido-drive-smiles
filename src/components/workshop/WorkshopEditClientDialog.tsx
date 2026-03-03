import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Users, Building, User, Loader2, Save } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: any;
}

function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 5);
  if (digits.length > 2) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return digits;
}

function capitalizeFirst(val: string) {
  if (!val) return val;
  return val.charAt(0).toUpperCase() + val.slice(1);
}

export function WorkshopEditClientDialog({ open, onOpenChange, client }: Props) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  // Parse street back into parts
  const parseStreet = (street: string | null) => {
    if (!street) return { street: '', house_number: '', apartment_number: '' };
    const mMatch = street.match(/^(.*?)\s+(\S+)\s+m\.\s+(\S+)$/);
    if (mMatch) return { street: mMatch[1], house_number: mMatch[2], apartment_number: mMatch[3] };
    const parts = street.split(' ');
    if (parts.length >= 2) return { street: parts.slice(0, -1).join(' '), house_number: parts[parts.length - 1], apartment_number: '' };
    return { street, house_number: '', apartment_number: '' };
  };

  const streetParts = parseStreet(client?.street);

  const [form, setForm] = useState({
    company_name: client?.company_name || '',
    nip: client?.nip || '',
    first_name: client?.first_name || '',
    last_name: client?.last_name || '',
    phone: client?.phone || '',
    email: client?.email || '',
    postal_code: client?.postal_code || '',
    city: client?.city || '',
    street: streetParts.street,
    house_number: streetParts.house_number,
    apartment_number: streetParts.apartment_number,
    country: client?.country || 'Polska',
    description: client?.description || '',
    marketing_consent: client?.marketing_consent ?? true,
  });

  useEffect(() => {
    if (client) {
      const sp = parseStreet(client.street);
      setForm({
        company_name: client.company_name || '',
        nip: client.nip || '',
        first_name: client.first_name || '',
        last_name: client.last_name || '',
        phone: client.phone || '',
        email: client.email || '',
        postal_code: client.postal_code || '',
        city: client.city || '',
        street: sp.street,
        house_number: sp.house_number,
        apartment_number: sp.apartment_number,
        country: client.country || 'Polska',
        description: client.description || '',
        marketing_consent: client.marketing_consent ?? true,
      });
    }
  }, [client]);

  const set = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }));
  const isCompany = client?.client_type === 'company';

  const handleSave = async () => {
    setSaving(true);
    try {
      const fullStreet = [form.street, form.house_number, form.apartment_number ? `m. ${form.apartment_number}` : ''].filter(Boolean).join(' ');
      const { error } = await (supabase as any)
        .from('workshop_clients')
        .update({
          company_name: isCompany ? form.company_name : null,
          nip: form.nip || null,
          first_name: capitalizeFirst(form.first_name) || null,
          last_name: capitalizeFirst(form.last_name) || null,
          phone: form.phone || null,
          email: form.email || null,
          postal_code: form.postal_code || null,
          city: form.city || null,
          street: fullStreet || null,
          country: form.country || 'Polska',
          description: form.description || null,
          marketing_consent: form.marketing_consent,
        })
        .eq('id', client.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['workshop-clients'] });
      toast.success('Dane klienta zaktualizowane');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!client) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCompany ? <Building className="h-5 w-5" /> : <User className="h-5 w-5" />}
            Edytuj klienta
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isCompany ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nazwa firmy *</Label>
                  <Input value={form.company_name} onChange={e => set('company_name', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>NIP</Label>
                  <Input value={form.nip} onChange={e => set('nip', e.target.value)} />
                </div>
              </div>
              <div className="border-t pt-4">
                <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">Osoba kontaktowa</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Imię</Label>
                    <Input value={form.first_name} onChange={e => set('first_name', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nazwisko</Label>
                    <Input value={form.last_name} onChange={e => set('last_name', e.target.value)} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Imię *</Label>
                <Input value={form.first_name} onChange={e => set('first_name', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Nazwisko</Label>
                <Input value={form.last_name} onChange={e => set('last_name', e.target.value)} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Numer telefonu</Label>
              <div className="flex gap-2">
                <span className="flex items-center px-3 border rounded-md bg-muted text-sm">+48</span>
                <Input value={form.phone} onChange={e => set('phone', e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto_auto] gap-3">
            <div className="space-y-1.5">
              <Label>Ulica</Label>
              <Input value={form.street} onChange={e => set('street', e.target.value)} />
            </div>
            <div className="space-y-1.5 w-24">
              <Label>Nr domu</Label>
              <Input value={form.house_number} onChange={e => set('house_number', e.target.value)} />
            </div>
            <div className="space-y-1.5 w-24">
              <Label>Nr lokalu</Label>
              <Input value={form.apartment_number} onChange={e => set('apartment_number', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Kod pocztowy</Label>
              <Input value={form.postal_code} onChange={e => set('postal_code', formatPostalCode(e.target.value))} placeholder="00-000" />
            </div>
            <div className="space-y-1.5">
              <Label>Miasto</Label>
              <Input value={form.city} onChange={e => set('city', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Kraj</Label>
              <Input value={form.country} onChange={e => set('country', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Uwagi</Label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} />
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.marketing_consent} onCheckedChange={v => set('marketing_consent', v)} />
            <Label className="text-sm">Zgoda na treści marketingowe</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" /> Zapisz zmiany
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
