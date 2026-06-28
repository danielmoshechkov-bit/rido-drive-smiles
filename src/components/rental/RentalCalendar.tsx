import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Loader2 } from 'lucide-react';
import { addDays, startOfMonth, endOfMonth, startOfWeek, format, isSameMonth, isToday } from 'date-fns';
import { pl } from 'date-fns/locale';

const overlapsDay = (day: Date, from: string, to: string) => {
  const ds = new Date(day); ds.setHours(0, 0, 0, 0);
  const de = addDays(ds, 1).getTime();
  return new Date(from).getTime() < de && new Date(to).getTime() > ds.getTime();
};

/** Czytelny kalendarz miesięczny (jak terminarz): siatka dni, najmy/blokady widoczne wprost. */
export function RentalCalendar({ companyId }: { companyId: string }) {
  const sb = supabase as any;
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [mode, setMode] = useState<'month' | 'vehicle'>('month');
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [dayDetail, setDayDetail] = useState<Date | null>(null);

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const rangeStart = gridStart.toISOString();
  const rangeEnd = addDays(gridStart, 42).toISOString();

  const load = useCallback(async () => {
    setLoading(true);
    const { data: subs } = await sb.from('rental_subjects').select('id, title').eq('owner_company_id', companyId).eq('subject_kind', 'vehicle').order('created_at', { ascending: false });
    const ids = (subs || []).map((s: any) => s.id);
    let veh: Record<string, any> = {};
    if (ids.length) { const { data: vs } = await sb.from('rental_vehicles').select('subject_id, brand, model, plate').in('subject_id', ids); veh = Object.fromEntries((vs || []).map((v: any) => [v.subject_id, v])); }
    setVehicles((subs || []).map((s: any) => ({ id: s.id, label: [veh[s.id]?.plate, veh[s.id]?.brand, veh[s.id]?.model].filter(Boolean).join(' ') || s.title })));
    const vmap = (sid: string) => [veh[sid]?.plate, veh[sid]?.brand].filter(Boolean).join(' ') || 'Auto';
    const { data: bk } = await sb.from('bookings').select('id, subject_id, renter_name, period_start, period_end, status').eq('company_id', companyId).in('status', ['new', 'pending_confirmation', 'confirmed', 'in_progress']).lt('period_start', rangeEnd).gt('period_end', rangeStart);
    setBookings((bk || []).map((b: any) => ({ ...b, veh: vmap(b.subject_id) })));
    const { data: bl } = await sb.from('rental_blocks').select('*').eq('company_id', companyId).lt('start_at', rangeEnd).gt('end_at', rangeStart);
    setBlocks((bl || []).map((b: any) => ({ ...b, veh: vmap(b.subject_id) })));
    setLoading(false);
  }, [companyId, sb, rangeStart, rangeEnd]);
  useEffect(() => { load(); }, [load]);

  const eventsForDay = (d: Date) => {
    const bk = bookings.filter(b => (filter === 'all' || b.subject_id === filter) && overlapsDay(d, b.period_start, b.period_end));
    const bl = blocks.filter(b => (filter === 'all' || b.subject_id === filter) && overlapsDay(d, b.start_at, b.end_at));
    return { bk, bl };
  };

  const weekDays = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Kalendarz dostępności</h2>
        <div className="flex-1" />
        <div className="flex rounded-md border overflow-hidden text-sm">
          <button onClick={() => setMode('month')} className={`px-3 py-1.5 ${mode === 'month' ? 'bg-primary text-primary-foreground' : ''}`}>Miesiąc</button>
          <button onClick={() => setMode('vehicle')} className={`px-3 py-1.5 ${mode === 'vehicle' ? 'bg-primary text-primary-foreground' : ''}`}>Per auto</button>
        </div>
        <Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Wszystkie auta</SelectItem>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>Dziś</Button>
        <Button variant="outline" size="icon" onClick={() => setMonth(m => startOfMonth(addDays(m, -1)))}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="font-medium w-36 text-center capitalize">{format(month, 'LLLL yyyy', { locale: pl })}</span>
        <Button variant="outline" size="icon" onClick={() => setMonth(m => startOfMonth(addDays(endOfMonth(m), 1)))}><ChevronRight className="h-4 w-4" /></Button>
        <Button onClick={() => setAddOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Blokada</Button>
      </div>

      {mode === 'vehicle' ? (
        loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-2">
            {vehicles.filter(v => filter === 'all' || v.id === filter).map(v => {
              const vb = bookings.filter(b => b.subject_id === v.id).sort((a, b) => new Date(a.period_start).getTime() - new Date(b.period_start).getTime());
              const vbl = blocks.filter(b => b.subject_id === v.id).sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
              return (
                <Card key={v.id}><CardContent className="py-2.5">
                  <div className="font-medium text-sm mb-1.5">{v.label}</div>
                  <div className="flex flex-wrap gap-1">
                    {vb.map((b, i) => <span key={i} className="text-[11px] rounded px-2 py-0.5 bg-blue-500 text-white" title={b.status}>{b.renter_name} · {format(new Date(b.period_start), 'd.MM')}–{format(new Date(b.period_end), 'd.MM')}</span>)}
                    {vbl.map((b, i) => <span key={`bl${i}`} className="text-[11px] rounded px-2 py-0.5 bg-gray-400 text-white">{b.reason || 'Blokada'} · {format(new Date(b.start_at), 'd.MM')}–{format(new Date(b.end_at), 'd.MM')}</span>)}
                    {(vb.length + vbl.length) === 0 && <span className="text-[11px] text-muted-foreground">brak najmów w tym miesiącu — auto wolne</span>}
                  </div>
                </CardContent></Card>
              );
            })}
            {vehicles.length === 0 && <Card className="py-10 text-center text-muted-foreground text-sm">Brak pojazdów.</Card>}
          </div>
        )
      ) : (
      <Card><CardContent className="p-2">
        {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div>
            <div className="grid grid-cols-7 mb-1">
              {weekDays.map((d, i) => <div key={d} className={`text-center text-xs font-semibold py-1 ${i >= 5 ? 'text-muted-foreground' : ''}`}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d) => {
                const { bk, bl } = eventsForDay(d);
                const inMonth = isSameMonth(d, month);
                const today = isToday(d);
                const weekend = [0, 6].includes(d.getDay());
                return (
                  <button key={d.toISOString()} onClick={() => setDayDetail(d)}
                    className={`min-h-[84px] rounded-md border p-1 text-left align-top transition-colors hover:bg-accent/40 ${!inMonth ? 'opacity-40' : ''} ${weekend ? 'bg-muted/30' : ''} ${today ? 'ring-2 ring-primary' : ''}`}>
                    <div className="text-xs font-semibold">{format(d, 'd')}</div>
                    <div className="space-y-0.5 mt-0.5">
                      {bk.slice(0, 3).map((b, i) => (
                        <div key={i} className="text-[10px] truncate rounded px-1 py-0.5 bg-blue-500 text-white" title={`${b.veh} · ${b.renter_name} (${b.status})`}>{b.veh} · {b.renter_name}</div>
                      ))}
                      {bl.slice(0, 2).map((b, i) => (
                        <div key={`bl${i}`} className="text-[10px] truncate rounded px-1 py-0.5 bg-gray-400 text-white" title={`${b.veh} · ${b.reason || 'Blokada'}`}>{b.veh} · {b.reason || 'Blokada'}</div>
                      ))}
                      {(bk.length + bl.length) > 5 && <div className="text-[10px] text-muted-foreground">+{bk.length + bl.length - 5} więcej</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent></Card>
      )}
      <div className="flex gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-blue-500 rounded" /> Najem</span><span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-gray-400 rounded" /> Blokada (serwis/OC)</span></div>

      {addOpen && <AddBlock sb={sb} companyId={companyId} vehicles={vehicles} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />}

      {dayDetail && (
        <Dialog open onOpenChange={(v) => !v && setDayDetail(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{format(dayDetail, 'EEEE, d MMMM yyyy', { locale: pl })}</DialogTitle></DialogHeader>
            <div className="space-y-2 text-sm">
              {(() => { const { bk, bl } = eventsForDay(dayDetail); if (bk.length + bl.length === 0) return <p className="text-muted-foreground">Brak najmów — dzień wolny.</p>;
                return (<>
                  {bk.map((b, i) => <div key={i} className="flex items-center gap-2 border-b py-1"><span className="inline-block w-2 h-2 bg-blue-500 rounded-full" /><span className="font-medium">{b.veh}</span><span className="flex-1">{b.renter_name}</span><span className="text-xs rounded-full bg-muted px-2">{b.status}</span></div>)}
                  {bl.map((b, i) => <div key={`b${i}`} className="flex items-center gap-2 border-b py-1"><span className="inline-block w-2 h-2 bg-gray-400 rounded-full" /><span className="font-medium">{b.veh}</span><span className="flex-1 text-muted-foreground">{b.reason || 'Blokada'}</span></div>)}
                </>); })()}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function AddBlock({ sb, companyId, vehicles, onClose, onSaved }: any) {
  const [f, setF] = useState({ subject_id: '', start_at: '', end_at: '', reason: '' });
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }));
  const save = async () => {
    if (!f.subject_id || !f.start_at || !f.end_at) { toast.error('Wybierz auto i okres'); return; }
    if (new Date(f.end_at) <= new Date(f.start_at)) { toast.error('„Do" musi być po „od"'); return; }
    const { error } = await sb.from('rental_blocks').insert({ company_id: companyId, subject_id: f.subject_id, start_at: new Date(f.start_at).toISOString(), end_at: new Date(f.end_at).toISOString(), reason: f.reason || null });
    if (error) return toast.error(error.message);
    toast.success('Blokada dodana'); onSaved();
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Blokada (auto niedostępne)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Pojazd</Label><Select value={f.subject_id} onValueChange={v => set('subject_id', v)}><SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger><SelectContent>{vehicles.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Od</Label><Input type="datetime-local" value={f.start_at} onChange={e => set('start_at', e.target.value)} /></div>
            <div className="space-y-1"><Label>Do</Label><Input type="datetime-local" value={f.end_at} onChange={e => set('end_at', e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Powód</Label><Input value={f.reason} onChange={e => set('reason', e.target.value)} placeholder="np. serwis, brak OC" /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Anuluj</Button><Button onClick={save}>Zapisz</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
