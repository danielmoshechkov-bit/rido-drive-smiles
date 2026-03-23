import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, ChevronDown, ChevronUp, CreditCard, Banknote, AlertTriangle, Phone } from "lucide-react";
import { format, parseISO } from "date-fns";
import { pl } from 'date-fns/locale';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PieChart, Pie, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { CsvColumnMapping, FeeFormulas, letterToIndex } from "@/lib/csvMapping";
import { useUserRole } from "@/hooks/useUserRole";
import { getAvailableWeeks, getCurrentWeekNumber, getWeekDates } from "@/lib/utils";
import { useTranslation } from 'react-i18next';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { B2BInvoiceCard } from "@/components/driver/B2BInvoiceCard";

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
  const [selectedWeek, setSelectedWeek] = useState<number | null>(preSelectedWeek ?? null);
  const [isDefaultsInitialized, setIsDefaultsInitialized] = useState(false);
  const [feeFormulas, setFeeFormulas] = useState<FeeFormulas>({});
  const [driverPlan, setDriverPlan] = useState<any>(null);
  const [csvMapping, setCsvMapping] = useState<CsvColumnMapping | null>(null);
  const [rentalFee, setRentalFee] = useState<number>(0);
  const [additionalFees, setAdditionalFees] = useState<number>(0);
  const [initialLoad, setInitialLoad] = useState(true);

  // Initialize default week to last settlement period
  useEffect(() => {
    const initializeDefaultWeek = async () => {
      if (!driverId || isDefaultsInitialized || preSelectedWeek) {
        if (preSelectedWeek) {
          setSelectedWeek(preSelectedWeek);
          setIsDefaultsInitialized(true);
        }
        return;
      }
      
      // Fetch last settlement for this driver
      const { data: lastSettlement } = await supabase
        .from('settlements')
        .select('period_from, period_to')
        .eq('driver_id', driverId)
        .order('period_to', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (lastSettlement) {
        // Parse the date from last settlement
        const periodDate = new Date(lastSettlement.period_from);
        const year = periodDate.getFullYear();
        
        // Find matching week number
        const weeks = getWeekDates(year);
        const matchingWeek = weeks.find(w => 
          w.start === lastSettlement.period_from || 
          w.end === lastSettlement.period_to
        );
        
        setSelectedYear(year);
        setSelectedWeek(matchingWeek?.number || getCurrentWeekNumber(year));
        console.log('📅 Initialized to last settlement period:', { year, week: matchingWeek?.number, period_from: lastSettlement.period_from });
      } else {
        // No settlements - use current week
        setSelectedYear(currentYear);
        setSelectedWeek(getCurrentWeekNumber(currentYear));
        console.log('📅 No settlements found, using current week');
      }
      
      setIsDefaultsInitialized(true);
    };
    
    initializeDefaultWeek();
  }, [driverId, preSelectedWeek, isDefaultsInitialized, currentYear]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("all");
  const [settlementPlans, setSettlementPlans] = useState<any[]>([]);
  const [canChangePlan, setCanChangePlan] = useState(true);
  const [planChangeInfo, setPlanChangeInfo] = useState<string>('');
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [driverPaymentMethod, setDriverPaymentMethod] = useState<string>('transfer');
  const [driverIban, setDriverIban] = useState<string>('');
  const [lastAvailableWeek, setLastAvailableWeek] = useState<string | null>(null);
  const [ibanUpdateTimeout, setIbanUpdateTimeout] = useState<NodeJS.Timeout | null>(null);
  const [showAllWeeks, setShowAllWeeks] = useState(false);
  const [fleetPlanSelectionDisabled, setFleetPlanSelectionDisabled] = useState(false);
  const [settlementFrequency, setSettlementFrequency] = useState<string>('weekly');
  const [fleetFrequencyEnabled, setFleetFrequencyEnabled] = useState(false);
  const [accumulatedEarnings, setAccumulatedEarnings] = useState<number>(0);
  const [fleetVatRate, setFleetVatRate] = useState<number | null>(null);
  const [fleetBaseFee, setFleetBaseFee] = useState<number | null>(null);
  const [isB2BDriver, setIsB2BDriver] = useState(false);
  const [b2bVatPayer, setB2bVatPayer] = useState<boolean>(false);
  const [driverFleetId, setDriverFleetId] = useState<string | null>(null);
  const [payoutRequested, setPayoutRequested] = useState(false);
  const [driverName, setDriverName] = useState<string>('');
  const [fleetContact, setFleetContact] = useState<{ name: string; phone: string } | null>(null);
  const [fleetHasSettlement, setFleetHasSettlement] = useState<boolean | null>(null);
  const { role } = useUserRole();
  const { t } = useTranslation();

  // Check if fleet has disabled plan selection for drivers and if frequency is enabled
  useEffect(() => {
    const checkFleetSettings = async () => {
      if (!driverId) return;
      
      const { data: driver } = await supabase
        .from('drivers')
        .select('fleet_id, payment_method, first_name, last_name')
        .eq('id', driverId)
        .maybeSingle();
      
      // Check if B2B driver and get VAT payer status
      if (driver?.payment_method === 'b2b') {
        setIsB2BDriver(true);
        
        // Fetch B2B profile to check vat_payer status
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: b2bProfile } = await supabase
            .from('driver_b2b_profiles')
            .select('vat_payer')
            .eq('driver_user_id', user.id)
            .maybeSingle();
          
          if (b2bProfile) {
            setB2bVatPayer(b2bProfile.vat_payer ?? false);
          }
        }
      }
      
      // Set driver name for B2B invoice
      if (driver?.first_name || driver?.last_name) {
        setDriverName(`${driver.first_name || ''} ${driver.last_name || ''}`.trim());
      }
      
      // Set fleet ID
      if (driver?.fleet_id) {
        setDriverFleetId(driver.fleet_id);
      }
      
      if (!driver?.fleet_id || role === 'admin') return;
      
      const { data: fleet } = await supabase
        .from('fleets')
        .select('driver_plan_selection_enabled, settlement_frequency_enabled, vat_rate, base_fee, contact_name, contact_phone_for_drivers')
        .eq('id', driver.fleet_id)
        .maybeSingle();
      
      if (fleet) {
        if (fleet.driver_plan_selection_enabled === false) {
          setFleetPlanSelectionDisabled(true);
        }
        setFleetFrequencyEnabled(fleet.settlement_frequency_enabled ?? false);
        setFleetVatRate(fleet.vat_rate ?? null);
        setFleetBaseFee((fleet as any).base_fee ?? null);
        
        // Set fleet contact for no-settlement message
        if (fleet.contact_name || fleet.contact_phone_for_drivers) {
          setFleetContact({
            name: fleet.contact_name || '',
            phone: fleet.contact_phone_for_drivers || ''
          });
        }
      }
      
      // Get driver's current frequency setting
      const { data: appUser } = await supabase
        .from('driver_app_users')
        .select('settlement_frequency, payout_requested_at')
        .eq('driver_id', driverId)
        .maybeSingle();
      
      if (appUser?.settlement_frequency) {
        setSettlementFrequency(appUser.settlement_frequency);
      }
      setPayoutRequested(!!(appUser as any)?.payout_requested_at);
      
      // Get accumulated earnings
      const { data: accumulated } = await supabase
        .from('driver_accumulated_earnings')
        .select('net_earnings')
        .eq('driver_id', driverId)
        .eq('is_paid', false);
      
      if (accumulated && accumulated.length > 0) {
        const total = accumulated.reduce((sum, a) => sum + Number(a.net_earnings || 0), 0);
        setAccumulatedEarnings(total);
      }
    };
    
    checkFleetSettings();
  }, [driverId, role]);

  const handleFrequencyChange = async (newFrequency: string) => {
    if (!driverId) return;
    
    try {
      const { error } = await supabase
        .from('driver_app_users')
        .update({ settlement_frequency: newFrequency })
        .eq('driver_id', driverId);
      
      if (error) throw error;
      
      setSettlementFrequency(newFrequency);
      
      const frequencyLabels: Record<string, string> = {
        weekly: 'Co tydzień',
        biweekly: 'Co 2 tygodnie',
        triweekly: 'Co 3 tygodnie',
        monthly: 'Raz w miesiącu'
      };
      
      toast.success(`Częstotliwość rozliczeń zmieniona na: ${frequencyLabels[newFrequency]}`);
    } catch (error: any) {
      toast.error('Błąd zmiany częstotliwości: ' + error.message);
    }
  };

  const weeks = getAvailableWeeks(selectedYear);
  const displayedWeeks = showAllWeeks ? weeks : weeks.slice(0, 2);
  const currentWeek = useMemo(() => 
    selectedWeek !== null ? weeks.find(w => w.number === selectedWeek) : undefined, 
    [weeks, selectedWeek]
  );

  // Normalize amounts - supports both old (camelCase) and new (snake_case) formats
  // Legacy mode: old data had wrong tax calculation for Bolt
  // Also handles: negative Uber payout exception for tax calculation
  const normalizeAmounts = (amounts: any, dynamicFuel?: { fuel: number; fuel_vat_refund: number }): any => {
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
    
    // Get Uber values
    const uberPayoutD = amounts.uber_payout_d ?? amounts.uberPayoutD ?? amounts.uberCashless ?? 0;
    const uberCashF = amounts.uber_cash_f ?? amounts.uberCashF ?? amounts.uberCash ?? 0;
    
    // Legacy fix: Calculate correct Bolt tax and net for old data
    if (isLegacyFormat) {
      const boltGross = amounts.boltGross ?? 0;
      const boltCash = amounts.boltCash ?? amounts.bolt_cash ?? 0;
      let uberBase = amounts.uber ?? amounts.uberBase ?? 0;
      const freenowGross = amounts.freenowGross ?? 0;
      
      // Fix for negative Uber balance (column D)
      // When uber_payout_d < 0, it means driver owes money to Uber
      // Tax should be calculated on absolute value
      if (uberPayoutD < 0) {
        // Use absolute value for tax calculation
        uberBase = Math.abs(uberPayoutD) + uberCashF;
        uber_base_corrected = uberBase;
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
    } else {
      // New format - still handle negative Uber payout exception
      if (uberPayoutD < 0) {
        const uberBaseForTax = Math.abs(uberPayoutD) + uberCashF;
        uber_tax_8 = uberBaseForTax * 0.08;
        uber_base_corrected = uberPayoutD; // Keep original negative sign for display
        uber_net = uberBaseForTax - uber_tax_8;
        uber_cash_corrected = -uberCashF;
        
        console.log('🔧 Uber negative balance fix (new format):', {
          uberPayoutD,
          uberCashF,
          uberBaseForTax,
          uber_base_corrected,
          uber_tax_8,
          uber_net
        });
      }
    }
    
    // Use dynamic fuel if provided (fetched from fuel_transactions)
    const fuelAmount = dynamicFuel?.fuel ?? amounts.fuel ?? 0;
    const fuelVatRefund = dynamicFuel?.fuel_vat_refund ?? amounts.fuel_vat_refund ?? amounts.fuelVATRefund ?? amounts.fuelVatRefund ?? 0;
    
    return {
      // Uber - support both formats + negative balance fix
      uber_payout_d: uberPayoutD,
      uber_cash_f: uberCashF,
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
      
      // Shared - support both formats with dynamic fuel
      total_cash: amounts.total_cash ?? amounts.totalCash ?? 0,
      fuel: fuelAmount,
      fuel_vat_refund: fuelVatRefund,
    };
  };

  // State for dynamic fuel data (fetched from fuel_transactions)
  const [driverFuelData, setDriverFuelData] = useState<{ fuel: number; fuel_vat_refund: number } | null>(null);

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
      
      // Fetch dynamic fuel data for this driver and period
      if (data && data.length > 0 && currentWeek) {
        await loadDynamicFuel(currentWeek.start, currentWeek.end);
      }
      
      // Detect last available week if no settlements found
      if (!data || data.length === 0) {
        const { data: lastSettlement } = await supabase
          .from('settlements')
          .select('period_from, period_to')
          .eq('driver_id', driverId)
          .order('period_to', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (lastSettlement) {
          setLastAvailableWeek(
            `${format(new Date(lastSettlement.period_from), 'd MMM', { locale: pl })} - ${format(new Date(lastSettlement.period_to), 'd MMM yyyy', { locale: pl })}`
          );
        } else {
          setLastAvailableWeek(null);
        }
        
        // Check if fleet has a settlement for this period
        if (driverFleetId && currentWeek) {
          try {
            // Cast to any early to avoid TS type depth issues with chained filters
            const spQuery = supabase.from('settlement_periods') as any;
            const { data: fleetPeriods, error: fpError } = await spQuery
              .select('id, week_start, week_end')
              .eq('fleet_id', driverFleetId);
            
            if (!fpError && fleetPeriods) {
              // Filter in JS to check if any period matches
              const hasFleetSettlement = fleetPeriods.some((p: any) => 
                p.week_start >= currentWeek.start && p.week_end <= currentWeek.end
              );
              setFleetHasSettlement(hasFleetSettlement);
              console.log('📅 Fleet has settlement for this period:', hasFleetSettlement);
            } else {
              setFleetHasSettlement(false);
            }
          } catch (e) {
            console.error('Error checking fleet settlement period:', e);
            setFleetHasSettlement(false);
          }
        } else {
          setFleetHasSettlement(false);
        }
      } else {
        setLastAvailableWeek(null);
        setFleetHasSettlement(true);
      }
    } catch (error: any) {
      console.error('[ERROR] loadSettlements exception:', error);
      toast.error('Błąd podczas ładowania rozliczeń: ' + (error?.message || 'Nieznany błąd'));
    } finally {
      setLoading(false);
    }
  };

  // Dynamically fetch fuel from fuel_transactions table using driver's fuel_card_number
  const loadDynamicFuel = async (periodFrom: string, periodTo: string) => {
    if (!driverId) return;
    
    try {
      // Get driver's fuel card number
      const { data: driverData } = await supabase
        .from('drivers')
        .select('fuel_card_number')
        .eq('id', driverId)
        .maybeSingle();
      
      if (!driverData?.fuel_card_number) {
        console.log('⛽ No fuel card assigned to driver');
        setDriverFuelData(null);
        return;
      }
      
      const cardNumber = driverData.fuel_card_number;
      // Normalize: remove all leading zeros for comparison
      const normalizedDriverCard = cardNumber.replace(/^0+/, '');
      
      console.log('⛽ Looking for fuel transactions:', {
        originalCardNumber: cardNumber,
        normalizedCardNumber: normalizedDriverCard,
        periodFrom,
        periodTo
      });
      
      // Fetch ALL fuel transactions for this period, then filter in JS
      // This handles card_number format differences (leading zeros)
      const { data: fuelData, error: fuelError } = await supabase
        .from('fuel_transactions')
        .select('total_amount, card_number')
        .gte('period_from', periodFrom)
        .lte('period_to', periodTo);
      
      if (fuelError) {
        console.error('⛽ Error fetching fuel transactions:', fuelError);
        setDriverFuelData(null);
        return;
      }
      
      // Filter by normalized card number (remove leading zeros from both sides)
      const matchingFuel = fuelData?.filter(tx => 
        tx.card_number?.replace(/^0+/, '') === normalizedDriverCard
      ) || [];
      
      console.log('⛽ Fuel matching results:', {
        totalTransactions: fuelData?.length || 0,
        matchingTransactions: matchingFuel.length,
        sampleCardNumbers: fuelData?.slice(0, 3).map(tx => tx.card_number)
      });
      
      if (matchingFuel.length > 0) {
        const totalFuel = matchingFuel.reduce((sum, tx) => sum + (tx.total_amount || 0), 0);
        // VAT refund formula: (fuel - fuel/1.23) / 2 = 50% of VAT
        const fuelVatRefund = (totalFuel - totalFuel / 1.23) / 2;
        
        console.log('⛽ Dynamic fuel data loaded:', {
          cardNumber,
          normalizedCardNumber: normalizedDriverCard,
          transactions: matchingFuel.length,
          totalFuel,
          fuelVatRefund
        });
        
        setDriverFuelData({
          fuel: totalFuel,
          fuel_vat_refund: fuelVatRefund
        });
      } else {
        console.log('⛽ No fuel transactions found for normalized card:', normalizedDriverCard);
        setDriverFuelData(null);
      }
    } catch (error) {
      console.error('⛽ Error in loadDynamicFuel:', error);
      setDriverFuelData(null);
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

    // Only get rental fee for fleet vehicles (fleet_id != null)
    const { data, error } = await supabase
      .from('driver_vehicle_assignments')
      .select('vehicle_id, vehicles(weekly_rental_fee, fleet_id)')
      .eq('driver_id', driverId)
      .eq('status', 'active')
      .is('unassigned_at', null);

    if (!error && data && data.length > 0) {
      // Find first fleet vehicle (has fleet_id)
      const fleetAssignment = data.find(d => {
        const vehicle = d.vehicles as any;
        return vehicle?.fleet_id !== null && vehicle?.fleet_id !== undefined;
      });

      if (fleetAssignment?.vehicles) {
        const vehicleData = fleetAssignment.vehicles as any;
        setRentalFee(vehicleData.weekly_rental_fee || 0);
      } else {
        // Driver has own vehicles only (no fleet_id) = no rental
        setRentalFee(0);
      }
    } else {
      setRentalFee(0);
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
    if (!driverId) {
      setInitialLoad(false);
      return;
    }
    
    console.log('📅 fetchLatestSettlement called for driver:', driverId);
    
    // 1. First try to find driver's own settlements
    const { data: driverSettlement, error } = await supabase
      .from('settlements')
      .select('period_from')
      .eq('driver_id', driverId)
      .order('period_from', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    console.log('📅 fetchLatestSettlement result:', { driverSettlement, error });
    
    if (driverSettlement) {
      const periodDate = new Date(driverSettlement.period_from);
      const year = periodDate.getFullYear();
      
      // Calculate week number from date
      const weekData = getWeekDates(year);
      const foundWeek = weekData.find(w => 
        driverSettlement.period_from >= w.start && driverSettlement.period_from <= w.end
      );
      
      if (foundWeek) {
        console.log('📅 Setting to latest week from driver settlements:', year, foundWeek.number);
        setSelectedYear(year);
        setSelectedWeek(foundWeek.number);
      }
      setInitialLoad(false);
      return;
    }
    
    // 2. Driver has no settlements - fallback to fleet's latest period
    const { data: driver } = await supabase
      .from('drivers')
      .select('fleet_id')
      .eq('id', driverId)
      .maybeSingle();
    
    if (driver?.fleet_id) {
      console.log('📅 Driver has no settlements, checking fleet periods for:', driver.fleet_id);
      
      // Cast to any early to avoid TS type depth issues with chained filters
      const spQuery = supabase.from('settlement_periods') as any;
      const { data: fleetPeriods, error: fpErr } = await spQuery
        .select('week_start, week_end')
        .eq('fleet_id', driver.fleet_id)
        .order('week_start', { ascending: false })
        .limit(1);
      
      const fleetPeriod = fleetPeriods && fleetPeriods.length > 0 ? fleetPeriods[0] : null;
      
      if (fleetPeriod) {
        const periodDate = new Date(fleetPeriod.week_start);
        const year = periodDate.getFullYear();
        const weekData = getWeekDates(year);
        const foundWeek = weekData.find(w => 
          fleetPeriod.week_start >= w.start && fleetPeriod.week_start <= w.end
        );
        
        if (foundWeek) {
          console.log('📅 Setting to latest week from fleet periods:', year, foundWeek.number);
          setSelectedYear(year);
          setSelectedWeek(foundWeek.number);
        }
      }
    }
    
    setInitialLoad(false);
  };

  // Fetch driver payment info
  useEffect(() => {
    const fetchDriverInfo = async () => {
      if (!driverId) return;
      
      const { data } = await supabase
        .from('drivers')
        .select('payment_method, iban')
        .eq('id', driverId)
        .maybeSingle();
      
      if (data) {
        setDriverPaymentMethod(data.payment_method || 'transfer');
        setDriverIban(data.iban || '');
      }
    };
    fetchDriverInfo();
  }, [driverId]);

  const handlePaymentMethodChange = async (method: string) => {
    const { error } = await supabase
      .from('drivers')
      .update({ payment_method: method })
      .eq('id', driverId);
    
    if (!error) {
      setDriverPaymentMethod(method);
      toast.success('Zaktualizowano sposób rozliczenia');
    } else {
      toast.error('Błąd aktualizacji');
    }
  };

  const handleIbanChange = async (iban: string) => {
    setDriverIban(iban);
    
    // Clear previous timeout
    if (ibanUpdateTimeout) {
      clearTimeout(ibanUpdateTimeout);
    }
    
    // Debounced update
    const timeout = setTimeout(async () => {
      const { error } = await supabase
        .from('drivers')
        .update({ iban })
        .eq('id', driverId);
      
      if (error) {
        toast.error('Błąd aktualizacji numeru konta');
      }
    }, 1000);
    
    setIbanUpdateTimeout(timeout);
  };

  // Synchronize with props when they change
  useEffect(() => {
    if (preSelectedYear) setSelectedYear(preSelectedYear);
  }, [preSelectedYear]);
  
  useEffect(() => {
    if (preSelectedWeek) setSelectedWeek(preSelectedWeek);
  }, [preSelectedWeek]);

  useEffect(() => {
    if (driverId) {
      // Zawsze pobierz najnowsze rozliczenie przy pierwszym ładowaniu
      if (initialLoad && !preSelectedYear && !preSelectedWeek) {
        fetchLatestSettlement();
      } else {
        setInitialLoad(false);
      }
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
    // Wait until defaults are initialized (selectedWeek is not null) and initialLoad is done
    if (!initialLoad && isDefaultsInitialized && selectedWeek !== null) {
      loadSettlements();
      loadAdditionalFees();
    }
  }, [driverId, selectedYear, selectedWeek, initialLoad, isDefaultsInitialized]);

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
    
    // Check if driver is B2B (at the start of function)
    const isB2BDriverLocal = driverPaymentMethod === 'b2b';
    
    // Get calculated net amounts (already have 8% tax deducted)
    const uberNet = amounts.uber_net || 0;
    const boltNet = amounts.bolt_net || 0;
    const freenowNet = amounts.freenow_net || 0;
    
    // Get taxes - dynamically calculate based on fleet VAT rate if different from 8%
    // B2B drivers with vat_payer=true don't pay VAT - they issue their own invoices
    // B2B drivers with vat_payer=false get 8% VAT deducted (like regular drivers)
    const isB2BVatPayer = isB2BDriverLocal && b2bVatPayer === true;
    const effectiveVatRate = isB2BVatPayer ? 0 : (fleetVatRate ?? 8);
    
    const calculateDynamicTax = (netAmount: number, originalTax8: number) => {
      if (effectiveVatRate === 0) return 0; // B2B - no tax
      if (effectiveVatRate === 8) return originalTax8;
      // Reconstruct gross from net (net = gross * 0.92)
      // gross = net / 0.92
      // new tax = gross * (effectiveVatRate / 100)
      const grossBase = netAmount / 0.92;
      return grossBase * (effectiveVatRate / 100);
    };
    
    const uberTax = calculateDynamicTax(uberNet, amounts.uber_tax_8 || 0);
    const boltTax = calculateDynamicTax(boltNet, amounts.bolt_tax_8 || 0);
    const freenowTax = calculateDynamicTax(freenowNet, amounts.freenow_tax_8 || 0);
    const totalTax = uberTax + boltTax + freenowTax;
    
    // Get other values
    const fuel = amounts.fuel || 0;
    const fuelVatRefund = amounts.fuel_vat_refund || 0;
    
    // Cash collected on platforms (always reduce payout)
    // Use uber_cash_f (correct field) with fallback to uber_cash for legacy data
    const cashTotal = Math.abs(amounts.uber_cash_f || amounts.uber_cash || 0) + Math.abs(amounts.bolt_cash || 0) + Math.abs(amounts.freenow_cash_f || 0);
    
    // Use fleet base_fee if set (priority), otherwise driver plan fee, default to 50 PLN
    const planFee = (fleetBaseFee !== null && fleetBaseFee > 0) 
      ? fleetBaseFee 
      : (driverPlan?.base_fee ?? 50);
    const planName = driverPlan?.name ?? 'Domyślny (50+8%)';
    
    // Calculate total earnings before any deductions
    // Dla B2B z vat_payer=true używamy wartości BRUTTO (przed podatkiem 8%)
    // Dla B2B z vat_payer=false oraz standardowych - NETTO (po 8% podatku)
    
    let earningsForPayout: number;
    if (isB2BVatPayer) {
      // B2B płatnik VAT: użyj wartości brutto (przed podatkiem platformy) - kierowca sam rozlicza VAT
      const uberBase = amounts.uber_base || 0;
      const boltBase = amounts.bolt_projected_d || 0;
      const freenowBase = amounts.freenow_base_s || 0;
      earningsForPayout = uberBase + boltBase + freenowBase;
      console.log(`💼 B2B VAT Payer: Using BRUTTO values - Uber: ${uberBase}, Bolt: ${boltBase}, FreeNow: ${freenowBase}`);
    } else {
      // B2B bez VAT lub standardowy kierowca: użyj wartości netto (po 8% podatku)
      earningsForPayout = uberNet + boltNet + freenowNet;
      if (isB2BDriverLocal && !b2bVatPayer) {
        console.log(`💼 B2B Non-VAT Payer: Using NETTO values with 8% VAT deducted`);
      }
    }
    
    const totalEarnings = earningsForPayout;
    
    // ⚠️ OCHRONA ZEROWYCH ZAROBKÓW
    // Jeśli kierowca nie jeździł (suma zarobków = 0 lub ujemna do -10 zł), nie naliczaj opłat
    if (totalEarnings === 0) {
      console.log('⛔ Zero earnings protection: Driver did not drive, no fees applied');
      return { 
        payout: 0, 
        fee: 0, 
        totalTax: 0, 
        breakdown: { totalEarnings: 0, zeroEarningsProtection: true }
      };
    }
    
    // Jeśli zarobki są ujemne (np. kara z aplikacji do 10 zł), tylko to pokazuj bez opłat
    if (totalEarnings < 0 && totalEarnings > -10) {
      console.log('⚠️ Small negative balance protection:', totalEarnings);
      return {
        payout: totalEarnings,
        fee: 0,
        totalTax: 0,
        breakdown: { totalEarnings, smallNegativeProtection: true }
      };
    }
    
    // FORMUŁA WYPŁATY:
    // Dla B2B płatnik VAT: BRUTTO - GOTÓWKA + ZWROT_VAT - Paliwo - Opłata - Wynajem - Dodatkowe (bez podatku 8%)
    // Dla B2B bez VAT: NETTO - GOTÓWKA + ZWROT_VAT - Paliwo - Opłata - Wynajem - Dodatkowe (z podatkiem 8%)
    // Dla standardowych: NETTO - GOTÓWKA + ZWROT_VAT - Paliwo - Opłata - Wynajem - Dodatkowe
    const payout = earningsForPayout - cashTotal + fuelVatRefund - fuel - planFee - rentalFee - additionalFees;
    
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

  // Wait for selectedWeek to be initialized before rendering Select components
  if (selectedWeek === null || !isDefaultsInitialized) {
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
                      {format(new Date(currentWeek.start), 'd MMM', { locale: pl })} - {format(new Date(currentWeek.end), 'd MMM yyyy', { locale: pl })}
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
                  <SelectContent className="max-h-[300px] bg-background">
                    {displayedWeeks.map(week => (
                      <SelectItem key={week.number} value={week.number.toString()}>
                        {week.displayLabel}
                      </SelectItem>
                    ))}
                    {!showAllWeeks && weeks.length > 2 && (
                      <div 
                        className="px-2 py-2 text-sm text-primary cursor-pointer hover:bg-muted flex items-center justify-center gap-1 border-t"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAllWeeks(true);
                        }}
                      >
                        <ChevronDown className="h-4 w-4" />
                        Rozwiń ({weeks.length - 2} więcej)
                      </div>
                    )}
                  </SelectContent>
                </Select>
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
                  <SelectContent className="max-h-[300px] bg-background">
                    {displayedWeeks.map(week => (
                      <SelectItem key={week.number} value={week.number.toString()}>
                        {week.displayLabel}
                      </SelectItem>
                    ))}
                    {!showAllWeeks && weeks.length > 2 && (
                      <div 
                        className="px-2 py-2 text-sm text-primary cursor-pointer hover:bg-muted flex items-center justify-center gap-1 border-t"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAllWeeks(true);
                        }}
                      >
                        <ChevronDown className="h-4 w-4" />
                        Rozwiń ({weeks.length - 2} więcej)
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Payment Method Section */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm">Sposób rozliczenia:</Label>
                <Select 
                  value={driverPaymentMethod || 'transfer'} 
                  onValueChange={handlePaymentMethodChange}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Wybierz sposób płatności" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transfer">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Przelew bankowy
                      </div>
                    </SelectItem>
                    <SelectItem value="cash">
                      <div className="flex items-center gap-2">
                        <Banknote className="h-4 w-4" />
                        Gotówka
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                
                {driverPaymentMethod === 'transfer' && (
                  <Input 
                    value={driverIban || ''} 
                    onChange={(e) => handleIbanChange(e.target.value)}
                    placeholder="PL XX XXXX XXXX XXXX XXXX XXXX XXXX"
                    className="h-10 mt-2"
                  />
                )}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
      <CardContent className={hideControls ? "p-0" : "space-y-6"}>

        {loading ? (
          <div className="text-center py-4">{t('weekly.loading')}</div>
        ) : settlements.length === 0 ? (
          <div className="space-y-4">
            {/* Warning banner with fleet contact - different message based on fleet settlement status */}
            <Card className={fleetHasSettlement 
              ? "border-blue-300 bg-blue-50 p-4"
              : "border-amber-300 bg-amber-50 p-4"
            }>
              <div className="flex items-start gap-3">
                <AlertTriangle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                  fleetHasSettlement ? 'text-blue-600' : 'text-amber-600'
                }`} />
                <div>
                  {fleetHasSettlement ? (
                    <>
                      <p className="font-semibold text-blue-800">
                        Nie byłeś w tym rozliczeniu
                      </p>
                      <p className="text-sm text-blue-700 mt-1">
                        Twoje dane nie zostały uwzględnione w tym okresie rozliczeniowym.
                        Jeśli uważasz, że to błąd, skontaktuj się z administratorem floty:
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-amber-800">
                        Rozliczenie nie sporządzone
                      </p>
                      <p className="text-sm text-amber-700 mt-1">
                        Skontaktuj się z administratorem swojej floty:
                      </p>
                    </>
                  )}
                  {fleetContact && (fleetContact.name || fleetContact.phone) && (
                    <div className="mt-2 flex items-center gap-2">
                      <Phone className={`h-4 w-4 ${fleetHasSettlement ? 'text-blue-600' : 'text-amber-600'}`} />
                      <span className={`font-medium ${fleetHasSettlement ? 'text-blue-800' : 'text-amber-800'}`}>
                        {fleetContact.name}{fleetContact.name && fleetContact.phone ? ': ' : ''}{fleetContact.phone}
                      </span>
                    </div>
                  )}
                  {lastAvailableWeek && (
                    <p className={`text-xs mt-2 ${fleetHasSettlement ? 'text-blue-600' : 'text-amber-600'}`}>
                      💡 Ostatnie dostępne rozliczenie: {lastAvailableWeek}
                    </p>
                  )}
                </div>
              </div>
            </Card>
            
            {/* Zeroed-out settlement view */}
            <div className="flex flex-wrap gap-4">
              {/* White summary box with zeros */}
              <div className="border rounded-lg overflow-hidden flex-1 min-w-[300px]">
                <div className="bg-white p-4 space-y-3">
                  <div className="flex justify-between text-base font-bold pb-3 border-b border-dashed border-gray-300">
                    <span className="font-bold">{t('weekly.totalBeforeCommission')}:</span>
                    <span className="font-bold text-muted-foreground text-lg">0.00 zł</span>
                  </div>
                  <div className="flex justify-between text-base font-bold pb-3 border-b border-dashed border-gray-300">
                    <span className="font-bold">{isB2BDriver ? 'B2B VAT we własnym zakresie' : t('weekly.totalTax')}:</span>
                    <span className="font-bold text-muted-foreground text-lg">0.00 zł</span>
                  </div>
                </div>
                <div className="border-t bg-purple-100 p-4 rounded-b-lg">
                  <div className="flex justify-between">
                    <span className="font-extrabold text-xl">{t('weekly.payout')}:</span>
                    <span className="font-extrabold text-xl text-muted-foreground">0.00 zł</span>
                  </div>
                </div>
              </div>
              
              {/* Platform table with dashes */}
              <div className="border rounded-lg overflow-hidden flex-1 min-w-[300px] bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs">
                      <th className="text-left p-2">{t('weekly.category')}</th>
                      <th className="text-right p-2">Uber</th>
                      <th className="text-right p-2">Bolt</th>
                      <th className="text-right p-2">FreeNow</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t">
                      <td className="p-2">{t('weekly.base')}</td>
                      <td className="text-right p-2 text-muted-foreground">-</td>
                      <td className="text-right p-2 text-muted-foreground">-</td>
                      <td className="text-right p-2 text-muted-foreground">-</td>
                    </tr>
                    <tr className="border-t">
                      <td className="p-2">{t('weekly.commission')}</td>
                      <td className="text-right p-2 text-muted-foreground">-</td>
                      <td className="text-right p-2 text-muted-foreground">-</td>
                      <td className="text-right p-2 text-muted-foreground">-</td>
                    </tr>
                    <tr className="border-t">
                      <td className="p-2">{t('weekly.cashCollected')}</td>
                      <td className="text-right p-2 text-muted-foreground">-</td>
                      <td className="text-right p-2 text-muted-foreground">-</td>
                      <td className="text-right p-2 text-muted-foreground">-</td>
                    </tr>
                    <tr className="border-t">
                      <td className="p-2">{t('weekly.tax8')}</td>
                      <td className="text-right p-2 text-muted-foreground">-</td>
                      <td className="text-right p-2 text-muted-foreground">-</td>
                      <td className="text-right p-2 text-muted-foreground">-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {periods.map((period) => {
                const periodKey = `${period.period_from}_${period.period_to}`;
                const settlement = period.settlements[0]; // Take newest settlement
                const rawAmounts = settlement.amounts || {};
                // Pass dynamic fuel data to normalizeAmounts if available
                const amounts = normalizeAmounts(rawAmounts, driverFuelData || undefined);
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
                        {/* Bolt: używamy bolt_payout_s (netto po prowizji) */}
                        {/* Uber: uber_payout_d (wypłata netto) */}
                        {/* FreeNow: base - commission */}
                        <div className="flex justify-between text-base font-bold pb-3 border-b border-dashed border-gray-300">
                          <span className="font-bold">{t('weekly.totalBeforeCommission')}:</span>
                          <span className="font-bold text-green-600 text-lg">
                            {((amounts.uber_base || 0) +
                              (amounts.bolt_projected_d || 0) +
                              (amounts.freenow_base_s || 0)).toFixed(2)} zł
                          </span>
                        </div>
                        
                        {/* Razem gotówka - DUŻA CZCIONKA */}
                        {((amounts.uber_cash_f || 0) + (amounts.bolt_cash || 0) + (amounts.freenow_cash_f || 0)) !== 0 && (
                          <div className="flex justify-between text-base font-bold pb-3 border-b border-dashed border-gray-300">
                            <span className="font-bold">{t('weekly.totalCash')}:</span>
                            <span className="font-bold text-red-600 text-lg">
                              -{Math.abs((amounts.uber_cash_f || 0) + (amounts.bolt_cash || 0) + (amounts.freenow_cash_f || 0)).toFixed(2)} zł
                            </span>
                          </div>
                        )}
                        
                        {/* Razem podatek - DUŻA CZCIONKA (ukryty dla B2B) */}
                        {!isB2BDriver && (
                          <div className="flex justify-between text-base font-bold pb-3 border-b border-dashed border-gray-300">
                            <span className="font-bold">
                              {(fleetVatRate ?? 8) === 8 
                                ? t('weekly.totalTax')
                                : `${t('weekly.totalTax')} + inne opłaty ${fleetVatRate}%`
                              }:
                            </span>
                            <span className="font-bold text-foreground text-lg">-{totalTax.toFixed(2)} zł</span>
                          </div>
                        )}
                        {isB2BDriver && (
                          <div className="flex justify-between text-base font-bold pb-3 border-b border-dashed border-gray-300">
                            <span className={`font-bold ${b2bVatPayer ? 'text-blue-600' : 'text-foreground'}`}>
                              {b2bVatPayer 
                                ? "B2B VAT we własnym zakresie:" 
                                : "B2B z potrąceniem VAT 8%:"}
                            </span>
                            <span className={`font-bold text-lg ${b2bVatPayer ? 'text-blue-600' : 'text-foreground'}`}>
                              {b2bVatPayer 
                                ? "0.00 zł" 
                                : `-${totalTax.toFixed(2)} zł`}
                            </span>
                          </div>
                        )}
                        
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
                        {/* Zleć wypłatę button for non-weekly drivers */}
                        {settlementFrequency !== 'weekly' && (
                          <div className="mt-3">
                            <Button
                              variant={payoutRequested ? "secondary" : "default"}
                              className="w-full gap-2"
                              onClick={async () => {
                                try {
                                  const { error } = await supabase
                                    .from('driver_app_users')
                                    .update({ payout_requested_at: new Date().toISOString() })
                                    .eq('driver_id', driverId);
                                  
                                  if (error) throw error;
                                  setPayoutRequested(true);
                                  
                                  // Calculate nearest Monday (next payout date)
                                  const now = new Date();
                                  const dayOfWeek = now.getDay();
                                  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
                                  const nextMonday = new Date(now);
                                  nextMonday.setDate(now.getDate() + daysUntilMonday);
                                  const formattedDate = format(nextMonday, 'd MMMM', { locale: pl });
                                  
                                  toast.success(`Wypłata zlecona! Trafi na listę wypłat ${formattedDate}. Opłata 50 zł za rozliczenie.`);
                                } catch (error) {
                                  console.error('Error requesting payout:', error);
                                  toast.error('Błąd zlecania wypłaty');
                                }
                              }}
                              disabled={payoutRequested}
                            >
                              {payoutRequested ? (
                                <>✓ Wypłata zlecona</>
                              ) : (
                                <>💰 Zleć wypłatę</>
                              )}
                            </Button>
                            {payoutRequested && (
                              <p className="text-xs text-green-600 mt-2 text-center">
                                Twoja wypłata trafi do najbliższej listy wypłat (opłata 50 zł)
                              </p>
                            )}
                          </div>
                        )}
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
                                {amounts.uber_base !== undefined && amounts.uber_base !== 0 ? `${amounts.uber_base.toFixed(2)} zł` : '-'}
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
                                {amounts.uber_commission ? `-${amounts.uber_commission.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-1.5 text-right font-medium text-amber-600 whitespace-nowrap text-xs">
                                {amounts.bolt_commission ? `-${amounts.bolt_commission.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-1.5 text-right font-medium text-amber-600 whitespace-nowrap text-xs">
                                {amounts.freenow_commission_t ? `-${amounts.freenow_commission_t.toFixed(2)} zł` : '-'}
                              </td>
                            </tr>
                            
                            {/* Gotówka pobrana (z minusem dla jasności) */}
                            <tr className="border-t hover:bg-muted/50">
                              <td className="p-1.5 text-muted-foreground text-xs">{t('weekly.cashCollected')}</td>
                              <td className="p-1.5 text-right font-medium text-red-600 whitespace-nowrap text-xs">
                                {amounts.uber_cash_f ? `-${amounts.uber_cash_f.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-1.5 text-right font-medium text-red-600 whitespace-nowrap text-xs">
                                {amounts.bolt_cash ? `-${amounts.bolt_cash.toFixed(2)} zł` : '-'}
                              </td>
                              <td className="p-1.5 text-right font-medium text-red-600 whitespace-nowrap text-xs">
                                {amounts.freenow_cash_f ? `-${amounts.freenow_cash_f.toFixed(2)} zł` : '-'}
                              </td>
                            </tr>
                            
                            {/* Podatek 8% - ukryty dla B2B */}
                            {!isB2BDriver && (
                              <tr className="border-t hover:bg-muted/50">
                                <td className="p-1.5 text-muted-foreground text-xs">{t('weekly.tax8')}</td>
                                <td className="p-1.5 text-right font-medium text-destructive whitespace-nowrap text-xs">
                                  {amounts.uber_tax_8 ? `-${Math.abs(amounts.uber_tax_8).toFixed(2)} zł` : '-'}
                                </td>
                                <td className="p-1.5 text-right font-medium text-destructive whitespace-nowrap text-xs">
                                  {amounts.bolt_tax_8 ? `-${Math.abs(amounts.bolt_tax_8).toFixed(2)} zł` : '-'}
                                </td>
                                <td className="p-1.5 text-right font-medium text-destructive whitespace-nowrap text-xs">
                                  {amounts.freenow_tax_8 ? `-${Math.abs(amounts.freenow_tax_8).toFixed(2)} zł` : '-'}
                                </td>
                              </tr>
                            )}
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
                    
                    {/* Chart and B2B Invoice - side by side */}
                    <div className="flex flex-wrap gap-4 w-full">
                      {/* Chart */}
                      {platformData.length > 0 && (
                        <Card className="flex-1 min-w-[280px] max-w-md">
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
                      
                      {/* B2B Invoice Card - for B2B drivers */}
                      {isB2BDriver && (
                        <div className="flex-1 min-w-[280px] max-w-md">
                          <B2BInvoiceCard
                            driverId={driverId}
                            driverName={driverName}
                            year={selectedYear}
                            month={new Date(period.period_from).getMonth() + 1}
                            fleetId={driverFleetId}
                          />
                        </div>
                      )}
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