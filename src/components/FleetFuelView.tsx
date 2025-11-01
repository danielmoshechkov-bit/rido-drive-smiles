import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { toast } from 'sonner';

interface FleetFuelViewProps {
  fleetId: string;
  periodFrom?: string;
  periodTo?: string;
}

interface FuelLog {
  id: string;
  driver_id: string;
  date: string;
  amount: number;
  liters: number | null;
  station: string | null;
  notes: string | null;
  driver_name: string;
}

export function FleetFuelView({ fleetId, periodFrom, periodTo }: FleetFuelViewProps) {
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (fleetId) {
      fetchFuelLogs();
    }
  }, [fleetId, periodFrom, periodTo]);

  const fetchFuelLogs = async () => {
    setLoading(true);
    try {
      // Get drivers assigned to fleet
      const { data: assignments, error: assignmentsError } = await supabase
        .from('driver_vehicle_assignments')
        .select(`
          driver_id,
          drivers!inner(
            id,
            first_name,
            last_name
          ),
          vehicles!inner(
            fleet_id
          )
        `)
        .eq('status', 'active')
        .eq('vehicles.fleet_id', fleetId);

      if (assignmentsError) throw assignmentsError;
      if (!assignments || assignments.length === 0) {
        setFuelLogs([]);
        setLoading(false);
        return;
      }

      const driverIds = assignments.map(a => a.driver_id);

      // Fetch fuel logs for those drivers
      let query = supabase
        .from('fuel_logs')
        .select('*')
        .in('driver_id', driverIds);

      if (periodFrom) query = query.gte('date', periodFrom);
      if (periodTo) query = query.lte('date', periodTo);

      const { data: logsData, error: logsError } = await query.order('date', { ascending: false });

      if (logsError) throw logsError;

      // Merge driver names
      const logsWithNames = (logsData || []).map(log => {
        const assignment = assignments.find(a => a.driver_id === log.driver_id);
        const driver = assignment?.drivers as any;
        return {
          ...log,
          driver_name: driver ? `${driver.first_name} ${driver.last_name}` : 'Nieznany'
        };
      });

      setFuelLogs(logsWithNames);
    } catch (error: any) {
      toast.error('Błąd ładowania danych paliwa: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Ładowanie danych paliwa...</div>;
  }

  const totalAmount = fuelLogs.reduce((sum, log) => sum + log.amount, 0);
  const totalLiters = fuelLogs.reduce((sum, log) => sum + (log.liters || 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Zużycie paliwa</CardTitle>
      </CardHeader>
      <CardContent>
        {fuelLogs.length === 0 ? (
          <div className="text-center text-muted-foreground py-6">
            Brak danych o paliwie dla wybranego okresu
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Kierowca</TableHead>
                  <TableHead>Stacja</TableHead>
                  <TableHead className="text-right">Litry</TableHead>
                  <TableHead className="text-right">Kwota</TableHead>
                  <TableHead>Notatki</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fuelLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      {format(new Date(log.date), 'd MMM yyyy', { locale: pl })}
                    </TableCell>
                    <TableCell className="font-medium">{log.driver_name}</TableCell>
                    <TableCell>{log.station || '-'}</TableCell>
                    <TableCell className="text-right font-mono">
                      {log.liters ? `${log.liters.toFixed(2)} L` : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {log.amount.toFixed(2)} zł
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.notes || '-'}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold bg-muted/50">
                  <TableCell colSpan={3}>SUMA</TableCell>
                  <TableCell className="text-right">
                    {totalLiters.toFixed(2)} L
                  </TableCell>
                  <TableCell className="text-right">
                    {totalAmount.toFixed(2)} zł
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
