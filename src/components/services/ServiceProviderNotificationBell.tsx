import { useState } from 'react';
import { Bell, Settings as SettingsIcon, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useWorkspaceNotifications } from '@/hooks/useWorkspaceNotifications';
import { cn } from '@/lib/utils';

interface Props {
  onOpenSettings: () => void;
}

export function ServiceProviderNotificationBell({ onOpenSettings }: Props) {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useWorkspaceNotifications();

  const top = notifications.slice(0, 10);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="Powiadomienia"
          className="text-primary hover:bg-primary/10 relative"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center text-[10px]">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold text-sm">Powiadomienia</div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => markAllAsRead()}>
                Oznacz wszystkie
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              onClick={() => { setOpen(false); onOpenSettings(); }}
            >
              <SettingsIcon className="h-3.5 w-3.5" /> Ustawienia
            </Button>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {top.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Brak powiadomień
            </div>
          ) : (
            top.map((n) => (
              <button
                key={n.id}
                onClick={() => markAsRead(n.id)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b last:border-0 hover:bg-muted/50 transition-colors',
                  !n.is_read && 'bg-primary/5'
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{n.title}</div>
                    {n.body && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</div>}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {new Date(n.created_at).toLocaleString('pl-PL')}
                    </div>
                  </div>
                  {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="p-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1"
            onClick={() => { setOpen(false); onOpenSettings(); }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ustawienia powiadomień
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
