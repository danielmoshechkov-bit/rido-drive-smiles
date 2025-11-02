import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { getAvailableWeeks } from '@/lib/utils';

interface DriverSettlement {
  driverId: string;
  driverName: string;
  fleetName: string;
  periodFrom: string;
  periodTo: string;
  totalEarnings: number;
  rentalFee: number;
  fuelCost: number;
  payout: number;
  status: string;
}

export function DriverSettlementsView() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [settlements, setSettlements] = useState<DriverSettlement[]>([]);
  const [fleetFilter, setFleetFilter] = useState<string>('all');
  const [fleets, setFleets] = useState<Array<{ id: string; name: string }>>([]);

  // Use shared week list (newest first without future weeks)
  const weeks = getAvailableWeeks(selectedYear);

  useEffect(() => {
    if (weeks.length) {
      setSelectedWeek(weeks[0].number.toString());
    }
  }, [selectedYear]);

  useEffect(() => {
    fetchFleets();
  }, []);

  useEffect(() => {
    if (selectedWeek) {
      fetchSettlements();
    }
  }, [selectedWeek, fleetFilter]);

  const fetchFleets = async () => {
    const { data } = await supabase.from('fleets').select('id, name').order('name');
    setFleets(data || []);
  };

  const fetchSettlements = async () => {
    setLoading(true);
    try {
      const weekData = weeks.find(w => w.number.toString() === selectedWeek);
      if (!weekData) return;

      let query = supabase
        .from('settlements')
        .select(`
          *,
          drivers!inner(id, first_name, last_name, fleet_id),
          fleets:drivers(fleet_id, fleets(name))
        `)
        .gte('period_from', weekData.start)
        .lte('period_to', weekData.end);

      if (fleetFilter !== 'all') {
        query = query.eq('drivers.fleet_id', fleetFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Get fuel costs
      const { data: fuelData } = await supabase
        .from('fuel_transactions')
        .select('card_number, total_amount')
        .gte('transaction_date', weekData.start)
        .lte('transaction_date', weekData.end);

      const fuelByCard: Record<string, number> = {};
      (fuelData || []).forEach(f => {
        if (f.card_number) {
          fuelByCard[f.card_number] = (fuelByCard[f.card_number] || 0) + (f.total_amount || 0);
        }
      });

      const settlementsData: DriverSettlement[] = (data || []).map((s: any) => {
        const driver = s.drivers;
        const fuelCost = driver.fuel_card_number ? (fuelByCard[driver.fuel_card_number] || 0) : 0;
        
        return {
          driverId: s.driver_id,
          driverName: `${driver.first_name} ${driver.last_name}`,
          fleetName: driver.fleet_id ? 'Flota' : 'Bez floty',
          periodFrom: s.period_from,
          periodTo: s.period_to,
          totalEarnings: s.total_earnings || 0,
          rentalFee: s.rental_fee || 0,
          fuelCost,
          payout: s.actual_payout || 0,
          status: s.actual_payout > 0 ? 'do_wyplaty' : 'rozliczone',
        };
      });

      setSettlements(settlementsData);
    } catch (error) {
      console.error('Error fetching settlements:', error);
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

  const getStatusBadge = (status: string) => {
    if (status === 'do_wyplaty') {
      return <Badge variant="default">Do wypłaty</Badge>;
    }
    return <Badge variant="secondary">Rozliczone</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rozliczenia kierowców</CardTitle>
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

          <Select value={fleetFilter} onValueChange={setFleetFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Wszystkie floty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie floty</SelectItem>
              {fleets.map(fleet => (
                <SelectItem key={fleet.id} value={fleet.id}>{fleet.name}</SelectItem>
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
        ) : settlements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Kierowca</th>
                  <th className="text-left p-2">Flota</th>
                  <th className="text-left p-2">Okres</th>
                  <th className="text-right p-2">Przychody</th>
                  <th className="text-right p-2">Wynajem</th>
                  <th className="text-right p-2">Paliwo</th>
                  <th className="text-right p-2">Wypłata</th>
                  <th className="text-center p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((settlement, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/50">
                    <td className="p-2">{settlement.driverName}</td>
                    <td className="p-2">{settlement.fleetName}</td>
                    <td className="p-2 text-sm text-muted-foreground">
                      {format(new Date(settlement.periodFrom), 'dd.MM', { locale: pl })} - {format(new Date(settlement.periodTo), 'dd.MM', { locale: pl })}
                    </td>
                    <td className="p-2 text-right">{formatCurrency(settlement.totalEarnings)}</td>
                    <td className="p-2 text-right">{formatCurrency(settlement.rentalFee)}</td>
                    <td className="p-2 text-right">{formatCurrency(settlement.fuelCost)}</td>
                    <td className="p-2 text-right font-semibold">{formatCurrency(settlement.payout)}</td>
                    <td className="p-2 text-center">{getStatusBadge(settlement.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Brak rozliczeń dla wybranego okresu
          </div>
        )}
      </CardContent>
    </Card>
  );
}
