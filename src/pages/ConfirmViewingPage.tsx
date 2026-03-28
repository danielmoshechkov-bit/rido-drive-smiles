import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Home, Calendar, CheckCircle, XCircle, Loader2, MapPin, Clock } from 'lucide-react';

export default function ConfirmViewingPage() {
  const { token } = useParams<{ token: string }>();
  const [slot, setSlot] = useState<any>(null);
  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);

  useEffect(() => {
    if (token) fetchSlot();
  }, [token]);

  const fetchSlot = async () => {
    const { data, error } = await supabase
      .from('viewing_slots' as any)
      .select('*')
      .eq('confirmation_token', token)
      .single();

    if (error || !data) {
      setLoading(false);
      return;
    }

    setSlot(data);

    // Fetch request
    const { data: req } = await supabase
      .from('viewing_requests' as any)
      .select('*')
      .eq('id', (data as any).request_id)
      .single();

    setRequest(req);
    setLoading(false);
  };

  const handleConfirm = async () => {
    if (selectedSlots.length === 0) {
      toast.error('Wybierz przynajmniej jeden termin');
      return;
    }
    setSubmitting(true);

    const proposedSlots = (slot.proposed_slots as any[]) || [];
    const confirmedSlots = selectedSlots.map(i => proposedSlots[i]);

    const { error } = await supabase
      .from('viewing_slots' as any)
      .update({
        agent_confirmed_slots: confirmedSlots,
        status: 'confirmed',
        agent_responded_at: new Date().toISOString(),
      } as any)
      .eq('confirmation_token', token);

    if (error) {
      toast.error('Błąd potwierdzenia');
    } else {
      setConfirmed(true);
      toast.success('Terminy potwierdzone!');
    }
    setSubmitting(false);
  };

  const handleDecline = async () => {
    setSubmitting(true);
    const { error } = await supabase
      .from('viewing_slots' as any)
      .update({
        status: 'declined',
        agent_responded_at: new Date().toISOString(),
      } as any)
      .eq('confirmation_token', token);

    if (error) toast.error('Błąd');
    else { setDeclined(true); }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!slot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center p-8">
          <XCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h2 className="text-xl font-bold mb-2">Link nieprawidłowy</h2>
          <p className="text-muted-foreground">Ten link jest nieaktywny lub wygasł.</p>
        </Card>
      </div>
    );
  }

  if (confirmed || slot.status === 'confirmed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center p-8">
          <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">Dziękujemy!</h2>
          <p className="text-muted-foreground">Klient zostanie poinformowany o potwierdzonych terminach.</p>
        </Card>
      </div>
    );
  }

  if (declined || slot.status === 'declined') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center p-8">
          <XCircle className="h-12 w-12 mx-auto text-orange-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">Odmowa odnotowana</h2>
          <p className="text-muted-foreground">Będziemy szukać innego terminu.</p>
        </Card>
      </div>
    );
  }

  const proposedSlots = (slot.proposed_slots as any[]) || [];

  return (
    <div className="min-h-screen bg-background p-4 flex items-center justify-center">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center pb-3">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" alt="Logo" className="h-6 w-6" />
            <span className="font-bold text-primary">GetRido</span>
          </div>
          <CardTitle>Potwierdzenie terminu oglądania</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Client info */}
          {request && (
            <div className="p-3 bg-muted/50 rounded-lg space-y-1">
              <p className="text-sm">
                Klient <span className="font-semibold">{request.client_name}</span> chce obejrzeć nieruchomość
              </p>
            </div>
          )}

          {/* Time estimate */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Czas oglądania: ~{request?.viewing_duration_minutes || 60} minut
          </div>

          {/* Slots */}
          <div className="space-y-2">
            <p className="font-medium text-sm">Wybierz dostępne terminy:</p>
            {proposedSlots.map((s: any, idx: number) => (
              <label
                key={idx}
                className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:border-primary/50 transition-colors"
              >
                <Checkbox
                  checked={selectedSlots.includes(idx)}
                  onCheckedChange={(checked) => {
                    setSelectedSlots(prev =>
                      checked ? [...prev, idx] : prev.filter(i => i !== idx)
                    );
                  }}
                />
                <div>
                  <p className="font-medium text-sm">
                    {s.date || s.datetime} {s.time_from && `godz. ${s.time_from}–${s.time_to}`}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <Button
              onClick={handleConfirm}
              disabled={submitting || selectedSlots.length === 0}
              className="w-full gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Potwierdź wybrane terminy
            </Button>
            <Button
              variant="outline"
              onClick={handleDecline}
              disabled={submitting}
              className="w-full gap-2 text-destructive"
            >
              <XCircle className="h-4 w-4" />
              Nie mogę w żadnym terminie
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
