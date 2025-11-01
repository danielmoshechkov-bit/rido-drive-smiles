import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSystemAlerts } from '@/hooks/useSystemAlerts';
import { cn } from '@/lib/utils';

interface SystemAlertsButtonProps {
  userType?: 'admin' | 'fleet';
  fleetId?: string;
}

export function SystemAlertsButton({ userType = 'admin', fleetId }: SystemAlertsButtonProps) {
  const { alerts, unreadCount, markAsResolved } = useSystemAlerts({ fleetId });

  const pendingAlerts = alerts.filter(a => a.status === 'pending').slice(0, 5);

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'text-destructive';
      case 'warning':
        return 'text-warning';
      case 'new_driver':
        return 'text-success';
      default:
        return 'text-muted-foreground';
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'error':
        return '🔴';
      case 'warning':
        return '🟡';
      case 'new_driver':
        return '🟢';
      default:
        return 'ℹ️';
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Informacje z systemu</span>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {unreadCount} nowych
            </Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {pendingAlerts.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            Brak nowych powiadomień
          </div>
        ) : (
          <>
            {pendingAlerts.map((alert) => (
              <DropdownMenuItem
                onClick={() => {
                  window.location.href = '/admin/dashboard?tab=system-alerts';
                }}
                className="flex flex-col items-start gap-1 p-3 cursor-pointer"
              >
                <div className="flex items-center gap-2 w-full">
                  <span>{getAlertIcon(alert.type)}</span>
                  <span className={cn('font-medium text-sm', getAlertColor(alert.type))}>
                    {alert.title}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground line-clamp-2">
                  {alert.description}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(alert.created_at).toLocaleString('pl-PL')}
                </span>
              </DropdownMenuItem>
            ))}
            
            {userType === 'admin' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    window.location.href = '/admin/dashboard?tab=system-alerts';
                  }}
                  className="justify-center font-medium text-primary"
                >
                  Zobacz wszystkie
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
