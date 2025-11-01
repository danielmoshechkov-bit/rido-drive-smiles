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
import { useTabPermissions } from '@/hooks/useTabPermissions';

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
  rental?: number;
  // For rental view
  vehicle?: string;
  weekly_rental_fee?: number;
  debt_current?: number;
  debt_previous?: number;
  covered_rental?: boolean;
}

export function FleetSettlementsView({ fleetId, viewType, periodFrom, periodTo }: FleetSettlementsViewProps) {
  const [settlements, setSettlements] = useState<DriverSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState("drivers");
  const { roles } = useUserRole();
  const { canViewTab } = useTabPermissions();
  const [myDriverId, setMyDriverId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('all');
  const [settlementPlans, setSettlementPlans] = useState<Array<{ id: string; name: string }>>([]);

  // Fetch latest settlement week on mount
  useEffect(() => {
    if (fleetId) {
      fetchLatestSettlement();
      fetchSettlementPlans();
    }
  }, [fleetId]);

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

  const fetchSettlementPlans = async () => {
    const { data } = await supabase
      .from('settlement_plans')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    
    if (data) {
      setSettlementPlans(data);
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
        .single();

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
        }
      }
    } catch (error) {
      console.error('Error fetching latest settlement:', error);
    }
  };

  const fetchSettlements = async () => {
    setLoading(true);
    try {
      console.log('🔍 Fetching settlements for fleetId:', fleetId);
      console.log('📅 Selected period:', { year: selectedYear, week: selectedWeek, currentWeek });

      // Pobierz kierowców z floty wraz z danymi o pojazdach i planach
      const { data: driversData, error: driversError } = await supabase
        .from('drivers')
        .select(`
          id, 
          first_name, 
          last_name,
          driver_app_users!inner(settlement_plan_id)
        `)
        .eq('fleet_id', fleetId);

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

      // Agreguj rozliczenia per kierowca
      const aggregated = driversData.map(driver => {
        const driverSettlements = settlementsData?.filter(s => s.driver_id === driver.id) || [];

        // Parsuj amounts JSONB - używamy poprawnych kluczy z settlements edge function
        const uber_base = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          // uber_payout_d zawiera payout bez gotówki, uber_cash_f to gotówka
          return sum + (parseFloat(amounts.uber_payout_d || amounts.uber_base || '0'));
        }, 0);

        const bolt_base = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          // bolt_projected_d to kwota brutto
          return sum + (parseFloat(amounts.bolt_projected_d || amounts.bolt_gross || '0'));
        }, 0);

        const freenow_base = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          // freenow_base_s to kwota bazowa
          return sum + (parseFloat(amounts.freenow_base_s || amounts.freenow_gross || '0'));
        }, 0);

        const total_commission = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          // freenow_commission_t to prowizja FreeNow, inne platformy mają komisję wliczoną
          return sum + (parseFloat(amounts.freenow_commission_t || '0'));
        }, 0);

        const total_cash = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          // uber_cash_f + bolt_cash + freenow_cash_f
          const uberCash = parseFloat(amounts.uber_cash_f || '0');
          const boltCash = parseFloat(amounts.bolt_cash || '0');
          const freenowCash = parseFloat(amounts.freenow_cash_f || '0');
          return sum + uberCash + boltCash + freenowCash;
        }, 0);

        const tax = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          // *_tax_8 zawiera podatek 8%
          const uberTax = parseFloat(amounts.uber_tax_8 || '0');
          const boltTax = parseFloat(amounts.bolt_tax_8 || '0');
          const freenowTax = parseFloat(amounts.freenow_tax_8 || '0');
          return sum + uberTax + boltTax + freenowTax;
        }, 0);

        // Pobierz service_fee z planu rozliczeniowego
        const driverAppUser = (driver as any).driver_app_users;
        const plan = plansData?.find(p => p.id === driverAppUser?.settlement_plan_id);
        const service_fee = plan?.service_fee || 50;

        // Pobierz wynajem z przypisanego pojazdu
        const assignment = assignmentsData?.find(a => a.driver_id === driver.id);
        const rental = (assignment?.vehicles as any)?.weekly_rental_fee || 0;

        // Oblicz wypłatę
        const total_base = uber_base + bolt_base + freenow_base;
        const payout = total_base - total_commission - tax - service_fee - rental + total_cash;

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
          tax_8_percent: tax,
          service_fee,
          rental,
          net_without_commission: total_base - total_commission - tax,
          final_payout: payout,
        };
      });

      console.log('📈 Aggregated settlements:', aggregated.length);
      console.log('✅ Sample settlement:', aggregated[0]);
      
      // Filter by plan if selected
      let filtered = aggregated;
      if (selectedPlanId !== 'all') {
        filtered = aggregated.filter(a => {
          const driverData = driversData.find(d => d.id === a.driver_id);
          const planId = (driverData as any)?.driver_app_users?.settlement_plan_id;
          return planId === selectedPlanId;
        });
      }
      
      setSettlements(filtered);
    } catch (error: any) {
      toast.error('Błąd ładowania rozliczeń: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const subTabs = [
    ...(isDriver && myDriverId && canViewTab('settlements.my') ? [{ value: "my", label: "Moje rozliczenia", visible: true }] : []),
    ...(canViewTab('settlements.drivers') ? [{ value: "drivers", label: "Rozliczenia kierowców", visible: true }] : []),
    ...(canViewTab('settlements.vehicles') ? [{ value: "vehicles", label: "Przychody aut", visible: true }] : []),
    ...(canViewTab('settlements.fuel') ? [{ value: "fuel", label: "Paliwo", visible: true }] : [])
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
              <CardTitle>Wyniki tygodniowe</CardTitle>
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
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Plan:</Label>
                  <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Wszystkie plany</SelectItem>
                      {settlementPlans.map(plan => (
                        <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
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
            <CardTitle>Wyniki tygodniowe</CardTitle>
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
              <div className="flex items-center gap-2">
                <Label className="text-sm">Plan:</Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie plany</SelectItem>
                    {settlementPlans.map(plan => (
                      <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
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
                <TableHead className="text-right">Prowizja</TableHead>
                <TableHead className="text-right">Gotówka</TableHead>
                <TableHead className="text-right">Podatek</TableHead>
                <TableHead className="text-right">Opłata</TableHead>
                <TableHead className="text-right">Wynajem</TableHead>
                <TableHead className="text-right font-bold">Wypłata</TableHead>
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
                  <TableCell className="text-right font-mono">
                    -{settlement.total_commission.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {settlement.total_cash.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    -{settlement.tax_8_percent.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    -{settlement.service_fee.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    -{settlement.rental?.toFixed(2) || '0.00'} zł
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
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
