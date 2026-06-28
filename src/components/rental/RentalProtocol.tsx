import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Camera, ImagePlus, Loader2, Plus } from 'lucide-react';
import { uploadRentalFile, noScroll } from '@/components/rental/rentalLib';

export function RentalProtocol({ companyId, initialBookingId }: { companyId: string; initialBookingId?: string }) {
  const sb = supabase as any;
  const [bookings, setBookings] = useState<any[]>([]);
  const [bookingId, setBookingId] = useState(initialBookingId || '');

  useEffect(() => {
    (async () => {
      const { data } = await sb.from('bookings')
        .select('id, booking_number, renter_name, status').eq('company_id', companyId)
        .order('created_at', { ascending: false });
      setBookings(data || []);
    })();
  }, [companyId, sb]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2"><Camera className="h-5 w-5 text-primary" /> Protokół wydania/zwrotu</h2>

      <div className="max-w-md space-y-1.5">
        <Label>Rezerwacja</Label>
        <Select value={bookingId} onValueChange={setBookingId}>
          <SelectTrigger><SelectValue placeholder="Wybierz rezerwację" /></SelectTrigger>
          <SelectContent>
            {bookings.map(b => <SelectItem key={b.id} value={b.id}>{b.booking_number} · {b.renter_name} ({b.status})</SelectItem>)}
          </SelectContent>
        </Select>
        {bookings.length === 0 && <p className="text-xs text-muted-foreground">Brak rezerwacji — utwórz najpierw zlecenie na wynajem.</p>}
      </div>

      {bookingId && (
        <div className="grid md:grid-cols-2 gap-4">
          <Phase sb={sb} companyId={companyId} bookingId={bookingId} phase="handover" title="Wydanie (stan przed)" />
          <Phase sb={sb} companyId={companyId} bookingId={bookingId} phase="return" title="Zwrot (stan po)" />
        </div>
      )}
    </div>
  );
}

function Phase({ sb, companyId, bookingId, phase, title }: any) {
  const [protocol, setProtocol] = useState<any | null>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [damages, setDamages] = useState<any[]>([]);
  const [mileage, setMileage] = useState('');
  const [fuel, setFuel] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [dmg, setDmg] = useState({ location_label: '', description: '', cost_estimate: '' });

  const load = useCallback(async () => {
    const { data: p } = await sb.from('rental_protocols').select('*').eq('booking_id', bookingId).eq('phase', phase).maybeSingle();
    setProtocol(p || null);
    setMileage(p?.mileage != null ? String(p.mileage) : '');
    setFuel(p?.fuel_level || '');
    setNotes(p?.notes || '');
    if (p) {
      const { data: ph } = await sb.from('rental_protocol_photos').select('*').eq('protocol_id', p.id).order('taken_at');
      setPhotos(ph || []);
    } else setPhotos([]);
    const { data: dm } = await sb.from('rental_damages').select('*').eq('booking_id', bookingId).eq('phase', phase).order('created_at');
    setDamages(dm || []);
  }, [sb, bookingId, phase]);

  useEffect(() => { load(); }, [load]);

  const ensureProtocol = async (): Promise<string> => {
    if (protocol) {
      await sb.from('rental_protocols').update({
        mileage: mileage ? parseInt(mileage, 10) : null, fuel_level: fuel || null, notes: notes || null,
      }).eq('id', protocol.id);
      return protocol.id;
    }
    const { data, error } = await sb.from('rental_protocols').insert({
      company_id: companyId, booking_id: bookingId, phase,
      mileage: mileage ? parseInt(mileage, 10) : null, fuel_level: fuel || null, notes: notes || null,
    }).select('id').single();
    if (error) throw error;
    return data.id;
  };

  const saveProtocol = async () => {
    setBusy(true);
    try { await ensureProtocol(); toast.success('Protokół zapisany'); load(); }
    catch (e: any) { toast.error(e.message || 'Błąd'); } finally { setBusy(false); }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files) return; setBusy(true);
    try {
      const pid = await ensureProtocol();
      for (let i = 0; i < files.length; i++) {
        const url = await uploadRentalFile(`${bookingId}/${phase}`, files[i]);
        await sb.from('rental_protocol_photos').insert({ protocol_id: pid, company_id: companyId, category: phase, file_url: url });
      }
      toast.success('Zdjęcia dodane'); load();
    } catch (e: any) { toast.error(e.message || 'Błąd'); } finally { setBusy(false); }
  };

  const addDamage = async () => {
    if (!dmg.description.trim()) { toast.error('Opisz szkodę'); return; }
    await sb.from('rental_damages').insert({
      company_id: companyId, booking_id: bookingId, phase,
      location_label: dmg.location_label || null, description: dmg.description,
      cost_estimate: dmg.cost_estimate ? parseFloat(dmg.cost_estimate.replace(',', '.')) : null,
    });
    setDmg({ location_label: '', description: '', cost_estimate: '' }); toast.success('Szkoda dodana'); load();
  };

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="font-semibold">{title}</div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><Label className="text-xs">Przebieg</Label>
            <Input type="text" inputMode="numeric" onWheel={noScroll} value={mileage} onChange={e => setMileage(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Paliwo</Label>
            <Input value={fuel} onChange={e => setFuel(e.target.value)} placeholder="np. 1/2, pełny" /></div>
        </div>
        <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Uwagi…" />
        <Button size="sm" variant="outline" onClick={saveProtocol} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Zapisz protokół
        </Button>

        <div>
          <Label className="text-xs">Zdjęcia</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {photos.map(p => <img key={p.id} src={p.file_url} alt="" className="h-16 w-16 rounded object-cover border" />)}
            <label className="h-16 w-16 rounded border border-dashed flex items-center justify-center cursor-pointer hover:bg-accent/50">
              <ImagePlus className="h-5 w-5 text-muted-foreground" />
              <input type="file" accept="image/*" multiple className="hidden" onChange={e => addPhotos(e.target.files)} />
            </label>
          </div>
        </div>

        <div>
          <Label className="text-xs">Szkody</Label>
          <ul className="space-y-1 text-sm mt-1">
            {damages.map(d => (
              <li key={d.id} className="flex items-center gap-2 border-b py-1">
                <span className="font-medium">{d.location_label || '—'}</span>
                <span className="flex-1 text-muted-foreground truncate">{d.description}</span>
                {d.cost_estimate != null && <span>{d.cost_estimate} zł</span>}
              </li>
            ))}
            {damages.length === 0 && <li className="text-muted-foreground text-xs">Brak szkód.</li>}
          </ul>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <Input value={dmg.location_label} onChange={e => setDmg(d => ({ ...d, location_label: e.target.value }))} placeholder="Miejsce" />
            <Input value={dmg.description} onChange={e => setDmg(d => ({ ...d, description: e.target.value }))} placeholder="Opis szkody" />
            <div className="flex gap-1">
              <Input type="text" inputMode="decimal" onWheel={noScroll} value={dmg.cost_estimate} onChange={e => setDmg(d => ({ ...d, cost_estimate: e.target.value }))} placeholder="Koszt" />
              <Button size="icon" variant="outline" onClick={addDamage}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
