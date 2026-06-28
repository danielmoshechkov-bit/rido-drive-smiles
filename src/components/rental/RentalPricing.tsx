import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Tag, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { noScroll } from '@/components/rental/rentalLib';

const num = (s: string) => { const n = parseFloat(String(s).replace(',', '.')); return Number.isFinite(n) ? n : null; };

export function RentalPricing({ companyId }: { companyId: string }) {
  const sb = supabase as any;
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: subs } = await sb.from('rental_subjects').select('id, title').eq('owner_company_id', companyId).eq('subject_kind', 'vehicle').order('created_at', { ascending: false });
    const ids = (subs || []).map((s: any) => s.id);
    let veh: Record<string, any> = {}, cards: Record<string, any> = {};
    if (ids.length) {
      const { data: vs } = await sb.from('rental_vehicles').select('subject_id, brand, model, plate, rate_daily, rate_weekly, rate_monthly, deposit').in('subject_id', ids);
      veh = Object.fromEntries((vs || []).map((v: any) => [v.subject_id, v]));
      const { data: rc } = await sb.from('rental_rate_cards').select('*').in('subject_id', ids);
      cards = Object.fromEntries((rc || []).map((c: any) => [c.subject_id, c]));
    }
    setRows((subs || []).map((s: any) => ({ id: s.id, title: s.title, veh: veh[s.id] || {}, card: cards[s.id] || null })));
    setLoading(false);
  }, [companyId, sb]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2"><Tag className="h-5 w-5 text-primary" /> Cennik</h2>
      <Card><CardContent className="p-0">
        {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Pojazd</TableHead><TableHead>Godz.</TableHead><TableHead>Doba</TableHead><TableHead>Tydzień</TableHead><TableHead>Miesiąc</TableHead><TableHead>Kaucja</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map(r => {
                const c = r.card || {};
                const eff = { hour: c.rate_hour, day: c.rate_day ?? r.veh.rate_daily, week: c.rate_week ?? r.veh.rate_weekly, month: c.rate_month ?? r.veh.rate_monthly, deposit: c.deposit ?? r.veh.deposit };
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{[r.veh.plate, r.veh.brand, r.veh.model].filter(Boolean).join(' ') || r.title}</TableCell>
                    <TableCell>{eff.hour != null ? `${eff.hour} zł` : '—'}</TableCell>
                    <TableCell>{eff.day != null ? `${eff.day} zł` : '—'}</TableCell>
                    <TableCell>{eff.week != null ? `${eff.week} zł` : '—'}</TableCell>
                    <TableCell>{eff.month != null ? `${eff.month} zł` : '—'}</TableCell>
                    <TableCell>{eff.deposit != null ? `${eff.deposit} zł` : '—'}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setEdit(r)} className="gap-1"><Pencil className="h-3 w-3" />Edytuj</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
      {edit && <EditCard sb={sb} companyId={companyId} row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function EditCard({ sb, companyId, row, onClose, onSaved }: any) {
  const c = row.card || {};
  const [f, setF] = useState({
    rate_hour: c.rate_hour ?? '', rate_day: c.rate_day ?? row.veh.rate_daily ?? '', rate_week: c.rate_week ?? row.veh.rate_weekly ?? '',
    rate_month: c.rate_month ?? row.veh.rate_monthly ?? '', deposit: c.deposit ?? row.veh.deposit ?? '',
  });
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }));
  const [tiers, setTiers] = useState<any[]>([]);
  const [cardId, setCardId] = useState<string | null>(c.id || null);
  const [busy, setBusy] = useState(false);
  const [nt, setNt] = useState({ min_days: '', discount_percent: '' });

  useEffect(() => { if (cardId) sb.from('rental_rate_tiers').select('*').eq('rate_card_id', cardId).order('min_days').then((r: any) => setTiers(r.data || [])); }, [cardId, sb]);

  const saveCard = async () => {
    setBusy(true);
    try {
      const payload = { company_id: companyId, subject_id: row.id, rate_hour: num(f.rate_hour as string), rate_day: num(f.rate_day as string), rate_week: num(f.rate_week as string), rate_month: num(f.rate_month as string), deposit: num(f.deposit as string), updated_at: new Date().toISOString() };
      const { data, error } = await sb.from('rental_rate_cards').upsert(payload, { onConflict: 'subject_id' }).select('id').single();
      if (error) throw error;
      setCardId(data.id);
      toast.success('Cennik zapisany'); onSaved();
    } catch (e: any) { toast.error(e.message || 'Błąd'); } finally { setBusy(false); }
  };

  const addTier = async () => {
    if (!cardId) { toast.error('Najpierw zapisz cennik'); return; }
    const md = parseInt(nt.min_days, 10), dp = num(nt.discount_percent);
    if (!md || dp == null) { toast.error('Podaj min. dni i rabat %'); return; }
    await sb.from('rental_rate_tiers').insert({ company_id: companyId, rate_card_id: cardId, min_days: md, discount_percent: dp });
    setNt({ min_days: '', discount_percent: '' });
    sb.from('rental_rate_tiers').select('*').eq('rate_card_id', cardId).order('min_days').then((r: any) => setTiers(r.data || []));
  };
  const delTier = async (id: string) => { await sb.from('rental_rate_tiers').delete().eq('id', id); setTiers(t => t.filter(x => x.id !== id)); };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Cennik — {[row.veh.plate, row.veh.brand, row.veh.model].filter(Boolean).join(' ') || row.title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Godzina (zł)</Label><Input type="text" inputMode="decimal" onWheel={noScroll} value={f.rate_hour as string} onChange={e => set('rate_hour', e.target.value)} /></div>
            <div className="space-y-1"><Label>Doba (zł)</Label><Input type="text" inputMode="decimal" onWheel={noScroll} value={f.rate_day as string} onChange={e => set('rate_day', e.target.value)} /></div>
            <div className="space-y-1"><Label>Tydzień (zł)</Label><Input type="text" inputMode="decimal" onWheel={noScroll} value={f.rate_week as string} onChange={e => set('rate_week', e.target.value)} /></div>
            <div className="space-y-1"><Label>Miesiąc (zł)</Label><Input type="text" inputMode="decimal" onWheel={noScroll} value={f.rate_month as string} onChange={e => set('rate_month', e.target.value)} /></div>
            <div className="space-y-1"><Label>Kaucja (zł)</Label><Input type="text" inputMode="decimal" onWheel={noScroll} value={f.deposit as string} onChange={e => set('deposit', e.target.value)} /></div>
          </div>
          <Button onClick={saveCard} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Zapisz stawki</Button>

          <div className="border-t pt-3">
            <div className="text-sm font-semibold mb-2">Progi rabatowe (rabat za długość najmu)</div>
            <ul className="space-y-1 mb-2">
              {tiers.map(t => <li key={t.id} className="flex items-center gap-2 text-sm border-b py-1"><span>od <b>{t.min_days}</b> dni → <b>−{t.discount_percent}%</b></span><div className="flex-1" /><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => delTier(t.id)}><Trash2 className="h-3 w-3" /></Button></li>)}
              {tiers.length === 0 && <li className="text-xs text-muted-foreground">Brak progów. Np. 7+ dni −10%, 30+ −20%.</li>}
            </ul>
            <div className="flex items-end gap-2">
              <div className="space-y-1"><Label className="text-xs">Od ilu dni</Label><Input className="w-24" type="text" inputMode="numeric" onWheel={noScroll} value={nt.min_days} onChange={e => setNt(s => ({ ...s, min_days: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">Rabat %</Label><Input className="w-24" type="text" inputMode="decimal" onWheel={noScroll} value={nt.discount_percent} onChange={e => setNt(s => ({ ...s, discount_percent: e.target.value }))} /></div>
              <Button variant="outline" onClick={addTier} className="gap-1"><Plus className="h-4 w-4" />Dodaj próg</Button>
            </div>
          </div>
          <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Zamknij</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
