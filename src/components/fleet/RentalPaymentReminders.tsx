import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  CalendarIcon,
  Send,
  Check,
  AlertTriangle,
  Clock,
  MessageSquare,
  Mail,
  Plus,
  Loader2,
  Settings,
  RefreshCw
} from 'lucide-react';
import { DriverSearchableSelect } from './DriverSearchableSelect';
import { AddFleetDriverModal } from './AddFleetDriverModal';

interface Reminder {
  id: string;
  driver_id: string;
  fleet_id: string;
  vehicle_id: string | null;
  amount_due: number;
  due_date: string;
  status: string;
  reminder_count: number;
  last_reminder_at: string | null;
  last_reminder_type: string | null;
  payment_confirmed_at: string | null;
  notes: string | null;
  driver?: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  };
  vehicle?: {
    plate: string | null;
    brand: string | null;
    model: string | null;
  };
}

interface RentalPaymentRemindersProps {
  fleetId: string;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Oczekuje', variant: 'secondary' },
  reminded: { label: 'Przypomniano', variant: 'outline' },
  overdue: { label: 'Zaległy', variant: 'destructive' },
  paid: { label: 'Opłacony', variant: 'default' },
};

export function RentalPaymentReminders({ fleetId }: RentalPaymentRemindersProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showAddDriverModal, setShowAddDriverModal] = useState(false);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [smsTemplate, setSmsTemplate] = useState('Przypomnienie: Termin płatności za wynajem pojazdu {plate} minął. Kwota: {amount} PLN. Prosimy o pilną wpłatę.');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // New reminder form
  const [newReminder, setNewReminder] = useState({
    driver_id: '',
    vehicle_id: '',
    amount_due: '',
    due_date: new Date(),
    notes: '',
  });

  useEffect(() => {
    fetchReminders();
    fetchDriversAndVehicles();
    fetchTemplate();
  }, [fleetId]);

  const fetchReminders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('rental_payment_reminders')
        .select(`
          *,
          driver:drivers(first_name, last_name, phone, email),
          vehicle:vehicles(plate, brand, model)
        `)
        .eq('fleet_id', fleetId)
        .order('due_date', { ascending: true });

      if (error) throw error;
      setReminders(data || []);
    } catch (error) {
      console.error('Error fetching reminders:', error);
      toast({ title: 'Błąd', description: 'Nie udało się pobrać przypomnień', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const fetchDriversAndVehicles = async () => {
    const { data: driversData } = await supabase
      .from('drivers')
      .select('id, first_name, last_name')
      .eq('fleet_id', fleetId);
    setDrivers(driversData || []);

    const { data: vehiclesData } = await supabase
      .from('vehicles')
      .select('id, plate, brand, model')
      .eq('fleet_id', fleetId);
    setVehicles(vehiclesData || []);
  };

  const fetchTemplate = async () => {
    try {
      const { data } = await supabase.functions.invoke('rental-payment-reminders', {
        body: { action: 'get_templates', fleet_id: fleetId }
      });
      if (data?.templates?.[0]?.template_content) {
        setSmsTemplate(data.templates[0].template_content);
      }
    } catch (error) {
      console.error('Error fetching template:', error);
    }
  };

  const handleSendReminder = async (reminderId: string) => {
    setSending(reminderId);
    try {
      const { data, error } = await supabase.functions.invoke('rental-payment-reminders', {
        body: { action: 'send', reminder_id: reminderId }
      });

      if (error) throw error;

      const messages = [];
      if (data.sms_sent) messages.push('SMS');
      if (data.email_sent) messages.push('email');

      toast({
        title: 'Wysłano przypomnienie',
        description: messages.length > 0 
          ? `Wysłano: ${messages.join(' i ')}`
          : 'Nie udało się wysłać powiadomień (brak danych kontaktowych)',
      });

      fetchReminders();
    } catch (error) {
      console.error('Error sending reminder:', error);
      toast({ title: 'Błąd', description: 'Nie udało się wysłać przypomnienia', variant: 'destructive' });
    } finally {
      setSending(null);
    }
  };

  const handleMarkPaid = async (reminderId: string) => {
    try {
      const { error } = await supabase.functions.invoke('rental-payment-reminders', {
        body: { action: 'mark_paid', reminder_id: reminderId }
      });

      if (error) throw error;

      toast({ title: 'Sukces', description: 'Oznaczono jako opłacone' });
      fetchReminders();
    } catch (error) {
      console.error('Error marking paid:', error);
      toast({ title: 'Błąd', description: 'Nie udało się oznaczyć jako opłacone', variant: 'destructive' });
    }
  };

  const handleCreateReminder = async () => {
    if (!newReminder.driver_id || !newReminder.amount_due) {
      toast({ title: 'Błąd', description: 'Wypełnij wymagane pola', variant: 'destructive' });
      return;
    }

    try {
      const { error } = await supabase.functions.invoke('rental-payment-reminders', {
        body: {
          action: 'create',
          fleet_id: fleetId,
          driver_id: newReminder.driver_id,
          vehicle_id: newReminder.vehicle_id || null,
          amount_due: parseFloat(newReminder.amount_due),
          due_date: format(newReminder.due_date, 'yyyy-MM-dd'),
          notes: newReminder.notes || null,
        }
      });

      if (error) throw error;

      toast({ title: 'Sukces', description: 'Dodano nowe przypomnienie' });
      setShowAddModal(false);
      setNewReminder({ driver_id: '', vehicle_id: '', amount_due: '', due_date: new Date(), notes: '' });
      fetchReminders();
    } catch (error) {
      console.error('Error creating reminder:', error);
      toast({ title: 'Błąd', description: 'Nie udało się dodać przypomnienia', variant: 'destructive' });
    }
  };

  const handleSaveTemplate = async () => {
    setSavingTemplate(true);
    try {
      const { error } = await supabase.functions.invoke('rental-payment-reminders', {
        body: {
          action: 'save_template',
          fleet_id: fleetId,
          template_type: 'payment_reminder',
          template_content: smsTemplate,
        }
      });

      if (error) throw error;

      toast({ title: 'Zapisano', description: 'Szablon SMS został zaktualizowany' });
      setShowTemplateModal(false);
    } catch (error) {
      console.error('Error saving template:', error);
      toast({ title: 'Błąd', description: 'Nie udało się zapisać szablonu', variant: 'destructive' });
    } finally {
      setSavingTemplate(false);
    }
  };

  const overdueCount = reminders.filter(r => r.status === 'overdue').length;
  const pendingCount = reminders.filter(r => r.status === 'pending').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-4">
          <Card className="px-4 py-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium">{overdueCount} zaległych</span>
            </div>
          </Card>
          <Card className="px-4 py-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{pendingCount} oczekujących</span>
            </div>
          </Card>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTemplateModal(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Szablon SMS
          </Button>
          <Button variant="outline" size="sm" onClick={fetchReminders}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Odśwież
          </Button>
          <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Dodaj płatność
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nowe przypomnienie o płatności</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Kierowca *</Label>
                  <DriverSearchableSelect
                    drivers={drivers}
                    value={newReminder.driver_id}
                    onChange={(id) => setNewReminder({ ...newReminder, driver_id: id })}
                    onAddNew={() => setShowAddDriverModal(true)}
                    placeholder="Wyszukaj kierowcę..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Pojazd</Label>
                  <Select value={newReminder.vehicle_id} onValueChange={(v) => setNewReminder({ ...newReminder, vehicle_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz pojazd (opcjonalnie)" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {vehicle.plate} - {vehicle.brand} {vehicle.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Kwota do zapłaty (PLN) *</Label>
                  <Input
                    type="number"
                    value={newReminder.amount_due}
                    onChange={(e) => setNewReminder({ ...newReminder, amount_due: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Termin płatności</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(newReminder.due_date, 'dd.MM.yyyy', { locale: pl })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={newReminder.due_date}
                        onSelect={(date) => date && setNewReminder({ ...newReminder, due_date: date })}
                        locale={pl}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Notatki</Label>
                  <Textarea
                    value={newReminder.notes}
                    onChange={(e) => setNewReminder({ ...newReminder, notes: e.target.value })}
                    placeholder="Dodatkowe informacje..."
                  />
                </div>

                <Button onClick={handleCreateReminder} className="w-full">
                  Dodaj przypomnienie
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* SMS Template Modal */}
      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Szablon wiadomości SMS</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Treść SMS</Label>
              <Textarea
                value={smsTemplate}
                onChange={(e) => setSmsTemplate(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Dostępne zmienne: {'{amount}'}, {'{plate}'}, {'{brand}'}, {'{model}'}, {'{due_date}'}, {'{driver_name}'}
              </p>
            </div>
            <Button onClick={handleSaveTemplate} disabled={savingTemplate} className="w-full">
              {savingTemplate ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Zapisz szablon
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reminders list */}
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Aktywne</TabsTrigger>
          <TabsTrigger value="paid">Opłacone</TabsTrigger>
          <TabsTrigger value="all">Wszystkie</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <div className="space-y-3">
            {reminders
              .filter(r => r.status !== 'paid')
              .map((reminder) => (
                <ReminderCard
                  key={reminder.id}
                  reminder={reminder}
                  onSend={handleSendReminder}
                  onMarkPaid={handleMarkPaid}
                  sending={sending === reminder.id}
                />
              ))}
            {reminders.filter(r => r.status !== 'paid').length === 0 && (
              <p className="text-center text-muted-foreground py-8">Brak aktywnych przypomnień</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="paid" className="mt-4">
          <div className="space-y-3">
            {reminders
              .filter(r => r.status === 'paid')
              .map((reminder) => (
                <ReminderCard
                  key={reminder.id}
                  reminder={reminder}
                  onSend={handleSendReminder}
                  onMarkPaid={handleMarkPaid}
                  sending={sending === reminder.id}
                />
              ))}
            {reminders.filter(r => r.status === 'paid').length === 0 && (
              <p className="text-center text-muted-foreground py-8">Brak opłaconych</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <div className="space-y-3">
            {reminders.map((reminder) => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                onSend={handleSendReminder}
                onMarkPaid={handleMarkPaid}
                sending={sending === reminder.id}
              />
            ))}
            {reminders.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Brak przypomnień</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Driver Modal */}
      <AddFleetDriverModal
        isOpen={showAddDriverModal}
        onClose={() => setShowAddDriverModal(false)}
        fleetId={fleetId}
        onSuccess={(driverId) => {
          fetchDriversAndVehicles();
          setNewReminder({ ...newReminder, driver_id: driverId });
        }}
      />
    </div>
  );
}

function ReminderCard({
  reminder,
  onSend,
  onMarkPaid,
  sending,
}: {
  reminder: Reminder;
  onSend: (id: string) => void;
  onMarkPaid: (id: string) => void;
  sending: boolean;
}) {
  const config = statusConfig[reminder.status] || statusConfig.pending;
  const isPaid = reminder.status === 'paid';

  return (
    <Card className={isPaid ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">
                {reminder.driver?.first_name} {reminder.driver?.last_name}
              </span>
              <Badge variant={config.variant}>{config.label}</Badge>
            </div>
            {reminder.vehicle && (
              <p className="text-sm text-muted-foreground">
                {reminder.vehicle.brand} {reminder.vehicle.model} ({reminder.vehicle.plate})
              </p>
            )}
            {reminder.notes && (
              <p className="text-xs text-muted-foreground mt-1">{reminder.notes}</p>
            )}
          </div>

          <div className="text-right">
            <p className="text-lg font-bold">{reminder.amount_due.toFixed(2)} PLN</p>
            <p className="text-sm text-muted-foreground">
              Termin: {format(new Date(reminder.due_date), 'dd.MM.yyyy', { locale: pl })}
            </p>
            {reminder.reminder_count > 0 && (
              <p className="text-xs text-muted-foreground">
                Przypomnień: {reminder.reminder_count}
              </p>
            )}
          </div>

          {!isPaid && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSend(reminder.id)}
                disabled={sending}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-1" />
                    Przypomnij
                  </>
                )}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => onMarkPaid(reminder.id)}
              >
                <Check className="h-4 w-4 mr-1" />
                Opłacone
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
