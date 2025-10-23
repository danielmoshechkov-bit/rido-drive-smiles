import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
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
  const [driverPlan, setDriverPlan] = useState<string>('39+8');
  const [csvMapping, setCsvMapping] = useState<CsvColumnMapping | null>(null);
  const [rentalFee, setRentalFee] = useState<number>(0);

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
        .order('period_from', { ascending: false });

      if (error) {
        console.error('Error loading settlements:', error);
        toast.error('Błąd podczas ładowania rozliczeń');
        return;
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

    const { data, error } = await supabase
      .from('driver_app_users')
      .select('plan_type')
      .eq('driver_id', driverId)
      .maybeSingle();

    if (!error && data?.plan_type) {
      setDriverPlan(data.plan_type);
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
  }, [driverId, selectedYear, selectedWeek]);

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

  const periods = Object.values(groupedSettlements).sort((a, b) => 
    new Date(b.period_from).getTime() - new Date(a.period_from).getTime()
  );

  // Calculate payout using formula
  const calculatePayout = (amounts: any): { payout: number; fee: number; breakdown: any } => {
    if (!visibilitySettings?.payout_formula || !amounts) {
      return { payout: 0, fee: 0, breakdown: {} };
    }
    
    let formula = visibilitySettings.payout_formula;
    
    // Calculate total earnings for fee calculation
    const totalEarnings = (amounts.uber || 0) + (amounts.bolt_gross || 0) + (amounts.freenow_gross || 0);
    
    // Calculate fee based on driver's plan
    let fee = 0;
    if (feeFormulas[driverPlan]) {
      let feeFormula = feeFormulas[driverPlan];
      
      // Replace variables in fee formula with word boundaries
      feeFormula = feeFormula.replace(/\btotalEarnings\b/g, totalEarnings.toString());
      feeFormula = feeFormula.replace(/\buber\b/g, (amounts.uber || 0).toString());
      feeFormula = feeFormula.replace(/\bbolt\b/g, (amounts.bolt_gross || 0).toString());
      feeFormula = feeFormula.replace(/\bfreenow\b/g, (amounts.freenow_gross || 0).toString());
      
      // Replace column letters with values if csvMapping is available (only standalone letters)
      if (csvMapping) {
        Object.entries(csvMapping.amounts).forEach(([key, letter]) => {
          if (letter) {
            const regex = new RegExp(`\\b${letter}\\b`, 'g');
            feeFormula = feeFormula.replace(regex, (amounts[key] || 0).toString());
          }
        });
      }
      
      try {
        fee = new Function(`return ${feeFormula}`)();
      } catch {
        console.error('Error evaluating fee formula:', feeFormula);
        fee = 0;
      }
    }
    
    // Replace column letters with amounts values (only standalone letters, not within words)
    if (csvMapping) {
      Object.entries(csvMapping.amounts).forEach(([key, letter]) => {
        if (letter) {
          // Use word boundaries to match only standalone letters
          const regex = new RegExp(`\\b${letter}\\b`, 'g');
          formula = formula.replace(regex, (amounts[key] || 0).toString());
        }
      });
    }
    
    // Replace named variables with actual values
    const replacements: Record<string, number> = {
      uberCashless: amounts.uber_cashless || 0,
      uber: amounts.uber || 0,
      uberCash: amounts.uber_cash || 0,
      boltNet: amounts.bolt_net || 0,
      boltGross: amounts.bolt_gross || 0,
      boltCash: amounts.bolt_cash || 0,
      freenowNet: amounts.freenow_net || 0,
      freenowGross: amounts.freenow_gross || 0,
      freenowCash: amounts.freenow_cash || 0,
      fuel: amounts.fuel || 0,
      fuelVATRefund: amounts.fuel_vat_refund || 0,
      totalCash: amounts.total_cash || 0,
      totalCommission: amounts.total_commission || 0,
      tax: amounts.tax || 0,
      rental: rentalFee,
      fee: fee
    };
    
    Object.entries(replacements).forEach(([key, value]) => {
      // Use word boundaries to match whole words only
      formula = formula.replace(new RegExp(`\\b${key}\\b`, 'g'), value.toString());
    });
    
    let payout = 0;
    try {
      // Use Function constructor for safe evaluation (simple math only)
      payout = new Function(`return ${formula}`)();
    } catch {
      console.error('Error evaluating formula:', formula);
      payout = 0;
    }
    
    return {
      payout,
      fee,
      breakdown: {
        totalEarnings,
        rental: rentalFee,
        feeBase: driverPlan.includes('+') ? parseFloat(driverPlan.split('+')[0]) : fee,
        feePercent: driverPlan.includes('+') ? fee - parseFloat(driverPlan.split('+')[0]) : 0
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

        {loading && (
          <div className="text-center py-4">Ładowanie...</div>
        )}
          {!loading && settlements.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Brak dostępnych rozliczeń dla wybranego okresu.
            </p>
          ) : (
            <div className="space-y-6">
              {periods.map((period) => {
                const periodKey = `${period.period_from}_${period.period_to}`;
                const settlement = period.settlements[0];
                const amounts = settlement.amounts || {};
                const { payout, fee, breakdown } = calculatePayout(amounts);
                
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

                    <div className="space-y-2">
                      {renderField('Uber', amounts.uber, visibilitySettings.show_uber)}
                      {renderField('Uber bezgotówka', amounts.uber_cashless, visibilitySettings.show_uber_cashless)}
                      {renderField('Uber gotówka', amounts.uber_cash, visibilitySettings.show_uber_cash)}
                      {renderField('Bolt brutto', amounts.bolt_gross, visibilitySettings.show_bolt_gross)}
                      {renderField('Bolt netto', amounts.bolt_net, visibilitySettings.show_bolt_net)}
                      {renderField('Bolt prowizja', amounts.bolt_commission, visibilitySettings.show_bolt_commission, 'text-destructive')}
                      {renderField('Bolt gotówka', amounts.bolt_cash, visibilitySettings.show_bolt_cash)}
                      {renderField('FreeNow brutto', amounts.freenow_gross, visibilitySettings.show_freenow_gross)}
                      {renderField('FreeNow netto', amounts.freenow_net, visibilitySettings.show_freenow_net)}
                      {renderField('FreeNow prowizja', amounts.freenow_commission, visibilitySettings.show_freenow_commission, 'text-destructive')}
                      {renderField('FreeNow gotówka', amounts.freenow_cash, visibilitySettings.show_freenow_cash)}
                      {renderField('Razem gotówka', amounts.total_cash, visibilitySettings.show_total_cash)}
                      {renderField('Razem prowizja', amounts.total_commission, visibilitySettings.show_total_commission, 'text-destructive')}
                      {renderField('Podatek 8%/49', amounts.tax, visibilitySettings.show_tax)}
                      {renderField('Paliwo', amounts.fuel, visibilitySettings.show_fuel, 'text-destructive')}
                      {renderField('VAT z paliwa', amounts.fuel_vat, visibilitySettings.show_fuel_vat)}
                      {renderField('Zwrot VAT', amounts.fuel_vat_refund, visibilitySettings.show_fuel_vat_refund, 'text-green-600')}
                      
                      {rentalFee > 0 && (
                        <div className="flex justify-between p-2 hover:bg-muted/50 rounded">
                          <span className="text-sm text-muted-foreground">Wynajem auta:</span>
                          <span className="text-sm font-medium text-destructive">
                            -{rentalFee.toFixed(2)} zł
                          </span>
                        </div>
                      )}
                      
                      {fee > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between p-2 hover:bg-muted/50 rounded">
                            <span className="text-sm text-muted-foreground">Opłata ({driverPlan}):</span>
                            <span className="text-sm font-medium text-destructive">
                              -{fee.toFixed(2)} zł
                            </span>
                          </div>
                          {breakdown.feeBase > 0 && breakdown.feePercent > 0 && (
                            <div className="text-xs text-muted-foreground ml-4 space-y-0.5">
                              <div>• Stała: {breakdown.feeBase.toFixed(2)} zł</div>
                              <div>• Prowizja: {breakdown.feePercent.toFixed(2)} zł</div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="pt-4 border-t mt-4">
                        <div className="flex justify-between p-3 bg-primary/10 rounded-lg">
                          <span className="text-base font-semibold">Do wypłaty:</span>
                          <span className="text-base font-bold text-primary">
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
    </div>
  );
};