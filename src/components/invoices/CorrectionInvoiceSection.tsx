import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FloatingInput } from '@/components/ui/floating-input';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { calculateItemTotals, InvoiceItem } from '@/utils/invoiceHtmlGenerator';

interface OriginalInvoice {
  id: string;
  invoice_number: string;
  buyer_name: string;
  issue_date: string;
  gross_total: number;
  buyer_nip?: string;
  buyer_address?: string;
}

interface CorrectionItem {
  name: string;
  quantity_before: number;
  quantity_after: number;
  unit: string;
  unit_net_price_before: number;
  unit_net_price_after: number;
  vat_rate: string;
}

export interface CorrectionData {
  originalInvoiceId: string;
  originalInvoiceNumber: string;
  items: CorrectionItem[];
}

interface CorrectionInvoiceSectionProps {
  onOriginalSelected: (invoice: OriginalInvoice, items: InvoiceItem[]) => void;
  onCorrectionDataChange: (data: CorrectionData | null) => void;
}

export function CorrectionInvoiceSection({ onOriginalSelected, onCorrectionDataChange }: CorrectionInvoiceSectionProps) {
  const [invoices, setInvoices] = useState<OriginalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [originalItems, setOriginalItems] = useState<any[]>([]);
  const [correctionItems, setCorrectionItems] = useState<CorrectionItem[]>([]);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data } = await supabase
      .from('user_invoices')
      .select('id, invoice_number, buyer_name, issue_date, gross_total, buyer_nip, buyer_address')
      .eq('user_id', session.user.id)
      .in('invoice_type', ['invoice', 'vat_margin', 'advance'])
      .order('created_at', { ascending: false })
      .limit(50);

    setInvoices(data || []);
    setLoading(false);
  };

  const handleSelect = async (invoiceId: string) => {
    setSelectedId(invoiceId);
    const invoice = invoices.find(i => i.id === invoiceId);
    if (!invoice) return;

    // Load original invoice items
    const { data: items } = await supabase
      .from('user_invoice_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('sort_order');

    const loadedItems = items || [];
    setOriginalItems(loadedItems);

    // Create correction items with before = original, after = same (user will edit)
    const cItems: CorrectionItem[] = loadedItems.map((item: any) => ({
      name: item.name || '',
      quantity_before: item.quantity || 0,
      quantity_after: item.quantity || 0,
      unit: item.unit || 'szt.',
      unit_net_price_before: item.unit_net_price || 0,
      unit_net_price_after: item.unit_net_price || 0,
      vat_rate: item.vat_rate || '23',
    }));
    setCorrectionItems(cItems);

    // Convert to InvoiceItems for parent
    const invoiceItems: InvoiceItem[] = loadedItems.map((item: any) => 
      calculateItemTotals({
        name: item.name || '',
        quantity: item.quantity || 1,
        unit: item.unit || 'szt.',
        unit_net_price: item.unit_net_price || 0,
        vat_rate: item.vat_rate || '23',
      })
    );

    onOriginalSelected(invoice, invoiceItems);
    onCorrectionDataChange({
      originalInvoiceId: invoiceId,
      originalInvoiceNumber: invoice.invoice_number,
      items: cItems,
    });
  };

  const updateCorrectionItem = (index: number, field: 'quantity_after' | 'unit_net_price_after', value: number) => {
    setCorrectionItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      onCorrectionDataChange({
        originalInvoiceId: selectedId,
        originalInvoiceNumber: invoices.find(i => i.id === selectedId)?.invoice_number || '',
        items: updated,
      });

      return updated;
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Ładowanie faktur...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Korekta do faktury
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Original invoice selector */}
        <div>
          <Select value={selectedId} onValueChange={handleSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Wybierz fakturę do korekty..." />
            </SelectTrigger>
            <SelectContent>
              {invoices.map(inv => (
                <SelectItem key={inv.id} value={inv.id}>
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{inv.invoice_number}</span>
                    <span className="text-muted-foreground text-xs">
                      {inv.buyer_name} • {Number(inv.gross_total || 0).toLocaleString('pl-PL')} zł
                    </span>
                  </span>
                </SelectItem>
              ))}
              {invoices.length === 0 && (
                <SelectItem value="__none" disabled>
                  Brak faktur do korekty
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Before/After items */}
        {correctionItems.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-background">Przed</Badge>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Po korekcie</Badge>
            </div>

            {correctionItems.map((item, idx) => {
              const vatRate = parseFloat(item.vat_rate) || 0;
              const grossBefore = Math.round(item.quantity_before * item.unit_net_price_before * (1 + vatRate / 100) * 100) / 100;
              const grossAfter = Math.round(item.quantity_after * item.unit_net_price_after * (1 + vatRate / 100) * 100) / 100;
              const diff = grossAfter - grossBefore;

              return (
                <div key={idx} className="p-3 border rounded-lg bg-background space-y-2">
                  <p className="text-sm font-medium">{item.name}</p>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* Before column */}
                    <div className="space-y-1 opacity-60">
                      <p className="text-xs text-muted-foreground">Przed</p>
                      <div className="grid grid-cols-2 gap-2">
                        <FloatingInput
                          label="Ilość"
                          type="number"
                          value={item.quantity_before}
                          disabled
                          className="bg-muted text-xs h-10"
                        />
                        <FloatingInput
                          label="Cena netto"
                          type="number"
                          value={item.unit_net_price_before}
                          disabled
                          className="bg-muted text-xs h-10"
                        />
                      </div>
                      <p className="text-xs text-right text-muted-foreground">
                        Brutto: {grossBefore.toLocaleString('pl-PL')} zł
                      </p>
                    </div>

                    {/* After column */}
                    <div className="space-y-1">
                      <p className="text-xs text-primary font-medium">Po korekcie</p>
                      <div className="grid grid-cols-2 gap-2">
                        <FloatingInput
                          label="Ilość"
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.quantity_after}
                          onChange={(e) => updateCorrectionItem(idx, 'quantity_after', parseFloat(e.target.value) || 0)}
                          className="text-xs h-10 border-primary/30"
                        />
                        <FloatingInput
                          label="Cena netto"
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.unit_net_price_after}
                          onChange={(e) => updateCorrectionItem(idx, 'unit_net_price_after', parseFloat(e.target.value) || 0)}
                          className="text-xs h-10 border-primary/30"
                        />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Brutto: {grossAfter.toLocaleString('pl-PL')} zł</span>
                        {diff !== 0 && (
                          <span className={diff < 0 ? 'text-red-600' : 'text-green-600'}>
                            {diff > 0 ? '+' : ''}{diff.toLocaleString('pl-PL')} zł
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
