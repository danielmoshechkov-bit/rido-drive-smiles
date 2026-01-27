import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, ShoppingCart, TrendingUp, Calculator, AlertCircle } from 'lucide-react';

interface Invoice {
  id: string;
  invoice_type?: string;
  net_total?: number;
  vat_total?: number;
  gross_total?: number;
  is_paid?: boolean;
}

interface InvoiceItem {
  invoice_id: string;
  vat_rate?: string;
  net_amount?: number;
  vat_amount?: number;
  gross_amount?: number;
}

interface InvoiceSummaryTilesProps {
  salesInvoices: Invoice[];
  costInvoices: Invoice[];
  salesItems?: InvoiceItem[];
  costItems?: InvoiceItem[];
  taxForm?: 'ryczalt' | 'liniowy' | 'skala' | 'cit';
  ryczaltRate?: number; // dla ryczałtu, np. 8.5%, 15%
}

interface VatBreakdown {
  rate: string;
  netSum: number;
  vatSum: number;
  grossSum: number;
  count: number;
}

export function InvoiceSummaryTiles({ 
  salesInvoices, 
  costInvoices, 
  salesItems = [], 
  costItems = [],
  taxForm = 'liniowy',
  ryczaltRate = 8.5
}: InvoiceSummaryTilesProps) {
  
  // Calculate sales breakdown by VAT rate
  const salesBreakdown = useMemo(() => {
    const breakdown: Record<string, VatBreakdown> = {};
    
    for (const item of salesItems) {
      const rate = item.vat_rate || '23';
      if (!breakdown[rate]) {
        breakdown[rate] = { rate, netSum: 0, vatSum: 0, grossSum: 0, count: 0 };
      }
      breakdown[rate].netSum += item.net_amount || 0;
      breakdown[rate].vatSum += item.vat_amount || 0;
      breakdown[rate].grossSum += item.gross_amount || 0;
      breakdown[rate].count++;
    }
    
    return Object.values(breakdown).sort((a, b) => {
      const rateA = parseFloat(a.rate) || 0;
      const rateB = parseFloat(b.rate) || 0;
      return rateB - rateA;
    });
  }, [salesItems]);

  // Calculate cost breakdown by VAT rate
  const costBreakdown = useMemo(() => {
    const breakdown: Record<string, VatBreakdown> = {};
    
    for (const item of costItems) {
      const rate = item.vat_rate || '23';
      if (!breakdown[rate]) {
        breakdown[rate] = { rate, netSum: 0, vatSum: 0, grossSum: 0, count: 0 };
      }
      breakdown[rate].netSum += item.net_amount || 0;
      breakdown[rate].vatSum += item.vat_amount || 0;
      breakdown[rate].grossSum += item.gross_amount || 0;
      breakdown[rate].count++;
    }
    
    return Object.values(breakdown).sort((a, b) => {
      const rateA = parseFloat(a.rate) || 0;
      const rateB = parseFloat(b.rate) || 0;
      return rateB - rateA;
    });
  }, [costItems]);

  // Calculate totals
  const salesTotals = useMemo(() => ({
    count: salesInvoices.length,
    net: salesInvoices.reduce((sum, i) => sum + Number(i.net_total || 0), 0),
    vat: salesInvoices.reduce((sum, i) => sum + Number(i.vat_total || 0), 0),
    gross: salesInvoices.reduce((sum, i) => sum + Number(i.gross_total || 0), 0),
  }), [salesInvoices]);

  const costTotals = useMemo(() => ({
    count: costInvoices.length,
    net: costInvoices.reduce((sum, i) => sum + Number(i.net_total || 0), 0),
    vat: costInvoices.reduce((sum, i) => sum + Number(i.vat_total || 0), 0),
    gross: costInvoices.reduce((sum, i) => sum + Number(i.gross_total || 0), 0),
  }), [costInvoices]);

  // Calculate taxes
  const vatToPay = salesTotals.vat - costTotals.vat;
  const profit = salesTotals.net - costTotals.net;
  
  // Income tax calculation based on form
  const incomeTax = useMemo(() => {
    switch (taxForm) {
      case 'ryczalt':
        return salesTotals.net * (ryczaltRate / 100);
      case 'liniowy':
        return Math.max(0, profit) * 0.19;
      case 'skala':
        // Simplified scale - in reality depends on threshold
        if (profit <= 0) return 0;
        if (profit <= 120000) return profit * 0.12;
        return 120000 * 0.12 + (profit - 120000) * 0.32;
      case 'cit':
        return Math.max(0, profit) * 0.09; // Small CIT rate
      default:
        return Math.max(0, profit) * 0.19;
    }
  }, [taxForm, profit, salesTotals.net, ryczaltRate]);

  const formatAmount = (amount: number) => 
    amount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatRate = (rate: string) => {
    if (rate === 'zw') return 'ZW';
    if (rate === 'np') return 'NP';
    return `${rate}%`;
  };

  return (
    <div className="space-y-6">
      {/* Sales Summary */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-primary" />
            Przychody (faktury sprzedażowe)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-sm text-muted-foreground">Liczba faktur</p>
              <p className="text-2xl font-bold">{salesTotals.count}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Netto</p>
              <p className="text-2xl font-bold">{formatAmount(salesTotals.net)} zł</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">VAT należny</p>
              <p className="text-2xl font-bold text-primary">{formatAmount(salesTotals.vat)} zł</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Brutto</p>
              <p className="text-2xl font-bold">{formatAmount(salesTotals.gross)} zł</p>
            </div>
          </div>
          
          {/* VAT breakdown */}
          {salesBreakdown.length > 0 && (
            <div className="pt-3 border-t">
              <p className="text-xs text-muted-foreground mb-2">Podział wg stawek VAT:</p>
              <div className="flex flex-wrap gap-2">
                {salesBreakdown.map(item => (
                  <Badge key={item.rate} variant="secondary" className="text-xs">
                    {formatRate(item.rate)}: {formatAmount(item.vatSum)} zł ({item.count} poz.)
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cost Summary */}
      <Card className="border-destructive/20 bg-gradient-to-br from-destructive/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShoppingCart className="h-5 w-5 text-destructive" />
            Wydatki (faktury kosztowe)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-sm text-muted-foreground">Liczba faktur</p>
              <p className="text-2xl font-bold">{costTotals.count}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Netto</p>
              <p className="text-2xl font-bold">{formatAmount(costTotals.net)} zł</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">VAT naliczony</p>
              <p className="text-2xl font-bold text-destructive">{formatAmount(costTotals.vat)} zł</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Brutto</p>
              <p className="text-2xl font-bold">{formatAmount(costTotals.gross)} zł</p>
            </div>
          </div>
          
          {/* VAT breakdown */}
          {costBreakdown.length > 0 && (
            <div className="pt-3 border-t">
              <p className="text-xs text-muted-foreground mb-2">Podział wg stawek VAT:</p>
              <div className="flex flex-wrap gap-2">
                {costBreakdown.map(item => (
                  <Badge key={item.rate} variant="outline" className="text-xs">
                    {formatRate(item.rate)}: {formatAmount(item.vatSum)} zł ({item.count} poz.)
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Final Summary */}
      <Card className="border-2 border-primary/30 bg-gradient-to-br from-accent/50 to-background">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator className="h-5 w-5" />
            Podsumowanie rozliczenia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Summary rows */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <p className="text-sm text-muted-foreground">Przychody netto</p>
                <p className="text-xl font-bold text-primary">+ {formatAmount(salesTotals.net)} zł</p>
              </div>
              <div className="p-3 bg-destructive/10 rounded-lg">
                <p className="text-sm text-muted-foreground">Koszty netto</p>
                <p className="text-xl font-bold text-destructive">- {formatAmount(costTotals.net)} zł</p>
              </div>
            </div>

            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">Dochód do opodatkowania:</span>
                <span className={`text-xl font-bold ${profit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {formatAmount(profit)} zł
                </span>
              </div>
            </div>

            {/* Taxes */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border-2 border-primary/30 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">VAT do zapłaty</span>
                </div>
                <p className={`text-2xl font-bold ${vatToPay >= 0 ? 'text-primary' : 'text-green-600'}`}>
                  {vatToPay >= 0 ? formatAmount(vatToPay) : `- ${formatAmount(Math.abs(vatToPay))}`} zł
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {vatToPay >= 0 ? 'Do wpłaty na US' : 'Nadwyżka do przeniesienia'}
                </p>
              </div>

              <div className="p-4 border-2 border-primary/30 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">
                    Podatek dochodowy
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      {taxForm === 'ryczalt' ? `Ryczałt ${ryczaltRate}%` : 
                       taxForm === 'liniowy' ? 'Liniowy 19%' : 
                       taxForm === 'skala' ? 'Skala 12/32%' : 
                       'CIT 9%'}
                    </Badge>
                  </span>
                </div>
                <p className="text-2xl font-bold text-primary">
                  {formatAmount(incomeTax)} zł
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Szacunkowa zaliczka
                </p>
              </div>
            </div>

            {/* Total to pay */}
            <div className="p-4 bg-gradient-to-r from-primary/20 to-primary/10 rounded-lg border border-primary/30">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold">Razem do zapłaty:</span>
                <span className="text-3xl font-bold text-primary">
                  {formatAmount(Math.max(0, vatToPay) + incomeTax)} zł
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                VAT + podatek dochodowy (szacunkowo)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
