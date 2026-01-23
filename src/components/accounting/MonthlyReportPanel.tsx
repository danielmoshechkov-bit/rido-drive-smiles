import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  FileText,
  Receipt,
  Calculator,
  Loader2,
  Download
} from 'lucide-react';

interface MonthlyReportPanelProps {
  entityId: string;
}

interface ReportData {
  invoicesCount: number;
  invoicesTotal: number;
  invoicesPaid: number;
  invoicesUnpaid: number;
  documentsCount: number;
  documentsProcessed: number;
  entriesCount: number;
  entriesTotal: number;
  vatSales: number;
  vatPurchases: number;
  vatBalance: number;
}

const MONTHS = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'
];

export function MonthlyReportPanel({ entityId }: MonthlyReportPanelProps) {
  const [loading, setLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [report, setReport] = useState<ReportData | null>(null);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  useEffect(() => {
    if (entityId) {
      generateReport();
    }
  }, [entityId, selectedYear, selectedMonth]);

  const generateReport = async () => {
    setLoading(true);
    try {
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];

      // Fetch invoices
      const { data: invoices } = await supabase
        .from('invoices')
        .select('*')
        .eq('entity_id', entityId)
        .gte('issue_date', startDate)
        .lte('issue_date', endDate);

      // Fetch documents
      const { data: documents } = await supabase
        .from('document_inbox')
        .select('*')
        .eq('entity_id', entityId)
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59');

      // Fetch accounting entries
      const { data: entries } = await supabase
        .from('accounting_entries')
        .select('*')
        .eq('entity_id', entityId)
        .eq('accounting_period', `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`);

      const invoicesArr = invoices || [];
      const documentsArr = documents || [];
      const entriesArr = entries || [];

      // Calculate VAT from invoices (sales)
      const vatSales = invoicesArr.reduce((sum, inv) => sum + (inv.vat_amount || 0), 0);

      // Calculate VAT from documents (purchases) - from detected amounts
      const vatPurchases = documentsArr.reduce((sum, doc) => {
        const amounts = doc.detected_amounts as Record<string, unknown> | null;
        return sum + ((amounts?.vat as number) || 0);
      }, 0);

      setReport({
        invoicesCount: invoicesArr.length,
        invoicesTotal: invoicesArr.reduce((sum, inv) => sum + (inv.gross_amount || 0), 0),
        invoicesPaid: invoicesArr.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + (inv.gross_amount || 0), 0),
        invoicesUnpaid: invoicesArr.filter(inv => inv.status !== 'paid' && inv.status !== 'cancelled').reduce((sum, inv) => sum + (inv.gross_amount || 0), 0),
        documentsCount: documentsArr.length,
        documentsProcessed: documentsArr.filter(doc => doc.status === 'booked').length,
        entriesCount: entriesArr.length,
        entriesTotal: entriesArr.reduce((sum, entry) => sum + (entry.amount || 0), 0),
        vatSales,
        vatPurchases,
        vatBalance: vatSales - vatPurchases,
      });
    } catch (error: any) {
      console.error('Report generation error:', error);
      toast.error('Błąd generowania raportu');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(amount);
  };

  const exportReportToPDF = () => {
    // For now, just show the data - PDF generation would require additional library
    toast.info('Eksport PDF będzie dostępny wkrótce');
  };

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Raport miesięczny
          </CardTitle>
          <CardDescription>
            Podsumowanie działalności za wybrany okres
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">Rok</label>
              <Select 
                value={String(selectedYear)} 
                onValueChange={(v) => setSelectedYear(parseInt(v))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(year => (
                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Miesiąc</label>
              <Select 
                value={String(selectedMonth)} 
                onValueChange={(v) => setSelectedMonth(parseInt(v))}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="gap-2" onClick={exportReportToPDF}>
              <Download className="h-4 w-4" />
              Eksport
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : report ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Invoices */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Faktury sprzedaży
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-2xl font-bold">{report.invoicesCount}</div>
              <div className="text-sm text-muted-foreground">
                Łącznie: {formatCurrency(report.invoicesTotal)}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className="text-green-600">
                  Opłacone: {formatCurrency(report.invoicesPaid)}
                </Badge>
                {report.invoicesUnpaid > 0 && (
                  <Badge variant="destructive">
                    Nieopłacone: {formatCurrency(report.invoicesUnpaid)}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                Dokumenty kosztowe
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-2xl font-bold">{report.documentsCount}</div>
              <div className="text-sm text-muted-foreground">
                Zaksięgowane: {report.documentsProcessed} z {report.documentsCount}
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ 
                    width: `${report.documentsCount > 0 ? (report.documentsProcessed / report.documentsCount) * 100 : 0}%` 
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Entries */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary" />
                Wpisy księgowe
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-2xl font-bold">{report.entriesCount}</div>
              <div className="text-sm text-muted-foreground">
                Suma obrotów: {formatCurrency(report.entriesTotal)}
              </div>
            </CardContent>
          </Card>

          {/* VAT Summary */}
          <Card className="md:col-span-2 lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Podsumowanie VAT</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-1">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    VAT należny (sprzedaż)
                  </div>
                  <div className="text-xl font-bold text-green-600">
                    {formatCurrency(report.vatSales)}
                  </div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-1">
                    <TrendingDown className="h-4 w-4 text-red-600" />
                    VAT naliczony (zakupy)
                  </div>
                  <div className="text-xl font-bold text-red-600">
                    {formatCurrency(report.vatPurchases)}
                  </div>
                </div>
                <div className="text-center p-4 bg-primary/10 rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">
                    Saldo VAT
                  </div>
                  <div className={`text-xl font-bold ${report.vatBalance >= 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    {report.vatBalance >= 0 ? 'Do zapłaty: ' : 'Do zwrotu: '}
                    {formatCurrency(Math.abs(report.vatBalance))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
