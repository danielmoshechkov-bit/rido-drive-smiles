import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';

interface Notification {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  invoice_id: string;
}

interface InvoiceNotificationBellProps {
  onViewInvoice?: (invoiceId: string) => void;
}

export function InvoiceNotificationBell({ onViewInvoice }: InvoiceNotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('invoice_notifications')
      .select('*')
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(20) as any;

    setNotifications(data || []);
  };

  const markAsRead = async (id: string) => {
    await supabase.from('invoice_notifications').update({ is_read: true }).eq('id', id) as any;
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const markAllRead = async () => {
    const ids = notifications.map(n => n.id);
    if (ids.length === 0) return;
    await supabase.from('invoice_notifications').update({ is_read: true }).in('id', ids) as any;
    setNotifications([]);
  };

  const unreadCount = notifications.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-destructive text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b flex items-center justify-between">
          <span className="font-semibold text-sm">Powiadomienia o fakturach</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllRead}>
              Oznacz wszystkie
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Brak nowych powiadomień
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                className="p-3 border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                onClick={() => {
                  if (onViewInvoice && n.invoice_id) onViewInvoice(n.invoice_id);
                  markAsRead(n.id);
                  setOpen(false);
                }}
              >
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{n.message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: pl })}
                </p>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
