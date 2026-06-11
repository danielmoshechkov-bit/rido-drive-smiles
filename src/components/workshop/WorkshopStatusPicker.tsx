import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, MessageSquarePlus, AlertCircle } from 'lucide-react';
import { useWorkshopStatuses } from '@/hooks/useWorkshop';
import { getStatusStyle } from '@/utils/workshopStatusStyle';
import { toast } from 'sonner';

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
  const { data: statuses = [] } = useWorkshopStatuses(providerId);
  const [stations, setStations] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [noteDialog, setNoteDialog] = useState<{ name: string } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!providerId) return;
    (supabase.from('workshop_stations') as any)
      .select('id, name, color, is_active')
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }: any) => setStations(data || []));
  }, [providerId]);

  const items: Item[] = [
    ...statuses.map((s: any) => ({ id: s.id, name: s.name, color: s.color, kind: 'status' as const })),
    ...stations
      .filter(st => !statuses.some((s: any) => s.name === st.name))
      .map(st => ({ id: st.id, name: st.name, color: st.color, kind: 'station' as const })),
  ];

  const apply = async (name: string, withNote?: string) => {
    setBusy(true);
    try {
      const st = stations.find(s => s.name === name);
      const payload: any = { status_name: name };
      if (withNote) payload.has_unread_notes = true;
      // when moving to a station — persist station_id so employees of that station see it
      if (st) payload.station_id = st.id;
      await (supabase.from('workshop_orders') as any).update(payload).eq('id', orderId);
      if (withNote) {
        const { data: { user } } = await supabase.auth.getUser();
        await (supabase.from('workshop_order_events') as any).insert({
          order_id: orderId,
          event_type: 'note',
          note: withNote,
          actor_user_id: user?.id || null,
          actor_role: 'admin',
          to_status: name,
          station_id: st?.id || null,
        });
      }
      if (st) {
        supabase.functions.invoke('workshop-notify-employee', {
          body: { order_id: orderId, event: 'department_changed', station_id: st.id, status_name: name },
        }).catch(() => {});
      }
      onChanged(name, withNote);
      toast.success(`Status: ${name}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      setNoteDialog(null);
      setNote('');
    }
  };

  const style = getStatusStyle(currentStatus);

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button className="cursor-pointer inline-flex items-center gap-1">
            <Badge className={`${style.badge} ${size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs'} whitespace-nowrap transition-opacity`}>
              {currentStatus || 'Brak'}
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
                className={`group flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent cursor-pointer ${active ? 'bg-accent font-medium' : ''}`}
                onClick={() => apply(it.name)}
              >
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: it.color }} />
                <span className="flex-1 text-sm">{it.name}</span>
                {it.kind === 'station' && (
                  <Badge variant="outline" className="text-[9px] uppercase">stanowisko</Badge>
                )}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setOpen(false);
                    setTimeout(() => { setNoteDialog({ name: it.name }); setNote(''); }, 60);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 inline-flex items-center justify-center rounded hover:bg-background border"
                  title="Zmień status z notatką dla pracownika"
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
              Notatka do statusu: {noteDialog?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Wpisz informację dla pracowników (np. „Mycie po naprawie", „Sprawdzić zacisk po lewej"). Pojawi się przy zleceniu z wykrzyknikiem.
            </p>
            <Textarea
              autoFocus
              rows={4}
              placeholder="Treść notatki…"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialog(null)} disabled={busy}>Anuluj</Button>
            <Button
              onClick={() => noteDialog && apply(noteDialog.name, note.trim() || undefined)}
              disabled={busy || !note.trim()}
            >
              Zapisz i zmień status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
