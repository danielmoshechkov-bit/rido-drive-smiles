import { useState } from 'react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  CheckCircle, 
  Download, 
  Mail, 
  Clock, 
  Edit, 
  FileText,
  Building2,
  Calendar,
  CreditCard,
  Loader2
} from 'lucide-react';

interface UserInvoice {
  id: string;
  invoice_number?: string;
  buyer_name?: string;
  buyer_nip?: string;
  buyer_address?: string;
  issue_date?: string;
  sale_date?: string;
  due_date?: string;
  net_total?: number;
  vat_total?: number;
  gross_total?: number;
  is_paid?: boolean;
  paid_at?: string;
  currency?: string;
  notes?: string;
  created_at: string;
}

interface InvoiceDetailSheetProps {
  invoice: UserInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export function InvoiceDetailSheet({ invoice, open, onOpenChange, onUpdate }: InvoiceDetailSheetProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  if (!invoice) return null;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return format(new Date(dateStr), 'd MMM yyyy', { locale: pl });
    } catch {
      return dateStr;
    }
  };

  const isOverdue = invoice.due_date && new Date(invoice.due_date) < new Date() && !invoice.is_paid;

  const handleMarkAsPaid = async () => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('user_invoices')
        .update({ 
          is_paid: !invoice.is_paid,
          paid_at: !invoice.is_paid ? new Date().toISOString() : null
        })
        .eq('id', invoice.id);

      if (error) throw error;

      toast.success(invoice.is_paid ? 'Oznaczono jako nieopłaconą' : 'Oznaczono jako opłaconą');
      onUpdate();
    } catch (err: any) {
      console.error('Error updating invoice:', err);
      toast.error('Błąd aktualizacji faktury');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDownloadPdf = () => {
    toast.info('Funkcja pobierania PDF w przygotowaniu');
    // TODO: Implement PDF download
  };

  const handleSendEmail = () => {
    toast.info('Funkcja wysyłania email w przygotowaniu');
    // TODO: Implement email sending
  };

  const handleSetReminder = () => {
    toast.info('Funkcja przypomnień w przygotowaniu');
    // TODO: Implement reminder
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-lg">{invoice.invoice_number || 'Faktura'}</SheetTitle>
              <SheetDescription className="text-sm">{invoice.buyer_name || 'Brak nabywcy'}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Status Section */}
          <div className="p-4 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">Status płatności</p>
              <Badge 
                className={
                  invoice.is_paid 
                    ? 'bg-green-500/10 text-green-600' 
                    : isOverdue 
                      ? 'bg-red-500/10 text-red-600' 
                      : 'bg-yellow-500/10 text-yellow-600'
                }
              >
                {invoice.is_paid ? 'Opłacona' : isOverdue ? 'Po terminie' : 'Nieopłacona'}
              </Badge>
            </div>
            {invoice.due_date && !invoice.is_paid && (
              <p className="text-xs text-muted-foreground">
                Termin płatności: {formatDate(invoice.due_date)}
              </p>
            )}
            {invoice.paid_at && invoice.is_paid && (
              <p className="text-xs text-muted-foreground">
                Opłacono: {formatDate(invoice.paid_at)}
              </p>
            )}
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Data wystawienia
              </p>
              <p className="font-medium text-sm">{formatDate(invoice.issue_date)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Data sprzedaży
              </p>
              <p className="font-medium text-sm">{formatDate(invoice.sale_date)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Termin płatności
              </p>
              <p className={`font-medium text-sm ${isOverdue ? 'text-red-600' : ''}`}>
                {formatDate(invoice.due_date)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CreditCard className="h-3 w-3" />
                Waluta
              </p>
              <p className="font-medium text-sm">{invoice.currency || 'PLN'}</p>
            </div>
          </div>

          <Separator />

          {/* Buyer Info */}
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
              <Building2 className="h-3 w-3" />
              Nabywca
            </p>
            <p className="font-medium text-sm">{invoice.buyer_name || '—'}</p>
            {invoice.buyer_nip && (
              <p className="text-xs text-muted-foreground">NIP: {invoice.buyer_nip}</p>
            )}
            {invoice.buyer_address && (
              <p className="text-xs text-muted-foreground">{invoice.buyer_address}</p>
            )}
          </div>

          <Separator />

          {/* Amounts */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Kwota netto</span>
              <span>{Number(invoice.net_total || 0).toLocaleString('pl-PL')} zł</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">VAT</span>
              <span>{Number(invoice.vat_total || 0).toLocaleString('pl-PL')} zł</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Kwota brutto</span>
              <span className="text-lg">{Number(invoice.gross_total || 0).toLocaleString('pl-PL')} zł</span>
            </div>
          </div>

          {invoice.notes && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Uwagi</p>
                <p className="text-sm">{invoice.notes}</p>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2 pb-6">
          <Button 
            className="w-full" 
            variant={invoice.is_paid ? 'outline' : 'default'}
            onClick={handleMarkAsPaid}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            {invoice.is_paid ? 'Oznacz jako nieopłaconą' : 'Oznacz jako opłaconą'}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={handleDownloadPdf}>
              <Download className="h-4 w-4 mr-2" />
              Pobierz PDF
            </Button>
            <Button variant="outline" onClick={handleSendEmail}>
              <Mail className="h-4 w-4 mr-2" />
              Wyślij email
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={handleSetReminder}>
              <Clock className="h-4 w-4 mr-2" />
              Przypomnienie
            </Button>
            <Button variant="outline" disabled>
              <Edit className="h-4 w-4 mr-2" />
              Edytuj
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
