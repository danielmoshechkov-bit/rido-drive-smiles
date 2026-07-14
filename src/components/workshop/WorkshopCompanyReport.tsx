import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Printer } from 'lucide-react';
import { format } from 'date-fns';
import { WorkshopRangeCalendar } from './WorkshopRangeCalendar';
import { useWorkshopOrders, useWorkshopStatuses } from '@/hooks/useWorkshop';
import { useWorkshopCashData, useWorkshopRecurringCosts } from '@/hooks/useWorkshopFinance';
import { computeOrderTotals } from '@/utils/workshopOrderTotals';
import { printHtmlDocument } from '@/utils/invoiceHtmlGenerator';
import { buildCompanyReportHtml } from '@/utils/workshopCompanyReportHtml';

const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const startOfMonth = () => format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');
const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const dpart = (s?: string) => (s ? String(s).slice(0, 10) : '');
const inRange = (d: string, from: string, to: string) => !!d && d >= from && d <= to;
const orderGross = (o: any) => computeOrderTotals(o.items).total_gross || o.total_gross || 0;

// Rozpoznanie czynszu po nazwie opłaty (brak dedykowanej kategorii w DB).
// Degraduje łagodnie: jeśli nic nie pasuje, czynsz=0 a kwota i tak jest w "Opłaty stałe",
// więc suma kosztów pozostaje poprawna. Lista słów do łatwej korekty.
const RENT_KEYWORDS = ['czynsz', 'najem', 'wynajem'];
const isRent = (e: any) => {
  const hay = `${e.subcategory || ''} ${e.description || ''}`.toLowerCase();
  return RENT_KEYWORDS.some((k) => hay.includes(k));
};

export function WorkshopCompanyReport({ providerId }: { providerId: string }) {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayStr());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(['Zakończone']));

  // view 'all' — domyślny widok 'active' (PERF C2) wyklucza „Zakończone" serwerowo,
  // a memoriał liczy domyślnie właśnie zakończone zlecenia.
  const { data: orders = [] } = useWorkshopOrders(providerId, { view: 'all' });
  const { data: statuses = [] } = useWorkshopStatuses(providerId);
  const { data: cash } = useWorkshopCashData(providerId);
  const { data: recurringCosts = [] } = useWorkshopRecurringCosts(providerId);
  const { data: provider } = useQuery({
    queryKey: ['workshop-provider-name', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('service_providers').select('company_name, short_name').eq('id', providerId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const payments = ((cash?.payments || []) as any[]).filter((p) => !p.voided);
  const expenses = ((cash?.expenses || []) as any[]).filter((e) => !e.voided);
  const payouts = ((cash?.payouts || []) as any[]).filter((p) => !p.voided);

  const toggleStatus = (name: string) => {
    const next = new Set(selectedStatuses);
    next.has(name) ? next.delete(name) : next.add(name);
    setSelectedStatuses(next);
  };

  const calc = useMemo(() => {
    // ── Przychody ──
    const cashIn = payments.filter((p) => inRange(dpart(p.paid_at), from, to)).reduce((s, p) => s + Number(p.amount || 0), 0);
    // Memoriał: zlecenia wg wybranych statusów (puste = wszystkie), data zakończenia lub utworzenia.
    const orderBasis = (o: any) => dpart(o.completed_at || o.created_at);
    const memoOrders = (orders as any[]).filter((o) => {
      if (!inRange(orderBasis(o), from, to)) return false;
      if (selectedStatuses.size > 0 && !selectedStatuses.has(o.status_name)) return false;
      return true;
    });
    const ordersIncome = memoOrders.reduce((s, o) => s + orderGross(o), 0);

    // ── Koszty pracownicze: wypłaty + zaliczki + premie (realne, !voided) ──
    const payoutInRange = payouts.filter((p) => inRange(dpart(p.paid_at), from, to));
    const sumType = (t: string) => payoutInRange.filter((p) => p.type === t).reduce((s, p) => s + Number(p.amount || 0), 0);
    const lb = { wyplaty: sumType('wyplata'), zaliczki: sumType('zaliczka'), premie: sumType('premia') };
    const labor = lb.wyplaty + lb.zaliczki + lb.premie;

    // ── Wydatki wg kategorii (realne, w okresie) ──
    const expInRange = expenses.filter((e) => inRange(dpart(e.expense_date), from, to));
    const sumExp = (pred: (e: any) => boolean) => expInRange.filter(pred).reduce((s, e) => s + Number(e.amount || 0), 0);
    const rent = sumExp((e) => e.category === 'oplata' && isRent(e));
    const fixedOther = sumExp((e) => e.category === 'oplata' && !isRent(e));
    const purchases = sumExp((e) => e.category === 'zakup');
    const ownerDraw = sumExp((e) => e.category === 'wyplata');
    const commissions = 0; // placeholder — prowizje portalu GetRido (brak danych w DB)

    const totalCosts = labor + rent + fixedOther + purchases + ownerDraw + commissions;

    // ── Planowane opłaty stałe na okres (memoriał, info) ──
    const days = Math.max(1, Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000) + 1);
    const monthlyFixed = (recurringCosts as any[])
      .filter((c) => c.active)
      .reduce((s, c) => s + Number(c.amount || 0) * (c.frequency === 'weekly' ? 4.33 : 1), 0);
    const plannedFixed = Math.round((monthlyFixed / 30.44) * days * 100) / 100;

    return {
      cashIn, ordersIncome, labor, lb, rent, fixedOther, purchases, ownerDraw, commissions, totalCosts,
      plannedFixed,
      resultCash: Math.round((cashIn - totalCosts) * 100) / 100,
      resultAccrual: Math.round((ordersIncome - totalCosts) * 100) / 100,
    };
  }, [payments, expenses, payouts, orders, recurringCosts, from, to, selectedStatuses]);

  const statusLabel = selectedStatuses.size > 0 ? Array.from(selectedStatuses).join(', ') : 'wszystkie';
  const workshopName = (provider?.short_name || provider?.company_name || 'Warsztat') as string;

  const handlePrint = () => {
    printHtmlDocument(buildCompanyReportHtml({
      workshopName,
      periodFrom: format(new Date(from + 'T00:00:00'), 'dd.MM.yyyy'),
      periodTo: format(new Date(to + 'T00:00:00'), 'dd.MM.yyyy'),
      generatedAt: format(new Date(), 'dd.MM.yyyy HH:mm'),
      statusLabel,
      income: { cash: calc.cashIn, orders: calc.ordersIncome },
      costs: {
        labor: calc.labor, rent: calc.rent, fixedOther: calc.fixedOther,
        purchases: calc.purchases, ownerDraw: calc.ownerDraw, commissions: calc.commissions, total: calc.totalCosts,
      },
      laborBreakdown: calc.lb,
      plannedFixed: calc.plannedFixed,
      resultCash: calc.resultCash,
      resultAccrual: calc.resultAccrual,
    }));
  };

  const CostRow = ({ label, value, sub, strong }: { label: string; value: number; sub?: string; strong?: boolean }) => (
    <div className={`flex items-baseline justify-between py-1.5 ${strong ? 'border-t font-semibold' : 'border-b border-border/50'}`}>
      <span className="text-sm">{label}{sub && <span className="block text-xs text-muted-foreground">{sub}</span>}</span>
      <span className="tabular-nums font-medium">{fmt(value)}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Filtry */}
      <Card>
        <CardContent className="py-4 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label>Okres</Label>
              <WorkshopRangeCalendar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
            </div>
            <Button variant="outline" className="gap-1" onClick={handlePrint}>
              <Printer className="h-4 w-4" /> Drukuj / PDF
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>Przychód ze zleceń wg statusów <span className="text-muted-foreground font-normal">(puste = wszystkie; dot. tylko wyniku memoriałowego)</span></Label>
            <div className="flex flex-wrap gap-1.5">
              {(statuses as any[]).map((s) => {
                const on = selectedStatuses.has(s.name);
                return (
                  <Badge key={s.id} onClick={() => toggleStatus(s.name)}
                    className={`cursor-pointer ${on ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/70'}`}>
                    {s.name}
                  </Badge>
                );
              })}
              {selectedStatuses.size > 0 && <Badge variant="outline" className="cursor-pointer" onClick={() => setSelectedStatuses(new Set())}>× wyczyść</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Przychody */}
      <Card>
        <CardContent className="py-4">
          <h3 className="font-semibold mb-2">Przychody</h3>
          <CostRow label="Realne wpływy (Kasa)" value={calc.cashIn} />
          <CostRow label="Przychód ze zleceń (wartość zleceń — memoriał)" value={calc.ordersIncome} />
        </CardContent>
      </Card>

      {/* Koszty */}
      <Card>
        <CardContent className="py-4">
          <h3 className="font-semibold mb-2">Koszty</h3>
          <CostRow label="Koszty pracownicze (wypłaty + zaliczki + premie)" value={calc.labor}
            sub={`wypłaty: ${fmt(calc.lb.wyplaty)} · zaliczki: ${fmt(calc.lb.zaliczki)} · premie: ${fmt(calc.lb.premie)}`} />
          <CostRow label="Czynsz" value={calc.rent} />
          <CostRow label="Opłaty stałe (media, abonamenty itp.)" value={calc.fixedOther} />
          <CostRow label="Zakupy / wydatki" value={calc.purchases} />
          <CostRow label="Wypłaty z kasy / właściciela" value={calc.ownerDraw} />
          <CostRow label="Prowizje portalu GetRido" value={calc.commissions} />
          <CostRow label="Razem koszty" value={calc.totalCosts} strong />
          <p className="text-xs text-muted-foreground mt-2">Planowane opłaty stałe na okres (memoriał, poza wynikiem): {fmt(calc.plannedFixed)}</p>
        </CardContent>
      </Card>

      {/* Wyniki */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card><CardContent className="py-4">
          <p className="text-xs text-muted-foreground">Wynik kasowy (realny)</p>
          <p className={`text-2xl font-bold tabular-nums ${calc.resultCash >= 0 ? 'text-green-600' : 'text-destructive'}`}>{fmt(calc.resultCash)}</p>
          <p className="text-xs text-muted-foreground mt-1">Realne wpływy − wszystkie koszty</p>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <p className="text-xs text-muted-foreground">Wynik ze zleceń (memoriał)</p>
          <p className={`text-2xl font-bold tabular-nums ${calc.resultAccrual >= 0 ? 'text-green-600' : 'text-destructive'}`}>{fmt(calc.resultAccrual)}</p>
          <p className="text-xs text-muted-foreground mt-1">Przychód ze zleceń − wszystkie koszty</p>
        </CardContent></Card>
      </div>
    </div>
  );
}
