import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { pl } from 'date-fns/locale';
import { toast } from 'sonner';
import { CalendarIcon } from 'lucide-react';

interface VehicleRevenue {
  driver_id: string;
  driver_name: string;
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
  const [selectedWeek, setSelectedWeek] = useState<string>('current');
  const [customPeriodFrom, setCustomPeriodFrom] = useState<string>('');
  const [customPeriodTo, setCustomPeriodTo] = useState<string>('');

  const getWeekDates = (weekOffset: number = 0) => {
    try {
      const today = new Date();
      const targetDate = subWeeks(today, weekOffset);
      const start = startOfWeek(targetDate, { weekStartsOn: 1 });
      const end = endOfWeek(targetDate, { weekStartsOn: 1 });
      
      // Validate dates before formatting
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Invalid date');
      }
      
      return {
        from: format(start, 'yyyy-MM-dd'),
        to: format(end, 'yyyy-MM-dd')
      };
    } catch (error) {
      console.error('Error calculating week dates:', error);
      // Fallback to current week
      const today = new Date();
      const start = startOfWeek(today, { weekStartsOn: 1 });
      const end = endOfWeek(today, { weekStartsOn: 1 });
      return {
        from: format(start, 'yyyy-MM-dd'),
        to: format(end, 'yyyy-MM-dd')
      };
    }
  };

  const getPeriodDates = () => {
    if (selectedWeek === 'custom' && customPeriodFrom && customPeriodTo) {
      return { from: customPeriodFrom, to: customPeriodTo };
    }
    const weekOffset = selectedWeek === 'current' ? 0 : (parseInt(selectedWeek) || 0);
    return getWeekDates(weekOffset);
  };

  useEffect(() => {
    fetchRevenues();
  }, [fleetId, selectedWeek, customPeriodFrom, customPeriodTo]);

  const fetchRevenues = async () => {
    setLoading(true);
    try {
      // Fetch active driver-vehicle assignments for this fleet
      const { data: assignments, error: assignmentsError } = await supabase
        .from('driver_vehicle_assignments')
        .select(`
          driver_id,
          assigned_at,
          drivers!inner(
            id,
            first_name,
            last_name
          ),
          vehicles!inner(
            id,
            brand,
            model,
            plate,
            weekly_rental_fee,
            fleet_id
          )
        `)
        .eq('status', 'active')
        .eq('vehicles.fleet_id', fleetId);

      if (assignmentsError) throw assignmentsError;

      if (!assignments || assignments.length === 0) {
        setRevenues([]);
        setLoading(false);
        return;
      }

      // Fetch current debt balance for each driver
      const driverIds = assignments.map(a => a.driver_id);
      const { data: debts } = await supabase
        .from('driver_debts')
        .select('driver_id, current_balance')
        .in('driver_id', driverIds);

      const debtMap = new Map(debts?.map(d => [d.driver_id, d.current_balance]) || []);

      // Map assignments to revenue data
      const revenueData: VehicleRevenue[] = assignments.map(assignment => {
        const driver = assignment.drivers as any;
        const vehicle = assignment.vehicles as any;

        return {
          driver_id: assignment.driver_id,
          driver_name: `${driver.first_name} ${driver.last_name}`,
          vehicle_plate: vehicle.plate,
          vehicle_brand: vehicle.brand,
          vehicle_model: vehicle.model,
          assigned_date: assignment.assigned_at || new Date().toISOString(),
          rental_fee: parseFloat(vehicle.weekly_rental_fee || '0'),
          debt_balance: debtMap.get(assignment.driver_id) || 0,
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

  const updateAssignedDate = async (driverId: string, newDate: string) => {
    try {
      const { error } = await supabase
        .from('driver_vehicle_assignments')
        .update({ assigned_at: newDate })
        .eq('driver_id', driverId)
        .eq('status', 'active');

      if (error) throw error;

      toast.success('Data wynajmu została zaktualizowana');
      fetchRevenues();
    } catch (error: any) {
      toast.error('Błąd aktualizacji daty: ' + error.message);
    }
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
    <Card>
      <CardHeader>
        <CardTitle>Przychody aut</CardTitle>
        <div className="flex items-center gap-4 mt-4">
          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Wybierz okres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Bieżący tydzień</SelectItem>
              <SelectItem value="1">Poprzedni tydzień</SelectItem>
              <SelectItem value="2">2 tygodnie temu</SelectItem>
              <SelectItem value="3">3 tygodnie temu</SelectItem>
              <SelectItem value="4">4 tygodnie temu</SelectItem>
              <SelectItem value="custom">Własny zakres</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {selectedWeek === 'custom' && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={customPeriodFrom}
                onChange={(e) => setCustomPeriodFrom(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <span className="text-muted-foreground">do</span>
            <Input
              type="date"
              value={customPeriodTo}
              onChange={(e) => setCustomPeriodTo(e.target.value)}
              className="w-[150px]"
            />
          </div>
        )}
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenues.map((rev) => (
                <TableRow key={rev.driver_id}>
                  <TableCell className="font-medium">
                    {rev.driver_name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {rev.vehicle_brand} {rev.vehicle_model}
                    <div className="text-xs text-muted-foreground">{rev.vehicle_plate}</div>
                  </TableCell>
                  <TableCell>
                    {mode === 'admin' ? (
                      <input 
                        type="date" 
                        value={format(new Date(rev.assigned_date), 'yyyy-MM-dd')}
                        onChange={(e) => updateAssignedDate(rev.driver_id, e.target.value)}
                        className="border rounded px-2 py-1 text-sm"
                      />
                    ) : (
                      <span className="text-sm">
                        {formatPeriodDate(rev.assigned_date)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${getRentalFeeColor(rev.rental_fee)}`}>
                    {rev.rental_fee.toFixed(2)} zł
                  </TableCell>
                  <TableCell className={`text-right font-mono ${getDebtColor(rev.debt_balance)}`}>
                    {rev.debt_balance === 0 ? '—' : `${rev.debt_balance.toFixed(2)} zł`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
