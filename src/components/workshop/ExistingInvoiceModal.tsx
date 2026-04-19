import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Mail, Edit, FileWarning, Eye, AlertCircle, Send } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SimpleFreeInvoice } from '@/components/invoices/SimpleFreeInvoice';
import { CorrectionInvoiceDialog } from '@/components/invoices/CorrectionInvoiceDialog';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: any;
  orderNumber?: string;
  onChanged?: () => void;
}

export function ExistingInvoiceModal({ open, onOpenChange, invoice, orderNumber, onChanged }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [sendingKsef, setSendingKsef] = useState(false);

  if (!invoice) return null;

  const handlePdf = () => {
    window.open(`/faktury/${invoice.id}/pdf`, '_blank');
  };

  const handleEmail = async () => {
    const email = invoice.buyer_email || prompt('Podaj e-mail odbiorcy:');
    if (!email) return;
    try {
      const { error } = await supabase.functions.invoke('send-invoice-email', {
        body: { invoice_id: invoice.id, email },
      });
      if (error) throw error;
      toast.success('Faktura wysłana na ' + email);
    } catch (e: any) {
      toast.error('Błąd wysyłki: ' + e.message);
    }
  };

  const handleKsef = async () => {
    setSendingKsef(true);
    try {
      const { error } = await supabase.functions.invoke('ksef-send', {
        body: { invoice_id: invoice.id },
      });
      if (error) throw error;
      toast.success('Wysłano do KSeF');
      onChanged?.();
    } catch (e: any) {
      toast.error('Błąd KSeF: ' + e.message);
    } finally {
      setSendingKsef(false);
    }
  };

  const ksefStatus = invoice.ksef_status || 'draft';
  const ksefBadge =
    ksefStatus === 'sent' || ksefStatus === 'accepted'
      ? <Badge className="bg-green-600">KSeF: wysłana</Badge>
      : <Badge variant="outline">KSeF: nie wysłana</Badge>;

  return (
    <>
      <Dialog open={open && !editOpen && !correctionOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Faktura już istnieje
            </DialogTitle>
            <DialogDescription>
              Dla zlecenia <strong>{orderNumber}</strong> została już wystawiona faktura.
              Jedno zlecenie = jedna faktura. Aby zmienić wartości, wystaw korektę.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-lg">{invoice.invoice_number}</span>
              {ksefBadge}
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Data wystawienia: {invoice.issue_date ? format(new Date(invoice.issue_date), 'dd.MM.yyyy') : '—'}</div>
              <div>Nabywca: {invoice.buyer_name}</div>
              <div className="font-semibold text-foreground">
                Wartość brutto: {Number(invoice.gross_total || 0).toFixed(2)} {invoice.currency || 'PLN'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button variant="outline" onClick={handlePdf} className="gap-2">
              <Eye className="h-4 w-4" /> Podgląd / PDF
            </Button>
            <Button variant="outline" onClick={handleEmail} className="gap-2">
              <Mail className="h-4 w-4" /> Wyślij e-mail
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)} className="gap-2">
              <Edit className="h-4 w-4" /> Edytuj
            </Button>
            <Button variant="outline" onClick={() => setCorrectionOpen(true)} className="gap-2">
              <FileWarning className="h-4 w-4" /> Wystaw korektę
            </Button>
            {ksefStatus !== 'sent' && ksefStatus !== 'accepted' && (
              <Button onClick={handleKsef} disabled={sendingKsef} className="col-span-2 gap-2">
                <Send className="h-4 w-4" /> {sendingKsef ? 'Wysyłanie...' : 'Wyślij do KSeF'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {editOpen && (
        <Dialog open={editOpen} onOpenChange={(v) => { if (!v) setEditOpen(false); }}>
          <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto p-0">
            <DialogTitle className="sr-only">Edycja faktury</DialogTitle>
            <SimpleFreeInvoice
              editInvoiceId={invoice.id}
              onClose={() => setEditOpen(false)}
              onSaved={() => { setEditOpen(false); onChanged?.(); }}
            />
          </DialogContent>
        </Dialog>
      )}

      {correctionOpen && (
        <CorrectionInvoiceDialog
          open={correctionOpen}
          onOpenChange={(v) => { if (!v) setCorrectionOpen(false); }}
          originalInvoice={invoice}
          onSaved={() => { setCorrectionOpen(false); onChanged?.(); }}
        />
      )}
    </>
  );
}
