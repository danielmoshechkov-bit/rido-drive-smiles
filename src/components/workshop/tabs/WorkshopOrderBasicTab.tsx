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
import { Car, Users, Save, Camera, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface Props {
  order: any;
  providerId: string;
}

const fuelLevels: { value: string; labelKey: string }[] = [
  { value: 'Rezerwa', labelKey: 'workshop.newOrder.fuelReserve' },
  { value: '1/4', labelKey: 'workshop.newOrder.fuelQuarter' },
  { value: '1/2', labelKey: 'workshop.newOrder.fuelHalf' },
  { value: '3/4', labelKey: 'workshop.newOrder.fuelThreeQuarter' },
  { value: 'Pełny', labelKey: 'workshop.newOrder.fuelFull' },
];

const intakePhotoLabels = [
  'workshop.newOrder.photoFront',
  'workshop.newOrder.photoBack',
  'workshop.newOrder.photoLeft',
  'workshop.newOrder.photoRight',
  'workshop.newOrder.photoInteriorFront',
  'workshop.newOrder.photoInteriorBack',
];

export function WorkshopOrderBasicTab({ order, providerId }: Props) {
  const { t } = useTranslation();
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
    toast.success(t('workshop.orderBasic.orderUpdated'));
  };

  const clientName = order.client
    ? order.client.client_type === 'company'
      ? order.client.company_name
      : `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim()
    : t('workshop.orderBasic.noClient');

  const vehicleName = order.vehicle
    ? `${order.vehicle.brand || ''} ${order.vehicle.model || ''} ${order.vehicle.year || ''} ${order.vehicle.plate || ''}`.trim()
    : t('workshop.orderBasic.noVehicle');

  return (
    <div className="space-y-6">
      {/* Vehicle & Client cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Vehicle */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t('workshop.newOrder.vehicle')}</Label>
              {order.vehicle?.vin && (
                <span className="text-xs text-muted-foreground">{t('workshop.orders.vin')}: {order.vehicle.vin}</span>
              )}
            </div>
            <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
              <Car className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{vehicleName}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('workshop.newOrder.mileage')}</Label>
                <div className="flex gap-1">
                  <Input
                    type="number"
                    value={form.mileage}
                    onChange={e => set('mileage', e.target.value)}
                    placeholder={t('workshop.newOrder.mileage')}
                  />
                  <span className="flex items-center px-2 text-xs text-muted-foreground border rounded-md bg-muted">km</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('workshop.newOrder.fuelLevel')}</Label>
                <Select value={form.fuel_level} onValueChange={v => set('fuel_level', v)}>
                  <SelectTrigger><SelectValue placeholder={t('workshop.newOrder.selectPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    {fuelLevels.map(f => <SelectItem key={f.value} value={f.value}>{t(f.labelKey)}</SelectItem>)}
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
              <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t('workshop.newOrder.client')}</Label>
              <Button variant="link" size="sm" className="text-xs h-auto p-0">{t('workshop.orderBasic.setReceptionDate')}</Button>
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
            <Calendar className="h-4 w-4" /> {t('workshop.orderBasic.appointmentTime')}
          </Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.orderBasic.dateAndTime')}</Label>
              <Input
                type="datetime-local"
                value={form.scheduled_date}
                onChange={e => set('scheduled_date', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.orderBasic.station')}</Label>
              <Select value={form.scheduled_station} onValueChange={v => set('scheduled_station', v)}>
                <SelectTrigger><SelectValue placeholder={t('workshop.orderBasic.selectStation')} /></SelectTrigger>
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
              {t('workshop.orderBasic.smsReminder24h')}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={form.sms_reminder_2h} onCheckedChange={v => set('sms_reminder_2h', v)} />
              {t('workshop.orderBasic.smsReminder2h')}
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">{t('workshop.orderBasic.startDate')}</Label>
          <Input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t('workshop.orderBasic.defaultWorker')}</Label>
          <Input value={form.worker} onChange={e => set('worker', e.target.value)} placeholder={t('workshop.orderBasic.defaultWorker')} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">{t('workshop.orderBasic.orderDescription')}</Label>
        <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder={t('workshop.orderBasic.orderDescription')} rows={3} />
      </div>

      {/* Toggles */}
      <div className="flex flex-wrap gap-x-6 gap-y-3 border rounded-md p-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={form.return_parts_to_client} onCheckedChange={v => set('return_parts_to_client', v)} />
          {t('workshop.newOrder.checkReturnParts')}
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={form.registration_document} onCheckedChange={v => set('registration_document', v)} />
          {t('workshop.newOrder.checkRegistrationDoc')}
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={form.test_drive_consent} onCheckedChange={v => set('test_drive_consent', v)} />
          {t('workshop.newOrder.checkTestDrive')}
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={form.top_up_fluids} onCheckedChange={v => set('top_up_fluids', v)} />
          {t('workshop.newOrder.checkRefillFluids')}
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={form.top_up_lights} onCheckedChange={v => set('top_up_lights', v)} />
          {t('workshop.newOrder.checkRefillLights')}
        </label>
      </div>

      {/* Reception: Przyjęcie do serwisu */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="bg-red-500 text-white text-sm font-medium px-4 py-1.5 rounded">{t('workshop.orderBasic.serviceReception')}</span>
            <Input
              type="date"
              value={form.pickup_date}
              onChange={e => set('pickup_date', e.target.value)}
              placeholder={t('workshop.orderBasic.pickupDate')}
              className="w-[180px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('workshop.orderBasic.descriptionForWorker')}</Label>
            <Textarea value={form.mechanic_notes} onChange={e => set('mechanic_notes', e.target.value)} placeholder={t('workshop.orderBasic.descriptionForWorker')} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('workshop.orderBasic.postCompletionNotes')}</Label>
            <Textarea value={form.post_completion_notes} onChange={e => set('post_completion_notes', e.target.value)} placeholder={t('workshop.orderBasic.postCompletionNotes')} rows={2} />
          </div>
        </CardContent>
      </Card>

      {/* Damage section */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold uppercase text-sm tracking-wider">{t('workshop.newOrder.vehicleDamage')}</h3>
            <label className="flex items-center gap-2 text-sm">
              {t('workshop.orderBasic.onReceptionProtocol')}
              <Switch checked={form.reception_protocol} onCheckedChange={v => set('reception_protocol', v)} />
            </label>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('workshop.orderBasic.generalDamageDescription')}</Label>
            <Textarea value={form.damage_description} onChange={e => set('damage_description', e.target.value)} placeholder={t('workshop.orderBasic.generalDamageDescription')} rows={2} />
          </div>

          {/* Photo upload section */}
          <div>
            <h4 className="text-sm font-medium mb-3">{t('workshop.newOrder.intakePhotos')}</h4>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {intakePhotoLabels.map(labelKey => (
                <div key={labelKey} className="border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-4 text-center cursor-pointer hover:border-primary/50 transition-colors">
                  <Camera className="h-6 w-6 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">{t(labelKey)}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateOrder.isPending} className="gap-2">
          <Save className="h-4 w-4" /> {t('workshop.orderBasic.saveChanges')}
        </Button>
      </div>
    </div>
  );
}
