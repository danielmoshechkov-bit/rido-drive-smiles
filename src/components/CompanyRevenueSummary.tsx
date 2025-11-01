import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { pl } from 'date-fns/locale';

interface CompanyRevenueSummaryProps {
  fleetId: string;
}

export function CompanyRevenueSummary({ fleetId }: CompanyRevenueSummaryProps) {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [summary, setSummary] = useState({
    totalDrivers: 0,
    activeDrivers: 0,
    totalServiceFees: 0,
    totalTax: 0,
    totalRentalIncome: 0,
    totalFuelCosts: 0,
    netRevenue: 0
  });
  const [loading, setLoading] = useState(true);

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
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      
      if (weekEnd.getFullYear() > year) break;
      
      weeks.push({
        number: weekNumber,
        start: format(weekStart, 'yyyy-MM-dd'),
        end: format(weekEnd, 'yyyy-MM-dd'),
        label: `Tydzień ${weekNumber} (${format(weekStart, 'dd.MM')} - ${format(weekEnd, 'dd.MM.yyyy')})`
      });
      
      currentDate.setDate(currentDate.getDate() + 7);
      weekNumber++;
      
      if (year === currentYear && currentDate > now) break;
    }
    
    return weeks.reverse();
  };

  const weeks = getWeekDates(selectedYear);
  const currentWeek = weeks.find(w => w.number === selectedWeek);

  useEffect(() => {
    if (weeks.length > 0 && selectedWeek === null) {
      setSelectedWeek(weeks[0].number);
    }
  }, [weeks, selectedWeek]);

  useEffect(() => {
    if (currentWeek) {
      fetchSummary();
    }
  }, [fleetId, currentWeek]);

  const fetchSummary = async () => {
    if (!currentWeek) return;
    
    setLoading(true);
    try {
      // Get all drivers from fleet
      const { data: driversData } = await supabase
        .from('drivers')
        .select('id')
        .eq('fleet_id', fleetId);

      const driverIds = driversData?.map(d => d.id) || [];

      // Get settlements for the period
      const { data: settlements } = await supabase
        .from('settlements')
        .select('*')
        .in('driver_id', driverIds)
        .eq('period_from', currentWeek.start)
        .eq('period_to', currentWeek.end);

      // Calculate totals
      let totalServiceFees = 0;
      let totalTax = 0;
      let totalRentalIncome = 0;

      settlements?.forEach(settlement => {
        const amounts = settlement.amounts as any || {};
        totalServiceFees += Number(amounts.service_fee || 0);
        totalTax += Number(amounts.tax || 0);
        totalRentalIncome += Number(settlement.rental_fee || 0);
      });

      // Get fuel costs for the period
      const { data: fuelTransactions } = await supabase
        .from('fuel_transactions')
        .select('total_amount, card_number')
        .gte('transaction_date', currentWeek.start)
        .lte('transaction_date', currentWeek.end);

      // Match fuel cards to drivers in this fleet
      const { data: driversWithCards } = await supabase
        .from('drivers')
        .select('fuel_card_number')
        .eq('fleet_id', fleetId)
        .not('fuel_card_number', 'is', null);

      const fleetCardNumbers = new Set(driversWithCards?.map(d => d.fuel_card_number) || []);
      
      const totalFuelCosts = fuelTransactions
        ?.filter(ft => fleetCardNumbers.has(ft.card_number))
        .reduce((sum, ft) => sum + Number(ft.total_amount || 0), 0) || 0;

      const netRevenue = totalServiceFees + totalTax + totalRentalIncome - totalFuelCosts;

      // Count active drivers
      const activeDrivers = new Set(settlements?.map(s => s.driver_id) || []).size;

      setSummary({
        totalDrivers: driverIds.length,
        activeDrivers,
        totalServiceFees,
        totalTax,
        totalRentalIncome,
        totalFuelCosts,
        netRevenue
      });

    } catch (error) {
      console.error('Error fetching company revenue:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount) + ' zł';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Przychód firmy</CardTitle>
              <CardDescription>Podsumowanie przychodów i kosztów dla floty</CardDescription>
            </div>
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
                <Select 
                  value={selectedWeek?.toString() || ''} 
                  onValueChange={(v) => setSelectedWeek(parseInt(v))}
                  disabled={selectedWeek === null}
                >
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
            <div className="text-center py-8">Ładowanie danych...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-muted/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Liczba kierowców</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.activeDrivers} / {summary.totalDrivers}</div>
                  <p className="text-xs text-muted-foreground mt-1">Aktywni w okresie</p>
                </CardContent>
              </Card>

              <Card className="bg-green-50 border-green-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-green-700">Opłaty serwisowe</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-700">{formatCurrency(summary.totalServiceFees)}</div>
                  <p className="text-xs text-green-600 mt-1">Prowizje od kierowców</p>
                </CardContent>
              </Card>

              <Card className="bg-blue-50 border-blue-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-blue-700">Podatek pobrany</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-700">{formatCurrency(summary.totalTax)}</div>
                  <p className="text-xs text-blue-600 mt-1">Podatek 8%</p>
                </CardContent>
              </Card>

              <Card className="bg-purple-50 border-purple-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-purple-700">Przychód z wynajmu</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-700">{formatCurrency(summary.totalRentalIncome)}</div>
                  <p className="text-xs text-purple-600 mt-1">Wynajem pojazdów</p>
                </CardContent>
              </Card>

              <Card className="bg-red-50 border-red-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-red-700">Koszty paliwa</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-700">-{formatCurrency(summary.totalFuelCosts)}</div>
                  <p className="text-xs text-red-600 mt-1">Łączny koszt</p>
                </CardContent>
              </Card>

              <Card className="bg-primary/10 border-primary/30 md:col-span-2 lg:col-span-3">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-primary">Przychód netto</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-primary">{formatCurrency(summary.netRevenue)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Opłaty + Podatek + Wynajem - Paliwo
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
