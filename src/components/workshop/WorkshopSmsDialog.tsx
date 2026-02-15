import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Send, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  type: 'reception' | 'quote' | 'ready';
}

const smsTemplates = {
  reception: (order: any, link: string) =>
    `Witaj,\n\nPoniżej karta zlecenia dla ${order.vehicle?.brand || ''} ${order.vehicle?.model || ''} ${order.vehicle?.plate || ''}.\n\n${link}\n\nCzekamy na potwierdzenie`,
  quote: (order: any, link: string) =>
    `Witaj,\n\nKosztorys dla zlecenia ${order.order_number} jest gotowy do akceptacji.\n\n${link}\n\nProsimy o zatwierdzenie kosztorysu.`,
  ready: (order: any, link: string) =>
    `Witaj,\n\nTwój pojazd ${order.vehicle?.brand || ''} ${order.vehicle?.model || ''} ${order.vehicle?.plate || ''} jest gotowy do odbioru.\n\nZapraszamy!\n\n${link}`,
};

export function WorkshopSmsDialog({ open, onOpenChange, order, type }: Props) {
  const clientName = order.client
    ? order.client.client_type === 'company'
      ? order.client.company_name
      : `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim()
    : '';

  const clientPhone = order.client?.phone || '';
  const clientLink = `${window.location.origin}/warsztat/klient/${order.client_code}`;
  
  const [phone, setPhone] = useState(clientPhone);
  const [message, setMessage] = useState(smsTemplates[type](order, clientLink));
  const [sending, setSending] = useState(false);

  const smsCount = Math.ceil(message.length / 160);
  const charsLeft = (smsCount * 160) - message.length;

  const handleSend = async () => {
    if (!phone) {
      toast.error('Brak numeru telefonu');
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('workshop-send-sms', {
        body: {
          phone: phone.startsWith('+48') ? phone : `+48${phone}`,
          message,
          order_id: order.id,
          sms_type: type,
        },
      });
      if (error) throw error;

      // Update order flags
      const updates: any = { id: order.id, sms_sent_count: (order.sms_sent_count || 0) + 1, last_sms_sent_at: new Date().toISOString() };
      if (type === 'ready') updates.ready_notification_sent = true;
      
      await (supabase as any).from('workshop_orders').update(updates).eq('id', order.id);
      
      toast.success('SMS wysłany do klienta');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Błąd wysyłania: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Wyślij wiadomość SMS do klienta
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Klient</Label>
            <Input value={clientName} disabled />
          </div>

          <div className="space-y-1.5">
            <Label>Numer telefonu</Label>
            <div className="flex gap-2">
              <span className="flex items-center px-3 border rounded-md bg-muted text-sm">+48</span>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Numer telefonu" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Treść wiadomości</Label>
            <Textarea 
              value={message} 
              onChange={e => setMessage(e.target.value)} 
              rows={6}
              className="resize-none"
            />
          </div>

          <div className="text-sm text-muted-foreground">
            Liczba SMS: {smsCount} · Liczba znaków do końca SMS: {charsLeft}
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj, nie wysyłaj SMS
          </Button>
          <Button onClick={handleSend} disabled={sending} className="gap-2">
            <Send className="h-4 w-4" />
            {sending ? 'Wysyłanie...' : 'Wyślij wiadomość SMS do klienta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
