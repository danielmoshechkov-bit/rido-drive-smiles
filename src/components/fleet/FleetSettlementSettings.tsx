import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Trash2, Settings, Edit, Info, Copy, Link } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
interface FleetFee {
  id: string;
  name: string;
  amount: number;
  vat_rate: number;
  frequency: string;
  type: string;
  is_active: boolean;
  created_at: string;
  valid_from?: string | null;
  valid_to?: string | null;
}

interface FleetSettlementSettingsProps {
  fleetId: string;
}

export const FleetSettlementSettings = ({ fleetId }: FleetSettlementSettingsProps) => {
  const [fees, setFees] = useState<FleetFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingFee, setEditingFee] = useState<FleetFee | null>(null);
  const [driverPlanSelectionEnabled, setDriverPlanSelectionEnabled] = useState(true);
  const [settlementFrequencyEnabled, setSettlementFrequencyEnabled] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [savingFrequencyToggle, setSavingFrequencyToggle] = useState(false);
  const [fleetNip, setFleetNip] = useState<string | null>(null);
  
  // Fleet-level VAT and base fee settings
  const [vatRate, setVatRate] = useState<string>('8');
  const [baseFee, setBaseFee] = useState<string>('0');
  const [invoiceEmail, setInvoiceEmail] = useState<string>('');
  const [savingSettings, setSavingSettings] = useState(false);
  
  // Payment methods settings
  const [cashEnabled, setCashEnabled] = useState(false);
  const [cashPickupDay, setCashPickupDay] = useState('wtorek');
  const [cashPickupLocation, setCashPickupLocation] = useState<'office' | 'delivery'>('office');
  const [cashAddressPostalCode, setCashAddressPostalCode] = useState('');
  const [cashAddressStreet, setCashAddressStreet] = useState('');
  const [cashAddressNumber, setCashAddressNumber] = useState('');
  const [b2bEnabled, setB2bEnabled] = useState(false);
  const [b2bInvoiceFrequency, setB2bInvoiceFrequency] = useState<'weekly' | 'monthly' | 'on_request'>('monthly');
  const [transferEnabled, setTransferEnabled] = useState(true);
  const [savingPaymentMethods, setSavingPaymentMethods] = useState(false);
  
  // Form state
  const [newFee, setNewFee] = useState<{
    name: string;
    amount: string;
    vat_rate: string;
    frequency: 'weekly' | 'monthly';
    type: 'fixed' | 'percent';
    valid_from: string;
    valid_to: string;
  }>({
    name: '',
    amount: '',
    vat_rate: '8',
    frequency: 'weekly',
    type: 'fixed',
    valid_from: '',
    valid_to: '',
  });

  useEffect(() => {
    fetchFees();
    fetchFleetSettings();
  }, [fleetId]);

  const fetchFleetSettings = async () => {
    const { data, error } = await supabase
      .from('fleets')
      .select('driver_plan_selection_enabled, settlement_frequency_enabled, nip, vat_rate, base_fee, invoice_email, cash_enabled, cash_pickup_day, cash_pickup_location, cash_address_postal_code, cash_address_street, cash_address_number, b2b_enabled, b2b_invoice_frequency, transfer_enabled')
      .eq('id', fleetId)
      .maybeSingle();

    if (!error && data) {
      setDriverPlanSelectionEnabled(data.driver_plan_selection_enabled ?? true);
      setSettlementFrequencyEnabled(data.settlement_frequency_enabled ?? false);
      setFleetNip(data.nip ?? null);
      setVatRate(((data as any).vat_rate ?? 8).toString());
      setBaseFee(((data as any).base_fee ?? 0).toString());
      setInvoiceEmail((data as any).invoice_email ?? '');
      // Payment methods
      setCashEnabled((data as any).cash_enabled ?? false);
      setCashPickupDay((data as any).cash_pickup_day ?? 'wtorek');
      setCashPickupLocation((data as any).cash_pickup_location ?? 'office');
      setCashAddressPostalCode((data as any).cash_address_postal_code ?? '');
      setCashAddressStreet((data as any).cash_address_street ?? '');
      setCashAddressNumber((data as any).cash_address_number ?? '');
      setB2bEnabled((data as any).b2b_enabled ?? false);
      setB2bInvoiceFrequency((data as any).b2b_invoice_frequency ?? 'monthly');
      setTransferEnabled((data as any).transfer_enabled ?? true);
    }
  };

  const handleSaveSettings = async () => {
    const vat = parseFloat(vatRate);
    const fee = parseFloat(baseFee);
    
    if (isNaN(vat) || vat < 0 || vat > 100) {
      toast.error('Stawka VAT musi być między 0 a 100');
      return;
    }
    if (isNaN(fee) || fee < 0) {
      toast.error('Opłata stała musi być dodatnia');
      return;
    }
    
    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from('fleets')
        .update({ vat_rate: vat, base_fee: fee, invoice_email: invoiceEmail || null } as any)
        .eq('id', fleetId);
      
      if (error) throw error;
      toast.success('Ustawienia zapisane');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Błąd zapisywania ustawień');
    } finally {
      setSavingSettings(false);
    }
  };

  const copyRegistrationLink = () => {
    if (!fleetNip) {
      toast.error('Brak NIP floty - uzupełnij dane firmy');
      return;
    }
    const link = `${window.location.origin}/driver/register?nip=${fleetNip}`;
    navigator.clipboard.writeText(link);
    toast.success('Link skopiowany do schowka');
  };

  const fetchFees = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('fleet_settlement_fees' as any)
        .select('*')
        .eq('fleet_id', fleetId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFees((data as unknown as FleetFee[]) || []);
    } catch (error) {
      console.error('Error fetching fees:', error);
      setFees([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDriverPlanSelection = async (enabled: boolean) => {
    setSavingToggle(true);
    try {
      const { error } = await supabase
        .from('fleets')
        .update({ driver_plan_selection_enabled: enabled })
        .eq('id', fleetId);

      if (error) throw error;

      setDriverPlanSelectionEnabled(enabled);
      toast.success(enabled ? 'Kierowcy mogą wybierać plan' : 'Wybór planu przez kierowców wyłączony');
    } catch (error) {
      console.error('Error updating fleet settings:', error);
      toast.error('Błąd aktualizacji ustawień');
    } finally {
      setSavingToggle(false);
    }
  };

  const handleToggleSettlementFrequency = async (enabled: boolean) => {
    setSavingFrequencyToggle(true);
    try {
      const { error } = await supabase
        .from('fleets')
        .update({ settlement_frequency_enabled: enabled })
        .eq('id', fleetId);

      if (error) throw error;

      setSettlementFrequencyEnabled(enabled);
      toast.success(enabled ? 'Częstotliwość rozliczeń włączona' : 'Częstotliwość rozliczeń wyłączona');
    } catch (error) {
      console.error('Error updating fleet settings:', error);
      toast.error('Błąd aktualizacji ustawień');
    } finally {
      setSavingFrequencyToggle(false);
    }
  };

  const handleEditFee = (fee: FleetFee) => {
    setEditingFee(fee);
    setNewFee({
      name: fee.name,
      amount: fee.amount.toString(),
      vat_rate: fee.vat_rate.toString(),
      frequency: fee.frequency as 'weekly' | 'monthly',
      type: fee.type as 'fixed' | 'percent',
      valid_from: fee.valid_from || '',
      valid_to: fee.valid_to || '',
    });
    setDialogOpen(true);
  };

  const handleAddFee = async () => {
    if (!newFee.name || !newFee.amount) {
      toast.error('Wypełnij wszystkie pola');
      return;
    }

    const vatRate = parseFloat(newFee.vat_rate);
    if (isNaN(vatRate) || vatRate < 0 || vatRate > 100) {
      toast.error('Stawka VAT musi być między 0 a 100');
      return;
    }

    setSaving(true);
    try {
      if (editingFee) {
        // Update existing fee
        const { error } = await supabase
          .from('fleet_settlement_fees' as any)
          .update({
            name: newFee.name,
            amount: parseFloat(newFee.amount),
            vat_rate: vatRate,
            frequency: newFee.frequency,
            type: newFee.type,
            valid_from: newFee.valid_from || null,
            valid_to: newFee.valid_to || null,
          })
          .eq('id', editingFee.id);

        if (error) throw error;
        toast.success('Opłata zaktualizowana');
      } else {
        // Insert new fee
        const { error } = await supabase
          .from('fleet_settlement_fees' as any)
          .insert({
            fleet_id: fleetId,
            name: newFee.name,
            amount: parseFloat(newFee.amount),
            vat_rate: vatRate,
            frequency: newFee.frequency,
            type: newFee.type,
            is_active: true,
            valid_from: newFee.valid_from || null,
            valid_to: newFee.valid_to || null,
          });

        if (error) throw error;
        toast.success('Opłata dodana');
      }

      setDialogOpen(false);
      setEditingFee(null);
      setNewFee({
        name: '',
        amount: '',
        vat_rate: '8',
        frequency: 'weekly',
        type: 'fixed',
        valid_from: '',
        valid_to: '',
      });
      fetchFees();
    } catch (error: any) {
      console.error('Error saving fee:', error);
      toast.error('Błąd podczas zapisywania opłaty');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFee = async (feeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Czy na pewno chcesz usunąć tę opłatę?')) return;

    try {
      const { error } = await supabase
        .from('fleet_settlement_fees' as any)
        .delete()
        .eq('id', feeId);

      if (error) throw error;

      toast.success('Opłata usunięta');
      fetchFees();
    } catch (error) {
      console.error('Error deleting fee:', error);
      toast.error('Błąd podczas usuwania opłaty');
    }
  };

  const toggleFeeActive = async (fee: FleetFee, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('fleet_settlement_fees' as any)
        .update({ is_active: !fee.is_active })
        .eq('id', fee.id);

      if (error) throw error;

      toast.success(fee.is_active ? 'Opłata wyłączona' : 'Opłata włączona');
      fetchFees();
    } catch (error) {
      console.error('Error toggling fee:', error);
      toast.error('Błąd podczas zmiany statusu');
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount) + ' zł';
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingFee(null);
    setNewFee({
      name: '',
      amount: '',
      vat_rate: '8',
      frequency: 'weekly',
      type: 'fixed',
      valid_from: '',
      valid_to: '',
    });
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Row 1: Registration Link + Settlement Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {/* Registration Link Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Link className="h-4 w-4" />
                Link rejestracyjny
              </CardTitle>
              <CardDescription className="text-xs">
                Kierowcy rejestrujący się przez ten link zostaną automatycznie przypisani do floty
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input 
                  readOnly 
                  value={fleetNip ? `${window.location.origin}/driver/register?nip=${fleetNip}` : 'Brak NIP - uzupełnij dane firmy'} 
                  className="font-mono text-xs"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={copyRegistrationLink}
                  disabled={!fleetNip}
                  title="Kopiuj link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                NIP floty: <span className="font-mono font-bold">{fleetNip || 'nie ustawiono'}</span>
              </p>
            </CardContent>
          </Card>

          {/* Fleet-level VAT and Base Fee Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="h-4 w-4" />
                Ustawienia rozliczeń
              </CardTitle>
              <CardDescription className="text-xs">
                Globalne ustawienia dla wszystkich kierowców
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="vat-rate" className="text-xs">VAT (%)</Label>
                  <Input
                    id="vat-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="8"
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="base-fee" className="text-xs">Opłata stała (zł)</Label>
                  <Input
                    id="base-fee"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={baseFee}
                    onChange={(e) => setBaseFee(e.target.value)}
                    className="h-8"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="invoice-email" className="text-xs">Mail do faktur (B2B)</Label>
                <Input
                  id="invoice-email"
                  type="email"
                  placeholder="faktury@firma.pl"
                  value={invoiceEmail}
                  onChange={(e) => setInvoiceEmail(e.target.value)}
                  className="h-8"
                />
                <p className="text-xs text-muted-foreground">
                  Na ten adres kierowcy B2B będą wysyłać swoje faktury
                </p>
              </div>
              <Button onClick={handleSaveSettings} disabled={savingSettings} size="sm" className="w-full">
                {savingSettings ? 'Zapisywanie...' : 'Zapisz'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Row 2: Toggles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {/* Driver Plan Selection Toggle */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">Wybór planu przez kierowców</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Gdy wyłączone, kierowcy nie mogą samodzielnie zmieniać planu rozliczeniowego.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Switch
                  checked={driverPlanSelectionEnabled}
                  onCheckedChange={handleToggleDriverPlanSelection}
                  disabled={savingToggle}
                />
              </div>
            </CardContent>
          </Card>

          {/* Settlement Frequency Toggle */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">Częstotliwość rozliczeń</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Gdy włączone, kierowcy mogą wybrać częstotliwość wypłat.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Switch
                  checked={settlementFrequencyEnabled}
                  onCheckedChange={handleToggleSettlementFrequency}
                  disabled={savingFrequencyToggle}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 3: Payment Methods for Drivers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4" />
              Metody płatności dla kierowców
            </CardTitle>
            <CardDescription className="text-xs">
              Określ jakie metody płatności są dostępne dla kierowców podczas rejestracji
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Transfer */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-lg">💳</span>
                <div>
                  <p className="font-medium text-sm">Przelew bankowy</p>
                  <p className="text-xs text-muted-foreground">Wypłaty na konto bankowe kierowcy</p>
                </div>
              </div>
              <Switch
                checked={transferEnabled}
                onCheckedChange={setTransferEnabled}
              />
            </div>

            {/* Cash */}
            <div className="space-y-3 p-3 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">💵</span>
                  <div>
                    <p className="font-medium text-sm">Gotówka</p>
                    <p className="text-xs text-muted-foreground">Odbiór gotówki przez kierowców</p>
                  </div>
                </div>
                <Switch
                  checked={cashEnabled}
                  onCheckedChange={setCashEnabled}
                />
              </div>
              
              {cashEnabled && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Dzień wypłaty</Label>
                      <Select value={cashPickupDay} onValueChange={setCashPickupDay}>
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="poniedziałek">Poniedziałek</SelectItem>
                          <SelectItem value="wtorek">Wtorek</SelectItem>
                          <SelectItem value="środa">Środa</SelectItem>
                          <SelectItem value="czwartek">Czwartek</SelectItem>
                          <SelectItem value="piątek">Piątek</SelectItem>
                          <SelectItem value="sobota">Sobota</SelectItem>
                          <SelectItem value="niedziela">Niedziela</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Lokalizacja</Label>
                      <Select 
                        value={cashPickupLocation} 
                        onValueChange={(v: 'office' | 'delivery') => setCashPickupLocation(v)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="office">W biurze</SelectItem>
                          <SelectItem value="delivery">Dodaj adres wypłaty</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {cashPickupLocation === 'delivery' && (
                    <div className="space-y-2">
                      <Label className="text-xs">Adres wypłaty</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Kod pocztowy</Label>
                          <Input
                            placeholder="00-000"
                            value={cashAddressPostalCode}
                            onChange={(e) => setCashAddressPostalCode(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <div className="space-y-1 col-span-1">
                          <Label className="text-[10px] text-muted-foreground">Ulica</Label>
                          <Input
                            placeholder="ul. Przykładowa"
                            value={cashAddressStreet}
                            onChange={(e) => setCashAddressStreet(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Nr domu</Label>
                          <Input
                            placeholder="1A"
                            value={cashAddressNumber}
                            onChange={(e) => setCashAddressNumber(e.target.value)}
                            className="h-8"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* B2B */}
            <div className="space-y-3 p-3 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">📋</span>
                  <div>
                    <p className="font-medium text-sm">B2B (faktury)</p>
                    <p className="text-xs text-muted-foreground">Kierowcy wystawiają faktury</p>
                  </div>
                </div>
                <Switch
                  checked={b2bEnabled}
                  onCheckedChange={setB2bEnabled}
                />
              </div>
              
              {b2bEnabled && (
                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-xs">Częstotliwość faktury</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <label className={`flex items-center justify-center p-2 border rounded-lg cursor-pointer transition-colors ${b2bInvoiceFrequency === 'weekly' ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}>
                      <input
                        type="radio"
                        name="b2b_frequency"
                        value="weekly"
                        checked={b2bInvoiceFrequency === 'weekly'}
                        onChange={() => setB2bInvoiceFrequency('weekly')}
                        className="sr-only"
                      />
                      <span className="text-xs text-center">Raz w tygodniu</span>
                    </label>
                    <label className={`flex items-center justify-center p-2 border rounded-lg cursor-pointer transition-colors ${b2bInvoiceFrequency === 'monthly' ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}>
                      <input
                        type="radio"
                        name="b2b_frequency"
                        value="monthly"
                        checked={b2bInvoiceFrequency === 'monthly'}
                        onChange={() => setB2bInvoiceFrequency('monthly')}
                        className="sr-only"
                      />
                      <span className="text-xs text-center">Raz w miesiącu</span>
                    </label>
                    <label className={`flex items-center justify-center p-2 border rounded-lg cursor-pointer transition-colors ${b2bInvoiceFrequency === 'on_request' ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}>
                      <input
                        type="radio"
                        name="b2b_frequency"
                        value="on_request"
                        checked={b2bInvoiceFrequency === 'on_request'}
                        onChange={() => setB2bInvoiceFrequency('on_request')}
                        className="sr-only"
                      />
                      <span className="text-xs text-center">Na zlecenie wypłaty</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <Button 
              onClick={async () => {
                setSavingPaymentMethods(true);
                try {
                  const { error } = await supabase
                    .from('fleets')
                    .update({
                      cash_enabled: cashEnabled,
                      cash_pickup_day: cashPickupDay,
                      cash_pickup_location: cashPickupLocation,
                      cash_address_postal_code: cashAddressPostalCode || null,
                      cash_address_street: cashAddressStreet || null,
                      cash_address_number: cashAddressNumber || null,
                      b2b_enabled: b2bEnabled,
                      b2b_invoice_frequency: b2bInvoiceFrequency,
                      transfer_enabled: transferEnabled
                    } as any)
                    .eq('id', fleetId);
                  
                  if (error) throw error;
                  toast.success('Metody płatności zapisane');
                } catch (error) {
                  console.error('Error saving payment methods:', error);
                  toast.error('Błąd zapisywania ustawień');
                } finally {
                  setSavingPaymentMethods(false);
                }
              }} 
              disabled={savingPaymentMethods} 
              size="sm" 
              className="w-full"
            >
              {savingPaymentMethods ? 'Zapisywanie...' : 'Zapisz metody płatności'}
            </Button>
          </CardContent>
        </Card>

      {/* Fees Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Stałe opłaty rozliczeniowe
              </CardTitle>
              <CardDescription>
                Opłaty automatycznie odejmowane od rozliczeń kierowców (np. ZUS, ubezpieczenie)
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else setDialogOpen(true); }}>
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingFee(null); setDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Dodaj opłatę
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingFee ? 'Edytuj opłatę' : 'Dodaj nową opłatę'}</DialogTitle>
                  <DialogDescription>
                    Opłata będzie automatycznie odejmowana od rozliczeń kierowców
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="fee-name">Nazwa opłaty</Label>
                    <Input
                      id="fee-name"
                      placeholder="np. Składka ZUS"
                      value={newFee.name}
                      onChange={(e) => setNewFee({ ...newFee, name: e.target.value })}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fee-type">Typ</Label>
                      <Select
                        value={newFee.type}
                        onValueChange={(v: 'fixed' | 'percent') => setNewFee({ ...newFee, type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Kwota stała (zł)</SelectItem>
                          <SelectItem value="percent">Procent (%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="fee-amount">
                        {newFee.type === 'fixed' ? 'Kwota (zł)' : 'Procent (%)'}
                      </Label>
                      <Input
                        id="fee-amount"
                        type="number"
                        step="0.01"
                        placeholder={newFee.type === 'fixed' ? '50.00' : '5'}
                        value={newFee.amount}
                        onChange={(e) => setNewFee({ ...newFee, amount: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fee-vat">Stawka VAT (%)</Label>
                      <Input
                        id="fee-vat"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="np. 8"
                        value={newFee.vat_rate}
                        onChange={(e) => setNewFee({ ...newFee, vat_rate: e.target.value })}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="fee-frequency">Cykliczność</Label>
                      <Select
                        value={newFee.frequency}
                        onValueChange={(v: 'weekly' | 'monthly') => setNewFee({ ...newFee, frequency: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Co tydzień</SelectItem>
                          <SelectItem value="monthly">Co miesiąc</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Date validity fields */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fee-valid-from">Obowiązuje od (opcjonalnie)</Label>
                      <Input
                        id="fee-valid-from"
                        type="date"
                        value={newFee.valid_from}
                        onChange={(e) => setNewFee({ ...newFee, valid_from: e.target.value })}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="fee-valid-to">Obowiązuje do (opcjonalnie)</Label>
                      <Input
                        id="fee-valid-to"
                        type="date"
                        value={newFee.valid_to}
                        onChange={(e) => setNewFee({ ...newFee, valid_to: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={handleCloseDialog}>
                    Anuluj
                  </Button>
                  <Button onClick={handleAddFee} disabled={saving}>
                    {saving ? 'Zapisywanie...' : editingFee ? 'Zapisz zmiany' : 'Dodaj opłatę'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Ładowanie...
            </div>
          ) : fees.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Brak skonfigurowanych opłat</p>
              <p className="text-sm mt-2">Dodaj opłatę, aby automatycznie odejmować ją od rozliczeń kierowców</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead className="text-right">Kwota/Procent</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead>Cykliczność</TableHead>
                  <TableHead>Ważność</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fees.map((fee) => (
                  <TableRow 
                    key={fee.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleEditFee(fee)}
                  >
                    <TableCell className="font-medium">{fee.name}</TableCell>
                    <TableCell className="text-right">
                      {fee.type === 'fixed' 
                        ? formatCurrency(fee.amount)
                        : `${fee.amount}%`
                      }
                    </TableCell>
                    <TableCell className="text-right">{fee.vat_rate}%</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {fee.frequency === 'weekly' ? 'Co tydzień' : 'Co miesiąc'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {fee.valid_from || fee.valid_to ? (
                        <span className="text-xs text-muted-foreground">
                          {fee.valid_from ? fee.valid_from : '...'} → {fee.valid_to ? fee.valid_to : '...'}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Bezterminowo</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={fee.is_active ? 'default' : 'secondary'}
                        className="cursor-pointer"
                        onClick={(e) => toggleFeeActive(fee, e)}
                      >
                        {fee.is_active ? 'Aktywna' : 'Nieaktywna'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleEditFee(fee); }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleDeleteFee(fee.id, e)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      </div>
    </TooltipProvider>
  );
};