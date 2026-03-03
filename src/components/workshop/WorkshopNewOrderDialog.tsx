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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
}

interface TaskPoint { text: string; }

const PHOTO_SLOTS = [
  { key: 'front', label: 'Przód' },
  { key: 'back', label: 'Tył' },
  { key: 'left', label: 'Lewy bok' },
  { key: 'right', label: 'Prawy bok' },
  { key: 'interior_front', label: 'Wnętrze przód' },
  { key: 'interior_back', label: 'Wnętrze tył' },
];

const fuelLevels = ['Rezerwa', '1/4', '1/2', '3/4', 'Pełny'];

const DEFAULT_CHECKLIST = {
  return_parts: false,
  registration_doc: true,
  test_drive: false,
  refill_fluids: true,
  refill_lights: true,
};

function generateOrderNumber() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const rand = Math.floor(Math.random() * 900) + 100;
  return `ZL-${month}/${year}-${rand}`;
}

export function WorkshopNewOrderDialog({ open, onOpenChange, providerId }: Props) {
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
      c.company_name?.toLowerCase().includes(s) || c.nip?.includes(s)
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

  const addTaskPoint = () => setTaskPoints([...taskPoints, { text: '' }]);
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
    if (!vehicleId) errs.vehicle = 'Wybierz lub dodaj pojazd';
    if (!taskPoints.some(p => p.text.trim())) errs.description = 'Dodaj przynajmniej jedno zadanie';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const descriptionText = taskPoints.filter(p => p.text.trim()).map((p, i) => `${i + 1}. ${p.text.trim()}`).join('\n');
    const order = await createOrder.mutateAsync({
      provider_id: providerId,
      order_number: generateOrderNumber(),
      vehicle_id: vehicleId || null,
      client_id: clientId || null,
      description: descriptionText || null,
      damage_description: damageDescription || null,
      mileage: mileage ? parseInt(mileage) : null,
      fuel_level: fuelLevel || null,
      internal_notes: clientNotes || null,
      status_name: 'Przyjęcie do serwisu',
    });
    setCreatedOrderId(order.id);
    setSendMethod(clientPhone ? 'sms' : clientEmail ? 'email' : 'sms');
    setManualPhone(''); setManualEmail('');
    setShowSmsConfirm(true);
  };

  const handleSendConfirmation = async () => {
    const phone = clientPhone || manualPhone;
    const email = clientEmail || manualEmail;
    if (clientId && (manualPhone || manualEmail)) {
      const updates: any = {};
      if (manualPhone && !clientPhone) updates.phone = manualPhone;
      if (manualEmail && !clientEmail) updates.email = manualEmail;
      if (Object.keys(updates).length > 0) {
        await (supabase as any).from('workshop_clients').update(updates).eq('id', clientId);
      }
    }
    if (sendMethod === 'sms' && phone) toast.success(`SMS potwierdzenia wysłany na ${phone}`);
    else if (sendMethod === 'email' && email) toast.success(`E-mail potwierdzenia wysłany na ${email}`);
    else toast.info('Brak danych kontaktowych — pomijam wysyłkę');
    resetForm(); onOpenChange(false);
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
                <h3 className="text-xl font-bold">Zlecenie utworzone!</h3>
                <p className="text-muted-foreground">Czy chcesz wysłać potwierdzenie przyjęcia pojazdu do klienta?</p>
              </div>
              <div className="space-y-4">
                <Label className="text-sm font-semibold">Sposób wysyłki</Label>
                <div className="flex gap-2 justify-center">
                  <Button variant={sendMethod === 'sms' ? 'default' : 'outline'} size="sm" onClick={() => setSendMethod('sms')} className="gap-2">
                    <Phone className="h-4 w-4" /> SMS
                  </Button>
                  <Button variant={sendMethod === 'email' ? 'default' : 'outline'} size="sm" onClick={() => setSendMethod('email')} className="gap-2">
                    <Mail className="h-4 w-4" /> E-mail
                  </Button>
                </div>
                {sendMethod === 'sms' && (
                  <div className="space-y-2">
                    {clientPhone ? (
                      <p className="text-sm text-center">Na numer: <span className="font-semibold text-foreground">{clientPhone}</span></p>
                    ) : (
                      <div className="space-y-1.5 max-w-sm mx-auto">
                        <Label className="text-xs text-destructive font-medium">Brak numeru — wpisz ręcznie</Label>
                        <div className="flex gap-2">
                          <span className="flex items-center px-3 border rounded-md bg-muted text-sm">+48</span>
                          <Input value={manualPhone} onChange={e => setManualPhone(e.target.value)} placeholder="Numer telefonu" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {sendMethod === 'email' && (
                  <div className="space-y-2">
                    {clientEmail ? (
                      <p className="text-sm text-center">Na adres: <span className="font-semibold text-foreground">{clientEmail}</span></p>
                    ) : (
                      <div className="space-y-1.5 max-w-sm mx-auto">
                        <Label className="text-xs text-destructive font-medium">Brak e-mail — wpisz ręcznie</Label>
                        <Input type="email" value={manualEmail} onChange={e => setManualEmail(e.target.value)} placeholder="E-mail" />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={handleSkip}>Nie, pomiń</Button>
                <Button onClick={handleSendConfirmation} className="gap-2" disabled={!currentContact}>
                  {sendMethod === 'sms' ? <MessageSquare className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                  {sendMethod === 'sms' ? 'Wyślij SMS' : 'Wyślij e-mail'}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" /> Przyjęcie pojazdu
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                {/* Vehicle & Client */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Vehicle */}
                  <div className="space-y-2" ref={vehicleDropdownRef}>
                    <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Pojazd <span className="text-destructive">*</span>
                    </Label>
                    {vehicleId && selectedVehicle ? (
                      <div className="flex items-center gap-2 p-2.5 border-2 border-primary/30 rounded-lg bg-primary/5">
                        <Car className="h-4 w-4 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{selectedVehicle.brand} {selectedVehicle.model}</div>
                          <div className="text-xs text-muted-foreground">{selectedVehicle.plate || 'brak nr rej.'} {selectedVehicle.vin ? `• VIN: ${selectedVehicle.vin}` : ''}</div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => { setVehicleId(''); setShowVehicleList(true); qc.invalidateQueries({ queryKey: ['workshop-vehicles'] }); }}>Zmień</Button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Input
                          value={vehicleSearch}
                          onChange={e => { setVehicleSearch(e.target.value); setShowVehicleList(true); }}
                          onFocus={() => setShowVehicleList(true)}
                          placeholder="Pojazd (np. rejestracja, marka...)"
                          className={errors.vehicle ? 'border-destructive' : ''}
                        />
                        {errors.vehicle && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {errors.vehicle}</p>}
                        {showVehicleList && (
                          <div className="absolute z-50 w-full mt-1 border-2 border-border rounded-lg bg-background shadow-xl max-h-60 overflow-y-auto">
                            <button className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm flex items-center gap-2 border-b font-medium" onClick={() => { setShowVehicleList(false); setShowAddVehicle(true); }}>
                              <Plus className="h-4 w-4 text-primary" /> Utwórz nowy pojazd
                            </button>
                            {filteredVehicles.map((v: any) => (
                              <button key={v.id} className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm transition-colors" onClick={() => {
                                setVehicleId(v.id); setCreatedVehicleData(null); setShowVehicleList(false); setVehicleSearch('');
                                setErrors(e => { const { vehicle, ...rest } = e; return rest; });
                                if (v.owner_client_id && !clientId) setClientId(v.owner_client_id);
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
                            {filteredVehicles.length === 0 && <div className="px-3 py-3 text-sm text-muted-foreground text-center">Brak wyników</div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Client */}
                  <div className="space-y-2" ref={clientDropdownRef}>
                    <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Klient</Label>
                    {clientId && selectedClient ? (
                      <div className="flex items-center gap-2 p-2.5 border-2 border-primary/30 rounded-lg bg-primary/5">
                        <Users className="h-4 w-4 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{clientLabel}</div>
                          {selectedClient.phone && <div className="text-xs text-muted-foreground">{selectedClient.phone}</div>}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => { setClientId(''); setShowClientList(true); qc.invalidateQueries({ queryKey: ['workshop-clients'] }); }}>Zmień</Button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Input
                          value={clientSearch}
                          onChange={e => { setClientSearch(e.target.value); setShowClientList(true); }}
                          onFocus={() => setShowClientList(true)}
                          placeholder="Wyszukaj klienta..."
                        />
                        {showClientList && (
                          <div className="absolute z-50 w-full mt-1 border-2 border-border rounded-lg bg-background shadow-xl max-h-60 overflow-y-auto">
                            <button className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm flex items-center gap-2 border-b font-medium" onClick={() => { setShowClientList(false); setShowAddClient(true); }}>
                              <Plus className="h-4 w-4 text-primary" /> Utwórz nowego klienta
                            </button>
                            {filteredClients.map((c: any) => (
                              <button key={c.id} className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm transition-colors" onClick={() => { setClientId(c.id); setCreatedClientData(null); setShowClientList(false); setClientSearch(''); }}>
                                <div className="flex items-center gap-2">
                                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                  <div>
                                    <div className="font-medium">{c.client_type === 'company' ? c.company_name : `${c.first_name || ''} ${c.last_name || ''}`}</div>
                                    {c.nip && <div className="text-xs text-muted-foreground">NIP: {c.nip}</div>}
                                  </div>
                                </div>
                              </button>
                            ))}
                            {filteredClients.length === 0 && <div className="px-3 py-3 text-sm text-muted-foreground text-center">Brak wyników</div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Mileage, Fuel, Notes */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Przebieg</Label>
                    <div className="flex gap-1">
                      <Input type="number" value={mileage} onChange={e => setMileage(e.target.value)} placeholder="km" />
                      <span className="flex items-center px-2 text-xs text-muted-foreground border rounded-md bg-muted">km</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Poziom paliwa</Label>
                    <Select value={fuelLevel} onValueChange={setFuelLevel}>
                      <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                      <SelectContent>
                        {fuelLevels.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Uwagi klienta</Label>
                    <Input value={clientNotes} onChange={e => setClientNotes(e.target.value)} placeholder="Dodatkowe uwagi..." />
                  </div>
                </div>

                {/* Task points */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Lista zadań do wykonania <span className="text-destructive">*</span>
                  </Label>
                  <div className="space-y-2">
                    {taskPoints.map((point, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-sm font-bold text-primary min-w-[28px] text-center">{index + 1}.</span>
                        <Input
                          value={point.text}
                          onChange={e => { updateTaskPoint(index, e.target.value); if (errors.description) setErrors(e2 => { const { description, ...rest } = e2; return rest; }); }}
                          placeholder="Opisz co klient chce zrobić..."
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
                    <Plus className="h-4 w-4" /> Dodaj pozycję
                  </Button>
                </div>

                {/* Damage + photos */}
                <div className="space-y-3 border-t pt-4">
                  <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Uszkodzenia pojazdu</Label>
                  <Textarea value={damageDescription} onChange={e => setDamageDescription(e.target.value)} placeholder="Ogólny opis uszkodzeń pojazdu..." rows={3} />
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Zdjęcia pojazdu przy przyjęciu</Label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                      {PHOTO_SLOTS.map(slot => (
                        <label key={slot.key} className="cursor-pointer group">
                          <div className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-all ${photos[slot.key] ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/30'}`}>
                            {photos[slot.key] ? (
                              <div className="relative w-full h-full">
                                <img src={URL.createObjectURL(photos[slot.key]!)} alt={slot.label} className="w-full h-full object-cover rounded-lg" />
                                <button className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5" onClick={(e) => { e.preventDefault(); handlePhotoChange(slot.key, null); }}>
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <Camera className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                                <span className="text-[10px] text-muted-foreground text-center leading-tight">{slot.label}</span>
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
                  <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Protokół przyjęcia</Label>
                  <div className="flex flex-wrap gap-x-6 gap-y-3 border rounded-md p-4">
                    {[
                      { key: 'return_parts', label: 'Zwrot części do klienta' },
                      { key: 'registration_doc', label: 'Dowód rejestracyjny' },
                      { key: 'test_drive', label: 'Zgoda na jazdę próbną' },
                      { key: 'refill_fluids', label: 'Uzupełnić płyny eksploatacyjne' },
                      { key: 'refill_lights', label: 'Uzupełnić oświetlenie' },
                    ].map(item => (
                      <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Switch
                          checked={(checklist as any)[item.key]}
                          onCheckedChange={v => setChecklist(prev => ({ ...prev, [item.key]: v }))}
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Submit */}
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={resetAndClose}>Anuluj</Button>
                  <Button onClick={handleSubmit} disabled={createOrder.isPending}>
                    {createOrder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Utwórz zlecenie
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
