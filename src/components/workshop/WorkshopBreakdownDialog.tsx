import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface BreakdownRow {
  date?: string;
  label: string;
  amount: number;
}

const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Drill-down: co składa się na podsumowanie (wpływy/wydatki/koszty stałe).
export function WorkshopBreakdownDialog({ open, onOpenChange, title, rows }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; rows: BreakdownRow[];
}) {
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Brak pozycji w tym okresie.</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {r.date && <td className="py-1.5 pr-2 text-muted-foreground tabular-nums whitespace-nowrap align-top">{r.date}</td>}
                    <td className="py-1.5 pr-2">{r.label}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium whitespace-nowrap align-top">{fmt(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t pt-2 font-semibold">
          <span>Razem</span>
          <span className="tabular-nums">{fmt(total)} zł</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
