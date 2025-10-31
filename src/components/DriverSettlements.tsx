import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { pl } from 'date-fns/locale';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PieChart, Pie, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { CsvColumnMapping, FeeFormulas, letterToIndex } from "@/lib/csvMapping";

interface Settlement {
  id: string;
  driver_id: string;
  source: string;
  period_from: string;
  period_to: string;
  amounts: any;
  created_at: string;
}

interface VisibilitySettings {
  show_uber: boolean;
  show_uber_cashless: boolean;
  show_uber_cash: boolean;
  show_bolt_gross: boolean;
  show_bolt_net: boolean;
  show_bolt_commission: boolean;
  show_bolt_cash: boolean;
  show_freenow_gross: boolean;
  show_freenow_net: boolean;
  show_freenow_commission: boolean;
  show_freenow_cash: boolean;
  show_total_cash: boolean;
  show_total_commission: boolean;
  show_tax: boolean;
  show_fuel: boolean;
  show_fuel_vat: boolean;
  show_fuel_vat_refund: boolean;
  payout_formula: string;
}

interface DriverSettlementsProps {
  driverId: string;
}

export const DriverSettlements = ({ driverId }: DriverSettlementsProps) => {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [visibilitySettings, setVisibilitySettings] = useState<VisibilitySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [feeFormulas, setFeeFormulas] = useState<FeeFormulas>({});
  const [driverPlan, setDriverPlan] = useState<any>(null);
  const [csvMapping, setCsvMapping] = useState<CsvColumnMapping | null>(null);
  const [rentalFee, setRentalFee] = useState<number>(0);
  const [additionalFees, setAdditionalFees] = useState<number>(0);

  const getWeekDates = (year: number) => {
    const weeks = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    let currentDate = new Date(year, 0, 1);

    while (currentDate.getDay() !== 1) {
      currentDate.setDate(currentDate.getDate() + 1);
      if (currentDate.getMonth() > 0) {
        currentDate = new Date(year, 0, 1);
        break;
      }
    }

    let weekNumber = 1;
    while (currentDate.getFullYear() === year) {
      const startDate = new Date(currentDate);
      const endDate = new Date(currentDate);
      endDate.setDate(endDate.getDate() + 6);

      if (endDate.getFullYear() > year) break;
      if (year === currentYear && startDate > now) break;

      const startDay = format(startDate, 'EEE', { locale: pl });
      const endDay = format(endDate, 'EEE', { locale: pl });

      weeks.push({
        number: weekNumber,
        label: `Tydzień ${weekNumber} (${format(startDate, 'd MMM', { locale: pl })} - ${format(endDate, 'd MMM', { locale: pl })} ${startDay}-${endDay})`,
        start: format(startDate, 'yyyy-MM-dd'),
        end: format(endDate, 'yyyy-MM-dd')
      });

      currentDate.setDate(currentDate.getDate() + 7);
      weekNumber++;
    }

    return weeks.reverse();
  };

  const weeks = getWeekDates(selectedYear);
  const currentWeek = weeks.find(w => w.number === selectedWeek);

  // Normalize amounts - supports both old (camelCase) and new (snake_case) formats
  // Legacy mode: old data had wrong tax calculation for Bolt
  const normalizeAmounts = (amounts: any): any => {
    if (!amounts) return {};
    
    // Detect legacy format (old camelCase without proper tax calculation)
    const isLegacyFormat = amounts.boltGross && !amounts.bolt_tax_8;
    
    let bolt_tax_8 = amounts.bolt_tax_8 ?? amounts.boltTax8 ?? 0;
    let bolt_net = amounts.bolt_net ?? amounts.boltNet ?? 0;
    let uber_tax_8 = amounts.uber_tax_8 ?? amounts.uberTax8 ?? 0;
    let uber_net = amounts.uber_net ?? amounts.uberNet ?? 0;
    let uber_base_corrected = null;
    let uber_cash_corrected = null;
    let freenow_tax_8 = amounts.freenow_tax_8 ?? amounts.freenowTax8 ?? 0;
    let freenow_net = amounts.freenow_net ?? amounts.freenowNet ?? 0;
    
    // Legacy fix: Calculate correct Bolt tax and net for old data
    if (isLegacyFormat) {
      const boltGross = amounts.boltGross ?? 0;
      const boltCash = amounts.boltCash ?? amounts.bolt_cash ?? 0;
      let uberBase = amounts.uber ?? amounts.uberBase ?? 0;
      const freenowGross = amounts.freenowGross ?? 0;
      
      // Fix for negative Uber balance (column D)
      // When uber_payout_d < 0, it means Uber owes money to the driver
      // This amount should be ADDED to the base and cash, not subtracted
      const uberPayoutD = amounts.uber_payout_d ?? amounts.uberPayoutD ?? amounts.uberCashless ?? 0;
      const uberCashF = amounts.uber_cash_f ?? amounts.uberCashF ?? amounts.uberCash ?? 0;
      
      if (uberPayoutD < 0) {
        // Subtract negative number = add positive to the base
        // Example: 1535.45 - (-7.06) = 1542.51
        uberBase = uberCashF - uberPayoutD;
        uber_base_corrected = uberBase;
        // Cash actually collected by driver should DECREASE payout → keep it negative
        uber_cash_corrected = -uberCashF;
        
        console.log('🔧 Uber negative balance fix (legacy):', {
          uberPayoutD,
          uberCashF,
          uberBase_before: amounts.uber ?? amounts.uberBase ?? 0,
          uberBase_corrected: uberBase,
          uberCash_corrected: uber_cash_corrected
        });
      }
      
      // Oblicz podatek 8% osobno dla każdej platformy od ich podstawy
      bolt_tax_8 = boltGross * 0.08;
      uber_tax_8 = uberBase * 0.08; // Now calculates from corrected base
      freenow_tax_8 = freenowGross * 0.08;
      
      // Oblicz netto dla każdej platformy
      // Old boltNet = gross - commission (gotówka NIE odjęta)
      // Correct bolt_net = old boltNet - tax - cash
      bolt_net = (amounts.boltNet ?? 0) - bolt_tax_8;
      uber_net = uberBase - uber_tax_8; // Now calculates from corrected base
      freenow_net = (amounts.freenowNet ?? 0) - freenow_tax_8;
      
      console.log('🔧 Legacy mode - calculated taxes:', {
        boltGross,
        bolt_tax_8,
        bolt_net,
        uberBase,
        uber_tax_8,
        uber_net,
        freenowGross,
        freenow_tax_8,
        freenow_net,
        tax_field_ignored: amounts.tax
      });
    }
    
    return {
      // Uber - support both formats + negative balance fix
      uber_payout_d: amounts.uber_payout_d ?? amounts.uberPayoutD ?? 0,
      uber_cash_f: amounts.uber_cash_f ?? amounts.uberCashF ?? 0,
      uber_base: uber_base_corrected ?? amounts.uber_base ?? amounts.uberBase ?? amounts.uber ?? 0,
      uber_tax_8,
      uber_net,
      uber_cash: uber_cash_corrected ?? amounts.uber_cash ?? amounts.uberCash ?? 0,
      uber_commission: amounts.uber_commission ?? amounts.uberCommission ?? 0,
      
      // Bolt - support both formats with legacy fix
      bolt_projected_d: amounts.bolt_projected_d ?? amounts.boltProjectedD ?? amounts.boltGross ?? 0,
      bolt_payout_s: amounts.bolt_payout_s ?? amounts.boltPayoutS ?? 0,
      bolt_tax_8,
      bolt_net,
      bolt_cash: amounts.bolt_cash ?? amounts.boltCash ?? 0,
      bolt_commission: amounts.bolt_commission ?? amounts.boltCommission ?? 0,
      
      // FreeNow - support both formats
      freenow_base_s: amounts.freenow_base_s ?? amounts.freenowBaseS ?? amounts.freenowGross ?? 0,
      freenow_commission_t: amounts.freenow_commission_t ?? amounts.freenowCommissionT ?? amounts.freenowCommission ?? 0,
      freenow_cash_f: amounts.freenow_cash_f ?? amounts.freenowCashF ?? amounts.freenowCash ?? 0,
      freenow_tax_8,
      freenow_net,
      
      // Shared - support both formats
      total_cash: amounts.total_cash ?? amounts.totalCash ?? 0,
      fuel: amounts.fuel ?? 0,
      fuel_vat_refund: amounts.fuel_vat_refund ?? amounts.fuelVATRefund ?? amounts.fuelVatRefund ?? 0,
    };
  };

  const loadSettlements = async () => {
    if (!driverId || !currentWeek) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .eq('driver_id', driverId)
        .gte('period_from', currentWeek.start)
        .lte('period_to', currentWeek.end)
        .order('period_from', { ascending: false })
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error loading settlements:', error);
        toast.error('Błąd podczas ładowania rozliczeń');
        return;
      }

      console.log('📊 Loaded settlements for driver:', data);
      if (data && data.length > 0) {
        console.log('💰 Amounts from first settlement:', data[0].amounts);
        console.log('📝 Raw data from first settlement:', data[0].raw);
      }

      setSettlements((data || []) as Settlement[]);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Błąd podczas ładowania rozliczeń');
    } finally {
      setLoading(false);
    }
  };

  const loadVisibilitySettings = async () => {
    const { data, error } = await supabase
      .from('settlement_visibility_settings')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle();

    if (error) {
      console.error('Error loading visibility settings:', error);
      return;
    }

    if (data) {
      setVisibilitySettings(data as VisibilitySettings);
    }
  };

  const loadFeeFormulas = async () => {
    const { data, error } = await supabase
      .from('rido_settings')
      .select('value')
      .eq('key', 'payout_fees_formulas')
      .maybeSingle();

    if (!error && data?.value) {
      setFeeFormulas(data.value as unknown as FeeFormulas);
    }
  };

  const loadCsvMapping = async () => {
    const { data, error } = await supabase
      .from('rido_settings')
      .select('value')
      .eq('key', 'csv_column_mapping')
      .maybeSingle();

    if (!error && data?.value) {
      setCsvMapping(data.value as unknown as CsvColumnMapping);
    }
  };

  const loadDriverPlan = async () => {
    if (!driverId) return;

    const { data: appUser, error: appUserError } = await supabase
      .from('driver_app_users')
      .select('settlement_plan_id')
      .eq('driver_id', driverId)
      .maybeSingle();

    if (appUserError || !appUser?.settlement_plan_id) {
      console.log('No settlement plan assigned to driver');
      return;
    }

    const { data: plan, error: planError } = await supabase
      .from('settlement_plans')
      .select('*')
      .eq('id', appUser.settlement_plan_id)
      .single();

    if (!planError && plan) {
      setDriverPlan(plan);
    }
  };

  const loadAdditionalFees = async () => {
    if (!driverId || !currentWeek) return;

    const { data, error } = await supabase
      .from('driver_additional_fees')
      .select('*')
      .eq('driver_id', driverId)
      .eq('is_active', true)
      .lte('start_date', currentWeek.end)
      .or(`end_date.is.null,end_date.gte.${currentWeek.start}`);

    if (error) {
      console.error('Error loading additional fees:', error);
      return;
    }

    if (data && data.length > 0) {
      // Filter by frequency
      const weekStart = new Date(currentWeek.start);
      const isFirstWeekOfMonth = weekStart.getDate() <= 7;

      const applicableFees = data.filter((fee: any) => {
        if (fee.frequency === 'weekly') return true;
        if (fee.frequency === 'monthly' && isFirstWeekOfMonth) return true;
        if (fee.frequency === 'once') {
          const feeStartDate = new Date(fee.start_date);
          const feeEndDate = fee.end_date ? new Date(fee.end_date) : new Date(feeStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          return weekStart >= feeStartDate && weekStart <= feeEndDate;
        }
        return false;
      });

      const totalFees = applicableFees.reduce((sum: number, fee: any) => sum + (fee.amount || 0), 0);
      setAdditionalFees(totalFees);
    } else {
      setAdditionalFees(0);
    }
  };

  const loadRentalFee = async () => {
    if (!driverId) return;

    const { data, error } = await supabase
      .from('driver_vehicle_assignments')
      .select('vehicle_id, vehicles(weekly_rental_fee)')
      .eq('driver_id', driverId)
      .eq('status', 'active')
      .maybeSingle();

    if (!error && data?.vehicles) {
      const vehicleData = data.vehicles as any;
      setRentalFee(vehicleData.weekly_rental_fee || 0);
    }
  };

  useEffect(() => {
    loadVisibilitySettings();
    loadFeeFormulas();
    loadCsvMapping();
    loadDriverPlan();
    loadRentalFee();
  }, []);

  useEffect(() => {
    loadSettlements();
    loadAdditionalFees();
  }, [driverId, selectedYear, selectedWeek]);

  // Helper: Convert 0-based index to Excel-style column letter (0→A, 25→Z, 26→AA)
  const indexToLetter = (index: number): string => {
    let letter = '';
    let num = index;
    while (num >= 0) {
      letter = String.fromCharCode((num % 26) + 65) + letter;
      num = Math.floor(num / 26) - 1;
    }
    return letter;
  };

  // Group settlements by period
  const groupedSettlements = settlements.reduce((acc, settlement) => {
    const key = `${settlement.period_from}_${settlement.period_to}`;
    if (!acc[key]) {
      acc[key] = {
        period_from: settlement.period_from,
        period_to: settlement.period_to,
        settlements: []
      };
    }
    acc[key].settlements.push(settlement);
    return acc;
  }, {} as Record<string, { period_from: string; period_to: string; settlements: Settlement[] }>);

  const periods = Object.values(groupedSettlements)
    .map(period => ({
      ...period,
      // Sort settlements within each period by updated_at (newest first)
      settlements: period.settlements.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    }))
    .sort((a, b) => 
      new Date(b.period_from).getTime() - new Date(a.period_from).getTime()
    );

  // Calculate payout using new structure with 8% tax
  const calculatePayout = (amounts: any): { payout: number; fee: number; totalTax: number; breakdown: any } => {
    if (!amounts) {
      return { payout: 0, fee: 0, totalTax: 0, breakdown: {} };
    }
    
    // Get calculated net amounts (already have 8% tax deducted)
    const uberNet = amounts.uber_net || 0;
    const boltNet = amounts.bolt_net || 0;
    const freenowNet = amounts.freenow_net || 0;
    
    // Get taxes
    const uberTax = amounts.uber_tax_8 || 0;
    const boltTax = amounts.bolt_tax_8 || 0;
    const freenowTax = amounts.freenow_tax_8 || 0;
    const totalTax = uberTax + boltTax + freenowTax;
    
    // Get other values
    const fuel = amounts.fuel || 0;
    const fuelVatRefund = amounts.fuel_vat_refund || 0;
    
    // Cash collected on platforms (always reduce payout)
    const cashTotal = Math.abs(amounts.uber_cash || 0) + Math.abs(amounts.bolt_cash || 0) + Math.abs(amounts.freenow_cash_f || 0);
    
    // Use driver plan or default to 50 PLN base fee
    const planFee = driverPlan?.base_fee ?? 50;
    const planName = driverPlan?.name ?? 'Domyślny (50+8%)';
    
    // FORMUŁA WYPŁATY (dla planu "50+8%"):
    // WYPŁATA = (UBER_NET + BOLT_NET + FREENOW_NET) - GOTÓWKA_POBRANA + ZWROT_VAT - Paliwo - 50 - Wynajem - Dodatkowe opłaty
    const payout = uberNet + boltNet + freenowNet - cashTotal + fuelVatRefund - fuel - planFee - rentalFee - additionalFees;
    
    console.log(`💰 Payout calculation (Plan: ${planName}):
      Uber Net (after 8% tax): ${uberNet.toFixed(2)} (tax: ${uberTax.toFixed(2)})
      Bolt Net (after 8% tax): ${boltNet.toFixed(2)} (tax: ${boltTax.toFixed(2)})
      FreeNow Net (after 8% tax): ${freenowNet.toFixed(2)} (tax: ${freenowTax.toFixed(2)})
      Total Tax 8%: ${totalTax.toFixed(2)}
      Cash collected (reduces payout): -${cashTotal.toFixed(2)}
      Fuel: -${fuel.toFixed(2)}
      VAT refund: +${fuelVatRefund.toFixed(2)}
      Plan fee: -${planFee.toFixed(2)}
      Rental: -${rentalFee.toFixed(2)}
      Additional fees: -${additionalFees.toFixed(2)}
      = ${payout.toFixed(2)} PLN
    `);
    
    const totalEarnings = uberNet + boltNet + freenowNet;
    
    return {
      payout,
      fee: planFee,
      totalTax,
      breakdown: {
        totalEarnings,
        rental: rentalFee,
        planFee: planFee,
        additionalFees: additionalFees,
        income: { uber: uberNet, bolt: boltNet, freenow: freenowNet },
        taxes: { uber: uberTax, bolt: boltTax, freenow: freenowTax, total: totalTax },
        deductions: { fuel, fuelVatRefund }
      }
    };
  };

  // Render visible field
  const renderField = (label: string, value: number | undefined | null, visible: boolean, colorClass: string = "text-foreground") => {
    if (!visible) return null;
    
    const safeValue = typeof value === 'number' ? value : 0;
    
    return (
      <div className="flex justify-between p-2 hover:bg-muted/50 rounded">
        <span className="text-sm text-muted-foreground">{label}:</span>
        <span className={`text-sm font-medium ${colorClass}`}>
          {safeValue.toFixed(2)} zł
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!visibilitySettings) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Ładowanie ustawień...</p>
      </div>
    );
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).sort((a, b) => b - a);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Szczegółowe rozliczenia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-4 items-center">
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={selectedWeek.toString()} onValueChange={(v) => setSelectedWeek(parseInt(v))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weeks.map(week => (
                <SelectItem key={week.number} value={week.number.toString()}>
                  {week.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-4">Ładowanie...</div>
        ) : settlements.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Brak dostępnych rozliczeń dla wybranego okresu.
          </p>
        ) : (
          <div className="space-y-6">
            {periods.map((period) => {
                const periodKey = `${period.period_from}_${period.period_to}`;
                const settlement = period.settlements[0]; // Take newest settlement
                const rawAmounts = settlement.amounts || {};
                const amounts = normalizeAmounts(rawAmounts);
                const { payout, fee, totalTax, breakdown } = calculatePayout(amounts);
                
                const platformData = [
                  { name: 'Uber', value: amounts.uber_net || 0, fill: '#000000' },
                  { name: 'Bolt', value: amounts.bolt_net || 0, fill: '#34D399' },
                  { name: 'FreeNow', value: amounts.freenow_net || 0, fill: '#FFA500' }
                ].filter(item => item.value > 0);

                return (
                  <div key={periodKey} className="border rounded-lg p-4 space-y-4">
                    <h3 className="font-semibold">
                      Okres {format(parseISO(period.period_from), 'dd.MM', { locale: pl })} - {format(parseISO(period.period_to), 'dd.MM.yyyy', { locale: pl })}
                    </h3>

                    {platformData.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <h4 className="text-sm font-medium">Zarobki według platform</h4>
                        </CardHeader>
                        <CardContent>
                          <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={platformData}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={false}
                                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                  outerRadius={60}
                                  dataKey="value"
                                >
                                  {platformData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(value: number) => `${value.toFixed(2)} zł`} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                     )}

                    {/* Compact settlement table */}
                    <div className="border rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted">
                              <th className="text-left p-2 font-medium">Kategoria</th>
                              <th className="text-right p-2 font-medium">Uber</th>
                              <th className="text-right p-2 font-medium">Bolt</th>
                              <th className="text-right p-2 font-medium">FreeNow</th>
                            </tr>
                          </thead>
                          <tbody>
                            {/* Podstawa opodatkowania */}
                            <tr className="border-t hover:bg-muted/50">
                              <td className="p-2 text-muted-foreground">Podstawa</td>
                              <td className="p-2 text-right font-medium">
                                {amounts.uber_base ? `${amounts.uber_base.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-2 text-right font-medium">
                                {amounts.bolt_projected_d ? `${amounts.bolt_projected_d.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-2 text-right font-medium">
                                {amounts.freenow_base_s ? `${amounts.freenow_base_s.toFixed(2)} zł` : '-'}
                              </td>
                            </tr>
                            
                            {/* Podatek 8% */}
                            <tr className="border-t hover:bg-muted/50">
                              <td className="p-2 text-muted-foreground">Podatek 8%</td>
                              <td className="p-2 text-right font-medium text-destructive">
                                {amounts.uber_tax_8 ? `-${amounts.uber_tax_8.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-2 text-right font-medium text-destructive">
                                {amounts.bolt_tax_8 ? `-${amounts.bolt_tax_8.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-2 text-right font-medium text-destructive">
                                {amounts.freenow_tax_8 ? `-${amounts.freenow_tax_8.toFixed(2)} zł` : '-'}
                              </td>
                            </tr>
                            
                            {/* Prowizja */}
                            <tr className="border-t hover:bg-muted/50">
                              <td className="p-2 text-muted-foreground">Prowizja</td>
                              <td className="p-2 text-right font-medium text-amber-600">
                                {amounts.uber_commission > 0 ? `-${amounts.uber_commission.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-2 text-right font-medium text-amber-600">
                                {amounts.bolt_commission > 0 ? `-${amounts.bolt_commission.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-2 text-right font-medium text-amber-600">
                                {amounts.freenow_commission_t > 0 ? `-${amounts.freenow_commission_t.toFixed(2)} zł` : '-'}
                              </td>
                            </tr>
                            
                            {/* Gotówka pobrana (informacyjnie) */}
                            <tr className="border-t hover:bg-muted/50">
                              <td className="p-2 text-muted-foreground">Gotówka pobrana</td>
                              <td className="p-2 text-right font-medium text-blue-600">
                                {amounts.uber_cash !== 0 ? `${amounts.uber_cash.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-2 text-right font-medium text-blue-600">
                                {amounts.bolt_cash !== 0 ? `${amounts.bolt_cash.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-2 text-right font-medium text-blue-600">
                                {amounts.freenow_cash_f !== 0 ? `${amounts.freenow_cash_f.toFixed(2)} zł` : '-'}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Additional rows below table */}
                      <div className="border-t bg-muted/30 p-3 space-y-2">
                        <div className="flex justify-between text-sm font-semibold">
                          <span className="text-muted-foreground">Razem podatek 8%:</span>
                          <span className="font-bold text-destructive">-{totalTax.toFixed(2)} zł</span>
                        </div>
                        
                        {((amounts.uber_cash + amounts.bolt_cash + amounts.freenow_cash_f) !== 0) && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Razem gotówka pobrana:</span>
                            <span className="font-medium text-blue-600">
                              {(amounts.uber_cash + amounts.bolt_cash + amounts.freenow_cash_f).toFixed(2)} zł
                            </span>
                          </div>
                        )}
                        
                        {amounts.fuel > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Paliwo:</span>
                            <span className="font-medium text-destructive">-{amounts.fuel.toFixed(2)} zł</span>
                          </div>
                        )}
                        
                        {amounts.fuel_vat_refund > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Zwrot VAT:</span>
                            <span className="font-medium text-green-600">+{amounts.fuel_vat_refund.toFixed(2)} zł</span>
                          </div>
                        )}
                        
                        {rentalFee > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Wynajem auta:</span>
                            <span className="font-medium text-destructive">-{rentalFee.toFixed(2)} zł</span>
                          </div>
                        )}
                        
                        {additionalFees > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Dodatkowe opłaty:</span>
                            <span className="font-medium text-destructive">-{additionalFees.toFixed(2)} zł</span>
                          </div>
                        )}
                        
                        {fee > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Opłata planu ({driverPlan?.name}):</span>
                            <span className="font-medium text-destructive">-{fee.toFixed(2)} zł</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Payout summary */}
                      <div className="border-t bg-primary/10 p-3">
                        <div className="flex justify-between">
                          <span className="font-semibold">Do wypłaty:</span>
                          <span className="font-bold text-primary text-lg">
                            {(typeof payout === 'number' ? payout : 0).toFixed(2)} zł
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};