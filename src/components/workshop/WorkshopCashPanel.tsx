import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Banknote, CreditCard, TrendingUp, TrendingDown, Wallet, ArrowDownCircle, ArrowUpCircle, ShoppingCart, Receipt, AlertCircle, Lock, Pencil, Ban, Trash2 } from 'lucide-react';
import { WorkshopRangeCalendar } from './WorkshopRangeCalendar';
import { WorkshopCashEntryDialog } from './WorkshopCashEntryDialog';
import { WorkshopExpenseDialog } from './WorkshopExpenseDialog';
import { WorkshopBreakdownDialog, type BreakdownRow } from './WorkshopBreakdownDialog';
import { WorkshopMonthCloseDialog, type ClosureSummary } from './WorkshopMonthCloseDialog';
import { WorkshopVoidDialog, WorkshopOpEditDialog, type CashOp } from './WorkshopOpDialogs';
import { useWorkshopCashData, useWorkshopFinanceSettings, useSaveFinanceSettings, useCashClosures, useCreateCashClosure, useDeleteCashClosure, useWorkshopRecurringCosts, recurringReminderLevel, PAYMENT_METHODS, EXPENSE_CATEGORIES, type PaymentMethod, type ExpenseCategory } from '@/hooks/useWorkshopFinance';
import { useWorkshopOrders } from '@/hooks/useWorkshop';
import { computeOrderTotals, safeNumber } from '@/utils/workshopOrderTotals';

interface Props {
  providerId: string;
}

const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
function startOfWeek() { const d = new Date(); const iso = d.getDay() === 0 ? 7 : d.getDay(); d.setDate(d.getDate() - (iso - 1)); return d.toISOString().slice(0, 10); }
const dpart = (s?: string) => (s ? String(s).slice(0, 10) : '');
const inRange = (date: string, from: string, to: string) => date >= from && date <= to;
const sum = (arr: any[], pred?: (x: any) => boolean) => arr.filter(pred || (() => true)).reduce((s, x) => s + Number(x.amount || 0), 0);

export function WorkshopCashPanel({ providerId }: Props) {
  const { data } = useWorkshopCashData(providerId);
  const { data: settings } = useWorkshopFinanceSettings(providerId);
  const cashEnabled = !!settings?.cash_enabled;
  // Cutoff po momencie włączenia/resetu — porównanie po created_at (TIMESTAMP), nie po
  // dacie. Dzięki temu reset (cash_started_at = now()) zeruje kasę NATYCHMIAST (operacje
  // sprzed kliknięcia, także z dziś, wypadają od razu).
  const startMs = settings?.cash_started_at ? new Date(settings.cash_started_at).getTime() : 0;
  const afterStart = (createdAt?: string) => !startMs || (createdAt ? new Date(createdAt).getTime() > startMs : false);
  // raw* = wszystkie od startu (z anulowanymi, do feedu); bez "raw" = do obliczeń
  // (storno wykluczone z sald/przepływu/podsumowań).
  const rawPayments = (data?.payments || []).filter((p: any) => afterStart(p.created_at));
  const rawExpenses = (data?.expenses || []).filter((e: any) => afterStart(e.created_at));
  const rawPayouts = (data?.payouts || []).filter((p: any) => afterStart(p.created_at));
  const payments = rawPayments.filter((p: any) => !p.voided);
  const expenses = rawExpenses.filter((e: any) => !e.voided);
  const payouts = rawPayouts.filter((p: any) => !p.voided);
  const { data: orders = [] } = useWorkshopOrders(providerId);
  const { data: recurringCosts = [] } = useWorkshopRecurringCosts(providerId);

  const [from, setFrom] = useState(startOfWeek());
  const [to, setTo] = useState(today());
  const [cashIn, setCashIn] = useState(false);
  const [expenseCat, setExpenseCat] = useState<ExpenseCategory | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeMonth, setCloseMonth] = useState(() => new Date().toISOString().slice(0, 7)); // 'YYYY-MM'
  const [breakdown, setBreakdown] = useState<{ title: string; rows: BreakdownRow[] } | null>(null);
  const [showAllOps, setShowAllOps] = useState(false);
  const [voidOp, setVoidOp] = useState<CashOp | null>(null);
  const [editOp, setEditOp] = useState<CashOp | null>(null);
  const saveSettings = useSaveFinanceSettings();
  const createClosure = useCreateCashClosure();
  const deleteClosure = useDeleteCashClosure();
  const { data: closures = [] } = useCashClosures(providerId);

  // ── Skumulowane saldo (CAŁA historia, niezależnie od okresu) ──
  const payByMethod = (m: PaymentMethod) => sum(payments, (p) => p.method === m);
  const expByMethod = (m: PaymentMethod) => sum(expenses, (e) => e.method === m);
  const payoutsAll = sum(payouts, (p) => p.type === 'zaliczka' || p.type === 'wyplata');
  const cashGotowka = payByMethod('gotowka') - expByMethod('gotowka') - payoutsAll; // wypłaty zwykle z gotówki
  const cashKonto = (['karta', 'blik', 'przelew'] as PaymentMethod[]).reduce((s, m) => s + payByMethod(m) - expByMethod(m), 0);

  // ── Dziś ──
  const t0 = today();
  const dayIn = sum(payments, (p) => dpart(p.paid_at) === t0);
  const dayOut = sum(expenses, (e) => dpart(e.expense_date) === t0) + sum(payouts, (p) => (p.type === 'zaliczka' || p.type === 'wyplata') && dpart(p.paid_at) === t0);
  const dayInByMethod = (m: PaymentMethod) => sum(payments, (p) => p.method === m && dpart(p.paid_at) === t0);

  // ── Pulpit dnia ──
  const ordersInProgress = (orders as any[]).filter((o) => o.status_name !== 'Zakończone' && o.status_name !== 'Gotowy do odbioru' && o.status_name !== 'Nowe zlecenie').length;
  const ordersReady = (orders as any[]).filter((o) => o.status_name === 'Gotowy do odbioru').length;
  const upcomingFees = (recurringCosts as any[])
    .filter((c) => c.active && recurringReminderLevel(c.next_due_date) !== 'none')
    .sort((a, b) => (a.next_due_date < b.next_due_date ? -1 : 1));

  // ── Okres ──
  const periodIn = sum(payments, (p) => inRange(dpart(p.paid_at), from, to));
  const periodExp = sum(expenses, (e) => inRange(dpart(e.expense_date), from, to));
  const periodPayouts = sum(payouts, (p) => (p.type === 'zaliczka' || p.type === 'wyplata') && inRange(dpart(p.paid_at), from, to));
  const periodOut = periodExp + periodPayouts;
  const periodResult = Math.round((periodIn - periodOut) * 100) / 100;
  const periodByMethod = (m: PaymentMethod) => sum(payments, (p) => p.method === m && inRange(dpart(p.paid_at), from, to));
  const periodExpByCat = (c: string) => sum(expenses, (e) => e.category === c && inRange(dpart(e.expense_date), from, to));
  // Drill-down: pozycje składające się na wpływy/wydatki okresu (realna kasa).
  const methodLabel = (m: string) => PAYMENT_METHODS.find((x) => x.value === m)?.label || m || '—';
  const inflowRows = (): BreakdownRow[] => payments
    .filter((p: any) => inRange(dpart(p.paid_at), from, to))
    .map((p: any) => ({ date: dpart(p.paid_at), label: methodLabel(p.method) + (p.order_id ? ' · zlecenie' : ''), amount: Number(p.amount || 0) }))
    .sort((a, b) => (a.date! < b.date! ? 1 : -1));
  const outflowRows = (): BreakdownRow[] => [
    ...expenses.filter((e: any) => inRange(dpart(e.expense_date), from, to)).map((e: any) => ({ date: dpart(e.expense_date), label: (EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label || e.category) + (e.subcategory ? ` · ${e.subcategory}` : ''), amount: Number(e.amount || 0) })),
    ...payouts.filter((p: any) => (p.type === 'zaliczka' || p.type === 'wyplata') && inRange(dpart(p.paid_at), from, to)).map((p: any) => ({ date: dpart(p.paid_at), label: `${p.type === 'zaliczka' ? 'Zaliczka' : 'Wypłata'}${p.employee?.name ? ' — ' + p.employee.name : ''}`, amount: Number(p.amount || 0) })),
  ].sort((a, b) => (a.date! < b.date! ? 1 : -1));

  // ── Należności do pobrania (zlecenia zakończone, Σpłatności < kwota) ──
  const receivables = useMemo(() => {
    const paidByOrder: Record<string, number> = {};
    payments.forEach((p: any) => { if (p.order_id) paidByOrder[p.order_id] = (paidByOrder[p.order_id] || 0) + Number(p.amount || 0); });
    return (orders as any[])
      .filter((o) => o.status_name === 'Zakończone' && afterStart(o.created_at))
      .map((o) => {
        const gross = computeOrderTotals(o.items).total_gross || o.total_gross || 0;
        const paid = paidByOrder[o.id] || 0;
        return { o, gross, paid, due: Math.round((gross - paid) * 100) / 100 };
      })
      .filter((r) => r.due > 0.01)
      .sort((a, b) => b.due - a.due);
  }, [orders, payments]);
  const receivablesTotal = receivables.reduce((s, r) => s + r.due, 0);

  // ── Operacje (z anulowanymi — feed z akcjami Edytuj/Anuluj) ──
  const operations = useMemo(() => {
    const ops = [
      ...rawPayments.map((p: any) => ({ rec: p, type: 'payment' as const, date: dpart(p.paid_at), label: 'Wpłata' + (p.order_id ? ' (zlecenie)' : ''), amount: Number(p.amount || 0), sign: 1, method: p.method, who: p.created_by_name })),
      ...rawExpenses.map((e: any) => ({ rec: e, type: 'expense' as const, date: dpart(e.expense_date), label: (EXPENSE_CATEGORIES.find(c => c.value === e.category)?.label || e.category) + (e.subcategory ? ` · ${e.subcategory}` : ''), amount: Number(e.amount || 0), sign: -1, method: e.method, who: e.created_by_name })),
      ...rawPayouts.map((p: any) => ({ rec: p, type: 'payout' as const, date: dpart(p.paid_at), label: `${p.type === 'premia' ? 'Premia' : p.type === 'zaliczka' ? 'Zaliczka' : 'Wypłata'}${p.employee?.name ? ' — ' + p.employee.name : ''}`, amount: Number(p.amount || 0), sign: p.type === 'premia' ? 0 : -1, method: null, who: p.created_by_name })),
    ];
    return ops.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [rawPayments, rawExpenses, rawPayouts]);

  // ── Podsumowanie do zamknięcia: pełny MIESIĄC KALENDARZOWY (closeMonth = 'YYYY-MM') ──
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const monthFrom = `${closeMonth}-01`;
  // Ostatni dzień miesiąca LOKALNIE (bez toISOString → bez cofania o dzień przez UTC).
  const monthEnd = (() => {
    const [y, m] = closeMonth.split('-').map(Number);
    const d = new Date(y, m, 0); // dzień 0 następnego miesiąca = ostatni dzień bieżącego
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const inMonth = (d?: string) => { const x = dpart(d); return !!x && x >= monthFrom && x <= monthEnd; };
  const orderRevenue = (o: any) => computeOrderTotals(o.items).total_gross || o.total_gross || 0;
  const orderCost = (o: any) => (o.items || []).reduce((s: number, i: any) => s + safeNumber(i.unit_cost_gross) * (safeNumber(i.quantity) || 1) + safeNumber(i.labor_cost), 0);
  const monthOrders = (orders as any[]).filter((o) => o.status_name === 'Zakończone' && inMonth(o.completed_at || o.created_at));
  const monthPayments = (data?.payments || []).filter((p: any) => !p.voided && inMonth(p.paid_at));
  const monthExpenses = (data?.expenses || []).filter((e: any) => !e.voided && inMonth(e.expense_date));
  const monthPayouts = (data?.payouts || []).filter((p: any) => !p.voided && inMonth(p.paid_at));
  const cRevenue = monthOrders.reduce((s, o) => s + orderRevenue(o), 0);
  const cCost = monthOrders.reduce((s, o) => s + orderCost(o), 0);
  const cProfit = round2(cRevenue - cCost);
  const cInflow = monthPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const cExpenses = monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const cPay = monthPayouts.filter((p) => p.type === 'zaliczka' || p.type === 'wyplata').reduce((s, p) => s + Number(p.amount || 0), 0);
  const alreadyClosed = (closures as any[]).some((c) => dpart(c.period_from) === monthFrom);
  const closureSummary: ClosureSummary = {
    period_from: monthFrom,
    period_to: monthEnd,
    orders_count: monthOrders.length,
    revenue: round2(cRevenue),
    cost: round2(cCost),
    profit: cProfit,
    avg_margin: cRevenue > 0 ? round2((cProfit / cRevenue) * 100) : 0,
    expenses: round2(cExpenses),
    result: round2(cInflow - cExpenses - cPay),
    cash_end: round2(cashGotowka),
  };

  // ── Rozliczenie miesięcy NA ŻYWO (niezależne od zamknięcia) ──
  const monthSummary = (ym: string) => {
    const from = `${ym}-01`;
    const [y, m] = ym.split('-').map(Number);
    const ed = new Date(y, m, 0);
    const end = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`;
    const inM = (d?: string) => { const x = dpart(d); return !!x && x >= from && x <= end; };
    const ords = (orders as any[]).filter((o) => o.status_name === 'Zakończone' && inM(o.completed_at || o.created_at));
    const rev = ords.reduce((s, o) => s + orderRevenue(o), 0);
    const cost = ords.reduce((s, o) => s + orderCost(o), 0);
    const exp = (data?.expenses || []).filter((e: any) => !e.voided && inM(e.expense_date)).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const inflow = (data?.payments || []).filter((p: any) => !p.voided && inM(p.paid_at)).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const pay = (data?.payouts || []).filter((p: any) => !p.voided && (p.type === 'zaliczka' || p.type === 'wyplata') && inM(p.paid_at)).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const closed = (closures as any[]).find((c) => dpart(c.period_from) === from);
    return { ym, count: ords.length, rev: round2(rev), cost: round2(cost), profit: round2(rev - cost), margin: rev > 0 ? round2((rev - cost) / rev * 100) : 0, expenses: round2(exp), result: round2(inflow - exp - pay), closed };
  };
  const monthList = useMemo(() => {
    const set = new Set<string>();
    (data?.payments || []).forEach((p: any) => p.paid_at && set.add(dpart(p.paid_at).slice(0, 7)));
    (data?.expenses || []).forEach((e: any) => e.expense_date && set.add(dpart(e.expense_date).slice(0, 7)));
    (data?.payouts || []).forEach((p: any) => p.paid_at && set.add(dpart(p.paid_at).slice(0, 7)));
    (orders as any[]).forEach((o) => { const d = o.completed_at || o.created_at; if (d) set.add(dpart(d).slice(0, 7)); });
    set.add(today().slice(0, 7));
    return Array.from(set).filter(Boolean).sort().reverse().slice(0, 12);
  }, [data, orders]);

  const confirmClose = async () => {
    if (alreadyClosed) { return; }
    await createClosure.mutateAsync({ provider_id: providerId, ...closureSummary });
    // Reset kasy: przesunięcie startu (bez kasowania danych).
    await saveSettings.mutateAsync({
      provider_id: providerId,
      work_days: settings?.work_days ?? [1, 2, 3, 4, 5],
      work_start: settings?.work_start ?? '08:00',
      work_end: settings?.work_end ?? '16:00',
      cash_enabled: true,
      cash_started_at: new Date().toISOString(),
    });
    setCloseOpen(false);
  };

  if (!cashEnabled) {
    return (
      <Card><CardContent className="py-12 text-center space-y-2">
        <Wallet className="h-10 w-10 mx-auto text-muted-foreground" />
        <p className="font-semibold">Moduł Kasa nieaktywny</p>
        <p className="text-sm text-muted-foreground">Włącz go w Ustawieniach warsztatu (przełącznik „Moduł Kasa").<br />Kasa zacznie liczyć dopiero od momentu włączenia — bez mieszania danych historycznych.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pulpit dnia */}
      <Card><CardContent className="py-4">
        <h3 className="font-semibold mb-3">Pulpit dnia</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Dziś weszło</p>
            <p className="text-xl font-bold tabular-nums text-green-600">+{fmt(dayIn)} zł</p>
            <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
              {PAYMENT_METHODS.filter((m) => dayInByMethod(m.value) > 0).map((m) => (
                <div key={m.value} className="flex justify-between"><span>{m.label}</span><span className="tabular-nums">{fmt(dayInByMethod(m.value))}</span></div>
              ))}
            </div>
          </div>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Zlecenia w toku</p><p className="text-2xl font-bold">{ordersInProgress}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Czeka na odbiór</p><p className="text-2xl font-bold">{ordersReady}</p></div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Opłaty w tym tygodniu</p>
            {upcomingFees.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-1">Brak</p>
            ) : (
              <div className="space-y-0.5 mt-1">
                {upcomingFees.slice(0, 3).map((c) => {
                  const lvl = recurringReminderLevel(c.next_due_date);
                  const color = lvl === 'red' ? 'text-destructive' : lvl === 'yellow' ? 'text-yellow-600' : 'text-green-600';
                  return <div key={c.id} className="flex justify-between text-xs"><span className={color}>● {c.name}</span><span className="tabular-nums text-muted-foreground">{c.next_due_date}</span></div>;
                })}
              </div>
            )}
          </div>
        </div>
      </CardContent></Card>

      {/* Cumulative cash state — always visible */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="py-4 flex items-center gap-3">
          <Banknote className="h-7 w-7 text-green-600" />
          <div><p className="text-xs text-muted-foreground">Gotówka w kasie</p><p className="text-xl font-bold tabular-nums">{fmt(cashGotowka)} zł</p></div>
        </CardContent></Card>
        <Card><CardContent className="py-4 flex items-center gap-3">
          <CreditCard className="h-7 w-7 text-primary" />
          <div><p className="text-xs text-muted-foreground">Na koncie</p><p className="text-xl font-bold tabular-nums">{fmt(cashKonto)} zł</p></div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <p className="text-xs text-muted-foreground">Dziś</p>
          <p className="text-sm"><span className="text-green-600 tabular-nums">+{fmt(dayIn)}</span> / <span className="text-destructive tabular-nums">−{fmt(dayOut)}</span></p>
          <p className="text-lg font-bold tabular-nums">{fmt(dayIn - dayOut)} zł</p>
        </CardContent></Card>
        <Card className={receivablesTotal > 0 ? 'border-amber-400/50' : ''}><CardContent className="py-4 flex items-center gap-3">
          <AlertCircle className="h-7 w-7 text-amber-500" />
          <div><p className="text-xs text-muted-foreground">Do pobrania</p><p className="text-xl font-bold tabular-nums">{fmt(receivablesTotal)} zł</p></div>
        </CardContent></Card>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setCashIn(true)} className="gap-2 bg-green-600 hover:bg-green-700 text-white"><ArrowDownCircle className="h-4 w-4" /> Dodaj wpłatę</Button>
        <Button variant="destructive" onClick={() => setExpenseCat('wyplata')} className="gap-2"><ArrowUpCircle className="h-4 w-4" /> Dodaj wypłatę</Button>
        <Button variant="outline" onClick={() => setExpenseCat('zakup')} className="gap-2"><ShoppingCart className="h-4 w-4" /> Dodaj zakup</Button>
        <Button variant="outline" onClick={() => setExpenseCat('oplata')} className="gap-2"><Receipt className="h-4 w-4" /> Dodaj opłatę</Button>
        <div className="hidden md:block flex-1" />
        <Button variant="secondary" onClick={() => setCloseOpen(true)} className="gap-2"><Lock className="h-4 w-4" /> Zamknij miesiąc</Button>
      </div>

      {/* Period flow */}
      <Card><CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold">Przepływ okresu</h3>
          <WorkshopRangeCalendar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} align="end" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button type="button" onClick={() => setBreakdown({ title: 'Wpływy w okresie', rows: inflowRows() })} className="rounded-md border p-3 text-left cursor-pointer hover:bg-accent/50 transition-colors"><div className="flex items-center gap-1 text-green-600 text-sm"><TrendingUp className="h-4 w-4" />Wpływy</div><p className="text-xl font-bold tabular-nums">{fmt(periodIn)}</p></button>
          <button type="button" onClick={() => setBreakdown({ title: 'Wydatki w okresie', rows: outflowRows() })} className="rounded-md border p-3 text-left cursor-pointer hover:bg-accent/50 transition-colors"><div className="flex items-center gap-1 text-destructive text-sm"><TrendingDown className="h-4 w-4" />Wydatki</div><p className="text-xl font-bold tabular-nums">{fmt(periodOut)}</p></button>
          <div className="rounded-md border p-3"><div className="flex items-center gap-1 text-sm"><Wallet className="h-4 w-4" />Wynik</div><p className={`text-xl font-bold tabular-nums ${periodResult >= 0 ? 'text-green-600' : 'text-destructive'}`}>{fmt(periodResult)}</p></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Wpływy wg formy</p>
            {PAYMENT_METHODS.map(m => <div key={m.value} className="flex justify-between text-sm"><span className="text-muted-foreground">{m.label}</span><span className="tabular-nums">{fmt(periodByMethod(m.value))}</span></div>)}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Wydatki wg kategorii</p>
            {EXPENSE_CATEGORIES.map(c => <div key={c.value} className="flex justify-between text-sm"><span className="text-muted-foreground">{c.label}</span><span className="tabular-nums">{fmt(periodExpByCat(c.value))}</span></div>)}
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Wypłaty pracownikom</span><span className="tabular-nums">{fmt(periodPayouts)}</span></div>
          </div>
        </div>
      </CardContent></Card>

      {/* Receivables + recent ops */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardContent className="py-4">
          <h3 className="font-semibold mb-2">Należności do pobrania</h3>
          {receivables.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Brak — wszystkie zakończone zlecenia opłacone.</p>
          ) : (
            <div className="space-y-1.5">
              {receivables.slice(0, 8).map((r) => (
                <div key={r.o.id} className="flex items-center justify-between text-sm border-b pb-1.5 last:border-0">
                  <div><span className="font-medium">{r.o.order_number}</span> <span className="text-muted-foreground">{r.o.client ? (r.o.client.company_name || `${r.o.client.first_name || ''} ${r.o.client.last_name || ''}`.trim()) : ''}</span></div>
                  <div className="text-right"><span className="font-semibold text-amber-600 tabular-nums">{fmt(r.due)} zł</span> <span className="text-xs text-muted-foreground">z {fmt(r.gross)}</span></div>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>

        <Card><CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Operacje</h3>
            {operations.length > 8 && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAllOps((v) => !v)}>{showAllOps ? 'Pokaż mniej' : `Pokaż wszystkie (${operations.length})`}</Button>}
          </div>
          {operations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Brak operacji.</p>
          ) : (
            <div className="space-y-1.5">
              {(showAllOps ? operations : operations.slice(0, 8)).map((op, i) => (
                <div key={i} className={`flex items-center justify-between gap-2 text-sm border-b pb-1.5 last:border-0 ${op.rec.voided ? 'opacity-60' : ''}`}>
                  <div className={`min-w-0 ${op.rec.voided ? 'line-through' : ''}`}>
                    <span className="text-muted-foreground tabular-nums mr-2">{op.date}</span>{op.label}
                    {op.who && <span className="text-xs text-muted-foreground"> · {op.who}</span>}
                    {op.rec.voided && <span className="text-xs text-destructive no-underline"> — Anulowano: {op.rec.void_reason} ({op.rec.voided_by})</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`tabular-nums font-medium ${op.rec.voided ? 'line-through' : op.sign > 0 ? 'text-green-600' : op.sign < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {op.sign > 0 ? '+' : op.sign < 0 ? '−' : ''}{fmt(op.amount)}
                    </span>
                    {!op.rec.voided && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Edytuj" onClick={() => setEditOp({ type: op.type, id: op.rec.id, label: op.label, amount: op.amount, method: op.method, description: op.rec.description ?? op.rec.note })}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Anuluj (storno)" onClick={() => setVoidOp({ type: op.type, id: op.rec.id, label: op.label, amount: op.amount })}><Ban className="h-3.5 w-3.5" /></Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      </div>

      {/* Rozliczenie miesięcy — na żywo, niezależne od zamknięcia (zatwierdzone + otwarte) */}
      <Card><CardContent className="py-4">
        <h3 className="font-semibold mb-2">Rozliczenie miesięcy</h3>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left border-b">
                <th className="py-1 pr-2">Miesiąc</th>
                <th className="py-1 px-2 text-right">Zleceń</th>
                <th className="py-1 px-2 text-right">Przychód</th>
                <th className="py-1 px-2 text-right">Koszt</th>
                <th className="py-1 px-2 text-right">Zysk</th>
                <th className="py-1 px-2 text-right">Marża</th>
                <th className="py-1 px-2 text-right">Wydatki</th>
                <th className="py-1 px-2 text-right">Wynik</th>
                <th className="py-1 pl-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {monthList.map((ym) => {
                const s = monthSummary(ym);
                return (
                  <tr key={ym} className="border-b last:border-0">
                    <td className="py-1.5 pr-2 font-medium tabular-nums">{ym}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{s.count}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmt(s.rev)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmt(s.cost)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmt(s.profit)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{s.margin.toFixed(0)}%</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmt(s.expenses)}</td>
                    <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${s.result >= 0 ? 'text-green-600' : 'text-destructive'}`}>{fmt(s.result)}</td>
                    <td className="py-1.5 pl-2">
                      <div className="flex items-center gap-1">
                        {s.closed
                          ? <span className="inline-flex items-center gap-1 text-xs text-green-700"><Lock className="h-3 w-3" />zatwierdzony</span>
                          : <span className="text-xs text-muted-foreground">otwarty — poglądowo</span>}
                        {s.closed && <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" title="Usuń zatwierdzenie" onClick={() => { if (confirm('Usunąć zatwierdzenie tego miesiąca?')) deleteClosure.mutate(s.closed.id); }}><Trash2 className="h-3 w-3" /></Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent></Card>

      <WorkshopBreakdownDialog open={!!breakdown} onOpenChange={(o) => { if (!o) setBreakdown(null); }} title={breakdown?.title || ''} rows={breakdown?.rows || []} />
      <WorkshopCashEntryDialog open={cashIn} onOpenChange={setCashIn} providerId={providerId} kind="in" />
      <WorkshopExpenseDialog open={!!expenseCat} onOpenChange={(o) => { if (!o) setExpenseCat(null); }} providerId={providerId} defaultCategory={expenseCat || 'zakup'} />
      <WorkshopMonthCloseDialog open={closeOpen} onOpenChange={setCloseOpen} summary={closureSummary} onConfirm={confirmClose} busy={createClosure.isPending || saveSettings.isPending} month={closeMonth} onMonthChange={setCloseMonth} alreadyClosed={alreadyClosed} />
      <WorkshopVoidDialog open={!!voidOp} onOpenChange={(o) => { if (!o) setVoidOp(null); }} op={voidOp} />
      <WorkshopOpEditDialog open={!!editOp} onOpenChange={(o) => { if (!o) setEditOp(null); }} op={editOp} />
    </div>
  );
}
