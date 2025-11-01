import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

interface DriverNotificationBellProps {
  driverId: string;
}

export function DriverNotificationBell({ driverId }: DriverNotificationBellProps) {
  const [invitations, setInvitations] = useState<FleetInvitation[]>([]);
  const [showModal, setShowModal] = useState(false);
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

  useEffect(() => {
    loadInvitations();
    
    // Reload every 30 seconds
    const interval = setInterval(loadInvitations, 30000);
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

  const pendingCount = invitations.length;

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="relative rounded-full"
        onClick={() => setShowModal(true)}
      >
        <Bell className="h-5 w-5" />
        {pendingCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            {pendingCount}
          </Badge>
        )}
      </Button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Powiadomienia</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {invitations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Brak oczekujących zaproszeń
              </div>
            ) : (
              invitations.map((invitation) => (
                <Card key={invitation.id} className="p-4">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-lg">
                        {invitation.fleets.name}
                      </h3>
                      {invitation.vehicles && (
                        <p className="text-sm text-muted-foreground">
                          Pojazd: {invitation.vehicles.plate} - {invitation.vehicles.brand} {invitation.vehicles.model}
                        </p>
                      )}
                      {!invitation.vehicles && (
                        <p className="text-sm text-muted-foreground">
                          Pojazd zostanie przydzielony później
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(invitation.created_at).toLocaleString('pl-PL')}
                      </p>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleResponse(invitation.id, 'accepted')}
                        disabled={loading}
                        className="flex-1"
                      >
                        Akceptuj
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleResponse(invitation.id, 'rejected')}
                        disabled={loading}
                        className="flex-1"
                      >
                        Odrzuć
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
