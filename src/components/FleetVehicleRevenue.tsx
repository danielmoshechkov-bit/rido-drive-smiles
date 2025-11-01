import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { pl } from 'date-fns/locale';

interface VehicleRevenue {
  driver_id: string;
  driver_name: string;
  vehicle_plate: string;
  vehicle_model: string;
  total_revenue: number;
  rental_fee: number;
  net_revenue: number;
  debt_balance: number;
}

interface FleetVehicleRevenueProps {
  fleetId: string;
}

export function FleetVehicleRevenue({ fleetId }: FleetVehicleRevenueProps) {
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
      const { from, to } = getPeriodDates();

      // Get active driver-vehicle assignments for this fleet
      const { data: assignments } = await supabase
        .from('driver_vehicle_assignments')
        .select(`
          driver_id,
          vehicle_id,
          drivers(first_name, last_name),
          vehicles(plate, brand, model, weekly_rental_fee)
        `)
        .eq('fleet_id', fleetId)
        .eq('status', 'active');

      if (!assignments) {
        setRevenues([]);
        setLoading(false);
        return;
      }

      // For each assignment, fetch settlements for the period
      const revenueData: VehicleRevenue[] = await Promise.all(
        assignments.map(async (assignment: any) => {
          const { data: settlements } = await supabase
            .from('settlements')
            .select('net_amount, rental_fee')
            .eq('driver_id', assignment.driver_id)
            .gte('period_from', from)
            .lte('period_to', to);

          const totalRevenue = settlements?.reduce((sum, s) => sum + (Number(s.net_amount) || 0), 0) || 0;
          const totalRentalFee = settlements?.reduce((sum, s) => sum + (Number(s.rental_fee) || 0), 0) || 0;

          // Get driver debt balance
          const { data: debt } = await supabase
            .from('driver_debts')
            .select('current_balance')
            .eq('driver_id', assignment.driver_id)
            .single();

          return {
            driver_id: assignment.driver_id,
            driver_name: `${assignment.drivers?.first_name || ''} ${assignment.drivers?.last_name || ''}`.trim(),
            vehicle_plate: assignment.vehicles?.plate || 'N/A',
            vehicle_model: `${assignment.vehicles?.brand || ''} ${assignment.vehicles?.model || ''}`.trim(),
            total_revenue: totalRevenue,
            rental_fee: totalRentalFee,
            net_revenue: totalRevenue - totalRentalFee,
            debt_balance: Number(debt?.current_balance) || 0
          };
        })
      );

      setRevenues(revenueData);
    } catch (error) {
      console.error('Error fetching vehicle revenues:', error);
    } finally {
      setLoading(false);
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

  const periodDates = getPeriodDates();
  const from = periodDates.from;
  const to = periodDates.to;

  // Safe date formatting with validation
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
        <div className="flex justify-between items-center">
          <CardTitle>Przychody aut</CardTitle>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedWeek} onValueChange={setSelectedWeek}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Bieżący tydzień</SelectItem>
                <SelectItem value="1">Poprzedni tydzień</SelectItem>
                <SelectItem value="2">2 tygodnie temu</SelectItem>
                <SelectItem value="3">3 tygodnie temu</SelectItem>
                <SelectItem value="4">4 tygodnie temu</SelectItem>
                <SelectItem value="custom">Własny okres</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {selectedWeek === 'custom' && (
          <div className="flex gap-2 mt-2">
            <input
              type="date"
              value={customPeriodFrom}
              onChange={(e) => setCustomPeriodFrom(e.target.value)}
              className="border rounded px-2 py-1"
            />
            <span className="py-1">-</span>
            <input
              type="date"
              value={customPeriodTo}
              onChange={(e) => setCustomPeriodTo(e.target.value)}
              className="border rounded px-2 py-1"
            />
            <Button onClick={fetchRevenues} size="sm">Zastosuj</Button>
          </div>
        )}
        <p className="text-sm text-muted-foreground mt-2">
          Okres: {formatPeriodDate(from)} - {formatPeriodDate(to)}
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">Ładowanie...</div>
        ) : revenues.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Brak przychodów w tym okresie
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kierowca</TableHead>
                <TableHead>Pojazd</TableHead>
                <TableHead className="text-right">Przychód całkowity</TableHead>
                <TableHead className="text-right">Wynajem</TableHead>
                <TableHead className="text-right">Netto</TableHead>
                <TableHead className="text-right">Zadłużenie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenues.map((rev) => (
                <TableRow key={rev.driver_id} className="hover:bg-yellow-50">
                  <TableCell className="font-medium">{rev.driver_name}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div className="font-medium">{rev.vehicle_plate}</div>
                      <div className="text-muted-foreground">{rev.vehicle_model}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {rev.total_revenue.toFixed(2)} zł
                  </TableCell>
                  <TableCell className={`text-right ${getRentalFeeColor(rev.rental_fee)}`}>
                    {rev.rental_fee.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {rev.net_revenue.toFixed(2)} zł
                  </TableCell>
                  <TableCell className={`text-right ${getDebtColor(rev.debt_balance)}`}>
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
