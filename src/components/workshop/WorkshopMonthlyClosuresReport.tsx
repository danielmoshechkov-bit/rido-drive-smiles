/**
 * Podsumowanie miesięcy i raporty z zamknięcia — widok wspólny dla Kasy i modułu Raporty.
 *
 * PO CO OSOBNY WIDOK W RAPORTACH: właściciel idzie po liczby do Raportów, a nie do Kasy,
 * bo Kasa kojarzy się z bieżącą obsługą klienta. Ten sam materiał w obu miejscach oszczędza
 * tłumaczenia „to jest w tamtej zakładce".
 *
 * Rozliczenie liczone jest NA ŻYWO, a raport zamknięcia pokazuje wartości ZAPISANE w chwili
 * domknięcia miesiąca. Te liczby mogą się różnić i to nie jest błąd: zamknięcie jest zdjęciem
 * stanu, a rozliczenie odbiciem tego, co w danych jest dzisiaj.
 */

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Lock } from 'lucide-react';
import { useCashClosures } from '@/hooks/useWorkshopFinance';

const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dpart = (s?: string) => (s ? String(s).slice(0, 10) : '');

export function WorkshopMonthlyClosuresReport({ providerId }: { providerId: string }) {
  const { data: closures = [] } = useCashClosures(providerId);
  const [selected, setSelected] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...(closures as any[])].sort((a, b) => (dpart(a.period_from) < dpart(b.period_from) ? 1 : -1)),
    [closures],
  );
  const current = sorted.find((c) => c.id === selected) ?? sorted[0];

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Brak zamkniętych miesięcy. Raport pojawi się tutaj po kliknięciu „Zamknij miesiąc" w Kasie.
        </CardContent>
      </Card>
    );
  }

  const rows: Array<[string, string]> = current
    ? [
        ['Okres', `${dpart(current.period_from)} – ${dpart(current.period_to)}`],
        ['Zamknięty', new Date(current.closed_at).toLocaleString('pl-PL')],
        ['Zleceń', String(current.orders_count ?? 0)],
        ['Przychód', `${fmt(Number(current.revenue))} zł`],
        ['Koszt', `${fmt(Number(current.cost))} zł`],
        ['Zysk', `${fmt(Number(current.profit))} zł`],
        ['Średnia marża', `${Number(current.avg_margin ?? 0).toFixed(0)}%`],
        ['Wydatki', `${fmt(Number(current.expenses))} zł`],
        ['Wynik (wpływy − wydatki)', `${fmt(Number(current.result))} zł`],
        ['Gotówka na koniec', `${fmt(Number(current.cash_end))} zł`],
      ]
    : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4">
          <h3 className="font-semibold mb-2">Zamknięte miesiące</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left border-b">
                  <th className="py-1 pr-2">Miesiąc</th>
                  <th className="py-1 px-2 text-right">Zleceń</th>
                  <th className="py-1 px-2 text-right">Przychód</th>
                  <th className="py-1 px-2 text-right">Koszt</th>
                  <th className="py-1 px-2 text-right">Zysk</th>
                  <th className="py-1 px-2 text-right">Wydatki</th>
                  <th className="py-1 px-2 text-right">Wynik</th>
                  <th className="py-1 px-2 text-right">Gotówka na koniec</th>
                  <th className="py-1 pl-2">Zamknięty</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr
                    key={c.id}
                    className={`border-b last:border-0 cursor-pointer hover:bg-accent/50 ${current?.id === c.id ? 'bg-accent/40' : ''}`}
                    onClick={() => setSelected(c.id)}
                  >
                    <td className="py-1.5 pr-2 font-medium tabular-nums">{dpart(c.period_from).slice(0, 7)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{c.orders_count ?? 0}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmt(Number(c.revenue))}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmt(Number(c.cost))}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmt(Number(c.profit))}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmt(Number(c.expenses))}</td>
                    <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${Number(c.result) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {fmt(Number(c.result))}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmt(Number(c.cash_end))}</td>
                    <td className="py-1.5 pl-2 text-xs text-muted-foreground whitespace-nowrap">
                      <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" />
                        {new Date(c.closed_at).toLocaleDateString('pl-PL')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {current && (
        <Card>
          <CardContent className="py-4">
            <h3 className="font-semibold mb-1">Raport za {dpart(current.period_from).slice(0, 7)}</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Wartości zapisane w chwili zamknięcia — nie zmieniają się przy późniejszych poprawkach w zleceniach.
            </p>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {rows.map(([label, value]) => (
                    <tr key={label} className="border-b last:border-0">
                      <td className="py-2 px-3 text-muted-foreground">{label}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-medium">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
