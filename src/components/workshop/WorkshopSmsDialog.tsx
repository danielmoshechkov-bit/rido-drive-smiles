import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Send, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useQuotaGuard } from '@/components/quota/QuotaGuardProvider';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  type: 'reception' | 'quote' | 'ready';
}

function removePl(s: string): string {
  const m: Record<string, string> = {
    'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z',
    'Ą':'A','Ć':'C','Ę':'E','Ł':'L','Ń':'N','Ó':'O','Ś':'S','Ź':'Z','Ż':'Z',
  };
  return s.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, c => m[c] || c);
}

function toLocalPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0048')) digits = digits.substring(2);
  while (digits.startsWith('4848')) digits = digits.substring(2);
  if (digits.startsWith('48') && digits.length >= 11) return digits.slice(-9);
  if (digits.startsWith('0') && digits.length >= 10) return digits.slice(-9);
  return digits;
}

function toSmsPhone(raw: string): string {
  const local = toLocalPhone(raw);
  if (local.length === 9) return `+48${local}`;
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('48') ? `+${digits}` : raw;
}

const smsTemplates = {
  reception: (order: any, link: string) => {
    const v = `${order.vehicle?.brand || ''} ${order.vehicle?.model || ''} ${order.vehicle?.plate || ''}`.trim();
    return removePl(`Zlecenie serwisowe ${v} zostalo przyjete. Szczegoly i akceptacja: ${link}`);
  },
  quote: (order: any, link: string) =>
    removePl(`Kosztorys dla zlecenia ${order.order_number} jest gotowy. Prosimy o akceptacje: ${link}`),
  ready: (order: any, link: string) => {
    const v = `${order.vehicle?.brand || ''} ${order.vehicle?.model || ''} ${order.vehicle?.plate || ''}`.trim();
    return removePl(`${v} - naprawa zakonczona, pojazd gotowy do odbioru. Szczegoly: ${link}`);
  },
};

export function WorkshopSmsDialog({ open, onOpenChange, order, type }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { runWithQuota } = useQuotaGuard();
  const clientName = order.client
    ? order.client.client_type === 'company'
      ? order.client.company_name
      : `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim()
    : '';

  const clientPhone = order.client?.phone || '';
  const clientLink = `${window.location.origin}/warsztat/klient/${order.client_code}`;
  
  const [phone, setPhone] = useState(toLocalPhone(clientPhone));
  const [message, setMessage] = useState(smsTemplates[type](order, clientLink));
  const [sending, setSending] = useState(false);

  // Reset message when dialog opens or type changes
  useEffect(() => {
    if (open) {
      setMessage(smsTemplates[type](order, clientLink));
      setPhone(toLocalPhone(order.client?.phone || ''));
    }
  }, [open, type]);

  const smsCount = Math.ceil(message.length / 160);
  const charsLeft = (smsCount * 160) - message.length;

  const handleSend = async () => {
    if (!phone) {
      toast.error(t('workshop.sms.noPhone'));
      return;
    }
    setSending(true);
    try {
      const smsPhone = toSmsPhone(phone);
      if (!smsPhone || smsPhone === phone) {
        throw new Error(t('workshop.sms.invalidPhone'));
      }

      const result = await runWithQuota('sms', async () => {
        const { data, error } = await supabase.functions.invoke('workshop-send-sms', {
          body: {
            phone: smsPhone,
            message,
            order_id: order.id,
            sms_type: type,
            provider_id: order.provider_id,
          },
        });
        if (error) throw error;
        if ((data as any)?.error === 'NO_SMS') throw new Error('NO_SMS');
        return data;
      }, { retryLabel: t('workshop.sms.retryLabel') });
      if (!result) { setSending(false); return; }

      // Update order flags based on SMS type
      const updates: any = { sms_sent_count: (order.sms_sent_count || 0) + 1, last_sms_sent_at: new Date().toISOString() };
      if (type === 'ready') {
        updates.ready_notification_sent = true;
        // Auto-status: sending ready SMS → set status to "Gotowy do odbioru"
        const lower = (order.status_name || '').toLowerCase();
        if (!lower.includes('gotow') && !lower.includes('zakończ')) {
          updates.status_name = 'Gotowy do odbioru';
        }
      }
      // Auto-status: sending quote SMS → set status to "Wycena wysłana"
      if (type === 'quote') {
        updates.estimate_sent_to_client = true;
        updates.estimate_changed_after_send = false;
        const lower = (order.status_name || '').toLowerCase();
        if (!lower.includes('wysłana') && !lower.includes('zaakcept')) {
          updates.status_name = 'Wycena wysłana';
        }
      }
      
      await (supabase as any).from('workshop_orders').update(updates).eq('id', order.id);
      await qc.invalidateQueries({ queryKey: ['sms-credits'] });
      
      toast.success(t('workshop.sms.sentSuccess'));
      onOpenChange(false);
    } catch (e: any) {
      toast.error(t('workshop.sms.sendError', { error: e.message }));
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
            {t('workshop.sms.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('workshop.sms.client')}</Label>
            <Input value={clientName} disabled />
          </div>

          <div className="space-y-1.5">
            <Label>{t('workshop.sms.phoneNumber')}</Label>
            <div className="flex gap-2">
              <span className="flex items-center px-3 border rounded-md bg-muted text-sm">+48</span>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('workshop.sms.phonePlaceholder')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('workshop.sms.messageContent')}</Label>
            <Textarea
              value={message} 
              onChange={e => setMessage(e.target.value)} 
              rows={6}
              className="resize-none"
            />
          </div>

          <div className="text-sm text-muted-foreground">
            {t('workshop.sms.smsCountInfo', { count: smsCount, charsLeft })}
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('workshop.sms.cancelNoSend')}
          </Button>
          <Button onClick={handleSend} disabled={sending} className="gap-2">
            <Send className="h-4 w-4" />
            {sending ? t('workshop.sms.sending') : t('workshop.sms.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
