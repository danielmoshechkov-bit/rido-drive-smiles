import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, CreditCard, Banknote, Calendar as CalendarIcon, Clock, Check, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AuthModal } from '@/components/auth/AuthModal';
import { format } from 'date-fns';
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

type BookingStep = 'datetime' | 'contact' | 'payment' | 'confirmation';

export function ServiceBookingModal({ provider, service, open, onOpenChange }: ServiceBookingModalProps) {
  const [step, setStep] = useState<BookingStep>('datetime');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  
  // Form state
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');
  
  // Card payment simulation
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  
  // Confirmation
  const [bookingNumber, setBookingNumber] = useState('');
  const [cashCode, setCashCode] = useState('');

  const timeSlots = [
    '08:00', '09:00', '10:00', '11:00', '12:00', 
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'
  ];

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (open) {
      setStep('datetime');
      setSelectedDate(undefined);
      setSelectedTime('');
    }
  }, [open]);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) {
      setCustomerEmail(user.email || '');
    }
  };

  const handleNext = () => {
    if (step === 'datetime') {
      if (!selectedDate || !selectedTime) {
        toast.error('Wybierz datę i godzinę');
        return;
      }
      setStep('contact');
    } else if (step === 'contact') {
      if (!customerName || !customerPhone) {
        toast.error('Wypełnij wymagane pola');
        return;
      }
      if (!user) {
        setAuthModalOpen(true);
        return;
      }
      setStep('payment');
    } else if (step === 'payment') {
      handleSubmitBooking();
    }
  };

  const handleAuthSuccess = () => {
    checkUser();
    setAuthModalOpen(false);
    setStep('payment');
  };

  const handleSubmitBooking = async () => {
    if (!provider || !service || !selectedDate) return;
    
    // Card payment validation
    if (paymentMethod === 'card') {
      if (!cardNumber || !cardExpiry || !cardCvv) {
        toast.error('Wypełnij dane karty');
        return;
      }
      // Test card simulation
      if (!cardNumber.replace(/\s/g, '').startsWith('4242')) {
        toast.error('Użyj testowej karty 4242 4242 4242 4242');
        return;
      }
    }
    
    setLoading(true);
    try {
      // Generate booking number (trigger generates it, but TypeScript needs it)
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
          status: 'new'
        }])
        .select('booking_number')
        .single();

      if (error) throw error;

      setBookingNumber(booking.booking_number || '');

      // If cash payment, generate 6-digit code
      if (paymentMethod === 'cash') {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        setCashCode(code);
        
        // Store code in provider_notes for tracking
        await supabase
          .from('service_bookings')
          .update({ provider_notes: `Kod gotówkowy: ${code}` })
          .eq('booking_number', booking.booking_number);
      } else {
        // Mark as paid for card
        await supabase
          .from('service_bookings')
          .update({ provider_notes: 'Płatność kartą - opłacone' })
          .eq('booking_number', booking.booking_number);
      }

      setStep('confirmation');
      toast.success('Rezerwacja utworzona!');
    } catch (error) {
      console.error('Booking error:', error);
      toast.error('Błąd podczas tworzenia rezerwacji');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(cashCode);
    toast.success('Kod skopiowany');
  };

  if (!provider || !service) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rezerwacja usługi</DialogTitle>
            <DialogDescription>
              {service.name} - {provider.company_name}
            </DialogDescription>
          </DialogHeader>

          {/* Step: DateTime */}
          {step === 'datetime' && (
            <div className="space-y-4">
              <div>
                <Label className="flex items-center gap-2 mb-2">
                  <CalendarIcon className="h-4 w-4" />
                  Wybierz datę
                </Label>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  locale={pl}
                  disabled={(date) => date < new Date() || date.getDay() === 0}
                  className="rounded-md border mx-auto"
                />
              </div>

              {selectedDate && (
                <div>
                  <Label className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4" />
                    Wybierz godzinę
                  </Label>
                  <div className="grid grid-cols-4 gap-2">
                    {timeSlots.map(time => (
                      <Button
                        key={time}
                        variant={selectedTime === time ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedTime(time)}
                      >
                        {time}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4">
                <Button onClick={handleNext} disabled={!selectedDate || !selectedTime}>
                  Dalej
                </Button>
              </div>
            </div>
          )}

          {/* Step: Contact */}
          {step === 'contact' && (
            <div className="space-y-4">
              <div>
                <Label>Imię i nazwisko *</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Jan Kowalski"
                />
              </div>
              <div>
                <Label>Telefon *</Label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+48 123 456 789"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="jan@example.com"
                />
              </div>
              <div>
                <Label>Uwagi do rezerwacji</Label>
                <Textarea
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  placeholder="Dodatkowe informacje..."
                  rows={3}
                />
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep('datetime')}>
                  Wstecz
                </Button>
                <Button onClick={handleNext}>
                  Dalej
                </Button>
              </div>
            </div>
          )}

          {/* Step: Payment */}
          {step === 'payment' && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Usługa:</span>
                    <span className="font-medium">{service.name}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-muted-foreground">Termin:</span>
                    <span className="font-medium">
                      {selectedDate && format(selectedDate, 'dd.MM.yyyy', { locale: pl })} o {selectedTime}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-2 border-t">
                    <span className="font-medium">Do zapłaty:</span>
                    <span className="font-bold text-lg text-primary">{service.price} zł</span>
                  </div>
                </CardContent>
              </Card>

              <div>
                <Label className="mb-3 block">Metoda płatności</Label>
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as 'card' | 'cash')}
                  className="grid grid-cols-2 gap-4"
                >
                  <Label
                    htmlFor="card"
                    className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                      paymentMethod === 'card' ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <RadioGroupItem value="card" id="card" />
                    <CreditCard className="h-5 w-5" />
                    <span>Karta</span>
                  </Label>
                  <Label
                    htmlFor="cash"
                    className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                      paymentMethod === 'cash' ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <RadioGroupItem value="cash" id="cash" />
                    <Banknote className="h-5 w-5" />
                    <span>Gotówka</span>
                  </Label>
                </RadioGroup>
              </div>

              {paymentMethod === 'card' && (
                <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-2">
                    Tryb testowy: użyj karty 4242 4242 4242 4242
                  </p>
                  <div>
                    <Label>Numer karty</Label>
                    <Input
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      placeholder="4242 4242 4242 4242"
                      maxLength={19}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Data ważności</Label>
                      <Input
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder="MM/RR"
                        maxLength={5}
                      />
                    </div>
                    <div>
                      <Label>CVV</Label>
                      <Input
                        type="password"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                        placeholder="123"
                        maxLength={3}
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === 'cash' && (
                <Card className="bg-yellow-50 border-yellow-200">
                  <CardContent className="p-4 text-sm">
                    <p className="font-medium text-yellow-800">Płatność gotówką</p>
                    <p className="text-yellow-700 mt-1">
                      Po złożeniu rezerwacji otrzymasz 6-cyfrowy kod. Podaj go usługodawcy po wykonaniu usługi,
                      aby potwierdzić transakcję.
                    </p>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep('contact')}>
                  Wstecz
                </Button>
                <Button onClick={handleNext} disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {paymentMethod === 'card' ? 'Zapłać i zarezerwuj' : 'Zarezerwuj'}
                </Button>
              </div>
            </div>
          )}

          {/* Step: Confirmation */}
          {step === 'confirmation' && (
            <div className="text-center py-6 space-y-6">
              <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              
              <div>
                <h3 className="text-xl font-bold mb-2">Rezerwacja potwierdzona!</h3>
                <p className="text-muted-foreground">
                  Numer rezerwacji: <span className="font-mono font-bold">{bookingNumber}</span>
                </p>
              </div>

              {paymentMethod === 'cash' && cashCode && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      Twój kod potwierdzenia płatności:
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-3xl font-mono font-bold tracking-widest text-primary">
                        {cashCode}
                      </span>
                      <Button variant="ghost" size="sm" onClick={copyCode}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Podaj ten kod usługodawcy po wykonaniu usługi
                    </p>
                  </CardContent>
                </Card>
              )}

              <div className="pt-4">
                <Button onClick={() => onOpenChange(false)}>
                  Zamknij
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        initialMode="login"
        onSuccess={handleAuthSuccess}
      />
    </>
  );
}
