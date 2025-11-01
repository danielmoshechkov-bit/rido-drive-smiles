import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface RevenueData {
  serviceFeesTotal: number;
  taxTotal: number;
  rentalFeesTotal: number;
  additionalFeesTotal: number;
  fuelCostsTotal: number;
  totalRevenue: number;
  totalCosts: number;
  netBalance: number;
  activeDrivers: number;
}

interface CompanyRevenueViewProps {
  fleetId?: string;
}

export function CompanyRevenueView({ fleetId }: CompanyRevenueViewProps) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);

  const getWeekDates = (year: number) => {
    const weeks = [];
    const startDate = new Date(year, 0, 1);
    
    while (startDate.getDay() !== 1) {
      startDate.setDate(startDate.getDate() + 1);
    }

    for (let week = 1; week <= 52; week++) {
      const weekStart = new Date(startDate);
      const weekEnd = new Date(startDate);
      weekEnd.setDate(weekEnd.getDate() + 6);

      weeks.push({
        number: week,
        start: weekStart.toISOString().split('T')[0],
        end: weekEnd.toISOString().split('T')[0],
        label: `Tydzień ${week} (${weekStart.toLocaleDateString('pl-PL', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('pl-PL', { month: 'short', day: 'numeric' })})`
      });

      startDate.setDate(startDate.getDate() + 7);
    }

    return weeks;
  };

  const weeks = getWeekDates(selectedYear);

  useEffect(() => {
    const currentWeek = weeks.find(w => {
      const now = new Date();
      const start = new Date(w.start);
      const end = new Date(w.end);
      return now >= start && now <= end;
    });
    if (currentWeek) {
      setSelectedWeek(currentWeek.number.toString());
    }
  }, [selectedYear]);

  useEffect(() => {
    if (selectedWeek) {
      fetchRevenueData();
    }
  }, [selectedWeek, fleetId]);

  const fetchRevenueData = async () => {
    setLoading(true);
    try {
      const weekData = weeks.find(w => w.number.toString() === selectedWeek);
      if (!weekData) return;

      // Fetch settlements for the period
      let settlementsQuery = supabase
        .from('settlements')
        .select('*, drivers!inner(id, fleet_id)')
        .gte('period_from', weekData.start)
        .lte('period_to', weekData.end);

      if (fleetId) {
        settlementsQuery = settlementsQuery.eq('drivers.fleet_id', fleetId);
      }

      const { data: settlements, error: settlementsError } = await settlementsQuery;
      if (settlementsError) throw settlementsError;

      // Calculate service fees and taxes from settlement plans
      let serviceFeesTotal = 0;
      let taxTotal = 0;
      let rentalFeesTotal = 0;

      for (const settlement of settlements || []) {
        // Get driver's settlement plan
        const { data: driverAppUser } = await supabase
          .from('driver_app_users')
          .select('settlement_plan_id')
          .eq('driver_id', settlement.driver_id)
          .single();

        if (driverAppUser?.settlement_plan_id) {
          const { data: plan } = await supabase
            .from('settlement_plans')
            .select('*')
            .eq('id', driverAppUser.settlement_plan_id)
            .single();

          if (plan) {
            // Calculate service fee from total earnings
            const totalEarnings = settlement.total_earnings || 0;
            if (plan.service_fee) {
              serviceFeesTotal += plan.service_fee;
            }
            if (plan.tax_percentage) {
              taxTotal += (totalEarnings * plan.tax_percentage / 100);
            }
          }
        }

        rentalFeesTotal += settlement.rental_fee || 0;
      }

      // Fetch additional fees
      const { data: additionalFees } = await supabase
        .from('driver_additional_fees')
        .select('amount, drivers!inner(id, fleet_id)')
        .eq('is_active', true)
        .lte('start_date', weekData.end)
        .or(`end_date.is.null,end_date.gte.${weekData.start}`);

      const additionalFeesTotal = (additionalFees || [])
        .filter(f => !fleetId || (f as any).drivers?.fleet_id === fleetId)
        .reduce((sum, fee) => sum + (fee.amount || 0), 0);

      // Fetch fuel costs
      let fuelQuery = supabase
        .from('fuel_transactions')
        .select('total_amount')
        .gte('transaction_date', weekData.start)
        .lte('transaction_date', weekData.end);

      const { data: fuelData } = await fuelQuery;
      const fuelCostsTotal = (fuelData || []).reduce((sum, f) => sum + (f.total_amount || 0), 0);

      // Calculate totals
      const totalRevenue = serviceFeesTotal + taxTotal + rentalFeesTotal + additionalFeesTotal;
      const totalCosts = fuelCostsTotal;
      const netBalance = totalRevenue - totalCosts;

      // Count active drivers
      const uniqueDrivers = new Set((settlements || []).map(s => s.driver_id));

      setRevenueData({
        serviceFeesTotal,
        taxTotal,
        rentalFeesTotal,
        additionalFeesTotal,
        fuelCostsTotal,
        totalRevenue,
        totalCosts,
        netBalance,
        activeDrivers: uniqueDrivers.size,
      });
    } catch (error) {
      console.error('Error fetching revenue data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Przychód firmy</CardTitle>
        <div className="flex gap-4 mt-4">
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026].map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Wybierz tydzień" />
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
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : revenueData ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg bg-muted/50">
                <h3 className="font-semibold mb-1">Aktywni kierowcy</h3>
                <p className="text-2xl font-bold">{revenueData.activeDrivers}</p>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-3">Przychody</h3>
              <div className="space-y-2">
                <div className="flex justify-between p-2 border-b">
                  <span className="text-muted-foreground">Opłaty za obsługę</span>
                  <span className="font-medium">{formatCurrency(revenueData.serviceFeesTotal)}</span>
                </div>
                <div className="flex justify-between p-2 border-b">
                  <span className="text-muted-foreground">Podatek pobrany</span>
                  <span className="font-medium">{formatCurrency(revenueData.taxTotal)}</span>
                </div>
                <div className="flex justify-between p-2 border-b">
                  <span className="text-muted-foreground">Opłaty za wynajem</span>
                  <span className="font-medium">{formatCurrency(revenueData.rentalFeesTotal)}</span>
                </div>
                <div className="flex justify-between p-2 border-b">
                  <span className="text-muted-foreground">Dodatkowe opłaty</span>
                  <span className="font-medium">{formatCurrency(revenueData.additionalFeesTotal)}</span>
                </div>
                <div className="flex justify-between p-3 bg-green-500/10 rounded-lg font-semibold">
                  <span>Suma przychodów</span>
                  <span className="text-green-600">{formatCurrency(revenueData.totalRevenue)}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-3">Koszty</h3>
              <div className="space-y-2">
                <div className="flex justify-between p-2 border-b">
                  <span className="text-muted-foreground">Koszty paliwa</span>
                  <span className="font-medium">{formatCurrency(revenueData.fuelCostsTotal)}</span>
                </div>
                <div className="flex justify-between p-3 bg-red-500/10 rounded-lg font-semibold">
                  <span>Suma kosztów</span>
                  <span className="text-red-600">{formatCurrency(revenueData.totalCosts)}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t-2">
              <div className="flex justify-between p-4 bg-primary/10 rounded-lg">
                <span className="text-xl font-bold">Bilans</span>
                <span className={`text-2xl font-bold ${revenueData.netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(revenueData.netBalance)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Wybierz tydzień aby zobaczyć przychody
          </div>
        )}
      </CardContent>
    </Card>
  );
}
