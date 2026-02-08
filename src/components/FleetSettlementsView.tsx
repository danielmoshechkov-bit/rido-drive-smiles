import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { pl } from 'date-fns/locale';
import { toast } from 'sonner';
import { Check, X, AlertCircle, Search, ChevronDown, ChevronUp, Banknote, CreditCard, Download, Trash2, Loader2, Users, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { UniversalSubTabBar } from './UniversalSubTabBar';
import { DriverSettlements } from './DriverSettlements';
import { FleetFuelView } from './FleetFuelView';
import { FuelCSVUpload } from './FuelCSVUpload';
import { CompanyRevenueSummary } from './CompanyRevenueSummary';
import { FleetVehicleRevenue } from './FleetVehicleRevenue';
import { FleetSettlementImport } from './fleet/FleetSettlementImport';
import { FleetSettlementSettings } from './fleet/FleetSettlementSettings';
import { DriverDebtHistory } from './DriverDebtHistory';
import { UnmappedDriversModal } from './fleet/UnmappedDriversModal';
import { useUserRole } from '@/hooks/useUserRole';
import { getAvailableWeeks, getCurrentWeekNumber, getWeekDates } from '@/lib/utils';

interface FleetSettlementsViewProps {
  fleetId: string;
  viewType: 'settlement' | 'rental';
  periodFrom?: string;
  periodTo?: string;
}

interface DriverSettlement {
  driver_id: string;
  driver_name: string;
  uber_base: number;
  uber_cash: number;
  bolt_base: number;
  bolt_cash: number;
  bolt_commission: number;
  freenow_base: number;
  freenow_cash: number;
  freenow_commission: number;
  total_base: number;
  uber_commission: number;
  total_commission: number;
  total_cash: number;
  tax_8_percent: number;
  vat_amount: number;
  service_fee: number;
  additional_fees: { name: string; amount: number }[];
  net_without_commission: number;
  final_payout: number;
  rental?: number;
  fuel: number;
  fuel_vat_refund: number;
  // For rental view
  vehicle?: string;
  weekly_rental_fee?: number;
  debt_current?: number;
  debt_previous?: number;
  covered_rental?: boolean;
  // For negative balance tracking
  has_negative_balance?: boolean;
}

interface FleetFee {
  id: string;
  name: string;
  amount: number;
  vat_rate: number;
  frequency: string;
  type: string;
  is_active: boolean;
}

export function FleetSettlementsView({ fleetId, viewType, periodFrom, periodTo }: FleetSettlementsViewProps) {
  const [settlements, setSettlements] = useState<DriverSettlement[]>([]);
  const [activeFees, setActiveFees] = useState<FleetFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState("drivers");
  const { roles } = useUserRole();
  const [myDriverId, setMyDriverId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<number>(getCurrentWeekNumber(new Date().getFullYear()));
  const [cities, setCities] = useState<{id: string, name: string}[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showZeroRows, setShowZeroRows] = useState<boolean>(false);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [payoutType, setPayoutType] = useState<'cash' | 'transfer' | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteCityId, setDeleteCityId] = useState<string>('all');
  const [debtDialogOpen, setDebtDialogOpen] = useState(false);
  const [selectedDriverForDebt, setSelectedDriverForDebt] = useState<{id: string, name: string} | null>(null);
  const [driverDebts, setDriverDebts] = useState<Record<string, number>>({});
  const [unmappedDrivers, setUnmappedDrivers] = useState<any[]>([]);
  const [showUnmappedModal, setShowUnmappedModal] = useState(false);
  const [checkingUnmapped, setCheckingUnmapped] = useState(false);
  const [newRecordsAlert, setNewRecordsAlert] = useState<number>(0);

  // Check for unmapped drivers - only shows truly NEW platform IDs from CSV imports
  const handleCheckUnmappedDrivers = async () => {
    setCheckingUnmapped(true);
    try {
      // Only check unmapped_settlement_drivers table - this contains NEW IDs from CSV
      // that couldn't be matched to any existing driver
      const { data: unmapped, error } = await supabase
        .from('unmapped_settlement_drivers')
        .select('*')
        .eq('fleet_id', fleetId)
        .eq('status', 'pending');
      
      if (error) throw error;

      // NOTE: We no longer add drivers without driver_app_users here
      // because those are already in the system with platform IDs assigned.
      // The purpose of this modal is to map NEW platform IDs from CSV,
      // not to manage existing drivers' app accounts.
      
      if ((unmapped || []).length > 0) {
        setUnmappedDrivers(unmapped || []);
        setShowUnmappedModal(true);
      } else {
        toast.info('Brak nowych kierowców do zmapowania. Wszystkie ID z CSV zostały przypisane.');
      }
    } catch (err) {
      console.error('Error checking unmapped drivers:', err);
      toast.error('Błąd sprawdzania nowych kierowców');
    } finally {
      setCheckingUnmapped(false);
    }
  };

  // Auto-check for new records after settlement data loads
  // Only counts truly NEW platform IDs from CSV, not existing drivers without accounts
  const checkForNewRecordsAfterLoad = async () => {
    try {
      const { count: pendingCount } = await supabase
        .from('unmapped_settlement_drivers')
        .select('*', { count: 'exact', head: true })
        .eq('fleet_id', fleetId)
        .eq('status', 'pending');

      // Only count pending unmapped records - NOT drivers without app accounts
      // because those are already in the system with assigned platform IDs
      setNewRecordsAlert(pendingCount || 0);
    } catch (err) {
      console.error('Error checking new records:', err);
    }
  };

  // Fetch cities for filter
  useEffect(() => {
    const fetchCities = async () => {
      const { data } = await supabase.from('cities').select('id, name').order('name');
      if (data) setCities(data);
    };
    fetchCities();
  }, []);

  // Format currency in Polish style (without zł suffix for better alignment)
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Color amounts based on value
  const getAmountColor = (amount: number) => {
    if (amount > 0) return 'text-green-600 font-semibold';
    if (amount < 0) return 'text-red-600 font-semibold';
    return 'text-muted-foreground';
  };

  // Helper function for displaying values: 
  // - Shows value if > 0
  // - Shows "0,00" if driver worked on platform but no value (base > 0)
  // - Shows "-" if driver didn't work on platform at all (base === 0)
  const displayValue = (value: number, hasActivity: boolean, isDeduction = false): string => {
    if (value > 0) {
      return isDeduction ? `-${formatCurrency(value)}` : formatCurrency(value);
    }
    if (hasActivity) {
      return '0,00';
    }
    return '-';
  };

  // Generate cash payout document (KW) - as printable HTML
  const handleGenerateCashPayouts = async (cityId: string) => {
    try {
      // Filter settlements by city (need to get driver city data) + settlement frequency
      const { data: driversWithCity } = await supabase
        .from('drivers')
        .select(`
          id, city_id, payment_method, first_name, last_name, phone,
          driver_app_users!left(settlement_frequency, payout_requested_at)
        `)
        .eq('fleet_id', fleetId);
      
      if (!driversWithCity) {
        toast.error('Brak danych kierowców');
        return;
      }

      const driverMap = new Map(driversWithCity.map(d => [d.id, d as any]));
      
      // Filter by city and cash payment method
      // Include drivers with weekly frequency OR those who requested payout
      const cashDrivers = settlements.filter(s => {
        const driver = driverMap.get(s.driver_id);
        if (!driver) return false;
        if (cityId !== 'all' && driver.city_id !== cityId) return false;
        if (driver.payment_method !== 'cash') return false;
        
        const appUser = driver.driver_app_users?.[0];
        const isWeekly = !appUser?.settlement_frequency || appUser.settlement_frequency === 'weekly';
        const requestedPayout = !!appUser?.payout_requested_at;
        
        return isWeekly || requestedPayout;
      });

      if (cashDrivers.length === 0) {
        toast.info('Brak kierowców z rozliczeniem gotówkowym dla wybranego miasta');
        return;
      }

      // Separate payouts from debts
      const payouts = cashDrivers.filter(s => s.final_payout > 0);
      const debts = cashDrivers.filter(s => s.final_payout < 0);
      
      const totalPayout = payouts.reduce((sum, s) => sum + s.final_payout, 0);
      const totalDebt = Math.abs(debts.reduce((sum, s) => sum + s.final_payout, 0));
      
      // Use Monday date of the settlement period
      const mondayDate = currentWeek?.start 
        ? format(new Date(currentWeek.start), 'dd.MM.yyyy')
        : format(new Date(), 'dd.MM.yyyy');
      
      // Generate printable HTML document
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>KW Gotówka - ${mondayDate}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; }
            h1 { text-align: center; margin-bottom: 30px; font-size: 18px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th, td { border: 1px solid #000; padding: 10px; text-align: left; }
            th { background-color: #f0f0f0; font-weight: bold; }
            .amount { text-align: right; }
            .payout { color: #16a34a; }
            .debt { color: #dc2626; }
            .signature { width: 150px; }
            .totals { margin-top: 30px; font-size: 16px; }
            .totals p { margin: 10px 0; }
            @media print {
              body { padding: 20px; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>${mondayDate} &nbsp;&nbsp; KW / Gotówka</h1>
          <table>
            <thead>
              <tr>
                <th style="width: 50px;">Lp.</th>
                <th>Imię i nazwisko</th>
                <th class="amount" style="width: 120px;">Kwota</th>
                <th class="signature">Podpis</th>
              </tr>
            </thead>
            <tbody>
              ${[...payouts, ...debts].map((s, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${s.driver_name}</td>
                  <td class="amount ${s.final_payout >= 0 ? 'payout' : 'debt'}">${s.final_payout.toFixed(2).replace('.', ',')} zł</td>
                  <td class="signature"></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="totals">
            <p class="payout"><strong>WYPŁATA:</strong> ${totalPayout.toFixed(2).replace('.', ',')} zł</p>
            <p class="debt"><strong>DŁUG:</strong> ${totalDebt.toFixed(2).replace('.', ',')} zł</p>
          </div>
        </body>
        </html>
      `;
      
      // Open in new window for print
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.onload = () => printWindow.print();
      } else {
        toast.error('Przeglądarka zablokowała okno wydruku. Odblokuj popupy dla tej strony.');
      }
      
      // Clear payout_requested_at for processed drivers
      const processedDriverIds = cashDrivers.map(s => s.driver_id);
      await supabase
        .from('driver_app_users')
        .update({ payout_requested_at: null })
        .in('driver_id', processedDriverIds);
      
      toast.success('Lista wypłat gotówkowych została wygenerowana');
    } catch (error) {
      console.error('Error generating cash payouts:', error);
      toast.error('Błąd podczas generowania listy');
    }
  };

  // Generate transfer list
  const handleGenerateTransfers = async (cityId: string) => {
    try {
      // Filter settlements by city and transfer payment method + settlement frequency
      const { data: driversWithCity } = await supabase
        .from('drivers')
        .select(`
          id, city_id, payment_method, iban, first_name, last_name,
          driver_app_users!left(settlement_frequency, payout_requested_at)
        `)
        .eq('fleet_id', fleetId);
      
      if (!driversWithCity) {
        toast.error('Brak danych kierowców');
        return;
      }

      const driverMap = new Map(driversWithCity.map(d => [d.id, d as any]));
      
      // Filter by city and transfer payment method with positive payout
      // Include drivers with weekly frequency OR those who requested payout
      const transferDrivers = settlements.filter(s => {
        const driver = driverMap.get(s.driver_id);
        if (!driver) return false;
        if (cityId !== 'all' && driver.city_id !== cityId) return false;
        if (driver.payment_method !== 'transfer') return false;
        if (s.final_payout <= 0) return false;
        
        const appUser = driver.driver_app_users?.[0];
        const isWeekly = !appUser?.settlement_frequency || appUser.settlement_frequency === 'weekly';
        const requestedPayout = !!appUser?.payout_requested_at;
        
        return isWeekly || requestedPayout;
      });

      if (transferDrivers.length === 0) {
        toast.info('Brak kierowców z przelewem dla wybranego miasta');
        return;
      }

      // Build CSV for bank import
      let csvContent = `Odbiorca;IBAN;Kwota;Tytuł\n`;
      
      const periodLabel = currentWeek?.label || `Tydzień ${selectedWeek}`;
      
      transferDrivers.forEach(s => {
        const driver = driverMap.get(s.driver_id);
        const iban = driver?.iban || '';
        const amount = s.final_payout.toFixed(2).replace('.', ',');
        csvContent += `${s.driver_name};${iban};${amount};Rozliczenie ${periodLabel}\n`;
      });
      
      // Use Monday date for filename
      const mondayDate = currentWeek?.start 
        ? format(new Date(currentWeek.start), 'dd.MM.yyyy')
        : format(new Date(), 'dd.MM.yyyy');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${mondayDate}_Przelewy.csv`;
      link.click();
      
      // Clear payout_requested_at for processed drivers
      const processedDriverIds = transferDrivers.map(s => s.driver_id);
      await supabase
        .from('driver_app_users')
        .update({ payout_requested_at: null })
        .in('driver_id', processedDriverIds);
      
      toast.success('Lista przelewów została wygenerowana');
    } catch (error) {
      console.error('Error generating transfers:', error);
      toast.error('Błąd podczas generowania listy');
    }
  };

  // Delete settlements for selected period
  const handleDeleteSettlements = async () => {
    if (!currentWeek) {
      toast.error('Nie wybrano okresu rozliczeniowego');
      return;
    }

    setIsDeleting(true);
    try {
      // Get all drivers from fleet
      const { data: driversData } = await supabase
        .from('drivers')
        .select('id, city_id')
        .eq('fleet_id', fleetId);

      if (!driversData || driversData.length === 0) {
        toast.error('Brak kierowców we flocie');
        setIsDeleting(false);
        return;
      }

      // Filter by city if selected
      let driverIds = driversData.map(d => d.id);
      if (deleteCityId !== 'all') {
        driverIds = driversData.filter(d => d.city_id === deleteCityId).map(d => d.id);
      }

      if (driverIds.length === 0) {
        toast.error('Brak kierowców dla wybranego miasta');
        setIsDeleting(false);
        return;
      }

      // 1. Fetch settlements to delete (to revert debt payments)
      const { data: settlementsToDelete, error: fetchError } = await supabase
        .from('settlements')
        .select('id, driver_id, debt_payment, actual_payout')
        .in('driver_id', driverIds)
        .gte('period_from', currentWeek.start)
        .lte('period_to', currentWeek.end);

      if (fetchError) throw fetchError;

      if (!settlementsToDelete || settlementsToDelete.length === 0) {
        toast.info('Brak rozliczeń do usunięcia dla wybranego okresu');
        setIsDeleting(false);
        setDeleteDialogOpen(false);
        return;
      }

      console.log(`🗑️ Deleting ${settlementsToDelete.length} settlements...`);

      // 2. Revert debt payments for each driver
      for (const settlement of settlementsToDelete) {
        if (settlement.debt_payment && settlement.debt_payment > 0) {
          console.log(`💰 Reverting debt payment for driver ${settlement.driver_id}: +${settlement.debt_payment}`);
          await supabase.rpc('increment_driver_debt', {
            p_driver_id: settlement.driver_id,
            p_amount: settlement.debt_payment
          });
        }
      }

      // 3. Delete settlements from database
      const settlementIds = settlementsToDelete.map(s => s.id);
      const { error: deleteError } = await supabase
        .from('settlements')
        .delete()
        .in('id', settlementIds);

      if (deleteError) throw deleteError;

      toast.success(`✅ Usunięto ${settlementsToDelete.length} rozliczeń`);
      setDeleteDialogOpen(false);
      setDeleteCityId('all');
      
      // Refresh settlements list
      fetchSettlements();
    } catch (error: any) {
      console.error('Error deleting settlements:', error);
      toast.error('Błąd usuwania rozliczeń: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };


  useEffect(() => {
    if (fleetId) {
      fetchLatestSettlement();
    }
  }, [fleetId]);

  // Check if user is also a driver
  const isDriver = roles.includes('driver');

  // Generate week options for the selected year
  const weeks = getAvailableWeeks(selectedYear);
  const currentWeek = weeks.find(w => w.number === selectedWeek);

  useEffect(() => {
    if (fleetId && selectedWeek !== null) {
      fetchSettlements();
      checkForNewRecordsAfterLoad();
    }
  }, [fleetId, periodFrom, periodTo, selectedYear, selectedWeek, selectedCityId]);

  useEffect(() => {
    // For admin, default to "my" (Przychód firmy)
    if (roles.includes('admin')) {
      setActiveSubTab("my");
    } else if (isDriver) {
      fetchMyDriverId();
    }
  }, [isDriver, roles]);

  const fetchMyDriverId = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('driver_app_users')
        .select('driver_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data?.driver_id) {
        setMyDriverId(data.driver_id);
        
        // Only set default tab if not admin (admins default to "my" for company revenue)
        if (!roles.includes('admin')) {
          // Check if this driver has any settlements
          const { data: hasSettlements } = await supabase
            .from('settlements')
            .select('id')
            .eq('driver_id', data.driver_id)
            .limit(1)
            .maybeSingle();
          
          // If has settlements, default to "my", otherwise "drivers"
          if (hasSettlements) {
            setActiveSubTab("my");
          } else {
            setActiveSubTab("drivers");
          }
        }
      }
    } catch (error) {
      console.error('Error fetching driver ID:', error);
      setActiveSubTab("drivers");
    }
  };

  const fetchLatestSettlement = async () => {
    try {
      // Get all drivers from fleet
      const { data: driversData } = await supabase
        .from('drivers')
        .select('id')
        .eq('fleet_id', fleetId);

      if (!driversData || driversData.length === 0) return;

      const driverIds = driversData.map(d => d.id);

      // Get latest settlement
      const { data: latestSettlement } = await supabase
        .from('settlements')
        .select('period_from, period_to')
        .in('driver_id', driverIds)
        .order('period_from', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestSettlement?.period_from) {
        const latestDate = new Date(latestSettlement.period_from);
        const year = latestDate.getFullYear();
        
        // Calculate week number by finding matching week range
        const weeks = getWeekDates(year);
        const matchingWeek = weeks.find(w => {
          const weekStart = new Date(w.start);
          const weekEnd = new Date(w.end);
          const settlementStart = new Date(latestSettlement.period_from);
          return settlementStart >= weekStart && settlementStart <= weekEnd;
        });

        if (matchingWeek) {
          setSelectedYear(year);
          setSelectedWeek(matchingWeek.number);
        } else if (weeks.length > 0) {
          setSelectedWeek(weeks[0].number); // najnowszy
        }
      } else {
        const weeks = getWeekDates(selectedYear);
        if (weeks.length > 0) {
          setSelectedWeek(weeks[0].number);
        }
      }
    } catch (error) {
      console.error('Error fetching latest settlement:', error);
      // Fallback to newest week
      const weeks = getWeekDates(selectedYear);
      if (weeks.length > 0) {
        setSelectedWeek(weeks[0].number);
      }
    }
  };

  const fetchSettlements = async () => {
    setLoading(true);
    try {
      console.log('🔍 Fetching settlements for fleetId:', fleetId, 'cityId:', selectedCityId);
      console.log('📅 Selected period:', { year: selectedYear, week: selectedWeek, currentWeek });

      // Fetch fleet settings (VAT rate and base fee)
      const { data: fleetData } = await supabase
        .from('fleets')
        .select('vat_rate, base_fee')
        .eq('id', fleetId)
        .maybeSingle();
      
      const fleetVatRate = (fleetData as any)?.vat_rate ?? 8;
      const fleetBaseFee = (fleetData as any)?.base_fee ?? 0;

      // Fetch active fleet settlement fees
      const { data: fleetFeesData } = await supabase
        .from('fleet_settlement_fees' as any)
        .select('*')
        .eq('fleet_id', fleetId)
        .eq('is_active', true);
      
      const fleetFees = (fleetFeesData as unknown as FleetFee[]) || [];
      setActiveFees(fleetFees);

      // Pobierz kierowców z floty wraz z danymi o pojazdach, planach i payment_method
      let driversQuery = supabase
        .from('drivers')
        .select(`
          id, 
          first_name, 
          last_name,
          city_id,
          fuel_card_number,
          payment_method,
          driver_app_users!left(settlement_plan_id, user_id)
        `)
        .eq('fleet_id', fleetId);

      // Filter by city if selected
      if (selectedCityId && selectedCityId !== 'all') {
        driversQuery = driversQuery.eq('city_id', selectedCityId);
      }

      const { data: driversData, error: driversError } = await driversQuery;

      if (driversError) throw driversError;
      console.log('👥 Drivers found:', driversData?.length || 0);

      if (!driversData || driversData.length === 0) {
        setSettlements([]);
        setLoading(false);
        return;
      }

      const driverIds = driversData.map(d => d.id);

      // Pobierz rozliczenia dla wybranego okresu (bez filtrowania po platform!)
      let query = supabase
        .from('settlements')
        .select('*')
        .in('driver_id', driverIds);

      if (currentWeek) {
        query = query
          .gte('period_from', currentWeek.start)
          .lte('period_to', currentWeek.end);
      } else {
        if (periodFrom) query = query.gte('period_from', periodFrom);
        if (periodTo) query = query.lte('period_to', periodTo);
      }

      const { data: settlementsData, error: settlementsError } = await query;

      if (settlementsError) throw settlementsError;
      console.log('💰 Settlements found:', settlementsData?.length || 0);
      console.log('📊 Settlement sample:', settlementsData?.[0]);

      // Pobierz plany rozliczeniowe
      const { data: plansData } = await supabase
        .from('settlement_plans')
        .select('*');

      // Pobierz aktywne przypisania pojazdów z opłatą wynajmu
      const { data: assignmentsData } = await supabase
        .from('driver_vehicle_assignments')
        .select(`
          driver_id,
          vehicle_id,
          vehicles(weekly_rental_fee)
        `)
        .in('driver_id', driverIds)
        .eq('status', 'active');

      // Pobierz transakcje paliwowe dla okresu - dynamicznie jak w DriverSettlements
      const periodStart = currentWeek?.start || periodFrom;
      const periodEnd = currentWeek?.end || periodTo;
      
      let fuelQuery = supabase
        .from('fuel_transactions')
        .select('card_number, total_amount');
      
      if (periodStart) fuelQuery = fuelQuery.gte('period_from', periodStart);
      if (periodEnd) fuelQuery = fuelQuery.lte('period_to', periodEnd);
      
      const { data: fuelTransactions } = await fuelQuery;
      console.log('⛽ Fuel transactions found:', fuelTransactions?.length || 0);
      
      // Pobierz profile B2B dla kierowców aby sprawdzić vat_payer
      const userIds = driversData
        .map(d => (d as any).driver_app_users?.user_id)
        .filter(Boolean);
      
      const { data: b2bProfiles } = await supabase
        .from('driver_b2b_profiles')
        .select('driver_user_id, vat_payer, payment_preference')
        .in('driver_user_id', userIds);
      
      const b2bProfilesMap = new Map(
        (b2bProfiles || []).map(p => [p.driver_user_id, p])
      );

      // Pobierz aktualne długi kierowców
      const { data: debtsData } = await supabase
        .from('driver_debts')
        .select('driver_id, current_balance')
        .in('driver_id', driverIds);
      
      const debtsMap: Record<string, number> = {};
      (debtsData || []).forEach(d => {
        debtsMap[d.driver_id] = d.current_balance || 0;
      });
      setDriverDebts(debtsMap);

      // Mapuj numery kart paliwowych kierowców (normalizacja - usuń wiodące zera)
      const driverFuelCards: Record<string, string> = {};
      driversData.forEach(d => {
        const driver = d as any;
        if (driver.fuel_card_number) {
          driverFuelCards[driver.id] = driver.fuel_card_number.replace(/^0+/, '');
        }
      });

      // Agreguj rozliczenia per kierowca
      const aggregated = driversData.map(driver => {
        const driverSettlements = settlementsData?.filter(s => s.driver_id === driver.id) || [];

        // Parsuj amounts JSONB - obsługuj NOWE klucze snake_case z bazy oraz STARE camelCase z CSV importu
        const uber_base = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          // Nowy format: uber_base, stary: uber, uberBase, uberCashless
          const uber = parseFloat(amounts.uber_base || amounts.uber || amounts.uberBase || amounts.uberCashless || '0');
          return sum + uber;
        }, 0);

        const bolt_base = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          // Nowy format: bolt_projected_d, stary: boltGross
          const bolt = parseFloat(amounts.bolt_projected_d || amounts.boltGross || '0');
          return sum + bolt;
        }, 0);

        const freenow_base = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          // Nowy format: freenow_base_s, stary: freenowGross
          const freenow = parseFloat(amounts.freenow_base_s || amounts.freenowGross || '0');
          return sum + freenow;
        }, 0);

        // Aggregate commission per platform
        const uber_commission = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          return sum + parseFloat(amounts.uber_commission || amounts.uberCommission || '0');
        }, 0);

        const bolt_commission = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          return sum + parseFloat(amounts.bolt_commission || amounts.boltCommission || '0');
        }, 0);

        const freenow_commission = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          return sum + parseFloat(amounts.freenow_commission_t || amounts.freenowCommission || '0');
        }, 0);

        const total_commission = uber_commission + bolt_commission + freenow_commission;

        // Aggregate cash per platform
        const uber_cash = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          return sum + parseFloat(amounts.uber_cash_f || amounts.uberCash || '0');
        }, 0);

        const bolt_cash = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          return sum + parseFloat(amounts.bolt_cash || amounts.boltCash || '0');
        }, 0);

        const freenow_cash = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          return sum + parseFloat(amounts.freenow_cash_f || amounts.freenowCash || '0');
        }, 0);

        const total_cash = uber_cash + bolt_cash + freenow_cash;

        // Aggregate fuel costs and VAT refunds - DYNAMICZNIE z fuel_transactions
        const driverCardNumber = driverFuelCards[driver.id];
        let total_fuel = 0;
        let total_fuel_vat_refund = 0;

        if (driverCardNumber && fuelTransactions) {
          const matchingFuel = fuelTransactions.filter(tx => 
            tx.card_number?.replace(/^0+/, '') === driverCardNumber
          );
          total_fuel = matchingFuel.reduce((sum, tx) => sum + (tx.total_amount || 0), 0);
          // VAT refund = (fuel - fuel/1.23) / 2 (50% zwrotu VAT)
          total_fuel_vat_refund = (total_fuel - total_fuel / 1.23) / 2;
        }

        // Tax is now calculated as vat_amount below with B2B support
        // The 'tax' field from edge function is no longer used to avoid double taxation

        // Pobierz service_fee - PRIORYTET: opłata flotowa, potem plan kierowcy
        const driverAppUser = (driver as any).driver_app_users;
        const plan = plansData?.find(p => p.id === driverAppUser?.settlement_plan_id);
        // Jeśli flota ustawiła base_fee > 0, użyj jej. W przeciwnym razie użyj planu kierowcy.
        const service_fee = fleetBaseFee > 0 ? fleetBaseFee : (plan?.service_fee || 50);

        // Pobierz wynajem z przypisanego pojazdu
        const assignment = assignmentsData?.find(a => a.driver_id === driver.id);
        const rental = (assignment?.vehicles as any)?.weekly_rental_fee || 0;

        // Oblicz wypłatę
        const total_base = uber_base + bolt_base + freenow_base;

        // Oblicz net z platform (może być ujemne np. z Bolt)
        const uber_net = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          return sum + parseFloat(amounts.uber_net || '0');
        }, 0);
        const bolt_net = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          return sum + parseFloat(amounts.bolt_net || '0');
        }, 0);
        const freenow_net = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          return sum + parseFloat(amounts.freenow_net || '0');
        }, 0);
        const platform_net = uber_net + bolt_net + freenow_net;

        // ⚠️ OCHRONA ZEROWYCH ZAROBKÓW - ale UWZGLĘDNIJ UJEMNE SALDA
        // Jeśli kierowca nie jeździł (suma zarobków = 0) I nie ma ujemnego salda
        if (total_base === 0 && platform_net >= 0) {
          return {
            driver_id: driver.id,
            driver_name: `${driver.first_name} ${driver.last_name}`,
            uber_base: 0,
            uber_cash: 0,
            uber_commission: 0,
            bolt_base: 0,
            bolt_cash: 0,
            bolt_commission: 0,
            freenow_base: 0,
            freenow_cash: 0,
            freenow_commission: 0,
            total_base: 0,
            total_commission: 0,
            total_cash: 0,
            tax_8_percent: 0,
            vat_amount: 0,
            service_fee: 0,
            additional_fees: [],
            rental: 0,
            fuel: 0,
            fuel_vat_refund: 0,
            net_without_commission: 0,
            final_payout: 0,
            has_negative_balance: false,
          };
        }

        // 🚫 FILTRUJ WŁAŚCICIELI FLOT: Jeśli kierowca ma TYLKO ujemne saldo (wypłata bez kursów)
        // np. Daniel Moshechkov z uber_base = -13450.97 = to właściciel floty, ukryj go
        if (total_base < 0) {
          // Return null to be filtered out later
          return null;
        }

        // Jeśli kierowca ma ujemne saldo z platform (np. Bolt fees) - NIE NALICZAJ OPŁAT
        if (platform_net < 0) {
          return {
            driver_id: driver.id,
            driver_name: `${driver.first_name} ${driver.last_name}`,
            uber_base,
            uber_cash: 0,
            uber_commission,
            bolt_base,
            bolt_cash: 0,
            bolt_commission,
            freenow_base,
            freenow_cash: 0,
            freenow_commission,
            total_base,
            total_commission,
            total_cash: 0,
            tax_8_percent: 0,
            vat_amount: 0,
            service_fee: 0,
            additional_fees: [],
            rental: 0,
            fuel: 0,
            fuel_vat_refund: 0,
            net_without_commission: platform_net,
            final_payout: platform_net,
            has_negative_balance: true,
          };
        }

        // Calculate VAT amount from fleet settings
        // Tax is already calculated in edge function but we need to handle B2B drivers here
        // B2B drivers with vat_payer=true don't pay VAT - they handle it themselves
        // B2B drivers with vat_payer=false get 8% VAT deducted (like regular drivers)
        const driverInfo = driver as any;
        const appUserData = driverInfo.driver_app_users;
        const b2bProfile = b2bProfilesMap.get(appUserData?.user_id);
        const isB2BDriver = driverInfo.payment_method === 'b2b';
        const isB2BVatPayer = isB2BDriver && b2bProfile?.vat_payer === true;
        const effectiveVatRate = isB2BVatPayer ? 0 : fleetVatRate;
        // IMPORTANT: Use vat_amount instead of 'tax' from edge function to support B2B
        // The 'tax' from edge function is a duplicate - we calculate VAT here with B2B logic
        const vat_amount = total_base * (effectiveVatRate / 100);

        // Helper: sprawdź czy tydzień jest pierwszym pełnym tygodniem miesiąca
        const isFirstFullWeekOfMonth = (weekStart: string): boolean => {
          const start = new Date(weekStart);
          // Tydzień jest "pierwszym pełnym" jeśli poniedziałek wypada między 1 a 7 dniem miesiąca
          return start.getDate() >= 1 && start.getDate() <= 7;
        };

        const isFirstWeek = periodStart ? isFirstFullWeekOfMonth(periodStart) : false;

        // Calculate additional fees from fleet_settlement_fees
        // Tygodniowe ZAWSZE + miesięczne TYLKO w pierwszym tygodniu miesiąca
        // PLUS: sprawdzenie valid_from/valid_to dla każdej opłaty
        const additional_fees = fleetFees
          .filter(fee => {
            // Sprawdź zakres ważności opłaty (valid_from / valid_to)
            const periodStartDate = periodStart ? new Date(periodStart) : new Date();
            
            if ((fee as any).valid_from) {
              const validFromDate = new Date((fee as any).valid_from);
              if (validFromDate > periodStartDate) return false;
            }
            if ((fee as any).valid_to) {
              const validToDate = new Date((fee as any).valid_to);
              if (validToDate < periodStartDate) return false;
            }
            
            // Sprawdź częstotliwość
            if (fee.frequency === 'weekly') return true;
            if (fee.frequency === 'monthly' && isFirstWeek) return true;
            return false;
          })
          .map(fee => ({
            name: fee.name,
            amount: fee.type === 'fixed' ? fee.amount : total_base * (fee.amount / 100)
          }));

        const total_additional_fees = additional_fees.reduce((sum, f) => sum + f.amount, 0);

        // FIXED: Use vat_amount INSTEAD of tax (they are the same 8% tax, just calculated differently)
        // tax = from edge function (doesn't handle B2B)
        // vat_amount = calculated here with B2B logic
        // service_fee już zawiera fleetBaseFee gdy > 0, więc NIE dodawaj fleetBaseFee osobno
        const payout = total_base - total_commission - vat_amount - service_fee - total_additional_fees - rental - total_cash - total_fuel + total_fuel_vat_refund;

        return {
          driver_id: driver.id,
          driver_name: `${driver.first_name} ${driver.last_name}`,
          uber_base,
          uber_cash,
          uber_commission,
          bolt_base,
          bolt_cash,
          bolt_commission,
          freenow_base,
          freenow_cash,
          freenow_commission,
          total_base,
          total_commission,
          total_cash,
          tax_8_percent: vat_amount, // Use vat_amount (calculated with B2B logic) instead of tax from edge function
          vat_amount: 0, // Set to 0 since we're using tax_8_percent for the actual VAT
          service_fee,
          additional_fees,
          rental,
          fuel: total_fuel,
          fuel_vat_refund: total_fuel_vat_refund,
          net_without_commission: total_base - total_commission - vat_amount,
          final_payout: payout,
        };
      });

      // 🧹 FILTROWANIE KIEROWCÓW BEZ DANYCH - usuwamy "śmieciowe" wiersze i null
      // Pokazuj tylko kierowców którzy mają AKTYWNE zarobki (total_base > 0)
      // UKRYJ: 
      // - Kierowców z ujemnym saldem (już odfiltrowane jako null wyżej)
      // - Kierowców bez żadnych rozliczeń
      const settlementsDriverIds = new Set(settlementsData?.map(s => s.driver_id) || []);
      
      const filteredAggregated = aggregated
        .filter((row): row is NonNullable<typeof row> => row !== null) // Remove null rows (fleet owners)
        .filter(row => {
          // UKRYJ kierowców z zerowym saldem i bez rozliczeń
          if (row.total_base === 0 && !settlementsDriverIds.has(row.driver_id)) {
            return false;
          }
          
          // Pokaż kierowców z pozytywnymi zarobkami lub z rozliczeniami
          return row.total_base > 0 || settlementsDriverIds.has(row.driver_id);
        });

      console.log('📈 Aggregated settlements:', aggregated.length);
      console.log('🧹 Filtered (removed ghost drivers + owners):', filteredAggregated.length);
      console.log('✅ Sample settlement:', filteredAggregated[0]);
      
      setSettlements(filteredAggregated);
    } catch (error: any) {
      toast.error('Błąd ładowania rozliczeń: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const subTabs = [
    ...(roles.includes('admin') 
      ? [{ value: "my", label: "Przychód firmy", visible: true }] 
      : isDriver && myDriverId 
        ? [{ value: "my", label: "Moje rozliczenia", visible: true }] 
        : []
    ),
    { value: "import", label: "Rozlicz kierowców", visible: true },
    { value: "drivers", label: "Rozliczenia kierowców", visible: true },
    { value: "vehicles", label: "Przychody aut", visible: true },
    { value: "fuel", label: "Paliwo", visible: true },
    { value: "reports", label: "Raporty", visible: true },
    { value: "settings", label: "Ustawienia rozliczeń", visible: true }
  ];

  if (loading) {
    return <div className="text-center py-8">Ładowanie rozliczeń...</div>;
  }

  // Render "Rozlicz kierowców" (import) tab
  if (activeSubTab === "import") {
    return (
      <div>
        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />
        <FleetSettlementImport 
          fleetId={fleetId} 
          onComplete={() => {
            fetchSettlements();
            setActiveSubTab("drivers");
          }}
        />
      </div>
    );
  }

  // Render "Ustawienia rozliczeń" tab
  if (activeSubTab === "settings") {
    return (
      <div>
        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />
        <FleetSettlementSettings fleetId={fleetId} />
      </div>
    );
  }

  // Render "Przychody aut" tab
  if (activeSubTab === "vehicles") {
    return (
      <div>
        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />
        <FleetVehicleRevenue 
          fleetId={fleetId} 
          mode={roles.includes('admin') ? 'admin' : 'fleet'}
        />
      </div>
    );
  }

  // Render "Paliwo" tab
  if (activeSubTab === "fuel") {
    return (
      <div className="space-y-6">
        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />
        
        <Card>
          <CardHeader>
            <CardTitle>Import danych paliwowych z CSV</CardTitle>
            <CardDescription>
              Wgraj plik CSV z transakcjami paliwowymi (separator ";", format UTF-8)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FuelCSVUpload onUploadComplete={() => {
              // Trigger refresh of fuel view
              fetchSettlements();
            }} />
          </CardContent>
        </Card>

        <FleetFuelView 
          fleetId={fleetId} 
          periodFrom={currentWeek?.start}
          periodTo={currentWeek?.end}
        />
      </div>
    );
  }

  // Render "Raporty" tab
  if (activeSubTab === "reports") {
    return (
      <div>
        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>Moduł raportów w budowie.</p>
            <p className="text-sm mt-2">Dodatkowe raporty i analizy zostaną wkrótce dodane.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render based on active sub-tab
  if (activeSubTab === "my") {
    // For admin: show company revenue summary
    if (roles.includes('admin')) {
      return (
        <div>
          <UniversalSubTabBar
            activeTab={activeSubTab}
            onTabChange={setActiveSubTab}
            tabs={subTabs}
          />
          <CompanyRevenueSummary fleetId={fleetId} />
        </div>
      );
    }
    
    // For drivers: show their own settlements
    if (isDriver && myDriverId) {
      return (
        <div>
          <UniversalSubTabBar
            activeTab={activeSubTab}
            onTabChange={setActiveSubTab}
            tabs={subTabs}
          />
          <DriverSettlements driverId={myDriverId} hideControls={false} />
        </div>
      );
    }
  }

  if (settlements.length === 0) {
    return (
      <div>
        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />
        <Card>
          <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle>Rozliczenia kierowców</CardTitle>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Miasto:</Label>
                  <Select value={selectedCityId} onValueChange={setSelectedCityId}>
                    <SelectTrigger className="h-9 px-3 w-[160px]">
                      <SelectValue placeholder="Wszystkie miasta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Wszystkie miasta</SelectItem>
                      {cities.map(city => (
                        <SelectItem key={city.id} value={city.id}>{city.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Rok:</Label>
                  <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                    <SelectTrigger className="h-9 px-3 w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2024, 2025, 2026].map(year => (
                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Okres:</Label>
                  <Select 
                    value={selectedWeek?.toString() || ''} 
                    onValueChange={(v) => setSelectedWeek(parseInt(v))}
                    disabled={selectedWeek === null}
                  >
                    <SelectTrigger className="h-9 px-3 w-[200px]">
                      <SelectValue placeholder="Wybierz okres" />
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
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              Brak rozliczeń dla wybranego okresu
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (viewType === 'rental') {
    return (
      <div>
        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />
        <Card>
          <CardHeader>
            <CardTitle>Zestawienie wynajmu</CardTitle>
          </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="p-1.5 text-xs">Kierowca</TableHead>
                <TableHead className="p-1.5 text-xs">Auto</TableHead>
                <TableHead className="text-right p-1.5 text-xs">Wynajem</TableHead>
                <TableHead className="text-center p-1.5 text-xs">Pokrył?</TableHead>
                <TableHead className="text-right p-1.5 text-xs">Dług poprzedni</TableHead>
                <TableHead className="text-right p-1.5 text-xs">Dług bieżący</TableHead>
                <TableHead className="p-1.5 text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlements.map((settlement) => (
                <TableRow key={settlement.driver_id}>
                  <TableCell className="font-medium p-1.5 text-xs">{settlement.driver_name}</TableCell>
                  <TableCell className="text-muted-foreground p-1.5 text-xs">{settlement.vehicle}</TableCell>
                  <TableCell className="text-right p-1.5 text-xs">
                    {formatCurrency(settlement.rental)}
                  </TableCell>
                  <TableCell className="text-center p-1.5 text-xs">
                    {settlement.covered_rental ? (
                      <Check className="h-4 w-4 text-green-500 mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-red-500 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-right p-1.5 text-xs">
                    {formatCurrency(settlement.debt_previous)}
                  </TableCell>
                  <TableCell className="text-right p-1.5 text-xs">
                    {formatCurrency(settlement.debt_current)}
                  </TableCell>
                  <TableCell className="p-1.5 text-xs">
                    {settlement.debt_current === 0 ? (
                      <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20">
                        Bez długu
                      </Badge>
                    ) : settlement.debt_current < settlement.debt_previous ? (
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/20">
                        Spłacił
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/20">
                        Ma dług {formatCurrency(settlement.debt_current)}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </div>
    );
  }

  return (
    <div>
      <UniversalSubTabBar
        activeTab={activeSubTab}
        onTabChange={setActiveSubTab}
        tabs={subTabs}
      />
      
      {/* Alert about new unmapped records */}
      {newRecordsAlert > 0 && (
        <div className="mb-4 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div>
              <span className="font-medium text-amber-800">
                Znaleziono {newRecordsAlert} {newRecordsAlert === 1 ? 'nowy rekord' : 'nowe rekordy'}
              </span>
              <span className="text-amber-700 ml-1">
                — kierowcy do przypisania w systemie
              </span>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleCheckUnmappedDrivers}
            disabled={checkingUnmapped}
            className="border-amber-500/50 text-amber-800 hover:bg-amber-500/20"
          >
            {checkingUnmapped ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Users className="h-4 w-4 mr-2" />
            )}
            Przypisz kierowców
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
        <div className="w-full space-y-4">
            <CardTitle>Rozliczenia kierowców</CardTitle>
            <div className="w-full flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Miasto:</Label>
                <Select value={selectedCityId} onValueChange={setSelectedCityId}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Wszystkie miasta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie miasta</SelectItem>
                    {cities.map(city => (
                      <SelectItem key={city.id} value={city.id}>{city.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm">Rok:</Label>
                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026].map(year => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm">Okres:</Label>
                <Select 
                  value={selectedWeek?.toString() || ''} 
                  onValueChange={(v) => setSelectedWeek(parseInt(v))}
                  disabled={selectedWeek === null}
                >
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Wybierz okres" />
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
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Szukaj kierowcy..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-[180px] h-9"
                />
              </div>
              {/* Checkbox removed - filtering handled automatically in fetchSettlements */}
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => { setPayoutType('cash'); setPayoutDialogOpen(true); }}
                  className="gap-1.5"
                >
                  <Banknote className="h-4 w-4" />
                  Generuj KW gotówka
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => { setPayoutType('transfer'); setPayoutDialogOpen(true); }}
                  className="gap-1.5"
                >
                  <CreditCard className="h-4 w-4" />
                  Generuj przelew
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleCheckUnmappedDrivers}
                  disabled={checkingUnmapped}
                  className="gap-1.5"
                >
                  {checkingUnmapped ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                  Sprawdź nowych kierowców
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  Usuń rozliczenie
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        {/* City Selection Dialog for Payouts */}
        <Dialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {payoutType === 'cash' ? 'Generuj listę wypłat gotówkowych' : 'Generuj listę przelewów'}
              </DialogTitle>
              <DialogDescription>
                Wybierz miasto, dla którego chcesz wygenerować {payoutType === 'cash' ? 'dokument KW' : 'listę przelewów'}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Select
                onValueChange={(cityId) => {
                  if (payoutType === 'cash') {
                    handleGenerateCashPayouts(cityId);
                  } else {
                    handleGenerateTransfers(cityId);
                  }
                  setPayoutDialogOpen(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz miasto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie miasta</SelectItem>
                  {cities.map(city => (
                    <SelectItem key={city.id} value={city.id}>{city.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Settlement Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Usuń rozliczenie</AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>
                  Czy na pewno chcesz usunąć wszystkie rozliczenia dla okresu{' '}
                  <strong>{currentWeek?.label}</strong>?
                </p>
                <p className="text-destructive font-medium">
                  Ta operacja jest nieodwracalna! Usunięte zostaną dane rozliczeń z kont kierowców.
                  Płatności długów zostaną cofnięte.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <Label htmlFor="deleteCity" className="text-sm font-medium">
                Miasto (opcjonalnie)
              </Label>
              <Select value={deleteCityId} onValueChange={setDeleteCityId}>
                <SelectTrigger id="deleteCity" className="mt-2">
                  <SelectValue placeholder="Wybierz miasto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie miasta</SelectItem>
                  {cities.map(city => (
                    <SelectItem key={city.id} value={city.id}>{city.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Anuluj</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeleteSettlements} 
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Usuwanie...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Usuń rozliczenia
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      <CardContent>
        {(() => {
          // Filter settlements based on search only (zero filtering is done in fetchSettlements)
          const filteredSettlements = settlements.filter(s => {
            // Search filter
            if (searchQuery.trim()) {
              const query = searchQuery.toLowerCase();
              if (!s.driver_name.toLowerCase().includes(query)) return false;
            }
            return true;
          });

          return (
            <>
              {/* Mobile View - Collapsible per driver */}
              <div className="md:hidden space-y-2">
                {filteredSettlements.map((settlement) => {
                  // Check platform activity (driver worked if base > 0)
                  const hasUberActivity = settlement.uber_base > 0;
                  const hasBoltActivity = settlement.bolt_base > 0;
                  const hasFreenowActivity = settlement.freenow_base > 0;
                  
                  return (
                  <Collapsible key={settlement.driver_id} className="border rounded-lg bg-white">
                    <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-muted/50">
                      <span className="font-medium text-sm">{settlement.driver_name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${getAmountColor(settlement.final_payout)}`}>
                          {formatCurrency(settlement.final_payout)}
                        </span>
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t">
                        {/* Platform breakdown table */}
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted">
                              <th className="text-left p-2 text-xs font-medium">Kategoria</th>
                              <th className="text-right p-2 text-xs font-medium text-gray-900">Uber</th>
                              <th className="text-right p-2 text-xs font-medium text-green-600">Bolt</th>
                              <th className="text-right p-2 text-xs font-medium text-red-600">FreeNow</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-t">
                              <td className="p-2 text-xs text-muted-foreground">Podstawa</td>
                              <td className="p-2 text-right text-xs text-gray-900 tabular-nums">{hasUberActivity ? formatCurrency(settlement.uber_base) : '-'}</td>
                              <td className="p-2 text-right text-xs text-green-600 tabular-nums">{hasBoltActivity ? formatCurrency(settlement.bolt_base) : '-'}</td>
                              <td className="p-2 text-right text-xs text-red-600 tabular-nums">{hasFreenowActivity ? formatCurrency(settlement.freenow_base) : '-'}</td>
                            </tr>
                            <tr className="border-t">
                              <td className="p-2 text-xs text-muted-foreground">Prowizja</td>
                              <td className="p-2 text-right text-xs text-orange-600 tabular-nums">{displayValue(settlement.uber_commission, hasUberActivity, true)}</td>
                              <td className="p-2 text-right text-xs text-orange-600 tabular-nums">{displayValue(settlement.bolt_commission, hasBoltActivity, true)}</td>
                              <td className="p-2 text-right text-xs text-orange-600 tabular-nums">{displayValue(settlement.freenow_commission, hasFreenowActivity, true)}</td>
                            </tr>
                            <tr className="border-t">
                              <td className="p-2 text-xs text-muted-foreground">Gotówka</td>
                              <td className="p-2 text-right text-xs text-red-600 tabular-nums">{displayValue(settlement.uber_cash, hasUberActivity, true)}</td>
                              <td className="p-2 text-right text-xs text-red-600 tabular-nums">{displayValue(settlement.bolt_cash, hasBoltActivity, true)}</td>
                              <td className="p-2 text-right text-xs text-red-600 tabular-nums">{displayValue(settlement.freenow_cash, hasFreenowActivity, true)}</td>
                            </tr>
                          </tbody>
                        </table>
                        
                        {/* Summary section */}
                        <div className="bg-gray-50 p-3 space-y-2 border-t">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Razem gotówka:</span>
                            <span className="text-red-600 font-medium tabular-nums">{settlement.total_cash > 0 ? `-${formatCurrency(settlement.total_cash)}` : '-'}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Razem prowizja:</span>
                            <span className="text-orange-600 font-medium tabular-nums">{settlement.total_commission > 0 ? `-${formatCurrency(settlement.total_commission)}` : '-'}</span>
                          </div>
                          {settlement.fuel > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Paliwo:</span>
                              <span className="text-red-600 font-medium tabular-nums">-{formatCurrency(settlement.fuel)}</span>
                            </div>
                          )}
                          {settlement.fuel_vat_refund > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">VAT zwrot:</span>
                              <span className="text-green-600 font-medium tabular-nums">+{formatCurrency(settlement.fuel_vat_refund)}</span>
                            </div>
                          )}
                          {settlement.vat_amount > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">VAT:</span>
                              <span className="text-red-600 font-medium tabular-nums">-{formatCurrency(settlement.vat_amount)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Opłata:</span>
                            <span className="font-medium tabular-nums">-{formatCurrency(settlement.service_fee)}</span>
                          </div>
                          {settlement.additional_fees.map((fee, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{fee.name}:</span>
                              <span className="font-medium tabular-nums">-{formatCurrency(fee.amount)}</span>
                            </div>
                          ))}
                          {(settlement.rental || 0) > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Wynajem:</span>
                              <span className="font-medium tabular-nums">-{formatCurrency(settlement.rental || 0)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
                            <span>Wypłata:</span>
                            <span className={getAmountColor(settlement.final_payout)}>{formatCurrency(settlement.final_payout)}</span>
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )})}
                
                
                {/* Mobile total summary */}
                <div className="bg-muted/50 rounded-lg p-3 mt-4">
                  <div className="flex justify-between text-sm font-bold">
                    <span>RAZEM ({filteredSettlements.length}):</span>
                    <span className={getAmountColor(filteredSettlements.reduce((sum, s) => sum + s.final_payout, 0))}>
                      {formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.final_payout, 0))}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Desktop View - Full table */}
              <div className="hidden md:block overflow-x-auto pb-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-2 py-1.5 text-xs font-medium whitespace-nowrap">Kierowca</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-gray-900 whitespace-nowrap">Uber</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-gray-900 whitespace-nowrap">Uber got.</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-green-600 whitespace-nowrap">Bolt</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-green-600 whitespace-nowrap">Bolt got.</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-green-600 whitespace-nowrap">Bolt prow.</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-red-600 whitespace-nowrap">FreeNow</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-red-600 whitespace-nowrap">FN got.</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-red-600 whitespace-nowrap">FN prow.</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-red-600 whitespace-nowrap">Razem got.</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-orange-600 whitespace-nowrap">Razem prow.</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-red-600 whitespace-nowrap">Paliwo</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-purple-600 whitespace-nowrap">VAT</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-green-600 whitespace-nowrap">VAT zwrot</TableHead>
                      {activeFees.filter(fee => {
                        // Sprawdź valid_from/valid_to
                        const weekStart = currentWeek?.start ? new Date(currentWeek.start) : new Date();
                        if ((fee as any).valid_from && new Date((fee as any).valid_from) > weekStart) return false;
                        if ((fee as any).valid_to && new Date((fee as any).valid_to) < weekStart) return false;
                        
                        if (fee.frequency === 'weekly') return true;
                        if (fee.frequency === 'monthly') {
                          // Tylko w pierwszym tygodniu miesiąca (poniedziałek między 1-7)
                          return weekStart.getDate() >= 1 && weekStart.getDate() <= 7;
                        }
                        return false;
                      }).map(fee => (
                        <TableHead key={fee.id} className="text-right px-2 py-1.5 text-xs font-medium whitespace-nowrap">{fee.name}</TableHead>
                      ))}
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium whitespace-nowrap">Opłata</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium whitespace-nowrap">Wynajem</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-bold whitespace-nowrap">Wypłata</TableHead>
                      <TableHead className="text-center px-2 py-1.5 text-xs font-medium whitespace-nowrap">Dług</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSettlements.map((settlement) => {
                      // Check platform activity (driver worked if base > 0)
                      const hasUberActivity = settlement.uber_base > 0;
                      const hasBoltActivity = settlement.bolt_base > 0;
                      const hasFreenowActivity = settlement.freenow_base > 0;
                      const hasAnyActivity = hasUberActivity || hasBoltActivity || hasFreenowActivity;
                      
                      return (
                      <TableRow key={settlement.driver_id}>
                        <TableCell className="font-medium px-2 py-1.5 text-xs whitespace-nowrap">{settlement.driver_name}</TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-gray-900 tabular-nums whitespace-nowrap">
                          {hasUberActivity ? formatCurrency(settlement.uber_base) : '-'}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-gray-900 tabular-nums whitespace-nowrap">
                          {displayValue(settlement.uber_cash, hasUberActivity, true)}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                          {hasBoltActivity ? formatCurrency(settlement.bolt_base) : '-'}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                          {displayValue(settlement.bolt_cash, hasBoltActivity, true)}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                          {displayValue(settlement.bolt_commission, hasBoltActivity, true)}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                          {hasFreenowActivity ? formatCurrency(settlement.freenow_base) : '-'}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                          {displayValue(settlement.freenow_cash, hasFreenowActivity, true)}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                          {displayValue(settlement.freenow_commission, hasFreenowActivity, true)}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 font-semibold tabular-nums whitespace-nowrap">
                          {displayValue(settlement.total_cash, hasAnyActivity, true)}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-orange-600 font-semibold tabular-nums whitespace-nowrap">
                          {displayValue(settlement.total_commission, hasAnyActivity, true)}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                          {displayValue(settlement.fuel, hasAnyActivity, true)}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-purple-600 tabular-nums whitespace-nowrap">
                          {displayValue(settlement.vat_amount, hasAnyActivity, true)}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                          {settlement.fuel_vat_refund > 0 ? `+${formatCurrency(settlement.fuel_vat_refund)}` : (hasAnyActivity ? '0,00' : '-')}
                        </TableCell>
                        {settlement.additional_fees.map((fee, idx) => (
                          <TableCell key={idx} className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                            -{formatCurrency(fee.amount)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                          {settlement.service_fee > 0 ? `-${formatCurrency(settlement.service_fee)}` : (hasAnyActivity ? '0,00' : '-')}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                          {(settlement.rental || 0) > 0 ? `-${formatCurrency(settlement.rental || 0)}` : (hasAnyActivity ? '0,00' : '-')}
                        </TableCell>
                        <TableCell className={`text-right font-bold px-2 py-1.5 text-xs tabular-nums whitespace-nowrap ${getAmountColor(settlement.final_payout)}`}>
                          {formatCurrency(settlement.final_payout)}
                          {settlement.has_negative_balance && (
                            <Badge variant="destructive" className="ml-1 text-[10px] px-1 py-0">
                              MINUS
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center px-2 py-1.5 text-xs whitespace-nowrap">
                          {(() => {
                            const debt = driverDebts[settlement.driver_id] || 0;
                            if (debt <= 0) {
                              return (
                                <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20 text-[10px]">
                                  ✓ 0
                                </Badge>
                              );
                            }
                            return (
                              <Badge 
                                variant="destructive" 
                                className="cursor-pointer text-[10px]"
                                onClick={() => {
                                  setSelectedDriverForDebt({ id: settlement.driver_id, name: settlement.driver_name });
                                  setDebtDialogOpen(true);
                                }}
                              >
                                {formatCurrency(debt)} zł
                              </Badge>
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                    )})}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell className="px-2 py-1.5 text-xs whitespace-nowrap">RAZEM ({filteredSettlements.length})</TableCell>
                      <TableCell className="text-right px-2 py-1.5 text-xs text-gray-900 tabular-nums whitespace-nowrap">
                        {formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.uber_base, 0))}
                      </TableCell>
                      <TableCell className="text-right px-2 py-1.5 text-xs text-gray-900 tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.uber_cash, 0))}
                      </TableCell>
                      <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                        {formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.bolt_base, 0))}
                      </TableCell>
                      <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.bolt_cash, 0))}
                      </TableCell>
                      <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.bolt_commission, 0))}
                      </TableCell>
                      <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                        {formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.freenow_base, 0))}
                      </TableCell>
                      <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.freenow_cash, 0))}
                      </TableCell>
                      <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.freenow_commission, 0))}
                      </TableCell>
                      <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 font-semibold tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.total_cash, 0))}
                      </TableCell>
                      <TableCell className="text-right px-2 py-1.5 text-xs text-orange-600 font-semibold tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.total_commission, 0))}
                      </TableCell>
                      <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.fuel, 0))}
                      </TableCell>
                      <TableCell className="text-right px-2 py-1.5 text-xs text-purple-600 tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.vat_amount, 0))}
                      </TableCell>
                      <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                        +{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.fuel_vat_refund, 0))}
                      </TableCell>
                      {activeFees.filter(fee => {
                        // Ten sam filtr co w nagłówkach
                        const weekStart = currentWeek?.start ? new Date(currentWeek.start) : new Date();
                        if ((fee as any).valid_from && new Date((fee as any).valid_from) > weekStart) return false;
                        if ((fee as any).valid_to && new Date((fee as any).valid_to) < weekStart) return false;
                        
                        if (fee.frequency === 'weekly') return true;
                        if (fee.frequency === 'monthly') {
                          return weekStart.getDate() >= 1 && weekStart.getDate() <= 7;
                        }
                        return false;
                      }).map((fee, idx) => (
                        <TableCell key={fee.id} className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                          -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + (s.additional_fees[idx]?.amount || 0), 0))}
                        </TableCell>
                      ))}
                      <TableCell className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.service_fee, 0))}
                      </TableCell>
                      <TableCell className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + (s.rental || 0), 0))}
                      </TableCell>
                      <TableCell className={`text-right font-bold px-2 py-1.5 text-xs tabular-nums whitespace-nowrap ${getAmountColor(filteredSettlements.reduce((sum, s) => sum + s.final_payout, 0))}`}>
                        {formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.final_payout, 0))}
                      </TableCell>
                      <TableCell className="text-center px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                        {(() => {
                          const totalDebt = filteredSettlements.reduce((sum, s) => sum + (driverDebts[s.driver_id] || 0), 0);
                          return totalDebt > 0 ? (
                            <Badge variant="destructive" className="text-[10px]">
                              {formatCurrency(totalDebt)} zł
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20 text-[10px]">
                              ✓ 0
                            </Badge>
                          );
                        })()}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </>
          );
        })()}
      </CardContent>

      {/* Debt History Dialog */}
      <Dialog open={debtDialogOpen} onOpenChange={setDebtDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Historia zadłużenia: {selectedDriverForDebt?.name}</DialogTitle>
            <DialogDescription>
              Szczegóły ujemnych sald i spłat kierowcy
            </DialogDescription>
          </DialogHeader>
          {selectedDriverForDebt && (
            <DriverDebtHistory driverId={selectedDriverForDebt.id} />
          )}
        </DialogContent>
      </Dialog>
    </Card>

      {/* Unmapped Drivers Modal */}
      <UnmappedDriversModal
        open={showUnmappedModal}
        onOpenChange={setShowUnmappedModal}
        unmappedDrivers={unmappedDrivers}
        fleetId={fleetId}
        onComplete={() => {
          setUnmappedDrivers([]);
          fetchSettlements();
        }}
      />
    </div>
  );
}
