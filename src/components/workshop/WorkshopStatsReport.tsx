import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { WorkshopRangeCalendar } from './WorkshopRangeCalendar';
import { useWorkshopOrders } from '@/hooks/useWorkshop';
import { computeOrderTotals, safeNumber } from '@/utils/workshopOrderTotals';
import { format } from 'date-fns';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => Math.round(n || 0).toLocaleString('pl-PL');
const startOfMonth = () => format(new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1), 'yyyy-MM-dd'); // domyślnie ostatnie ~6 mies.
const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const dpart = (s?: string) => (s ? String(s).slice(0, 10) : '');
const orderGross = (o: any) => computeOrderTotals(o.items).total_gross || o.total_gross || 0;
const orderCost = (o: any) => (o.items || []).reduce((s: number, i: any) => s + safeNumber(i.unit_cost_gross) * (safeNumber(i.quantity) || 1) + safeNumber(i.labor_cost), 0);

// KPI — pojedynczy kafelek metryki.
function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card><CardContent className="py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </CardContent></Card>
  );
}

export function WorkshopStatsReport({ providerId }: { providerId: string }) {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayStr());
  const { data: orders = [] } = useWorkshopOrders(providerId);

  const stats = useMemo(() => {
    const all = orders as any[];
    const inPeriod = (o: any) => { const d = dpart(o.created_at); return !!d && d >= from && d <= to; };

    // Pierwsze zlecenie każdego klienta (cała historia) — do podziału nowi/powracający.
    const firstByClient: Record<string, string> = {};
    all.forEach((o) => {
      if (!o.client_id) return;
      const d = dpart(o.created_at);
      if (!d) return;
      if (!firstByClient[o.client_id] || d < firstByClient[o.client_id]) firstByClient[o.client_id] = d;
    });

    const periodOrders = all.filter(inPeriod);
    const count = periodOrders.length;
    const totalRevenue = periodOrders.reduce((s, o) => s + orderGross(o), 0);
    const totalCost = periodOrders.reduce((s, o) => s + orderCost(o), 0);
    const totalProfit = totalRevenue - totalCost;
    const avgValue = count > 0 ? totalRevenue / count : 0;
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // Nowi vs powracający — po kliencie (klient liczony raz w okresie).
    const clientsInPeriod = new Set(periodOrders.map((o) => o.client_id).filter(Boolean));
    let newClients = 0, returning = 0;
    clientsInPeriod.forEach((cid) => {
      (firstByClient[cid as string] >= from && firstByClient[cid as string] <= to) ? newClients++ : returning++;
    });

    // Szereg czasowy wg miesiąca (YYYY-MM) — przychód + liczba zleceń.
    const byMonth: Record<string, { month: string; revenue: number; count: number }> = {};
    periodOrders.forEach((o) => {
      const m = dpart(o.created_at).slice(0, 7);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { month: m, revenue: 0, count: 0 };
      byMonth[m].revenue += orderGross(o);
      byMonth[m].count += 1;
    });
    const timeline = Object.values(byMonth).sort((a, b) => (a.month < b.month ? -1 : 1));

    return {
      count, totalRevenue, totalProfit, avgValue, avgMargin, newClients, returning,
      timeline,
      clientsSplit: [
        { name: 'Nowi', value: newClients },
        { name: 'Powracający', value: returning },
      ],
    };
  }, [orders, from, to]);

  const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--muted-foreground))'];
  const hasData = stats.count > 0;

  return (
    <div className="space-y-4">
      {/* Okres */}
      <Card><CardContent className="py-3 flex items-center gap-3">
        <Label className="text-sm">Okres</Label>
        <WorkshopRangeCalendar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </CardContent></Card>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Liczba zleceń" value={fmt0(stats.count)} />
        <Kpi label="Śr. wartość zlecenia" value={fmt(stats.avgValue)} />
        <Kpi label="Śr. marża" value={`${fmt(stats.avgMargin)}%`} sub={`Zysk ${fmt(stats.totalProfit)}`} />
        <Kpi label="Nowi klienci" value={fmt0(stats.newClients)} />
        <Kpi label="Powracający" value={fmt0(stats.returning)} />
      </div>

      {!hasData ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Brak zleceń w wybranym okresie.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Przychód + zlecenia w czasie */}
          <Card className="lg:col-span-2"><CardContent className="py-4">
            <h3 className="font-semibold mb-3 text-sm">Przychód i liczba zleceń w czasie</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.timeline} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="rev" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="cnt" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} />
                <ReTooltip formatter={(v: any, n: any) => (n === 'revenue' ? [fmt(Number(v)), 'Przychód'] : [fmt0(Number(v)), 'Zleceń'])} labelStyle={{ color: '#111' }} />
                <Bar yAxisId="rev" dataKey="revenue" name="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="cnt" dataKey="count" name="count" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent></Card>

          {/* Nowi vs powracający */}
          <Card><CardContent className="py-4">
            <h3 className="font-semibold mb-3 text-sm">Nowi vs powracający klienci</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={stats.clientsSplit} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={(e: any) => `${e.name}: ${e.value}`}>
                  {stats.clientsSplit.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Legend />
                <ReTooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </div>
      )}

      <p className="text-xs text-muted-foreground">Metryki liczone wg daty utworzenia zlecenia. Strukturę można rozbudowywać o kolejne wskaźniki.</p>
    </div>
  );
}
