import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Edit, FileWarning, Eye, AlertCircle, Send } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SimpleFreeInvoice } from '@/components/invoices/SimpleFreeInvoice';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: any;
  orderNumber?: string;
  onChanged?: () => void;
}

export function ExistingInvoiceModal({ open, onOpenChange, invoice, orderNumber, onChanged }: Props) {
  const { t } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [sendingKsef, setSendingKsef] = useState(false);

  if (!invoice) return null;

  const handlePdf = () => {
    window.open(`/faktury/${invoice.id}/pdf`, '_blank');
  };

  const handleEmail = async () => {
    const email = invoice.buyer_email || prompt(t('workshop.existingInvoice.enterRecipientEmail'));
    if (!email) return;
    try {
      const { error } = await supabase.functions.invoke('send-invoice-email', {
        body: { invoice_id: invoice.id, email },
      });
      if (error) throw error;
      toast.success(t('workshop.existingInvoice.invoiceSentTo', { email }));
    } catch (e: any) {
      toast.error(t('workshop.existingInvoice.sendError', { error: e.message }));
    }
  };

  const handleKsef = async () => {
    setSendingKsef(true);
    try {
      const { error } = await supabase.functions.invoke('ksef-send', {
        body: { invoice_id: invoice.id },
      });
      if (error) throw error;
      toast.success(t('workshop.existingInvoice.ksefSent'));
      onChanged?.();
    } catch (e: any) {
      toast.error(t('workshop.existingInvoice.ksefError', { error: e.message }));
    } finally {
      setSendingKsef(false);
    }
  };

  const ksefStatus = invoice.ksef_status || 'draft';
  const ksefBadge =
    ksefStatus === 'sent' || ksefStatus === 'accepted'
      ? <Badge className="bg-green-600">{t('workshop.existingInvoice.ksefBadgeSent')}</Badge>
      : <Badge variant="outline">{t('workshop.existingInvoice.ksefBadgeNotSent')}</Badge>;

  return (
    <>
      <Dialog open={open && !editOpen && !correctionOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              {t('workshop.existingInvoice.title')}
            </DialogTitle>
            <DialogDescription>
              {t('workshop.existingInvoice.descPrefix')} <strong>{orderNumber}</strong> {t('workshop.existingInvoice.descSuffix')}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-lg">{invoice.invoice_number}</span>
              {ksefBadge}
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>{t('workshop.existingInvoice.issueDate')}: {invoice.issue_date ? format(new Date(invoice.issue_date), 'dd.MM.yyyy') : '—'}</div>
              <div>{t('workshop.existingInvoice.buyer')}: {invoice.buyer_name}</div>
              <div className="font-semibold text-foreground">
                {t('workshop.existingInvoice.grossValue')}: {Number(invoice.gross_total || 0).toFixed(2)} {invoice.currency || 'PLN'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button variant="outline" onClick={handlePdf} className="gap-2">
              <Eye className="h-4 w-4" /> {t('workshop.existingInvoice.previewPdf')}
            </Button>
            <Button variant="outline" onClick={handleEmail} className="gap-2">
              <Mail className="h-4 w-4" /> {t('workshop.existingInvoice.sendEmail')}
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)} className="gap-2">
              <Edit className="h-4 w-4" /> {t('workshop.clients.edit')}
            </Button>
            <Button variant="outline" onClick={() => setCorrectionOpen(true)} className="gap-2">
              <FileWarning className="h-4 w-4" /> {t('workshop.existingInvoice.issueCorrection')}
            </Button>
            {ksefStatus !== 'sent' && ksefStatus !== 'accepted' && (
              <Button onClick={handleKsef} disabled={sendingKsef} className="col-span-2 gap-2">
                <Send className="h-4 w-4" /> {sendingKsef ? t('workshop.existingInvoice.sending') : t('workshop.existingInvoice.sendToKsef')}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {editOpen && (
        <Dialog open={editOpen} onOpenChange={(v) => { if (!v) setEditOpen(false); }}>
          <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto p-0">
            <DialogTitle className="sr-only">{t('workshop.existingInvoice.editInvoice')}</DialogTitle>
            <SimpleFreeInvoice
              editInvoiceId={invoice.id}
              onClose={() => setEditOpen(false)}
              onSaved={() => { setEditOpen(false); onChanged?.(); }}
            />
          </DialogContent>
        </Dialog>
      )}

      {correctionOpen && (
        <Dialog open={correctionOpen} onOpenChange={(v) => { if (!v) setCorrectionOpen(false); }}>
          <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto p-0">
            <DialogTitle className="sr-only">{t('workshop.existingInvoice.issueCorrection')}</DialogTitle>
            <SimpleFreeInvoice
              onClose={() => setCorrectionOpen(false)}
              onSaved={() => { setCorrectionOpen(false); onChanged?.(); }}
            />
            <div className="px-6 pb-4 text-sm text-muted-foreground">
              {t('workshop.existingInvoice.correctionHintPrefix')} <strong>{invoice.invoice_number}</strong>{t('workshop.existingInvoice.correctionHintSuffix')}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
