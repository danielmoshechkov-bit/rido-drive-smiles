import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Banknote, CreditCard, TrendingUp, TrendingDown, Wallet, ArrowDownCircle, ArrowUpCircle, ShoppingCart, Receipt, AlertCircle, Lock, History } from 'lucide-react';
import { WorkshopRangeCalendar } from './WorkshopRangeCalendar';
import { WorkshopCashEntryDialog } from './WorkshopCashEntryDialog';
import { WorkshopMonthCloseDialog, type ClosureSummary } from './WorkshopMonthCloseDialog';
import { useWorkshopCashData, useWorkshopFinanceSettings, useSaveFinanceSettings, useCashClosures, useCreateCashClosure, PAYMENT_METHODS, EXPENSE_CATEGORIES, type PaymentMethod } from '@/hooks/useWorkshopFinance';
import { useWorkshopOrders } from '@/hooks/useWorkshop';
import { computeOrderTotals, safeNumber } from '@/utils/workshopOrderTotals';

interface Props {
  providerId: string;
  onGoTo?: (view: 'sprzedaz' | 'zakup', sub?: 'wydatki' | 'cykliczne') => void;
}

const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
function startOfWeek() { const d = new Date(); const iso = d.getDay() === 0 ? 7 : d.getDay(); d.setDate(d.getDate() - (iso - 1)); return d.toISOString().slice(0, 10); }
const dpart = (s?: string) => (s ? String(s).slice(0, 10) : '');
const inRange = (date: string, from: string, to: string) => date >= from && date <= to;
const sum = (arr: any[], pred?: (x: any) => boolean) => arr.filter(pred || (() => true)).reduce((s, x) => s + Number(x.amount || 0), 0);

export function WorkshopCashPanel({ providerId, onGoTo }: Props) {
  const { data } = useWorkshopCashData(providerId);
  const { data: settings } = useWorkshopFinanceSettings(providerId);
  const cashEnabled = !!settings?.cash_enabled;
  const start = settings?.cash_started_at ? dpart(settings.cash_started_at) : '';
  // Kasa liczy TYLKO operacje od momentu włączenia (cash_started_at).
  const afterStart = (d?: string) => !start || dpart(d) >= start;
  const payments = (data?.payments || []).filter((p: any) => afterStart(p.paid_at));
  const expenses = (data?.expenses || []).filter((e: any) => afterStart(e.expense_date));
  const payouts = (data?.payouts || []).filter((p: any) => afterStart(p.paid_at));
  const { data: orders = [] } = useWorkshopOrders(providerId);

  const [from, setFrom] = useState(startOfWeek());
  const [to, setTo] = useState(today());
  const [cashIn, setCashIn] = useState(false);
  const [cashOut, setCashOut] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const saveSettings = useSaveFinanceSettings();
  const createClosure = useCreateCashClosure();
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

  // ── Okres ──
  const periodIn = sum(payments, (p) => inRange(dpart(p.paid_at), from, to));
  const periodExp = sum(expenses, (e) => inRange(dpart(e.expense_date), from, to));
  const periodPayouts = sum(payouts, (p) => (p.type === 'zaliczka' || p.type === 'wyplata') && inRange(dpart(p.paid_at), from, to));
  const periodOut = periodExp + periodPayouts;
  const periodResult = Math.round((periodIn - periodOut) * 100) / 100;
  const periodByMethod = (m: PaymentMethod) => sum(payments, (p) => p.method === m && inRange(dpart(p.paid_at), from, to));
  const periodExpByCat = (c: string) => sum(expenses, (e) => e.category === c && inRange(dpart(e.expense_date), from, to));

  // ── Należności do pobrania (zlecenia zakończone, Σpłatności < kwota) ──
  const receivables = useMemo(() => {
    const paidByOrder: Record<string, number> = {};
    payments.forEach((p: any) => { if (p.order_id) paidByOrder[p.order_id] = (paidByOrder[p.order_id] || 0) + Number(p.amount || 0); });
    return (orders as any[])
      .filter((o) => o.status_name === 'Zakończone' && afterStart(o.completed_at || o.created_at))
      .map((o) => {
        const gross = computeOrderTotals(o.items).total_gross || o.total_gross || 0;
        const paid = paidByOrder[o.id] || 0;
        return { o, gross, paid, due: Math.round((gross - paid) * 100) / 100 };
      })
      .filter((r) => r.due > 0.01)
      .sort((a, b) => b.due - a.due);
  }, [orders, payments]);
  const receivablesTotal = receivables.reduce((s, r) => s + r.due, 0);

  // ── Ostatnie operacje ──
  const recent = useMemo(() => {
    const ops = [
      ...payments.map((p: any) => ({ date: dpart(p.paid_at), label: 'Wpłata' + (p.order_id ? ' (zlecenie)' : ''), amount: Number(p.amount || 0), sign: 1, method: p.method })),
      ...expenses.map((e: any) => ({ date: dpart(e.expense_date), label: (EXPENSE_CATEGORIES.find(c => c.value === e.category)?.label || e.category) + (e.subcategory ? ` · ${e.subcategory}` : ''), amount: Number(e.amount || 0), sign: -1, method: e.method })),
      ...payouts.map((p: any) => ({ date: dpart(p.paid_at), label: `Pracownik · ${p.type}`, amount: Number(p.amount || 0), sign: p.type === 'premia' ? 0 : -1, method: null })),
    ];
    return ops.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
  }, [payments, expenses, payouts]);

  // ── Podsumowanie do zamknięcia miesiąca (cały aktywny okres kasy) ──
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const orderRevenue = (o: any) => computeOrderTotals(o.items).total_gross || o.total_gross || 0;
  const orderCost = (o: any) => (o.items || []).reduce((s: number, i: any) => s + safeNumber(i.unit_cost_gross) * (safeNumber(i.quantity) || 1) + safeNumber(i.labor_cost), 0);
  const closedOrders = (orders as any[]).filter((o) => o.status_name === 'Zakończone' && afterStart(o.completed_at || o.created_at));
  const cRevenue = closedOrders.reduce((s, o) => s + orderRevenue(o), 0);
  const cCost = closedOrders.reduce((s, o) => s + orderCost(o), 0);
  const cProfit = round2(cRevenue - cCost);
  const cExpensesAll = sum(expenses);
  const cInflowAll = sum(payments);
  const cPayoutsAll = sum(payouts, (p) => p.type === 'zaliczka' || p.type === 'wyplata');
  const closureSummary: ClosureSummary = {
    period_from: start || today(),
    period_to: today(),
    orders_count: closedOrders.length,
    revenue: round2(cRevenue),
    cost: round2(cCost),
    profit: cProfit,
    avg_margin: cRevenue > 0 ? round2((cProfit / cRevenue) * 100) : 0,
    expenses: round2(cExpensesAll),
    result: round2(cInflowAll - cExpensesAll - cPayoutsAll),
    cash_end: round2(cashGotowka),
  };

  const confirmClose = async () => {
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
        <Button onClick={() => setCashIn(true)} className="gap-2"><ArrowDownCircle className="h-4 w-4" /> Dodaj wpłatę</Button>
        <Button variant="outline" onClick={() => setCashOut(true)} className="gap-2"><ArrowUpCircle className="h-4 w-4" /> Dodaj wypłatę</Button>
        <Button variant="outline" onClick={() => onGoTo?.('zakup', 'wydatki')} className="gap-2"><ShoppingCart className="h-4 w-4" /> Dodaj zakup</Button>
        <Button variant="outline" onClick={() => onGoTo?.('zakup', 'cykliczne')} className="gap-2"><Receipt className="h-4 w-4" /> Dodaj opłatę</Button>
        <div className="flex-1" />
        <Button variant="outline" onClick={() => setArchiveOpen((v) => !v)} className="gap-2"><History className="h-4 w-4" /> Archiwum ({(closures as any[]).length})</Button>
        <Button variant="secondary" onClick={() => setCloseOpen(true)} className="gap-2"><Lock className="h-4 w-4" /> Zamknij miesiąc</Button>
      </div>

      {archiveOpen && (
        <Card><CardContent className="py-4">
          <h3 className="font-semibold mb-2">Archiwum zamkniętych miesięcy</h3>
          {(closures as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground py-2 text-center">Brak zamknięć.</p>
          ) : (
            <div className="space-y-1.5">
              {(closures as any[]).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm border-b pb-1.5 last:border-0">
                  <span>{c.period_from} — {c.period_to} <span className="text-muted-foreground">· {c.orders_count} zleceń</span></span>
                  <span className="tabular-nums">Wynik: <span className={`font-semibold ${Number(c.result) >= 0 ? 'text-green-600' : 'text-destructive'}`}>{fmt(Number(c.result))}</span> · gotówka {fmt(Number(c.cash_end))}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      )}

      {/* Period flow */}
      <Card><CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold">Przepływ okresu</h3>
          <WorkshopRangeCalendar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} align="end" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border p-3"><div className="flex items-center gap-1 text-green-600 text-sm"><TrendingUp className="h-4 w-4" />Wpływy</div><p className="text-xl font-bold tabular-nums">{fmt(periodIn)}</p></div>
          <div className="rounded-md border p-3"><div className="flex items-center gap-1 text-destructive text-sm"><TrendingDown className="h-4 w-4" />Wydatki</div><p className="text-xl font-bold tabular-nums">{fmt(periodOut)}</p></div>
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
          <h3 className="font-semibold mb-2">Ostatnie operacje</h3>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Brak operacji.</p>
          ) : (
            <div className="space-y-1.5">
              {recent.map((op, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b pb-1.5 last:border-0">
                  <div><span className="text-muted-foreground tabular-nums mr-2">{op.date}</span>{op.label}</div>
                  <span className={`tabular-nums font-medium ${op.sign > 0 ? 'text-green-600' : op.sign < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {op.sign > 0 ? '+' : op.sign < 0 ? '−' : ''}{fmt(op.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      </div>

      <WorkshopCashEntryDialog open={cashIn} onOpenChange={setCashIn} providerId={providerId} kind="in" />
      <WorkshopCashEntryDialog open={cashOut} onOpenChange={setCashOut} providerId={providerId} kind="out" />
      <WorkshopMonthCloseDialog open={closeOpen} onOpenChange={setCloseOpen} summary={closureSummary} onConfirm={confirmClose} busy={createClosure.isPending || saveSettings.isPending} />
    </div>
  );
}
