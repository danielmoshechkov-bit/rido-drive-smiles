import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { pl, enUS, ru, uk } from 'date-fns/locale';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { CsvColumnMapping, FeeFormulas, letterToIndex } from "@/lib/csvMapping";
import { useUserRole } from "@/hooks/useUserRole";
import { getAvailableWeeks, getCurrentWeekNumber, getWeekDates } from "@/lib/utils";
import { useTranslation } from 'react-i18next';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Settlement {
  id: string;
  driver_id: string;
  source: string;
  period_from: string;
  period_to: string;
  amounts: any;
  created_at: string;
  debt_before?: number;
  debt_payment?: number;
  debt_after?: number;
  actual_payout?: number;
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
  preSelectedYear?: number;
  preSelectedWeek?: number;
  hideControls?: boolean;
}

export const DriverSettlements = ({ 
  driverId, 
  preSelectedYear, 
  preSelectedWeek, 
  hideControls = false 
}: DriverSettlementsProps) => {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [visibilitySettings, setVisibilitySettings] = useState<VisibilitySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(preSelectedYear ?? currentYear);
  const [selectedWeek, setSelectedWeek] = useState<number>(preSelectedWeek ?? getCurrentWeekNumber(currentYear));
  const [feeFormulas, setFeeFormulas] = useState<FeeFormulas>({});
  const [driverPlan, setDriverPlan] = useState<any>(null);
  const [csvMapping, setCsvMapping] = useState<CsvColumnMapping | null>(null);
  const [rentalFee, setRentalFee] = useState<number>(0);
  const [additionalFees, setAdditionalFees] = useState<number>(0);
  const [initialLoad, setInitialLoad] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("all");
  const [settlementPlans, setSettlementPlans] = useState<any[]>([]);
  const [canChangePlan, setCanChangePlan] = useState(true);
  const [planChangeInfo, setPlanChangeInfo] = useState<string>('');
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const { role } = useUserRole();
  const { t, i18n } = useTranslation();

  const localeMap: Record<string, any> = {
    pl: pl,
    en: enUS,
    ru: ru,
    ua: uk,
    kz: ru // Kazakh uses Russian locale as fallback
  };
  const currentLocale = localeMap[i18n.language] || pl;

  const weeks = getAvailableWeeks(selectedYear);
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
    if (!driverId) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from('settlements')
        .select('*')
        .eq('driver_id', driverId);

      // If hideControls is true (fleet view), show all settlements for the year
      // Otherwise filter by specific week (ALWAYS for driver view)
      if (hideControls) {
        const yearStart = `${selectedYear}-01-01`;
        const yearEnd = `${selectedYear}-12-31`;
        query = query
          .gte('period_from', yearStart)
          .lte('period_to', yearEnd);
      } else {
        // For driver view, show ONLY the selected week
        if (!currentWeek) {
          console.error('⚠️ No currentWeek defined, cannot show settlements');
          setSettlements([]);
          setLoading(false);
          return;
        }
        console.log('🔍 Filtering by current week:', currentWeek);
        query = query
          .gte('period_from', currentWeek.start)
          .lte('period_to', currentWeek.end);
      }

      const { data, error } = await query
        .order('period_from', { ascending: false })
        .order('updated_at', { ascending: false });

      console.log('[DEBUG] Settlements query result:', { data, error, driverId });

      if (error) {
        console.error('[ERROR] Failed to load settlements:', error);
        toast.error('Błąd podczas ładowania rozliczeń: ' + error.message);
        return;
      }

      console.log('📊 Loaded settlements for driver:', data);
      if (data && data.length > 0) {
        console.log('💰 Amounts from first settlement:', data[0].amounts);
        console.log('📝 Raw data from first settlement:', data[0].raw);
      }

      setSettlements((data || []) as Settlement[]);
    } catch (error: any) {
      console.error('[ERROR] loadSettlements exception:', error);
      toast.error('Błąd podczas ładowania rozliczeń: ' + (error?.message || 'Nieznany błąd'));
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


  const loadSettlementPlans = async () => {
    const { data, error } = await supabase
      .from('settlement_plans')
      .select('*')
      .eq('is_active', true)
      .eq('is_visible', true)
      .order('name');

    if (!error && data) {
      setSettlementPlans(data);
    }
  };

  const fetchLatestSettlement = async () => {
    if (!driverId) return;
    
    const { data, error } = await supabase
      .from('settlements')
      .select('period_from')
      .eq('driver_id', driverId)
      .order('period_from', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (data && !preSelectedYear && !preSelectedWeek) {
      const periodDate = new Date(data.period_from);
      const year = periodDate.getFullYear();
      setSelectedYear(year);
      
      // Calculate week number from date
      const weekData = getWeekDates(year);
      const foundWeek = weekData.find(w => 
        data.period_from >= w.start && data.period_from <= w.end
      );
      if (foundWeek) {
        setSelectedWeek(foundWeek.number);
        console.log('📅 Set default week to latest settlement:', foundWeek.number, foundWeek.label);
      }
    }
    
    setInitialLoad(false);
  };

  // Synchronize with props when they change
  useEffect(() => {
    if (preSelectedYear) setSelectedYear(preSelectedYear);
  }, [preSelectedYear]);
  
  useEffect(() => {
    if (preSelectedWeek) setSelectedWeek(preSelectedWeek);
  }, [preSelectedWeek]);

  useEffect(() => {
    if (driverId && initialLoad) {
      fetchLatestSettlement();
    }
    loadVisibilitySettings();
    loadFeeFormulas();
    loadCsvMapping();
    loadDriverPlan();
    loadRentalFee();
    loadSettlementPlans();
  }, [driverId]);

  // Load saved plan preference on mount
  useEffect(() => {
    const savedPlanStr = localStorage.getItem('driver_selected_plan');
    if (savedPlanStr) {
      try {
        const savedPlan = JSON.parse(savedPlanStr);
        const { planId, expiresAt, driverId: savedDriverId } = savedPlan;
        
        if (savedDriverId === driverId) {
          const now = new Date();
          const expiry = new Date(expiresAt);
          
          if (now < expiry) {
            setSelectedPlanId(planId);
            setCanChangePlan(false);
            const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            setPlanChangeInfo(`Zablokowany na ${daysLeft} dni`);
          } else {
            localStorage.removeItem('driver_selected_plan');
          }
        }
      } catch (e) {
        console.error('Error loading saved plan:', e);
      }
    }
  }, [driverId]);

  const checkPlanChangePermission = async () => {
    if (!driverId) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data, error } = await supabase.rpc('can_change_settlement_plan', {
      _driver_id: driverId,
      _user_id: user.id
    });

    if (error) {
      console.error('Error checking plan change permission:', error);
      return;
    }
    
    if (data && typeof data === 'object') {
      const permission = data as any;
      setCanChangePlan(permission.can_change ?? true);
      
      if (!permission.can_change && !permission.is_admin) {
        if (permission.days_until_next_change > 0) {
          setPlanChangeInfo(`Następna zmiana możliwa za ${permission.days_until_next_change} dni`);
        } else {
          setPlanChangeInfo(permission.reason || 'Brak uprawnień do zmiany planu');
        }
      } else {
        setPlanChangeInfo('');
      }
    }
  };

  // Check plan change permission when driver or plan changes
  useEffect(() => {
    if (driverId) {
      checkPlanChangePermission();
    }
  }, [driverId, selectedPlanId]);

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
      <div className="flex justify-between p-2 hover:bg-yellow-200 rounded">
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
        <p className="text-muted-foreground">{t('weekly.loading')}</p>
      </div>
    );
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).sort((a, b) => b - a);

  return (
    <Card className={hideControls ? "border-0 shadow-none mt-4" : "mt-4"}>
      {!hideControls && (
        <Collapsible open={isControlsOpen} onOpenChange={setIsControlsOpen}>
          <div className="py-3 px-4">
            {/* Mobile: collapsed header with expand button */}
            <div className="md:hidden">
              <div className="w-full flex items-center justify-between cursor-pointer" onClick={() => setIsControlsOpen(!isControlsOpen)}>
                <div className="flex flex-col items-start">
                  <span className="font-semibold text-lg">{t('weekly.title')}</span>
                  {currentWeek && (
                    <span className="text-sm text-muted-foreground mt-1">
                      {format(new Date(currentWeek.start), 'd MMM', { locale: currentLocale })} - {format(new Date(currentWeek.end), 'd MMM yyyy', { locale: currentLocale })}
                    </span>
                  )}
                </div>
                {isControlsOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </div>
            
            {/* Desktop: always visible controls */}
            <div className="hidden md:flex items-center gap-4 flex-nowrap">
              <CardTitle className="whitespace-nowrap">{t('weekly.title')}</CardTitle>
              <div className="flex items-center gap-2">
                <Label className="text-sm whitespace-nowrap">{t('weekly.year')}:</Label>
                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                  <SelectTrigger className="h-9 px-3 w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(year => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm whitespace-nowrap">{t('weekly.period')}:</Label>
                <Select value={selectedWeek.toString()} onValueChange={(v) => setSelectedWeek(parseInt(v))}>
                  <SelectTrigger className="h-10 px-4 rounded-lg border-gray-300 shadow-sm w-[240px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {weeks.map(week => (
                      <SelectItem key={week.number} value={week.number.toString()}>
                        {week.displayLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Label className="text-sm whitespace-nowrap">{t('weekly.plan')}:</Label>
                <Select 
                  value={selectedPlanId} 
                  onValueChange={(newPlanId) => {
                    setSelectedPlanId(newPlanId);
                    
                    if (newPlanId !== "all") {
                      const expiryDate = new Date();
                      expiryDate.setDate(expiryDate.getDate() + 30);
                      
                      localStorage.setItem('driver_selected_plan', JSON.stringify({
                        planId: newPlanId,
                        expiresAt: expiryDate.toISOString(),
                        driverId: driverId
                      }));
                      
                      setCanChangePlan(false);
                      setPlanChangeInfo(`Zablokowany na 30 dni`);
                    } else {
                      localStorage.removeItem('driver_selected_plan');
                      setCanChangePlan(true);
                      setPlanChangeInfo('');
                    }
                  }}
                  disabled={selectedPlanId !== "all" && !canChangePlan && role !== 'admin'}
                >
                  <SelectTrigger className="h-9 px-3 w-[160px]" style={{ pointerEvents: (selectedPlanId !== "all" && !canChangePlan && role !== 'admin') ? 'none' : 'auto' }}>
                    <SelectValue placeholder={t('weekly.allPlans')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('weekly.allPlans')}</SelectItem>
                    {settlementPlans.map(plan => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {role === 'admin' && (
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    Admin
                  </Badge>
                )}
                {!canChangePlan && role !== 'admin' && planChangeInfo && (
                  <span className="text-xs text-orange-600 font-medium">
                    {planChangeInfo}
                  </span>
                )}
              </div>
            </div>

            {/* Mobile: collapsible controls */}
            <CollapsibleContent className="md:hidden space-y-3 pt-3">
              <div className="flex flex-col gap-2">
                <Label className="text-sm">{t('weekly.year')}:</Label>
                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(year => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-sm">{t('weekly.period')}:</Label>
                <Select value={selectedWeek.toString()} onValueChange={(v) => setSelectedWeek(parseInt(v))}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {weeks.map(week => (
                      <SelectItem key={week.number} value={week.number.toString()}>
                        {week.displayLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-sm">{t('weekly.plan')}:</Label>
                <Select 
                  value={selectedPlanId} 
                  onValueChange={(newPlanId) => {
                    setSelectedPlanId(newPlanId);
                    
                    if (newPlanId !== "all") {
                      const expiryDate = new Date();
                      expiryDate.setDate(expiryDate.getDate() + 30);
                      
                      localStorage.setItem('driver_selected_plan', JSON.stringify({
                        planId: newPlanId,
                        expiresAt: expiryDate.toISOString(),
                        driverId: driverId
                      }));
                      
                      setCanChangePlan(false);
                      setPlanChangeInfo(`Zablokowany na 30 dni`);
                    } else {
                      localStorage.removeItem('driver_selected_plan');
                      setCanChangePlan(true);
                      setPlanChangeInfo('');
                    }
                  }}
                  disabled={selectedPlanId !== "all" && !canChangePlan && role !== 'admin'}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={t('weekly.allPlans')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('weekly.allPlans')}</SelectItem>
                    {settlementPlans.map(plan => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
      <CardContent className={hideControls ? "p-0" : "space-y-6"}>

        {loading ? (
          <div className="text-center py-4">{t('weekly.loading')}</div>
        ) : settlements.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-2">
              {t('weekly.noData')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('weekly.contactAdmin')}
            </p>
            <p className="text-xs text-muted-foreground mt-4">
              {t('weekly.driverId')}: {driverId}
            </p>
          </Card>
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
                  { name: 'FreeNow', value: amounts.freenow_net || 0, fill: '#EF4444' }
                ].filter(item => item.value > 0);

                return (
                  <div key={periodKey} className="space-y-4">
                    {/* Layout: białe podsumowanie PIERWSZE, tabela DRUGA, wykres TRZECI */}
                    <div className="flex flex-wrap gap-4">
                    
                    {/* White summary box - FIRST */}
                    <div className="border rounded-lg overflow-hidden flex-1 min-w-[300px]">
                      <div className="bg-white p-4 space-y-3">
                        {/* Razem bez prowizji - DUŻA CZCIONKA */}
                        <div className="flex justify-between text-base font-bold pb-3 border-b border-dashed border-gray-300">
                          <span className="font-bold">{t('weekly.totalBeforeCommission')}:</span>
                          <span className="font-bold text-green-600 text-lg">
                            {((amounts.uber_base || 0) - (amounts.uber_commission || 0) +
                              (amounts.bolt_projected_d || 0) - (amounts.bolt_commission || 0) +
                              (amounts.freenow_base_s || 0) - (amounts.freenow_commission_t || 0)).toFixed(2)} zł
                          </span>
                        </div>
                        
                        {/* Razem gotówka - DUŻA CZCIONKA */}
                        {((amounts.uber_cash + amounts.bolt_cash + amounts.freenow_cash_f) !== 0) && (
                          <div className="flex justify-between text-base font-bold pb-3 border-b border-dashed border-gray-300">
                            <span className="font-bold">{t('weekly.totalCash')}:</span>
                            <span className="font-bold text-foreground text-lg">
                              -{Math.abs(amounts.uber_cash + amounts.bolt_cash + amounts.freenow_cash_f).toFixed(2)} zł
                            </span>
                          </div>
                        )}
                        
                        {/* Razem podatek 8% - DUŻA CZCIONKA */}
                        <div className="flex justify-between text-base font-bold pb-3 border-b border-dashed border-gray-300">
                          <span className="font-bold">{t('weekly.totalTax')}:</span>
                          <span className="font-bold text-foreground text-lg">-{totalTax.toFixed(2)} zł</span>
                        </div>
                        
                        {/* Opłata za rozliczenie - DUŻA CZCIONKA */}
                        {fee > 0 && (
                          <div className="flex justify-between text-base font-bold pb-3 border-b border-dashed border-gray-300">
                            <span className="font-bold">{t('weekly.settlementFee')}:</span>
                            <span className="font-bold text-foreground text-lg">-{fee.toFixed(2)} zł</span>
                          </div>
                        )}
                        
                        {/* Paliwo - DUŻA CZCIONKA */}
                        {amounts.fuel > 0 && (
                          <div className="flex justify-between text-base font-bold pb-3 border-b border-dashed border-gray-300">
                            <span className="font-bold">{t('weekly.fuel')}:</span>
                            <span className="font-bold text-foreground text-lg">-{amounts.fuel.toFixed(2)} zł</span>
                          </div>
                        )}
                        
                        {/* Zwrot VAT paliwo - DUŻA CZCIONKA */}
                        {amounts.fuel_vat_refund > 0 && (
                          <div className="flex justify-between text-base font-bold pb-3 border-b border-dashed border-gray-300">
                            <span className="font-bold">{t('weekly.fuelVatRefund')}:</span>
                            <span className="font-bold text-green-600 text-lg">+{amounts.fuel_vat_refund.toFixed(2)} zł</span>
                          </div>
                        )}
                        
                        {/* Wynajem auta - WARUNKOWO, DUŻA CZCIONKA */}
                        {rentalFee > 0 && (
                          <div className="flex justify-between text-base font-bold pb-3 border-b border-dashed border-gray-300">
                            <span className="font-bold">{t('weekly.carRental')}:</span>
                            <span className="font-bold text-foreground text-lg">-{rentalFee.toFixed(2)} zł</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Payout summary - EXTRA DUŻA CZCIONKA */}
                      <div className="border-t bg-purple-100 p-4 rounded-b-lg">
                        <div className="flex justify-between">
                          <span className="font-extrabold text-xl text-gray-900">{t('weekly.payout')}:</span>
                          <span className={`font-extrabold text-xl ${payout > 0 ? 'text-green-600' : payout < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                            {(typeof payout === 'number' ? payout : 0).toFixed(2)} zł
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Compact settlement table - SECOND */}
                    <div className="border rounded-lg overflow-hidden flex-1 min-w-[300px] bg-white">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm bg-white">
                          <thead>
                            <tr className="bg-muted">
                              <th className="text-left p-1.5 font-medium text-xs">{t('weekly.category')}</th>
                              <th className="text-right p-1.5 font-medium whitespace-nowrap text-xs">Uber</th>
                              <th className="text-right p-1.5 font-medium whitespace-nowrap text-xs">Bolt</th>
                              <th className="text-right p-1.5 font-medium whitespace-nowrap text-xs">FreeNow</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white">
                            {/* Podstawa opodatkowania */}
                            <tr className="border-t hover:bg-muted/50">
                              <td className="p-1.5 text-muted-foreground text-xs">{t('weekly.base')}</td>
                              <td className="p-1.5 text-right font-medium whitespace-nowrap text-xs">
                                {amounts.uber_base ? `${amounts.uber_base.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-1.5 text-right font-medium whitespace-nowrap text-xs">
                                {amounts.bolt_projected_d ? `${amounts.bolt_projected_d.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-1.5 text-right font-medium whitespace-nowrap text-xs">
                                {amounts.freenow_base_s ? `${amounts.freenow_base_s.toFixed(2)} zł` : '-'}
                              </td>
                            </tr>
                            
                            {/* Prowizja */}
                            <tr className="border-t hover:bg-muted/50">
                              <td className="p-1.5 text-muted-foreground text-xs">{t('weekly.commission')}</td>
                              <td className="p-1.5 text-right font-medium text-amber-600 whitespace-nowrap text-xs">
                                {amounts.uber_commission > 0 ? `-${amounts.uber_commission.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-1.5 text-right font-medium text-amber-600 whitespace-nowrap text-xs">
                                {amounts.bolt_commission > 0 ? `-${amounts.bolt_commission.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-1.5 text-right font-medium text-amber-600 whitespace-nowrap text-xs">
                                {amounts.freenow_commission_t > 0 ? `-${amounts.freenow_commission_t.toFixed(2)} zł` : '-'}
                              </td>
                            </tr>
                            
                            {/* Gotówka pobrana (informacyjnie) */}
                            <tr className="border-t hover:bg-muted/50">
                              <td className="p-1.5 text-muted-foreground text-xs">{t('weekly.cashCollected')}</td>
                              <td className="p-1.5 text-right font-medium text-blue-600 whitespace-nowrap text-xs">
                                {amounts.uber_cash !== 0 ? `${amounts.uber_cash.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-1.5 text-right font-medium text-blue-600 whitespace-nowrap text-xs">
                                {amounts.bolt_cash !== 0 ? `${amounts.bolt_cash.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-1.5 text-right font-medium text-blue-600 whitespace-nowrap text-xs">
                                {amounts.freenow_cash_f !== 0 ? `${amounts.freenow_cash_f.toFixed(2)} zł` : '-'}
                              </td>
                            </tr>
                            
                            {/* Podatek 8% */}
                            <tr className="border-t hover:bg-muted/50">
                              <td className="p-1.5 text-muted-foreground text-xs">{t('weekly.tax8')}</td>
                              <td className="p-1.5 text-right font-medium text-destructive whitespace-nowrap text-xs">
                                {amounts.uber_tax_8 ? `-${amounts.uber_tax_8.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-1.5 text-right font-medium text-destructive whitespace-nowrap text-xs">
                                {amounts.bolt_tax_8 ? `-${amounts.bolt_tax_8.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-1.5 text-right font-medium text-destructive whitespace-nowrap text-xs">
                                {amounts.freenow_tax_8 ? `-${amounts.freenow_tax_8.toFixed(2)} zł` : '-'}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                      
                      {/* Debt information */}
                      {(settlement.debt_before && settlement.debt_before > 0) || (settlement.debt_payment && settlement.debt_payment > 0) ? (
                        <div className="border-t bg-red-50 p-3">
                          <div className="space-y-2">
                            <div className="font-semibold text-red-800 mb-2">💳 {t('weekly.debt')}</div>
                            
                            {settlement.debt_before && settlement.debt_before > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">{t('weekly.debtFromPrevious')}:</span>
                                <span className="font-semibold text-red-600">
                                  -{settlement.debt_before.toFixed(2)} zł
                                </span>
                              </div>
                            )}
                            
                            {settlement.debt_payment && settlement.debt_payment > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">{t('weekly.debtPayment')}:</span>
                                <span className="font-semibold text-green-600">
                                  -{settlement.debt_payment.toFixed(2)} zł
                                </span>
                              </div>
                            )}
                            
                            {settlement.debt_after !== undefined && settlement.debt_after > 0 && (
                              <div className="flex justify-between text-sm border-t border-red-300 pt-2 mt-2">
                                <span className="text-muted-foreground">{t('weekly.remainingDebt')}:</span>
                                <span className="font-semibold text-red-600">
                                  -{settlement.debt_after.toFixed(2)} zł
                                </span>
                              </div>
                            )}
                            
                            <div className="flex justify-between border-t-2 border-red-400 pt-2 mt-2">
                              <span className="font-bold">{t('weekly.actualPayout')}:</span>
                              <span className={`font-bold text-lg ${(settlement.actual_payout || 0) > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                {(settlement.actual_payout || 0).toFixed(2)} zł
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : payout < 0 ? (
                        <div className="border-t bg-red-50 p-3">
                          <div className="space-y-2">
                            <div className="font-semibold text-red-800 mb-2">⚠️ {t('weekly.negativePayoutWarning')}</div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{t('weekly.addedToDebt')}:</span>
                              <span className="font-bold text-red-600">
                                {Math.abs(payout).toFixed(2)} zł
                              </span>
                            </div>
                            <div className="flex justify-between border-t-2 border-red-400 pt-2 mt-2">
                              <span className="font-bold">{t('weekly.actualPayout')}:</span>
                              <span className="font-bold text-lg text-gray-600">0.00 zł</span>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    
                    {/* Chart - SECOND */}
                    {platformData.length > 0 && (
                      <Card className="flex-1 min-w-[300px]">
                        <CardHeader className="pb-2">
                          <h4 className="text-sm font-medium">{t('weekly.earningsByPlatform')}</h4>
                          {/* Percentages as text */}
                          <div className="text-xs text-muted-foreground mt-1">
                            {platformData.map((platform, idx) => {
                              const total = platformData.reduce((sum, p) => sum + p.value, 0);
                              const percentage = total > 0 ? ((platform.value / total) * 100).toFixed(0) : 0;
                              return (
                                <span key={platform.name}>
                                  {idx > 0 && ', '}
                                  <span style={{ color: platform.fill }} className="font-medium">
                                    {platform.name} {percentage}%
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="h-48 md:h-56">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={platformData}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={false}
                                  label={false}
                                  outerRadius="70%"
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
                    
                  </div>
                );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};