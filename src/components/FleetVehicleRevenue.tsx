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
import { CalendarIcon, X, Calendar } from 'lucide-react';
import { AssignDriverModal } from './AssignDriverModal';

interface VehicleRevenue {
  driver_id: string | null;
  driver_name: string;
  vehicle_id: string;
  vehicle_plate: string;
  vehicle_brand: string;
  vehicle_model: string;
  assigned_date: string;
  rental_fee: number;
  debt_balance: number;
}

interface FleetVehicleRevenueProps {
  fleetId: string;
  mode?: 'admin' | 'fleet';
}

export function FleetVehicleRevenue({ fleetId, mode = 'fleet' }: FleetVehicleRevenueProps) {
  const [revenues, setRevenues] = useState<VehicleRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');

  // Generate week options for the selected year
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

      weeks.push({
        number: weekNumber,
        label: `${format(startDate, 'd MMM', { locale: pl })} - ${format(endDate, 'd MMM', { locale: pl })} pon.-ndz.`,
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

  useEffect(() => {
    fetchRevenues();
  }, [fleetId, selectedYear, selectedWeek]);

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

      // Fetch active assignments for these vehicles
      const vehicleIds = vehicles.map(v => v.id);
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
        .eq('status', 'active');

      // Map assignments by vehicle_id
      const assignmentMap = new Map(assignments?.map(a => [a.vehicle_id, a]) || []);

      // Fetch debts for assigned drivers
      const assignedDriverIds = assignments?.map(a => a.driver_id).filter(Boolean) || [];
      let debts: Array<{ driver_id: string; current_balance: number }> = [];
      
      if (assignedDriverIds.length > 0) {
        const { data } = await supabase
          .from('driver_debts')
          .select('driver_id, current_balance')
          .in('driver_id', assignedDriverIds);
        debts = data || [];
      }

      const debtMap = new Map<string, number>(debts.map(d => [d.driver_id, d.current_balance as number]));

      // Map vehicles to revenue data (including unassigned ones)
      const revenueData: VehicleRevenue[] = vehicles.map(vehicle => {
        const assignment = assignmentMap.get(vehicle.id);
        const driver = assignment?.drivers as any;

        return {
          driver_id: assignment?.driver_id || null,
          driver_name: driver ? `${driver.first_name} ${driver.last_name}` : '—',
          vehicle_id: vehicle.id,
          vehicle_plate: vehicle.plate,
          vehicle_brand: vehicle.brand,
          vehicle_model: vehicle.model,
          assigned_date: assignment?.assigned_at || '',
          rental_fee: parseFloat(vehicle.weekly_rental_fee?.toString() || '0'),
          debt_balance: assignment?.driver_id ? (debtMap.get(assignment.driver_id) || 0) : 0,
        };
      });

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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Przychody aut</CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Rok:</Label>
                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                  <SelectTrigger className="w-[120px]">
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
                <Select value={selectedWeek.toString()} onValueChange={(v) => setSelectedWeek(parseInt(v))}>
                  <SelectTrigger className="w-[280px]">
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
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Ładowanie danych...
          </div>
        ) : revenues.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Brak przypisanych pojazdów dla tej floty
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kierowca</TableHead>
                <TableHead>Pojazd</TableHead>
                <TableHead>Wynajem od</TableHead>
                <TableHead className="text-right">Wynajem</TableHead>
                <TableHead className="text-right">Zadłużenie</TableHead>
                <TableHead>Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenues.map((rev) => (
                <TableRow key={rev.vehicle_id}>
                  <TableCell className="font-medium">
                    {rev.driver_id ? (
                      <div className="flex items-center gap-2">
                        {rev.driver_name}
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAssignDriver(rev.vehicle_id)}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        Przypisz kierowcę
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {rev.vehicle_brand} {rev.vehicle_model}
                    <div className="text-xs text-muted-foreground">{rev.vehicle_plate}</div>
                  </TableCell>
                  <TableCell>
                    {rev.driver_id && rev.assigned_date && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {mode === 'admin' ? (
                          <input 
                            type="date" 
                            value={format(new Date(rev.assigned_date), 'yyyy-MM-dd')}
                            onChange={(e) => updateAssignedDate(rev.vehicle_id, e.target.value)}
                            className="border rounded px-2 py-1 text-sm"
                          />
                        ) : (
                          <span className="text-sm">
                            {formatPeriodDate(rev.assigned_date)}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${getRentalFeeColor(rev.rental_fee)}`}>
                    {rev.rental_fee.toFixed(2)} zł
                  </TableCell>
                  <TableCell className={`text-right font-mono ${getDebtColor(rev.debt_balance)}`}>
                    {rev.debt_balance === 0 ? '—' : `${rev.debt_balance.toFixed(2)} zł`}
                  </TableCell>
                  <TableCell>
                    {rev.driver_id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleUnassignDriver(rev.vehicle_id)}
                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        title="Odpisz kierowcę"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/50 font-bold">
                <TableCell colSpan={3} className="text-right">RAZEM:</TableCell>
                <TableCell className="text-right font-mono">
                  {revenues.reduce((sum, r) => sum + r.rental_fee, 0).toFixed(2)} zł
                </TableCell>
                <TableCell className="text-right font-mono">
                  {revenues.reduce((sum, r) => sum + (r.driver_id ? r.debt_balance : 0), 0).toFixed(2)} zł
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
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
