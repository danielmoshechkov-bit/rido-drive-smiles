import { useState, useEffect, useRef } from 'react';
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
import { Check, X, AlertCircle, Search, ChevronDown, ChevronUp, Banknote, CreditCard, Download, Trash2, Loader2, Users, AlertTriangle, Plus, SlidersHorizontal, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { FleetOwnerPayments } from './fleet/FleetOwnerPayments';
import { FleetCitySettings } from './fleet/FleetCitySettings';
import { DriverDebtHistory } from './DriverDebtHistory';
import { UnmappedDriversModal } from './fleet/UnmappedDriversModal';
import { BankTransferExportDialog } from './fleet/BankTransferExportDialog';
import { AddDriverChargeModal } from './fleet/AddDriverChargeModal';
import { DriverInfoPopover } from './fleet/DriverInfoModal';
import { useUserRole } from '@/hooks/useUserRole';
import { getAvailableWeeks, getCurrentWeekNumber, getSettlementExecutionDate, getWeekDates } from '@/lib/utils';

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
  rental_debt_previous?: number;
  covered_rental?: boolean;
  // For negative balance tracking
  has_negative_balance?: boolean;
  negative_deficit?: number; // abs value of negative payout (goes to debt)
  // Dual tax mode fields
  bolt_ef_base?: number;
  bolt_ijk_base?: number;
  additional_percent_amount?: number;
  secondary_vat_amount?: number;
  // Dual tax display fields
  bolt_tips?: number;
  bolt_bonusy?: number;
  bolt_rekompensaty?: number;
  bolt_anulacje?: number;
  netto?: number;
  payment_method?: string;
  // Snapshot metadata for debt re-sync
  settlement_id?: string;
  period_from?: string;
  period_to?: string;
  snapshot_debt_before?: number;
  snapshot_debt_after?: number;
  snapshot_debt_payment?: number;
  snapshot_actual_payout?: number;
  snapshot_settlement_debt_after?: number;
  snapshot_rental_debt_after?: number;
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
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');
  const [showZeroRows, setShowZeroRows] = useState<boolean>(false);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [payoutType, setPayoutType] = useState<'cash' | 'transfer' | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteCityId, setDeleteCityId] = useState<string>('all');
  const [debtDialogOpen, setDebtDialogOpen] = useState(false);
  const [selectedDriverForDebt, setSelectedDriverForDebt] = useState<{
    id: string;
    name: string;
    settlementDebtBefore: number;
    rentalDebtBefore: number;
    totalDebtBefore: number;
    debtAfter: number;
    periodFrom?: string;
    periodTo?: string;
    initialTab?: 'settlement' | 'rental';
  } | null>(null);
  const [driverDebts, setDriverDebts] = useState<Record<string, number>>({});
  const [unmappedDrivers, setUnmappedDrivers] = useState<any[]>([]);
  const [showUnmappedModal, setShowUnmappedModal] = useState(false);
  const [checkingUnmapped, setCheckingUnmapped] = useState(false);
  const [newRecordsAlert, setNewRecordsAlert] = useState<number>(0);
  const [bankTransferDialogOpen, setBankTransferDialogOpen] = useState(false);
  // Manual overrides for editable columns (składka ZUS, Opłata, Wynajem, Dług)
  const [manualOverrides, setManualOverrides] = useState<Record<string, {
    additional_fees?: Record<number, number>;
    service_fee?: number;
    rental?: number;
  }>>({});
  const [editingCell, setEditingCell] = useState<{ driverId: string; field: string; index?: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [chargeModalOpen, setChargeModalOpen] = useState(false);
  const [chargeDriver, setChargeDriver] = useState<{id: string, name: string} | null>(null);
  // Info popover is now inline - no separate state needed
  // Payment status tracking (green check = paid, red X = unpaid)
  const [paidDrivers, setPaidDrivers] = useState<Set<string>>(new Set());
  // Fleet settings for display in headers
  const [fleetVatRateState, setFleetVatRateState] = useState(8);
  const [fleetSettlementModeState, setFleetSettlementModeState] = useState<string>('single_tax');
  const [fleetSecondaryVatRateState, setFleetSecondaryVatRateState] = useState(23);
  const [fleetAdditionalPercentRateState, setFleetAdditionalPercentRateState] = useState(0);
  // Column visibility state - persisted per fleet
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`fleet_hidden_cols_${fleetId}`);
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set();
  });
  // Toggle between detailed (with rental columns) and simple view
  const [showRentalColumns, setShowRentalColumns] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`fleet_show_rental_${fleetId}`) !== 'false';
    } catch { return true; }
  });

  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'driver_name' ? 'asc' : 'desc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 ml-1" /> 
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const SINGLE_TAX_COLUMNS = [
    { key: 'uber', label: 'Uber' },
    { key: 'uber_cash', label: 'Uber got.' },
    { key: 'bolt', label: 'Bolt' },
    { key: 'bolt_cash', label: 'Bolt got.' },
    { key: 'bolt_commission', label: 'Bolt prow.' },
    { key: 'freenow', label: 'FreeNow' },
    { key: 'freenow_cash', label: 'FN got.' },
    { key: 'freenow_commission', label: 'FN prow.' },
    { key: 'brutto', label: 'Brutto' },
    { key: 'total_cash', label: 'Razem got.' },
    { key: 'total_commission', label: 'Razem prow.' },
    ...(fleetSettlementModeState === 'dual_tax' ? [
      { key: 'netto', label: 'Netto' },
      { key: 'bonusy', label: 'Bonusy' },
      { key: 'anulacje', label: 'Anulacje' },
      { key: 'rekompensaty', label: 'Rekomp.' },
    ] : []),
    { key: 'fuel', label: 'Paliwo' },
    { key: 'vat', label: 'VAT' },
    { key: 'vat_refund', label: 'VAT zwrot' },
    { key: 'service_fee', label: 'Opłata' },
    { key: 'payout', label: 'Rozliczenie' },
    { key: 'debt', label: 'Dług' },
    { key: 'wyplata_1', label: 'Wypłata' },
    { key: 'rental', label: 'Wynajem' },
    { key: 'debt_rental', label: 'Dług wynajmu' },
    { key: 'do_wyplaty', label: 'Wypłata fin.' },
    { key: 'paid', label: 'Opłacony' },
  ];

  const RENTAL_COLUMNS = new Set(['rental', 'debt_rental', 'do_wyplaty']);
  const isColVisible = (key: string) => {
    if (!showRentalColumns && RENTAL_COLUMNS.has(key)) return false;
    return !hiddenColumns.has(key);
  };
  const toggleColumn = (key: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem(`fleet_hidden_cols_${fleetId}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const togglePaidStatus = async (driverId: string) => {
    const newPaid = !paidDrivers.has(driverId);
    setPaidDrivers(prev => {
      const next = new Set(prev);
      if (newPaid) next.add(driverId);
      else next.delete(driverId);
      return next;
    });
    // Persist to DB
    try {
      const currentWeekData = weeks.find(w => w.number === selectedWeek);
      if (!currentWeekData) return;
      await supabase
        .from('settlements')
        .update({ is_paid: newPaid, paid_at: newPaid ? new Date().toISOString() : null } as any)
        .eq('driver_id', driverId)
        .gte('period_from', currentWeekData.start)
        .lte('period_to', currentWeekData.end);
    } catch (e) {
      console.error('Error saving paid status:', e);
    }
  };

  const markTransferDriversPaid = (driverIds: string[]) => {
    setPaidDrivers(prev => {
      const next = new Set(prev);
      driverIds.forEach(id => next.add(id));
      return next;
    });
  };

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
      
      // Show all pending unmapped drivers (they need mapping regardless of revenue)
      const unmappedWithRevenue = unmapped || [];
      
      if (unmappedWithRevenue.length > 0) {
        setUnmappedDrivers(unmappedWithRevenue);
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
  // Counts NEW platform IDs from CSV AND unassigned fuel cards
  const checkForNewRecordsAfterLoad = async () => {
    try {
      // Count pending unmapped drivers (new platform IDs from CSV)
      const { count: pendingDriversCount } = await supabase
        .from('unmapped_settlement_drivers')
        .select('*', { count: 'exact', head: true })
        .eq('fleet_id', fleetId)
        .eq('status', 'pending');

      // Also check for unmapped fuel cards
      // Get ALL drivers' fuel cards from the fleet
      const { data: fleetDrivers } = await supabase
        .from("drivers")
        .select("fuel_card_number")
        .eq("fleet_id", fleetId)
        .not("fuel_card_number", "is", null);

      const assignedCardsSet = new Set<string>();
      fleetDrivers?.forEach(d => {
        if (d.fuel_card_number?.trim()) {
          const normalized = d.fuel_card_number.trim().replace(/^0+/, '');
          assignedCardsSet.add(normalized);
          assignedCardsSet.add(d.fuel_card_number.trim());
        }
      });

      // Get recent fuel transactions (last 3 months) - check for unassigned cards
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      
      const { data: fuelTx } = await supabase
        .from("fuel_transactions")
        .select("card_number")
        .gte("transaction_date", threeMonthsAgo.toISOString().split('T')[0]);

      const unassignedFuelCards = new Set<string>();
      fuelTx?.forEach(t => {
        if (!t.card_number?.trim()) return;
        const cardRaw = t.card_number.trim();
        const cardNormalized = cardRaw.replace(/^0+/, '');
        if (!assignedCardsSet.has(cardRaw) && !assignedCardsSet.has(cardNormalized)) {
          unassignedFuelCards.add(cardNormalized);
        }
      });

      const totalNew = (pendingDriversCount || 0) + unassignedFuelCards.size;
      setNewRecordsAlert(totalNew);
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
      // Also include drivers without payment_method set (default to cash for KW)
      const cashDrivers = settlements.filter(s => {
        const driver = driverMap.get(s.driver_id);
        if (!driver) return false;
        if (cityId !== 'all' && driver.city_id !== cityId) return false;
        // Include 'cash' or null/undefined (drivers without explicit payment method)
        if (driver.payment_method && driver.payment_method !== 'cash') return false;
        
        const appUser = driver.driver_app_users?.[0];
        const isWeekly = !appUser?.settlement_frequency || appUser.settlement_frequency === 'weekly';
        const requestedPayout = !!appUser?.payout_requested_at;
        
        return isWeekly || requestedPayout;
      });

      if (cashDrivers.length === 0) {
        toast.info('Brak kierowców z ustawionym rozliczeniem gotówkowym (metoda płatności: gotówka). Zmień metodę płatności kierowcom w ustawieniach.');
        return;
      }

      // Separate payouts from debts using debt-adjusted amounts
      const cashWithDoWyplaty = cashDrivers.map(s => ({ ...s, doWyplaty: getDoWyplaty(s) }));
      const payouts = cashWithDoWyplaty.filter(s => s.doWyplaty > 0);
      const debts = cashWithDoWyplaty.filter(s => s.final_payout < 0);
      
      const totalPayout = payouts.reduce((sum, s) => sum + s.doWyplaty, 0);
      const totalDebt = Math.abs(debts.reduce((sum, s) => sum + s.final_payout, 0));
      
      // Use settlement execution date: day after the selected period ends
      const settlementDateLabel = format(
        getSettlementExecutionDate(currentWeek?.end),
        'dd.MM.yyyy'
      );
      
      // Generate printable HTML document
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>KW Gotówka - ${settlementDateLabel}</title>
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
          <h1>${settlementDateLabel} &nbsp;&nbsp; KW / Gotówka</h1>
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
                  <td class="amount ${s.doWyplaty >= 0 ? 'payout' : 'debt'}">${(s.doWyplaty || s.final_payout).toFixed(2).replace('.', ',')} zł</td>
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
      
      // Generate PDF and download directly
      const container = document.createElement('div');
      container.innerHTML = htmlContent;
      document.body.appendChild(container);
      
      const { default: html2pdf } = await import('html2pdf.js');
      await html2pdf().set({
        margin: 10,
        filename: `KW_Gotowka_${settlementDateLabel.replace(/\./g, '-')}.pdf`,
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).from(container.querySelector('body') || container).save();
      
      document.body.removeChild(container);
      
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
        if (getDoWyplaty(s) <= 0) return false;
        
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
        const amount = getDoWyplaty(s).toFixed(2).replace('.', ',');
        csvContent += `${s.driver_name};${iban};${amount};Rozliczenie ${periodLabel}\n`;
      });
      
      // Use settlement execution date for filename
      const settlementDateLabel = format(
        getSettlementExecutionDate(currentWeek?.end),
        'dd.MM.yyyy'
      );
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${settlementDateLabel}_Przelewy.csv`;
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
    const round2Local = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
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

      const settlementIds = settlementsToDelete.map(s => s.id);

      // 2. Delete debt transactions linked to these settlements
      const { error: debtTxError } = await supabase
        .from('driver_debt_transactions')
        .delete()
        .in('settlement_id', settlementIds);

      if (debtTxError) {
        console.warn('Error deleting debt transactions:', debtTxError);
      }

      // 3. Recalculate driver debts from remaining transactions
      const affectedDriverIds = [...new Set(settlementsToDelete.map(s => s.driver_id))];
      for (const driverId of affectedDriverIds) {
        // Sum all remaining transactions
        const { data: txData } = await supabase
          .from('driver_debt_transactions')
          .select('type, amount')
          .eq('driver_id', driverId);
        
        let newBalance = 0;
        (txData || []).forEach(tx => {
          if (tx.type === 'debt_increase' || tx.type === 'manual_add') {
            newBalance += Math.abs(tx.amount);
          } else {
            newBalance -= Math.abs(tx.amount);
          }
        });
        if (newBalance < 0) newBalance = 0;

        await supabase.from('driver_debts').upsert({
          driver_id: driverId,
          current_balance: newBalance,
          updated_at: new Date().toISOString()
        }, { onConflict: 'driver_id' });

        // 3b. Recalculate debt chain on remaining settlements for this driver
        const { data: remainingSettlements } = await supabase
          .from('settlements')
          .select('id, period_from, period_to, debt_before, debt_payment, debt_after, actual_payout')
          .eq('driver_id', driverId)
          .not('id', 'in', `(${settlementIds.join(',')})`)
          .order('period_from', { ascending: true });

        if (remainingSettlements && remainingSettlements.length > 0) {
          let runningDebt = 0;
          for (const s of remainingSettlements) {
            const rawPayout = (s.actual_payout || 0) + (s.debt_payment || 0);
            let debtPayment = 0;
            let remainingDebt = runningDebt;
            let actualPayout = 0;

            if (rawPayout < 0) {
              remainingDebt = round2(runningDebt + Math.abs(rawPayout));
            } else if (runningDebt <= 0) {
              remainingDebt = 0;
              actualPayout = rawPayout;
            } else if (rawPayout >= runningDebt) {
              debtPayment = runningDebt;
              remainingDebt = 0;
              actualPayout = round2(rawPayout - runningDebt);
            } else {
              debtPayment = rawPayout;
              remainingDebt = round2(runningDebt - rawPayout);
            }

            await supabase
              .from('settlements')
              .update({
                debt_before: round2(runningDebt),
                debt_payment: round2(debtPayment),
                debt_after: round2(remainingDebt),
                actual_payout: round2(actualPayout),
              })
              .eq('id', s.id);

            runningDebt = remainingDebt;
          }
        }
      }

      // 4. Delete settlements from database
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




  // Apply manual overrides and recalculate payout
  const applyOverridesToSettlement = (
    settlement: DriverSettlement,
    overrides?: {
      additional_fees?: Record<number, number>;
      service_fee?: number;
      rental?: number;
    }
  ): DriverSettlement => {
    if (!overrides) return { ...settlement };

    const s = { ...settlement };

    if (overrides.service_fee !== undefined) s.service_fee = overrides.service_fee;
    if (overrides.rental !== undefined) s.rental = overrides.rental;
    if (overrides.additional_fees) {
      s.additional_fees = s.additional_fees.map((fee, idx) =>
        overrides.additional_fees?.[idx] !== undefined
          ? { ...fee, amount: overrides.additional_fees[idx] }
          : fee
      );
    }

    return s;
  };

  const calculateRawPayout = (settlement: DriverSettlement): number => {
    const totalAdditional = settlement.additional_fees.reduce((sum, f) => sum + f.amount, 0);

    if (fleetSettlementModeState === 'dual_tax') {
      const nettoCalc = settlement.total_base - settlement.total_commission;
      return nettoCalc
        - settlement.total_cash
        - settlement.vat_amount
        - (settlement.secondary_vat_amount || 0)
        - settlement.service_fee
        - totalAdditional
        - (settlement.rental || 0)
        - settlement.fuel
        + settlement.fuel_vat_refund;
    }

    return settlement.total_base
      - settlement.total_commission
      - settlement.vat_amount
      - settlement.service_fee
      - totalAdditional
      - (settlement.rental || 0)
      - settlement.total_cash
      - settlement.fuel
      + settlement.fuel_vat_refund;
  };

  const getEffectiveSettlement = (settlement: DriverSettlement) => {
    const overridden = applyOverridesToSettlement(settlement, manualOverrides[settlement.driver_id]);
    return {
      ...overridden,
      final_payout: calculateRawPayout(overridden),
    };
  };

  // Wypłata finalna: część 1 (rozliczenie bez wynajmu i bez długu wynajmu) + część 2 (wynajem)
  const getDoWyplaty = (settlement: DriverSettlement): number => {
    const effective = getEffectiveSettlement(settlement);
    const wyplata1 = getWyplata1(settlement);
    const rentalDebtBefore = settlement.rental_debt_previous ?? 0;
    const rental = effective.rental || 0;
    return round2(wyplata1 - rentalDebtBefore - rental);
  };

  // Calculate payout WITHOUT rental (Part 1 of settlement)
  const calculatePayoutWithoutRental = (settlement: DriverSettlement): number => {
    const totalAdditional = settlement.additional_fees.reduce((sum, f) => sum + f.amount, 0);
    if (fleetSettlementModeState === 'dual_tax') {
      const nettoCalc = settlement.total_base - settlement.total_commission;
      return nettoCalc
        - settlement.total_cash
        - settlement.vat_amount
        - (settlement.secondary_vat_amount || 0)
        - settlement.service_fee
        - totalAdditional
        - settlement.fuel
        + settlement.fuel_vat_refund;
    }
    return settlement.total_base
      - settlement.total_commission
      - settlement.vat_amount
      - settlement.service_fee
      - totalAdditional
      - settlement.total_cash
      - settlement.fuel
      + settlement.fuel_vat_refund;
  };

  // Wypłata 1: payout without rental minus settlement debt
  const getWyplata1 = (settlement: DriverSettlement): number => {
    const effective = getEffectiveSettlement(settlement);
    const payoutNoRental = calculatePayoutWithoutRental(effective);
    const snapshotSettlementDebtAfter = round2(Math.max(0, settlement.snapshot_settlement_debt_after ?? 0));
    const liveSettlementDebt = round2(Math.max(0, settlement.debt_previous ?? 0));
    const baseDisplay = snapshotSettlementDebtAfter > 0
      ? -snapshotSettlementDebtAfter
      : round2(Number(settlement.snapshot_actual_payout ?? Math.max(0, payoutNoRental)));

    return round2(baseDisplay - (liveSettlementDebt - snapshotSettlementDebtAfter));
  };

  // Dług wynajmu (kolumna wejściowa tygodnia): tylko zaległość z wynajmu z poprzednich tygodni
  const getRentalDebt = (settlement: DriverSettlement): number => {
    return round2(Math.max(0, settlement.rental_debt_previous ?? 0));
  };

  const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

  // Proportional rental calculation (same logic as FleetVehicleRevenue)
  const calculateProportionalRentForSettlement = (
    assignedAt: string,
    weekStart: string,
    weekEnd: string,
    weeklyFee: number
  ): number => {
    const assignDate = new Date(assignedAt);
    const startDate = new Date(weekStart);
    const endDate = new Date(weekEnd);
    
    // Start counting from the day AFTER assignment
    const startCounting = new Date(assignDate);
    startCounting.setDate(startCounting.getDate() + 1);
    
    if (startCounting > endDate) return 0;
    
    // If assigned before the week, full week rental
    if (startCounting <= startDate) return weeklyFee;
    
    const effectiveStart = startCounting;
    const days = Math.ceil((endDate.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const dailyRate = weeklyFee / 7;
    return round2(dailyRate * Math.min(days, 7));
  };

  const deriveRawPayoutFromSettlementSnapshot = (settlement: any): number => {
    const debtBefore = round2(Math.max(0, Number(settlement?.debt_before ?? 0)));
    const debtAfter = round2(Math.max(0, Number(settlement?.debt_after ?? debtBefore)));
    const debtPayment = round2(Math.max(0, Number(settlement?.debt_payment ?? 0)));
    const actualPayout = round2(Number(settlement?.actual_payout ?? 0));
    const debtIncrease = round2(Math.max(0, debtAfter - debtBefore));

    if (debtIncrease > 0.01) {
      return round2(-debtIncrease);
    }

    return round2(actualPayout + debtPayment);
  };

  const getSnapshotRawPayout = (settlement: DriverSettlement): number | null => {
    if (
      settlement.snapshot_debt_before === undefined ||
      settlement.snapshot_debt_after === undefined ||
      settlement.snapshot_debt_payment === undefined ||
      settlement.snapshot_actual_payout === undefined
    ) {
      return null;
    }

    return deriveRawPayoutFromSettlementSnapshot({
      debt_before: settlement.snapshot_debt_before,
      debt_after: settlement.snapshot_debt_after,
      debt_payment: settlement.snapshot_debt_payment,
      actual_payout: settlement.snapshot_actual_payout,
    });
  };

  // Parse locale-aware number: handles "0.00400" → 400, "1 031,00" → 1031, etc.
  const parseLocalizedNumber = (value: string): number => {
    if (!value) return 0;
    let str = value.trim().replace(/\s/g, '');
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Track pending cell to open after current save completes
  const pendingEditRef = useRef<{ driverId: string; field: string; currentValue: number; index?: number } | null>(null);
  const isSavingRef = useRef(false);

  const startEditing = (driverId: string, field: string, currentValue: number, index?: number) => {
    if (isSavingRef.current) {
      // Queue this click — it will be opened after the current save finishes
      pendingEditRef.current = { driverId, field, currentValue, index };
      return;
    }
    setEditingCell({ driverId, field, index });
    setEditValue(currentValue !== 0 ? currentValue.toString() : '');
  };

  const commitEdit = async () => {
    if (!editingCell) return;
    isSavingRef.current = true;
    const val = parseLocalizedNumber(editValue);
    const { driverId, field, index } = editingCell;
    
    // Immediately clear editing state so next cell can open
    setEditingCell(null);

    setManualOverrides(prev => {
      const existing = prev[driverId] || {};
      if (field === 'additional_fee' && index !== undefined) {
        return { ...prev, [driverId]: { ...existing, additional_fees: { ...existing.additional_fees, [index]: val } } };
      }
      return { ...prev, [driverId]: { ...existing, [field]: val } };
    });
    
    // Persist to settlements table in background
    try {
      if (!currentWeek) {
        console.error('No currentWeek for saving');
        toast.error('Brak wybranego okresu');
        isSavingRef.current = false;
        openPendingEdit();
        return;
      }
      
      const { data: existingSettlements, error: fetchErr } = await supabase
        .from('settlements')
        .select('id, amounts')
        .eq('driver_id', driverId)
        .gte('period_from', currentWeek.start)
        .lte('period_to', currentWeek.end);
      
      if (fetchErr) {
        console.error('Error fetching settlements for save:', fetchErr);
        toast.error('Błąd odczytu rozliczenia');
        isSavingRef.current = false;
        openPendingEdit();
        return;
      }

      if (!existingSettlements || existingSettlements.length === 0) {
        console.error('No settlement records found for driver', driverId, 'period', currentWeek);
        toast.error('Brak rekordu rozliczenia do zapisu');
        isSavingRef.current = false;
        openPendingEdit();
        return;
      }
      
      const targetId = existingSettlements[0].id;
      const updateData: any = {};
      
      if (field === 'rental') {
        updateData.rental_fee = val;
        const amounts = (existingSettlements[0].amounts as any) || {};
        amounts.manual_rental_fee = val;
        updateData.amounts = amounts;
      }
      
      if (field === 'service_fee' || (field === 'additional_fee' && index !== undefined)) {
        const amounts = (existingSettlements[0].amounts as any) || {};
        if (field === 'service_fee') {
          amounts.manual_service_fee = val;
        } else if (field === 'additional_fee' && index !== undefined) {
          amounts[`manual_fee_${index}`] = val;
        }
        updateData.amounts = amounts;
      }
      
      if (Object.keys(updateData).length > 0) {
        const { error: updateErr } = await supabase
          .from('settlements')
          .update(updateData)
          .eq('id', targetId);

        if (updateErr) {
          console.error('Error saving override:', updateErr);
          toast.error('Błąd zapisu: ' + updateErr.message);
        } else {
          console.log('✅ Saved override for driver', driverId, field, val, 'to settlement', targetId);

          const currentSettlement = settlements.find(s => s.driver_id === driverId);
          if (currentSettlement) {
            const overridePatch: {
              additional_fees?: Record<number, number>;
              service_fee?: number;
              rental?: number;
            } = {};

            if (field === 'rental') overridePatch.rental = val;
            if (field === 'service_fee') overridePatch.service_fee = val;
            if (field === 'additional_fee' && index !== undefined) {
              overridePatch.additional_fees = { [index]: val };
            }

            const settlementForRecalc = applyOverridesToSettlement(currentSettlement, overridePatch);
            const recalculatedPayout = calculateRawPayout(settlementForRecalc);

            const recalculatedPayoutWithoutRental = calculatePayoutWithoutRental(settlementForRecalc);
            const effectiveRentalForDebt = getEffectiveSettlement(settlementForRecalc).rental || 0;

            const { data: debtSyncData, error: debtSyncError } = await supabase.functions.invoke('update-driver-debt', {
              body: {
                driver_id: driverId,
                settlement_id: targetId,
                period_from: currentWeek.start,
                period_to: currentWeek.end,
                calculated_payout: recalculatedPayout,
                calculated_payout_without_rental: recalculatedPayoutWithoutRental,
                rental_fee: effectiveRentalForDebt,
                force_recalculate_chain: true,
              },
            });

            if (debtSyncError || (debtSyncData as any)?.error) {
              console.error('Error syncing debt chain after override:', debtSyncError || debtSyncData);
              toast.error('Zapisano zmianę, ale nie udało się przeliczyć długu');
            }
          }

          await fetchSettlements();
        }
      }
    } catch (err) {
      console.error('Error saving override:', err);
      toast.error('Błąd zapisu');
    }
    
    isSavingRef.current = false;
    openPendingEdit();
  };

  const openPendingEdit = () => {
    const pending = pendingEditRef.current;
    if (pending) {
      pendingEditRef.current = null;
      setEditingCell({ driverId: pending.driverId, field: pending.field, index: pending.index });
      setEditValue(pending.currentValue !== 0 ? pending.currentValue.toString() : '');
    }
  };

  const cancelEdit = () => setEditingCell(null);

  // Render an editable cell
  const renderEditableCell = (driverId: string, field: string, value: number, hasActivity: boolean, index?: number) => {
    const isEditing = editingCell?.driverId === driverId && editingCell?.field === field && editingCell?.index === index;
    const isOverridden = !!manualOverrides[driverId]?.[field === 'additional_fee' ? 'additional_fees' : field as keyof typeof manualOverrides[string]];
    
    if (isEditing) {
      return (
        <Input
          type="text"
          inputMode="decimal"
          value={editValue}
          onChange={(e) => {
            // Allow only numbers, dots and commas
            const v = e.target.value.replace(/[^0-9.,]/g, '');
            setEditValue(v);
          }}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') cancelEdit();
          }}
          placeholder="0.00"
          className="h-6 w-24 text-xs text-right px-1 py-0"
          autoFocus
        />
      );
    }
    
    return (
      <span 
        className={`cursor-pointer hover:bg-primary/10 rounded px-1 py-0.5 transition-colors ${isOverridden ? 'bg-yellow-100 dark:bg-yellow-900/30 font-semibold' : ''}`}
        onClick={() => startEditing(driverId, field, value, index)}
        title="Kliknij aby edytować"
      >
        {value > 0 ? `-${formatCurrency(value)}` : (hasActivity ? '0,00' : '-')}
      </span>
    );
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
      loadPaidStatus();
    }
  }, [fleetId, periodFrom, periodTo, selectedYear, selectedWeek, selectedCityId]);

  const loadPaidStatus = async () => {
    const currentWeekData = weeks.find(w => w.number === selectedWeek);
    if (!currentWeekData) { setPaidDrivers(new Set()); return; }
    try {
      const { data } = await (supabase
        .from('settlements')
        .select('driver_id, is_paid') as any)
        .gte('period_from', currentWeekData.start)
        .lte('period_to', currentWeekData.end)
        .eq('is_paid', true);
      const paidSet = new Set<string>((data || []).map((d: any) => d.driver_id as string));
      setPaidDrivers(paidSet);
    } catch (e) {
      setPaidDrivers(new Set());
    }
  };

  // Only set default tab on FIRST mount, not on every roles/fleetId change
  const defaultTabSetRef = useRef(false);
  useEffect(() => {
    if (defaultTabSetRef.current) return; // Don't re-set tab after initial load
    defaultTabSetRef.current = true;
    
    if (roles.includes('admin')) {
      setActiveSubTab("my");
    } else {
      fetchMyDriverId();
    }
  }, [fleetId, roles]);

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
        
        // Fleet managers (fleet_rental/fleet_settlement) should default to "drivers" tab
        // NOT to "Moje rozliczenia" - they are managers, not drivers
        const isFleetManager = roles.includes('fleet_rental') || roles.includes('fleet_settlement');
        
        if (!roles.includes('admin') && !isFleetManager) {
          // Only pure drivers default to "my" (Moje rozliczenia)
          const { data: hasSettlements } = await supabase
            .from('settlements')
            .select('id')
            .eq('driver_id', data.driver_id)
            .limit(1)
            .maybeSingle();
          
          if (hasSettlements) {
            setActiveSubTab("my");
          } else {
            setActiveSubTab("drivers");
          }
        } else if (isFleetManager) {
          // Fleet managers always default to drivers list
          setActiveSubTab("drivers");
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

  const fetchSettlements = async (options?: { skipDebtSync?: boolean; silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      console.log('🔍 Fetching settlements for fleetId:', fleetId, 'cityId:', selectedCityId);
      console.log('📅 Selected period:', { year: selectedYear, week: selectedWeek, currentWeek });

      // Fetch fleet settings (VAT rate and base fee)
      const { data: fleetData } = await supabase
        .from('fleets')
        .select('vat_rate, base_fee, settlement_mode, secondary_vat_rate, additional_percent_rate')
        .eq('id', fleetId)
        .maybeSingle();
      
      const fleetVatRate = (fleetData as any)?.vat_rate ?? 8;
      const fleetBaseFee = (fleetData as any)?.base_fee ?? 0;
      const fleetSettlementMode = (fleetData as any)?.settlement_mode ?? 'single_tax';
      const fleetSecondaryVatRate = (fleetData as any)?.secondary_vat_rate ?? 23;
      const fleetAdditionalPercentRate = (fleetData as any)?.additional_percent_rate ?? 0;
      
      // Store in state for header display
      setFleetVatRateState(fleetVatRate);
      setFleetSettlementModeState(fleetSettlementMode);
      setFleetSecondaryVatRateState(fleetSecondaryVatRate);
      setFleetAdditionalPercentRateState(fleetAdditionalPercentRate);

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
          billing_method,
          b2b_enabled,
          b2b_vat_payer,
          exclude_from_settlements,
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

      // Filter out fleet owners (users with fleet_settlement or fleet_rental roles)
      const { data: fleetOwnerRoles } = await supabase
        .from('user_roles')
        .select('user_id, fleet_id')
        .in('role', ['fleet_settlement', 'fleet_rental']);
      
      // Get driver_app_users to map user_id -> driver_id for fleet owners
      const { data: fleetOwnerDriverLinks } = await supabase
        .from('driver_app_users')
        .select('driver_id, user_id');
      
      const fleetOwnerUserIds = new Set((fleetOwnerRoles || []).map(r => (r as any).user_id || '').filter(Boolean));
      const fleetOwnerDriverIds = new Set(
        (fleetOwnerDriverLinks || [])
          .filter(link => fleetOwnerUserIds.has(link.user_id))
          .map(link => link.driver_id)
      );

      const filteredDriversData = driversData.filter(d => 
        !fleetOwnerDriverIds.has(d.id) && !(d as any).exclude_from_settlements
      );
      
      if (filteredDriversData.length === 0) {
        setSettlements([]);
        setLoading(false);
        return;
      }

      const driverIds = filteredDriversData.map(d => d.id);

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

      // Pobierz aktywne przypisania pojazdów z opłatą wynajmu i datą przypisania
      const { data: assignmentsData } = await supabase
        .from('driver_vehicle_assignments')
        .select(`
          driver_id,
          vehicle_id,
          assigned_at,
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

      // Pobierz aktualne długi kierowców (fallback) + ledger transakcji do live podziału settlement/rental
      const [{ data: debtsData }, { data: debtTransactionsData }] = await Promise.all([
        supabase
          .from('driver_debts')
          .select('driver_id, current_balance')
          .in('driver_id', driverIds),
        supabase
          .from('driver_debt_transactions')
          .select('driver_id, type, amount, debt_category')
          .in('driver_id', driverIds),
      ]);
      
      const debtsMap: Record<string, number> = {};
      (debtsData || []).forEach(d => {
        debtsMap[d.driver_id] = d.current_balance || 0;
      });
      setDriverDebts(debtsMap);

      const liveDebtByDriver = new Map<string, { settlement: number; rental: number }>();
      (debtTransactionsData || []).forEach((tx: any) => {
        const category = tx.debt_category === 'rental' ? 'rental' : 'settlement';
        const amount = Math.abs(Number(tx.amount) || 0);
        const delta = tx.type === 'debt_increase' || tx.type === 'manual_add' ? amount : -amount;
        const current = liveDebtByDriver.get(tx.driver_id) || { settlement: 0, rental: 0 };
        current[category] = round2(current[category] + delta);
        liveDebtByDriver.set(tx.driver_id, current);
      });

      liveDebtByDriver.forEach((value, key) => {
        liveDebtByDriver.set(key, {
          settlement: Math.max(0, round2(value.settlement)),
          rental: Math.max(0, round2(value.rental)),
        });
      });

      // Rozdzielenie długu na 2 strumienie: rozliczenie vs wynajem (łańcuch tygodniowy)
      const selectedPeriodTo = currentWeek?.end || periodTo;
      let settlementHistoryQuery = supabase
        .from('settlements')
        .select('driver_id, period_from, period_to, rental_fee, debt_before, debt_after, debt_payment, actual_payout, amounts, updated_at')
        .in('driver_id', driverIds);

      if (selectedPeriodTo) {
        settlementHistoryQuery = settlementHistoryQuery.lte('period_to', selectedPeriodTo);
      }

      const { data: settlementHistoryData } = await settlementHistoryQuery;

      const splitDebtByWeek = new Map<string, {
        settlementDebtBefore: number;
        rentalDebtBefore: number;
        settlementDebtAfter: number;
        rentalDebtAfter: number;
      }>();

      const fallbackRentalByDriver = new Map<string, { weeklyRate: number; assignedAt: string }>();
      (assignmentsData || []).forEach((assignment: any) => {
        const fallbackRental = Number((assignment?.vehicles as any)?.weekly_rental_fee || 0);
        if (fallbackRental > 0 && !fallbackRentalByDriver.has(assignment.driver_id)) {
          fallbackRentalByDriver.set(assignment.driver_id, {
            weeklyRate: fallbackRental,
            assignedAt: assignment.assigned_at || '',
          });
        }
      });

      for (const driverId of driverIds) {
        const historyRows = (settlementHistoryData || []).filter((row: any) => row.driver_id === driverId);
        if (historyRows.length === 0) continue;

        const weeklyRollup = new Map<string, {
          periodFrom: string;
          periodTo: string;
          payoutNoRental: number;
          rental: number;
          debtBeforeMax: number;
        }>();

        historyRows.forEach((row: any) => {
          const periodFromKey = row.period_from || '';
          const periodToKey = row.period_to || '';
          const weekKey = `${periodFromKey}|${periodToKey}`;
          const amounts = (row.amounts as any) || {};
          const rawPayout = deriveRawPayoutFromSettlementSnapshot(row);

          const manualRentalFee = amounts?.manual_rental_fee;
          const baseFromAmounts = Number(amounts.uber_base || 0) + Number(amounts.bolt_projected_d || 0) + Number(amounts.freenow_base_s || 0);
          const cashFromAmounts = Number(amounts.uber_cash_f || 0) + Number(amounts.bolt_cash || 0) + Number(amounts.freenow_cash_f || 0);
          const hasAnyActivity = Math.abs(baseFromAmounts) > 0.01 || Math.abs(cashFromAmounts) > 0.01;

          let rentalFee = Number(row.rental_fee || 0);
          if (manualRentalFee !== null && manualRentalFee !== undefined) {
            rentalFee = Number(manualRentalFee || 0);
          } else if (rentalFee <= 0 && hasAnyActivity) {
            const fallback = fallbackRentalByDriver.get(driverId);
            if (fallback && fallback.assignedAt && periodFromKey && periodToKey) {
              rentalFee = calculateProportionalRentForSettlement(
                fallback.assignedAt, periodFromKey, periodToKey, fallback.weeklyRate
              );
            } else {
              rentalFee = fallback?.weeklyRate || 0;
            }
          }

          const debtBefore = Math.max(0, Number(row.debt_before || 0));

          const existing = weeklyRollup.get(weekKey) || {
            periodFrom: periodFromKey,
            periodTo: periodToKey,
            payoutNoRental: 0,
            rental: 0,
            debtBeforeMax: 0,
          };

          existing.payoutNoRental = round2(existing.payoutNoRental + rawPayout + rentalFee);
          existing.rental = round2(existing.rental + rentalFee);
          existing.debtBeforeMax = Math.max(existing.debtBeforeMax, debtBefore);

          weeklyRollup.set(weekKey, existing);
        });

        const sortedWeeks = [...weeklyRollup.values()].sort(
          (a, b) => new Date(a.periodFrom).getTime() - new Date(b.periodFrom).getTime()
        );

        if (sortedWeeks.length === 0) continue;

        let runningSettlementDebt = round2(Math.max(0, sortedWeeks[0].debtBeforeMax || 0));
        let runningRentalDebt = 0;

        for (const week of sortedWeeks) {
          const weekKey = `${week.periodFrom}|${week.periodTo}`;
          const settlementDebtBefore = runningSettlementDebt;
          const rentalDebtBefore = runningRentalDebt;

          const wyplata1 = round2(week.payoutNoRental - settlementDebtBefore);
          const settlementDebtAfter = round2(Math.max(0, -wyplata1));

          const availableForRental = Math.max(0, wyplata1);
          const remainingPreviousRentalDebt = Math.max(0, rentalDebtBefore - availableForRental);
          const availableAfterPreviousRentalDebt = Math.max(0, availableForRental - rentalDebtBefore);
          const currentRentalDebt = Math.max(0, week.rental - availableAfterPreviousRentalDebt);
          const rentalDebtAfter = round2(remainingPreviousRentalDebt + currentRentalDebt);

          splitDebtByWeek.set(`${driverId}|${weekKey}`, {
            settlementDebtBefore,
            rentalDebtBefore,
            settlementDebtAfter,
            rentalDebtAfter,
          });

          runningSettlementDebt = settlementDebtAfter;
          runningRentalDebt = rentalDebtAfter;
        }
      }

      // Mapuj numery kart paliwowych kierowców (normalizacja - usuń wiodące zera)
      // CROSS-FLEET: Kierowca może mieć kartę paliwową przypisaną w innej flocie
      const driverFuelCards: Record<string, string> = {};
      filteredDriversData.forEach(d => {
        const driver = d as any;
        if (driver.fuel_card_number) {
          driverFuelCards[driver.id] = driver.fuel_card_number.replace(/^0+/, '');
        }
      });
      
      // For drivers without fuel cards, check if same person (by name) has a card in another fleet
      const driversWithoutCards = filteredDriversData.filter(d => !(d as any).fuel_card_number);
      if (driversWithoutCards.length > 0) {
        const names = driversWithoutCards.map(d => `${(d as any).first_name} ${(d as any).last_name}`);
        const { data: crossFleetCards } = await supabase
          .from('drivers')
          .select('first_name, last_name, fuel_card_number')
          .not('fuel_card_number', 'is', null)
          .neq('fleet_id', fleetId);
        
        if (crossFleetCards) {
          const cardsByName: Record<string, string> = {};
          crossFleetCards.forEach((d: any) => {
            if (d.fuel_card_number) {
              cardsByName[`${d.first_name} ${d.last_name}`.toLowerCase()] = d.fuel_card_number.replace(/^0+/, '');
            }
          });
          
          driversWithoutCards.forEach(d => {
            const driver = d as any;
            const key = `${driver.first_name} ${driver.last_name}`.toLowerCase();
            if (cardsByName[key] && !driverFuelCards[driver.id]) {
              driverFuelCards[driver.id] = cardsByName[key];
              console.log(`⛽ Cross-fleet fuel card found for ${driver.first_name} ${driver.last_name}: ${cardsByName[key]}`);
            }
          });
        }
      }

      // Agreguj rozliczenia per kierowca
      const aggregated = filteredDriversData.map(driver => {
        const driverSettlements = settlementsData?.filter(s => s.driver_id === driver.id) || [];
        const settlementSnapshot = [...driverSettlements]
          .sort((a, b) => new Date((b as any).updated_at || 0).getTime() - new Date((a as any).updated_at || 0).getTime())[0];
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
          // Jeśli bolt_projected_d = 0 ale bolt_payout_s != 0, użyj bolt_payout_s jako base
          // (np. kierowca ma tylko opłaty Bolt bez kursów = -6.77)
          let bolt = parseFloat(amounts.bolt_projected_d || amounts.boltGross || '0');
          if (bolt === 0) {
            const boltPayout = parseFloat(amounts.bolt_payout_s || '0');
            if (boltPayout !== 0) {
              bolt = boltPayout;
            }
          }
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

        // Pobierz service_fee - PRIORYTET: zapisana wartość z amounts JSON, potem opłata flotowa, potem plan
        const driverAppUser = (driver as any).driver_app_users;
        const plan = plansData?.find(p => p.id === driverAppUser?.settlement_plan_id);
        
        // Check if there's a persisted override in settlement record (amounts JSON)
        const firstSettlement = driverSettlements[0];
        const firstAmounts = (firstSettlement?.amounts as any) || {};
        const persistedServiceFee = firstAmounts.manual_service_fee;
        const persistedRentalFee = firstSettlement?.rental_fee;
        
        // fleetBaseFee może być 0 (darmowa flota) - to jest dozwolone!
        // Priority: 1) persisted manual override, 2) per-driver custom_weekly_fee, 3) fleet base fee, 4) plan fee
        const driverCustomFee = (driver as any).custom_weekly_fee;
        const service_fee = persistedServiceFee !== null && persistedServiceFee !== undefined
          ? persistedServiceFee
          : (driverCustomFee !== null && driverCustomFee !== undefined
            ? driverCustomFee
            : (fleetBaseFee !== null && fleetBaseFee !== undefined 
              ? fleetBaseFee 
              : (plan?.service_fee ?? 50)));

        // Pobierz wynajem z przypisanego pojazdu lub z zapisanego override
        // Sprawdź manual_rental_fee w amounts JSON - to jest marker ręcznego nadpisania
        // Dzięki temu wartość 0 ustawiona ręcznie nie będzie nadpisana wartością z pojazdu
        const manualRentalFee = firstAmounts.manual_rental_fee;
        const assignment = assignmentsData?.find(a => a.driver_id === driver.id);
        const vehicleWeeklyRate = (assignment?.vehicles as any)?.weekly_rental_fee || 0;
        // Calculate proportional rental based on assignment date (same as FleetVehicleRevenue)
        const assignedAt = (assignment as any)?.assigned_at;
        const vehicleRentalFee = (assignedAt && vehicleWeeklyRate > 0 && currentWeek)
          ? calculateProportionalRentForSettlement(assignedAt, currentWeek.start, currentWeek.end, vehicleWeeklyRate)
          : vehicleWeeklyRate;
        const rental = (manualRentalFee !== null && manualRentalFee !== undefined)
          ? manualRentalFee
          : (persistedRentalFee !== null && persistedRentalFee !== undefined && persistedRentalFee > 0)
            ? persistedRentalFee
            : vehicleRentalFee;

        // Oblicz wypłatę
        const total_base = uber_base + bolt_base + freenow_base;
        // VAT base uses only positive platform amounts — negative amounts (e.g. Bolt -6.77)
        // should reduce payout but NOT reduce the VAT base
        const vat_base = Math.max(0, uber_base) + Math.max(0, bolt_base) + Math.max(0, freenow_base);

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

        // Snapshot długu dla bieżącego widoku tygodnia:
        // Użyj TYLKO historycznych snapshotów z rekordu rozliczenia.
        // Fallback na live balance TYLKO dla najnowszego tygodnia.
        const debtAfterFromSettlement = driverSettlements.reduce((max, s) => {
          const da = (s as any).debt_after;
          if (da !== null && da !== undefined) return Math.max(max, parseFloat(da?.toString() || '0'));
          return max;
        }, -1);

        const hasDebtBeforeSnapshot = driverSettlements.some(s => {
          const db = (s as any).debt_before;
          return db !== null && db !== undefined;
        });

        const debtBeforeFromSettlement = driverSettlements.reduce((max, s) => {
          const db = (s as any).debt_before ?? 0;
          return Math.max(max, parseFloat(db?.toString() || '0'));
        }, 0);

        // Czy przeglądamy najnowszy (bieżący) tydzień?
        const isLatestWeek = weeks.length > 0 && selectedWeek === weeks[0].number;

        const liveBalance = debtsMap[driver.id];
        const liveCategoryDebt = liveDebtByDriver.get(driver.id) || { settlement: 0, rental: 0 };
        const liveTotalBalance = round2(liveCategoryDebt.settlement + liveCategoryDebt.rental);

        // Dług po rozliczeniu: dla bieżącego tygodnia bierz live balance z ledgera
        const snapshotDebtAfter = debtAfterFromSettlement >= 0 ? debtAfterFromSettlement : 0;
        const currentDebtForDisplay = isLatestWeek
          ? (liveTotalBalance > 0 || (liveCategoryDebt.settlement > 0 || liveCategoryDebt.rental > 0)
              ? liveTotalBalance
              : (liveBalance !== undefined ? liveBalance : snapshotDebtAfter))
          : snapshotDebtAfter;

        // Dług przed rozliczeniem: snapshot historyczny, ale dla bieżącego tygodnia pokazuj live split
        const debtBeforeForDisplay = hasDebtBeforeSnapshot
          ? debtBeforeFromSettlement
          : 0;

        const rowPeriodFrom = (settlementSnapshot as any)?.period_from || currentWeek?.start || periodFrom || '';
        const rowPeriodTo = (settlementSnapshot as any)?.period_to || currentWeek?.end || periodTo || '';
        const splitDebt = splitDebtByWeek.get(`${driver.id}|${rowPeriodFrom}|${rowPeriodTo}`);
        const settlementDebtBeforeForDisplay = isLatestWeek
          ? liveCategoryDebt.settlement
          : (splitDebt?.settlementDebtBefore ?? debtBeforeForDisplay);
        const rentalDebtBeforeForDisplay = isLatestWeek
          ? liveCategoryDebt.rental
          : (splitDebt?.rentalDebtBefore ?? 0);
        const snapshotSettlementDebtAfter = splitDebt?.settlementDebtAfter ?? 0;
        const snapshotRentalDebtAfter = splitDebt?.rentalDebtAfter ?? 0;

        // ⚠️ OCHRONA ZEROWYCH ZAROBKÓW
        // Jeśli kierowca nie jeździł (suma zarobków = 0) I nie ma ujemnego salda
        // NIE naliczamy opłat, ale jeśli ma dług to nadal pokazujemy go na liście
        if (total_base === 0 && platform_net >= 0) {
          return {
            driver_id: driver.id,
            driver_name: `${driver.first_name} ${driver.last_name}`,
            uber_base: 0, uber_cash: 0, uber_commission: 0,
            bolt_base: 0, bolt_cash: 0, bolt_commission: 0,
            freenow_base: 0, freenow_cash: 0, freenow_commission: 0,
            total_base: 0, total_commission: 0, total_cash: 0,
            tax_8_percent: 0, vat_amount: 0,
            service_fee: 0,
            additional_fees: [],
            rental: 0,
            fuel: 0, fuel_vat_refund: 0,
            net_without_commission: 0,
            final_payout: 0,
            has_negative_balance: false,
            debt_current: currentDebtForDisplay,
            debt_previous: settlementDebtBeforeForDisplay,
            rental_debt_previous: rentalDebtBeforeForDisplay,
            settlement_id: (settlementSnapshot as any)?.id,
            period_from: (settlementSnapshot as any)?.period_from,
            period_to: (settlementSnapshot as any)?.period_to,
            snapshot_debt_before: (settlementSnapshot as any)?.debt_before ?? undefined,
            snapshot_debt_after: (settlementSnapshot as any)?.debt_after ?? undefined,
            snapshot_debt_payment: (settlementSnapshot as any)?.debt_payment ?? undefined,
            snapshot_actual_payout: (settlementSnapshot as any)?.actual_payout ?? undefined,
            snapshot_settlement_debt_after: snapshotSettlementDebtAfter,
            snapshot_rental_debt_after: snapshotRentalDebtAfter,
          };
        }

        // 🚫 FILTRUJ WŁAŚCICIELI FLOT: Jeśli kierowca ma bardzo duże ujemne saldo (wypłata bez kursów)
        // np. Daniel Moshechkov z uber_base = -13450.97 = to właściciel floty, ukryj go
        // Małe ujemne kwoty (np. -6.77 z Bolt) to normalni kierowcy z negatywnym saldem
        if (total_base < -1000) {
          // Return null to be filtered out later
          return null;
        }

        // Calculate B2B/VAT status early — needed for negative balance path too
        const driverInfo = driver as any;
        const appUserData = driverInfo.driver_app_users;
        const b2bProfile = b2bProfilesMap.get(appUserData?.user_id);
        const isB2BDriver = driverInfo.payment_method === 'b2b' 
                         || driverInfo.billing_method === 'b2b' 
                         || driverInfo.b2b_enabled === true;
        const isB2BVatPayer = isB2BDriver && (driverInfo.b2b_vat_payer === true || b2bProfile?.vat_payer === true);
        const effectiveVatRate = isB2BVatPayer ? 0 : fleetVatRate;


        // Nie naliczamy opłat serwisowych ani dodatkowych, ale VAT liczymy normalnie wg ustawień
        if (platform_net < 0) {
          // VAT z ujemnej kwoty wg stawki floty (np. -6.77 * 8% = -0.54)
          const negVatAmount = platform_net * (effectiveVatRate / 100);
          const negFinalPayout = platform_net - negVatAmount; // np. -6.77 - (-0.54) = -6.23
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
            vat_amount: negVatAmount,
            service_fee: 0,
            additional_fees: [],
            rental: 0,
            fuel: 0,
            fuel_vat_refund: 0,
            net_without_commission: platform_net,
            final_payout: negFinalPayout,
            has_negative_balance: true,
            negative_deficit: Math.abs(negFinalPayout),
            debt_current: currentDebtForDisplay,
            debt_previous: settlementDebtBeforeForDisplay,
            rental_debt_previous: rentalDebtBeforeForDisplay,
            settlement_id: (settlementSnapshot as any)?.id,
            period_from: (settlementSnapshot as any)?.period_from,
            period_to: (settlementSnapshot as any)?.period_to,
            snapshot_debt_before: (settlementSnapshot as any)?.debt_before ?? undefined,
            snapshot_debt_after: (settlementSnapshot as any)?.debt_after ?? undefined,
            snapshot_debt_payment: (settlementSnapshot as any)?.debt_payment ?? undefined,
            snapshot_actual_payout: (settlementSnapshot as any)?.actual_payout ?? undefined,
            snapshot_settlement_debt_after: snapshotSettlementDebtAfter,
            snapshot_rental_debt_after: snapshotRentalDebtAfter,
          };
        }

        // B2B/VAT already calculated above (before negative balance check)

        // === DUAL TAX MODE: Calculate from specific Bolt CSV columns ===
        let vat_amount = 0;
        let bolt_ef_base = 0;
        let bolt_ijk_base = 0;
        let additional_percent_amount = 0;
        let secondary_vat_amount = 0;

        if (fleetSettlementMode === 'dual_tax') {
          // Aggregate Bolt columns E, F, G, I, J, K from amounts JSON
          bolt_ef_base = driverSettlements.reduce((sum, s) => {
            const amounts = s.amounts as any || {};
            return sum + parseFloat(amounts.bolt_col_e || '0') + parseFloat(amounts.bolt_col_f || '0');
          }, 0);
          
          // Bonusy (I) + Rekompensaty (K) - these are 23% VAT items, FULLY deducted from payout
          const bolt_i_base = driverSettlements.reduce((sum, s) => {
            const amounts = s.amounts as any || {};
            return sum + parseFloat(amounts.bolt_col_i || '0');
          }, 0);
          const bolt_k_base = driverSettlements.reduce((sum, s) => {
            const amounts = s.amounts as any || {};
            return sum + parseFloat(amounts.bolt_col_k || '0');
          }, 0);
          // Anulacje (J) - informational only, already reflected in Bolt payout S
          const bolt_j_base = driverSettlements.reduce((sum, s) => {
            const amounts = s.amounts as any || {};
            return sum + parseFloat(amounts.bolt_col_j || '0');
          }, 0);
          // Napiwki (G) - informational, included in S
          const bolt_g_tips = driverSettlements.reduce((sum, s) => {
            const amounts = s.amounts as any || {};
            return sum + parseFloat(amounts.bolt_col_g || '0');
          }, 0);
          
          bolt_ijk_base = bolt_i_base + bolt_j_base + bolt_k_base; // Keep for backward compat
          
          // Tax 1: Combined VAT% + Additional% from Bolt D (brutto)
          // e.g. 8% VAT + 1% additional = 9% total
          const combinedVatRate = effectiveVatRate + fleetAdditionalPercentRate;
          // Use bolt_base (Column D) for primary VAT calculation
          const bolt_vat_ef = isB2BVatPayer ? 0 : Math.max(0, bolt_base) * (combinedVatRate / 100);
          additional_percent_amount = 0;
          // Tax 2: 23% VAT on campaigns(I) + returns(J) + cancellations(K)
          secondary_vat_amount = isB2BVatPayer ? 0 : (Math.abs(bolt_i_base) + Math.abs(bolt_j_base) + Math.abs(bolt_k_base)) * (fleetSecondaryVatRate / 100);
          
          // For Uber and FreeNow, still use standard VAT from positive base only
          const uber_freenow_base = Math.max(0, uber_base) + Math.max(0, freenow_base);
          const uber_freenow_vat = isB2BVatPayer ? 0 : uber_freenow_base * (effectiveVatRate / 100);
          
          vat_amount = bolt_vat_ef + uber_freenow_vat;
        } else {
          // === SINGLE TAX MODE: VAT from positive-only base (negative platform amounts don't reduce VAT) ===
          vat_amount = vat_base * (effectiveVatRate / 100);
        }

        // Helper: sprawdź czy tydzień jest pierwszym pełnym tygodniem miesiąca
        const isFirstFullWeekOfMonth = (weekStart: string): boolean => {
          const start = new Date(weekStart);
          return start.getDate() >= 1 && start.getDate() <= 7;
        };

        const isFirstWeek = periodStart ? isFirstFullWeekOfMonth(periodStart) : false;

        // Calculate additional fees from fleet_settlement_fees
        const additional_fees = fleetFees
          .filter(fee => {
            const periodStartDate = periodStart ? new Date(periodStart) : new Date();
            if ((fee as any).valid_from) {
              const validFromDate = new Date((fee as any).valid_from);
              if (validFromDate > periodStartDate) return false;
            }
            if ((fee as any).valid_to) {
              const validToDate = new Date((fee as any).valid_to);
              if (validToDate < periodStartDate) return false;
            }
            if (fee.frequency === 'weekly') return true;
            if (fee.frequency === 'monthly' && isFirstWeek) return true;
            return false;
          })
          .map((fee, idx) => {
            const manualKey = `manual_fee_${idx}`;
            const manualVal = firstAmounts[manualKey];
            const baseAmount = fee.type === 'fixed' ? fee.amount : total_base * (fee.amount / 100);
            return {
              name: fee.name,
              amount: manualVal !== null && manualVal !== undefined ? manualVal : baseAmount
            };
          });

        const total_additional_fees = additional_fees.reduce((sum, f) => sum + f.amount, 0);

        // Calculate payout based on mode
        let payout: number;
        if (fleetSettlementMode === 'dual_tax') {
          // Correct formula: Netto(R) - Cash(G) - 9%(D) - 23%(I+J+K) - fees
          // netto_calc = total_base - total_commission (= bolt_net + uber_net + freenow_net)
          const netto_calc = total_base - total_commission;
          
          payout = netto_calc 
                   - total_cash                   // Cash (G) from all platforms
                   - vat_amount                   // Combined VAT% of Brutto (D)
                   - secondary_vat_amount         // 23% of (I+J+K)
                   - service_fee - total_additional_fees - rental 
                   - total_fuel + total_fuel_vat_refund;
        } else {
          // Single tax (current formula)
          payout = total_base - total_commission - vat_amount - service_fee - total_additional_fees - rental - total_cash - total_fuel + total_fuel_vat_refund;
        }

        // debtBeforeForDisplay/currentDebtForDisplay wyliczone wyżej (także dla tygodni bez jazdy)
        // Store raw payout (can be negative) — debt adjustment happens at render time via getDoWyplaty()
        let hasNegativeBalance = payout < 0;

        // Aggregate Bolt tips and anulacje for display
        const bolt_tips = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          return sum + parseFloat(amounts.bolt_col_g || '0');
        }, 0);
        const bolt_bonusy = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          return sum + parseFloat(amounts.bolt_col_i || '0');
        }, 0);
        const bolt_rekompensaty = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          return sum + parseFloat(amounts.bolt_col_k || '0');
        }, 0);
        const bolt_anulacje = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          return sum + parseFloat(amounts.bolt_col_j || '0');
        }, 0);
        // Netto = Brutto - Prowizja (what driver earned before fleet deductions)
        const netto = total_base - total_commission;

        return {
          driver_id: driver.id,
          driver_name: `${driver.first_name} ${driver.last_name}`,
          payment_method: (driver as any).payment_method || null,
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
          tax_8_percent: vat_amount,
          vat_amount,
          service_fee,
          additional_fees,
          rental,
          fuel: total_fuel,
          fuel_vat_refund: total_fuel_vat_refund,
          net_without_commission: netto,
          final_payout: payout,
          has_negative_balance: hasNegativeBalance,
          negative_deficit: hasNegativeBalance ? Math.abs(payout) : 0,
          debt_current: currentDebtForDisplay,
          debt_previous: settlementDebtBeforeForDisplay,
          rental_debt_previous: rentalDebtBeforeForDisplay,
          // Dual tax fields
          bolt_ef_base,
          bolt_ijk_base,
          additional_percent_amount,
          secondary_vat_amount: secondary_vat_amount,
          // Display fields for dual_tax reference columns
          bolt_tips,
          bolt_bonusy,
          bolt_rekompensaty,
          bolt_anulacje,
          netto,
          settlement_id: (settlementSnapshot as any)?.id,
          period_from: (settlementSnapshot as any)?.period_from,
          period_to: (settlementSnapshot as any)?.period_to,
          snapshot_debt_before: (settlementSnapshot as any)?.debt_before ?? undefined,
          snapshot_debt_after: (settlementSnapshot as any)?.debt_after ?? undefined,
          snapshot_debt_payment: (settlementSnapshot as any)?.debt_payment ?? undefined,
          snapshot_actual_payout: (settlementSnapshot as any)?.actual_payout ?? undefined,
          snapshot_settlement_debt_after: snapshotSettlementDebtAfter,
          snapshot_rental_debt_after: snapshotRentalDebtAfter,
        };
      });

      // 🧹 FILTROWANIE KIEROWCÓW BEZ DANYCH - usuwamy "śmieciowe" wiersze i null
      // Pokazuj TYLKO kierowców którzy mają zarobki (total_base > 0)
      // UKRYJ: kierowców z zerowym saldem, bez zarobków, właścicieli
      const filteredAggregated = aggregated
        .filter((row): row is NonNullable<typeof row> => row !== null) // Remove null rows (fleet owners)
        .filter(row => {
          // Pokazuj kierowców z zarobkami (dodatnimi LUB ujemnymi) LUB z ujemnym saldem LUB z długiem
          return row.total_base !== 0 || row.has_negative_balance === true || (row.debt_current || 0) > 0;
        });

      console.log('📈 Aggregated settlements:', aggregated.length);
      console.log('🧹 Filtered (removed ghost drivers + owners):', filteredAggregated.length);
      console.log('✅ Sample settlement:', filteredAggregated[0]);

      if (!options?.skipDebtSync) {
        const settlementsNeedingDebtSync = filteredAggregated.filter(row => {
          if (!row.settlement_id || !row.period_from || !row.period_to) return false;

          const snapshotRawPayout = getSnapshotRawPayout(row);
          if (snapshotRawPayout === null) return false;

          const currentRawPayout = round2(getEffectiveSettlement(row).final_payout);
          return Math.abs(snapshotRawPayout - currentRawPayout) > 0.5;
        });

        if (settlementsNeedingDebtSync.length > 0) {
          console.log(`♻️ Debt snapshot mismatch detected for ${settlementsNeedingDebtSync.length} drivers, syncing chain...`);

          const syncResults = await Promise.all(
            settlementsNeedingDebtSync.map(async (row) => {
              try {
                const effectiveRow = getEffectiveSettlement(row);
                const currentRawPayout = round2(effectiveRow.final_payout);
                const currentPayoutWithoutRental = round2(calculatePayoutWithoutRental(effectiveRow));
                const effectiveRentalForDebt = effectiveRow.rental || 0;
                const { error } = await supabase.functions.invoke('update-driver-debt', {
                  body: {
                    driver_id: row.driver_id,
                    settlement_id: row.settlement_id,
                    period_from: row.period_from,
                    period_to: row.period_to,
                    calculated_payout: currentRawPayout,
                    calculated_payout_without_rental: currentPayoutWithoutRental,
                    rental_fee: effectiveRentalForDebt,
                    force_recalculate_chain: true,
                  },
                });

                return { driverId: row.driver_id, ok: !error, error };
              } catch (error) {
                return { driverId: row.driver_id, ok: false, error };
              }
            })
          );

          const failedSyncs = syncResults.filter(r => !r.ok);
          if (failedSyncs.length === 0) {
            await fetchSettlements({ skipDebtSync: true });
            return;
          }

          console.error('❌ Debt sync failed for drivers:', failedSyncs);
          toast.error('Część długów nie została przeliczona automatycznie');
        }
      }

      setSettlements(filteredAggregated);
    } catch (error: any) {
      toast.error('Błąd ładowania rozliczeń: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Show "Moje rozliczenia" for:
  // 1. Admins -> "Przychód firmy"
  // 2. Any user with myDriverId (fleet owner or driver) -> "Moje rozliczenia"
  const subTabs = [
    ...(roles.includes('admin') 
      ? [{ value: "my", label: "Przychód firmy", visible: true }] 
      : myDriverId 
        ? [{ value: "my", label: "Moje rozliczenia", visible: true }] 
        : []
    ),
    { value: "import", label: "Rozlicz kierowców", visible: true },
    { value: "drivers", label: "Rozliczenia kierowców", visible: true },
    { value: "vehicles", label: "Przychody aut", visible: true },
    { value: "fuel", label: "Paliwo", visible: true },
    { value: "owner_payments", label: "My winni", visible: true },
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
        <FleetCitySettings fleetId={fleetId} />
        <div className="mt-4">
          <FleetSettlementSettings fleetId={fleetId} />
        </div>
      </div>
    );
  }

  // Render "My winni" tab
  if (activeSubTab === "owner_payments") {
    return (
      <div>
        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />
        <FleetOwnerPayments fleetId={fleetId} />
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
    
    // For fleet owners and drivers: show their own settlements
    // Anyone with myDriverId (fleet owner or driver) sees their own settlements
    if (myDriverId) {
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
          <div className="flex items-center gap-2">
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNewRecordsAlert(0)}
              className="h-8 w-8 p-0 text-amber-700 hover:text-amber-900 hover:bg-amber-500/20"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
        <div className="w-full space-y-4 overflow-x-hidden">
            <CardTitle>Rozliczenia kierowców</CardTitle>
            {/* Mobile layout: stacked */}
            <div className="flex flex-col gap-3 md:hidden">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Miasto:</Label>
                  <Select value={selectedCityId} onValueChange={setSelectedCityId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Wszystkie" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Wszystkie</SelectItem>
                      {cities.map(city => (
                        <SelectItem key={city.id} value={city.id}>{city.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Rok:</Label>
                  <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2024, 2025, 2026].map(year => (
                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Okres:</Label>
                <Select 
                  value={selectedWeek?.toString() || ''} 
                  onValueChange={(v) => setSelectedWeek(parseInt(v))}
                  disabled={selectedWeek === null}
                >
                  <SelectTrigger className="h-9">
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
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Szukaj kierowcy..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
            
            {/* Desktop layout: inline */}
            <div className="hidden md:flex w-full items-center gap-4 flex-wrap">
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
              <div className="flex items-center gap-2">
                <Label className="text-sm">Wypłata:</Label>
                <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszyscy</SelectItem>
                    <SelectItem value="cash">Gotówka</SelectItem>
                    <SelectItem value="transfer">Przelew</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="h-6 w-px bg-border hidden md:block" />
              {/* Column visibility popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                    <SlidersHorizontal className="h-4 w-4" />
                    Kolumny
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-3" align="start">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Widoczność kolumn</p>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {SINGLE_TAX_COLUMNS.map(col => (
                      <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                        <Checkbox
                          checked={isColVisible(col.key)}
                          onCheckedChange={() => toggleColumn(col.key)}
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant={showRentalColumns ? "default" : "outline"}
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => {
                  const next = !showRentalColumns;
                  setShowRentalColumns(next);
                  try { localStorage.setItem(`fleet_show_rental_${fleetId}`, String(next)); } catch {}
                }}
              >
                {showRentalColumns ? '🚗 Z autami' : '📊 Bez aut'}
              </Button>
              <div className="h-6 w-px bg-border hidden md:block" />
              <div className="flex flex-wrap items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => { setPayoutType('cash'); setPayoutDialogOpen(true); }}
                  className="gap-1.5 text-xs"
                >
                  <Banknote className="h-4 w-4" />
                  <span className="hidden sm:inline">Generuj</span> KW gotówka
                </Button>
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={() => setBankTransferDialogOpen(true)}
                  className="gap-1.5 text-xs"
                >
                  <CreditCard className="h-4 w-4" />
                  <span className="hidden sm:inline">Generuj</span> przelew
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleCheckUnmappedDrivers}
                  disabled={checkingUnmapped}
                  className="gap-1.5 text-xs"
                >
                  {checkingUnmapped ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Sprawdź</span> nowych
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="gap-1.5 text-xs"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Usuń rozliczenie</span>
                </Button>
              </div>
            </div>
            
            {/* Mobile action buttons - 2 rows */}
            <div className="md:hidden grid grid-cols-2 gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => { setPayoutType('cash'); setPayoutDialogOpen(true); }}
                className="gap-1.5 text-xs h-9"
              >
                <Banknote className="h-4 w-4" />
                KW gotówka
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setBankTransferDialogOpen(true)}
                className="gap-1.5 text-xs h-9"
              >
                <CreditCard className="h-4 w-4" />
                Przelew
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleCheckUnmappedDrivers}
                disabled={checkingUnmapped}
                className="gap-1.5 text-xs h-9"
              >
                {checkingUnmapped ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
                Nowi
              </Button>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                className="gap-1.5 text-xs h-9"
              >
                <Trash2 className="h-4 w-4" />
                Usuń
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Bank Transfer Export Dialog */}
        <BankTransferExportDialog
          open={bankTransferDialogOpen}
          onOpenChange={(open) => {
            setBankTransferDialogOpen(open);
            if (!open) {
              // Auto-mark transfer drivers as paid when dialog closes
              const transferDriverIds = settlements
                .filter(s => s.payment_method === 'transfer' && s.final_payout !== 0)
                .map(s => s.driver_id);
              markTransferDriversPaid(transferDriverIds);
            }
          }}
          fleetId={fleetId}
          settlements={settlements.map(s => {
            return { ...s, final_payout: getDoWyplaty(s) };
          })}
          periodLabel={currentWeek?.label || `Tydzień ${selectedWeek}`}
          periodEnd={currentWeek?.end}
        />

        {/* City Selection Dialog for Cash Payouts */}
        <Dialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                Generuj listę wypłat gotówkowych
              </DialogTitle>
              <DialogDescription>
                Wybierz miasto, dla którego chcesz wygenerować dokument KW.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Select
                onValueChange={(cityId) => {
                  handleGenerateCashPayouts(cityId);
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
            // Payment method filter
            if (paymentMethodFilter !== 'all') {
              if (paymentMethodFilter === 'cash') {
                if (s.payment_method === 'transfer') return false;
              } else if (paymentMethodFilter === 'transfer') {
                if (s.payment_method !== 'transfer') return false;
              }
            }
            return true;
           }).sort((a, b) => {
            if (!sortColumn) return a.driver_name.localeCompare(b.driver_name, 'pl');
            const dir = sortDirection === 'asc' ? 1 : -1;
            switch (sortColumn) {
              case 'driver_name':
                return dir * a.driver_name.localeCompare(b.driver_name, 'pl');
              case 'payout':
                return dir * (getEffectiveSettlement(a).final_payout - getEffectiveSettlement(b).final_payout);
              case 'debt': {
                const debtA = Math.max(0, a.debt_previous ?? 0);
                const debtB = Math.max(0, b.debt_previous ?? 0);
                return dir * (debtA - debtB);
              }
              case 'wyplata_1':
                return dir * (getWyplata1(a) - getWyplata1(b));
              case 'rental': {
                const rentalA = getEffectiveSettlement(a).rental || 0;
                const rentalB = getEffectiveSettlement(b).rental || 0;
                return dir * (rentalA - rentalB);
              }
              case 'debt_rental': {
                const rdA = getRentalDebt(a);
                const rdB = getRentalDebt(b);
                return dir * (rdA - rdB);
              }
              case 'do_wyplaty':
                return dir * (getDoWyplaty(a) - getDoWyplaty(b));
              default:
                return a.driver_name.localeCompare(b.driver_name, 'pl');
            }
          });

          return (
            <>
              {/* Mobile View - Collapsible per driver */}
              <div className="md:hidden space-y-2">
                {filteredSettlements.map((settlement) => {
                   // Check platform activity (driver worked if base != 0 OR had cash rides)
                   const hasUberActivity = settlement.uber_base !== 0 || settlement.uber_cash !== 0;
                   const hasBoltActivity = settlement.bolt_base !== 0 || settlement.bolt_cash !== 0;
                   const hasFreenowActivity = settlement.freenow_base !== 0 || settlement.freenow_cash !== 0;
                  
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
                          {(settlement.debt_previous || 0) > 0 && (
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Dług:</span>
                              <span>{formatCurrency(settlement.debt_previous || 0)}</span>
                            </div>
                          )}
                          <div className={`flex justify-between text-sm font-bold ${getDoWyplaty(settlement) > 0 ? 'text-green-700' : getDoWyplaty(settlement) < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                            <span>Do wypłaty:</span>
                            <span>{formatCurrency(getDoWyplaty(settlement))}</span>
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
                    <span className={getAmountColor(filteredSettlements.reduce((sum, s) => sum + getEffectiveSettlement(s).final_payout, 0))}>
                      {formatCurrency(filteredSettlements.reduce((sum, s) => sum + getEffectiveSettlement(s).final_payout, 0))}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Desktop View - Full table */}
              <div className="hidden md:block overflow-x-auto overflow-y-auto pb-4 scrollbar-visible [&_th]:text-sm [&_td]:text-sm" style={{ maxHeight: '80vh' }}>
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                    {/* Section labels row */}
                    <TableRow className="border-b-0">
                      {/* Span all columns up to Wypłata as "Rozliczenie kierowców" */}
                      {(() => {
                        // Count visible columns in the "driver settlement" section (up to and including Wypłata)
                        let driverCols = 1; // Kierowca always visible
                        if (isColVisible('uber')) driverCols++;
                        if (isColVisible('uber_cash')) driverCols++;
                        if (isColVisible('bolt')) driverCols++;
                        if (isColVisible('bolt_cash')) driverCols++;
                        if (isColVisible('bolt_commission')) driverCols++;
                        if (isColVisible('freenow')) driverCols++;
                        if (isColVisible('freenow_cash')) driverCols++;
                        if (isColVisible('freenow_commission')) driverCols++;
                        if (isColVisible('total_cash')) driverCols++;
                        if (isColVisible('total_commission')) driverCols++;
                        if (fleetSettlementModeState === 'dual_tax' && isColVisible('netto')) driverCols++;
                        if (fleetSettlementModeState === 'dual_tax' && isColVisible('bonusy')) driverCols++;
                        if (fleetSettlementModeState === 'dual_tax' && isColVisible('anulacje')) driverCols++;
                        if (fleetSettlementModeState === 'dual_tax' && isColVisible('rekompensaty')) driverCols++;
                        if (isColVisible('fuel')) driverCols++;
                        if (isColVisible('vat')) driverCols++;
                        if (isColVisible('vat_refund')) driverCols++;
                        // Active fees
                        const visibleFees = activeFees.filter(fee => {
                          const weekStart = currentWeek?.start ? new Date(currentWeek.start) : new Date();
                          if ((fee as any).valid_from && new Date((fee as any).valid_from) > weekStart) return false;
                          if ((fee as any).valid_to && new Date((fee as any).valid_to) < weekStart) return false;
                          if (fee.frequency === 'weekly') return true;
                          if (fee.frequency === 'monthly') return weekStart.getDate() >= 1 && weekStart.getDate() <= 7;
                          return false;
                        });
                        driverCols += visibleFees.length;
                        if (isColVisible('service_fee')) driverCols++;
                        if (isColVisible('payout')) driverCols++;
                        if (isColVisible('debt')) driverCols++;
                        if (isColVisible('wyplata_1')) driverCols++;

                        // Count visible columns in the "rental settlement" section
                        let rentalCols = 0;
                        if (isColVisible('rental')) rentalCols++;
                        if (isColVisible('debt_rental')) rentalCols++;
                        if (isColVisible('do_wyplaty')) rentalCols++;
                        if (isColVisible('paid')) rentalCols++;

                        return (
                          <>
                            <TableHead colSpan={driverCols} className="text-center py-1 text-xs font-semibold text-blue-700 bg-blue-50/50 border-b-0">
                              Rozliczenie kierowców
                            </TableHead>
                            {rentalCols > 0 && (
                              <TableHead colSpan={rentalCols} className="text-center py-1 text-xs font-semibold text-green-700 bg-green-50/50 border-l-2 border-primary/20 border-b-0">
                                Rozliczenie wynajmu
                              </TableHead>
                            )}
                          </>
                        );
                      })()}
                    </TableRow>
                    <TableRow>
                      <TableHead className="px-2 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('driver_name')}>
                        <span className="inline-flex items-center">Kierowca{getSortIcon('driver_name')}</span>
                      </TableHead>
                      {isColVisible('uber') && <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-gray-900 whitespace-nowrap">Uber</TableHead>}
                      {isColVisible('uber_cash') && <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-gray-900 whitespace-nowrap">Uber got.</TableHead>}
                      {isColVisible('bolt') && <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-green-600 whitespace-nowrap">Bolt</TableHead>}
                      {isColVisible('bolt_cash') && <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-green-600 whitespace-nowrap">Bolt got.</TableHead>}
                      {isColVisible('bolt_commission') && <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-green-600 whitespace-nowrap">Bolt prow.</TableHead>}
                      {isColVisible('freenow') && <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-red-600 whitespace-nowrap">FreeNow</TableHead>}
                      {isColVisible('freenow_cash') && <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-red-600 whitespace-nowrap">FN got.</TableHead>}
                      {isColVisible('freenow_commission') && <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-red-600 whitespace-nowrap">FN prow.</TableHead>}
                      {isColVisible('brutto') && <TableHead className="text-right px-2 py-1.5 text-xs font-bold whitespace-nowrap bg-blue-50 cursor-pointer select-none hover:bg-blue-100" onClick={() => handleSort('brutto')}>
                        <span className="inline-flex items-center justify-end w-full">Brutto{getSortIcon('brutto')}</span>
                      </TableHead>}
                      {isColVisible('total_cash') && <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-red-600 whitespace-nowrap">Razem got.</TableHead>}
                      {isColVisible('total_commission') && <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-orange-600 whitespace-nowrap">Razem prow.</TableHead>}
                      {fleetSettlementModeState === 'dual_tax' && isColVisible('netto') && (
                        <TableHead className="text-right px-2 py-1.5 text-xs font-bold whitespace-nowrap">Netto</TableHead>
                      )}
                      {fleetSettlementModeState === 'dual_tax' && isColVisible('bonusy') && (
                        <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-purple-600 whitespace-nowrap">Bonusy ({fleetSecondaryVatRateState}%)</TableHead>
                      )}
                      {fleetSettlementModeState === 'dual_tax' && isColVisible('anulacje') && (
                        <TableHead className="text-right px-2 py-1.5 text-xs font-medium whitespace-nowrap">Anulacja ({fleetSecondaryVatRateState}%)</TableHead>
                      )}
                      {fleetSettlementModeState === 'dual_tax' && isColVisible('rekompensaty') && (
                        <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-purple-600 whitespace-nowrap">Rekomp.</TableHead>
                      )}
                      {isColVisible('fuel') && (
                        <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-red-600 whitespace-nowrap">Paliwo</TableHead>
                      )}
                      {isColVisible('vat') && (
                        <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-purple-600 whitespace-nowrap">VAT {fleetVatRateState}%</TableHead>
                      )}
                      {isColVisible('vat_refund') && <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-green-600 whitespace-nowrap">VAT zwrot</TableHead>}
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
                      {isColVisible('service_fee') && <TableHead className="text-right px-2 py-1.5 text-xs font-medium whitespace-nowrap">Opłata</TableHead>}
                      {isColVisible('payout') && <TableHead className="text-right px-2 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('payout')}>
                        <span className="inline-flex items-center justify-end w-full">Rozliczenie{getSortIcon('payout')}</span>
                      </TableHead>}
                      {isColVisible('debt') && <TableHead className="text-center px-2 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('debt')}>
                        <span className="inline-flex items-center justify-center">Dług{getSortIcon('debt')}</span>
                      </TableHead>}
                      {isColVisible('wyplata_1') && <TableHead className="text-right px-2 py-1.5 text-xs font-bold whitespace-nowrap text-blue-700 cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('wyplata_1')}>
                        <span className="inline-flex items-center justify-end w-full">Wypłata{getSortIcon('wyplata_1')}</span>
                      </TableHead>}
                      {isColVisible('rental') && <TableHead className="text-right px-2 py-1.5 text-xs font-medium whitespace-nowrap border-l-2 border-primary/20 cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('rental')}>
                        <span className="inline-flex items-center justify-end w-full">Wynajem{getSortIcon('rental')}</span>
                      </TableHead>}
                      {isColVisible('debt_rental') && <TableHead className="text-center px-2 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('debt_rental')}>
                        <span className="inline-flex items-center justify-center">Dług wynajmu{getSortIcon('debt_rental')}</span>
                      </TableHead>}
                      {isColVisible('do_wyplaty') && <TableHead className="text-right px-2 py-1.5 text-xs font-bold whitespace-nowrap text-green-700 cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('do_wyplaty')}>
                        <span className="inline-flex items-center justify-end w-full">Wypłata fin.{getSortIcon('do_wyplaty')}</span>
                      </TableHead>}
                      {isColVisible('paid') && <TableHead className="text-center px-2 py-1.5 text-xs font-medium whitespace-nowrap">Opłacony</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSettlements.map((rawSettlement) => {
                      const settlement = getEffectiveSettlement(rawSettlement);
                      // Check platform activity (driver worked if base != 0 OR had cash rides)
                      const hasUberActivity = settlement.uber_base !== 0 || settlement.uber_cash !== 0;
                      const hasBoltActivity = settlement.bolt_base !== 0 || settlement.bolt_cash !== 0;
                      const hasFreenowActivity = settlement.freenow_base !== 0 || settlement.freenow_cash !== 0;
                      const hasAnyActivity = hasUberActivity || hasBoltActivity || hasFreenowActivity;
                      
                      return (
                      <TableRow key={settlement.driver_id} className="hover:bg-primary/10 transition-colors cursor-pointer">
                        <TableCell className="font-medium px-2 py-1.5 text-xs whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            {settlement.driver_name}
                            <DriverInfoPopover
                              driverId={settlement.driver_id}
                              driverName={settlement.driver_name}
                              fleetId={fleetId}
                              onComplete={() => fetchSettlements()}
                            >
                              <button
                                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground hover:bg-primary/80 transition-colors shadow-sm"
                                title="Informacje o kierowcy"
                                onClick={(e) => e.stopPropagation()}
                              >
                                i
                              </button>
                            </DriverInfoPopover>
                            <button
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors border border-transparent hover:border-border"
                              title="Dodaj opłatę lub wpłatę dla tego kierowcy"
                              onClick={() => {
                                setChargeDriver({ id: settlement.driver_id, name: settlement.driver_name });
                                setChargeModalOpen(true);
                              }}
                            >
                              <Plus className="h-3 w-3" />
                              <span>opłata</span>
                            </button>
                          </span>
                        </TableCell>
                        {isColVisible('uber') && <TableCell className="text-right px-2 py-1.5 text-xs text-gray-900 tabular-nums whitespace-nowrap">
                          {hasUberActivity ? formatCurrency(settlement.uber_base) : '-'}
                        </TableCell>}
                        {isColVisible('uber_cash') && <TableCell className="text-right px-2 py-1.5 text-xs text-gray-900 tabular-nums whitespace-nowrap">
                          {displayValue(settlement.uber_cash, hasUberActivity, true)}
                        </TableCell>}
                        {isColVisible('bolt') && <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                          {hasBoltActivity ? formatCurrency(settlement.bolt_base) : '-'}
                        </TableCell>}
                        {isColVisible('bolt_cash') && <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                          {displayValue(settlement.bolt_cash, hasBoltActivity, true)}
                        </TableCell>}
                        {isColVisible('bolt_commission') && <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                          {displayValue(settlement.bolt_commission, hasBoltActivity, true)}
                        </TableCell>}
                        {isColVisible('freenow') && <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                          {hasFreenowActivity ? formatCurrency(settlement.freenow_base) : '-'}
                        </TableCell>}
                        {isColVisible('freenow_cash') && <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                          {displayValue(settlement.freenow_cash, hasFreenowActivity, true)}
                        </TableCell>}
                        {isColVisible('freenow_commission') && <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                          {displayValue(settlement.freenow_commission, hasFreenowActivity, true)}
                        </TableCell>}
                        {isColVisible('brutto') && <TableCell className="text-right px-2 py-1.5 text-xs font-bold tabular-nums whitespace-nowrap bg-blue-50">
                          {hasAnyActivity ? formatCurrency(settlement.total_base) : '-'}
                        </TableCell>}
                        {isColVisible('total_cash') && <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 font-semibold tabular-nums whitespace-nowrap">
                          {displayValue(settlement.total_cash, hasAnyActivity, true)}
                        </TableCell>}
                        {isColVisible('total_commission') && <TableCell className="text-right px-2 py-1.5 text-xs text-orange-600 font-semibold tabular-nums whitespace-nowrap">
                          {displayValue(settlement.total_commission, hasAnyActivity, true)}
                        </TableCell>}
                        {/* Dual tax extra columns */}
                        {fleetSettlementModeState === 'dual_tax' && isColVisible('netto') && (
                          <TableCell className="text-right px-2 py-1.5 text-xs font-bold tabular-nums whitespace-nowrap">
                            {hasAnyActivity ? formatCurrency(settlement.netto || 0) : '-'}
                          </TableCell>
                        )}
                        {fleetSettlementModeState === 'dual_tax' && isColVisible('bonusy') && (
                          <TableCell className="text-right px-2 py-1.5 text-xs text-purple-600 tabular-nums whitespace-nowrap">
                            {(settlement.bolt_bonusy || 0) > 0 ? formatCurrency(settlement.bolt_bonusy || 0) : (hasAnyActivity ? '0,00' : '-')}
                          </TableCell>
                        )}
                        {fleetSettlementModeState === 'dual_tax' && isColVisible('anulacje') && (
                          <TableCell className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                            {(settlement.bolt_anulacje || 0) !== 0 ? formatCurrency(Math.abs(settlement.bolt_anulacje || 0)) : (hasAnyActivity ? '0,00' : '-')}
                          </TableCell>
                        )}
                        {fleetSettlementModeState === 'dual_tax' && isColVisible('rekompensaty') && (
                          <TableCell className="text-right px-2 py-1.5 text-xs text-purple-600 tabular-nums whitespace-nowrap">
                            {(settlement.bolt_rekompensaty || 0) > 0 ? formatCurrency(settlement.bolt_rekompensaty || 0) : (hasAnyActivity ? '0,00' : '-')}
                          </TableCell>
                        )}
                        {isColVisible('fuel') && (
                          <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                            {displayValue(settlement.fuel, hasAnyActivity, true)}
                          </TableCell>
                        )}
                        {isColVisible('vat') && (
                          <TableCell className="text-right px-2 py-1.5 text-xs text-purple-600 tabular-nums whitespace-nowrap">
                            {displayValue(settlement.vat_amount, hasAnyActivity, true)}
                          </TableCell>
                        )}
                        {isColVisible('vat_refund') && <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                          {settlement.fuel_vat_refund > 0 ? `+${formatCurrency(settlement.fuel_vat_refund)}` : (hasAnyActivity ? '0,00' : '-')}
                        </TableCell>}
                        {/* Editable: additional fees (składka ZUS etc.) - always match header count */}
                        {activeFees.filter(fee => {
                          const weekStart = currentWeek?.start ? new Date(currentWeek.start) : new Date();
                          if ((fee as any).valid_from && new Date((fee as any).valid_from) > weekStart) return false;
                          if ((fee as any).valid_to && new Date((fee as any).valid_to) < weekStart) return false;
                          if (fee.frequency === 'weekly') return true;
                          if (fee.frequency === 'monthly') {
                            return weekStart.getDate() >= 1 && weekStart.getDate() <= 7;
                          }
                          return false;
                        }).map((fee, idx) => {
                          const feeAmount = settlement.additional_fees[idx]?.amount ?? 0;
                          return (
                            <TableCell key={fee.id} className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                              {renderEditableCell(settlement.driver_id, 'additional_fee', feeAmount, hasAnyActivity, idx)}
                            </TableCell>
                          );
                        })}
                        {/* Editable: Opłata */}
                        {isColVisible('service_fee') && <TableCell className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                          {renderEditableCell(settlement.driver_id, 'service_fee', settlement.service_fee, hasAnyActivity)}
                        </TableCell>}
                        {/* Rozliczenie (WITHOUT rental) */}
                        {isColVisible('payout') && (() => {
                          const payoutNoRental = calculatePayoutWithoutRental(settlement);
                          return (
                            <TableCell className={`text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap ${getAmountColor(payoutNoRental)}`}>
                              {formatCurrency(payoutNoRental)}
                            </TableCell>
                          );
                        })()}
                        {/* Dług - only settlement debt (NOT rental debt) */}
                        {isColVisible('debt') && <TableCell className="text-center px-2 py-1.5 text-xs whitespace-nowrap">
                          {(() => {
                            // Show only settlement debt (debt_previous), NOT rental debt
                            const debt = round2(Math.max(0, settlement.debt_previous ?? 0));
                            const badgeClick = (e: React.MouseEvent) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const settlementDebtBefore = round2(Math.max(0, settlement.debt_previous ?? 0));
                              const rentalDebtBefore = round2(Math.max(0, settlement.rental_debt_previous ?? 0));
                              const totalDebtBefore = round2(settlementDebtBefore + rentalDebtBefore);
                              const debtAfter = round2(Math.max(0, settlement.debt_current ?? 0));
                              setSelectedDriverForDebt({
                                id: settlement.driver_id,
                                name: settlement.driver_name,
                                settlementDebtBefore,
                                rentalDebtBefore,
                                totalDebtBefore,
                                debtAfter,
                                periodFrom: settlement.period_from,
                                periodTo: settlement.period_to,
                                initialTab: 'settlement',
                              });
                              setDebtDialogOpen(true);
                            };
                            if (debt <= 0) {
                              return (
                                <Badge 
                                  variant="outline" 
                                  className="bg-green-500/10 text-green-700 border-green-500/20 text-[10px] cursor-pointer"
                                  onClick={badgeClick}
                                >
                                  ✓ 0
                                </Badge>
                              );
                            }
                            return (
                              <Badge 
                                variant="destructive" 
                                className="cursor-pointer text-[10px]"
                                onClick={badgeClick}
                              >
                                {formatCurrency(debt)} zł
                              </Badge>
                            );
                          })()}
                        </TableCell>}
                        {/* Wypłata 1 (after settlement debt, before rental) */}
                        {isColVisible('wyplata_1') && (() => {
                          const w1 = getWyplata1(rawSettlement);
                          return (
                            <TableCell className={`text-right font-bold px-2 py-1.5 text-xs tabular-nums whitespace-nowrap ${w1 > 0 ? 'text-blue-700' : w1 < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                              {formatCurrency(w1)}
                            </TableCell>
                          );
                        })()}
                        {/* === PART 2: WYNAJEM === */}
                        {/* Editable: Wynajem */}
                        {isColVisible('rental') && <TableCell className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap border-l-2 border-primary/20">
                          {renderEditableCell(settlement.driver_id, 'rental', settlement.rental || 0, hasAnyActivity)}
                        </TableCell>}
                        {/* Dług wynajmu - clickable to view debt history */}
                        {isColVisible('debt_rental') && (() => {
                          const rentalDebt = getRentalDebt(rawSettlement);
                          const rentalDebtBadgeClick = (e: React.MouseEvent) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const settlementDebtBefore = round2(Math.max(0, settlement.debt_previous ?? 0));
                            const rentalDebtBefore = round2(Math.max(0, settlement.rental_debt_previous ?? 0));
                            const totalDebtBefore = round2(settlementDebtBefore + rentalDebtBefore);
                            const debtAfter = round2(Math.max(0, settlement.debt_current ?? 0));
                            setSelectedDriverForDebt({
                              id: settlement.driver_id,
                              name: settlement.driver_name,
                              settlementDebtBefore,
                              rentalDebtBefore,
                              totalDebtBefore,
                              debtAfter,
                              periodFrom: settlement.period_from,
                              periodTo: settlement.period_to,
                              initialTab: 'rental',
                            });
                            setDebtDialogOpen(true);
                          };
                          return (
                            <TableCell className="text-center px-2 py-1.5 text-xs whitespace-nowrap">
                              {rentalDebt > 0 ? (
                                <Badge variant="destructive" className="text-[10px] cursor-pointer" onClick={rentalDebtBadgeClick}>
                                  {formatCurrency(rentalDebt)} zł
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20 text-[10px] cursor-pointer" onClick={rentalDebtBadgeClick}>
                                  ✓ 0
                                </Badge>
                              )}
                            </TableCell>
                          );
                        })()}
                        {/* Wypłata finalna (after rental and all debts) */}
                        {isColVisible('do_wyplaty') && (() => {
                          const doWyplaty = getDoWyplaty(rawSettlement);
                          return (
                            <TableCell className={`text-right font-bold px-2 py-1.5 text-xs tabular-nums whitespace-nowrap ${doWyplaty > 0 ? 'text-green-700' : doWyplaty < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                              {formatCurrency(doWyplaty)}
                            </TableCell>
                          );
                        })()}
                        {/* Opłacony - toggle */}
                        {isColVisible('paid') && <TableCell className="text-center px-2 py-1.5 text-xs whitespace-nowrap">
                          <button
                            onClick={(e) => { e.stopPropagation(); togglePaidStatus(settlement.driver_id); }}
                            className="p-1 rounded hover:bg-muted transition-colors"
                            title={paidDrivers.has(settlement.driver_id) ? "Oznacz jako nieopłacony" : "Oznacz jako opłacony"}
                          >
                            {paidDrivers.has(settlement.driver_id) ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <X className="h-4 w-4 text-red-500" />
                            )}
                          </button>
                        </TableCell>}
                      </TableRow>
                    )})}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell className="px-2 py-1.5 text-xs whitespace-nowrap">RAZEM ({filteredSettlements.length})</TableCell>
                      {isColVisible('uber') && <TableCell className="text-right px-2 py-1.5 text-xs text-gray-900 tabular-nums whitespace-nowrap">
                        {formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.uber_base, 0))}
                      </TableCell>}
                      {isColVisible('uber_cash') && <TableCell className="text-right px-2 py-1.5 text-xs text-gray-900 tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.uber_cash, 0))}
                      </TableCell>}
                      {isColVisible('bolt') && <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                        {formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.bolt_base, 0))}
                      </TableCell>}
                      {isColVisible('bolt_cash') && <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.bolt_cash, 0))}
                      </TableCell>}
                      {isColVisible('bolt_commission') && <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.bolt_commission, 0))}
                      </TableCell>}
                      {isColVisible('freenow') && <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                        {formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.freenow_base, 0))}
                      </TableCell>}
                      {isColVisible('freenow_cash') && <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.freenow_cash, 0))}
                      </TableCell>}
                      {isColVisible('freenow_commission') && <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.freenow_commission, 0))}
                      </TableCell>}
                      {isColVisible('brutto') && <TableCell className="text-right px-2 py-1.5 text-xs font-bold tabular-nums whitespace-nowrap bg-blue-50">
                        {formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.total_base, 0))}
                      </TableCell>}
                      {isColVisible('total_cash') && <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 font-semibold tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.total_cash, 0))}
                      </TableCell>}
                      {isColVisible('total_commission') && <TableCell className="text-right px-2 py-1.5 text-xs text-orange-600 font-semibold tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.total_commission, 0))}
                      </TableCell>}
                      {/* Dual tax extra footer columns */}
                      {fleetSettlementModeState === 'dual_tax' && isColVisible('netto') && (
                        <TableCell className="text-right px-2 py-1.5 text-xs font-bold tabular-nums whitespace-nowrap">
                          {formatCurrency(filteredSettlements.reduce((sum, s) => sum + (s.netto || 0), 0))}
                        </TableCell>
                      )}
                      {fleetSettlementModeState === 'dual_tax' && isColVisible('bonusy') && (
                        <TableCell className="text-right px-2 py-1.5 text-xs text-purple-600 tabular-nums whitespace-nowrap">
                          {formatCurrency(filteredSettlements.reduce((sum, s) => sum + (s.bolt_bonusy || 0), 0))}
                        </TableCell>
                      )}
                      {fleetSettlementModeState === 'dual_tax' && isColVisible('anulacje') && (
                        <TableCell className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                          {formatCurrency(filteredSettlements.reduce((sum, s) => sum + Math.abs(s.bolt_anulacje || 0), 0))}
                        </TableCell>
                      )}
                      {fleetSettlementModeState === 'dual_tax' && isColVisible('rekompensaty') && (
                        <TableCell className="text-right px-2 py-1.5 text-xs text-purple-600 tabular-nums whitespace-nowrap">
                          {formatCurrency(filteredSettlements.reduce((sum, s) => sum + (s.bolt_rekompensaty || 0), 0))}
                        </TableCell>
                      )}
                      {isColVisible('fuel') && (
                        <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                          -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.fuel, 0))}
                        </TableCell>
                      )}
                      {isColVisible('vat') && (
                        <TableCell className="text-right px-2 py-1.5 text-xs text-purple-600 tabular-nums whitespace-nowrap">
                          -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.vat_amount, 0))}
                        </TableCell>
                      )}
                      {isColVisible('vat_refund') && <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                        +{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.fuel_vat_refund, 0))}
                      </TableCell>}
                      {activeFees.filter(fee => {
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
                          -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + (getEffectiveSettlement(s).additional_fees[idx]?.amount || 0), 0))}
                        </TableCell>
                      ))}
                      {isColVisible('service_fee') && <TableCell className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + getEffectiveSettlement(s).service_fee, 0))}
                      </TableCell>}
                      {isColVisible('payout') && (() => {
                        const totalPayout = filteredSettlements.reduce((sum, s) => sum + calculatePayoutWithoutRental(getEffectiveSettlement(s)), 0);
                        return (
                          <TableCell className={`text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap ${getAmountColor(totalPayout)}`}>
                            {formatCurrency(totalPayout)}
                          </TableCell>
                        );
                      })()}
                      {isColVisible('debt') && <TableCell className="text-center px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                        {(() => {
                          const totalDebt = filteredSettlements.reduce((sum, s) => sum + (s.debt_previous || 0), 0);
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
                      </TableCell>}
                      {isColVisible('wyplata_1') && (() => {
                        const totalW1 = filteredSettlements.reduce((sum, s) => sum + getWyplata1(s), 0);
                        return (
                          <TableCell className={`text-right font-bold px-2 py-1.5 text-xs tabular-nums whitespace-nowrap ${totalW1 > 0 ? 'text-blue-700' : totalW1 < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {formatCurrency(totalW1)}
                          </TableCell>
                        );
                      })()}
                      {isColVisible('rental') && <TableCell className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap border-l-2 border-primary/20">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + (getEffectiveSettlement(s).rental || 0), 0))}
                      </TableCell>}
                      {isColVisible('debt_rental') && (() => {
                        const totalRentalDebt = filteredSettlements.reduce((sum, s) => sum + getRentalDebt(s), 0);
                        return (
                          <TableCell className="text-center px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                            {totalRentalDebt > 0 ? (
                              <Badge variant="destructive" className="text-[10px]">
                                {formatCurrency(totalRentalDebt)} zł
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20 text-[10px]">
                                ✓ 0
                              </Badge>
                            )}
                          </TableCell>
                        );
                      })()}
                      {isColVisible('do_wyplaty') && (() => {
                        const totalDoWyplaty = filteredSettlements.reduce((sum, s) => sum + getDoWyplaty(s), 0);
                        return (
                          <TableCell className={`text-right font-bold px-2 py-1.5 text-xs tabular-nums whitespace-nowrap ${totalDoWyplaty > 0 ? 'text-green-700' : 'text-muted-foreground'}`}>
                            {formatCurrency(totalDoWyplaty)}
                          </TableCell>
                        );
                      })()}
                      {isColVisible('paid') && <TableCell />}
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
            <DriverDebtHistory 
              driverId={selectedDriverForDebt.id}
              initialTab={selectedDriverForDebt.initialTab}
              weekDebtContext={{
                settlementDebtBefore: selectedDriverForDebt.settlementDebtBefore,
                rentalDebtBefore: selectedDriverForDebt.rentalDebtBefore,
                totalDebtBefore: selectedDriverForDebt.totalDebtBefore,
                debtAfter: selectedDriverForDebt.debtAfter,
                periodFrom: selectedDriverForDebt.periodFrom,
                periodTo: selectedDriverForDebt.periodTo,
              }}
              onDebtChanged={async () => {
                await fetchSettlements({ skipDebtSync: true, silent: true });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Add Charge/Bonus Modal */}
      {chargeDriver && (
        <AddDriverChargeModal
          open={chargeModalOpen}
          onOpenChange={setChargeModalOpen}
          driverId={chargeDriver.id}
          driverName={chargeDriver.name}
          periodFrom={currentWeek?.start}
          periodTo={currentWeek?.end}
          onComplete={() => {
            fetchSettlements();
          }}
        />
      )}

      {/* Driver Info is now inline Popover - no separate modal needed */}
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
