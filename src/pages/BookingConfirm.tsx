import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, XCircle, Clock, MapPin, Wrench, Loader2, Calendar as CalendarIcon, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Mode = 'view' | 'cancel' | 'reschedule';

export default function BookingConfirm() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<any>(null);
  const [provider, setProvider] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [mode, setMode] = useState<Mode>('view');
  const [cancelReason, setCancelReason] = useState('');
  const [pickedDate, setPickedDate] = useState<string>('');
  const [pickedTime, setPickedTime] = useState<string>('');
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const loadBooking = async () => {
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
  };

  useEffect(() => {
    if (token) loadBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Pobieranie slotów gdy zmienia się data
  useEffect(() => {
    if (mode !== 'reschedule' || !pickedDate) return;
    setSlotsLoading(true);
    setPickedTime('');
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('booking-available-slots', {
          method: 'GET' as any,
        } as any);
        // GET przez invoke nie działa z params — używamy fetch
        const url = `https://qzllvpyepelhdcpojtor.supabase.co/functions/v1/booking-available-slots?token=${token}&date=${pickedDate}`;
        const res = await fetch(url);
        const json = await res.json();
        setSlots(json.slots || []);
        if (error) console.warn(error);
        if (data) console.log(data);
      } catch (e) {
        console.error(e);
        setSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    })();
  }, [pickedDate, mode, token]);

  const handleConfirm = async () => {
    setBusy(true);
    const { error } = await (supabase as any)
      .from('workshop_client_bookings')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('confirmation_token', token);
    if (!error) await loadBooking();
    setBusy(false);
  };

  const handleCancel = async () => {
    setBusy(true);
    const { error } = await (supabase as any)
      .from('workshop_client_bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancelReason || null,
      })
      .eq('confirmation_token', token);
    if (!error) {
      setMode('view');
      await loadBooking();
    }
    setBusy(false);
  };

  const handleProposeReschedule = async () => {
    if (!pickedDate || !pickedTime) return;
    setBusy(true);
    const { error } = await (supabase as any)
      .from('workshop_client_bookings')
      .update({
        status: 'reschedule_requested',
        reschedule_requested_at: new Date().toISOString(),
        proposed_date: pickedDate,
        proposed_time: pickedTime,
      })
      .eq('confirmation_token', token);
    if (!error) {
      setMode('view');
      await loadBooking();
    }
    setBusy(false);
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

  const status = booking?.status;
  const isConfirmed = status === 'confirmed';
  const isCancelled = status === 'cancelled';
  const isReschedule = status === 'reschedule_requested';
  const address = [provider?.company_address, [provider?.company_postal_code, provider?.company_city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const dateStr = booking?.appointment_date ? new Date(booking.appointment_date).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';

  // Min/Max date dla pickera (od jutra do +30 dni)
  const today = new Date();
  const minDate = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
  const maxDate = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-lg p-6 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold text-foreground">{provider?.short_name || provider?.company_name || 'Warsztat'}</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'view' && 'Twoja wizyta'}
            {mode === 'cancel' && 'Anulowanie wizyty'}
            {mode === 'reschedule' && 'Wybierz nowy termin'}
          </p>
        </div>

        {mode === 'view' && (
          <>
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

            {/* Status badges */}
            {isConfirmed && (
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-4 flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-green-700 dark:text-green-300">Wizyta potwierdzona</div>
                  <div className="text-xs text-green-600/80 dark:text-green-400/80">Dziękujemy! Czekamy na Państwa.</div>
                </div>
              </div>
            )}
            {isCancelled && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-4 flex items-center gap-3">
                <XCircle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-red-700 dark:text-red-300">Wizyta odwołana</div>
                  <div className="text-xs text-red-600/80 dark:text-red-400/80">Termin został zwolniony.</div>
                </div>
              </div>
            )}
            {isReschedule && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <CalendarIcon className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-amber-700 dark:text-amber-300">Propozycja zmiany wysłana</div>
                    <div className="text-xs text-amber-600/80 dark:text-amber-400/80">
                      Nowy termin: {booking.proposed_date} o {booking.proposed_time?.slice(0, 5)}
                    </div>
                    <div className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">
                      Czekamy na akceptację warsztatu.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Akcje gdy scheduled */}
            {!isConfirmed && !isCancelled && !isReschedule && (
              <div className="space-y-2">
                <Button onClick={handleConfirm} disabled={busy} className="w-full h-12 text-base font-semibold" size="lg">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : (<><CheckCircle2 className="h-5 w-5 mr-2" />Potwierdzam wizytę</>)}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => setMode('reschedule')} variant="outline" className="h-10">
                    <CalendarIcon className="h-4 w-4 mr-1.5" />Zmień termin
                  </Button>
                  <Button onClick={() => setMode('cancel')} variant="outline" className="h-10 text-destructive hover:text-destructive">
                    <XCircle className="h-4 w-4 mr-1.5" />Anuluj
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {mode === 'cancel' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Czy na pewno chcesz odwołać wizytę {dateStr} o {booking?.appointment_time?.slice(0, 5)}?
            </p>
            <Textarea
              placeholder="Powód odwołania (opcjonalnie)"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => setMode('view')} variant="outline" disabled={busy}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />Wróć
              </Button>
              <Button onClick={handleCancel} disabled={busy} variant="destructive">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Odwołaj wizytę'}
              </Button>
            </div>
          </div>
        )}

        {mode === 'reschedule' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Wybierz datę i wolny termin. Warsztat musi zaakceptować zmianę.
            </p>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Data</label>
              <input
                type="date"
                value={pickedDate}
                min={minDate}
                max={maxDate}
                onChange={(e) => setPickedDate(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground"
              />
            </div>

            {pickedDate && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Dostępne godziny {slotsLoading && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
                </label>
                <div className="grid grid-cols-4 gap-1.5 max-h-64 overflow-y-auto">
                  {slots.map((s) => (
                    <button
                      key={s.time}
                      type="button"
                      disabled={!s.available}
                      onClick={() => setPickedTime(s.time)}
                      className={`h-9 text-xs rounded-md border transition ${
                        !s.available
                          ? 'bg-muted text-muted-foreground/50 line-through cursor-not-allowed border-border'
                          : pickedTime === s.time
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-accent border-border text-foreground'
                      }`}
                    >
                      {s.time}
                    </button>
                  ))}
                  {!slotsLoading && slots.length === 0 && (
                    <div className="col-span-4 text-center text-sm text-muted-foreground py-4">
                      Brak danych dla tego dnia
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Szare = zajęte. Wybierz wolny termin.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => setMode('view')} variant="outline" disabled={busy}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />Wróć
              </Button>
              <Button onClick={handleProposeReschedule} disabled={busy || !pickedDate || !pickedTime}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Wyślij propozycję'}
              </Button>
            </div>
          </div>
        )}

        {provider?.company_phone && mode === 'view' && (
          <p className="text-xs text-center text-muted-foreground border-t border-border pt-4">
            Pytania? Zadzwoń: <a href={`tel:${provider.company_phone}`} className="text-primary font-medium">{provider.company_phone}</a>
          </p>
        )}
      </div>
    </div>
  );
}
