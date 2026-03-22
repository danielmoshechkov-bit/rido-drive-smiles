import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Bot, Calendar, Clock, ArrowRight, X, RefreshCw, CheckCircle2 } from 'lucide-react';
import { format, addDays, isToday, isTomorrow } from 'date-fns';
import { pl } from 'date-fns/locale';

interface CalendarBooking {
  id: string;
  lead_name: string;
  service_name: string;
  scheduled_at: string;
  meeting_type: string;
  status: string;
}

// Sample available slots for next 7 days
function generateSampleSlots() {
  const slots = [];
  for (let d = 0; d < 7; d++) {
    const day = addDays(new Date(), d);
    const dayName = format(day, 'EEE d MMM', { locale: pl });
    for (const hour of ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']) {
      slots.push({ date: day, time: hour, label: `${dayName}  ${hour}` });
    }
  }
  return slots;
}

export function CalendarAIAssistant({ providerId }: { providerId: string | null }) {
  const [rescheduleModal, setRescheduleModal] = useState<CalendarBooking | null>(null);
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [selectedNewSlot, setSelectedNewSlot] = useState<string | null>(null);
  const [showAllSlots, setShowAllSlots] = useState(false);

  // Mock data - in production would come from Supabase
  const bookings: CalendarBooking[] = [];
  const slots = generateSampleSlots();
  const displayedSlots = showAllSlots ? slots : slots.slice(0, 4);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isToday(d)) return `Dziś ${format(d, 'HH:mm')}`;
    if (isTomorrow(d)) return `Jutro ${format(d, 'HH:mm')}`;
    return format(d, 'EEE d MMM HH:mm', { locale: pl });
  };

  const meetingTypeLabel = (type: string) => {
    switch (type) {
      case 'phone': return '📞 Telefon';
      case 'online': return '💻 Online';
      case 'in_person': return '🤝 Osobiście';
      default: return type;
    }
  };

  const handleReschedule = () => {
    if (!rescheduleReason.trim()) return;
    // In production: call edge function calendar-ai-assistant with action: reschedule_request
    setRescheduleModal(null);
    setRescheduleReason('');
    setSelectedNewSlot(null);
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          Asystent Kalendarza AI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Available slots */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Wolne sloty (7 dni)</h4>
          <div className="space-y-1">
            {displayedSlots.map((slot, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-muted/50">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                <span>{slot.label}</span>
              </div>
            ))}
          </div>
          {!showAllSlots && slots.length > 4 && (
            <button onClick={() => setShowAllSlots(true)} className="text-xs text-primary hover:underline mt-1">
              + {slots.length - 4} więcej...
            </button>
          )}
        </div>

        {/* Upcoming bookings */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Nadchodzące spotkania</h4>
          {bookings.length === 0 ? (
            <div className="text-center py-4">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs text-muted-foreground">Brak umówionych spotkań</p>
              <p className="text-[10px] text-muted-foreground mt-1">Agent sam umówi spotkania z leadami</p>
            </div>
          ) : (
            <div className="space-y-2">
              {bookings.map(booking => (
                <div key={booking.id} className="border rounded-lg p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{booking.lead_name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {booking.status === 'confirmed' ? '✅ Potwierdzone' : booking.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDate(booking.scheduled_at)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {booking.service_name} · {meetingTypeLabel(booking.meeting_type)}
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => setRescheduleModal(booking)}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Przenieś
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive">
                      <X className="h-3 w-3 mr-1" /> Odwołaj
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="bg-muted/50 rounded-lg p-2.5">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-600" />
            Agent sam wysyła potwierdzenia i przypomnienia SMS
          </p>
        </div>
      </CardContent>

      {/* Reschedule Modal */}
      <Dialog open={!!rescheduleModal} onOpenChange={() => setRescheduleModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Przenieś spotkanie</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {rescheduleModal && (
              <p className="text-sm text-muted-foreground">
                {rescheduleModal.lead_name} · {formatDate(rescheduleModal.scheduled_at)}
              </p>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium">Powód przeniesienia</label>
              <Textarea
                value={rescheduleReason}
                onChange={e => setRescheduleReason(e.target.value)}
                placeholder="np. Awaryjne zlecenie, choroba..."
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Wybierz nowy termin</label>
              <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto">
                {slots.slice(0, 6).map((slot, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedNewSlot(slot.label)}
                    className={`text-left text-xs p-2 rounded border transition-colors ${selectedNewSlot === slot.label ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Agent wyśle SMS do klienta z prośbą o potwierdzenie nowego terminu
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRescheduleModal(null)}>Anuluj</Button>
            <Button size="sm" onClick={handleReschedule} disabled={!rescheduleReason.trim() || !selectedNewSlot}>
              <ArrowRight className="h-3 w-3 mr-1" /> Przenieś i wyślij SMS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
