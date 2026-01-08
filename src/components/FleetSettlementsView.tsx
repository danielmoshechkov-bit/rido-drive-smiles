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
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { pl } from 'date-fns/locale';
import { toast } from 'sonner';
import { Check, X, AlertCircle, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { UniversalSubTabBar } from './UniversalSubTabBar';
import { DriverSettlements } from './DriverSettlements';
import { FleetFuelView } from './FleetFuelView';
import { FuelCSVUpload } from './FuelCSVUpload';
import { CompanyRevenueSummary } from './CompanyRevenueSummary';
import { FleetVehicleRevenue } from './FleetVehicleRevenue';
import { FleetSettlementImport } from './fleet/FleetSettlementImport';
import { FleetSettlementSettings } from './fleet/FleetSettlementSettings';
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
  service_fee: number;
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
}

export function FleetSettlementsView({ fleetId, viewType, periodFrom, periodTo }: FleetSettlementsViewProps) {
  const [settlements, setSettlements] = useState<DriverSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState("drivers");
  const { roles } = useUserRole();
  const [myDriverId, setMyDriverId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<number>(getCurrentWeekNumber(new Date().getFullYear()));
  const [cities, setCities] = useState<{id: string, name: string}[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hideZeroRows, setHideZeroRows] = useState<boolean>(false);

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

  // Fetch latest settlement week on mount
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

      // Pobierz kierowców z floty wraz z danymi o pojazdach i planach
      let driversQuery = supabase
        .from('drivers')
        .select(`
          id, 
          first_name, 
          last_name,
          city_id,
          driver_app_users!inner(settlement_plan_id)
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

      // Agreguj rozliczenia per kierowca
      const aggregated = driversData.map(driver => {
        const driverSettlements = settlementsData?.filter(s => s.driver_id === driver.id) || [];

        // Parsuj amounts JSONB - obsługuj STARE klucze camelCase z CSV importu
        const uber_base = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          // Stary format: uber (lub uberBase, uberCashless)
          const uber = parseFloat(amounts.uber || amounts.uberBase || amounts.uberCashless || '0');
          return sum + uber;
        }, 0);

        const bolt_base = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          // Stary format: boltGross
          const bolt = parseFloat(amounts.boltGross || amounts.bolt_projected_d || '0');
          return sum + bolt;
        }, 0);

        const freenow_base = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          // Stary format: freenowGross
          const freenow = parseFloat(amounts.freenowGross || amounts.freenow_base_s || '0');
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

        // Aggregate fuel costs and VAT refunds
        const total_fuel = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          return sum + parseFloat(amounts.fuel || '0');
        }, 0);

        const total_fuel_vat_refund = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          return sum + parseFloat(amounts.fuel_vat_refund || amounts.fuelVatRefund || '0');
        }, 0);

        const tax = driverSettlements.reduce((sum, s) => {
          const amounts = s.amounts as any || {};
          // Stary format: tax (pole zbiorowe) lub osobne *Tax8
          const taxTotal = parseFloat(amounts.tax || '0');
          if (taxTotal > 0) return sum + taxTotal;
          
          // Fallback: oblicz z poszczególnych platform (nowy format)
          const uberTax = parseFloat(amounts.uberTax8 || amounts.uber_tax_8 || '0');
          const boltTax = parseFloat(amounts.boltTax8 || amounts.bolt_tax_8 || '0');
          const freenowTax = parseFloat(amounts.freenowTax8 || amounts.freenow_tax_8 || '0');
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

        // ⚠️ OCHRONA ZEROWYCH ZAROBKÓW
        // Jeśli kierowca nie jeździł (suma zarobków = 0), nie naliczaj żadnych opłat
        if (total_base === 0) {
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
            service_fee: 0,
            rental: 0,
            fuel: 0,
            fuel_vat_refund: 0,
            net_without_commission: 0,
            final_payout: 0,
          };
        }

        // Jeśli zarobki są ujemne (np. kara z aplikacji do 10 zł), tylko to pokazuj bez opłat
        if (total_base < 0 && total_base > -10) {
          return {
            driver_id: driver.id,
            driver_name: `${driver.first_name} ${driver.last_name}`,
            uber_base,
            uber_cash: 0,
            uber_commission: 0,
            bolt_base,
            bolt_cash: 0,
            bolt_commission: 0,
            freenow_base,
            freenow_cash: 0,
            freenow_commission: 0,
            total_base,
            total_commission: 0,
            total_cash: 0,
            tax_8_percent: 0,
            service_fee: 0,
            rental: 0,
            fuel: 0,
            fuel_vat_refund: 0,
            net_without_commission: total_base,
            final_payout: total_base,
          };
        }

        // FIXED: Subtract cash, fuel, add VAT refund (matching driver panel formula)
        const payout = total_base - total_commission - tax - service_fee - rental - total_cash - total_fuel + total_fuel_vat_refund;

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
          tax_8_percent: tax,
          service_fee,
          rental,
          fuel: total_fuel,
          fuel_vat_refund: total_fuel_vat_refund,
          net_without_commission: total_base - total_commission - tax,
          final_payout: payout,
        };
      });

      console.log('📈 Aggregated settlements:', aggregated.length);
      console.log('✅ Sample settlement:', aggregated[0]);
      
      setSettlements(aggregated);
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
      <Card>
        <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle>Rozliczenia kierowców</CardTitle>
            <div className="flex items-center gap-4 flex-wrap">
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
                <Checkbox
                  id="hideZero"
                  checked={hideZeroRows}
                  onCheckedChange={(checked) => setHideZeroRows(checked === true)}
                />
                <Label htmlFor="hideZero" className="text-sm cursor-pointer">
                  Ukryj 0
                </Label>
              </div>
            </div>
          </div>
        </CardHeader>
      <CardContent>
        {(() => {
          // Filter settlements based on search and hide zero
          const filteredSettlements = settlements.filter(s => {
            // Search filter
            if (searchQuery.trim()) {
              const query = searchQuery.toLowerCase();
              if (!s.driver_name.toLowerCase().includes(query)) return false;
            }
            // Hide zero filter
            if (hideZeroRows && s.total_base === 0 && s.final_payout === 0) {
              return false;
            }
            return true;
          });

          return (
            <>
              {/* Mobile View - Collapsible per driver */}
              <div className="md:hidden space-y-2">
                {filteredSettlements.map((settlement) => (
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
                              <td className="p-2 text-right text-xs text-gray-900 tabular-nums">{settlement.uber_base > 0 ? formatCurrency(settlement.uber_base) : '-'}</td>
                              <td className="p-2 text-right text-xs text-green-600 tabular-nums">{settlement.bolt_base > 0 ? formatCurrency(settlement.bolt_base) : '-'}</td>
                              <td className="p-2 text-right text-xs text-red-600 tabular-nums">{settlement.freenow_base > 0 ? formatCurrency(settlement.freenow_base) : '-'}</td>
                            </tr>
                            <tr className="border-t">
                              <td className="p-2 text-xs text-muted-foreground">Prowizja</td>
                              <td className="p-2 text-right text-xs text-orange-600 tabular-nums">{settlement.uber_commission > 0 ? `-${formatCurrency(settlement.uber_commission)}` : '-'}</td>
                              <td className="p-2 text-right text-xs text-orange-600 tabular-nums">{settlement.bolt_commission > 0 ? `-${formatCurrency(settlement.bolt_commission)}` : '-'}</td>
                              <td className="p-2 text-right text-xs text-orange-600 tabular-nums">{settlement.freenow_commission > 0 ? `-${formatCurrency(settlement.freenow_commission)}` : '-'}</td>
                            </tr>
                            <tr className="border-t">
                              <td className="p-2 text-xs text-muted-foreground">Gotówka</td>
                              <td className="p-2 text-right text-xs text-red-600 tabular-nums">{settlement.uber_cash > 0 ? `-${formatCurrency(settlement.uber_cash)}` : '-'}</td>
                              <td className="p-2 text-right text-xs text-red-600 tabular-nums">{settlement.bolt_cash > 0 ? `-${formatCurrency(settlement.bolt_cash)}` : '-'}</td>
                              <td className="p-2 text-right text-xs text-red-600 tabular-nums">{settlement.freenow_cash > 0 ? `-${formatCurrency(settlement.freenow_cash)}` : '-'}</td>
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
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Opłata:</span>
                            <span className="font-medium tabular-nums">-{formatCurrency(settlement.service_fee)}</span>
                          </div>
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
                ))}
                
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
              <div className="hidden md:block overflow-x-auto">
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
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium text-green-600 whitespace-nowrap">VAT zwrot</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium whitespace-nowrap">Opłata</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-medium whitespace-nowrap">Wynajem</TableHead>
                      <TableHead className="text-right px-2 py-1.5 text-xs font-bold whitespace-nowrap">Wypłata</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSettlements.map((settlement) => (
                      <TableRow key={settlement.driver_id}>
                        <TableCell className="font-medium px-2 py-1.5 text-xs whitespace-nowrap">{settlement.driver_name}</TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-gray-900 tabular-nums whitespace-nowrap">
                          {formatCurrency(settlement.uber_base)}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-gray-900 tabular-nums whitespace-nowrap">
                          {settlement.uber_cash > 0 ? `-${formatCurrency(settlement.uber_cash)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                          {formatCurrency(settlement.bolt_base)}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                          {settlement.bolt_cash > 0 ? `-${formatCurrency(settlement.bolt_cash)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                          {settlement.bolt_commission > 0 ? `-${formatCurrency(settlement.bolt_commission)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                          {formatCurrency(settlement.freenow_base)}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                          {settlement.freenow_cash > 0 ? `-${formatCurrency(settlement.freenow_cash)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                          {settlement.freenow_commission > 0 ? `-${formatCurrency(settlement.freenow_commission)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 font-semibold tabular-nums whitespace-nowrap">
                          {settlement.total_cash > 0 ? `-${formatCurrency(settlement.total_cash)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-orange-600 font-semibold tabular-nums whitespace-nowrap">
                          {settlement.total_commission > 0 ? `-${formatCurrency(settlement.total_commission)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-red-600 tabular-nums whitespace-nowrap">
                          {settlement.fuel > 0 ? `-${formatCurrency(settlement.fuel)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                          {settlement.fuel_vat_refund > 0 ? `+${formatCurrency(settlement.fuel_vat_refund)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                          -{formatCurrency(settlement.service_fee)}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                          -{formatCurrency(settlement.rental || 0)}
                        </TableCell>
                        <TableCell className={`text-right font-bold px-2 py-1.5 text-xs tabular-nums whitespace-nowrap ${getAmountColor(settlement.final_payout)}`}>
                          {formatCurrency(settlement.final_payout)}
                        </TableCell>
                      </TableRow>
                    ))}
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
                      <TableCell className="text-right px-2 py-1.5 text-xs text-green-600 tabular-nums whitespace-nowrap">
                        +{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.fuel_vat_refund, 0))}
                      </TableCell>
                      <TableCell className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.service_fee, 0))}
                      </TableCell>
                      <TableCell className="text-right px-2 py-1.5 text-xs tabular-nums whitespace-nowrap">
                        -{formatCurrency(filteredSettlements.reduce((sum, s) => sum + (s.rental || 0), 0))}
                      </TableCell>
                      <TableCell className={`text-right font-bold px-2 py-1.5 text-xs tabular-nums whitespace-nowrap ${getAmountColor(filteredSettlements.reduce((sum, s) => sum + s.final_payout, 0))}`}>
                        {formatCurrency(filteredSettlements.reduce((sum, s) => sum + s.final_payout, 0))}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </>
          );
        })()}
      </CardContent>
    </Card>
    </div>
  );
}
