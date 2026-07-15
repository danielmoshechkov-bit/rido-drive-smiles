import { useState, useMemo, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCreateWorkshopOrder, useWorkshopClients, useWorkshopVehicles, useCreateWorkshopOrderItem } from '@/hooks/useWorkshop';
import { WorkshopAddVehicleDialog } from './WorkshopAddVehicleDialog';
import { WorkshopAddClientDialog } from './WorkshopAddClientDialog';
import { Plus, ClipboardList, Loader2, Car, Users, Camera, X, MessageSquare, AlertCircle, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
}

interface TaskPoint { text: string; }

const PHOTO_SLOTS = [
  { key: 'front', labelKey: 'workshop.newOrder.photoFront' },
  { key: 'back', labelKey: 'workshop.newOrder.photoBack' },
  { key: 'left', labelKey: 'workshop.newOrder.photoLeft' },
  { key: 'right', labelKey: 'workshop.newOrder.photoRight' },
  { key: 'interior_front', labelKey: 'workshop.newOrder.photoInteriorFront' },
  { key: 'interior_back', labelKey: 'workshop.newOrder.photoInteriorBack' },
];

// Fuel-level values are stored in DB (fuel_level) — keep literals stable; translate only for display.
const fuelLevels = ['Rezerwa', '1/4', '1/2', '3/4', 'Pełny'];
const FUEL_LEVEL_KEYS: Record<string, string> = {
  'Rezerwa': 'workshop.newOrder.fuelReserve',
  '1/4': 'workshop.newOrder.fuelQuarter',
  '1/2': 'workshop.newOrder.fuelHalf',
  '3/4': 'workshop.newOrder.fuelThreeQuarter',
  'Pełny': 'workshop.newOrder.fuelFull',
};

const DEFAULT_CHECKLIST = {
  return_parts: false,
  registration_doc: true,
  test_drive: false,
  refill_fluids: true,
  refill_lights: true,
};

function toLocalPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0048')) digits = digits.substring(2);
  while (digits.startsWith('4848')) digits = digits.substring(2);
  if (digits.startsWith('48') && digits.length >= 11) return digits.slice(-9);
  if (digits.startsWith('0') && digits.length >= 10) return digits.slice(-9);
  return digits;
}

function toSmsPhone(raw: string): string {
  const local = toLocalPhone(raw);
  if (local.length === 9) return `+48${local}`;
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('48') ? `+${digits}` : raw;
}

// Order number is generated server-side by trigger generate_workshop_order_number
// (sequential per provider/month, fills gaps after deletes).

export function WorkshopNewOrderDialog({ open, onOpenChange, providerId }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: clients = [] } = useWorkshopClients(providerId);
  const { data: vehicles = [] } = useWorkshopVehicles(providerId);
  const createOrder = useCreateWorkshopOrder();

  const [vehicleId, setVehicleId] = useState('');
  const [clientId, setClientId] = useState('');
  const [taskPoints, setTaskPoints] = useState<TaskPoint[]>([{ text: '' }]);
  const [damageDescription, setDamageDescription] = useState('');
  const [mileage, setMileage] = useState('');
  const [fuelLevel, setFuelLevel] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [photos, setPhotos] = useState<Record<string, File | null>>({});
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showVehicleList, setShowVehicleList] = useState(false);
  const [showClientList, setShowClientList] = useState(false);
  const [showSmsConfirm, setShowSmsConfirm] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createdVehicleData, setCreatedVehicleData] = useState<any>(null);
  const [createdClientData, setCreatedClientData] = useState<any>(null);
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST);
  const [stations, setStations] = useState<any[]>([]);
  const STATION_LS_KEY = `workshop:lastStation:${providerId}`;
  const [stationId, setStationId] = useState<string>('');

  useEffect(() => {
    if (!open || !providerId) return;
    (async () => {
      const { data } = await (supabase.from('workshop_stations') as any)
        .select('id, name, color, is_active')
        .eq('provider_id', providerId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      const list = data || [];
      setStations(list);
      const last = localStorage.getItem(STATION_LS_KEY) || '';
      if (last && list.find((s: any) => s.id === last)) setStationId(last);
      else if (list.length === 1) setStationId(list[0].id);
    })();
  }, [open, providerId]);

  // SMS/Email
  const [sendMethod, setSendMethod] = useState<'sms' | 'email'>('sms');
  const [manualPhone, setManualPhone] = useState('');
  const [manualEmail, setManualEmail] = useState('');

  const vehicleDropdownRef = useRef<HTMLDivElement>(null);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (vehicleDropdownRef.current && !vehicleDropdownRef.current.contains(e.target as Node)) setShowVehicleList(false);
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) setShowClientList(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const allVehicles = useMemo(() => {
    if (createdVehicleData && !vehicles.find((v: any) => v.id === createdVehicleData.id)) {
      return [createdVehicleData, ...vehicles];
    }
    return vehicles;
  }, [vehicles, createdVehicleData]);

  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch) return allVehicles;
    const s = vehicleSearch.toLowerCase();
    return allVehicles.filter((v: any) =>
      v.brand?.toLowerCase().includes(s) || v.model?.toLowerCase().includes(s) ||
      v.plate?.toLowerCase().includes(s) || v.vin?.toLowerCase().includes(s)
    );
  }, [allVehicles, vehicleSearch]);

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients;
    const s = clientSearch.toLowerCase();
    return clients.filter((c: any) =>
      c.first_name?.toLowerCase().includes(s) || c.last_name?.toLowerCase().includes(s) ||
      c.company_name?.toLowerCase().includes(s) || c.nip?.includes(s) ||
      c.phone?.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s)
    );
  }, [clients, clientSearch]);

  const selectedVehicle = allVehicles.find((v: any) => v.id === vehicleId);
  const selectedClient = createdClientData?.id === clientId ? createdClientData : clients.find((c: any) => c.id === clientId);

  const clientLabel = selectedClient
    ? selectedClient.client_type === 'company'
      ? selectedClient.company_name
      : `${selectedClient.first_name || ''} ${selectedClient.last_name || ''}`.trim()
    : '';

  const clientPhone = selectedClient?.phone || '';
  const clientEmail = selectedClient?.email || '';

  const taskInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const addTaskPoint = () => {
    const newPoints = [...taskPoints, { text: '' }];
    setTaskPoints(newPoints);
    // Focus the new input after render
    setTimeout(() => {
      taskInputRefs.current[newPoints.length - 1]?.focus();
    }, 50);
  };
  const updateTaskPoint = (index: number, text: string) => {
    const updated = [...taskPoints]; updated[index] = { text }; setTaskPoints(updated);
  };
  const removeTaskPoint = (index: number) => {
    if (taskPoints.length <= 1) return;
    setTaskPoints(taskPoints.filter((_, i) => i !== index));
  };

  const handlePhotoChange = (key: string, file: File | null) => setPhotos(prev => ({ ...prev, [key]: file }));

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!vehicleId) errs.vehicle = t('workshop.newOrder.errorSelectVehicle');
    if (!taskPoints.some(p => p.text.trim())) errs.description = t('workshop.newOrder.errorAddTask');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const descriptionText = taskPoints.filter(p => p.text.trim()).map((p, i) => `${i + 1}. ${p.text.trim()}`).join('\n');
    const order = await createOrder.mutateAsync({
      provider_id: providerId,
      // order_number will be generated by DB trigger (sequential, fills gaps)
      vehicle_id: vehicleId || null,
      client_id: clientId || null,
      description: descriptionText || null,
      damage_description: damageDescription || null,
      mileage: mileage ? parseInt(mileage) : null,
      fuel_level: fuelLevel || null,
      internal_notes: clientNotes || null,
      status_name: 'Nowe zlecenie',
      station_id: stationId || null,
      return_parts_to_client: checklist.return_parts,
      registration_document: checklist.registration_doc,
      test_drive_consent: checklist.test_drive,
      top_up_fluids: checklist.refill_fluids,
      top_up_lights: checklist.refill_lights,
    });
    if (stationId) localStorage.setItem(STATION_LS_KEY, stationId);
    // Auto-persist owner to vehicle
    if (vehicleId && clientId) {
      try {
        await (supabase as any).from('workshop_vehicles').update({ owner_client_id: clientId }).eq('id', vehicleId);
        qc.invalidateQueries({ queryKey: ['workshop-vehicles'] });
      } catch (e) { console.error('Auto-persist owner error:', e); }
    }
    // Upload intake photos to storage
    const photoEntries = Object.entries(photos).filter(([, file]) => file !== null);
    if (photoEntries.length > 0 && order.id) {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      for (const [key, file] of photoEntries) {
        if (!file) continue;
        const ext = file.name.split('.').pop() || 'jpg';
        const storagePath = `${order.id}/${key}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('workshop-order-photos')
          .upload(storagePath, file, { upsert: true });
        if (uploadErr) {
          console.error('Photo upload error:', uploadErr);
          continue;
        }
        const slotDef = PHOTO_SLOTS.find(s => s.key === key);
        const slotLabel = slotDef ? t(slotDef.labelKey) : key;
        await (supabase as any).from('workshop_order_files').insert({
          order_id: order.id,
          file_name: `${slotLabel}.${ext}`,
          file_url: storagePath,
          file_size: file.size,
          file_type: 'intake_photo',
          expires_at: expiresAt,
        });
      }
    }
    setCreatedOrderId(order.id);
    setSendMethod(clientPhone ? 'sms' : clientEmail ? 'email' : 'sms');
    setManualPhone(''); setManualEmail('');
    setShowSmsConfirm(true);
  };

  const handleSendConfirmation = async () => {
    const phone = clientPhone || manualPhone;
    const email = clientEmail || manualEmail;

    try {
      if (clientId && (manualPhone || manualEmail)) {
        const updates: any = {};
        if (manualPhone && !clientPhone) updates.phone = manualPhone;
        if (manualEmail && !clientEmail) updates.email = manualEmail;
        if (Object.keys(updates).length > 0) {
          await (supabase as any).from('workshop_clients').update(updates).eq('id', clientId);
        }
      }

      if (sendMethod === 'sms' && phone) {
        const smsPhone = toSmsPhone(phone);
        if (!smsPhone || smsPhone === phone) {
          throw new Error(t('workshop.newOrder.invalidPhone'));
        }

        const veh = selectedVehicle;
        const vName = veh ? `${veh.brand || ''} ${veh.model || ''} ${veh.plate || ''}`.trim() : '';
        // Fetch the created order to get client_code
        let clientCode = '';
        if (createdOrderId) {
          const { data: ord } = await supabase.from('workshop_orders').select('client_code').eq('id', createdOrderId).maybeSingle();
          clientCode = ord?.client_code || '';
        }
        const clientLink = clientCode ? `${window.location.origin}/warsztat/klient/${clientCode}` : '';
        const removePl = (s: string) => {
          const m: Record<string, string> = {'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z','Ą':'A','Ć':'C','Ę':'E','Ł':'L','Ń':'N','Ó':'O','Ś':'S','Ź':'Z','Ż':'Z'};
          return s.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, c => m[c] || c);
        };
        const smsMessage = removePl(`Zlecenie serwisowe ${vName} zostalo przyjete. Szczegoly i akceptacja: ${clientLink}`);
        const { error } = await supabase.functions.invoke('workshop-send-sms', {
          body: {
            phone: smsPhone,
            message: smsMessage,
            order_id: createdOrderId,
            sms_type: 'reception',
            provider_id: providerId,
          },
        });
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ['sms-credits'] });
        toast.success(t('workshop.newOrder.smsSentTo', { phone }));
      } else if (sendMethod === 'email' && email) {
        toast.success(t('workshop.newOrder.emailSentTo', { email }));
      } else {
        toast.info(t('workshop.newOrder.noContactData'));
      }

      resetForm(); onOpenChange(false);
    } catch (e: any) {
      toast.error(t('workshop.newOrder.smsSendError', { error: e.message }));
    }
  };

  const handleSkip = () => { resetForm(); onOpenChange(false); };

  const resetForm = () => {
    setVehicleId(''); setClientId(''); setTaskPoints([{ text: '' }]);
    setDamageDescription(''); setMileage(''); setFuelLevel(''); setClientNotes('');
    setPhotos({}); setCreatedOrderId(null); setShowSmsConfirm(false); setErrors({});
    setCreatedVehicleData(null); setCreatedClientData(null);
    setManualPhone(''); setManualEmail(''); setSendMethod('sms');
    setChecklist(DEFAULT_CHECKLIST);
  };

  const resetAndClose = () => { resetForm(); onOpenChange(false); };
  const currentContact = sendMethod === 'sms' ? (clientPhone || manualPhone) : (clientEmail || manualEmail);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          {showSmsConfirm ? (
            <div className="space-y-6 py-4">
              <div className="text-center space-y-3">
                <div className="mx-auto w-16 h-16 rounded-full bg-accent flex items-center justify-center">
                  <ClipboardList className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold">{t('workshop.newOrder.orderCreated')}</h3>
                <p className="text-muted-foreground">{t('workshop.newOrder.sendConfirmationQuestion')}</p>
              </div>
              <div className="space-y-4">
                <Label className="text-sm font-semibold">{t('workshop.newOrder.sendMethod')}</Label>
                <div className="flex gap-2 justify-center">
                  <Button variant={sendMethod === 'sms' ? 'default' : 'outline'} size="sm" onClick={() => setSendMethod('sms')} className="gap-2">
                    <Phone className="h-4 w-4" /> SMS
                  </Button>
                  <Button variant={sendMethod === 'email' ? 'default' : 'outline'} size="sm" onClick={() => setSendMethod('email')} className="gap-2">
                    <Mail className="h-4 w-4" /> {t('workshop.newOrder.email')}
                  </Button>
                </div>
                {sendMethod === 'sms' && (
                  <div className="space-y-2">
                    {clientPhone ? (
                      <p className="text-sm text-center">{t('workshop.newOrder.toNumber')} <span className="font-semibold text-foreground">{clientPhone}</span></p>
                    ) : (
                      <div className="space-y-1.5 max-w-sm mx-auto">
                        <Label className="text-xs text-destructive font-medium">{t('workshop.newOrder.noPhoneEnterManually')}</Label>
                        <div className="flex gap-2">
                          <span className="flex items-center px-3 border rounded-md bg-muted text-sm">+48</span>
                          <Input value={manualPhone} onChange={e => setManualPhone(e.target.value)} placeholder={t('workshop.newOrder.phonePlaceholder')} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {sendMethod === 'email' && (
                  <div className="space-y-2">
                    {clientEmail ? (
                      <p className="text-sm text-center">{t('workshop.newOrder.toAddress')} <span className="font-semibold text-foreground">{clientEmail}</span></p>
                    ) : (
                      <div className="space-y-1.5 max-w-sm mx-auto">
                        <Label className="text-xs text-destructive font-medium">{t('workshop.newOrder.noEmailEnterManually')}</Label>
                        <Input type="email" value={manualEmail} onChange={e => setManualEmail(e.target.value)} placeholder={t('workshop.newOrder.email')} />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={handleSkip}>{t('workshop.newOrder.noSkip')}</Button>
                <Button onClick={handleSendConfirmation} className="gap-2" disabled={!currentContact}>
                  {sendMethod === 'sms' ? <MessageSquare className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                  {sendMethod === 'sms' ? t('workshop.newOrder.sendSms') : t('workshop.newOrder.sendEmail')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" /> {t('workshop.newOrder.title')}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                {/* Vehicle & Client */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Vehicle */}
                  <div className="space-y-2" ref={vehicleDropdownRef}>
                    <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('workshop.newOrder.vehicle')} <span className="text-destructive">*</span>
                    </Label>
                    {vehicleId && selectedVehicle ? (
                      <div className="relative">
                        <div className="flex items-center gap-2 p-2.5 border-2 border-primary/30 rounded-lg bg-primary/5">
                          <Car className="h-4 w-4 text-primary flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold truncate">{selectedVehicle.brand} {selectedVehicle.model}</div>
                            <div className="text-xs text-muted-foreground">{selectedVehicle.plate || t('workshop.newOrder.noPlate')} {selectedVehicle.vin ? `• VIN: ${selectedVehicle.vin}` : ''}</div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => { setShowVehicleList(v => !v); qc.invalidateQueries({ queryKey: ['workshop-vehicles'] }); }}>{t('workshop.newOrder.change')}</Button>
                        </div>
                        {showVehicleList && (
                          <div className="absolute z-50 w-full mt-1 border-2 border-border rounded-lg bg-background shadow-xl max-h-60 overflow-y-auto">
                            <button className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm flex items-center gap-2 border-b font-medium" onClick={() => { setShowVehicleList(false); setShowAddVehicle(true); }}>
                              <Plus className="h-4 w-4 text-primary" /> {t('workshop.newOrder.createNewVehicle')}
                            </button>
                            {filteredVehicles.map((v: any) => (
                              <button key={v.id} className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm transition-colors" onClick={() => {
                                setVehicleId(v.id); setCreatedVehicleData(null); setShowVehicleList(false); setVehicleSearch('');
                                setErrors(e => { const { vehicle, ...rest } = e; return rest; });
                                if (v.owner_client_id) setClientId(v.owner_client_id);
                              }}>
                                <div className="flex items-center gap-2">
                                  <Car className="h-3.5 w-3.5 text-muted-foreground" />
                                  <div>
                                    <div className="font-medium">{v.brand} {v.model}</div>
                                    <div className="text-xs text-muted-foreground">{v.plate} {v.vin || ''}</div>
                                  </div>
                                </div>
                              </button>
                            ))}
                            {filteredVehicles.length === 0 && <div className="px-3 py-3 text-sm text-muted-foreground text-center">{t('workshop.newOrder.noResults')}</div>}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="relative">
                        <Input
                          value={vehicleSearch}
                          onChange={e => { setVehicleSearch(e.target.value); setShowVehicleList(true); }}
                          onClick={() => setShowVehicleList(true)}
                          placeholder={t('workshop.newOrder.vehiclePlaceholder')}
                          className={errors.vehicle ? 'border-destructive' : ''}
                        />
                        {errors.vehicle && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {errors.vehicle}</p>}
                        {showVehicleList && (
                          <div className="absolute z-50 w-full mt-1 border-2 border-border rounded-lg bg-background shadow-xl max-h-60 overflow-y-auto">
                            <button className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm flex items-center gap-2 border-b font-medium" onClick={() => { setShowVehicleList(false); setShowAddVehicle(true); }}>
                              <Plus className="h-4 w-4 text-primary" /> {t('workshop.newOrder.createNewVehicle')}
                            </button>
                            {filteredVehicles.map((v: any) => (
                              <button key={v.id} className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm transition-colors" onClick={() => {
                                setVehicleId(v.id); setCreatedVehicleData(null); setShowVehicleList(false); setVehicleSearch('');
                                setErrors(e => { const { vehicle, ...rest } = e; return rest; });
                                if (v.owner_client_id) setClientId(v.owner_client_id);
                              }}>
                                <div className="flex items-center gap-2">
                                  <Car className="h-3.5 w-3.5 text-muted-foreground" />
                                  <div>
                                    <div className="font-medium">{v.brand} {v.model}</div>
                                    <div className="text-xs text-muted-foreground">{v.plate} {v.vin || ''}</div>
                                  </div>
                                </div>
                              </button>
                            ))}
                            {filteredVehicles.length === 0 && (
                              <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                                {t('workshop.newOrder.noResults')}
                                {vehicleSearch.trim().length >= 2 && (
                                  <button
                                    className="block w-full mt-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm"
                                    onClick={async () => {
                                      const txt = vehicleSearch.trim();
                                      // Heuristic: "MARKA MODEL REJ" or "REJ" or just "MARKA MODEL"
                                      const parts = txt.split(/\s+/);
                                      const last = parts[parts.length - 1];
                                      const looksLikePlate = /^[A-Z0-9]{4,8}$/i.test(last) && parts.length > 1;
                                      const plate = looksLikePlate ? last.toUpperCase() : (parts.length === 1 && /^[A-Z0-9]{4,8}$/i.test(last) ? last.toUpperCase() : null);
                                      const brandModel = looksLikePlate ? parts.slice(0, -1) : (plate ? [] : parts);
                                      const brand = brandModel[0] || null;
                                      const model = brandModel.slice(1).join(' ') || null;
                                      try {
                                        const { data: v, error } = await (supabase as any)
                                          .from('workshop_vehicles')
                                          .insert({ provider_id: providerId, brand, model, plate })
                                          .select()
                                          .single();
                                        if (error) throw error;
                                        setCreatedVehicleData(v);
                                        setVehicleId(v.id);
                                        setShowVehicleList(false);
                                        setVehicleSearch('');
                                        setErrors(e => { const { vehicle, ...rest } = e; return rest; });
                                        qc.invalidateQueries({ queryKey: ['workshop-vehicles'] });
                                        toast.success(t('workshop.newOrder.vehicleAddedManually'));
                                      } catch (e: any) {
                                        toast.error(t('workshop.newOrder.vehicleAddError', { error: e.message }));
                                      }
                                    }}
                                  >
                                    {t('workshop.newOrder.addAsNewVehicle', { name: vehicleSearch.trim() })}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Client */}
                  <div className="space-y-2" ref={clientDropdownRef}>
                    <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t('workshop.newOrder.client')}</Label>
                    {clientId && selectedClient ? (
                      <div className="relative">
                        <div className="flex items-center gap-2 p-2.5 border-2 border-primary/30 rounded-lg bg-primary/5">
                          <Users className="h-4 w-4 text-primary flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold truncate">{clientLabel}</div>
                            {selectedClient.phone && <div className="text-xs text-muted-foreground">{selectedClient.phone}</div>}
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => { setShowClientList(v => !v); setClientSearch(''); qc.invalidateQueries({ queryKey: ['workshop-clients'] }); }}>{t('workshop.newOrder.change')}</Button>
                        </div>
                        {showClientList && (
                          <div className="absolute z-50 w-full mt-1 border-2 border-border rounded-lg bg-background shadow-xl max-h-72 overflow-hidden flex flex-col">
                            <div className="p-2 border-b bg-muted/40">
                              <Input
                                autoFocus
                                value={clientSearch}
                                onChange={e => setClientSearch(e.target.value)}
                                placeholder={t('workshop.newOrder.clientSearchPlaceholder')}
                                className="h-9"
                              />
                            </div>
                            <div className="overflow-y-auto">
                              <button className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm flex items-center gap-2 border-b font-medium" onClick={() => { setShowClientList(false); setShowAddClient(true); }}>
                                <Plus className="h-4 w-4 text-primary" /> {t('workshop.newOrder.createNewClient')}
                              </button>
                              {filteredClients.map((c: any) => (
                                <button key={c.id} className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm transition-colors" onClick={() => { setClientId(c.id); setCreatedClientData(null); setShowClientList(false); setClientSearch(''); }}>
                                  <div className="flex items-center gap-2">
                                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                    <div className="min-w-0">
                                      <div className="font-medium truncate">{c.client_type === 'company' ? c.company_name : `${c.first_name || ''} ${c.last_name || ''}`}</div>
                                      <div className="text-xs text-muted-foreground truncate">
                                        {c.phone || ''}{c.nip ? ` · ${t('workshop.newOrder.nipLabel', { nip: c.nip })}` : ''}
                                      </div>
                                    </div>
                                  </div>
                                </button>
                              ))}
                              {filteredClients.length === 0 && <div className="px-3 py-3 text-sm text-muted-foreground text-center">{t('workshop.newOrder.noResults')}</div>}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="relative">
                        <Input
                          value={clientSearch}
                          onChange={e => { setClientSearch(e.target.value); setShowClientList(true); }}
                          onFocus={() => setShowClientList(true)}
                          placeholder={t('workshop.newOrder.clientPlaceholder')}
                        />
                        {showClientList && (
                          <div className="absolute z-50 w-full mt-1 border-2 border-border rounded-lg bg-background shadow-xl max-h-60 overflow-y-auto">
                            <button className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm flex items-center gap-2 border-b font-medium" onClick={() => { setShowClientList(false); setShowAddClient(true); }}>
                              <Plus className="h-4 w-4 text-primary" /> {t('workshop.newOrder.createNewClient')}
                            </button>
                            {filteredClients.map((c: any) => (
                              <button key={c.id} className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm transition-colors" onClick={() => { setClientId(c.id); setCreatedClientData(null); setShowClientList(false); setClientSearch(''); }}>
                                <div className="flex items-center gap-2">
                                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                  <div>
                                    <div className="font-medium">{c.client_type === 'company' ? c.company_name : `${c.first_name || ''} ${c.last_name || ''}`}</div>
                                    {c.nip && <div className="text-xs text-muted-foreground">{t('workshop.newOrder.nipLabel', { nip: c.nip })}</div>}
                                  </div>
                                </div>
                              </button>
                            ))}
                            {filteredClients.length === 0 && <div className="px-3 py-3 text-sm text-muted-foreground text-center">{t('workshop.newOrder.noResults')}</div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Mileage, Fuel, Notes */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">{t('workshop.newOrder.mileage')}</Label>
                    <div className="flex gap-1">
                      <Input type="number" value={mileage} onChange={e => setMileage(e.target.value)} placeholder="km" />
                      <span className="flex items-center px-2 text-xs text-muted-foreground border rounded-md bg-muted">km</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">{t('workshop.newOrder.fuelLevel')}</Label>
                    <Select value={fuelLevel} onValueChange={setFuelLevel}>
                      <SelectTrigger><SelectValue placeholder={t('workshop.newOrder.selectPlaceholder')} /></SelectTrigger>
                      <SelectContent>
                        {fuelLevels.map(f => <SelectItem key={f} value={f}>{t(FUEL_LEVEL_KEYS[f], { defaultValue: f })}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">{t('workshop.newOrder.clientNotes')}</Label>
                    <Input value={clientNotes} onChange={e => setClientNotes(e.target.value)} placeholder={t('workshop.newOrder.additionalNotesPlaceholder')} />
                  </div>
                </div>

                {stations.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">{t('workshop.newOrder.department')}</Label>
                    <Select value={stationId || '__none__'} onValueChange={(v) => setStationId(v === '__none__' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder={t('workshop.newOrder.selectDepartment')} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t('workshop.newOrder.noDepartment')}</SelectItem>
                        {stations.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">{t('workshop.newOrder.departmentHint')}</p>
                  </div>
                )}


                {/* Task points */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('workshop.newOrder.taskList')} <span className="text-destructive">*</span>
                  </Label>
                  <div className="space-y-2">
                    {taskPoints.map((point, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-sm font-bold text-primary min-w-[28px] text-center">{index + 1}.</span>
                        <Input
                          ref={el => { taskInputRefs.current[index] = el; }}
                          value={point.text}
                          onChange={e => { updateTaskPoint(index, e.target.value); if (errors.description) setErrors(e2 => { const { description, ...rest } = e2; return rest; }); }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTaskPoint(); } }}
                          placeholder={t('workshop.newOrder.taskPlaceholder')}
                          className={`flex-1 ${errors.description && index === 0 ? 'border-destructive' : ''}`}
                        />
                        {taskPoints.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => removeTaskPoint(index)}>
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {errors.description && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {errors.description}</p>}
                  <Button variant="outline" size="sm" onClick={addTaskPoint} className="gap-1">
                    <Plus className="h-4 w-4" /> {t('workshop.newOrder.addItem')}
                  </Button>
                </div>

                {/* Damage + photos */}
                <div className="space-y-3 border-t pt-4">
                  <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t('workshop.newOrder.vehicleDamage')}</Label>
                  <Textarea value={damageDescription} onChange={e => setDamageDescription(e.target.value)} placeholder={t('workshop.newOrder.damagePlaceholder')} rows={3} />
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('workshop.newOrder.intakePhotos')}</Label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                      {PHOTO_SLOTS.map(slot => (
                        <label key={slot.key} className="cursor-pointer group">
                          <div className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-all ${photos[slot.key] ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/30'}`}>
                            {photos[slot.key] ? (
                              <div className="relative w-full h-full">
                                <img src={URL.createObjectURL(photos[slot.key]!)} alt={t(slot.labelKey)} className="w-full h-full object-cover rounded-lg" />
                                <button className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5" onClick={(e) => { e.preventDefault(); handlePhotoChange(slot.key, null); }}>
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <Camera className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                                <span className="text-[10px] text-muted-foreground text-center leading-tight">{t(slot.labelKey)}</span>
                              </>
                            )}
                          </div>
                          <input type="file" accept="image/*" className="hidden" onChange={e => handlePhotoChange(slot.key, e.target.files?.[0] || null)} />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Checklist */}
                <div className="space-y-3 border-t pt-4">
                  <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t('workshop.newOrder.receptionProtocol')}</Label>
                  <div className="flex flex-wrap gap-x-6 gap-y-3 border rounded-md p-4">
                    {[
                      { key: 'return_parts', labelKey: 'workshop.newOrder.checkReturnParts' },
                      { key: 'registration_doc', labelKey: 'workshop.newOrder.checkRegistrationDoc' },
                      { key: 'test_drive', labelKey: 'workshop.newOrder.checkTestDrive' },
                      { key: 'refill_fluids', labelKey: 'workshop.newOrder.checkRefillFluids' },
                      { key: 'refill_lights', labelKey: 'workshop.newOrder.checkRefillLights' },
                    ].map(item => (
                      <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Switch
                          checked={(checklist as any)[item.key]}
                          onCheckedChange={v => setChecklist(prev => ({ ...prev, [item.key]: v }))}
                        />
                        {t(item.labelKey)}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Submit */}
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={resetAndClose}>{t('common.cancel')}</Button>
                  <Button onClick={handleSubmit} disabled={createOrder.isPending}>
                    {createOrder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {t('workshop.newOrder.createOrder')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <WorkshopAddVehicleDialog
        open={showAddVehicle}
        onOpenChange={setShowAddVehicle}
        providerId={providerId}
        initialPlate={vehicleSearch}
        onCreated={(v) => {
          setVehicleId(v.id);
          setCreatedVehicleData(v);
          setErrors(e => { const { vehicle, ...rest } = e; return rest; });
          if (v.owner_client_id && !clientId) setClientId(v.owner_client_id);
        }}
      />
      <WorkshopAddClientDialog
        open={showAddClient}
        onOpenChange={setShowAddClient}
        providerId={providerId}
        onCreated={(c) => { setClientId(c.id); setCreatedClientData(c); }}
      />
    </>
  );
}
