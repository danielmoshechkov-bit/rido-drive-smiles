import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, MessageSquarePlus, AlertCircle } from 'lucide-react';
import { useWorkshopStatuses, useWorkshopStations } from '@/hooks/useWorkshop';
import { useWorkshopStatusStyles } from '@/hooks/useWorkshopStatusStyles';
import { translateWorkshopStatus } from '@/utils/workshopStatusStyle';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

type Item = { id: string; name: string; color: string; kind: 'status' | 'station' };

interface Props {
  providerId: string;
  orderId: string;
  currentStatus?: string | null;
  hasUnreadNotes?: boolean;
  onChanged: (newStatus: string, note?: string) => void;
  size?: 'sm' | 'xs';
}

export function WorkshopStatusPicker({
  providerId, orderId, currentStatus, hasUnreadNotes, onChanged, size = 'sm',
}: Props) {
  const { t } = useTranslation();
  const { data: statuses = [] } = useWorkshopStatuses(providerId);
  // PERF B3: picker renderuje się w każdym wierszu listy — surowy fetch w
  // useEffect robił 50 identycznych zapytań przy 50 zleceniach. Współdzielony
  // hook react-query = 1 zapytanie na provider.
  const { data: stations = [] } = useWorkshopStations(providerId);
  // Kolory: badge + kropka z jednego źródła (paleta Zalecane / hexy per provider).
  const { getStyle } = useWorkshopStatusStyles(providerId);
  const [open, setOpen] = useState(false);
  const [noteDialog, setNoteDialog] = useState<{ name: string } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const items: Item[] = [
    ...statuses.map((s: any) => ({ id: s.id, name: s.name, color: s.color, kind: 'status' as const })),
    ...stations
      .filter(st => !statuses.some((s: any) => s.name === st.name))
      .map(st => ({ id: st.id, name: st.name, color: st.color, kind: 'station' as const })),
  ];

  const apply = async (name: string, withNote?: string) => {
    setBusy(true);
    const st = stations.find(s => s.name === name);
    try {
      const payload: any = { status_name: name };
      if (withNote) payload.has_unread_notes = true;
      if (st) payload.station_id = st.id;
      // Znacznik zakończenia — żeby raporty "Licz po: Zakończenia" działały.
      if (name === 'Zakończone') payload.completed_at = new Date().toISOString();
      // Fire the main DB update and surface the change immediately so the
      // caller can update its UI / open the ready-SMS dialog without waiting
      // on event logging + station handover (which run in the background).
      await (supabase.from('workshop_orders') as any).update(payload).eq('id', orderId);
      onChanged(name, withNote);
      toast.success(t('workshop.statusPicker.statusToast', { status: translateWorkshopStatus(name, t) }));
      setOpen(false);
      setNoteDialog(null);
      setNote('');

      // Background: write event log and run station handover (non-blocking)
      (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const actorName = user?.user_metadata?.full_name || user?.email || null;
          // ZAWSZE loguj zmianę statusu (wcześniej event leciał tylko z notatką, więc
          // zwykłe zmiany statusu nie zostawały w historii zlecenia).
          await (supabase.from('workshop_order_events') as any).insert({
            order_id: orderId,
            provider_id: providerId,
            event_type: withNote ? 'note' : 'status_change',
            note: withNote || null,
            actor_user_id: user?.id || null,
            actor_name: actorName,
            actor_role: 'admin',
            from_status: currentStatus || null,
            to_status: name,
            station_id: st?.id || null,
          });
          const { applyStationHandover } = await import('@/utils/workshopStationHandover');
          const baseName = name.replace(/\s*[—-]\s*(realizacja|gotowe|w trakcie|w realizacji)\s*$/i, '').trim();
          await applyStationHandover({ orderId, providerId, newStatus: baseName });
        } catch {/* best-effort */}
      })();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const style = getStyle(currentStatus);

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button className="cursor-pointer inline-flex items-center gap-1">
            <Badge className={`${style.badgeClass} ${size === 'xs' ? 'text-[11px] px-1.5 py-0.5' : 'text-[13px] px-2 py-0.5'} font-semibold whitespace-nowrap transition-opacity`} style={style.badgeStyle}>
              {translateWorkshopStatus(currentStatus, t)}
            </Badge>
            {hasUnreadNotes && (
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="min-w-[260px] max-h-[80vh] overflow-y-auto z-40 p-1">
          {items.map(it => {
            const active = it.name === currentStatus;
            return (
              <div
                key={`${it.kind}-${it.id}`}
                // Wprowadzenie pokazuje palcem konkretne pozycje tej listy, wiec
                // musi umiec je znalezc — same nazwy sa tlumaczone, a te znaczniki nie.
                // W bazie stoi „Gotowy do odbioru", a na ekranie „Gotowe do
                // odbioru" (tlumaczenie) — dopasowujemy po poczatku nazwy.
                data-tour={
                  it.name.startsWith('Gotow') ? 'status-gotowe'
                  : it.name.startsWith('Zakończ') ? 'status-zakonczone'
                  : undefined
                }
                className={`group flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent cursor-pointer ${active ? 'bg-accent font-medium' : ''}`}
                onClick={() => apply(it.name)}
              >
                {/* Kropka: dla statusów to samo źródło koloru co badge; stanowiska mają własny kolor. */}
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: it.kind === 'station' ? it.color : getStyle(it.name).dotColor }} />
                <span className="flex-1 text-sm">{translateWorkshopStatus(it.name, t)}</span>
                {it.kind === 'station' && (
                  <Badge variant="outline" className="text-[9px] uppercase">{t('workshop.statusPicker.stationBadge')}</Badge>
                )}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setOpen(false);
                    setTimeout(() => { setNoteDialog({ name: it.name }); setNote(''); }, 60);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 inline-flex items-center justify-center rounded hover:bg-background border"
                  title={t('workshop.statusPicker.noteTooltip')}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!noteDialog} onOpenChange={o => !o && setNoteDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4" />
              {t('workshop.statusPicker.noteDialogTitle', { status: translateWorkshopStatus(noteDialog?.name, t) })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {t('workshop.statusPicker.noteHint')}
            </p>
            <Textarea
              autoFocus
              rows={4}
              placeholder={t('workshop.statusPicker.notePlaceholder')}
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialog(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button
              onClick={() => noteDialog && apply(noteDialog.name, note.trim() || undefined)}
              disabled={busy || !note.trim()}
            >
              {t('workshop.statusPicker.saveAndChange')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
