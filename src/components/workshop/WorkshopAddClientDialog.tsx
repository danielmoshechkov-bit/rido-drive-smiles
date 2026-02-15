import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateWorkshopClient, useWorkshopVehicles } from '@/hooks/useWorkshop';
import { Users, Building, User, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  onCreated?: (client: any) => void;
}

export function WorkshopAddClientDialog({ open, onOpenChange, providerId, onCreated }: Props) {
  const create = useCreateWorkshopClient();
  const { data: vehicles = [] } = useWorkshopVehicles(providerId);
  const [clientType, setClientType] = useState<'individual' | 'company'>('individual');
  const [form, setForm] = useState({
    company_name: '', nip: '', first_name: '', last_name: '',
    phone: '', email: '', postal_code: '', city: '', street: '',
    country: 'Polska', description: '', marketing_consent: true,
    payment_method: '', payment_term: '', default_vehicle_id: '',
    service_discount_percent: '0', goods_discount_percent: '0',
  });

  const set = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }));

  const handleSubmit = async () => {
    const displayName = clientType === 'company' ? form.company_name : `${form.first_name} ${form.last_name}`;
    if (!displayName.trim()) return;

    const client = await create.mutateAsync({
      provider_id: providerId,
      client_type: clientType,
      company_name: clientType === 'company' ? form.company_name : null,
      nip: form.nip || null,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      phone: form.phone || null,
      email: form.email || null,
      postal_code: form.postal_code || null,
      city: form.city || null,
      street: form.street || null,
      country: form.country || 'Polska',
      description: form.description || null,
      marketing_consent: form.marketing_consent,
      payment_method: form.payment_method || null,
      payment_term: form.payment_term || null,
      default_vehicle_id: form.default_vehicle_id || null,
      service_discount_percent: parseFloat(form.service_discount_percent) || 0,
      goods_discount_percent: parseFloat(form.goods_discount_percent) || 0,
    });
    onCreated?.(client);
    setForm({ company_name: '', nip: '', first_name: '', last_name: '', phone: '', email: '', postal_code: '', city: '', street: '', country: 'Polska', description: '', marketing_consent: true, payment_method: '', payment_term: '', default_vehicle_id: '', service_discount_percent: '0', goods_discount_percent: '0' });
    onOpenChange(false);
  };

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
            <Button
              variant={clientType === 'individual' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setClientType('individual')}
              className="gap-2"
            >
              <User className="h-4 w-4" /> Osoba prywatna
            </Button>
            <Button
              variant={clientType === 'company' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setClientType('company')}
              className="gap-2"
            >
              <Building className="h-4 w-4" /> Firma
            </Button>
          </div>

          {clientType === 'company' && (
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
          )}

          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Imię {clientType === 'individual' ? '*' : ''}</Label>
              <Input value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Imię" />
            </div>
            <div className="space-y-1.5">
              <Label>Nazwisko</Label>
              <Input value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Nazwisko" />
            </div>
            <div className="space-y-1.5">
              <Label>Domyślny pojazd</Label>
              <Select value={form.default_vehicle_id} onValueChange={v => set('default_vehicle_id', v)}>
                <SelectTrigger><SelectValue placeholder="Domyślny pojazd" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.brand} {v.model} {v.plate || ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Metoda płatności</Label>
              <Select value={form.payment_method} onValueChange={v => set('payment_method', v)}>
                <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gotówka">Gotówka</SelectItem>
                  <SelectItem value="przelew">Przelew</SelectItem>
                  <SelectItem value="karta">Karta</SelectItem>
                  <SelectItem value="blik">BLIK</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Kod pocztowy</Label>
              <Input value={form.postal_code} onChange={e => set('postal_code', e.target.value)} placeholder="Kod pocztowy" />
            </div>
            <div className="space-y-1.5">
              <Label>Miasto</Label>
              <Input value={form.city} onChange={e => set('city', e.target.value)} placeholder="Miasto" />
            </div>
            <div className="space-y-1.5">
              <Label>Kraj</Label>
              <Input value={form.country} onChange={e => set('country', e.target.value)} placeholder="Kraj" />
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

          <div className="space-y-1.5">
            <Label>Ulica</Label>
            <Input value={form.street} onChange={e => set('street', e.target.value)} placeholder="Ulica" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Termin płatności</Label>
              <Select value={form.payment_term} onValueChange={v => set('payment_term', v)}>
                <SelectTrigger><SelectValue placeholder="Termin płatności" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="natychmiast">Natychmiast</SelectItem>
                  <SelectItem value="7dni">7 dni</SelectItem>
                  <SelectItem value="14dni">14 dni</SelectItem>
                  <SelectItem value="30dni">30 dni</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>% rabat na usługi</Label>
                <Input type="number" value={form.service_discount_percent} onChange={e => set('service_discount_percent', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>% rabat na towary</Label>
                <Input type="number" value={form.goods_discount_percent} onChange={e => set('goods_discount_percent', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Opis klienta</Label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Opis klienta" rows={3} />
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.marketing_consent} onCheckedChange={v => set('marketing_consent', v)} />
            <Label className="text-sm">Zgoda na otrzymywanie treści marketingowych</Label>
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
