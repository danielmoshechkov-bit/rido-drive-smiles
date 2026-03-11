import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { pl } from 'date-fns/locale';
import { toast } from 'sonner';
import { CalendarIcon, X, Calendar, Info } from 'lucide-react';
import { AssignDriverModal } from './AssignDriverModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getAvailableWeeks, getCurrentWeekNumber } from '@/lib/utils';

interface VehicleRevenue {
  driver_id: string | null;
  driver_name: string;
  vehicle_id: string;
  vehicle_plate: string;
  vehicle_brand: string;
  vehicle_model: string;
  assigned_date: string;
  weekly_rate: number;
  rental_fee: number;
  paid_amount: number;
  debt_balance: number;
  previous_debt: number;
  total_debt: number;
}

interface FleetVehicleRevenueProps {
  fleetId: string;
  mode?: 'admin' | 'fleet';
}

export function FleetVehicleRevenue({ fleetId, mode = 'fleet' }: FleetVehicleRevenueProps) {
  const [revenues, setRevenues] = useState<VehicleRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<number>(getCurrentWeekNumber(new Date().getFullYear()));
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Format currency in Polish style
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount) + ' zł';
  };

  // Generate week options for the selected year
  const weeks = getAvailableWeeks(selectedYear);
  const currentWeek = weeks.find(w => w.number === selectedWeek);

  // Fetch latest assignment week on mount
  useEffect(() => {
    // Week already set by getCurrentWeekNumber, fetch data when ready
    if (fleetId && selectedWeek !== null) {
      fetchRevenues();
    }
  }, [fleetId]);

  useEffect(() => {
    if (selectedWeek !== null) {
      fetchRevenues();
    }
  }, [fleetId, selectedYear, selectedWeek]);

  // Calculate proportional rental fee based on actual days used in the week
  const calculateProportionalRent = (
    assignedAt: string, 
    weekStart: string, 
    weekEnd: string,
    weeklyFee: number
  ): number => {
    const assignDate = new Date(assignedAt);
    const startDate = new Date(weekStart);
    const endDate = new Date(weekEnd);
    
    // Start counting from the day AFTER assignment (assignment day doesn't count)
    const startCounting = new Date(assignDate);
    startCounting.setDate(startCounting.getDate() + 1);
    
    // If start counting is after week end, no rental for this week
    if (startCounting > endDate) return 0;
    
    // If start counting is before week start, count from week start (full week)
    const effectiveStart = startCounting < startDate ? startDate : startCounting;
    
    // Calculate number of days from effectiveStart to weekEnd (inclusive)
    const days = Math.ceil((endDate.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    // Daily rate and proportional rental
    const dailyRate = weeklyFee / 7;
    return dailyRate * Math.min(days, 7);
  };

  const fetchRevenues = async () => {
    setLoading(true);
    try {
      // Fetch ALL vehicles for this fleet (not just assigned ones)
      const { data: vehicles, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('id, brand, model, plate, weekly_rental_fee')
        .eq('fleet_id', fleetId)
        .eq('status', 'aktywne');

      if (vehiclesError) throw vehiclesError;

      if (!vehicles || vehicles.length === 0) {
        setRevenues([]);
        setLoading(false);
        return;
      }

      // Fetch assignments active during selected week
      const vehicleIds = vehicles.map(v => v.id);
      
      if (!currentWeek) {
        setRevenues([]);
        setLoading(false);
        return;
      }

      const weekStart = currentWeek.start;
      const weekEnd = currentWeek.end;

      const { data: assignments } = await supabase
        .from('driver_vehicle_assignments')
        .select(`
          driver_id,
          vehicle_id,
          assigned_at,
          drivers(
            id,
            first_name,
            last_name
          )
        `)
        .in('vehicle_id', vehicleIds)
        .lte('assigned_at', weekEnd)
        .or(`unassigned_at.is.null,unassigned_at.gte.${weekStart}`);

      // Map assignments by vehicle_id
      const assignmentMap = new Map(assignments?.map(a => [a.vehicle_id, a]) || []);

      // Fetch debts for assigned drivers
      const assignedDriverIds = assignments?.map(a => a.driver_id).filter(Boolean) || [];

      // Fetch actual earnings from settlements for this week
      let driverSettlements: Array<{ driver_id: string; amounts: any; rental_fee: number; debt_before: number; debt_after: number }> = [];

      console.log('🚗 VehicleRevenue: assignedDriverIds=', assignedDriverIds.length, 'weekStart=', weekStart, 'weekEnd=', weekEnd);
      if (assignedDriverIds.length > 0) {
        const { data: paymentsData, error: paymentsError } = await supabase
          .from('settlements')
          .select('driver_id, amounts, rental_fee, debt_before, debt_after, period_from, period_to, net_amount')
          .in('driver_id', assignedDriverIds)
          .gte('period_from', weekStart)
          .lte('period_to', weekEnd);
        
        console.log('🚗 VehicleRevenue: settlements found=', paymentsData?.length, 'error=', paymentsError);
        if (paymentsData && paymentsData.length > 0) {
          console.log('🚗 VehicleRevenue: sample settlement=', JSON.stringify(paymentsData[0]));
        }
        driverSettlements = (paymentsData || []) as any;
      }

      // Calculate available-for-rental from amounts JSON (same logic as FleetSettlementsView)
      const driverAvailableMap = new Map<string, number>();
      const driverRentalFeeMap = new Map<string, number>();
      driverSettlements.forEach(s => {
        const a = s.amounts || {};
        const totalBase = (parseFloat(a.uber_base || 0)) + (parseFloat(a.bolt_projected_d || 0)) + (parseFloat(a.freenow_base_s || 0));
        const totalCommission = (parseFloat(a.uber_commission || 0)) + (parseFloat(a.bolt_commission || 0)) + (parseFloat(a.freenow_commission_t || 0));
        const totalCash = (parseFloat(a.uber_cash_f || 0)) + (parseFloat(a.bolt_cash || 0)) + (parseFloat(a.freenow_cash_f || 0));
        const vat8 = totalBase * 0.08;
        const serviceFee = parseFloat(a.service_fee?.toString() || '0');
        const fuel = parseFloat(a.fuel || 0);
        const fuelVatRefund = parseFloat(a.fuel_vat_refund || 0);
        
        const available = totalBase - totalCommission - vat8 - serviceFee - totalCash - fuel + fuelVatRefund;
        driverAvailableMap.set(s.driver_id, (driverAvailableMap.get(s.driver_id) || 0) + available);
        
        // Use actual rental_fee from settlement record (already correctly calculated)
        const settlementRental = parseFloat(s.rental_fee?.toString() || '0');
        driverRentalFeeMap.set(s.driver_id, (driverRentalFeeMap.get(s.driver_id) || 0) + settlementRental);
      });

      // Map driver_id → debt_after from settlement (historical debt for this specific week)
      const driverDebtAfterMap = new Map<string, number>();
      driverSettlements.forEach(s => {
        const debtAfter = parseFloat(s.debt_after?.toString() || '0');
        const existing = driverDebtAfterMap.get(s.driver_id) || 0;
        driverDebtAfterMap.set(s.driver_id, Math.max(existing, debtAfter));
      });

      // Map vehicles to revenue data and filter only those with assigned drivers
      const revenueData: VehicleRevenue[] = vehicles
        .map(vehicle => {
          const assignment = assignmentMap.get(vehicle.id);
          const driver = assignment?.drivers as any;
          const weeklyFee = parseFloat(vehicle.weekly_rental_fee?.toString() || '0');
          const proportionalRent = assignment?.assigned_at 
            ? calculateProportionalRent(assignment.assigned_at, weekStart, weekEnd, weeklyFee)
            : 0;
          const driverAvailable = assignment?.driver_id 
            ? (driverAvailableMap.get(assignment.driver_id) || 0) 
            : 0;
          
          const hasSettlement = assignment?.driver_id 
            ? driverSettlements.some(s => s.driver_id === assignment.driver_id) 
            : false;

          // Use rental_fee from settlement if available (already correct),
          // otherwise fall back to proportional calculation
          const settlementRental = assignment?.driver_id 
            ? (driverRentalFeeMap.get(assignment.driver_id) || 0) 
            : 0;
          const effectiveRent = hasSettlement 
            ? (settlementRental > 0 ? settlementRental : proportionalRent)
            : 0;
          
          // Calculate how much of rental was paid from available earnings
          // Priority: first fees/taxes are deducted (already done in driverAvailable),
          // then whatever is left goes toward rental
          const paidAmount = Math.min(Math.max(driverAvailable, 0), effectiveRent);
          const currentWeekDebt = Math.max(effectiveRent - paidAmount, 0);
          
          // Use debt_after from settlement record (historical, accurate for this week)
          const debtAfterFromSettlement = assignment?.driver_id 
            ? (driverDebtAfterMap.get(assignment.driver_id) || 0) 
            : 0;
          
          const previousDebt = Math.max(debtAfterFromSettlement - currentWeekDebt, 0);
          const totalDebt = Math.max(debtAfterFromSettlement, currentWeekDebt);

          return {
            driver_id: assignment?.driver_id || null,
            driver_name: driver ? `${driver.first_name} ${driver.last_name}` : '—',
            vehicle_id: vehicle.id,
            vehicle_plate: vehicle.plate,
            vehicle_brand: vehicle.brand,
            vehicle_model: vehicle.model,
            assigned_date: assignment?.assigned_at || '',
            weekly_rate: weeklyFee,
            rental_fee: effectiveRent,
            paid_amount: paidAmount,
            debt_balance: currentWeekDebt,
            previous_debt: previousDebt,
            total_debt: totalDebt,
          };
        })
        .filter(revenue => revenue.driver_id !== null);

      setRevenues(revenueData);
    } catch (error: any) {
      console.error('Error fetching vehicle revenues:', error);
      toast.error('Błąd ładowania przychodów: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateAssignedDate = async (vehicleId: string, newDate: string) => {
    try {
      const { error } = await supabase
        .from('driver_vehicle_assignments')
        .update({ assigned_at: newDate })
        .eq('vehicle_id', vehicleId)
        .eq('status', 'active');

      if (error) throw error;

      toast.success('Data wynajmu została zaktualizowana');
      fetchRevenues();
    } catch (error: any) {
      toast.error('Błąd aktualizacji daty: ' + error.message);
    }
  };

  const handleUnassignDriver = async (vehicleId: string) => {
    if (!confirm('Czy na pewno chcesz odpisać kierowcę od tego pojazdu? Przypisanie zostanie zapisane w historii.')) return;

    try {
      const { error } = await supabase
        .from('driver_vehicle_assignments')
        .update({ 
          status: 'inactive',
          unassigned_at: new Date().toISOString()
        })
        .eq('vehicle_id', vehicleId)
        .eq('status', 'active');

      if (error) throw error;

      toast.success('Kierowca został odpisany od pojazdu');
      fetchRevenues();
    } catch (error: any) {
      toast.error('Błąd podczas odpisywania kierowcy: ' + error.message);
    }
  };

  const handleAssignDriver = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    setShowAssignModal(true);
  };

  const getRentalFeeColor = (rentalFee: number) => {
    if (rentalFee >= 600) return 'text-green-600 font-bold';
    if (rentalFee > 0) return 'text-yellow-600 font-bold';
    return 'text-red-600 font-bold';
  };

  const getDebtColor = (debt: number) => {
    if (debt > 0) return 'text-red-600 font-bold';
    if (debt < 0) return 'text-green-600 font-bold';
    return 'text-muted-foreground';
  };

  const getPaidAmountColor = (paidAmount: number, rentalFee: number) => {
    if (paidAmount === 0) return 'text-muted-foreground';
    if (paidAmount >= rentalFee) return 'text-green-600 font-bold';
    return 'text-orange-600 font-bold';
  };

  const formatPeriodDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return format(date, 'dd MMM yyyy', { locale: pl });
    } catch {
      return dateStr;
    }
  };

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Przychody aut</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">
                    Wynajem jest liczony proporcjonalnie. Dzień przypisania nie jest liczony.
                    Stawka dzienna = wynajem tygodniowy ÷ 7 dni.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          {/* Mobile layout */}
          <div className="flex flex-col gap-3 md:hidden">
            <div className="grid grid-cols-2 gap-2">
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
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Okres:</Label>
                <Select 
                  value={selectedWeek?.toString() || ''} 
                  onValueChange={(v) => setSelectedWeek(parseInt(v))}
                  disabled={selectedWeek === null}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Wybierz" />
                  </SelectTrigger>
                  <SelectContent>
                    {weeks.map(week => (
                      <SelectItem key={week.number} value={week.number.toString()}>
                        Tydzień {week.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Desktop layout */}
          <div className="hidden md:flex flex-row items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Rok:</Label>
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
              <Label className="text-sm whitespace-nowrap">Okres:</Label>
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
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Szukaj:</Label>
              <Input
                placeholder="Imię, nazwisko lub nr rej."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-[220px]"
              />
            </div>
          </div>
        </CardHeader>
      <CardContent className="p-0 md:p-6">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Ładowanie danych...
          </div>
        ) : revenues.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Brak przypisanych pojazdów dla tej floty
          </div>
        ) : (
          <div className="overflow-x-auto">
          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="p-1.5 text-xs whitespace-nowrap">Kierowca</TableHead>
                  <TableHead className="p-1.5 text-xs whitespace-nowrap">Pojazd</TableHead>
                  <TableHead className="p-1.5 text-xs whitespace-nowrap">Wynajem od</TableHead>
                  <TableHead className="text-right p-1.5 text-xs whitespace-nowrap">Stawka</TableHead>
                  <TableHead className="text-right p-1.5 text-xs whitespace-nowrap">Wynajem</TableHead>
                  <TableHead className="text-right p-1.5 text-xs whitespace-nowrap">Opłacone</TableHead>
                  <TableHead className="text-right p-1.5 text-xs whitespace-nowrap">Zadłużenie</TableHead>
                  <TableHead className="text-right p-1.5 text-xs whitespace-nowrap">Poprzednie</TableHead>
                  <TableHead className="text-right p-1.5 text-xs whitespace-nowrap">Łącznie</TableHead>
                  <TableHead className="p-1.5 text-xs whitespace-nowrap">Akcje</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {revenues
                .filter(rev => {
                  if (!searchQuery.trim()) return true;
                  const q = searchQuery.toLowerCase();
                  return rev.driver_name.toLowerCase().includes(q) || rev.vehicle_plate.toLowerCase().includes(q);
                })
                .map((rev) => (
                <TableRow key={rev.vehicle_id}>
                  <TableCell className="font-medium p-1.5 text-xs">
                    {rev.driver_id ? (
                      <div className="flex items-center gap-2">
                        {rev.driver_name}
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAssignDriver(rev.vehicle_id)}
                        className="text-blue-600 hover:text-blue-700 text-xs"
                      >
                        Przypisz kierowcę
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground p-1.5 text-xs">
                    {rev.vehicle_brand} {rev.vehicle_model}
                    <div className="text-[10px] text-muted-foreground">{rev.vehicle_plate}</div>
                  </TableCell>
                  <TableCell className="p-1.5 text-xs">
                    {rev.driver_id && rev.assigned_date && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {mode === 'admin' ? (
                          <input 
                            type="date" 
                            value={format(new Date(rev.assigned_date), 'yyyy-MM-dd')}
                            onChange={(e) => updateAssignedDate(rev.vehicle_id, e.target.value)}
                            className="border rounded px-2 py-1 text-xs"
                          />
                        ) : (
                          <span className="text-xs">
                            {formatPeriodDate(rev.assigned_date)}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground p-1.5 text-xs">
                    {formatCurrency(rev.weekly_rate)}
                  </TableCell>
                  <TableCell className={`text-right p-1.5 text-xs ${getRentalFeeColor(rev.rental_fee)}`}>
                    {formatCurrency(rev.rental_fee)}
                  </TableCell>
                  <TableCell className={`text-right p-1.5 text-xs ${getPaidAmountColor(rev.paid_amount, rev.rental_fee)}`}>
                    {formatCurrency(rev.paid_amount)}
                  </TableCell>
                  <TableCell className={`text-right p-1.5 text-xs ${getDebtColor(rev.debt_balance)}`}>
                    {rev.debt_balance === 0 ? '—' : formatCurrency(rev.debt_balance)}
                  </TableCell>
                  <TableCell className={`text-right p-1.5 text-xs ${getDebtColor(rev.previous_debt)}`}>
                    {rev.previous_debt === 0 ? '—' : formatCurrency(rev.previous_debt)}
                  </TableCell>
                  <TableCell className={`text-right p-1.5 text-xs ${getDebtColor(rev.total_debt)}`}>
                    {rev.total_debt === 0 ? '—' : formatCurrency(rev.total_debt)}
                  </TableCell>
                  <TableCell className="p-1.5 text-xs">
                    {rev.driver_id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleUnassignDriver(rev.vehicle_id)}
                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                        title="Odpisz kierowcę"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
              <TableFooter>
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={3} className="text-right p-1.5 text-xs">RAZEM:</TableCell>
                  <TableCell className="text-right p-1.5 text-xs">
                    {formatCurrency(revenues.reduce((sum, r) => sum + r.weekly_rate, 0))}
                  </TableCell>
                  <TableCell className="text-right p-1.5 text-xs">
                    {formatCurrency(revenues.reduce((sum, r) => sum + r.rental_fee, 0))}
                  </TableCell>
                  <TableCell className="text-right p-1.5 text-xs">
                    {formatCurrency(revenues.reduce((sum, r) => sum + r.paid_amount, 0))}
                  </TableCell>
                  <TableCell className="text-right p-1.5 text-xs">
                    {formatCurrency(revenues.reduce((sum, r) => sum + (r.driver_id ? r.debt_balance : 0), 0))}
                  </TableCell>
                  <TableCell className="text-right p-1.5 text-xs">
                    {formatCurrency(revenues.reduce((sum, r) => sum + (r.driver_id ? r.previous_debt : 0), 0))}
                  </TableCell>
                  <TableCell className="text-right p-1.5 text-xs">
                    {formatCurrency(revenues.reduce((sum, r) => sum + (r.driver_id ? r.total_debt : 0), 0))}
                  </TableCell>
                  <TableCell className="p-1.5 text-xs"></TableCell>
                </TableRow>
              </TableFooter>
          </Table>
          </div>
        )}
      </CardContent>
    </Card>

    <AssignDriverModal
      isOpen={showAssignModal}
      onClose={() => {
        setShowAssignModal(false);
        setSelectedVehicleId('');
      }}
      onAssigned={() => {
        setShowAssignModal(false);
        setSelectedVehicleId('');
        fetchRevenues();
      }}
      vehicleId={selectedVehicleId}
      fleetId={fleetId}
    />
    </>
  );
}
