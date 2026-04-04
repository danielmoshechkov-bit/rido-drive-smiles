import { useState, useEffect } from 'react';
import { format, subDays } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { type InvoiceData } from '@/utils/invoiceHtmlGenerator';
import { formatIBAN } from '@/utils/formatters';
import { 
  ChevronDown, 
  ChevronRight,
  CheckCircle, 
  Clock, 
  Edit, 
  Trash2,
  FileText,
  Calendar,
  Loader2,
  TrendingUp,
  Send,
  Mail,
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
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { SimpleFreeInvoice } from './SimpleFreeInvoice';
import { KsefSendButton } from './KsefSendButton';
import { InvoicePreviewModal } from './InvoicePreviewModal';

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
  ksef_status?: string;
  ksef_reference?: string;
}

interface InvoiceExpandableRowProps {
  invoice: UserInvoice;
  onUpdate: () => void;
  showMarginInfo?: boolean;
}

export function InvoiceExpandableRow({ invoice, onUpdate, showMarginInfo = false }: InvoiceExpandableRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Live KSeF status tracking (updates without page refresh)
  const [liveKsefStatus, setLiveKsefStatus] = useState<string | undefined>(invoice.ksef_reference ? 'accepted' : invoice.ksef_status);
  const [liveKsefReference, setLiveKsefReference] = useState<string | undefined>(invoice.ksef_reference);
  
  // Sync from prop when parent refetches
  useEffect(() => {
    setLiveKsefStatus(invoice.ksef_reference ? 'accepted' : invoice.ksef_status);
    setLiveKsefReference(invoice.ksef_reference);
  }, [invoice.ksef_status, invoice.ksef_reference]);

  
  // Edit dialog state
  
  // Edit dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  
  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewInvoiceData, setPreviewInvoiceData] = useState<InvoiceData | null>(null);
  
  // Inline email send state
  const [showInlineEmail, setShowInlineEmail] = useState(false);
  const [inlineEmail, setInlineEmail] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Reminder dialog state
  const [showReminderPopover, setShowReminderPopover] = useState(false);
  const [reminderDate, setReminderDate] = useState<Date | undefined>(
    invoice.due_date ? subDays(new Date(invoice.due_date), 3) : undefined
  );

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
    } catch (err: any) {
      console.error('Error updating invoice:', err);
      toast.error('Błąd aktualizacji statusu: ' + (err.message || 'Nieznany błąd'));
    } finally {
      setIsUpdating(false);
    }
  };

  const isKsefSent = ['accepted', 'processing', 'sent'].includes(invoice.ksef_status || '');
  const canDelete = !isKsefSent;

  const handleDelete = async () => {
    if (isKsefSent) {
      toast.error('Nie można usunąć faktury wysłanej do KSeF. Wystaw korektę.');
      return;
    }
    setIsDeleting(true);
    try {
      await supabase
        .from('user_invoice_items')
        .delete()
        .eq('invoice_id', invoice.id);

      const { error } = await supabase
        .from('user_invoices')
        .delete()
        .eq('id', invoice.id);

      if (error) throw error;

      toast.success('Faktura została usunięta');
      setShowDeleteDialog(false);
      onUpdate();
    } catch (err: any) {
      console.error('Error deleting invoice:', err);
      toast.error('Błąd usuwania faktury: ' + (err.message || ''));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleKsefStatusChange = async () => {
    // Refetch latest KSeF data from DB
    const { data: fresh } = await supabase
      .from('user_invoices')
      .select('ksef_status, ksef_reference')
      .eq('id', invoice.id)
      .single();
    if (fresh) {
      const newStatus = fresh.ksef_reference ? 'accepted' : (fresh.ksef_status || undefined);
      setLiveKsefStatus(newStatus);
      setLiveKsefReference(fresh.ksef_reference || undefined);
    }
    onUpdate();
  };

  const prepareInvoiceData = async (): Promise<InvoiceData | null> => {
    // Always refetch latest ksef data before PDF
    const { data: freshInvoice } = await supabase
      .from('user_invoices')
      .select('ksef_status, ksef_reference')
      .eq('id', invoice.id)
      .maybeSingle();
    const latestKsefRef = freshInvoice?.ksef_reference || liveKsefReference;

    const { data: items } = await supabase
      .from('user_invoice_items')
      .select('*')
      .eq('invoice_id', invoice.id);

    let companyData: any = null;
    if (invoice.company_id) {
      const { data: company } = await supabase
        .from('user_invoice_companies')
        .select('*')
        .eq('id', invoice.company_id)
        .maybeSingle();
      companyData = company;
    }

    return {
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
        bank_account: formatIBAN(companyData?.bank_account),
        email: companyData?.email || '',
        phone: companyData?.phone || '',
        logo_url: companyData?.logo_url || '',
      },
      buyer: {
        name: invoice.buyer_name || '',
        nip: invoice.buyer_nip || '',
        address_street: invoice.buyer_address || '',
      },
      ksef_reference: latestKsefRef || undefined,
    };
  };

  const handleOpenPreview = async () => {
    setIsGeneratingPdf(true);
    try {
      const data = await prepareInvoiceData();
      if (data) {
        setPreviewInvoiceData(data);
        setShowPreviewModal(true);
      }
    } catch (err: any) {
      console.error('Error preparing invoice preview:', err);
      toast.error('Błąd przygotowania podglądu');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const generatePdfBase64 = async (): Promise<string | null> => {
    try {
      const data = await prepareInvoiceData();
      if (!data) return null;
      const { generateInvoiceHtml } = await import('@/utils/invoiceHtmlGenerator');
      const html = generateInvoiceHtml(data);
      const html2pdf = (await import('html2pdf.js')).default;
      
      const container = document.createElement('div');
      container.innerHTML = html;
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      document.body.appendChild(container);
      
      const pdfBlob: Blob = await (html2pdf()
        .set({
          margin: 0,
          filename: 'faktura.pdf',
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(container) as any)
        .output('blob');
      
      document.body.removeChild(container);
      
      // Convert blob to base64
      const reader = new FileReader();
      return new Promise((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(pdfBlob);
      });
    } catch (err) {
      console.error('Error generating PDF:', err);
      return null;
    }
  };

  const handleSendInvoiceEmail = async (email: string) => {
    setIsSendingEmail(true);
    try {
      toast.info('Generuję PDF i wysyłam...');
      const pdfBase64 = await generatePdfBase64();
      
      const { data, error } = await supabase.functions.invoke('send-invoice-email', {
        body: { 
          invoice_id: invoice.id,
          recipient_email: email,
          type: 'new_invoice',
          pdf_base64: pdfBase64 || undefined,
        }
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Nie udało się wysłać');
      toast.success(`Faktura wysłana na ${email}`);
      setShowInlineEmail(false);
      setInlineEmail('');
    } catch (err: any) {
      console.error('Error sending email:', err);
      toast.error('Błąd wysyłania email: ' + (err.message || 'Nieznany błąd'));
    } finally {
      setIsSendingEmail(false);
    }
  };




  const handleSetReminder = (selectedDate: Date) => {
    if (!selectedDate) {
      toast.error('Wybierz datę przypomnienia');
      return;
    }
    
    // Save reminder - in full implementation save to database
    toast.success(`Przypomnienie ustawione na ${format(selectedDate, 'd MMM yyyy', { locale: pl })}`);
    setShowReminderPopover(false);
  };

  const handleEdit = () => {
    setShowEditDialog(true);
  };

  const handleEditSaved = () => {
    setShowEditDialog(false);
    onUpdate();
  };

  return (
    <>
      <div className="border rounded-lg bg-card overflow-hidden">
        {/* Main row - always visible */}
        <div 
          className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{invoice.invoice_number || (invoice.ksef_status === 'draft' ? 'Szkic' : 'Faktura')}</p>
                  {invoice.ksef_status === 'draft' && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Szkic</Badge>
                  )}
                  {invoice.invoice_type === 'proforma' && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-violet-500/10 text-violet-600 border-violet-200">Pro forma</Badge>
                  )}
                  {invoice.invoice_type === 'correction' && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-200">Korekta</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {invoice.buyer_name || 'Brak nabywcy'}
                  {invoice.invoice_type === 'correction' && (invoice as any).corrected_invoice_number && (
                    <span className="ml-1">→ {(invoice as any).corrected_invoice_number}</span>
                  )}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-xs text-muted-foreground">
                  Wystawiono: {formatDate(invoice.issue_date)} • Termin: {formatDate(invoice.due_date)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Netto: {Number(invoice.net_total || 0).toLocaleString('pl-PL')} zł • VAT: {Number(invoice.vat_total || 0).toLocaleString('pl-PL')} zł
                </p>
              </div>
              
              <div className="text-right">
                <p className="font-bold text-lg">{Number(invoice.gross_total || 0).toLocaleString('pl-PL')} zł</p>
                <p className="text-[10px] text-orange-500 font-semibold">PAMIĘTAJ</p>
              </div>
              
              {/* Delete button - blocked for KSeF-sent invoices */}
              {canDelete ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground opacity-40 cursor-not-allowed"
                  disabled
                  title="Nie można usunąć faktury wysłanej do KSeF. Wystaw korektę."
                  onClick={(e) => e.stopPropagation()}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              
              <Badge 
                className={`cursor-pointer transition-colors min-w-[100px] justify-center ${
                  invoice.is_paid 
                    ? 'bg-green-500/10 text-green-600 hover:bg-green-500/20' 
                    : isOverdue 
                      ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20' 
                      : 'bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkAsPaid();
                }}
              >
                {isUpdating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  invoice.is_paid ? 'Opłacona ✓' : isOverdue ? 'Po terminie!' : 'Nieopłacona'
                )}
              </Badge>
              
              {isExpanded ? (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          </div>
        </div>
        
        {/* Expanded details */}
        {isExpanded && (
          <div className="border-t bg-muted/30 p-4 space-y-4">
            {/* Details grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Data wystawienia
                </p>
                <p className="font-medium">{formatDate(invoice.issue_date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Data sprzedaży
                </p>
                <p className="font-medium">{formatDate(invoice.sale_date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Termin płatności
                </p>
                <p className={`font-medium ${isOverdue ? 'text-destructive' : ''}`}>
                  {formatDate(invoice.due_date)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Waluta</p>
                <p className="font-medium">{invoice.currency || 'PLN'}</p>
              </div>
            </div>

            {/* Buyer info */}
            <div className="p-3 bg-background rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Nabywca</p>
              <p className="font-medium">{invoice.buyer_name || '—'}</p>
              {invoice.buyer_nip && (
                <p className="text-xs text-muted-foreground">NIP: {invoice.buyer_nip}</p>
              )}
              {invoice.buyer_address && (
                <p className="text-xs text-muted-foreground">{invoice.buyer_address}</p>
              )}
            </div>

            {/* Margin info (if inventory enabled) */}
            {showMarginInfo && (
              <div className="p-3 bg-accent/50 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">Szacunkowa marża</p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Przychód netto</p>
                    <p className="font-medium">{Number(invoice.net_total || 0).toLocaleString('pl-PL')} zł</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Koszt (szac.)</p>
                    <p className="font-medium text-muted-foreground">—</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Zysk brutto</p>
                    <p className="font-medium text-primary">—</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  * Włącz moduł magazynowy, aby śledzić rzeczywistą marżę
                </p>
              </div>
            )}

            {/* Amounts summary */}
            <div className="flex justify-end">
              <div className="space-y-1 text-sm w-48">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Netto:</span>
                  <span>{Number(invoice.net_total || 0).toLocaleString('pl-PL')} zł</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT:</span>
                  <span>{Number(invoice.vat_total || 0).toLocaleString('pl-PL')} zł</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t">
                  <span>Brutto:</span>
                  <span>{Number(invoice.gross_total || 0).toLocaleString('pl-PL')} zł</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button 
                size="sm" 
                variant={invoice.is_paid ? 'outline' : 'default'}
                onClick={handleMarkAsPaid}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-1" />
                )}
                {invoice.is_paid ? 'Cofnij opłacenie' : 'Oznacz jako opłaconą'}
              </Button>
              
              {/* PDF/Podgląd button - opens preview modal */}
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleOpenPreview} 
                disabled={isGeneratingPdf || liveKsefStatus === 'processing' || liveKsefStatus === 'sent'}
                title={liveKsefStatus === 'processing' || liveKsefStatus === 'sent' ? 'Czekaj na zatwierdzenie KSeF' : 'Podgląd faktury'}
              >
                {isGeneratingPdf ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-1" />
                )}
                {liveKsefStatus === 'processing' || liveKsefStatus === 'sent' 
                  ? '⏳ Czekaj na KSeF...' 
                  : isGeneratingPdf ? 'Ładuję...' : 'Podgląd / PDF'}
              </Button>

              {/* Wyślij email button */}
              <Popover open={showInlineEmail} onOpenChange={setShowInlineEmail}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline">
                    {isSendingEmail ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-1" />
                    )}
                    Wyślij
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-3" align="start">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium">Wyślij fakturę mailem</p>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={inlineEmail}
                      onChange={(e) => setInlineEmail(e.target.value)}
                      placeholder="adres@email.com"
                      className="flex-1 h-8 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && inlineEmail) {
                          handleSendInvoiceEmail(inlineEmail);
                        }
                      }}
                    />
                    <Button 
                      size="sm" 
                      className="h-8"
                      onClick={() => handleSendInvoiceEmail(inlineEmail)} 
                      disabled={isSendingEmail || !inlineEmail}
                    >
                      {isSendingEmail ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Wyślij'}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              
              <Popover open={showReminderPopover} onOpenChange={setShowReminderPopover}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Clock className="h-4 w-4 mr-1" />
                    Przypomnienie
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-3 border-b">
                    <p className="text-sm font-medium">Wybierz datę przypomnienia</p>
                    <p className="text-xs text-muted-foreground">
                      Termin płatności: {invoice.due_date ? format(new Date(invoice.due_date), 'd MMM yyyy', { locale: pl }) : 'brak'}
                    </p>
                  </div>
                  <CalendarComponent
                    mode="single"
                    selected={reminderDate}
                    onSelect={(date) => {
                      if (date) {
                        setReminderDate(date);
                      }
                    }}
                    initialFocus
                  />
                  <div className="p-3 border-t flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowReminderPopover(false)}>
                      Anuluj
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => reminderDate && handleSetReminder(reminderDate)}
                      disabled={!reminderDate}
                    >
                      Ustaw
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              
              <KsefSendButton invoiceId={invoice.id} size="sm" onStatusChange={handleKsefStatusChange} />

              <Button size="sm" variant="outline" onClick={handleEdit}>
                <Edit className="h-4 w-4 mr-1" />
                Edytuj
              </Button>
              
              {canDelete ? (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Usuń
                </Button>
              ) : (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="opacity-40 cursor-not-allowed"
                  disabled
                  title="Nie można usunąć faktury wysłanej do KSeF. Wystaw korektę."
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Usuń
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Czy na pewno chcesz usunąć tę fakturę?</AlertDialogTitle>
            <AlertDialogDescription>
              Faktura {invoice.invoice_number} zostanie trwale usunięta. Tej operacji nie można cofnąć.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Usuń fakturę
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invoice Preview Modal */}
      {previewInvoiceData && (
        <InvoicePreviewModal
          open={showPreviewModal}
          onOpenChange={(open) => {
            setShowPreviewModal(open);
            if (!open) setPreviewInvoiceData(null);
          }}
          invoiceData={previewInvoiceData}
          isLoggedIn={true}
          invoiceIssued={!!invoice.ksef_status && invoice.ksef_status !== 'draft'}
          onSend={handleSendInvoiceEmail}
        />
      )}

      {/* Edit Dialog - Full Invoice Form */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto p-0">
          <SimpleFreeInvoice 
            editInvoiceId={invoice.id}
            onClose={() => setShowEditDialog(false)}
            onSaved={handleEditSaved}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
