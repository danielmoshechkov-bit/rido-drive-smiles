import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Save, Plus, Minus, Pencil, History } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface DebtTransaction {
  id: string;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  period_from: string;
  period_to: string;
  description: string | null;
  created_at: string;
}

interface DriverInfoPopoverProps {
  driverId: string;
  driverName: string;
  fleetId?: string;
  onComplete?: () => void;
  children: React.ReactNode;
}

export function DriverInfoPopover({
  driverId,
  driverName,
  fleetId,
  onComplete,
  children,
}: DriverInfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [driverData, setDriverData] = useState<any>(null);
  
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
  
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('none');
  const [selectedFleetId, setSelectedFleetId] = useState<string>('none');
  const [availableVehicles, setAvailableVehicles] = useState<any[]>([]);
  const [availableFleets, setAvailableFleets] = useState<any[]>([]);
  
  const [debtAction, setDebtAction] = useState<'add' | 'payment' | null>(null);
  const [debtAmount, setDebtAmount] = useState('');
  const [debtReason, setDebtReason] = useState('');
  const [currentDebt, setCurrentDebt] = useState(0);
  const [savingDebt, setSavingDebt] = useState(false);
  const [debtHistory, setDebtHistory] = useState<DebtTransaction[]>([]);
  const [showDebtHistory, setShowDebtHistory] = useState(false);

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
      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select(`
          *,
          driver_app_users(user_id, phone),
          driver_vehicle_assignments(
            vehicle_id,
            status,
            vehicles(id, plate, brand, model, weekly_rental_fee)
          )
        `)
        .eq('id', driverId)
        .single();

      if (driverError) {
        console.error('Error fetching driver:', driverError);
      }

      if (driver) {
        setDriverData(driver);
        setFirstName((driver as any).first_name || '');
        setLastName((driver as any).last_name || '');
        setPhone((driver as any).phone || (driver as any).driver_app_users?.phone || '');
        setEmail((driver as any).email || '');
        setIban((driver as any).iban || '');
        setNotes((driver as any).notes || '');
        setPaymentMethod((driver as any).payment_method || 'transfer');
        setB2bEnabled((driver as any).b2b_enabled || false);
        setSelectedFleetId((driver as any).fleet_id || 'none');

        const activeAssignment = (driver as any).driver_vehicle_assignments?.find(
          (a: any) => a.status === 'active'
        );
        setSelectedVehicleId(activeAssignment?.vehicle_id || 'none');

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

      const { data: debtData } = await supabase
        .from('driver_debts')
        .select('current_balance')
        .eq('driver_id', driverId)
        .maybeSingle();

      setCurrentDebt(debtData?.current_balance || 0);

      // Fetch debt transaction history
      const { data: txData } = await supabase
        .from('driver_debt_transactions')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(50);

      setDebtHistory((txData as DebtTransaction[]) || []);
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

      const appUser = driverData?.driver_app_users;
      if (appUser?.user_id && email !== appUser.email) {
        await supabase
          .from('driver_app_users')
          .update({ email } as any)
          .eq('user_id', appUser.user_id);
      }

      const currentVehicleAssignment = driverData?.driver_vehicle_assignments?.find(
        (a: any) => a.status === 'active'
      );
      const currentVehicleId = currentVehicleAssignment?.vehicle_id;

      if (selectedVehicleId !== (currentVehicleId || 'none')) {
        if (currentVehicleId) {
          await supabase
            .from('driver_vehicle_assignments')
            .update({ status: 'inactive' } as any)
            .eq('driver_id', driverId)
            .eq('vehicle_id', currentVehicleId)
            .eq('status', 'active');
        }
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
          debt_category: 'settlement',
        } as any);

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
          debt_category: 'settlement',
        } as any);

        setCurrentDebt(newBalance);
        toast.success(`Wpłata ${amount.toFixed(2)} zł zarejestrowana`);
      }

      setDebtAmount('');
      setDebtReason('');
      setDebtAction(null);
      // Refresh debt history
      const { data: txData } = await supabase
        .from('driver_debt_transactions')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(50);
      setDebtHistory((txData as DebtTransaction[]) || []);
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent 
        side="right" 
        align="start" 
        className="w-[380px] max-h-[80vh] overflow-y-auto p-4 z-50"
        sideOffset={8}
      >
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Header with name */}
            <div className="flex items-center gap-2 pb-1">
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold">{firstName} {lastName}</span>
            </div>

            {/* Name fields */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">Imię</Label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} className="h-7 text-xs" />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">Nazwisko</Label>
                <Input value={lastName} onChange={e => setLastName(e.target.value)} className="h-7 text-xs" />
              </div>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">Telefon</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} type="tel" placeholder="+48..." className="h-7 text-xs" />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">E-mail</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} type="email" className="h-7 text-xs" />
              </div>
            </div>

            {/* IBAN */}
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">Nr konta bankowego (IBAN)</Label>
              <Input value={iban} onChange={e => setIban(e.target.value)} placeholder="00 0000 0000 0000 0000 0000 0000" className="h-7 text-xs" />
            </div>

            <div className="text-[10px] text-muted-foreground font-mono">ID: {driverId}</div>

            <Separator />

            {/* Vehicle */}
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">Przypisane auto</Label>
              <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                <SelectTrigger className="h-7 text-xs">
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

            {/* Fleet */}
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">Flota</Label>
              <Select value={selectedFleetId} onValueChange={setSelectedFleetId}>
                <SelectTrigger className="h-7 text-xs">
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
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Sposób rozliczenia:</Label>
              <div className="flex gap-1.5">
                {(['cash', 'transfer', 'b2b'] as const).map(method => (
                  <button
                    key={method}
                    onClick={() => {
                      setPaymentMethod(method);
                      setB2bEnabled(method === 'b2b');
                    }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                      paymentMethod === method
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    {method === 'cash' && '💵 Gotówka'}
                    {method === 'transfer' && '🏦 Przelew'}
                    {method === 'b2b' && '🏢 B2B'}
                  </button>
                ))}
              </div>
            </div>

            {/* B2B details */}
            {(paymentMethod === 'b2b') && (
              <div className="space-y-2 p-2 rounded-md border bg-muted/30">
                <p className="text-[10px] font-medium text-muted-foreground">Dane firmy</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="col-span-2">
                    <Input value={b2bCompanyName} onChange={e => setB2bCompanyName(e.target.value)} placeholder="Nazwa firmy" className="h-7 text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Input value={b2bNip} onChange={e => setB2bNip(e.target.value)} placeholder="NIP" className="h-7 text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Input value={b2bStreet} onChange={e => setB2bStreet(e.target.value)} placeholder="Ulica" className="h-7 text-xs" />
                  </div>
                  <Input value={b2bBuildingNo} onChange={e => setB2bBuildingNo(e.target.value)} placeholder="Nr bud." className="h-7 text-xs" />
                  <Input value={b2bApartmentNo} onChange={e => setB2bApartmentNo(e.target.value)} placeholder="Nr lok." className="h-7 text-xs" />
                  <Input value={b2bPostalCode} onChange={e => setB2bPostalCode(e.target.value)} placeholder="00-000" className="h-7 text-xs" />
                  <Input value={b2bCity} onChange={e => setB2bCity(e.target.value)} placeholder="Miasto" className="h-7 text-xs" />
                </div>
              </div>
            )}

            <Separator />

            {/* Debt */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Zadłużenie</Label>
                <Badge variant={currentDebt > 0 ? 'destructive' : 'outline'} className={`text-[10px] ${currentDebt > 0 ? '' : 'bg-green-500/10 text-green-700 border-green-500/20'}`}>
                  {currentDebt > 0 ? `${currentDebt.toFixed(2)} zł` : '0,00 zł'}
                </Badge>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant={debtAction === 'add' ? 'default' : 'outline'}
                  onClick={() => setDebtAction(debtAction === 'add' ? null : 'add')}
                  className="text-[10px] h-6 px-2"
                >
                  <Plus className="h-3 w-3 mr-0.5" />Dodaj dług
                </Button>
                <Button
                  size="sm"
                  variant={debtAction === 'payment' ? 'default' : 'outline'}
                  onClick={() => setDebtAction(debtAction === 'payment' ? null : 'payment')}
                  className="text-[10px] h-6 px-2"
                >
                  <Minus className="h-3 w-3 mr-0.5" />Wpłata
                </Button>
              </div>
              {debtAction && (
                <div className="space-y-1.5 p-2 rounded-md border bg-muted/30">
                  <Input
                    value={debtAmount}
                    onChange={e => setDebtAmount(e.target.value)}
                    placeholder="Kwota PLN"
                    className="h-7 text-xs"
                  />
                  <Input
                    value={debtReason}
                    onChange={e => setDebtReason(e.target.value)}
                    placeholder={debtAction === 'add' ? 'Powód...' : 'Opis wpłaty...'}
                    className="h-7 text-xs"
                  />
                  <Button size="sm" onClick={handleDebtAction} disabled={savingDebt} className="text-[10px] h-6 px-2">
                    {savingDebt ? <Loader2 className="h-3 w-3 animate-spin mr-0.5" /> : null}
                    {debtAction === 'add' ? 'Zapisz dług' : 'Zapisz wpłatę'}
                  </Button>
                </div>
              )}

              {/* Debt History Toggle */}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDebtHistory(!showDebtHistory)}
                className="text-[10px] h-6 px-2 w-full justify-start text-muted-foreground"
              >
                <History className="h-3 w-3 mr-1" />
                {showDebtHistory ? 'Ukryj historię' : 'Historia zadłużenia'}
                {debtHistory.length > 0 && <Badge variant="secondary" className="ml-auto text-[9px] h-4 px-1">{debtHistory.length}</Badge>}
              </Button>

              {showDebtHistory && (
                <div className="max-h-40 overflow-y-auto space-y-0.5 border rounded-md p-1.5 bg-muted/20">
                  {debtHistory.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground text-center py-2">Brak historii</p>
                  ) : debtHistory.map(tx => {
                    const typeLabel = tx.type === 'debt_increase' ? '📈 Dług' 
                      : tx.type === 'debt_payment' ? '💰 Spłata' 
                      : tx.type === 'payment' ? '💵 Wpłata'
                      : tx.type === 'manual_add' ? '✏️ Dodanie'
                      : tx.type;
                    const isNegative = tx.amount < 0;
                    const periodLabel = tx.period_from === tx.period_to 
                      ? format(new Date(tx.period_from + 'T12:00:00'), 'dd.MM.yy')
                      : `${format(new Date(tx.period_from + 'T12:00:00'), 'dd.MM', { locale: pl })}-${format(new Date(tx.period_to + 'T12:00:00'), 'dd.MM.yy', { locale: pl })}`;
                    return (
                      <div key={tx.id} className="flex items-center gap-1 text-[10px] py-0.5 border-b last:border-b-0 border-border/50">
                        <span className="shrink-0">{typeLabel}</span>
                        <span className="text-muted-foreground shrink-0">{periodLabel}</span>
                        <span className="ml-auto shrink-0 font-mono">
                          <span className={isNegative ? 'text-green-600' : 'text-red-600'}>
                            {isNegative ? '' : '+'}{Math.abs(tx.amount).toFixed(2)} zł
                          </span>
                        </span>
                        <span className="shrink-0 text-muted-foreground">→ {tx.balance_after.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Separator />

            {/* Notes */}
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">Notatki</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notatki o kierowcy..."
                rows={2}
                className="text-xs resize-none"
              />
            </div>

            {/* Save */}
            <Button onClick={handleSave} disabled={saving} className="w-full h-7 text-xs">
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
              Zapisz zmiany
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Keep backward-compatible export
export function DriverInfoModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
  fleetId?: string;
  onComplete?: () => void;
}) {
  // Redirect to popover - this is kept for backward compatibility
  return null;
}
