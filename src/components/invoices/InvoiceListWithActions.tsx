import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Trash2, Download, Loader2, CheckSquare, XSquare } from 'lucide-react';
import { InvoiceExpandableRow } from './InvoiceExpandableRow';
import { generateInvoiceHtml } from '@/utils/invoiceHtmlGenerator';
import { formatIBAN } from '@/utils/formatters';
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

interface InvoiceListWithActionsProps {
  invoices: UserInvoice[];
  onUpdate: () => void;
  showMarginInfo?: boolean;
}

export function InvoiceListWithActions({ invoices, onUpdate, showMarginInfo }: InvoiceListWithActionsProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const allSelected = invoices.length > 0 && selectedIds.size === invoices.length;
  const someSelected = selectedIds.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(invoices.map(i => i.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      // Delete items first
      for (const id of ids) {
        await supabase.from('user_invoice_items').delete().eq('invoice_id', id);
      }
      // Delete invoices
      const { error } = await supabase
        .from('user_invoices')
        .delete()
        .in('id', ids);

      if (error) throw error;

      toast.success(`Usunięto ${ids.length} faktur`);
      setSelectedIds(new Set());
      setShowBulkDeleteDialog(false);
      onUpdate();
    } catch (err: any) {
      toast.error('Błąd usuwania: ' + (err.message || ''));
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkDownloadPdf = async () => {
    setBulkDownloading(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        const invoice = invoices.find(i => i.id === id);
        if (!invoice) continue;

        const { data: items } = await supabase
          .from('user_invoice_items')
          .select('*')
          .eq('invoice_id', id);

        let companyData: any = null;
        if (invoice.company_id) {
          const { data: company } = await supabase
            .from('user_invoice_companies')
            .select('*')
            .eq('id', invoice.company_id)
            .maybeSingle();
          companyData = company;
        }

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
          ksef_reference: invoice.ksef_reference || undefined,
        };

        const html = generateInvoiceHtml(invoiceData);
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          await new Promise(r => setTimeout(r, 500));
          printWindow.print();
        }
      }
      toast.success(`Wygenerowano PDF dla ${ids.length} faktur`);
    } catch (err: any) {
      toast.error('Błąd generowania PDF: ' + (err.message || ''));
    } finally {
      setBulkDownloading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Bulk actions toolbar */}
      <div className="flex items-center gap-3 px-2">
        <Checkbox
          checked={allSelected}
          onCheckedChange={toggleAll}
          aria-label="Zaznacz wszystkie"
        />
        <span className="text-xs text-muted-foreground">
          {someSelected ? `Zaznaczono: ${selectedIds.size}` : 'Zaznacz wszystkie'}
        </span>
        
        {someSelected && (
          <div className="flex items-center gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkDownloadPdf}
              disabled={bulkDownloading}
              className="gap-1"
            >
              {bulkDownloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Pobierz PDF ({selectedIds.size})
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowBulkDeleteDialog(true)}
              disabled={bulkDeleting}
              className="gap-1"
            >
              {bulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Usuń ({selectedIds.size})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              className="gap-1 text-muted-foreground"
            >
              <XSquare className="h-3 w-3" />
              Odznacz
            </Button>
          </div>
        )}
      </div>

      {/* Invoice rows with checkboxes */}
      <div className="space-y-3 pb-20">
        {invoices.map((invoice) => (
          <div key={invoice.id} className="flex items-start gap-3">
            <div className="pt-5">
              <Checkbox
                checked={selectedIds.has(invoice.id)}
                onCheckedChange={() => toggleOne(invoice.id)}
                aria-label={`Zaznacz ${invoice.invoice_number}`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <InvoiceExpandableRow
                invoice={invoice}
                onUpdate={onUpdate}
                showMarginInfo={showMarginInfo}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Bulk delete confirmation */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć {selectedIds.size} faktur?</AlertDialogTitle>
            <AlertDialogDescription>
              Wybrane faktury zostaną trwale usunięte. Tej operacji nie można cofnąć.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleting}
            >
              {bulkDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Usuń {selectedIds.size} faktur
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
