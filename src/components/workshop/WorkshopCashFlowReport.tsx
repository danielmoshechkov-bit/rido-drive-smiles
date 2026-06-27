import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TrendingUp, TrendingDown, Wallet, Banknote, CreditCard } from 'lucide-react';
import {
  PAYMENT_METHODS, EXPENSE_CATEGORIES, type PaymentMethod,
  useWorkshopPaymentsRange, useWorkshopExpenses, useWorkshopPayouts,
} from '@/hooks/useWorkshopFinance';

interface Props { providerId: string; }

const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
function startOfWeek() { const d = new Date(); const iso = d.getDay() === 0 ? 7 : d.getDay(); d.setDate(d.getDate() - (iso - 1)); return d.toISOString().slice(0, 10); }
function startOfMonth() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }

export function WorkshopCashFlowReport({ providerId }: Props) {
  const [period, setPeriod] = useState<'week' | 'month' | 'custom'>('week');
  const [from, setFrom] = useState(startOfWeek());
  const [to, setTo] = useState(today());

  const setQuick = (p: 'week' | 'month') => {
    setPeriod(p);
    setFrom(p === 'week' ? startOfWeek() : startOfMonth());
    setTo(today());
  };

  const { data: payments = [] } = useWorkshopPaymentsRange(providerId, from, to);
  const { data: expenses = [] } = useWorkshopExpenses(providerId, { from, to });
  const { data: payouts = [] } = useWorkshopPayouts(providerId, { from, to });

  const sum = (arr: any[], pred?: (x: any) => boolean) =>
    arr.filter(pred || (() => true)).reduce((s, x) => s + Number(x.amount || 0), 0);

  // Wpływy = płatności (zlecenia + sprzedaż trafiają do workshop_payments)
  const inflow = sum(payments);
  const inflowByMethod = (m: PaymentMethod) => sum(payments, (p) => p.method === m);

  // Wydatki = expenses (zakup/oplata/wyplata) + realne wypłaty pracownikom (zaliczka+wyplata)
  const expensesTotal = sum(expenses);
  const expByCategory = (c: string) => sum(expenses, (e) => e.category === c);
  const payoutsCash = sum(payouts, (p) => p.type === 'zaliczka' || p.type === 'wyplata');
  const outflow = expensesTotal + payoutsCash;

  const result = Math.round((inflow - outflow) * 100) / 100;

  // Stan kasy po formach (payments − expenses tej formy). Wypłaty pracownikom nie mają
  // formy → pomniejszają saldo całkowite (pokazane osobno).
  const cashByMethod = (m: PaymentMethod) => inflowByMethod(m) - sum(expenses, (e) => e.method === m);
  const cashGotowka = cashByMethod('gotowka');
  const cashKonto = cashByMethod('karta') + cashByMethod('blik') + cashByMethod('przelew');

  return (
    <div className="space-y-4">
      {/* Period */}
      <Card>
        <CardContent className="py-4 flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5">
            <Button variant={period === 'week' ? 'default' : 'ghost'} size="sm" className="h-8" onClick={() => setQuick('week')}>Tydzień</Button>
            <Button variant={period === 'month' ? 'default' : 'ghost'} size="sm" className="h-8" onClick={() => setQuick('month')}>Miesiąc</Button>
            <Button variant={period === 'custom' ? 'default' : 'ghost'} size="sm" className="h-8" onClick={() => setPeriod('custom')}>Zakres</Button>
          </div>
          {period === 'custom' && (
            <>
              <div className="space-y-1.5"><Label>Od</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Do</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
            </>
          )}
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">{from} — {to}</span>
        </CardContent>
      </Card>

      {/* Result tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="py-4">
          <div className="flex items-center gap-2 text-green-600"><TrendingUp className="h-4 w-4" /><span className="text-sm">Wpływy</span></div>
          <p className="text-2xl font-bold tabular-nums mt-1">{fmt(inflow)} zł</p>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="flex items-center gap-2 text-destructive"><TrendingDown className="h-4 w-4" /><span className="text-sm">Wydatki</span></div>
          <p className="text-2xl font-bold tabular-nums mt-1">{fmt(outflow)} zł</p>
        </CardContent></Card>
        <Card className={result >= 0 ? 'border-green-500/40' : 'border-destructive/40'}><CardContent className="py-4">
          <div className="flex items-center gap-2"><Wallet className="h-4 w-4" /><span className="text-sm">Wynik okresu</span></div>
          <p className={`text-2xl font-bold tabular-nums mt-1 ${result >= 0 ? 'text-green-600' : 'text-destructive'}`}>{fmt(result)} zł</p>
        </CardContent></Card>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><CardContent className="py-4 space-y-2">
          <h3 className="font-semibold">Wpływy wg formy</h3>
          {PAYMENT_METHODS.map((m) => (
            <div key={m.value} className="flex justify-between text-sm"><span className="text-muted-foreground">{m.label}</span><span className="tabular-nums font-medium">{fmt(inflowByMethod(m.value))}</span></div>
          ))}
        </CardContent></Card>
        <Card><CardContent className="py-4 space-y-2">
          <h3 className="font-semibold">Wydatki wg kategorii</h3>
          {EXPENSE_CATEGORIES.map((c) => (
            <div key={c.value} className="flex justify-between text-sm"><span className="text-muted-foreground">{c.label}</span><span className="tabular-nums font-medium">{fmt(expByCategory(c.value))}</span></div>
          ))}
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Wypłaty pracownikom (zaliczki/wypłaty)</span><span className="tabular-nums font-medium">{fmt(payoutsCash)}</span></div>
        </CardContent></Card>
      </div>

      {/* Cash state */}
      <Card><CardContent className="py-4">
        <h3 className="font-semibold mb-3">Stan kasy (w okresie)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 rounded-md border p-3">
            <Banknote className="h-6 w-6 text-green-600" />
            <div><p className="text-xs text-muted-foreground">Gotówka w kasie</p><p className="text-lg font-bold tabular-nums">{fmt(cashGotowka)} zł</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-md border p-3">
            <CreditCard className="h-6 w-6 text-primary" />
            <div><p className="text-xs text-muted-foreground">Na koncie (karta/BLIK/przelew)</p><p className="text-lg font-bold tabular-nums">{fmt(cashKonto)} zł</p></div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Saldo z płatności minus wydatki danej formy w wybranym okresie. Wypłaty pracownikom nie mają przypisanej formy i pomniejszają wynik całkowity.</p>
      </CardContent></Card>
    </div>
  );
}
