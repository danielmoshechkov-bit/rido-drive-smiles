import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Send, Loader2, Calendar, FileText, FileSpreadsheet, Code, Mail } from 'lucide-react';

interface MonthlyExportEmailProps {
  entityId: string;
}

const MONTHS = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

export function MonthlyExportEmail({ entityId }: MonthlyExportEmailProps) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [format, setFormat] = useState<'pdf' | 'csv' | 'jpk'>('pdf');
  const [emails, setEmails] = useState('');
  const [includeIssued, setIncludeIssued] = useState(true);
  const [includePurchase, setIncludePurchase] = useState(true);
  const [includeVat, setIncludeVat] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [aiSummary, setAiSummary] = useState('');

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(amount);

  const generateAndSend = async () => {
    setGenerating(true);
    setAiSummary('');

    try {
      const dateFrom = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const dateTo = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${lastDay}`;

      // Fetch issued invoices
      let issuedData: any[] = [];
      let purchaseData: any[] = [];

      if (includeIssued) {
        const { data } = await supabase
          .from('invoices')
          .select('*')
          .eq('entity_id', entityId)
          .gte('issue_date', dateFrom)
          .lte('issue_date', dateTo);
        issuedData = data || [];
      }

      if (includePurchase) {
        const { data } = await (supabase
          .from('purchase_invoices')
          .select('*') as any)
          .eq('entity_id', entityId)
          .gte('purchase_date', dateFrom)
          .lte('purchase_date', dateTo);
        purchaseData = (data || []) as any[];
      }

      const issuedTotal = issuedData.reduce((s, i) => s + (i.gross_amount || 0), 0);
      const issuedNet = issuedData.reduce((s, i) => s + (i.net_amount || 0), 0);
      const issuedVat = issuedData.reduce((s, i) => s + (i.vat_amount || 0), 0);
      const purchaseTotal = purchaseData.reduce((s: number, i: any) => s + (i.total_gross || 0), 0);
      const purchaseNet = purchaseData.reduce((s: number, i: any) => s + (i.total_net || 0), 0);
      const purchaseVat = purchaseData.reduce((s: number, i: any) => s + (i.total_vat || 0), 0);

      // Generate AI summary
      try {
        const { data: aiData } = await supabase.functions.invoke('ai-agent-test', {
          body: {
            model: 'claude-haiku-4-5-20251001',
            system_prompt: 'Jesteś księgowym. Generuj podsumowanie miesięczne po polsku. Bądź zwięzły, używaj formatowania.',
            agent_id: 'report_generator',
          },
        });
        setAiSummary(aiData?.response || '');
      } catch {
        // AI summary optional
      }

      // Build summary text
      const monthName = MONTHS[selectedMonth];
      const summary = `Raport miesięczny: ${monthName} ${selectedYear}\n\n` +
        `Faktury wystawione: ${issuedData.length} szt. na ${formatCurrency(issuedTotal)}\n` +
        `  - Netto: ${formatCurrency(issuedNet)}\n` +
        `  - VAT należny: ${formatCurrency(issuedVat)}\n\n` +
        `Faktury zakupowe: ${purchaseData.length} szt. na ${formatCurrency(purchaseTotal)}\n` +
        `  - Netto: ${formatCurrency(purchaseNet)}\n` +
        `  - VAT naliczony: ${formatCurrency(purchaseVat)}\n\n` +
        `VAT do zapłaty: ${formatCurrency(issuedVat - purchaseVat)}\n`;

      if (format === 'csv') {
        // Generate CSV
        let csv = 'Data;Numer;Kontrahent;NIP;Netto;VAT;Brutto;Kategoria;Typ\n';

        issuedData.forEach((inv) => {
          const buyer = inv.buyer_snapshot as any;
          csv += [
            inv.issue_date,
            inv.invoice_number,
            buyer?.name || '',
            buyer?.nip || '',
            (inv.net_amount || 0).toFixed(2),
            (inv.vat_amount || 0).toFixed(2),
            (inv.gross_amount || 0).toFixed(2),
            '',
            'Wystawiona',
          ].join(';') + '\n';
        });

        purchaseData.forEach((inv: any) => {
          csv += [
            inv.purchase_date,
            inv.document_number,
            inv.supplier_name || '',
            inv.supplier_nip || '',
            (inv.total_net || 0).toFixed(2),
            (inv.total_vat || 0).toFixed(2),
            (inv.total_gross || 0).toFixed(2),
            inv.ai_category || '',
            'Zakupowa',
          ].join(';') + '\n';
        });

        // Download CSV
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `raport_${selectedYear}_${String(selectedMonth + 1).padStart(2, '0')}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('Eksport CSV zakończony');
      } else if (format === 'pdf') {
        // Generate printable HTML for PDF
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <html>
              <head><title>Raport ${monthName} ${selectedYear}</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
                h1 { color: #6C3CF0; border-bottom: 2px solid #6C3CF0; padding-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
                th { background: #f5f5f5; font-weight: bold; }
                .summary { background: #f8f6ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .total { font-weight: bold; font-size: 16px; }
              </style></head>
              <body>
                <h1>📊 Raport miesięczny: ${monthName} ${selectedYear}</h1>
                <div class="summary">
                  <pre>${summary}</pre>
                </div>
                ${includeIssued ? `
                  <h2>Faktury wystawione (${issuedData.length})</h2>
                  <table>
                    <tr><th>Data</th><th>Numer</th><th>Kontrahent</th><th>Netto</th><th>VAT</th><th>Brutto</th></tr>
                    ${issuedData.map(inv => {
                      const buyer = inv.buyer_snapshot as any;
                      return `<tr><td>${inv.issue_date}</td><td>${inv.invoice_number}</td><td>${buyer?.name || ''}</td><td>${(inv.net_amount || 0).toFixed(2)}</td><td>${(inv.vat_amount || 0).toFixed(2)}</td><td>${(inv.gross_amount || 0).toFixed(2)}</td></tr>`;
                    }).join('')}
                  </table>
                ` : ''}
                ${includePurchase ? `
                  <h2>Faktury zakupowe (${purchaseData.length})</h2>
                  <table>
                    <tr><th>Data</th><th>Numer</th><th>Dostawca</th><th>Netto</th><th>VAT</th><th>Brutto</th><th>Kategoria</th></tr>
                    ${purchaseData.map((inv: any) => `<tr><td>${inv.purchase_date}</td><td>${inv.document_number}</td><td>${inv.supplier_name || ''}</td><td>${(inv.total_net || 0).toFixed(2)}</td><td>${(inv.total_vat || 0).toFixed(2)}</td><td>${(inv.total_gross || 0).toFixed(2)}</td><td>${inv.ai_category || ''}</td></tr>`).join('')}
                  </table>
                ` : ''}
                <p style="margin-top:30px;color:#999;font-size:11px;">Wygenerowano przez RIDO • ${new Date().toLocaleString('pl-PL')}</p>
              </body>
            </html>
          `);
          printWindow.document.close();
          printWindow.print();
        }
        toast.success('Raport PDF wygenerowany');
      } else if (format === 'jpk') {
        toast.info('Eksport JPK_VAT — funkcja w przygotowaniu');
      }

      // Send email if provided
      if (emails.trim()) {
        const emailList = emails.split(',').map((e) => e.trim()).filter(Boolean);
        try {
          await supabase.functions.invoke('rido-mail', {
            body: {
              to: emailList,
              subject: `Raport miesięczny: ${monthName} ${selectedYear}`,
              body: summary + (aiSummary ? `\n\nPodsumowanie AI:\n${aiSummary}` : ''),
            },
          });
          toast.success(`Raport wysłany na ${emailList.join(', ')}`);
        } catch {
          toast.error('Błąd wysyłki email — sprawdź konfigurację');
        }
      }
    } catch (err: any) {
      toast.error(`Błąd: ${err.message}`);
    }
    setGenerating(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Eksport miesięczny + wysyłka
        </CardTitle>
        <CardDescription>
          Generuj raporty miesięczne z podsumowaniem AI i wyślij na email
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Month/Year selection */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              Miesiąc
            </Label>
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Rok</Label>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Format</Label>
            <Select value={format} onValueChange={(v: any) => setFormat(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">
                  <span className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5" /> PDF
                  </span>
                </SelectItem>
                <SelectItem value="csv">
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
                  </span>
                </SelectItem>
                <SelectItem value="jpk">
                  <span className="flex items-center gap-2">
                    <Code className="h-3.5 w-3.5" /> JPK_VAT (XML)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" />
              Email (opcjonalnie)
            </Label>
            <Input
              placeholder="email@firma.pl, ..."
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
            />
          </div>
        </div>

        {/* Checkboxes */}
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={includeIssued} onCheckedChange={(c) => setIncludeIssued(c === true)} />
            <span className="text-sm">Faktury wystawione</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={includePurchase} onCheckedChange={(c) => setIncludePurchase(c === true)} />
            <span className="text-sm">Faktury zakupowe</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={includeVat} onCheckedChange={(c) => setIncludeVat(c === true)} />
            <span className="text-sm">Zestawienie VAT</span>
          </label>
        </div>

        {/* Generate button */}
        <Button onClick={generateAndSend} disabled={generating} className="gap-2">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Generuj i wyślij
        </Button>

        {/* AI Summary */}
        {aiSummary && (
          <div className="p-4 bg-muted/50 rounded-lg border">
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              🤖 Podsumowanie AI
            </p>
            <p className="text-sm whitespace-pre-wrap">{aiSummary}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
