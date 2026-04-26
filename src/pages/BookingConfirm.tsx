import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Clock, MapPin, Wrench, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function BookingConfirm() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [booking, setBooking] = useState<any>(null);
  const [provider, setProvider] = useState<any>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_client_bookings')
        .select('*, service_providers(company_name, short_name, company_address, company_city, company_postal_code, company_phone)')
        .eq('confirmation_token', token)
        .maybeSingle();
      if (error || !data) {
        setError('Nie znaleziono rezerwacji.');
      } else {
        setBooking(data);
        setProvider(data.service_providers);
      }
      setLoading(false);
    })();
  }, [token]);

  const handleConfirm = async () => {
    if (!booking) return;
    setConfirming(true);
    const { error } = await (supabase as any)
      .from('workshop_client_bookings')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('confirmation_token', token);
    if (error) {
      setError('Błąd potwierdzania. Spróbuj ponownie.');
    } else {
      setBooking({ ...booking, status: 'confirmed', confirmed_at: new Date().toISOString() });
    }
    setConfirming(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-xl font-bold text-foreground">Ups!</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const isConfirmed = booking?.status === 'confirmed' || !!booking?.confirmed_at;
  const address = [provider?.company_address, [provider?.company_postal_code, provider?.company_city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const dateStr = booking?.appointment_date ? new Date(booking.appointment_date).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-lg p-6 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold text-foreground">{provider?.short_name || provider?.company_name || 'Warsztat'}</h1>
          <p className="text-sm text-muted-foreground">Potwierdzenie wizyty</p>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-foreground capitalize">{dateStr}</div>
              <div className="text-sm text-muted-foreground">o godz. {booking?.appointment_time?.slice(0, 5)}</div>
            </div>
          </div>

          {booking?.service_description && (
            <div className="flex items-start gap-3">
              <Wrench className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-sm text-foreground">{booking.service_description}</div>
            </div>
          )}

          {address && (
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-sm text-foreground">{address}</div>
            </div>
          )}
        </div>

        {isConfirmed ? (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-4 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
            <div>
              <div className="font-semibold text-green-700 dark:text-green-300">Wizyta potwierdzona</div>
              <div className="text-xs text-green-600/80 dark:text-green-400/80">Dziękujemy! Czekamy na Państwa.</div>
            </div>
          </div>
        ) : (
          <Button
            onClick={handleConfirm}
            disabled={confirming}
            className="w-full h-12 text-base font-semibold"
            size="lg"
          >
            {confirming ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Potwierdzam wizytę'}
          </Button>
        )}

        {provider?.company_phone && (
          <p className="text-xs text-center text-muted-foreground">
            Pytania? Zadzwoń: <a href={`tel:${provider.company_phone}`} className="text-primary font-medium">{provider.company_phone}</a>
          </p>
        )}
      </div>
    </div>
  );
}
