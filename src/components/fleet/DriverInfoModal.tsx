import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Save, Plus, Minus, Pencil, Check, X } from 'lucide-react';

interface DriverInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
  fleetId?: string;
  onComplete?: () => void;
}

export function DriverInfoModal({
  open,
  onOpenChange,
  driverId,
  driverName,
  fleetId,
  onComplete,
}: DriverInfoModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [driverData, setDriverData] = useState<any>(null);
  
  // Editable fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [iban, setIban] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('transfer');
  const [b2bEnabled, setB2bEnabled] = useState(false);
  const [b2bCompanyName, setB2bCompanyName] = useState('');
  const [b2bNip, setB2bNip] = useState('');
  const [b2bStreet, setB2bStreet] = useState('');
  const [b2bBuildingNo, setB2bBuildingNo] = useState('');
  const [b2bApartmentNo, setB2bApartmentNo] = useState('');
  const [b2bPostalCode, setB2bPostalCode] = useState('');
  const [b2bCity, setB2bCity] = useState('');
  
  // Vehicle & fleet assignment
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('none');
  const [selectedFleetId, setSelectedFleetId] = useState<string>('none');
  const [availableVehicles, setAvailableVehicles] = useState<any[]>([]);
  const [availableFleets, setAvailableFleets] = useState<any[]>([]);
  
  // Debt management
  const [debtAction, setDebtAction] = useState<'add' | 'payment' | null>(null);
  const [debtAmount, setDebtAmount] = useState('');
  const [debtReason, setDebtReason] = useState('');
  const [currentDebt, setCurrentDebt] = useState(0);
  const [savingDebt, setSavingDebt] = useState(false);

  // Inline edit tracking
  const [editingField, setEditingField] = useState<string | null>(null);

  useEffect(() => {
    if (open && driverId) {
      fetchDriverData();
      fetchAvailableVehicles();
      fetchAvailableFleets();
    }
  }, [open, driverId]);

  const fetchDriverData = async () => {
    setLoading(true);
    try {
      const { data: driver } = await supabase
        .from('drivers')
        .select(`
          *,
          driver_app_users(user_id, email, phone),
          driver_vehicle_assignments(
            vehicle_id,
            status,
            vehicles(id, plate, brand, model, weekly_rental_fee)
          )
        `)
        .eq('id', driverId)
        .single();

      if (driver) {
        setDriverData(driver);
        setFirstName((driver as any).first_name || '');
        setLastName((driver as any).last_name || '');
        setPhone((driver as any).phone || (driver as any).driver_app_users?.phone || '');
        setEmail((driver as any).driver_app_users?.email || '');
        setIban((driver as any).iban || '');
        setNotes((driver as any).notes || '');
        setPaymentMethod((driver as any).payment_method || 'transfer');
        setB2bEnabled((driver as any).b2b_enabled || false);
        setSelectedFleetId((driver as any).fleet_id || 'none');

        const activeAssignment = (driver as any).driver_vehicle_assignments?.find(
          (a: any) => a.status === 'active'
        );
        setSelectedVehicleId(activeAssignment?.vehicle_id || 'none');

        // Fetch B2B profile
        const appUser = (driver as any).driver_app_users;
        if (appUser?.user_id) {
          const { data: b2bProfile } = await supabase
            .from('driver_b2b_profiles')
            .select('*')
            .eq('driver_user_id', appUser.user_id)
            .maybeSingle();

          if (b2bProfile) {
            setB2bCompanyName((b2bProfile as any).company_name || '');
            setB2bNip((b2bProfile as any).nip || '');
            setB2bStreet((b2bProfile as any).street || '');
            setB2bBuildingNo((b2bProfile as any).building_number || '');
            setB2bApartmentNo((b2bProfile as any).apartment_number || '');
            setB2bPostalCode((b2bProfile as any).postal_code || '');
            setB2bCity((b2bProfile as any).city || '');
          }
        }
      }

      // Fetch current debt
      const { data: debtData } = await supabase
        .from('driver_debts')
        .select('current_balance')
        .eq('driver_id', driverId)
        .maybeSingle();

      setCurrentDebt(debtData?.current_balance || 0);
    } catch (err) {
      console.error('Error fetching driver data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableVehicles = async () => {
    const query = supabase
      .from('vehicles')
      .select('id, plate, brand, model, weekly_rental_fee')
      .order('plate');
    
    if (fleetId) {
      query.eq('fleet_id', fleetId);
    }

    const { data } = await query;
    setAvailableVehicles(data || []);
  };

  const fetchAvailableFleets = async () => {
    const { data } = await supabase
      .from('fleets')
      .select('id, name')
      .order('name');
    setAvailableFleets(data || []);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update driver record
      await supabase
        .from('drivers')
        .update({
          first_name: firstName,
          last_name: lastName,
          phone,
          iban,
          notes,
          payment_method: paymentMethod === 'b2b' ? 'b2b' : paymentMethod,
          b2b_enabled: paymentMethod === 'b2b' || b2bEnabled,
          fleet_id: selectedFleetId === 'none' ? null : selectedFleetId,
        } as any)
        .eq('id', driverId);

      // Update email in driver_app_users if changed
      const appUser = driverData?.driver_app_users;
      if (appUser?.user_id && email !== appUser.email) {
        await supabase
          .from('driver_app_users')
          .update({ email } as any)
          .eq('user_id', appUser.user_id);
      }

      // Handle vehicle assignment change
      const currentVehicleAssignment = driverData?.driver_vehicle_assignments?.find(
        (a: any) => a.status === 'active'
      );
      const currentVehicleId = currentVehicleAssignment?.vehicle_id;

      if (selectedVehicleId !== (currentVehicleId || 'none')) {
        // Deactivate current assignment
        if (currentVehicleId) {
          await supabase
            .from('driver_vehicle_assignments')
            .update({ status: 'inactive' } as any)
            .eq('driver_id', driverId)
            .eq('vehicle_id', currentVehicleId)
            .eq('status', 'active');
        }
        // Create new assignment
        if (selectedVehicleId !== 'none') {
          await supabase
            .from('driver_vehicle_assignments')
            .insert({
              driver_id: driverId,
              vehicle_id: selectedVehicleId,
              status: 'active',
            } as any);
        }
      }

      toast.success('Zapisano zmiany');
      onComplete?.();
    } catch (err) {
      console.error('Error saving:', err);
      toast.error('Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  const handleDebtAction = async () => {
    const amount = parseFloat(debtAmount.replace(',', '.'));
    if (!amount || amount <= 0) {
      toast.error('Podaj poprawną kwotę');
      return;
    }
    if (!debtReason.trim()) {
      toast.error('Podaj powód');
      return;
    }

    setSavingDebt(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      if (debtAction === 'add') {
        await supabase.rpc('increment_driver_debt', {
          p_driver_id: driverId,
          p_amount: amount,
        });

        const { data: debtData } = await supabase
          .from('driver_debts')
          .select('current_balance')
          .eq('driver_id', driverId)
          .maybeSingle();

        const newBalance = debtData?.current_balance || amount;

        await supabase.from('driver_debt_transactions').insert({
          driver_id: driverId,
          type: 'manual_add' as any,
          amount: amount,
          balance_before: newBalance - amount,
          balance_after: newBalance,
          period_from: today,
          period_to: today,
          description: debtReason,
        });

        setCurrentDebt(newBalance);
        toast.success(`Dług ${amount.toFixed(2)} zł dodany`);
      } else if (debtAction === 'payment') {
        const newBalance = Math.max(0, currentDebt - amount);
        await supabase
          .from('driver_debts')
          .update({ current_balance: newBalance, updated_at: new Date().toISOString() })
          .eq('driver_id', driverId);

        await supabase.from('driver_debt_transactions').insert({
          driver_id: driverId,
          type: 'payment' as any,
          amount: -amount,
          balance_before: currentDebt,
          balance_after: newBalance,
          period_from: today,
          period_to: today,
          description: debtReason,
        });

        setCurrentDebt(newBalance);
        toast.success(`Wpłata ${amount.toFixed(2)} zł zarejestrowana`);
      }

      setDebtAmount('');
      setDebtReason('');
      setDebtAction(null);
      onComplete?.();
    } catch (err) {
      console.error('Error managing debt:', err);
      toast.error('Błąd operacji');
    } finally {
      setSavingDebt(false);
    }
  };

  const activeVehicle = driverData?.driver_vehicle_assignments?.find(
    (a: any) => a.status === 'active'
  );
  const vehicle = activeVehicle?.vehicles;

  const EditableField = ({ label, value, onChange, fieldKey, type = 'text', placeholder = '' }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    fieldKey: string;
    type?: string;
    placeholder?: string;
  }) => (
    <div className="space-y-0.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        type={type}
        placeholder={placeholder || label}
        className="h-8 text-xs font-medium"
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-muted-foreground" />
            Edycja kierowcy
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Name fields */}
            <div className="grid grid-cols-2 gap-3">
              <EditableField label="Imię" value={firstName} onChange={setFirstName} fieldKey="first_name" />
              <EditableField label="Nazwisko" value={lastName} onChange={setLastName} fieldKey="last_name" />
            </div>

            {/* Contact info */}
            <div className="grid grid-cols-2 gap-3">
              <EditableField label="Telefon" value={phone} onChange={setPhone} fieldKey="phone" type="tel" placeholder="+48..." />
              <EditableField label="E-mail" value={email} onChange={setEmail} fieldKey="email" type="email" />
            </div>

            {/* Bank account */}
            <EditableField label="Nr konta bankowego (IBAN)" value={iban} onChange={setIban} fieldKey="iban" placeholder="00 0000 0000 0000 0000 0000 0000" />

            <div className="text-[11px] text-muted-foreground font-mono">
              ID: {driverId}
            </div>

            <Separator />

            {/* Vehicle assignment */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Przypisane auto</Label>
              <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Wybierz auto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Brak auta</SelectItem>
                  {availableVehicles.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plate} • {v.brand} {v.model} {v.weekly_rental_fee ? `(${v.weekly_rental_fee} zł/tydz.)` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fleet assignment */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Flota</Label>
              <Select value={selectedFleetId} onValueChange={setSelectedFleetId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Wybierz flotę" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Bez floty</SelectItem>
                  {availableFleets.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Payment method */}
            <div className="space-y-2">
              <Label className="text-[11px] text-muted-foreground">Sposób rozliczenia:</Label>
              <div className="flex gap-2">
                {(['cash', 'transfer', 'b2b'] as const).map(method => (
                  <button
                    key={method}
                    onClick={() => {
                      setPaymentMethod(method);
                      if (method === 'b2b') setB2bEnabled(true);
                      else setB2bEnabled(false);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      paymentMethod === method
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    {method === 'cash' && '💵 Gotówka'}
                    {method === 'transfer' && '🏦 Przelew'}
                    {method === 'b2b' && '🏢 B2B (faktury)'}
                  </button>
                ))}
              </div>
            </div>

            {/* B2B details - show when b2b selected */}
            {(paymentMethod === 'b2b' || b2bEnabled) && (
              <div className="space-y-2 p-3 rounded-md border bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground">Dane firmy</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Label className="text-xs">Nazwa firmy</Label>
                    <Input value={b2bCompanyName} onChange={e => setB2bCompanyName(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">NIP</Label>
                    <Input value={b2bNip} onChange={e => setB2bNip(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Ulica</Label>
                    <Input value={b2bStreet} onChange={e => setB2bStreet(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Nr budynku</Label>
                    <Input value={b2bBuildingNo} onChange={e => setB2bBuildingNo(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Nr lokalu</Label>
                    <Input value={b2bApartmentNo} onChange={e => setB2bApartmentNo(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Kod pocztowy</Label>
                    <Input value={b2bPostalCode} onChange={e => setB2bPostalCode(e.target.value)} placeholder="00-000" className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Miasto</Label>
                    <Input value={b2bCity} onChange={e => setB2bCity(e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
              </div>
            )}

            <Separator />

            {/* Debt section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Zadłużenie</Label>
                <Badge variant={currentDebt > 0 ? 'destructive' : 'outline'} className={currentDebt > 0 ? '' : 'bg-green-500/10 text-green-700 border-green-500/20'}>
                  {currentDebt > 0 ? `${currentDebt.toFixed(2)} zł` : '0,00 zł'}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={debtAction === 'add' ? 'default' : 'outline'}
                  onClick={() => setDebtAction(debtAction === 'add' ? null : 'add')}
                  className="text-xs h-7"
                >
                  <Plus className="h-3 w-3 mr-1" />Dodaj dług
                </Button>
                <Button
                  size="sm"
                  variant={debtAction === 'payment' ? 'default' : 'outline'}
                  onClick={() => setDebtAction(debtAction === 'payment' ? null : 'payment')}
                  className="text-xs h-7"
                >
                  <Minus className="h-3 w-3 mr-1" />Wpłata
                </Button>
              </div>
              {debtAction && (
                <div className="space-y-2 p-3 rounded-md border bg-muted/30">
                  <div>
                    <Label className="text-xs">Kwota (PLN)</Label>
                    <Input
                      value={debtAmount}
                      onChange={e => setDebtAmount(e.target.value)}
                      placeholder="np. 100"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Powód</Label>
                    <Input
                      value={debtReason}
                      onChange={e => setDebtReason(e.target.value)}
                      placeholder={debtAction === 'add' ? 'np. Naprawa, kara...' : 'np. Wpłata gotówkowa...'}
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button size="sm" onClick={handleDebtAction} disabled={savingDebt} className="text-xs h-7">
                    {savingDebt ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    {debtAction === 'add' ? 'Zapisz dług' : 'Zapisz wpłatę'}
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            {/* Notes */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Notatki</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notatki o kierowcy..."
                rows={3}
                className="text-xs"
              />
            </div>

            {/* Save button */}
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Zapisz zmiany
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
