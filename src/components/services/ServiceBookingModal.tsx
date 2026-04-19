import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Calendar as CalendarIcon, Clock, Check, AlertTriangle, Car } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AuthModal } from '@/components/auth/AuthModal';
import { format, addMinutes, parse } from 'date-fns';
import { pl } from 'date-fns/locale';

interface Service {
  id: string;
  name: string;
  price: number;
  price_from: number | null;
  price_type: string;
  duration_minutes: number;
}

interface ServiceProvider {
  id: string;
  company_name: string;
}

interface ServiceBookingModalProps {
  provider: ServiceProvider | null;
  service: Service | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type BookingStep = 'datetime' | 'contact' | 'confirmation';

interface WorkingHour {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_working: boolean;
}

export function ServiceBookingModal({ provider, service, open, onOpenChange }: ServiceBookingModalProps) {
  const [step, setStep] = useState<BookingStep>('datetime');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [hasPendingReviews, setHasPendingReviews] = useState(false);
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([]);
  const [busySlots, setBusySlots] = useState<string[]>([]);

  // Form state
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');

  // Confirmation
  const [bookingNumber, setBookingNumber] = useState('');

  useEffect(() => { checkUser(); }, []);

  useEffect(() => {
    if (open && provider) {
      setStep('datetime');
      setSelectedDate(undefined);
      setSelectedTime('');
      loadWorkingHours();
      checkPendingReviews();
    }
  }, [open, provider]);

  useEffect(() => {
    if (selectedDate && provider) loadBusySlots();
  }, [selectedDate, provider]);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) setCustomerEmail(user.email || '');
  };

  const checkPendingReviews = async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    const { data } = await supabase.rpc('user_has_pending_reviews', { p_user_id: u.id });
    setHasPendingReviews(!!data);
  };

  const loadWorkingHours = async () => {
    if (!provider) return;

    // 1. Try service_working_hours (primary source)
    const { data: swh } = await supabase
      .from('service_working_hours')
      .select('day_of_week, start_time, end_time, is_working')
      .eq('provider_id', provider.id);

    if (swh && swh.length > 0) {
      setWorkingHours(swh);
      return;
    }

    // 2. Fallback: workshop_settings (provider's user_id)
    const { data: prov } = await (supabase as any)
      .from('service_providers')
      .select('user_id')
      .eq('id', provider.id)
      .maybeSingle();

    if (!prov?.user_id) {
      setWorkingHours([]);
      return;
    }

    const { data: ws } = await (supabase as any)
      .from('workshop_settings')
      .select('working_hours')
      .eq('user_id', prov.user_id)
      .maybeSingle();

    const wh = ws?.working_hours;
    if (!Array.isArray(wh)) {
      setWorkingHours([]);
      return;
    }

    // workshop_settings format: [Mon, Tue, Wed, Thu, Fri, Sat, Sun] with {open, from, to}
    // Map to service_working_hours format with day_of_week (0=Sun, 1=Mon..6=Sat to match getDay())
    const mapped: WorkingHour[] = wh.map((d: any, idx: number) => {
      // Workshop index 0=Mon → getDay()=1; index 6=Sun → getDay()=0
      const dayOfWeek = idx === 6 ? 0 : idx + 1;
      return {
        day_of_week: dayOfWeek,
        start_time: (d?.from || '09:00') + ':00',
        end_time: (d?.to || '17:00') + ':00',
        is_working: !!d?.open,
      };
    });
    setWorkingHours(mapped);
  };

  const loadBusySlots = async () => {
    if (!provider || !selectedDate) return;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const { data } = await supabase
      .from('service_bookings')
      .select('scheduled_time, duration_minutes')
      .eq('provider_id', provider.id)
      .eq('scheduled_date', dateStr)
      .not('status', 'in', '(cancelled,rejected)');
    
    const busy: string[] = [];
    (data || []).forEach((b: any) => {
      const start = parse(b.scheduled_time, 'HH:mm:ss', new Date());
      const end = addMinutes(start, b.duration_minutes || 60);
      let cur = start;
      while (cur < end) {
        busy.push(format(cur, 'HH:mm'));
        cur = addMinutes(cur, 30);
      }
    });
    setBusySlots(busy);
  };

  // Generate slots from working hours for selected day
  const availableSlots = useMemo(() => {
    if (!selectedDate || workingHours.length === 0) return [];
    const dow = selectedDate.getDay();
    const wh = workingHours.find(w => w.day_of_week === dow && w.is_working);
    if (!wh) return [];
    const slots: string[] = [];
    const start = parse(wh.start_time, 'HH:mm:ss', new Date());
    const end = parse(wh.end_time, 'HH:mm:ss', new Date());
    let cur = start;
    while (cur < end) {
      slots.push(format(cur, 'HH:mm'));
      cur = addMinutes(cur, 30);
    }
    return slots;
  }, [selectedDate, workingHours]);

  const isDayWorking = (date: Date) => {
    const wh = workingHours.find(w => w.day_of_week === date.getDay());
    return wh?.is_working ?? false;
  };

  const handleNext = () => {
    if (step === 'datetime') {
      if (!selectedDate || !selectedTime) { toast.error('Wybierz datę i godzinę'); return; }
      setStep('contact');
    } else if (step === 'contact') {
      if (!customerName || !customerPhone) { toast.error('Wypełnij imię i telefon'); return; }
      if (!user) { setAuthModalOpen(true); return; }
      handleSubmitBooking();
    }
  };

  const handleAuthSuccess = () => {
    checkUser();
    setAuthModalOpen(false);
    handleSubmitBooking();
  };

  const handleSubmitBooking = async () => {
    if (!provider || !service || !selectedDate) return;
    setLoading(true);
    try {
      const bookingNum = 'BK-' + Date.now().toString(36).toUpperCase();
      const { data: booking, error } = await supabase
        .from('service_bookings')
        .insert([{
          booking_number: bookingNum,
          provider_id: provider.id,
          service_id: service.id,
          customer_user_id: user?.id || null,
          customer_name: customerName,
          customer_email: customerEmail || null,
          customer_phone: customerPhone,
          scheduled_date: format(selectedDate, 'yyyy-MM-dd'),
          scheduled_time: selectedTime,
          duration_minutes: service.duration_minutes,
          estimated_price: service.price,
          customer_notes: customerNotes || null,
          vehicle_brand: vehicleBrand || null,
          vehicle_model: vehicleModel || null,
          vehicle_year: vehicleYear ? parseInt(vehicleYear) : null,
          vehicle_plate: vehiclePlate || null,
          status: 'pending',
          completion_status: 'pending',
          requires_provider_confirmation: true,
          source: 'portal',
        }])
        .select('booking_number, id')
        .single();

      if (error) throw error;
      setBookingNumber(booking.booking_number || '');

      // Send "preliminary booking" SMS via edge function (don't block on errors)
      supabase.functions.invoke('booking-notify', {
        body: { booking_id: booking.id, type: 'preliminary' }
      }).catch(err => console.warn('SMS notify failed:', err));

      setStep('confirmation');
      toast.success('Rezerwacja przekazana do usługodawcy');
    } catch (error: any) {
      console.error('Booking error:', error);
      toast.error(error.message || 'Błąd podczas tworzenia rezerwacji');
    } finally {
      setLoading(false);
    }
  };

  if (!provider || !service) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Rezerwacja usługi</DialogTitle>
            <DialogDescription>{service.name} – {provider.company_name}</DialogDescription>
          </DialogHeader>

          {hasPendingReviews && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Aby umówić nową wizytę, najpierw oceń poprzednią. Dbamy o jakość portalu — każda zrealizowana usługa wymaga oceny.
              </AlertDescription>
            </Alert>
          )}

          {!hasPendingReviews && step === 'datetime' && (
            <div className="space-y-4">
              <div>
                <Label className="flex items-center gap-2 mb-2">
                  <CalendarIcon className="h-4 w-4" /> Wybierz datę
                </Label>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  locale={pl}
                  disabled={(date) => date < new Date() || !isDayWorking(date)}
                  className="rounded-md border mx-auto"
                />
                {workingHours.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Usługodawca nie skonfigurował godzin pracy.
                  </p>
                )}
              </div>

              {selectedDate && availableSlots.length > 0 && (
                <div>
                  <Label className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4" /> Wybierz godzinę
                  </Label>
                  <div className="grid grid-cols-4 gap-2">
                    {availableSlots.map(time => {
                      const isBusy = busySlots.includes(time);
                      return (
                        <Button
                          key={time}
                          variant={selectedTime === time ? 'default' : 'outline'}
                          size="sm"
                          disabled={isBusy}
                          onClick={() => setSelectedTime(time)}
                        >
                          {time}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Wybierz wolny termin z kalendarza usługodawcy.</p>
                </div>
              )}

              <div className="flex justify-end pt-4">
                <Button onClick={handleNext} disabled={!selectedDate || !selectedTime}>Dalej</Button>
              </div>
            </div>
          )}

          {!hasPendingReviews && step === 'contact' && (
            <div className="space-y-3">
              <div>
                <Label>Imię i nazwisko *</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Jan Kowalski" />
              </div>
              <div>
                <Label>Telefon *</Label>
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+48 123 456 789" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="jan@example.com" />
              </div>

              <div className="pt-2 border-t">
                <Label className="flex items-center gap-2 mb-2 font-semibold">
                  <Car className="h-4 w-4" /> Dane pojazdu
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={vehicleBrand} onChange={(e) => setVehicleBrand(e.target.value)} placeholder="Marka (np. BMW)" />
                  <Input value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} placeholder="Model (np. 320d)" />
                  <Input value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)} placeholder="Rok (np. 2020)" type="number" />
                  <Input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())} placeholder="Tablica" />
                </div>
              </div>

              <div>
                <Label>Opis zlecenia / uwagi</Label>
                <Textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} placeholder="Co należy zrobić, objawy..." rows={3} />
              </div>

              <Alert variant="default" className="border-amber-300 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-xs text-amber-900">
                  <strong>Uwaga:</strong> Wskazana cena to <strong>cena orientacyjna „od"</strong>. 
                  Ostateczny koszt usługi może się różnić w zależności od stanu pojazdu i zakresu prac. 
                  <strong> Przed rozpoczęciem naprawy ustal cenę z usługodawcą</strong>, aby uniknąć nieporozumień.
                </AlertDescription>
              </Alert>

              <Card className="bg-muted/50">
                <CardContent className="p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Termin:</span><span className="font-medium">{selectedDate && format(selectedDate, 'dd.MM.yyyy', { locale: pl })} o {selectedTime}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Cena orientacyjna:</span><span className="font-bold text-primary">od {service.price_from || service.price} zł</span></div>
                </CardContent>
              </Card>

              <div className="flex justify-between pt-3">
                <Button variant="outline" onClick={() => setStep('datetime')}>Wstecz</Button>
                <Button onClick={handleNext} disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Wyślij rezerwację
                </Button>
              </div>
            </div>
          )}

          {step === 'confirmation' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Rezerwacja wstępna utworzona</h3>
                <p className="text-muted-foreground text-sm">
                  Numer: <span className="font-mono font-bold">{bookingNumber}</span>
                </p>
              </div>
              <Alert>
                <AlertDescription className="text-left text-sm">
                  Otrzymałeś SMS z potwierdzeniem rezerwacji wstępnej. Usługodawca potwierdzi termin — wtedy dostaniesz drugi SMS z ostatecznym potwierdzeniem.
                </AlertDescription>
              </Alert>
              <Button onClick={() => onOpenChange(false)} className="w-full">Zamknij</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} initialMode="login" onSuccess={handleAuthSuccess} />
    </>
  );
}
