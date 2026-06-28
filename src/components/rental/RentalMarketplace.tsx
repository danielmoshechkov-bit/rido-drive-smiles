import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Megaphone, Loader2, Upload, Star } from 'lucide-react';
import { noScroll } from '@/components/rental/rentalLib';
import { publishRentalListing, unpublishRentalListing, featureRentalListing, PublishOpts } from '@/components/rental/rentalListing';

export function RentalMarketplace({ companyId }: { companyId: string }) {
  const sb = supabase as any;
  const [rows, setRows] = useState<any[]>([]);
  const [tiers, setTiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState(30);
  const [pub, setPub] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: subs } = await sb.from('rental_subjects').select('id, title, status').eq('owner_company_id', companyId).eq('subject_kind', 'vehicle').order('created_at', { ascending: false });
    const ids = (subs || []).map((s: any) => s.id);
    let veh: Record<string, any> = {}, listed: Record<string, any[]> = {};
    if (ids.length) {
      const { data: vs } = await sb.from('rental_vehicles').select('*').in('subject_id', ids); veh = Object.fromEntries((vs || []).map((v: any) => [v.subject_id, v]));
      const { data: rl } = await sb.from('rental_listings').select('*').in('subject_id', ids).eq('status', 'active'); (rl || []).forEach((r: any) => { (listed[r.subject_id] = listed[r.subject_id] || []).push(r); });
    }
    setRows((subs || []).map((s: any) => ({ ...s, veh: veh[s.id] || {}, listings: listed[s.id] || [] })));
    const { data: t } = await sb.from('promotion_pricing').select('*').eq('listing_type', 'vehicle').order('price_pln');
    setTiers(t || []);
    setLoading(false);
  }, [companyId, sb]);
  useEffect(() => { load(); }, [load]);

  const doUnpublish = async (subjectId: string) => { await unpublishRentalListing(subjectId); toast.success('Wycofano z portalu'); load(); };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /> Giełda — publikacja ofert</h2>
      <Card><CardContent className="p-0">
        {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Pojazd</TableHead><TableHead>Na portalu</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.slice(0, shown).map(r => {
                const rent = r.listings.find((x: any) => x.kind === 'rental');
                const sale = r.listings.find((x: any) => x.kind === 'sale');
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{[r.veh.plate, r.veh.brand, r.veh.model].filter(Boolean).join(' ') || r.title}</TableCell>
                    <TableCell className="text-xs space-x-1">
                      {rent && <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5">Wynajem{rent.is_featured ? ' ★' : ''}</span>}
                      {sale && <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">Sprzedaż{sale.is_featured ? ' ★' : ''}</span>}
                      {!rent && !sale && <span className="text-muted-foreground">niepublikowane</span>}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => setPub(r)}><Upload className="h-3 w-3 mr-1" />Wystaw</Button>
                      {(rent || sale) && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => doUnpublish(r.id)}>Wycofaj</Button>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
      {rows.length > shown && <div className="flex justify-center"><Button variant="outline" size="sm" onClick={() => setShown(s => s + 30)}>Pokaż więcej ({rows.length - shown})</Button></div>}
      {pub && <PublishDialog sb={sb} companyId={companyId} row={pub} tiers={tiers} onClose={() => setPub(null)} onDone={() => { setPub(null); load(); }} />}
    </div>
  );
}

export function PublishDialog({ sb, companyId, row, tiers, onClose, onDone }: any) {
  const v = row.veh || {};
  const [kind, setKind] = useState<'rental' | 'sale'>('rental');
  const [f, setF] = useState({ price: v.rate_daily ?? '', weekly: v.rate_weekly ?? '', salePrice: '', city: '', phone: '', email: '', name: '', desc: '' });
  const [tier, setTier] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const set = (k: string, val: string) => setF(s => ({ ...s, [k]: val }));
  const num = (s: any) => { const n = parseFloat(String(s).replace(',', '.')); return Number.isFinite(n) ? n : null; };

  const publish = async () => {
    if (!f.phone.trim()) { toast.error('Podaj telefon kontaktowy'); return; }
    setBusy(true);
    try {
      const opts: PublishOpts = {
        kind, price: kind === 'sale' ? num(f.salePrice) : num(f.price), weeklyPrice: num(f.weekly),
        city: f.city, contactName: f.name, contactPhone: f.phone, contactEmail: f.email, description: f.desc,
      };
      const listingId = await publishRentalListing(companyId, row, v, opts);
      if (tier) { const t = tiers.find((x: any) => x.id === tier); await featureRentalListing(companyId, listingId, t); }
      toast.success(kind === 'sale' ? 'Wystawiono na sprzedaż' : 'Wystawiono na wynajem');
      onDone();
    } catch (e: any) { toast.error('Błąd publikacji: ' + (e.message || e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Wystaw na portal — {[v.plate, v.brand, v.model].filter(Boolean).join(' ') || row.title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant={kind === 'rental' ? 'default' : 'outline'} onClick={() => setKind('rental')}>Wynajem</Button>
            <Button size="sm" variant={kind === 'sale' ? 'default' : 'outline'} onClick={() => setKind('sale')}>Sprzedaż</Button>
          </div>
          {kind === 'rental' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Stawka dzienna (zł)</Label><Input type="text" inputMode="decimal" onWheel={noScroll} value={f.price} onChange={e => set('price', e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Stawka tygodniowa (zł)</Label><Input type="text" inputMode="decimal" onWheel={noScroll} value={f.weekly} onChange={e => set('weekly', e.target.value)} /></div>
            </div>
          ) : (
            <div className="space-y-1"><Label className="text-xs">Cena sprzedaży (zł)</Label><Input type="text" inputMode="decimal" onWheel={noScroll} value={f.salePrice} onChange={e => set('salePrice', e.target.value)} /></div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Miasto</Label><Input value={f.city} onChange={e => set('city', e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Telefon kontaktowy *</Label><Input value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Nazwa kontaktu</Label><Input value={f.name} onChange={e => set('name', e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">E-mail</Label><Input value={f.email} onChange={e => set('email', e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Opis</Label><Input value={f.desc} onChange={e => set('desc', e.target.value)} /></div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Star className="h-3 w-3" /> Wyróżnienie (opcjonalnie)</Label>
            <select value={tier} onChange={e => setTier(e.target.value)} className="h-10 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Bez wyróżnienia</option>
              {tiers.map((t: any) => <option key={t.id} value={t.id}>{t.placement} · {t.duration_days} dni · {t.price_pln} zł</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground">Płatność za wyróżnienie (P24) = przy deployu; teraz wyróżnienie ustawiane lokalnie.</p>
          </div>
          <div className="text-xs text-muted-foreground">Zdjęcia z karty auta ({Array.isArray(v.photos) ? v.photos.length : 0}) trafią do ogłoszenia.</div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Anuluj</Button><Button onClick={publish} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Opublikuj</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
