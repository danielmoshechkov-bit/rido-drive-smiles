import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Lock } from 'lucide-react';

export interface ClosureSummary {
  period_from: string;
  period_to: string;
  orders_count: number;
  revenue: number;
  cost: number;
  profit: number;
  avg_margin: number;
  expenses: number;
  result: number;
  cash_end: number;
}

const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const shiftMonth = (m: string, delta: number) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
};

export function WorkshopMonthCloseDialog({ open, onOpenChange, summary, onConfirm, busy, month, onMonthChange, alreadyClosed }: {
  open: boolean; onOpenChange: (o: boolean) => void; summary: ClosureSummary; onConfirm: () => void; busy: boolean;
  month: string; onMonthChange: (m: string) => void; alreadyClosed: boolean;
}) {
  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className="flex justify-between text-sm py-0.5"><span className="text-muted-foreground">{label}</span><span className={`tabular-nums ${strong ? 'font-bold' : 'font-medium'}`}>{value}</span></div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> Zamknij miesiąc</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* Picker miesiąca kalendarzowego */}
          <div className="flex items-center justify-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMonthChange(shiftMonth(month, -1))}>‹</Button>
            <span className="text-sm font-semibold capitalize min-w-[150px] text-center">{monthLabel(month)}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMonthChange(shiftMonth(month, 1))}>›</Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">Okres: {summary.period_from} — {summary.period_to}</p>
          <div className="rounded-md border p-3">
            <Row label="Liczba zleceń" value={String(summary.orders_count)} />
            <Row label="Przychód" value={`${fmt(summary.revenue)} zł`} />
            <Row label="Koszty zleceń" value={`${fmt(summary.cost)} zł`} />
            <Row label="Zarobek (zysk)" value={`${fmt(summary.profit)} zł`} />
            <Row label="Średnia marża" value={`${summary.avg_margin.toFixed(1)} %`} />
            <Row label="Wydatki firmy" value={`${fmt(summary.expenses)} zł`} />
            <Row label="Wynik (ile zostało)" value={`${fmt(summary.result)} zł`} strong />
            <Row label="Stan gotówki na koniec" value={`${fmt(summary.cash_end)} zł`} strong />
          </div>
          {alreadyClosed ? (
            <p className="text-sm text-amber-600 font-medium text-center">Ten miesiąc jest już zamknięty (jest w archiwum).</p>
          ) : (
            <p className="text-xs text-amber-600">Po zatwierdzeniu kasa wystartuje od zera. Dane NIE są kasowane — kasa zacznie liczyć od teraz. Stan początkowy gotówki wpiszesz przez „Dodaj wpłatę".</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button onClick={onConfirm} disabled={busy || alreadyClosed} className="gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Zamknij i zeruj</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
