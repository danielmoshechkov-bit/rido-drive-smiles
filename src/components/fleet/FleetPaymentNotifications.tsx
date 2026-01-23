import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  AlertTriangle,
  Check,
  X,
  Loader2,
  Bell,
  Car,
  User,
  RefreshCw
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface PaymentNotification {
  id: string;
  fleet_id: string;
  reminder_id: string;
  notification_type: string;
  status: string;
  responded_at: string | null;
  created_at: string;
  reminder?: {
    id: string;
    driver_id: string;
    amount_due: number;
    due_date: string;
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
  };
}

interface FleetPaymentNotificationsProps {
  fleetId: string;
}

export function FleetPaymentNotifications({ fleetId }: FleetPaymentNotificationsProps) {
  const [notifications, setNotifications] = useState<PaymentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; notificationId: string; action: 'paid' | 'not_paid' } | null>(null);

  useEffect(() => {
    fetchNotifications();
  }, [fleetId]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('fleet_payment_notifications')
        .select(`
          *,
          reminder:rental_payment_reminders(
            id,
            driver_id,
            amount_due,
            due_date,
            notes,
            driver:drivers(first_name, last_name, phone, email),
            vehicle:vehicles(plate, brand, model)
          )
        `)
        .eq('fleet_id', fleetId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications((data || []) as PaymentNotification[]);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      toast({ title: 'Błąd', description: 'Nie udało się pobrać powiadomień', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPaid = async (notificationId: string) => {
    setProcessing(notificationId);
    try {
      const notification = notifications.find(n => n.id === notificationId);
      if (!notification?.reminder_id) throw new Error('Brak danych przypomnienia');

      // Mark reminder as paid
      const { error: reminderError } = await supabase.functions.invoke('rental-payment-reminders', {
        body: { action: 'mark_paid', reminder_id: notification.reminder_id }
      });

      if (reminderError) throw reminderError;

      // Update notification status
      const { error: notifError } = await supabase
        .from('fleet_payment_notifications')
        .update({ 
          status: 'confirmed_paid',
          responded_at: new Date().toISOString()
        })
        .eq('id', notificationId);

      if (notifError) throw notifError;

      toast({ title: 'Sukces', description: 'Oznaczono jako opłacone' });
      fetchNotifications();
    } catch (error) {
      console.error('Error confirming paid:', error);
      toast({ title: 'Błąd', description: 'Nie udało się oznaczyć jako opłacone', variant: 'destructive' });
    } finally {
      setProcessing(null);
      setConfirmDialog(null);
    }
  };

  const handleConfirmNotPaid = async (notificationId: string) => {
    setProcessing(notificationId);
    try {
      const notification = notifications.find(n => n.id === notificationId);
      if (!notification?.reminder_id) throw new Error('Brak danych przypomnienia');

      // Send payment demand
      const { data, error: sendError } = await supabase.functions.invoke('rental-payment-reminders', {
        body: { action: 'send', reminder_id: notification.reminder_id }
      });

      if (sendError) throw sendError;

      // Update notification status
      const { error: notifError } = await supabase
        .from('fleet_payment_notifications')
        .update({ 
          status: 'confirmed_not_paid',
          responded_at: new Date().toISOString()
        })
        .eq('id', notificationId);

      if (notifError) throw notifError;

      const messages = [];
      if (data?.sms_sent) messages.push('SMS');
      if (data?.email_sent) messages.push('email');

      toast({ 
        title: 'Wysłano wezwanie do zapłaty', 
        description: messages.length > 0 
          ? `Wysłano: ${messages.join(' i ')}`
          : 'Nie udało się wysłać powiadomień (brak danych kontaktowych)'
      });
      fetchNotifications();
    } catch (error) {
      console.error('Error confirming not paid:', error);
      toast({ title: 'Błąd', description: 'Nie udało się wysłać wezwania', variant: 'destructive' });
    } finally {
      setProcessing(null);
      setConfirmDialog(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Potwierdzenia płatności</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={fetchNotifications}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Odśwież
            </Button>
          </div>
          <CardDescription>Brak oczekujących potwierdzeń płatności</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Oczekujące potwierdzenia płatności</h3>
          <Badge variant="destructive">{notifications.length}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={fetchNotifications}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Odśwież
        </Button>
      </div>

      <div className="space-y-3">
        {notifications.map((notification) => {
          const reminder = notification.reminder;
          const driver = reminder?.driver;
          const vehicle = reminder?.vehicle;
          const isProcessing = processing === notification.id;

          return (
            <Card key={notification.id} className="border-l-4 border-l-amber-500">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span className="font-medium">
                        Czy kierowca zapłacił za wynajem?
                      </span>
                    </div>
                    
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span>{driver?.first_name} {driver?.last_name}</span>
                      </div>
                      {vehicle && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Car className="h-3 w-3" />
                          <span>{vehicle.plate} - {vehicle.brand} {vehicle.model}</span>
                        </div>
                      )}
                      <div className="font-semibold text-foreground">
                        Kwota: {reminder?.amount_due?.toFixed(2)} zł
                      </div>
                      <div className="text-muted-foreground">
                        Termin: {reminder?.due_date && format(new Date(reminder.due_date), 'dd.MM.yyyy', { locale: pl })}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setConfirmDialog({ open: true, notificationId: notification.id, action: 'paid' })}
                      disabled={isProcessing}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Zapłacone
                        </>
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmDialog({ open: true, notificationId: notification.id, action: 'not_paid' })}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <X className="h-4 w-4 mr-1" />
                          Nie zapłacone
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog?.open} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog?.action === 'paid' 
                ? 'Potwierdzenie płatności' 
                : 'Wysłać wezwanie do zapłaty?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog?.action === 'paid' 
                ? 'Czy na pewno chcesz oznaczyć tę płatność jako opłaconą?' 
                : 'System wyśle SMS i email do kierowcy z wezwaniem do natychmiastowej zapłaty.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDialog?.action === 'paid') {
                  handleConfirmPaid(confirmDialog.notificationId);
                } else if (confirmDialog?.action === 'not_paid') {
                  handleConfirmNotPaid(confirmDialog.notificationId);
                }
              }}
              className={confirmDialog?.action === 'not_paid' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {confirmDialog?.action === 'paid' ? 'Tak, zapłacone' : 'Tak, wyślij wezwanie'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
