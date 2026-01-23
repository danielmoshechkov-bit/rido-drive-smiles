import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  Download, 
  FileSpreadsheet, 
  Archive, 
  FileText,
  Loader2,
  Calendar
} from 'lucide-react';

interface ExportPanelProps {
  entityId: string;
}

type ExportType = 'invoices' | 'documents' | 'entries' | 'all';

export function ExportPanel({ entityId }: ExportPanelProps) {
  const [exporting, setExporting] = useState(false);
  const [exportType, setExportType] = useState<ExportType>('invoices');
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [includeDocuments, setIncludeDocuments] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pl-PL', { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(amount);
  };

  const exportToCSV = async () => {
    setExporting(true);
    try {
      let csvContent = '';
      let fileName = '';

      if (exportType === 'invoices' || exportType === 'all') {
        const { data: invoices, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('entity_id', entityId)
          .gte('issue_date', dateFrom)
          .lte('issue_date', dateTo)
          .order('issue_date', { ascending: false });

        if (error) throw error;

        const headers = [
          'Numer faktury',
          'Typ',
          'Data wystawienia',
          'Data sprzedaży',
          'Termin płatności',
          'Status',
          'Netto',
          'VAT',
          'Brutto',
          'Zapłacono',
          'Waluta',
          'Metoda płatności'
        ];

        csvContent = headers.join(';') + '\n';
        
        invoices?.forEach(inv => {
          csvContent += [
            inv.invoice_number,
            inv.type,
            inv.issue_date,
            inv.sale_date || '',
            inv.due_date || '',
            inv.status,
            formatCurrency(inv.net_amount || 0),
            formatCurrency(inv.vat_amount || 0),
            formatCurrency(inv.gross_amount || 0),
            formatCurrency(inv.paid_amount || 0),
            inv.currency || 'PLN',
            inv.payment_method || ''
          ].join(';') + '\n';
        });

        fileName = `faktury_${dateFrom}_${dateTo}.csv`;
      }

      if (exportType === 'entries' || exportType === 'all') {
        const { data: entries, error } = await supabase
          .from('accounting_entries')
          .select('*')
          .eq('entity_id', entityId)
          .gte('entry_date', dateFrom)
          .lte('entry_date', dateTo)
          .order('entry_date', { ascending: false });

        if (error) throw error;

        if (exportType === 'all') {
          csvContent += '\n\nWPISY KSIĘGOWE\n';
        }

        const entryHeaders = [
          'Data',
          'Okres',
          'Typ',
          'Opis',
          'Kwota',
          'Konto WN',
          'Konto MA',
          'Rejestr VAT',
          'MPK'
        ];

        csvContent += entryHeaders.join(';') + '\n';
        
        entries?.forEach(entry => {
          csvContent += [
            entry.entry_date,
            entry.accounting_period,
            entry.entry_type,
            (entry.description || '').replace(/;/g, ','),
            formatCurrency(entry.amount || 0),
            entry.debit_account || '',
            entry.credit_account || '',
            entry.vat_register || '',
            entry.cost_center || ''
          ].join(';') + '\n';
        });

        if (exportType === 'entries') {
          fileName = `ksiegowania_${dateFrom}_${dateTo}.csv`;
        } else {
          fileName = `eksport_pelny_${dateFrom}_${dateTo}.csv`;
        }
      }

      if (exportType === 'documents') {
        const { data: docs, error } = await supabase
          .from('document_inbox')
          .select('*')
          .eq('entity_id', entityId)
          .gte('created_at', dateFrom)
          .lte('created_at', dateTo + 'T23:59:59')
          .order('created_at', { ascending: false });

        if (error) throw error;

        const docHeaders = [
          'Nazwa pliku',
          'Typ',
          'Status',
          'Źródło',
          'Data dodania',
          'Dostawca',
          'NIP',
          'Kwota netto',
          'Kwota brutto'
        ];

        csvContent = docHeaders.join(';') + '\n';
        
        docs?.forEach(doc => {
          const supplier = doc.detected_supplier as Record<string, unknown> | null;
          const amounts = doc.detected_amounts as Record<string, unknown> | null;
          
          csvContent += [
            doc.file_name || '',
            doc.file_type || '',
            doc.status || '',
            doc.source || '',
            doc.created_at?.split('T')[0] || '',
            (supplier?.name as string) || '',
            (supplier?.nip as string) || '',
            formatCurrency((amounts?.net as number) || 0),
            formatCurrency((amounts?.gross as number) || 0)
          ].join(';') + '\n';
        });

        fileName = `dokumenty_${dateFrom}_${dateTo}.csv`;
      }

      // Download CSV
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Eksport CSV zakończony');
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error('Błąd eksportu: ' + error.message);
    } finally {
      setExporting(false);
    }
  };

  const exportToZIP = async () => {
    setExporting(true);
    try {
      // Fetch documents with files
      const { data: docs, error } = await supabase
        .from('document_inbox')
        .select('*')
        .eq('entity_id', entityId)
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo + 'T23:59:59');

      if (error) throw error;

      if (!docs || docs.length === 0) {
        toast.info('Brak dokumentów do eksportu');
        return;
      }

      // For now, create a manifest CSV with download links
      let manifest = 'Nazwa pliku;Status;URL\n';
      docs.forEach(doc => {
        manifest += `${doc.file_name || 'dokument'};${doc.status};${doc.file_url}\n`;
      });

      const BOM = '\uFEFF';
      const blob = new Blob([BOM + manifest], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dokumenty_manifest_${dateFrom}_${dateTo}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Wygenerowano manifest z ${docs.length} dokumentami`);
    } catch (error: any) {
      console.error('ZIP export error:', error);
      toast.error('Błąd eksportu ZIP');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Eksport danych
        </CardTitle>
        <CardDescription>
          Eksportuj faktury, dokumenty i wpisy księgowe do CSV
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Date range */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Od daty
            </Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Do daty
            </Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        {/* Export type */}
        <div className="space-y-2">
          <Label>Typ eksportu</Label>
          <Select value={exportType} onValueChange={(v) => setExportType(v as ExportType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="invoices">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Faktury sprzedaży
                </span>
              </SelectItem>
              <SelectItem value="documents">
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Dokumenty kosztowe
                </span>
              </SelectItem>
              <SelectItem value="entries">
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Wpisy księgowe
                </span>
              </SelectItem>
              <SelectItem value="all">
                <span className="flex items-center gap-2">
                  <Archive className="h-4 w-4" />
                  Wszystko (pełny eksport)
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Include documents option */}
        {exportType === 'all' && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="include-docs"
              checked={includeDocuments}
              onCheckedChange={(checked) => setIncludeDocuments(checked === true)}
            />
            <Label htmlFor="include-docs" className="cursor-pointer">
              Dołącz pliki dokumentów (ZIP)
            </Label>
          </div>
        )}

        {/* Export buttons */}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={exportToCSV}
            disabled={exporting}
            className="gap-2"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Eksportuj CSV
          </Button>

          {(exportType === 'documents' || includeDocuments) && (
            <Button
              variant="outline"
              onClick={exportToZIP}
              disabled={exporting}
              className="gap-2"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              Pobierz dokumenty (manifest)
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
