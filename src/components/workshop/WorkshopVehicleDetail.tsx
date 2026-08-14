import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useWorkshopOrders, useWorkshopClients } from '@/hooks/useWorkshop';
import { WorkshopAddClientDialog } from './WorkshopAddClientDialog';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useVehicleLookup } from '@/hooks/useVehicleLookup';
import { VehicleLookupCreditsModal } from '@/components/vehicle/VehicleLookupCreditsModal';
import {
  ArrowLeft, Search, Car, Plus, Phone, QrCode, Loader2, Users, Save
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { translateWorkshopStatus } from '@/utils/workshopStatusStyle';

interface Props {
  vehicle: any;
  providerId: string;
  onBack: () => void;
  onOpenOrder?: (order: any) => void;
}

const fuelTypes = ['Benzyna', 'Diesel', 'LPG', 'Hybryda', 'Elektryczny', 'Benzyna+LPG'];

export function WorkshopVehicleDetail({ vehicle, providerId, onBack, onOpenOrder }: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('dane');
  // view 'all' — domyślny widok 'active' wyklucza ZAKOŃCZONE zlecenia serwerowo,
  // przez co historia napraw auta pokazywała wszystko oprócz napraw faktycznie
  // wykonanych. To po nie sięga się otwierając kartę pojazdu.
  const { data: allOrders = [] } = useWorkshopOrders(providerId, { view: 'all' });
  const { data: clients = [] } = useWorkshopClients(providerId);
  const qc = useQueryClient();

  const [ownerClientId, setOwnerClientId] = useState(vehicle.owner_client_id || '');
  const [ownerSearch, setOwnerSearch] = useState('');
  const [showOwnerList, setShowOwnerList] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);

  const [{ data: { user } = { user: null } } = { data: { user: null } }] = [{ data: { user: null } }];
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id)); }, []);
  const { checkRegistration, checkVin, loading: lookupLoading, purchaseCredits } = useVehicleLookup(currentUserId);

  const numberOnly = (value: any) => String(value || '').replace(/[^0-9]/g, '');
  const applyLookup = async (data: any) => {
    if (!data) return;
    const current = form;
    const patch = {
      brand: data.make || current.brand,
      model: data.model || current.model,
      color: data.color || current.color,
      // Zamaskowany VIN z rejestru („W0L**********8071") nie nadaje się do zapisu —
      // nie da się po nim szukać ani zweryfikować auta, a udaje prawdziwy numer.
      vin: (data.vin && !String(data.vin).includes('*')) ? data.vin : current.vin,
      plate: data.registration_number || current.plate,
      year: data.registration_year ? String(data.registration_year) : current.year,
      first_registration_date: data.first_registration_date || current.first_registration_date,
      fuel_type: data.fuel_type || current.fuel_type,
      engine_capacity_cm3: numberOnly(data.engine_size) || current.engine_capacity_cm3,
      engine_power_kw: numberOnly(data.engine_power_kw) || current.engine_power_kw,
      description: data.description || current.description,
    };
    setForm(p => ({ ...p, ...patch }));
    await (supabase as any).from('workshop_vehicles').update({
      brand: patch.brand || null,
      model: patch.model || null,
      color: patch.color || null,
      vin: patch.vin?.toUpperCase() || null,
      plate: patch.plate?.toUpperCase() || null,
      year: patch.year ? parseInt(patch.year, 10) : null,
      first_registration_date: patch.first_registration_date || null,
      fuel_type: patch.fuel_type || null,
      engine_capacity_cm3: patch.engine_capacity_cm3 ? parseInt(patch.engine_capacity_cm3, 10) : null,
      engine_power_kw: patch.engine_power_kw ? parseInt(patch.engine_power_kw, 10) : null,
      description: patch.description || null,
    }).eq('id', vehicle.id);
    qc.invalidateQueries({ queryKey: ['workshop-vehicles'] });
  };

  const handleLookupPlate = async () => {
    if (!form.plate?.trim()) { toast.error(t('workshop.vehicles.enterPlate')); return; }
    const data = await checkRegistration(form.plate.trim().toUpperCase());
    if (data) await applyLookup(data);
    else if (!lookupLoading) setShowCreditsModal(true);
  };

  const handleLookupVin = async () => {
    if (!form.vin?.trim()) { toast.error(t('workshop.vehicles.enterVin')); return; }
    const data = await checkVin(form.vin.trim().toUpperCase());
    if (data) await applyLookup(data);
    else if (!lookupLoading) setShowCreditsModal(true);
  };

  // Form state
  const [form, setForm] = useState({
    brand: vehicle.brand || '',
    model: vehicle.model || '',
    color: vehicle.color || '',
    vin: vehicle.vin || '',
    plate: vehicle.plate || '',
    year: vehicle.year || '',
    first_registration_date: vehicle.first_registration_date || '',
    fuel_type: vehicle.fuel_type || '',
    engine_number: vehicle.engine_number || '',
    engine_capacity_cm3: vehicle.engine_capacity_cm3 || '',
    engine_power_kw: vehicle.engine_power_kw || '',
    description: vehicle.description || '',
  });

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  const vehicleOrders = allOrders.filter((o: any) => o.vehicle_id === vehicle.id);

  const selectedOwner = clients.find((c: any) => c.id === ownerClientId);
  const ownerLabel = selectedOwner
    ? (selectedOwner.company_name || `${selectedOwner.first_name || ''} ${selectedOwner.last_name || ''}`.trim())
    : '';

  const filteredClients = useMemo(() => {
    if (!ownerSearch) return clients;
    const s = ownerSearch.toLowerCase();
    return clients.filter((c: any) =>
      c.first_name?.toLowerCase().includes(s) ||
      c.last_name?.toLowerCase().includes(s) ||
      c.company_name?.toLowerCase().includes(s)
    );
  }, [clients, ownerSearch]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).from('workshop_vehicles').update({
        brand: form.brand || null,
        model: form.model || null,
        color: form.color || null,
        vin: form.vin?.toUpperCase() || null,
        plate: form.plate?.toUpperCase() || null,
        year: form.year ? parseInt(form.year) : null,
        first_registration_date: form.first_registration_date || null,
        fuel_type: form.fuel_type || null,
        engine_number: form.engine_number || null,
        engine_capacity_cm3: form.engine_capacity_cm3 ? parseInt(form.engine_capacity_cm3) : null,
        engine_power_kw: form.engine_power_kw ? parseInt(form.engine_power_kw) : null,
        description: form.description || null,
        owner_client_id: ownerClientId || null,
      }).eq('id', vehicle.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['workshop-vehicles'] });
      toast.success(t('workshop.vehicles.vehicleSaved'));
    } catch (e: any) {
      toast.error(t('workshop.vehicles.saveError', { error: e?.message || t('workshop.orders.unknownError') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="text-primary hover:underline flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> {t('workshop.dashboard.tiles.pojazdy')}
        </button>
        <span className="text-muted-foreground">·</span>
        <span className="font-semibold">
          {vehicle.brand} {vehicle.model} {vehicle.plate}
        </span>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/40 p-1 rounded-lg">
          {[
            { value: 'dane', labelKey: 'workshop.vehicles.vehicleData' },
            { value: 'pliki', labelKey: 'workshop.orderDetail.tabFiles' },
            { value: 'zlecenia', labelKey: 'workshop.vehicles.orderHistory' },
            { value: 'zadania', labelKey: 'workshop.vehicles.taskHistory' },
            { value: 'przebiegi', labelKey: 'workshop.vehicles.mileageHistory' },
            { value: 'naprawcze', labelKey: 'workshop.orderDetail.tabRepairData' },
          ].map(tab => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="data-[state=active]:bg-[hsl(45,100%,70%)] data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-sm hover:bg-[hsl(45,100%,85%)] transition-colors"
            >
              {t(tab.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Vehicle data */}
        <TabsContent value="dane">
          <Card>
            <CardContent className="py-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t('workshop.vehicles.vinNumber')}</Label>
                  <div className="flex gap-2">
                    <Input onFocus={e => e.currentTarget.select()} value={form.vin} onChange={e => set('vin', e.target.value.toUpperCase())} className="tracking-wide flex-1" />
                    <Button size="icon" variant="outline" onClick={handleLookupVin} disabled={lookupLoading} title={t('workshop.vehicles.lookupByVin')}>
                      {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.vehicles.firstRegistrationDate')}</Label>
                  <Input onFocus={e => e.currentTarget.select()} type="date" value={form.first_registration_date} onChange={e => set('first_registration_date', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.orders.fuelType')}</Label>
                  <Select value={form.fuel_type} onValueChange={v => set('fuel_type', v)}>
                    <SelectTrigger><SelectValue placeholder={t('workshop.newOrder.selectPlaceholder')} /></SelectTrigger>
                    <SelectContent>
                      {fuelTypes.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t('workshop.vehicles.engineNumber')}</Label>
                  <Input onFocus={e => e.currentTarget.select()} value={form.engine_number} onChange={e => set('engine_number', e.target.value)} placeholder={t('workshop.vehicles.engineNumber')} />
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.orders.brand')}</Label>
                  <Input onFocus={e => e.currentTarget.select()} value={form.brand} onChange={e => set('brand', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.orders.model')}</Label>
                  <Input onFocus={e => e.currentTarget.select()} value={form.model} onChange={e => set('model', e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t('workshop.orders.color')}</Label>
                  <Input onFocus={e => e.currentTarget.select()} value={form.color} onChange={e => set('color', e.target.value)} placeholder={t('workshop.orders.color')} />
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.orders.plateNumber')}</Label>
                  <div className="flex gap-2">
                    <Input onFocus={e => e.currentTarget.select()} value={form.plate} onChange={e => set('plate', e.target.value.toUpperCase())} className="tracking-wide flex-1" />
                    <Button size="icon" variant="outline" onClick={handleLookupPlate} disabled={lookupLoading} title={t('workshop.vehicles.lookupByPlate')}>
                      {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.orders.yearOfProduction')}</Label>
                  <Input onFocus={e => e.currentTarget.select()} type="number" value={form.year} onChange={e => set('year', e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t('workshop.orders.capacity')}</Label>
                  <div className="flex items-center gap-2">
                    <Input onFocus={e => e.currentTarget.select()} type="number" value={form.engine_capacity_cm3} onChange={e => set('engine_capacity_cm3', e.target.value)} />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">cm³</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.vehicles.enginePower')}</Label>
                  <div className="flex items-center gap-2">
                    <Input onFocus={e => e.currentTarget.select()} type="number" value={form.engine_power_kw} onChange={e => set('engine_power_kw', e.target.value)} />
                    <Badge variant="secondary">kW</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.vehicles.mileageUnit')}</Label>
                  <Select defaultValue="km">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="km">km</SelectItem>
                      <SelectItem value="mi">mi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Owner - editable */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">{t('workshop.vehicles.currentOwner')}</Label>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAddClient(true)}>
                    <Plus className="h-3 w-3" /> {t('workshop.vehicles.addNew')}
                  </Button>
                </div>
                {ownerClientId && selectedOwner ? (
                  <div className="flex items-center gap-2 p-2.5 border-2 border-primary/30 rounded-lg bg-primary/5">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium flex-1">{ownerLabel}</span>
                    <Button variant="ghost" size="sm" onClick={() => { setOwnerClientId(''); setShowOwnerList(true); }}>{t('workshop.orders.change')}</Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      onFocus={e => e.currentTarget.select()}
                      value={ownerSearch}
                      onChange={e => { setOwnerSearch(e.target.value); setShowOwnerList(true); }}
                      onClick={() => setShowOwnerList(true)}
                      placeholder={t('workshop.vehicles.searchOwnerPlaceholder')}
                    />
                    {showOwnerList && (
                      <div className="absolute z-50 w-full mt-1 border-2 border-border rounded-lg bg-background shadow-xl max-h-48 overflow-y-auto">
                        <button className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center gap-2 border-b font-medium" onClick={() => { setShowOwnerList(false); setShowAddClient(true); }}>
                          <Plus className="h-4 w-4 text-primary" /> {t('workshop.vehicles.addNewClient')}
                        </button>
                        {filteredClients.map((c: any) => (
                          <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-accent text-sm transition-colors" onClick={() => { setOwnerClientId(c.id); setShowOwnerList(false); setOwnerSearch(''); }}>
                            <div className="font-medium">
                              {c.client_type === 'company' ? c.company_name : `${c.first_name || ''} ${c.last_name || ''}`}
                            </div>
                          </button>
                        ))}
                        {filteredClients.length === 0 && <div className="px-3 py-3 text-sm text-muted-foreground text-center">{t('workshop.clients.noClients')}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t('workshop.vehicles.vehicleDescription')}</Label>
                <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder={t('workshop.vehicles.vehicleDescription')} rows={3} />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onBack}>{t('common.cancel')}</Button>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t('common.save')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Files */}
        <TabsContent value="pliki">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {t('workshop.vehicles.noFiles')}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Order history */}
        <TabsContent value="zlecenia">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button className="gap-2"><Plus className="h-4 w-4" /> {t('workshop.vehicles.newOrder')}</Button>
              <div className="flex-1" />
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input onFocus={e => e.currentTarget.select()} placeholder={t('common.search')} className="pl-9 w-[250px]" />
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('workshop.orders.colOrderNumber')}</TableHead>
                      <TableHead>{t('workshop.vehicles.colCreated')}</TableHead>
                      <TableHead>{t('workshop.vehicles.colCompleted')}</TableHead>
                      <TableHead>{t('workshop.orders.colStatus')}</TableHead>
                      <TableHead>{t('workshop.orders.colClient')}</TableHead>
                      <TableHead>{t('workshop.orders.colReceived')}</TableHead>
                      <TableHead className="text-right">{t('workshop.orders.colTotal')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicleOrders.length > 0 ? vehicleOrders.map((order: any) => (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => onOpenOrder?.(order)}
                      >
                        <TableCell className="font-medium">{order.order_number}</TableCell>
                        <TableCell>{order.created_at?.split('T')[0]}</TableCell>
                        <TableCell>{order.completed_at?.split('T')[0] || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="destructive" className="text-xs">{translateWorkshopStatus(order.status_name, t)}</Badge>
                        </TableCell>
                        <TableCell>
                          {order.client && (
                            <div className="flex items-center gap-1.5 text-sm">
                              {order.client.company_name || `${order.client.first_name || ''} ${order.client.last_name || ''}`}
                              {order.client.phone && <Phone className="h-3 w-3 text-muted-foreground" />}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={order.client_acceptance_confirmed ? 'default' : 'outline'} className="text-xs">
                            {order.client_acceptance_confirmed ? '✓' : '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {(order.items?.reduce((s: number, i: any) => s + (i.total_gross || 0), 0) || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {t('workshop.vehicles.noOrdersForVehicle')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Task history */}
        <TabsContent value="zadania">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {t('workshop.vehicles.taskHistoryEmpty')}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mileage */}
        <TabsContent value="przebiegi">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {t('workshop.vehicles.mileageHistoryEmpty')}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Repair data */}
        <TabsContent value="naprawcze">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {t('workshop.vehicles.repairDataEmpty')}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <WorkshopAddClientDialog
        open={showAddClient}
        onOpenChange={setShowAddClient}
        providerId={providerId}
        onCreated={(c) => {
          setOwnerClientId(c.id);
          setShowOwnerList(false);
        }}
      />
      <VehicleLookupCreditsModal
        open={showCreditsModal}
        onOpenChange={setShowCreditsModal}
        onPurchase={async (credits, priceNet) => {
          const ok = await purchaseCredits(credits, priceNet);
          if (ok) setShowCreditsModal(false);
        }}
      />
    </div>
  );
}
