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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Save, Plus, Minus } from 'lucide-react';

interface DriverInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
  onComplete?: () => void;
}

export function DriverInfoModal({
  open,
  onOpenChange,
  driverId,
  driverName,
  onComplete,
}: DriverInfoModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [driverData, setDriverData] = useState<any>(null);
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
  // Debt management
  const [debtAction, setDebtAction] = useState<'add' | 'payment' | null>(null);
  const [debtAmount, setDebtAmount] = useState('');
  const [debtReason, setDebtReason] = useState('');
  const [currentDebt, setCurrentDebt] = useState(0);
  const [savingDebt, setSavingDebt] = useState(false);

  useEffect(() => {
    if (open && driverId) {
      fetchDriverData();
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
            vehicles(plate, brand, model, weekly_rental_fee)
          )
        `)
        .eq('id', driverId)
        .single();

      if (driver) {
        setDriverData(driver);
        setNotes((driver as any).notes || '');
        setPaymentMethod((driver as any).payment_method || 'transfer');
        setB2bEnabled((driver as any).b2b_enabled || false);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      await supabase
        .from('drivers')
        .update({
          notes,
          payment_method: paymentMethod === 'b2b' ? 'b2b' : paymentMethod,
          b2b_enabled: paymentMethod === 'b2b' || b2bEnabled,
        } as any)
        .eq('id', driverId);

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
        // Add debt
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
        // Payment - reduce debt
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
  const appUser = driverData?.driver_app_users;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{driverName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">E-mail:</span>
                <p className="font-medium">{appUser?.email || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Telefon:</span>
                <p className="font-medium">{appUser?.phone || driverData?.phone || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">ID kierowcy:</span>
                <p className="font-mono text-xs">{driverId}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Konto bankowe:</span>
                <p className="font-medium text-xs">{driverData?.iban || '-'}</p>
              </div>
            </div>

            <Separator />

            {/* Vehicle info */}
            <div className="text-sm">
              <span className="text-muted-foreground">Auto:</span>
              {vehicle ? (
                <p className="font-medium">
                  {vehicle.brand} {vehicle.model} {vehicle.plate}
                </p>
              ) : (
                <p className="text-muted-foreground">Brak przypisanego auta</p>
              )}
              <div className="mt-1">
                <span className="text-muted-foreground">Opłata za auto:</span>
                <span className="font-semibold ml-2">{vehicle?.weekly_rental_fee?.toFixed(2) || '0.00'} zł/tydzień</span>
              </div>
            </div>

            <Separator />

            {/* Payment method */}
            <div className="space-y-2">
              <Label className="text-sm">Sposób rozliczenia:</Label>
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

            <Separator />

            {/* B2B toggle */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">B2B (faktura)</Label>
                <Switch
                  checked={b2bEnabled}
                  onCheckedChange={setB2bEnabled}
                />
              </div>

              {b2bEnabled && (
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
            </div>

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
              <Label className="text-sm">Notatki</Label>
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
