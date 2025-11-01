import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, X, Loader2 } from "lucide-react";

interface FleetInvitation {
  id: string;
  fleet_id: string;
  vehicle_id: string | null;
  fleets: {
    name: string;
    contact_phone_for_drivers: string | null;
  };
  vehicles: {
    plate: string;
    brand: string;
    model: string;
  } | null;
  created_at: string;
}

interface FleetInvitationCardProps {
  invitation: FleetInvitation;
  onResponse: () => void;
}

export function FleetInvitationCard({ invitation, onResponse }: FleetInvitationCardProps) {
  const [responding, setResponding] = useState(false);

  const handleResponse = async (status: 'accepted' | 'rejected') => {
    setResponding(true);
    try {
      const { error } = await supabase.functions.invoke('fleet-invitations/respond', {
        body: {
          invitation_id: invitation.id,
          status
        }
      });

      if (error) throw error;

      toast.success(
        status === 'accepted' 
          ? "Zaakceptowano zaproszenie do floty" 
          : "Odrzucono zaproszenie"
      );
      onResponse();
    } catch (error: any) {
      console.error('Error responding to invitation:', error);
      toast.error("Błąd odpowiedzi na zaproszenie: " + error.message);
    } finally {
      setResponding(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Zaproszenie do floty</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="font-medium text-lg">{invitation.fleets.name}</div>
          {invitation.fleets.contact_phone_for_drivers && (
            <div className="text-sm text-muted-foreground">
              Kontakt: {invitation.fleets.contact_phone_for_drivers}
            </div>
          )}
        </div>

        {invitation.vehicles && (
          <div className="p-3 bg-accent/50 rounded-lg">
            <div className="text-sm text-muted-foreground">Przypisany pojazd:</div>
            <div className="font-medium">
              {invitation.vehicles.plate} - {invitation.vehicles.brand} {invitation.vehicles.model}
            </div>
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          Otrzymano: {new Date(invitation.created_at).toLocaleDateString('pl-PL')}
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => handleResponse('accepted')}
            disabled={responding}
            className="flex-1"
          >
            {responding ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Akceptuj
          </Button>
          <Button
            onClick={() => handleResponse('rejected')}
            disabled={responding}
            variant="outline"
            className="flex-1"
          >
            {responding ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <X className="h-4 w-4 mr-2" />
            )}
            Odrzuć
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
