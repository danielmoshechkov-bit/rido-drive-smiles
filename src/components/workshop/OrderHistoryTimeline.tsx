import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageSquarePlus, History, ArrowRight, HandHelping, Undo2, ClipboardCheck, Wrench, StickyNote, UserPlus, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { translateWorkshopStatus } from '@/utils/workshopStatusStyle';

interface Props {
  orderId: string;
  providerId: string;
}

type EventRow = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  actor_name: string | null;
  actor_role: string | null;
  created_at: string;
};

const ICONS: Record<string, JSX.Element> = {
  status_change: <ArrowRight className="h-4 w-4" />,
  claimed: <HandHelping className="h-4 w-4 text-green-600" />,
  released: <Undo2 className="h-4 w-4 text-orange-600" />,
  assigned: <UserPlus className="h-4 w-4 text-blue-600" />,
  unassigned: <Undo2 className="h-4 w-4 text-orange-600" />,
  quote_done: <ClipboardCheck className="h-4 w-4 text-purple-600" />,
  repair_started: <Wrench className="h-4 w-4 text-amber-600" />,
  repair_done: <ClipboardCheck className="h-4 w-4 text-green-600" />,
  note_added: <StickyNote className="h-4 w-4 text-yellow-600" />,
  note: <StickyNote className="h-4 w-4 text-yellow-600" />,
  station_assigned: <Building2 className="h-4 w-4 text-indigo-600" />,
};

const NOTE_PREVIEW_LEN = 140;

export function OrderHistoryTimeline({ orderId, providerId }: Props) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase.from('workshop_order_events') as any)
      .select('id, event_type, from_status, to_status, note, actor_name, actor_role, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    setEvents(data || []);
    setLoading(false);

    // mark order notes as read
    await (supabase.from('workshop_orders') as any)
      .update({ has_unread_notes: false }).eq('id', orderId);
  };

  useEffect(() => { if (orderId) load(); /* eslint-disable-next-line */ }, [orderId]);

  const addNote = async () => {
    const text = note.trim();
    if (!text) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const name = user?.user_metadata?.full_name || user?.email || t('workshop.timeline.defaultUser');
      const { error } = await (supabase.from('workshop_order_events') as any).insert({
        order_id: orderId,
        provider_id: providerId,
        event_type: 'note_added',
        note: text,
        actor_user_id: user?.id || null,
        actor_name: name,
        actor_role: 'admin',
      });
      if (error) throw error;
      await (supabase.from('workshop_orders') as any)
        .update({ has_unread_notes: true }).eq('id', orderId);
      setNote('');
      toast.success(t('workshop.timeline.noteAdded'));
      await load();
    } catch (e: any) {
      toast.error(e.message || t('workshop.timeline.saveError'));
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-yellow-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquarePlus className="h-4 w-4 text-yellow-700" /> {t('workshop.timeline.addInternalNote')}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('workshop.timeline.internalNoteHint')}
        </p>
        <Textarea
          value={note} onChange={e => setNote(e.target.value)}
          placeholder={t('workshop.timeline.notePlaceholder')}
          rows={3}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={addNote} disabled={saving || !note.trim()}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MessageSquarePlus className="h-4 w-4 mr-1" />}
            {t('workshop.timeline.addNote')}
          </Button>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 text-sm font-semibold mb-2">
          <History className="h-4 w-4 text-primary" /> {t('workshop.timeline.eventHistory')}
        </div>
        {loading ? (
          <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : events.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-6">{t('workshop.timeline.noEvents')}</div>
        ) : (
          <ol className="relative border-l-2 border-muted ml-3 space-y-3">
            {events.map(ev => (
              <li key={ev.id} className="pl-4 -ml-[7px]">
                <div className="absolute -left-[10px] mt-0.5 h-5 w-5 rounded-full bg-background border-2 border-muted flex items-center justify-center">
                  {ICONS[ev.event_type] || <ArrowRight className="h-3 w-3" />}
                </div>
                <div className="rounded-md border bg-card p-2.5">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    {/* CO za zmiana */}
                    <span className="font-medium">{t(`workshop.events.${ev.event_type}`, { defaultValue: ev.event_type === 'note' ? t('workshop.events.note_added', { defaultValue: 'Notatka' }) : ev.event_type })}</span>
                    {(ev.event_type === 'status_change' || (ev.from_status && ev.to_status)) && (
                      <span className="text-muted-foreground">
                        {ev.from_status ? translateWorkshopStatus(ev.from_status, t) : '—'} <ArrowRight className="h-3 w-3 inline" /> <b>{translateWorkshopStatus(ev.to_status, t)}</b>
                      </span>
                    )}
                    {/* KIEDY */}
                    <span className="ml-auto text-muted-foreground whitespace-nowrap">
                      {format(new Date(ev.created_at), 'dd.MM.yyyy HH:mm')}
                    </span>
                  </div>
                  {/* CO wpisano — krótkie wpisy w całości, długie rozwijane */}
                  {ev.note && (() => {
                    const isLong = ev.note.length > NOTE_PREVIEW_LEN;
                    const isOpen = expanded[ev.id];
                    const shown = isLong && !isOpen ? ev.note.slice(0, NOTE_PREVIEW_LEN) + '…' : ev.note;
                    return (
                      <div className="mt-1.5 text-sm whitespace-pre-wrap text-foreground/90 bg-yellow-50 rounded px-2 py-1.5 border border-yellow-200">
                        {shown}
                        {isLong && (
                          <button
                            type="button"
                            onClick={() => setExpanded(s => ({ ...s, [ev.id]: !isOpen }))}
                            className="ml-1 text-xs font-medium text-primary hover:underline"
                          >
                            {isOpen ? t('workshop.timeline.collapse', 'zwiń') : t('workshop.timeline.expand', 'rozwiń')}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  {/* KTO */}
                  <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] py-0">{ev.actor_role || 'system'}</Badge>
                    {ev.actor_name || t('workshop.timeline.system')}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
