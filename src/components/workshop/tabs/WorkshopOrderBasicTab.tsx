import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpdateWorkshopOrder } from '@/hooks/useWorkshop';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Car, Users, Save, Camera, Calendar, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  order: any;
  providerId: string;
}

const fuelLevels = ['Rezerwa', '1/4', '1/2', '3/4', 'Pełny'];

export function WorkshopOrderBasicTab({ order, providerId }: Props) {
  const updateOrder = useUpdateWorkshopOrder();

  // Load workshop stations
  const { data: stations = [] } = useQuery({
    queryKey: ['workshop-stations', providerId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('workshop_stations')
        .select('*')
        .eq('provider_id', providerId)
        .eq('is_active', true)
        .order('sort_order');
      return data || [];
    },
    enabled: !!providerId,
  });

  const [form, setForm] = useState({
    mileage: order.mileage || '',
    fuel_level: order.fuel_level || '',
    start_date: order.start_date || '',
    pickup_date: order.pickup_date || '',
    worker: order.worker || '',
    description: order.description || '',
    mechanic_notes: order.mechanic_notes || '',
    post_completion_notes: order.post_completion_notes || '',
    damage_description: order.damage_description || '',
    reception_protocol: order.reception_protocol ?? true,
    return_parts_to_client: order.return_parts_to_client || false,
    registration_document: order.registration_document || false,
    test_drive_consent: order.test_drive_consent ?? true,
    top_up_fluids: order.top_up_fluids || false,
    top_up_lights: order.top_up_lights || false,
    scheduled_date: order.scheduled_date ? order.scheduled_date.slice(0, 16) : '',
    scheduled_station: order.scheduled_station || '',
    sms_reminder_24h: order.sms_reminder_24h ?? true,
    sms_reminder_2h: order.sms_reminder_2h ?? true,
  });

  const set = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }));

  const handleSave = async () => {
    await updateOrder.mutateAsync({
      id: order.id,
      mileage: form.mileage ? parseInt(String(form.mileage)) : null,
      fuel_level: form.fuel_level || null,
      start_date: form.start_date || null,
      pickup_date: form.pickup_date || null,
      worker: form.worker || null,
      description: form.description || null,
      mechanic_notes: form.mechanic_notes || null,
      post_completion_notes: form.post_completion_notes || null,
      damage_description: form.damage_description || null,
      reception_protocol: form.reception_protocol,
      return_parts_to_client: form.return_parts_to_client,
      registration_document: form.registration_document,
      test_drive_consent: form.test_drive_consent,
      top_up_fluids: form.top_up_fluids,
      top_up_lights: form.top_up_lights,
      scheduled_date: form.scheduled_date ? new Date(form.scheduled_date).toISOString() : null,
      scheduled_station: form.scheduled_station || null,
      sms_reminder_24h: form.sms_reminder_24h,
      sms_reminder_2h: form.sms_reminder_2h,
    });
    toast.success('Zlecenie zaktualizowane');
  };

  const clientName = order.client
    ? order.client.client_type === 'company'
      ? order.client.company_name
      : `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim()
    : 'Brak klienta';

  const vehicleName = order.vehicle
    ? `${order.vehicle.brand || ''} ${order.vehicle.model || ''} ${order.vehicle.year || ''} ${order.vehicle.plate || ''}`.trim()
    : 'Brak pojazdu';

  return (
    <div className="space-y-6">
      {/* Vehicle & Client cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Vehicle */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pojazd</Label>
              {order.vehicle?.vin && (
                <span className="text-xs text-muted-foreground">VIN: {order.vehicle.vin}</span>
              )}
            </div>
            <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
              <Car className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{vehicleName}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Przebieg</Label>
                <div className="flex gap-1">
                  <Input
                    type="number"
                    value={form.mileage}
                    onChange={e => set('mileage', e.target.value)}
                    placeholder="Przebieg"
                  />
                  <span className="flex items-center px-2 text-xs text-muted-foreground border rounded-md bg-muted">km</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Poziom paliwa</Label>
                <Select value={form.fuel_level} onValueChange={v => set('fuel_level', v)}>
                  <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                  <SelectContent>
                    {fuelLevels.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Client */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Klient</Label>
              <Button variant="link" size="sm" className="text-xs h-auto p-0">Ustaw datę przyjęcia</Button>
            </div>
            <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{clientName}</span>
            </div>
            {order.client && (
              <div className="text-sm text-muted-foreground">
                <p>{clientName}</p>
                {order.client.phone && <p>+48 {order.client.phone}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Termin wizyty */}
      <Card className="border-primary/30">
        <CardContent className="pt-4 space-y-3">
          <Label className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Termin wizyty
          </Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Data i godzina</Label>
              <Input
                type="datetime-local"
                value={form.scheduled_date}
                onChange={e => set('scheduled_date', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Stanowisko</Label>
              <Select value={form.scheduled_station} onValueChange={v => set('scheduled_station', v)}>
                <SelectTrigger><SelectValue placeholder="Wybierz stanowisko" /></SelectTrigger>
                <SelectContent>
                  {stations.map((s: any) => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={form.sms_reminder_24h} onCheckedChange={v => set('sms_reminder_24h', v)} />
              Przypomnij SMS 24h przed
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={form.sms_reminder_2h} onCheckedChange={v => set('sms_reminder_2h', v)} />
              Przypomnij SMS 2h przed
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Data rozpoczęcia</Label>
          <Input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Domyślny pracownik</Label>
          <Input value={form.worker} onChange={e => set('worker', e.target.value)} placeholder="Domyślny pracownik" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Opis zlecenia</Label>
        <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Opis zlecenia" rows={3} />
      </div>

      {/* Toggles */}
      <div className="flex flex-wrap gap-x-6 gap-y-3 border rounded-md p-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={form.return_parts_to_client} onCheckedChange={v => set('return_parts_to_client', v)} />
          Zwrot części do klienta
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={form.registration_document} onCheckedChange={v => set('registration_document', v)} />
          Dowód rejestracyjny
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={form.test_drive_consent} onCheckedChange={v => set('test_drive_consent', v)} />
          Zgoda na jazdę próbną
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={form.top_up_fluids} onCheckedChange={v => set('top_up_fluids', v)} />
          Uzupełnić płyny eksploatacyjne
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={form.top_up_lights} onCheckedChange={v => set('top_up_lights', v)} />
          Uzupełnić oświetlenie
        </label>
      </div>

      {/* Reception: Przyjęcie do serwisu */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="bg-red-500 text-white text-sm font-medium px-4 py-1.5 rounded">Przyjęcie do serwisu</span>
            <Input
              type="date"
              value={form.pickup_date}
              onChange={e => set('pickup_date', e.target.value)}
              placeholder="Termin odbioru"
              className="w-[180px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Opis dla pracownika</Label>
            <Textarea value={form.mechanic_notes} onChange={e => set('mechanic_notes', e.target.value)} placeholder="Opis dla pracownika" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Uwagi po wykonaniu zlecenia</Label>
            <Textarea value={form.post_completion_notes} onChange={e => set('post_completion_notes', e.target.value)} placeholder="Uwagi po wykonaniu zlecenia" rows={2} />
          </div>
        </CardContent>
      </Card>

      {/* Damage section */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold uppercase text-sm tracking-wider">Uszkodzenia pojazdu</h3>
            <label className="flex items-center gap-2 text-sm">
              Na protokole przyjęcia
              <Switch checked={form.reception_protocol} onCheckedChange={v => set('reception_protocol', v)} />
            </label>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ogólny opis uszkodzeń pojazdu</Label>
            <Textarea value={form.damage_description} onChange={e => set('damage_description', e.target.value)} placeholder="Ogólny opis uszkodzeń pojazdu" rows={2} />
          </div>

          {/* Photo upload section */}
          <div>
            <h4 className="text-sm font-medium mb-3">Zdjęcia pojazdu przy przyjęciu</h4>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {['Przód', 'Tył', 'Lewy bok', 'Prawy bok', 'Wnętrze przód', 'Wnętrze tył'].map(label => (
                <div key={label} className="border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-4 text-center cursor-pointer hover:border-primary/50 transition-colors">
                  <Camera className="h-6 w-6 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateOrder.isPending} className="gap-2">
          <Save className="h-4 w-4" /> Zapisz zmiany
        </Button>
      </div>
    </div>
  );
}
