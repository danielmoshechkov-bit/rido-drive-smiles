import { useState, useEffect } from "react";
import { Bell, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FleetInvitation {
  id: string;
  fleets: {
    name: string;
  };
  vehicles?: {
    plate: string;
    brand: string;
    model: string;
  } | null;
  created_at: string;
}

interface SystemAlert {
  id: string;
  type: string;
  category: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
}

interface DriverNotificationBellProps {
  driverId: string;
}

export function DriverNotificationBell({ driverId }: DriverNotificationBellProps) {
  const [invitations, setInvitations] = useState<FleetInvitation[]>([]);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadInvitations = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("fleet-invitations/my-invitations");
      
      if (error) throw error;
      
      setInvitations(data?.invitations || []);
    } catch (error) {
      console.error("Error loading invitations:", error);
    }
  };

  const loadAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from('system_alerts')
        .select('*')
        .eq('driver_id', driverId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      
      setAlerts(data || []);
    } catch (error) {
      console.error("Error loading alerts:", error);
    }
  };

  useEffect(() => {
    loadInvitations();
    loadAlerts();
    
    // Reload every 30 seconds
    const interval = setInterval(() => {
      loadInvitations();
      loadAlerts();
    }, 30000);
    return () => clearInterval(interval);
  }, [driverId]);

  const handleResponse = async (invitationId: string, status: 'accepted' | 'rejected') => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("fleet-invitations/respond", {
        body: {
          invitation_id: invitationId,
          status
        }
      });

      if (error) throw error;

      toast.success(status === 'accepted' ? "Zaakceptowano zaproszenie" : "Odrzucono zaproszenie");
      await loadInvitations();
    } catch (error: any) {
      console.error("Error responding to invitation:", error);
      toast.error("Błąd: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const markAlertAsResolved = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('system_alerts')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', alertId);

      if (error) throw error;
      await loadAlerts();
    } catch (error: any) {
      console.error("Error resolving alert:", error);
      toast.error("Błąd: " + error.message);
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'error':
        return '🔴';
      case 'warning':
        return '🟡';
      case 'document':
        return '📄';
      case 'new_driver':
        return '🟢';
      default:
        return 'ℹ️';
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'text-destructive';
      case 'warning':
        return 'text-warning';
      case 'document':
        return 'text-blue-600';
      case 'new_driver':
        return 'text-success';
      default:
        return 'text-muted-foreground';
    }
  };

  const totalNotifications = invitations.length + alerts.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {totalNotifications > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {totalNotifications > 99 ? '99+' : totalNotifications}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-h-[500px] overflow-y-auto z-50 bg-background">
        <div className="space-y-2">
          <div className="flex items-center justify-between pb-2 border-b">
            <h3 className="font-semibold">Powiadomienia</h3>
            {totalNotifications > 0 && (
              <Badge variant="secondary">
                {totalNotifications} nowych
              </Badge>
            )}
          </div>
          
          {totalNotifications === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              Brak nowych powiadomień
            </div>
          ) : (
            <div className="space-y-1">
              {/* System Alerts */}
              {alerts.map((alert) => (
                <Card key={alert.id} className="p-3 cursor-pointer hover:bg-muted/50" onClick={() => markAlertAsResolved(alert.id)}>
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{getAlertIcon(alert.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className={cn('font-medium text-sm', getAlertColor(alert.type))}>
                        {alert.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {alert.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(alert.created_at).toLocaleString('pl-PL')}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}

              {/* Fleet Invitations */}
              {invitations.map((inv) => (
                <Card key={inv.id} className="p-3">
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">📨</span>
                      <div className="flex-1">
                        <p className="font-medium text-sm">Zaproszenie do floty</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Flota <span className="font-semibold">{inv.fleets.name}</span> zaprasza Cię do współpracy
                          {inv.vehicles && (
                            <span> na pojazd {inv.vehicles.brand} {inv.vehicles.model} ({inv.vehicles.plate})</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(inv.created_at).toLocaleString('pl-PL')}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleResponse(inv.id, 'accepted')}
                        disabled={loading}
                        className="flex-1"
                      >
                        Akceptuj
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResponse(inv.id, 'rejected')}
                        disabled={loading}
                        className="flex-1"
                      >
                        Odrzuć
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
