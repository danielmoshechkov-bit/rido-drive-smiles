import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { WorkshopRangeCalendar } from './WorkshopRangeCalendar';
import { useWorkshopOrders } from '@/hooks/useWorkshop';
import { useWorkshopPayouts } from '@/hooks/useWorkshopFinance';
import { computeOrderTotals, safeNumber } from '@/utils/workshopOrderTotals';
import { format } from 'date-fns';

const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const startOfMonth = () => format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');
const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const dpart = (s?: string) => (s ? String(s).slice(0, 10) : '');
const clientName = (c: any) => !c ? '—' : (c.client_type === 'company' ? c.company_name : `${c.first_name || ''} ${c.last_name || ''}`.trim());
const orderGross = (o: any) => computeOrderTotals(o.items).total_gross || o.total_gross || 0;

function PeriodBar({ from, to, onChange }: { from: string; to: string; onChange: (f: string, t: string) => void }) {
  return (
    <Card><CardContent className="py-3 flex items-center gap-3">
      <Label className="text-sm">Okres</Label>
      <WorkshopRangeCalendar from={from} to={to} onChange={onChange} />
    </CardContent></Card>
  );
}

// ── KLIENCI ──
export function WorkshopClientsReport({ providerId }: { providerId: string }) {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayStr());
  const { data: orders = [] } = useWorkshopOrders(providerId);

  const data = useMemo(() => {
    const inPeriod = (o: any) => dpart(o.created_at) >= from && dpart(o.created_at) <= to;
    const firstOrderByClient: Record<string, string> = {};
    const totalCountByClient: Record<string, number> = {};
    (orders as any[]).forEach((o) => {
      if (!o.client_id) return;
      const d = dpart(o.created_at);
      if (!firstOrderByClient[o.client_id] || d < firstOrderByClient[o.client_id]) firstOrderByClient[o.client_id] = d;
      totalCountByClient[o.client_id] = (totalCountByClient[o.client_id] || 0) + 1;
    });
    const periodOrders = (orders as any[]).filter(inPeriod);
    const byClient: Record<string, { client: any; count: number; revenue: number }> = {};
    periodOrders.forEach((o) => {
      if (!o.client_id) return;
      byClient[o.client_id] = byClient[o.client_id] || { client: o.client, count: 0, revenue: 0 };
      byClient[o.client_id].count++; byClient[o.client_id].revenue += orderGross(o);
    });
    const rows = Object.entries(byClient).map(([id, v]) => ({ id, ...v }));
    const nowi = rows.filter((r) => firstOrderByClient[r.id] >= from && firstOrderByClient[r.id] <= to).length;
    const powracajacy = rows.filter((r) => (totalCountByClient[r.id] || 0) > 1).length;
    return { rows: rows.sort((a, b) => b.revenue - a.revenue), nowi, powracajacy, total: rows.length };
  }, [orders, from, to]);

  return (
    <div className="space-y-4">
      <PeriodBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground">Nowi klienci</p><p className="text-xl font-bold">{data.nowi}</p></CardContent></Card>
        <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground">Powracający (&gt;1 zlecenie)</p><p className="text-xl font-bold">{data.powracajacy}</p></CardContent></Card>
        <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground">Klientów w okresie</p><p className="text-xl font-bold">{data.total}</p></CardContent></Card>
      </div>
      <Card><CardContent className="py-2">
        <Table>
          <TableHeader><TableRow><TableHead>Klient</TableHead><TableHead className="text-right">Zleceń</TableHead><TableHead className="text-right">Wydał (przychód)</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.rows.slice(0, 20).map((r) => (
              <TableRow key={r.id}><TableCell>{clientName(r.client)}</TableCell><TableCell className="text-right tabular-nums">{r.count}</TableCell><TableCell className="text-right tabular-nums font-medium">{fmt(r.revenue)}</TableCell></TableRow>
            ))}
            {data.rows.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Brak danych w okresie.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

// ── PRACOWNICY ──
export function WorkshopEmployeesReport({ providerId }: { providerId: string }) {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayStr());
  const { data: orders = [] } = useWorkshopOrders(providerId);
  const { data: payouts = [] } = useWorkshopPayouts(providerId, { from, to });
  const { data: employees = [] } = useQuery({
    queryKey: ['workshop-emp-report', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('workshop_employees').select('id, name').eq('provider_id', providerId).eq('is_active', true).order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const rows = useMemo(() => {
    const inPeriod = (o: any) => dpart(o.created_at) >= from && dpart(o.created_at) <= to;
    const periodOrders = (orders as any[]).filter(inPeriod);
    return (employees as any[]).map((e) => {
      // Przypisanie robi się w Terminarzu (assigned_employee_id -> workshop_employees).
      // Stare `mechanic_id` wskazuje na nieużywaną tabelę workshop_mechanics.
      const eo = periodOrders.filter((o) => o.assigned_employee_id === e.id);
      const value = eo.reduce((s, o) => s + orderGross(o), 0);
      const paid = (payouts as any[]).filter((p) => p.employee_id === e.id && !p.voided).reduce((s, p) => s + safeNumber(p.amount), 0);
      return { e, count: eo.length, value, paid };
    });
  }, [employees, orders, payouts, from, to]);

  return (
    <div className="space-y-4">
      <PeriodBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      <Card><CardContent className="py-2">
        <Table>
          <TableHeader><TableRow><TableHead>Pracownik</TableHead><TableHead className="text-right">Zleceń</TableHead><TableHead className="text-right">Wartość zleceń</TableHead><TableHead className="text-right">Wypłacono</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.e.id}><TableCell className="font-medium">{r.e.name}</TableCell><TableCell className="text-right tabular-nums">{r.count}</TableCell><TableCell className="text-right tabular-nums">{fmt(r.value)}</TableCell><TableCell className="text-right tabular-nums">{fmt(r.paid)}</TableCell></TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Brak aktywnych pracowników.</TableCell></TableRow>}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground mt-2">„Zleceń/wartość" liczone wg pracownika przypisanego do zlecenia w Terminarzu. „Wypłacono" z modułu płac (wypłaty/zaliczki/premie).</p>
      </CardContent></Card>
    </div>
  );
}

// ── SPRZEDAŻ (faktury) ──
export function WorkshopSalesReport({ providerId: _providerId }: { providerId: string }) {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayStr());
  const { data: invoices = [] } = useQuery({
    queryKey: ['workshop-sales-report'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await (supabase as any).from('user_invoices').select('invoice_number, issue_date, gross_total').eq('user_id', user.id).neq('invoice_type', 'cost');
      if (error) throw error;
      return data || [];
    },
  });

  const data = useMemo(() => {
    const list = (invoices as any[]).filter((d) => dpart(d.issue_date) >= from && dpart(d.issue_date) <= to);
    const turnover = list.reduce((s, d) => s + safeNumber(d.gross_total), 0);
    const byMonth: Record<string, number> = {};
    list.forEach((d) => { const m = String(d.issue_date).slice(0, 7); byMonth[m] = (byMonth[m] || 0) + safeNumber(d.gross_total); });
    return { count: list.length, turnover, avg: list.length ? turnover / list.length : 0, months: Object.entries(byMonth).sort() };
  }, [invoices, from, to]);

  return (
    <div className="space-y-4">
      <PeriodBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground">Obrót</p><p className="text-xl font-bold tabular-nums">{fmt(data.turnover)} zł</p></CardContent></Card>
        <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground">Liczba faktur</p><p className="text-xl font-bold">{data.count}</p></CardContent></Card>
        <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground">Średnia wartość</p><p className="text-xl font-bold tabular-nums">{fmt(data.avg)} zł</p></CardContent></Card>
      </div>
      <Card><CardContent className="py-2">
        <Table>
          <TableHeader><TableRow><TableHead>Miesiąc</TableHead><TableHead className="text-right">Obrót</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.months.map(([m, v]) => (<TableRow key={m}><TableCell className="tabular-nums">{m}</TableCell><TableCell className="text-right tabular-nums font-medium">{fmt(v)}</TableCell></TableRow>))}
            {data.months.length === 0 && <TableRow><TableCell colSpan={2} className="text-center py-6 text-muted-foreground">Brak faktur w okresie.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
