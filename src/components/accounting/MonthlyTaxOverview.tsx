import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Scale, Info, Loader2 } from 'lucide-react';

const MONTHS_PL = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const pad = (n: number) => String(n).padStart(2, '0');
const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (v: number) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(v || 0);

const RATES = ['23', '8', '5', '0'] as const;
type Rate = typeof RATES[number];
const rateLabel = (r: Rate) => (r === '0' ? '0% / zw' : `${r}%`);
const normRate = (r: unknown): Rate => {
  const x = String(r ?? '').trim();
  if (x === '23') return '23';
  if (x === '8') return '8';
  if (x === '5') return '5';
  return '0'; // 0%, zw, np, oo
};
const emptyPer = () => ({ '23': { net: 0, vat: 0 }, '8': { net: 0, vat: 0 }, '5': { net: 0, vat: 0 }, '0': { net: 0, vat: 0 } } as Record<Rate, { net: number; vat: number }>);
const r2 = (n: number) => Math.round(n * 100) / 100;

interface Agg { count: number; net: number; vat: number; gross: number; per: Record<Rate, { net: number; vat: number }>; }

interface MonthlyTaxOverviewProps {
  userId?: string | null;
  entityId?: string | null;
  month: number; // 1-based
  year: number;
  onMonthChange: (m: number) => void;
  onYearChange: (y: number) => void;
}

export function MonthlyTaxOverview({ userId, entityId, month, year, onMonthChange, onYearChange }: MonthlyTaxOverviewProps) {
  const from = `${year}-${pad(month)}-01`;
  const to = toIsoDate(new Date(year, month, 0));
  const yearOptions = useMemo(() => [year + 1, year, year - 1, year - 2].filter((v, i, a) => a.indexOf(v) === i), [year]);

  // Sprzedaż (user_invoices + pozycje dla rozbicia per stawka)
  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ['tax-overview-sales', userId, from, to],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('user_invoices')
        .select('id, net_total, vat_total, gross_total, user_invoice_items(vat_rate, net_amount, vat_amount)') as any)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .gte('issue_date', from)
        .lte('issue_date', to);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // Zakupy (purchase_invoices z vat_breakdown)
  const { data: purchases, isLoading: purchasesLoading } = useQuery({
    queryKey: ['tax-overview-purchases', entityId, from, to],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('purchase_invoices')
        .select('id, total_net, total_vat, total_gross, vat_breakdown') as any)
        .eq('entity_id', entityId)
        .is('deleted_at', null)
        .gte('purchase_date', from)
        .lte('purchase_date', to);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const s: Agg = useMemo(() => {
    const per = emptyPer(); let count = 0, net = 0, vat = 0, gross = 0;
    for (const inv of sales || []) {
      count++; net += Number(inv.net_total || 0); vat += Number(inv.vat_total || 0); gross += Number(inv.gross_total || 0);
      for (const it of inv.user_invoice_items || []) {
        const r = normRate(it.vat_rate);
        per[r].net += Number(it.net_amount || 0);
        per[r].vat += Number(it.vat_amount || 0);
      }
    }
    return { count, net, vat, gross, per };
  }, [sales]);

  const z: Agg = useMemo(() => {
    const per = emptyPer(); let count = 0, net = 0, vat = 0, gross = 0;
    for (const p of purchases || []) {
      count++; net += Number(p.total_net || 0); vat += Number(p.total_vat || 0); gross += Number(p.total_gross || 0);
      const vb = p.vat_breakdown || {};
      for (const r of RATES) {
        per[r].net += Number(vb[r]?.netto || 0);
        per[r].vat += Number(vb[r]?.vat || 0);
      }
    }
    return { count, net, vat, gross, per };
  }, [purchases]);

  const vatDue = s.vat - z.vat;
  const dochod = s.net - z.net;
  const loading = salesLoading || purchasesLoading;

  // Stawki niezerowe gdziekolwiek (do tabel VAT)
  const activeRates = RATES.filter((r) => Math.abs(s.per[r].net) > 0.001 || Math.abs(s.per[r].vat) > 0.001 || Math.abs(z.per[r].net) > 0.001 || Math.abs(z.per[r].vat) > 0.001);

  const RateTable = ({ agg, accent }: { agg: Agg; accent: string }) => {
    const rows = RATES.filter((r) => Math.abs(agg.per[r].net) > 0.001 || Math.abs(agg.per[r].vat) > 0.001);
    return (
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="text-left font-normal">Stawka</th>
            <th className="text-right font-normal">Netto</th>
            <th className="text-right font-normal">VAT</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={3} className="py-1 text-muted-foreground">—</td></tr>
          ) : rows.map((r) => (
            <tr key={r}>
              <td className={accent}>{rateLabel(r)}</td>
              <td className="text-right">{fmt(agg.per[r].net)}</td>
              <td className="text-right">{fmt(agg.per[r].vat)}</td>
            </tr>
          ))}
          <tr className="border-t font-medium">
            <td>Razem</td>
            <td className="text-right">{fmt(agg.net)}</td>
            <td className="text-right">{fmt(agg.vat)}</td>
          </tr>
        </tbody>
      </table>
    );
  };

  return (
    <div className="space-y-4">
      {/* Tytuł + wybór miesiąca/roku zgrupowane po lewej */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Przegląd</h2>
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => onMonthChange(Number(v))}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS_PL.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => onYearChange(Number(v))}>
            <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Kafle SPRZEDAŻ / ZAKUPY z rozbiciem per stawka */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="border-emerald-200/60">
          <CardContent className="p-5">
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700"><TrendingUp className="h-4 w-4" /> Sprzedaż</div>
              <span className="text-xs text-muted-foreground">{s.count} {s.count === 1 ? 'faktura wystawiona' : 'faktur wystawionych'}</span>
            </div>
            <p className="text-3xl font-bold">{fmt(s.gross)}</p>
            <p className="text-xs text-muted-foreground">brutto</p>
            <RateTable agg={s} accent="text-emerald-700" />
            <p className="mt-2 text-[11px] text-muted-foreground">Stawki z pozycji faktur. Bez paragonów (moduł w przygotowaniu).</p>
          </CardContent>
        </Card>

        <Card className="border-sky-200/60">
          <CardContent className="p-5">
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-sky-700"><TrendingDown className="h-4 w-4" /> Zakupy</div>
              <span className="text-xs text-muted-foreground">{z.count} {z.count === 1 ? 'faktura otrzymana' : 'faktur otrzymanych'}</span>
            </div>
            <p className="text-3xl font-bold">{fmt(z.gross)}</p>
            <p className="text-xs text-muted-foreground">brutto</p>
            <RateTable agg={z} accent="text-sky-700" />
            <p className="mt-2 text-[11px] text-muted-foreground">Stawki z KSeF (P_13/P_14). Korekty ujemne pomniejszają sumy.</p>
          </CardContent>
        </Card>
      </div>

      {/* VAT należny − naliczony per stawka + zbiorczo */}
      <Card className="bg-muted/30">
        <CardContent className="p-5">
          <div className="mb-2 flex items-center gap-2"><Scale className="h-5 w-5 text-muted-foreground" /><p className="text-sm font-medium">VAT do rozliczenia (należny − naliczony)</p></div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left font-normal">Stawka</th>
                <th className="text-right font-normal">Należny (sprzedaż)</th>
                <th className="text-right font-normal">Naliczony (zakupy)</th>
                <th className="text-right font-normal">Różnica</th>
              </tr>
            </thead>
            <tbody>
              {activeRates.length === 0 ? (
                <tr><td colSpan={4} className="py-1 text-muted-foreground">—</td></tr>
              ) : activeRates.map((r) => {
                const diff = r2(s.per[r].vat - z.per[r].vat);
                return (
                  <tr key={r}>
                    <td>{rateLabel(r)}</td>
                    <td className="text-right">{fmt(s.per[r].vat)}</td>
                    <td className="text-right">{fmt(z.per[r].vat)}</td>
                    <td className={`text-right ${diff >= 0 ? '' : 'text-emerald-600'}`}>{fmt(diff)}</td>
                  </tr>
                );
              })}
              <tr className="border-t font-semibold">
                <td>Razem</td>
                <td className="text-right">{fmt(s.vat)}</td>
                <td className="text-right">{fmt(z.vat)}</td>
                <td className={`text-right ${vatDue >= 0 ? 'text-destructive' : 'text-emerald-600'}`}>{fmt(vatDue)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-right text-sm">
            <span className="text-muted-foreground">{vatDue >= 0 ? 'VAT do zapłaty: ' : 'Nadpłata VAT: '}</span>
            <span className={`text-xl font-bold ${vatDue >= 0 ? 'text-destructive' : 'text-emerald-600'}`}>{fmt(Math.abs(vatDue))}</span>
          </p>
        </CardContent>
      </Card>

      {/* Dochód (poglądowo) — bez mnożenia przez stawkę PIT */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-sm font-medium">Dochód (poglądowo)</p>
            <p className="text-xs text-muted-foreground">przychód netto {fmt(s.net)} − koszty netto {fmt(z.net)}</p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold ${dochod >= 0 ? '' : 'text-destructive'}`}>{fmt(dochod)}</p>
            <p className="text-xs text-muted-foreground">podatek zależny od formy opodatkowania</p>
          </div>
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>Dane poglądowe</strong> — nie zastępują księgowości. Nie każdy zakup jest kosztem podatkowym i nie każdy VAT jest odliczalny.
          Ostateczne rozliczenie wymaga zatwierdzenia przez księgową.
        </span>
      </div>
    </div>
  );
}
