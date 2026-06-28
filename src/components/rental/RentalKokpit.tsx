import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Car, ShieldCheck, Wallet, CalendarCheck, Coins, AlertTriangle } from 'lucide-react';

/** Kokpit „Co wymaga uwagi" — jedno RPC, bez przeklikiwania kart. */
export function RentalKokpit({ companyId, onNavigate }: { companyId: string; onNavigate: (v: string) => void }) {
  const sb = supabase as any;
  const [d, setD] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => { const { data } = await sb.rpc('rental_dashboard_summary', { p_company_id: companyId }); setD(data && !data.error ? data : null); setLoading(false); })();
  }, [companyId, sb]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!d) return null;

  const v = d.vehicles || {};
  const Stat = ({ icon: Icon, label, value, sub, tone, onClick }: any) => (
    <Card onClick={onClick} className={`cursor-pointer transition-all hover:shadow-md ${onClick ? '' : ''}`}>
      <CardContent className="py-3 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${tone}`}><Icon className="h-5 w-5 text-white" /></div>
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground truncate">{label}{sub ? ` · ${sub}` : ''}</div>
        </div>
      </CardContent>
    </Card>
  );

  const list = (arr: any[], render: (x: any) => string, view: string, empty: string) => (
    arr.length === 0 ? <p className="text-xs text-muted-foreground">{empty}</p> :
      <ul className="text-sm space-y-0.5">{arr.slice(0, 6).map((x, i) => <li key={i} className="flex justify-between border-b py-0.5 cursor-pointer hover:bg-accent/40 px-1 rounded" onClick={() => onNavigate(view)}><span className="truncate">{render(x)}</span></li>)}{arr.length > 6 && <li className="text-xs text-muted-foreground cursor-pointer" onClick={() => onNavigate(view)}>+{arr.length - 6} więcej…</li>}</ul>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat icon={Car} label="Wolne dziś" sub={`z ${v.total || 0}`} value={v.free_today ?? 0} tone="bg-emerald-500" onClick={() => onNavigate('kalendarz')} />
        <Stat icon={Car} label="Zajęte dziś" value={v.busy_today ?? 0} tone="bg-blue-500" onClick={() => onNavigate('kalendarz')} />
        <Stat icon={ShieldCheck} label="OC ≤30 dni" value={(d.oc_expiring || []).length} tone="bg-amber-500" onClick={() => onNavigate('oc')} />
        <Stat icon={ShieldCheck} label="Przegląd ≤30 dni" value={(d.inspection_expiring || []).length} tone="bg-orange-500" onClick={() => onNavigate('oc')} />
        <Stat icon={Wallet} label="Zaległe płatności" value={(d.overdue || []).length} tone="bg-red-500" onClick={() => onNavigate('platnosci')} />
        <Stat icon={Coins} label="Kaucje do zwrotu" value={(d.deposits_return || []).length} tone="bg-teal-500" onClick={() => onNavigate('platnosci')} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card><CardContent className="py-3 space-y-1">
          <div className="text-sm font-semibold flex items-center gap-1"><CalendarCheck className="h-4 w-4 text-primary" /> Zwroty dziś / jutro</div>
          <div className="text-xs font-medium text-muted-foreground">Dziś</div>
          {list(d.returns_today || [], (x) => `${x.booking_number} · ${x.renter_name}`, 'rezerwacje', 'Brak zwrotów dziś.')}
          <div className="text-xs font-medium text-muted-foreground mt-1">Jutro</div>
          {list(d.returns_tomorrow || [], (x) => `${x.booking_number} · ${x.renter_name}`, 'rezerwacje', 'Brak zwrotów jutro.')}
        </CardContent></Card>

        <Card><CardContent className="py-3 space-y-1">
          <div className="text-sm font-semibold flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-amber-600" /> OC / Przegląd ≤30 dni</div>
          {list(d.oc_expiring || [], (x) => `OC: ${x.label} → ${x.valid_to}`, 'oc', 'Brak kończących się OC.')}
          {list(d.inspection_expiring || [], (x) => `Przegląd: ${x.label} → ${x.valid_to}`, 'oc', 'Brak kończących się przeglądów.')}
        </CardContent></Card>

        <Card><CardContent className="py-3 space-y-1">
          <div className="text-sm font-semibold flex items-center gap-1"><Wallet className="h-4 w-4 text-red-600" /> Zaległe płatności</div>
          {list(d.overdue || [], (x) => `${x.booking_number} · ${x.renter_name} · ${x.amount ?? '—'} zł`, 'platnosci', 'Brak zaległości.')}
        </CardContent></Card>
      </div>
    </div>
  );
}
