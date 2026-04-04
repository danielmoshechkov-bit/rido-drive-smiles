import { useState } from 'react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { generateInvoiceHtml } from '@/utils/invoiceHtmlGenerator';
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
import { KsefSendButton } from './KsefSendButton';

interface UserInvoice {
  id: string;
  user_id?: string;
  company_id?: string;
  invoice_number?: string;
  invoice_type?: string;
  buyer_name?: string;
  buyer_nip?: string;
  buyer_address?: string;
  issue_date?: string;
  issue_place?: string;
  sale_date?: string;
  due_date?: string;
  payment_method?: string;
  net_total?: number;
  vat_total?: number;
  gross_total?: number;
  is_paid?: boolean;
  paid_at?: string;
  paid_amount?: number;
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
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editData, setEditData] = useState({
    buyer_name: '',
    buyer_nip: '',
    buyer_address: '',
    notes: '',
  });

  if (!invoice) return null;

  const handleStartEdit = () => {
    setEditData({
      buyer_name: invoice.buyer_name || '',
      buyer_nip: invoice.buyer_nip || '',
      buyer_address: invoice.buyer_address || '',
      notes: invoice.notes || '',
    });
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
  };

  const handleSaveEdit = async () => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('user_invoices')
        .update({
          buyer_name: editData.buyer_name,
          buyer_nip: editData.buyer_nip,
          buyer_address: editData.buyer_address,
          notes: editData.notes,
        })
        .eq('id', invoice.id);

      if (error) throw error;

      toast.success('Faktura została zaktualizowana');
      setIsEditMode(false);
      onUpdate();
    } catch (err: any) {
      console.error('Error updating invoice:', err);
      toast.error('Błąd aktualizacji faktury: ' + (err.message || ''));
    } finally {
      setIsUpdating(false);
    }
  };

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
      const newIsPaid = !invoice.is_paid;
      const { error } = await supabase
        .from('user_invoices')
        .update({ 
          is_paid: newIsPaid,
          paid_at: newIsPaid ? new Date().toISOString() : null,
          paid_amount: newIsPaid ? invoice.gross_total : 0
        })
        .eq('id', invoice.id);

      if (error) throw error;

      toast.success(newIsPaid ? 'Oznaczono jako opłaconą' : 'Oznaczono jako nieopłaconą');
      onUpdate();
      onOpenChange(false); // Close sheet to show updated list
    } catch (err: any) {
      console.error('Error updating invoice:', err);
      toast.error('Błąd aktualizacji faktury: ' + (err.message || ''));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      // Fetch invoice items
      const { data: items, error: itemsError } = await supabase
        .from('user_invoice_items')
        .select('*')
        .eq('invoice_id', invoice.id);

      if (itemsError) {
        console.error('Error fetching invoice items:', itemsError);
      }

      // Fetch company data
      let companyData: any = null;
      if (invoice.company_id) {
        const { data: company } = await supabase
          .from('user_invoice_companies')
          .select('*')
          .eq('id', invoice.company_id)
          .maybeSingle();
        companyData = company;
      }

      // Build invoice data for HTML generator
      const invoiceData = {
        invoice_number: invoice.invoice_number || 'Faktura',
        type: invoice.invoice_type || 'invoice',
        issue_date: invoice.issue_date || new Date().toISOString().split('T')[0],
        sale_date: invoice.sale_date || invoice.issue_date || new Date().toISOString().split('T')[0],
        due_date: invoice.due_date || new Date().toISOString().split('T')[0],
        issue_place: invoice.issue_place || '',
        payment_method: (invoice.payment_method || 'transfer') as 'transfer' | 'cash' | 'card',
        notes: invoice.notes || '',
        currency: invoice.currency || 'PLN',
        paid_amount: invoice.paid_amount || 0,
        is_fully_paid: invoice.is_paid || false,
        items: (items || []).map((item: any) => ({
          name: item.name || '',
          pkwiu: item.pkwiu || '',
          quantity: item.quantity || 1,
          unit: item.unit || 'szt.',
          unit_net_price: item.unit_net_price || 0,
          vat_rate: item.vat_rate || '23',
          net_amount: item.net_amount || 0,
          vat_amount: item.vat_amount || 0,
          gross_amount: item.gross_amount || 0,
        })),
        seller: {
          name: companyData?.name || '',
          nip: companyData?.nip || '',
          address_street: companyData?.address_street || '',
          address_building_number: companyData?.address_building_number || '',
          address_apartment_number: companyData?.address_apartment_number || '',
          address_city: companyData?.address_city || '',
          address_postal_code: companyData?.address_postal_code || '',
          bank_name: companyData?.bank_name || '',
          bank_account: companyData?.bank_account || '',
          email: companyData?.email || '',
          phone: companyData?.phone || '',
          logo_url: companyData?.logo_url || '',
        },
        buyer: {
          name: invoice.buyer_name || '',
          nip: invoice.buyer_nip || '',
          address_street: invoice.buyer_address || '',
        },
      };

      // Generate HTML and open print window
      const html = generateInvoiceHtml(invoiceData);
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 300);
      }

      toast.success('PDF gotowy do druku');
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      toast.error('Błąd generowania PDF');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleSendEmail = () => {
    toast.info('Funkcja wysyłania email w przygotowaniu');
    // TODO: Implement email sending dialog
  };

  const handleSetReminder = () => {
    toast.info('Funkcja przypomnień w przygotowaniu');
    // TODO: Implement reminder dialog
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
                className={`cursor-pointer transition-colors ${
                  invoice.is_paid 
                    ? 'bg-green-500/10 text-green-600 hover:bg-green-500/20' 
                    : isOverdue 
                      ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20' 
                      : 'bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20'
                }`}
                onClick={handleMarkAsPaid}
              >
                {invoice.is_paid ? 'Opłacona ✓' : isOverdue ? 'Po terminie!' : 'Nieopłacona'}
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
              <p className={`font-medium text-sm ${isOverdue ? 'text-destructive' : ''}`}>
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
            {isEditMode ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="buyer_name" className="text-xs">Nazwa nabywcy</Label>
                  <Input
                    id="buyer_name"
                    value={editData.buyer_name}
                    onChange={(e) => setEditData(prev => ({ ...prev, buyer_name: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="buyer_nip" className="text-xs">NIP</Label>
                  <Input
                    id="buyer_nip"
                    value={editData.buyer_nip}
                    onChange={(e) => setEditData(prev => ({ ...prev, buyer_nip: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="buyer_address" className="text-xs">Adres</Label>
                  <Input
                    id="buyer_address"
                    value={editData.buyer_address}
                    onChange={(e) => setEditData(prev => ({ ...prev, buyer_address: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            ) : (
              <>
                <p className="font-medium text-sm">{invoice.buyer_name || '—'}</p>
                {invoice.buyer_nip && (
                  <p className="text-xs text-muted-foreground">NIP: {invoice.buyer_nip}</p>
                )}
                {invoice.buyer_address && (
                  <p className="text-xs text-muted-foreground">{invoice.buyer_address}</p>
                )}
              </>
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

          {/* Notes */}
          {isEditMode ? (
            <>
              <Separator />
              <div>
                <Label htmlFor="notes" className="text-xs">Uwagi</Label>
                <Input
                  id="notes"
                  value={editData.notes}
                  onChange={(e) => setEditData(prev => ({ ...prev, notes: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            </>
          ) : (
            invoice.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Uwagi</p>
                  <p className="text-sm">{invoice.notes}</p>
                </div>
              </>
            )
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2 pb-6">
          {isEditMode ? (
            <>
              <Button 
                className="w-full" 
                onClick={handleSaveEdit}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Zapisz zmiany
              </Button>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={handleCancelEdit}
                disabled={isUpdating}
              >
                Anuluj
              </Button>
            </>
          ) : (
            <>
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
                <Button variant="outline" onClick={handleDownloadPdf} disabled={isGeneratingPdf}>
                  {isGeneratingPdf ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
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
                <Button variant="outline" onClick={handleStartEdit}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edytuj
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
