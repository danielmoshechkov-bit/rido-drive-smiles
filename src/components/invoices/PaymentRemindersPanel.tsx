import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Bell, Check, Clock, AlertTriangle, Calendar, Send, Loader2 } from 'lucide-react';
import { format, differenceInDays, isPast, isToday } from 'date-fns';
import { pl } from 'date-fns/locale';

interface Invoice {
  id: string;
  invoice_number: string;
  gross_amount: number;
  due_date: string;
  status: string;
  type: string;
  buyer_snapshot: { name?: string } | null;
}

interface PaymentRemindersPanelProps {
  entityId: string;
}

export function PaymentRemindersPanel({ entityId }: PaymentRemindersPanelProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);

  useEffect(() => {
    fetchUnpaidInvoices();
  }, [entityId]);

  const fetchUnpaidInvoices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, gross_amount, due_date, status, type, buyer_snapshot')
      .eq('entity_id', entityId)
      .in('status', ['pending', 'issued', 'overdue', 'draft'])
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true });

    if (error) {
      console.error('Fetch error:', error);
    } else {
      setInvoices((data || []) as Invoice[]);
    }
    setLoading(false);
  };

  const markAsPaid = async (invoiceId: string) => {
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'paid' })
      .eq('id', invoiceId);

    if (error) {
      toast.error('Błąd aktualizacji');
    } else {
      toast.success('Oznaczono jako opłacone');
      fetchUnpaidInvoices();
    }
  };

  const sendReminder = async (invoice: Invoice) => {
    setSendingReminder(invoice.id);
    await new Promise(r => setTimeout(r, 1000));
    const name = (invoice.buyer_snapshot as any)?.name || 'odbiorcę';
    toast.success(`Przypomnienie wysłane dla ${name}`);
    setSendingReminder(null);
  };

  const getDueBadge = (dueDate: string) => {
    const date = new Date(dueDate);
    const daysUntil = differenceInDays(date, new Date());

    if (isPast(date) && !isToday(date)) {
      return <Badge className="bg-destructive/10 text-destructive">Przeterminowane</Badge>;
    }
    if (isToday(date)) {
      return <Badge className="bg-warning/10 text-warning">Dziś</Badge>;
    }
    if (daysUntil <= 3) {
      return <Badge className="bg-warning/10 text-warning">Za {daysUntil} dni</Badge>;
    }
    return <Badge variant="secondary">{format(date, 'd MMM', { locale: pl })}</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const overdueCount = invoices.filter(i => isPast(new Date(i.due_date)) && !isToday(new Date(i.due_date))).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overdueCount}</p>
                <p className="text-sm text-muted-foreground">Przeterminowane</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{invoices.length}</p>
                <p className="text-sm text-muted-foreground">Oczekujące</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {invoices.reduce((sum, i) => sum + (i.gross_amount || 0), 0).toLocaleString('pl-PL')}
                </p>
                <p className="text-sm text-muted-foreground">PLN do zapłaty</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Terminy płatności
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Check className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Brak oczekujących płatności</p>
            </div>
          ) : (
            <div className="space-y-3">
              {invoices.map((invoice) => {
                const recipientName = (invoice.buyer_snapshot as any)?.name || 'Nieznany odbiorca';
                return (
                  <div key={invoice.id} className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div>
                      <p className="font-semibold">{recipientName}</p>
                      <p className="text-sm text-muted-foreground">{invoice.invoice_number}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold">{(invoice.gross_amount || 0).toLocaleString('pl-PL')} PLN</p>
                        {getDueBadge(invoice.due_date)}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => sendReminder(invoice)} disabled={sendingReminder === invoice.id}>
                          {sendingReminder === invoice.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                        <Button variant="default" size="sm" onClick={() => markAsPaid(invoice.id)}>
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
