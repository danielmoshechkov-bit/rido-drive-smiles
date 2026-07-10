import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bell, Loader2, CheckCheck } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
  order_id: string | null;
};

export function EmployeeNotificationsBell() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = async (userId: string) => {
    setLoading(true);
    const { data } = await (supabase.from('workshop_employee_notifications') as any)
      .select('*').eq('employee_user_id', userId)
      .order('created_at', { ascending: false }).limit(30);
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUid(user?.id ?? null));
  }, []);

  // PERF B4: był jednocześnie polling co 30 s ORAZ realtime bez filtra (każdy
  // INSERT powiadomienia w całej bazie = refetch), a kanał nazywany
  // Math.random() mnożył subskrypcje przy remountach. Zostaje sam realtime,
  // filtrowany po użytkowniku, ze stabilną nazwą kanału.
  useEffect(() => {
    if (!uid) return;
    load(uid);
    const ch = supabase.channel(`emp-notif-${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'workshop_employee_notifications', filter: `employee_user_id=eq.${uid}` },
        () => load(uid),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid]);

  const unread = items.filter(i => !i.is_read).length;

  const markAllRead = async () => {
    if (!uid) return;
    await (supabase.from('workshop_employee_notifications') as any)
      .update({ is_read: true }).eq('employee_user_id', uid).eq('is_read', false);
    await load(uid);
  };

  const click = async (n: Notification) => {
    await (supabase.from('workshop_employee_notifications') as any).update({ is_read: true }).eq('id', n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
    if (uid) await load(uid);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-2.5 border-b">
          <div className="font-semibold text-sm">{t('workshop.notifications.title')}</div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> {t('workshop.notifications.markAllRead')}
            </Button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : items.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground p-6">{t('workshop.notifications.empty')}</div>
          ) : (
            items.map(n => (
              <button key={n.id} onClick={() => click(n)}
                className={`w-full text-left p-2.5 border-b hover:bg-muted/40 ${!n.is_read ? 'bg-primary/5' : ''}`}>
                <div className="flex items-start gap-2">
                  {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{n.title}</div>
                    {n.body && <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(n.created_at), 'dd.MM HH:mm')}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
