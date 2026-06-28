import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CalendarCheck, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Widget rezerwacji online na ofercie WYNAJMU (giełda). Self-contained,
 * renderuje się TYLKO gdy oferta jest zmapowana do modułu wynajmu
 * (rental_listing_availability → mapped). Dla sprzedaży/zwykłych ofert: nic.
 * Zapis przez RPC anon rental_create_gielda_booking (bez logowania).
 */
export function RentalReserveWidget({ listingId, transactionType }: { listingId: string; transactionType?: string | null }) {
  const sb = supabase as any;
  const [mapped, setMapped] = useState<boolean | null>(null);
  const [f, setF] = useState({ start: '', end: '', name: '', phone: '', email: '' });
  const [avail, setAvail] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }));

  // Gating po stronie danych: RPC zwraca mapped=true TYLKO dla ofert wynajmu
  // (rental_listings.kind='rental') wystawionych z modułu. Sprzedaż/zwykłe oferty → mapped=false.
  useEffect(() => {
    if (!listingId) { setMapped(false); return; }
    (async () => { const { data } = await sb.rpc('rental_listing_availability', { p_listing_id: listingId, p_start: null, p_end: null }); setMapped(!!data?.mapped); })();
  }, [listingId, sb]);

  if (mapped !== true) return null;

  const check = async () => {
    if (!f.start || !f.end) { toast.error('Podaj termin'); return; }
    const { data } = await sb.rpc('rental_listing_availability', { p_listing_id: listingId, p_start: new Date(f.start).toISOString(), p_end: new Date(f.end).toISOString() });
    setAvail(data);
  };
  const reserve = async () => {
    if (!f.start || !f.end || !f.name.trim() || !f.phone.trim()) { toast.error('Uzupełnij termin, imię i telefon'); return; }
    setBusy(true);
    try {
      const { data } = await sb.rpc('rental_create_gielda_booking', { p_listing_id: listingId, p_start: new Date(f.start).toISOString(), p_end: new Date(f.end).toISOString(), p_name: f.name.trim(), p_phone: f.phone.trim(), p_email: f.email.trim() || null, p_notes: null });
      if (data?.ok) { setDone(data.booking_number); toast.success('Rezerwacja wysłana: ' + data.booking_number); }
      else toast.error(data?.error === 'busy' ? 'Termin zajęty — wybierz inny.' : 'Nie udało się zarezerwować.');
    } catch (e: any) { toast.error(e.message || 'Błąd'); } finally { setBusy(false); }
  };

  if (done) return (
    <Card className="border-green-300 bg-green-50"><CardContent className="py-4 flex items-center gap-2 text-green-800">
      <CheckCircle2 className="h-5 w-5" /> Rezerwacja wysłana ({done}). Wynajmujący potwierdzi termin.
    </CardContent></Card>
  );

  return (
    <Card><CardContent className="py-4 space-y-3">
      <div className="font-semibold flex items-center gap-2"><CalendarCheck className="h-5 w-5 text-primary" /> Zarezerwuj online</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label className="text-xs">Od</Label><Input type="datetime-local" value={f.start} onChange={e => { set('start', e.target.value); setAvail(null); }} /></div>
        <div className="space-y-1"><Label className="text-xs">Do</Label><Input type="datetime-local" value={f.end} onChange={e => { set('end', e.target.value); setAvail(null); }} /></div>
        <div className="space-y-1"><Label className="text-xs">Imię i nazwisko</Label><Input value={f.name} onChange={e => set('name', e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Telefon</Label><Input value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
        <div className="space-y-1 col-span-2"><Label className="text-xs">E-mail (opcjonalnie)</Label><Input value={f.email} onChange={e => set('email', e.target.value)} /></div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={check}>Sprawdź dostępność</Button>
        <Button onClick={reserve} disabled={busy || (avail && !avail.available)}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Zarezerwuj</Button>
      </div>
      {avail && (avail.available
        ? <div className="text-sm text-green-700 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Termin wolny</div>
        : <div className="text-sm text-destructive flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Termin zajęty</div>)}
    </CardContent></Card>
  );
}
