// Simple station view: for non-mechanic stations (e.g. Myjnia, Geometria).
// Shows vehicle + admin's note + "Historia naprawy" + "Zakończ" button.
import { useEffect, useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, History, Car, StickyNote, Play } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkshopTranslations, TranslatableField } from '@/hooks/useWorkshopTranslations';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string | null;
  stationName?: string | null;
  onDone?: () => void;
}

export function StationOrderNoteDialog({ open, onOpenChange, orderId, stationName, onDone }: Props) {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [note, setNote] = useState<string>('');
  const [allEvents, setAllEvents] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !orderId) return;
    (async () => {
      setLoading(true);
      setShowHistory(false);
      const { data: o } = await (supabase.from('workshop_orders') as any)
        .select('id, order_number, status_name, vehicle_id, description, mileage, provider_id')
        .eq('id', orderId).maybeSingle();
      setOrder(o);
      if (o?.vehicle_id) {
        const { data: v } = await (supabase.from('workshop_vehicles') as any)
          .select('id, brand, model, plate, year').eq('id', o.vehicle_id).maybeSingle();
        setVehicle(v);
      }
      // latest admin note targeting this station / status
      const { data: evs } = await (supabase.from('workshop_order_events') as any)
        .select('id, note, to_status, created_at, actor_name')
        .eq('order_id', orderId)
        .eq('event_type', 'note')
        .order('created_at', { ascending: false });
      setAllEvents(evs || []);
      const latestForStation = (evs || []).find((e: any) =>
        stationName ? e.to_status === stationName : true);
      setNote(latestForStation?.note || (evs || [])[0]?.note || '');
      setLoading(false);
    })();
  }, [open, orderId, stationName]);

  // Worker accepts the handover and starts the work on this station.
  // Status becomes "<Station> — realizacja".
  const start = async () => {
    if (!orderId || !stationName) return;
    setBusy(true);
    try {
      const newStatus = `${stationName} — realizacja`;
      await (supabase.from('workshop_orders') as any)
        .update({ status_name: newStatus, has_unread_notes: false })
        .eq('id', orderId);
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase.from('workshop_order_events') as any).insert({
        order_id: orderId,
        provider_id: order?.provider_id,
        event_type: 'status_change',
        to_status: newStatus,
        note: `Pracownik przyjął zlecenie na stanowisku: ${stationName}`,
        actor_user_id: user?.id || null,
        actor_role: 'employee',
      });
      toast.success(`Rozpoczęto: ${stationName}`);
      onDone?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Błąd');
    } finally {
      setBusy(false);
    }
  };

  // Worker finishes the work on this station.
  // Status becomes "<Station> — gotowe" and admin is notified.
  const finish = async () => {
    if (!orderId) return;
    setBusy(true);
    try {
      const doneStatus = stationName ? `${stationName} — gotowe` : 'Gotowy do odbioru';
      await (supabase.from('workshop_orders') as any)
        .update({ status_name: doneStatus, has_unread_notes: false, station_id: null })
        .eq('id', orderId);
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase.from('workshop_order_events') as any).insert({
        order_id: orderId,
        provider_id: order?.provider_id,
        event_type: 'status_change',
        to_status: doneStatus,
        note: stationName ? `Zakończono na stanowisku: ${stationName}` : null,
        actor_user_id: user?.id || null,
        actor_role: 'employee',
      });
      supabase.functions.invoke('workshop-notify-employee', {
        body: { order_id: orderId, event: 'order_ready' },
      }).catch(() => {});
      toast.success('Zlecenie przekazane do administratora');
      onDone?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Błąd');
    } finally {
      setBusy(false);
    }
  };

  const inProgress = (order?.status_name || '').toLowerCase().includes('realizacj');

  // Translate note + events into the employee's language
  const fields = useMemo<TranslatableField[]>(() => {
    const out: TranslatableField[] = [];
    if (note && orderId) {
      out.push({ entity_type: 'note', entity_id: orderId, field: 'admin_note', text: note });
    }
    allEvents.forEach(e => {
      if (e.note) out.push({ entity_type: 'event', entity_id: String(e.id), field: 'note', text: String(e.note) });
    });
    return out;
  }, [note, allEvents, orderId]);
  const { t: tr } = useWorkshopTranslations(fields, 'pl');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {stationName && (
              <Badge className="bg-blue-500 text-white">{stationName}</Badge>
            )}
            <span>{order?.order_number || 'Zlecenie'}</span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-4 py-1">
              <div className="rounded-lg border p-3 flex items-center gap-3 bg-muted/30">
                <Car className="h-6 w-6 text-primary" />
                <div className="flex-1">
                  <div className="font-semibold">
                    {vehicle ? `${vehicle.brand || ''} ${vehicle.model || ''}`.trim() : 'Pojazd'}
                    {vehicle?.year && <span className="text-muted-foreground"> · {vehicle.year}</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {vehicle?.plate || '—'}
                    {order?.mileage ? ` · ${order.mileage} km` : ''}
                  </div>
                </div>
              </div>

              {note && orderId && (
                <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50/60 p-3">
                  <div className="text-xs font-semibold text-blue-800 flex items-center gap-1 mb-1">
                    <StickyNote className="h-3.5 w-3.5" /> Notatka od administratora
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{tr('note', orderId, 'admin_note', note)}</p>
                </div>
              )}

              <div>
                <Button
                  variant="outline" size="sm" className="w-full"
                  onClick={() => setShowHistory(s => !s)}
                >
                  <History className="h-4 w-4 mr-2" />
                  {showHistory ? 'Ukryj historię' : 'Historia naprawy'}
                </Button>
                {showHistory && (
                  <div className="mt-2 border rounded-lg divide-y max-h-60 overflow-y-auto">
                    {allEvents.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground text-center">Brak wpisów.</div>
                    ) : allEvents.map(e => (
                      <div key={e.id} className="p-2 text-xs">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>{e.to_status || '—'}</span>
                          <span>{new Date(e.created_at).toLocaleString('pl')}</span>
                        </div>
                        {e.note && <p className="mt-1 whitespace-pre-wrap">{tr('event', String(e.id), 'note', e.note)}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Zamknij
          </Button>
          {!inProgress ? (
            <Button onClick={start} disabled={busy || loading} className="bg-blue-600 hover:bg-blue-700">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Przyjmij — rozpocznij {stationName || ''}
            </Button>
          ) : (
            <Button onClick={finish} disabled={busy || loading} className="bg-emerald-600 hover:bg-emerald-700">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Gotowe — {stationName || 'zakończ'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
