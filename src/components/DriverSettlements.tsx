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

  // Normalize amounts from camelCase (old data) to snake_case (expected by UI)
  const normalizeAmounts = (amounts: any): any => {
    if (!amounts) return {};
    return {
      uber: amounts.uber ?? amounts.Uber ?? 0,
      uber_cashless: amounts.uber_cashless ?? amounts.uberCashless ?? 0,
      uber_cash: amounts.uber_cash ?? amounts.uberCash ?? 0,
      bolt_gross: amounts.bolt_gross ?? amounts.boltGross ?? 0,
      bolt_net: amounts.bolt_net ?? amounts.boltNet ?? 0,
      bolt_commission: amounts.bolt_commission ?? amounts.boltCommission ?? 0,
      bolt_cash: amounts.bolt_cash ?? amounts.boltCash ?? 0,
      freenow_gross: amounts.freenow_gross ?? amounts.freenowGross ?? 0,
      freenow_net: amounts.freenow_net ?? amounts.freenowNet ?? 0,
      freenow_commission: amounts.freenow_commission ?? amounts.freenowCommission ?? 0,
      freenow_cash: amounts.freenow_cash ?? amounts.freenowCash ?? 0,
      total_cash: amounts.total_cash ?? amounts.totalCash ?? 0,
      total_commission: amounts.total_commission ?? amounts.totalCommission ?? 0,
      tax: amounts.tax ?? 0,
      fuel: amounts.fuel ?? 0,
      fuel_vat: amounts.fuel_vat ?? amounts.fuelVAT ?? amounts.fuelVat ?? 0,
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

  // Calculate payout using formula
  const calculatePayout = (amounts: any, rawData?: any): { payout: number; fee: number; breakdown: any } => {
    if (!amounts || !driverPlan) {
      return { payout: 0, fee: 0, breakdown: {} };
    }
    
    // Build column letter mapping from raw CSV data
    const columnLetters: Record<string, number> = {};
    
    if (rawData) {
      const colKeys = Object.keys(rawData)
        .filter(k => k.startsWith('col_'))
        .sort((a, b) => {
          const numA = parseInt(a.substring(4));
          const numB = parseInt(b.substring(4));
          return numA - numB;
        });
      
      colKeys.forEach(colKey => {
        const index = parseInt(colKey.substring(4));
        const letter = indexToLetter(index);
        const value = parseFloat(String(rawData[colKey] || '').replace(/[^\d.-]/g, '').replace(',', '.')) || 0;
        columnLetters[letter] = value;
      });
    }
    
    // Calculate based on plan type
    const H = columnLetters['H'] || 0; // Uber netto
    const K = columnLetters['K'] || 0; // Bolt netto
    const O = columnLetters['O'] || 0; // FreeNow netto
    const R = columnLetters['R'] || 0; // Gotówka
    const T = columnLetters['T'] || 0; // Podatek
    const U = columnLetters['U'] || 0; // Paliwo
    const V = columnLetters['V'] || 0; // Zwrot VAT
    
    let payout = 0;
    let planFee = driverPlan.base_fee || 0;
    
    if (driverPlan.tax_percentage !== null) {
      // Plan with tax (e.g., 50+8%)
      payout = (H + K + O) - R - T - planFee + V - U - rentalFee - additionalFees;
    } else {
      // Plan without tax (e.g., 159)
      payout = (H + K + O) - R - planFee + V - U - rentalFee - additionalFees;
    }
    
    console.log(`💰 Payout calculation:
      Income (H+K+O): ${(H+K+O).toFixed(2)}
      Cash (R): -${R.toFixed(2)}
      ${driverPlan.tax_percentage !== null ? `Tax (T): -${T.toFixed(2)}` : ''}
      Plan fee: -${planFee.toFixed(2)}
      Fuel (U): -${U.toFixed(2)}
      VAT refund (V): +${V.toFixed(2)}
      Rental: -${rentalFee.toFixed(2)}
      Additional fees: -${additionalFees.toFixed(2)}
      = ${payout.toFixed(2)} PLN
    `);
    
    const totalEarnings = H + K + O;
    
    return {
      payout,
      fee: planFee,
      breakdown: {
        totalEarnings,
        rental: rentalFee,
        planFee: planFee,
        additionalFees: additionalFees,
        income: { H, K, O },
        deductions: { R, T, U, V }
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
                const amounts = normalizeAmounts(rawAmounts); // Normalize to snake_case
                const rawData = (settlement as any).raw; // Get raw CSV data with col_X fields
                const { payout, fee, breakdown } = calculatePayout(amounts, rawData);
                
                const platformData = [
                  { name: 'Uber', value: amounts.uber || 0, fill: '#000000' },
                  { name: 'Bolt', value: amounts.bolt_gross || 0, fill: '#34D399' },
                  { name: 'FreeNow', value: amounts.freenow_gross || 0, fill: '#FFA500' }
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
                              {visibilitySettings.show_uber && <th className="text-right p-2 font-medium">Uber</th>}
                              {visibilitySettings.show_bolt_gross && <th className="text-right p-2 font-medium">Bolt</th>}
                              {visibilitySettings.show_freenow_gross && <th className="text-right p-2 font-medium">FreeNow</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {/* Brutto row */}
                            <tr className="border-t hover:bg-muted/50">
                              <td className="p-2 text-muted-foreground">Brutto</td>
                              {visibilitySettings.show_uber && (
                                <td className="p-2 text-right font-medium">
                                  {amounts.uber ? `${amounts.uber.toFixed(2)} zł` : '-'}
                                </td>
                              )}
                              {visibilitySettings.show_bolt_gross && (
                                <td className="p-2 text-right font-medium">
                                  {amounts.bolt_gross ? `${amounts.bolt_gross.toFixed(2)} zł` : '-'}
                                </td>
                              )}
                              {visibilitySettings.show_freenow_gross && (
                                <td className="p-2 text-right font-medium">
                                  {amounts.freenow_gross ? `${amounts.freenow_gross.toFixed(2)} zł` : '-'}
                                </td>
                              )}
                            </tr>
                            
                            {/* Netto row */}
                            {(visibilitySettings.show_uber_cashless || visibilitySettings.show_bolt_net || visibilitySettings.show_freenow_net) && (
                              <tr className="border-t hover:bg-muted/50">
                                <td className="p-2 text-muted-foreground">Netto</td>
                                {visibilitySettings.show_uber && (
                                  <td className="p-2 text-right font-medium">
                                    {amounts.uber_cashless ? `${amounts.uber_cashless.toFixed(2)} zł` : '-'}
                                  </td>
                                )}
                                {visibilitySettings.show_bolt_gross && (
                                  <td className="p-2 text-right font-medium">
                                    {amounts.bolt_net ? `${amounts.bolt_net.toFixed(2)} zł` : '-'}
                                  </td>
                                )}
                                {visibilitySettings.show_freenow_gross && (
                                  <td className="p-2 text-right font-medium">
                                    {amounts.freenow_net ? `${amounts.freenow_net.toFixed(2)} zł` : '-'}
                                  </td>
                                )}
                              </tr>
                            )}
                            
                            {/* Gotówka row */}
                            {(visibilitySettings.show_uber_cash || visibilitySettings.show_bolt_cash || visibilitySettings.show_freenow_cash) && (
                              <tr className="border-t hover:bg-muted/50">
                                <td className="p-2 text-muted-foreground">Gotówka</td>
                                {visibilitySettings.show_uber && (
                                  <td className="p-2 text-right font-medium">
                                    {amounts.uber_cash ? `${amounts.uber_cash.toFixed(2)} zł` : '-'}
                                  </td>
                                )}
                                {visibilitySettings.show_bolt_gross && (
                                  <td className="p-2 text-right font-medium">
                                    {amounts.bolt_cash ? `${amounts.bolt_cash.toFixed(2)} zł` : '-'}
                                  </td>
                                )}
                                {visibilitySettings.show_freenow_gross && (
                                  <td className="p-2 text-right font-medium">
                                    {amounts.freenow_cash ? `${amounts.freenow_cash.toFixed(2)} zł` : '-'}
                                  </td>
                                )}
                              </tr>
                            )}
                            
                            {/* Prowizja row */}
                            {(visibilitySettings.show_bolt_commission || visibilitySettings.show_freenow_commission || visibilitySettings.show_total_commission) && (
                              <tr className="border-t hover:bg-muted/50">
                                <td className="p-2 text-muted-foreground">Prowizja</td>
                                {visibilitySettings.show_uber && <td className="p-2 text-right">-</td>}
                                {visibilitySettings.show_bolt_gross && (
                                  <td className="p-2 text-right font-medium text-destructive">
                                    {amounts.bolt_commission ? `-${amounts.bolt_commission.toFixed(2)} zł` : '-'}
                                  </td>
                                )}
                                {visibilitySettings.show_freenow_gross && (
                                  <td className="p-2 text-right font-medium text-destructive">
                                    {amounts.freenow_commission ? `-${amounts.freenow_commission.toFixed(2)} zł` : '-'}
                                  </td>
                                )}
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Additional rows below table */}
                      <div className="border-t bg-muted/30 p-3 space-y-2">
                        {visibilitySettings.show_total_cash && amounts.total_cash > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Razem gotówka:</span>
                            <span className="font-medium">{amounts.total_cash.toFixed(2)} zł</span>
                          </div>
                        )}
                        
                        {visibilitySettings.show_tax && amounts.tax > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Podatek 8%:</span>
                            <span className="font-medium">{amounts.tax.toFixed(2)} zł</span>
                          </div>
                        )}
                        
                        {visibilitySettings.show_fuel && amounts.fuel > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Paliwo:</span>
                            <span className="font-medium text-destructive">-{amounts.fuel.toFixed(2)} zł</span>
                          </div>
                        )}
                        
                        {visibilitySettings.show_fuel_vat && amounts.fuel_vat > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">VAT z paliwa:</span>
                            <span className="font-medium">{amounts.fuel_vat.toFixed(2)} zł</span>
                          </div>
                        )}
                        
                        {visibilitySettings.show_fuel_vat_refund && amounts.fuel_vat_refund > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Zwrot VAT:</span>
                            <span className="font-medium text-green-600">{amounts.fuel_vat_refund.toFixed(2)} zł</span>
                          </div>
                        )}
                        
                        {rentalFee > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Wynajem auta:</span>
                            <span className="font-medium text-destructive">-{rentalFee.toFixed(2)} zł</span>
                          </div>
                        )}
                        
                        {fee > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Opłata ({driverPlan}):</span>
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