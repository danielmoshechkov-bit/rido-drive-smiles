import { useState } from "react";
import { Bell, Check, CheckCheck, Trash2, X, MessageSquare, ListTodo, Users, FileText, Sparkles, AlertTriangle, Info, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useWorkspaceNotifications, WorkspaceNotification } from "@/hooks/useWorkspaceNotifications";
import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";

const TYPE_CONFIG: Record<string, { icon: any; color: string }> = {
  mention: { icon: MessageSquare, color: "text-blue-500" },
  task_assigned: { icon: ListTodo, color: "text-primary" },
  task_completed: { icon: Check, color: "text-green-500" },
  deadline: { icon: Calendar, color: "text-orange-500" },
  member_joined: { icon: Users, color: "text-violet-500" },
  document: { icon: FileText, color: "text-cyan-500" },
  ai: { icon: Sparkles, color: "text-amber-500" },
  warning: { icon: AlertTriangle, color: "text-red-500" },
  info: { icon: Info, color: "text-muted-foreground" },
};

function NotificationItem({ notif, onRead, onDelete, onClick }: {
  notif: WorkspaceNotification;
  onRead: () => void;
  onDelete: () => void;
  onClick?: () => void;
}) {
  const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.info;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 border-b border-border/50 transition-colors cursor-pointer group",
        !notif.is_read ? "bg-primary/5" : "hover:bg-muted/50"
      )}
      onClick={() => {
        if (!notif.is_read) onRead();
        onClick?.();
      }}
    >
      <div className={cn("mt-0.5 shrink-0", config.color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-xs leading-tight", !notif.is_read && "font-semibold")}>
            {notif.title}
          </p>
          {!notif.is_read && (
            <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
          )}
        </div>
        {notif.body && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          {notif.sender_name && (
            <span className="text-[10px] text-muted-foreground">{notif.sender_name}</span>
          )}
          <span className="text-[10px] text-muted-foreground/70">
            {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: pl })}
          </span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

interface Props {
  onNavigate?: (type: string, id: string) => void;
}

export function WorkspaceNotificationCenter({ onNavigate }: Props) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, clearAll } = useWorkspaceNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filtered = filter === 'unread' ? notifications.filter(n => !n.is_read) : notifications;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-bold">Powiadomienia</h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={markAllAsRead}>
                <CheckCheck className="h-3.5 w-3.5" />
                Przeczytaj wszystkie
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearAll}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-3 py-2 border-b">
          {(['all', 'unread'] as const).map(f => (
            <button
              key={f}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'Wszystkie' : `Nieprzeczytane (${unreadCount})`}
            </button>
          ))}
        </div>

        {/* List */}
        <ScrollArea className="max-h-[400px]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {filter === 'unread' ? 'Brak nieprzeczytanych' : 'Brak powiadomień'}
              </p>
            </div>
          ) : (
            filtered.map(notif => (
              <NotificationItem
                key={notif.id}
                notif={notif}
                onRead={() => markAsRead(notif.id)}
                onDelete={() => deleteNotification(notif.id)}
                onClick={() => {
                  if (notif.link_type && notif.link_id) {
                    onNavigate?.(notif.link_type, notif.link_id);
                    setOpen(false);
                  }
                }}
              />
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
