import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { toast } from 'sonner';
import { Check, X, AlertCircle } from 'lucide-react';
import { UniversalSubTabBar } from './UniversalSubTabBar';
import { DriverSettlements } from './DriverSettlements';
import { useUserRole } from '@/hooks/useUserRole';

interface FleetSettlementsViewProps {
  fleetId: string;
  viewType: 'settlement' | 'rental';
  periodFrom?: string;
  periodTo?: string;
}

interface DriverSettlement {
  driver_id: string;
  driver_name: string;
  vehicle: string;
  weekly_rental_fee: number;
  uber_cashless: number;
  bolt_net: number;
  freenow_net: number;
  total_earnings: number;
  fuel: number;
  rental: number;
  commission: number;
  tax: number;
  net_result: number;
  cash: number;
  debt_current: number;
  debt_previous: number;
  covered_rental: boolean;
}

export function FleetSettlementsView({ fleetId, viewType, periodFrom, periodTo }: FleetSettlementsViewProps) {
  const [settlements, setSettlements] = useState<DriverSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState("drivers");
  const { roles } = useUserRole();
  const [myDriverId, setMyDriverId] = useState<string | null>(null);

  // Check if user is also a driver
  const isDriver = roles.includes('driver');

  useEffect(() => {
    if (fleetId) {
      fetchSettlements();
    }
  }, [fleetId, periodFrom, periodTo]);

  useEffect(() => {
    if (isDriver) {
      fetchMyDriverId();
    }
  }, [isDriver]);

  const fetchMyDriverId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('driver_app_users')
      .select('driver_id')
      .eq('user_id', user.id)
      .single();

    if (data) {
      setMyDriverId(data.driver_id);
      setActiveSubTab("my"); // Default to "my" settlements if user is driver
    }
  };

  const fetchSettlements = async () => {
    setLoading(true);
    try {
      // Pobierz kierowców przypisanych do floty
      const { data: assignments, error: assignmentsError } = await supabase
        .from('driver_vehicle_assignments')
        .select(`
          driver_id,
          vehicle_id,
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
        setSettlements([]);
        setLoading(false);
        return;
      }

      const driverIds = assignments.map(a => a.driver_id);

      // Pobierz rozliczenia dla tych kierowców
      let query = supabase
        .from('settlements')
        .select('*')
        .in('driver_id', driverIds);

      if (periodFrom) query = query.gte('period_from', periodFrom);
      if (periodTo) query = query.lte('period_to', periodTo);

      const { data: settlementsData, error: settlementsError } = await query;

      if (settlementsError) throw settlementsError;

      // Agreguj dane
      const aggregated = assignments.map(assignment => {
        const driver = assignment.drivers as any;
        const vehicle = assignment.vehicles as any;
        
        const driverSettlements = settlementsData?.filter(s => s.driver_id === assignment.driver_id) || [];
        
        const uber_cashless = driverSettlements.reduce((sum, s) => {
          const amounts = typeof s.amounts === 'object' && s.amounts !== null ? s.amounts as any : {};
          return sum + (parseFloat(amounts.uber_cashless || '0'));
        }, 0);
        const bolt_net = driverSettlements.reduce((sum, s) => {
          const amounts = typeof s.amounts === 'object' && s.amounts !== null ? s.amounts as any : {};
          return sum + (parseFloat(amounts.bolt_net || '0'));
        }, 0);
        const freenow_net = driverSettlements.reduce((sum, s) => {
          const amounts = typeof s.amounts === 'object' && s.amounts !== null ? s.amounts as any : {};
          return sum + (parseFloat(amounts.freenow_net || '0'));
        }, 0);
        const fuel = driverSettlements.reduce((sum, s) => {
          const amounts = typeof s.amounts === 'object' && s.amounts !== null ? s.amounts as any : {};
          return sum + (parseFloat(amounts.fuel || '0'));
        }, 0);
        const cash = driverSettlements.reduce((sum, s) => {
          const amounts = typeof s.amounts === 'object' && s.amounts !== null ? s.amounts as any : {};
          return sum + (parseFloat(amounts.total_cash || '0'));
        }, 0);

        const total_earnings = uber_cashless + bolt_net + freenow_net;
        const rental = parseFloat(vehicle.weekly_rental_fee || '0') * driverSettlements.length;
        const net_result = total_earnings - fuel - rental;

        const debt_current = driverSettlements[driverSettlements.length - 1]?.debt_after || 0;
        const debt_previous = driverSettlements[0]?.debt_before || 0;

        return {
          driver_id: assignment.driver_id,
          driver_name: `${driver.first_name} ${driver.last_name}`,
          vehicle: `${vehicle.brand} ${vehicle.model} (${vehicle.plate})`,
          weekly_rental_fee: parseFloat(vehicle.weekly_rental_fee || '0'),
          uber_cashless,
          bolt_net,
          freenow_net,
          total_earnings,
          fuel,
          rental,
          commission: 0,
          tax: 0,
          net_result,
          cash,
          debt_current,
          debt_previous,
          covered_rental: total_earnings >= rental,
        };
      });

      setSettlements(aggregated);
    } catch (error: any) {
      toast.error('Błąd ładowania rozliczeń: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const subTabs = [
    ...(isDriver && myDriverId ? [{ value: "my", label: "Moje rozliczenia", visible: true }] : []),
    { value: "drivers", label: "Rozliczenia kierowców", visible: true },
    { value: "vehicles", label: "Przychody aut", visible: true }
  ];

  if (loading) {
    return <div className="text-center py-8">Ładowanie rozliczeń...</div>;
  }

  // Render based on active sub-tab
  if (isDriver && myDriverId && activeSubTab === "my") {
    return (
      <div>
        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />
        <DriverSettlements driverId={myDriverId} hideControls />
      </div>
    );
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
                <TableHead>Kierowca</TableHead>
                <TableHead>Auto</TableHead>
                <TableHead className="text-right">Wynajem</TableHead>
                <TableHead className="text-center">Pokrył?</TableHead>
                <TableHead className="text-right">Dług poprzedni</TableHead>
                <TableHead className="text-right">Dług bieżący</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlements.map((settlement) => (
                <TableRow key={settlement.driver_id}>
                  <TableCell className="font-medium">{settlement.driver_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{settlement.vehicle}</TableCell>
                  <TableCell className="text-right font-mono">
                    {settlement.rental.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-center">
                    {settlement.covered_rental ? (
                      <Check className="h-5 w-5 text-green-500 mx-auto" />
                    ) : (
                      <X className="h-5 w-5 text-red-500 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {settlement.debt_previous.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {settlement.debt_current.toFixed(2)} zł
                  </TableCell>
                  <TableCell>
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
                        Ma dług {settlement.debt_current.toFixed(2)} zł
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
      <Card>
        <CardHeader>
          <CardTitle>Rozliczenia kierowców</CardTitle>
        </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kierowca</TableHead>
                <TableHead className="text-right">Uber</TableHead>
                <TableHead className="text-right">Bolt</TableHead>
                <TableHead className="text-right">FreeNow</TableHead>
                <TableHead className="text-right">Suma</TableHead>
                <TableHead className="text-right">Paliwo</TableHead>
                <TableHead className="text-right">Wynajem</TableHead>
                <TableHead className="text-right font-bold">Netto</TableHead>
                <TableHead className="text-right">Gotówka</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlements.map((settlement) => (
                <TableRow key={settlement.driver_id}>
                  <TableCell className="font-medium">{settlement.driver_name}</TableCell>
                  <TableCell className="text-right font-mono">
                    {settlement.uber_cashless.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {settlement.bolt_net.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {settlement.freenow_net.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {settlement.total_earnings.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600">
                    -{settlement.fuel.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600">
                    -{settlement.rental.toFixed(2)} zł
                  </TableCell>
                  <TableCell className={`text-right font-mono font-bold ${settlement.net_result >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {settlement.net_result.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {settlement.cash.toFixed(2)} zł
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
