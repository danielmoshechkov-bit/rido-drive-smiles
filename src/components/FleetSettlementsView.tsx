import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { pl } from 'date-fns/locale';
import { toast } from 'sonner';
import { Check, X, AlertCircle } from 'lucide-react';
import { UniversalSubTabBar } from './UniversalSubTabBar';
import { DriverSettlements } from './DriverSettlements';
import { FleetFuelView } from './FleetFuelView';
import { FleetVehicleRevenue } from './FleetVehicleRevenue';
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
  uber_base: number;
  bolt_base: number;
  freenow_base: number;
  total_base: number;
  uber_commission: number;
  bolt_commission: number;
  freenow_commission: number;
  total_commission: number;
  total_cash: number;
  tax_8_percent: number;
  service_fee: number;
  net_without_commission: number;
  final_payout: number;
  // For rental view
  vehicle?: string;
  weekly_rental_fee?: number;
  rental?: number;
  debt_current?: number;
  debt_previous?: number;
  covered_rental?: boolean;
}

export function FleetSettlementsView({ fleetId, viewType, periodFrom, periodTo }: FleetSettlementsViewProps) {
  const [settlements, setSettlements] = useState<DriverSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState("drivers");
  const { roles } = useUserRole();
  const [myDriverId, setMyDriverId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<number>(1);

  // Check if user is also a driver
  const isDriver = roles.includes('driver');

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
    if (fleetId) {
      fetchSettlements();
    }
  }, [fleetId, periodFrom, periodTo, selectedYear, selectedWeek]);

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
      // For users with both driver and fleet roles, keep "drivers" as default
      // Only switch to "my" if user is ONLY a driver (not fleet user)
      const hasFleetRole = roles.includes('fleet_settlement') || roles.includes('fleet_rental');
      if (!hasFleetRole) {
        setActiveSubTab("my");
      }
    }
  };

  const fetchSettlements = async () => {
    setLoading(true);
    try {
      // Pobierz WSZYSTKICH kierowców z floty
      const { data: driversData, error: driversError } = await supabase
        .from('drivers')
        .select('id, first_name, last_name')
        .eq('fleet_id', fleetId);

      if (driversError) throw driversError;

      if (!driversData || driversData.length === 0) {
        setSettlements([]);
        setLoading(false);
        return;
      }

      const driverIds = driversData.map(d => d.id);

      // Pobierz rozliczenia dla wybranego okresu
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

      // Agreguj rozliczenia per kierowca
      const aggregated = driversData.map(driver => {
        const driverSettlements = settlementsData?.filter(s => s.driver_id === driver.id) || [];

        const uber_base = driverSettlements
          .filter(s => s.platform === 'uber')
          .reduce((sum, s) => {
            const amounts = s.amounts as any || {};
            return sum + (parseFloat(amounts.uber_total || '0'));
          }, 0);

        const bolt_base = driverSettlements
          .filter(s => s.platform === 'bolt')
          .reduce((sum, s) => {
            const amounts = s.amounts as any || {};
            return sum + (parseFloat(amounts.bolt_gross || '0'));
          }, 0);

        const freenow_base = driverSettlements
          .filter(s => s.platform === 'freenow')
          .reduce((sum, s) => {
            const amounts = s.amounts as any || {};
            return sum + (parseFloat(amounts.freenow_gross || '0'));
          }, 0);

        const total_base = uber_base + bolt_base + freenow_base;

        const total_commission = driverSettlements.reduce(
          (sum, s) => sum + (parseFloat(s.commission_amount as any || '0')), 0
        );

        const total_cash = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          return sum + (parseFloat(amounts.total_cash || '0'));
        }, 0);

        const tax_8_percent = total_base * 0.08;
        const service_fee = 50;
        const net_without_commission = total_base - tax_8_percent - total_commission;
        const final_payout = net_without_commission - service_fee;

        return {
          driver_id: driver.id,
          driver_name: `${driver.first_name} ${driver.last_name}`,
          uber_base,
          bolt_base,
          freenow_base,
          total_base,
          uber_commission: 0,
          bolt_commission: 0,
          freenow_commission: 0,
          total_commission,
          total_cash,
          tax_8_percent,
          service_fee,
          net_without_commission,
          final_payout,
        };
      });

      setSettlements(aggregated.filter(a => a.total_base > 0));
    } catch (error: any) {
      toast.error('Błąd ładowania rozliczeń: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const subTabs = [
    ...(isDriver && myDriverId ? [{ value: "my", label: "Moje rozliczenia", visible: true }] : []),
    { value: "drivers", label: "Rozliczenia kierowców", visible: true },
    { value: "vehicles", label: "Przychody aut", visible: true },
    { value: "fuel", label: "Paliwo", visible: true }
  ];

  if (loading) {
    return <div className="text-center py-8">Ładowanie rozliczeń...</div>;
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
      <div>
        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />
        <FleetFuelView fleetId={fleetId} periodFrom={periodFrom} periodTo={periodTo} />
      </div>
    );
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
        <DriverSettlements driverId={myDriverId} hideControls={false} />
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
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Rozliczenia kierowców</CardTitle>
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
          <div className="flex items-center justify-between">
            <CardTitle>Rozliczenia kierowców</CardTitle>
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
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kierowca</TableHead>
                <TableHead className="text-right">Uber</TableHead>
                <TableHead className="text-right">Bolt</TableHead>
                <TableHead className="text-right">FreeNow</TableHead>
                <TableHead className="text-right font-bold">Podstawa</TableHead>
                <TableHead className="text-right text-red-600">Podatek 8%</TableHead>
                <TableHead className="text-right text-red-600">Prowizja</TableHead>
                <TableHead className="text-right text-blue-600">Gotówka</TableHead>
                <TableHead className="text-right font-bold text-green-600">Bez prowizji</TableHead>
                <TableHead className="text-right font-bold text-red-600">Opłata</TableHead>
                <TableHead className="text-right font-bold text-purple-600">Wypłata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlements.map((settlement) => (
                <TableRow key={settlement.driver_id}>
                  <TableCell className="font-medium">{settlement.driver_name}</TableCell>
                  <TableCell className="text-right font-mono">
                    {settlement.uber_base.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {settlement.bolt_base.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {settlement.freenow_base.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    {settlement.total_base.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600">
                    -{settlement.tax_8_percent.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600">
                    -{settlement.total_commission.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono text-blue-600">
                    {settlement.total_cash.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-green-600">
                    {settlement.net_without_commission.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-red-600">
                    -{settlement.service_fee.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-purple-600">
                    {settlement.final_payout.toFixed(2)} zł
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
