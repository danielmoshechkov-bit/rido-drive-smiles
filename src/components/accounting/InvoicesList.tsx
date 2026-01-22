import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  Plus, 
  Search, 
  Download, 
  FileText, 
  MoreVertical, 
  Send, 
  Eye,
  Loader2,
  Receipt,
  Check,
  AlertCircle,
  Mail
} from 'lucide-react';
import { toast } from 'sonner';
import { InvoiceEditor } from './InvoiceEditor';

interface Invoice {
  id: string;
  invoice_number: string | null;
  issue_date: string;
  due_date: string;
  gross_amount: number;
  net_amount: number;
  vat_amount: number;
  status: string;
  type: string;
  payment_method: string | null;
  pdf_url: string | null;
  buyer_snapshot: any;
  recipient_id: string | null;
}

interface InvoicesListProps {
  entityId: string;
  invoices: Invoice[];
  loading: boolean;
  onRefresh: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
  draft: { label: 'Robocza', variant: 'secondary', icon: FileText },
  issued: { label: 'Wystawiona', variant: 'default', icon: Check },
  sent: { label: 'Wysłana', variant: 'default', icon: Send },
  paid: { label: 'Opłacona', variant: 'outline', icon: Check },
  partially_paid: { label: 'Częściowo', variant: 'secondary', icon: AlertCircle },
  overdue: { label: 'Zaległa', variant: 'destructive', icon: AlertCircle },
  cancelled: { label: 'Anulowana', variant: 'secondary', icon: AlertCircle },
};

const TYPE_LABELS: Record<string, string> = {
  invoice: 'VAT',
  proforma: 'Proforma',
  correction: 'Korekta',
  receipt: 'Rachunek',
};

export function InvoicesList({ entityId, invoices, loading, onRefresh }: InvoicesListProps) {
  const [showEditor, setShowEditor] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = 
      inv.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.buyer_snapshot?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pl-PL');
  };

  const handleOpenEditor = (invoiceId?: string) => {
    setEditingInvoiceId(invoiceId || null);
    setShowEditor(true);
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingInvoiceId(null);
  };

  const handleEditorSaved = () => {
    onRefresh();
  };

  const handleGeneratePdf = async (invoice: Invoice) => {
    if (invoice.status === 'draft') {
      toast.error('Najpierw wystaw fakturę');
      return;
    }

    setGeneratingPdf(invoice.id);
    try {
      const { data, error } = await supabase.functions.invoke('invoice-pdf', {
        body: { invoiceId: invoice.id },
      });

      if (error) throw error;

      if (data?.pdfUrl) {
        // Update invoice with PDF URL
        await supabase
          .from('invoices')
          .update({ pdf_url: data.pdfUrl })
          .eq('id', invoice.id);

        // Open PDF in new tab
        window.open(data.pdfUrl, '_blank');
        toast.success('PDF wygenerowany');
        onRefresh();
      }
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      toast.error('Błąd generowania PDF');
    } finally {
      setGeneratingPdf(null);
    }
  };

  const handleDownloadPdf = (invoice: Invoice) => {
    if (invoice.pdf_url) {
      window.open(invoice.pdf_url, '_blank');
    } else {
      handleGeneratePdf(invoice);
    }
  };

  const handleMarkAsPaid = async (invoice: Invoice) => {
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ 
          status: 'paid',
          paid_amount: invoice.gross_amount,
        })
        .eq('id', invoice.id);

      if (error) throw error;

      // Log to audit
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('audit_log').insert({
        actor_user_id: user?.id,
        actor_type: 'user',
        action: 'INVOICE_MARKED_PAID',
        target_type: 'invoice',
        target_id: invoice.id,
        metadata: { gross_amount: invoice.gross_amount },
      });

      toast.success('Faktura oznaczona jako opłacona');
      onRefresh();
    } catch (error: any) {
      console.error('Error updating invoice:', error);
      toast.error('Błąd aktualizacji');
    }
  };

  const handleSendEmail = async (invoice: Invoice) => {
    if (!invoice.buyer_snapshot?.email) {
      toast.error('Kontrahent nie ma podanego adresu email');
      return;
    }

    try {
      const { error } = await supabase.functions.invoke('send-invoice-email', {
        body: { invoiceId: invoice.id },
      });

      if (error) throw error;

      await supabase
        .from('invoices')
        .update({ status: 'sent' })
        .eq('id', invoice.id);

      toast.success('Email wysłany');
      onRefresh();
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast.error('Błąd wysyłki emaila');
    }
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Faktury sprzedaży</h2>
          <Button onClick={() => handleOpenEditor()} className="gap-2">
            <Plus className="h-4 w-4" />
            Nowa faktura
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Szukaj po numerze lub kontrahencie..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  <SelectItem value="draft">Robocze</SelectItem>
                  <SelectItem value="issued">Wystawione</SelectItem>
                  <SelectItem value="sent">Wysłane</SelectItem>
                  <SelectItem value="paid">Opłacone</SelectItem>
                  <SelectItem value="overdue">Zaległe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Receipt className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Brak faktur</p>
                <p className="text-sm mb-4">Zacznij od wystawienia pierwszej faktury</p>
                <Button onClick={() => handleOpenEditor()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Wystaw fakturę
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Numer</TableHead>
                      <TableHead>Kontrahent</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Termin</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Kwota brutto</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((invoice) => (
                      <TableRow 
                        key={invoice.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleOpenEditor(invoice.id)}
                      >
                        <TableCell className="font-medium">
                          {invoice.invoice_number || <span className="text-muted-foreground italic">Robocza</span>}
                        </TableCell>
                        <TableCell>
                          {invoice.buyer_snapshot?.name || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>{formatDate(invoice.issue_date)}</TableCell>
                        <TableCell>{formatDate(invoice.due_date)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{TYPE_LABELS[invoice.type] || invoice.type}</Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(invoice.gross_amount)}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleOpenEditor(invoice.id)}>
                                <Eye className="h-4 w-4 mr-2" />
                                Podgląd / Edycja
                              </DropdownMenuItem>
                              {invoice.status !== 'draft' && (
                                <DropdownMenuItem onClick={() => handleDownloadPdf(invoice)}>
                                  {generatingPdf === invoice.id ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Download className="h-4 w-4 mr-2" />
                                  )}
                                  {invoice.pdf_url ? 'Pobierz PDF' : 'Generuj PDF'}
                                </DropdownMenuItem>
                              )}
                              {invoice.status === 'issued' && (
                                <DropdownMenuItem onClick={() => handleSendEmail(invoice)}>
                                  <Mail className="h-4 w-4 mr-2" />
                                  Wyślij mailem
                                </DropdownMenuItem>
                              )}
                              {(invoice.status === 'issued' || invoice.status === 'sent') && (
                                <DropdownMenuItem onClick={() => handleMarkAsPaid(invoice)}>
                                  <Check className="h-4 w-4 mr-2" />
                                  Oznacz jako opłacona
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary */}
        {filteredInvoices.length > 0 && (
          <div className="flex flex-wrap gap-4 justify-end text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Liczba faktur:</span>
              <span className="font-medium">{filteredInvoices.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Suma netto:</span>
              <span className="font-medium">
                {formatCurrency(filteredInvoices.reduce((sum, inv) => sum + inv.net_amount, 0))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Suma brutto:</span>
              <span className="font-bold">
                {formatCurrency(filteredInvoices.reduce((sum, inv) => sum + inv.gross_amount, 0))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Invoice Editor Modal */}
      {showEditor && (
        <InvoiceEditor
          entityId={entityId}
          invoiceId={editingInvoiceId}
          onClose={handleCloseEditor}
          onSaved={handleEditorSaved}
        />
      )}
    </>
  );
}
