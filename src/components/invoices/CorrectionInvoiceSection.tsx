import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FloatingInput } from '@/components/ui/floating-input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, FileText, ArrowDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { calculateItemTotals, InvoiceItem } from '@/utils/invoiceHtmlGenerator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface OriginalInvoice {
  id: string;
  invoice_number: string;
  buyer_name: string;
  issue_date: string;
  gross_total: number;
  buyer_nip?: string;
  buyer_address?: string;
  sale_date?: string;
  ksef_reference?: string;
}

export interface CorrectionItem {
  name: string;
  quantity_before: number;
  quantity_after: number;
  unit: string;
  unit_net_price_before: number;
  unit_net_price_after: number;
  vat_rate_before: string;
  vat_rate_after: string;
  edit_quantity: boolean;
  edit_price: boolean;
  edit_vat: boolean;
  is_return: boolean;
}

export interface CorrectionData {
  originalInvoiceId: string;
  originalInvoiceNumber: string;
  originalIssueDate: string;
  originalSaleDate: string;
  originalKsefReference?: string;
  correctionReason: string;
  correctionReasonText?: string;
  items: CorrectionItem[];
}

const CORRECTION_REASONS = [
  { value: 'wrong_price', label: 'Błędna cena' },
  { value: 'wrong_quantity', label: 'Błędna ilość' },
  { value: 'wrong_buyer', label: 'Błędny nabywca' },
  { value: 'return', label: 'Zwrot towaru/usługi' },
  { value: 'wrong_vat', label: 'Błędna stawka VAT' },
  { value: 'other', label: 'Inny powód' },
];

interface CorrectionInvoiceSectionProps {
  onOriginalSelected: (invoice: OriginalInvoice, items: InvoiceItem[]) => void;
  onCorrectionDataChange: (data: CorrectionData | null) => void;
  onCorrectionItemsChange?: (items: InvoiceItem[]) => void;
}

const VAT_OPTIONS = ['23', '8', '5', '0', 'zw', 'np'];

function calcItemTotals(qty: number, netPrice: number, vatRate: string) {
  const rate = parseFloat(vatRate) || 0;
  const net = Math.round(qty * netPrice * 100) / 100;
  const vat = Math.round(net * (rate / 100) * 100) / 100;
  const gross = Math.round((net + vat) * 100) / 100;
  return { net, vat, gross };
}

function applyReasonPreset(item: CorrectionItem, reason: string): CorrectionItem {
  switch (reason) {
    case 'wrong_price':
      return { ...item, edit_price: true };
    case 'wrong_quantity':
      return { ...item, edit_quantity: true, is_return: false };
    case 'wrong_vat':
      return { ...item, edit_vat: true };
    case 'return':
      return { ...item, is_return: true, edit_quantity: true, quantity_after: 0 };
    default:
      return item;
  }
}

function toAfterInvoiceItems(items: CorrectionItem[]): InvoiceItem[] {
  return items.map((item) =>
    calculateItemTotals({
      name: item.name,
      quantity: item.quantity_after,
      unit: item.unit,
      unit_net_price: item.unit_net_price_after,
      vat_rate: item.vat_rate_after,
    })
  );
}

export function CorrectionInvoiceSection({ onOriginalSelected, onCorrectionDataChange, onCorrectionItemsChange }: CorrectionInvoiceSectionProps) {
  const [invoices, setInvoices] = useState<OriginalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [correctionItems, setCorrectionItems] = useState<CorrectionItem[]>([]);
  const [correctionReason, setCorrectionReason] = useState('wrong_price');
  const [correctionReasonText, setCorrectionReasonText] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<OriginalInvoice | null>(null);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data } = await supabase
      .from('user_invoices')
      .select('id, invoice_number, buyer_name, issue_date, sale_date, gross_total, buyer_nip, buyer_address, ksef_reference, ksef_status')
      .eq('user_id', session.user.id)
      .in('invoice_type', ['invoice', 'vat_margin', 'advance'])
      .order('created_at', { ascending: false })
      .limit(50);

    setInvoices((data || []) as OriginalInvoice[]);
    setLoading(false);
  };

  const emitChange = (items: CorrectionItem[], reason: string, reasonText: string, invoice: OriginalInvoice | null) => {
    if (!invoice) {
      onCorrectionItemsChange?.([]);
      onCorrectionDataChange(null);
      return;
    }

    onCorrectionItemsChange?.(toAfterInvoiceItems(items));

    onCorrectionDataChange({
      originalInvoiceId: invoice.id,
      originalInvoiceNumber: invoice.invoice_number,
      originalIssueDate: invoice.issue_date,
      originalSaleDate: invoice.sale_date || invoice.issue_date,
      originalKsefReference: invoice.ksef_reference,
      correctionReason: reason,
      correctionReasonText: reason === 'other' ? reasonText : undefined,
      items,
    });
  };

  const handleSelect = async (invoiceId: string) => {
    setSelectedId(invoiceId);
    const invoice = invoices.find(i => i.id === invoiceId) || null;
    setSelectedInvoice(invoice);
    if (!invoice) return;

    const { data: items } = await supabase
      .from('user_invoice_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('sort_order');

    const loadedItems = items || [];

    const cItems: CorrectionItem[] = loadedItems.map((item: any) => applyReasonPreset({
      name: item.name || '',
      quantity_before: item.quantity || 0,
      quantity_after: item.quantity || 0,
      unit: item.unit || 'szt.',
      unit_net_price_before: item.unit_net_price || 0,
      unit_net_price_after: item.unit_net_price || 0,
      vat_rate_before: item.vat_rate || '23',
      vat_rate_after: item.vat_rate || '23',
      edit_quantity: false,
      edit_price: false,
      edit_vat: false,
      is_return: false,
    }, correctionReason));
    setCorrectionItems(cItems);

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
    emitChange(cItems, correctionReason, correctionReasonText, invoice);
  };

  const updateCorrectionItem = (index: number, field: 'quantity_after' | 'unit_net_price_after' | 'vat_rate_after', value: number | string) => {
    setCorrectionItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      emitChange(updated, correctionReason, correctionReasonText, selectedInvoice);
      return updated;
    });
  };

  const toggleCorrectionMode = (index: number, field: 'edit_quantity' | 'edit_price' | 'edit_vat' | 'is_return', checked: boolean) => {
    setCorrectionItems(prev => {
      const updated = [...prev];
      const current = updated[index];
      const next = { ...current, [field]: checked };

      if (field === 'is_return') {
        next.edit_quantity = checked ? true : next.edit_quantity;
        next.quantity_after = checked ? 0 : (current.quantity_after === 0 ? current.quantity_before : current.quantity_after);
      }

      updated[index] = next;
      emitChange(updated, correctionReason, correctionReasonText, selectedInvoice);
      return updated;
    });
  };

  const handleReasonChange = (reason: string) => {
    setCorrectionReason(reason);
    setCorrectionItems(prev => {
      const updated = prev.map(item => applyReasonPreset(item, reason));
      emitChange(updated, reason, correctionReasonText, selectedInvoice);
      return updated;
    });
  };

  // Calculate totals
  const totalsBefore = correctionItems.reduce((acc, item) => {
    const t = calcItemTotals(item.quantity_before, item.unit_net_price_before, item.vat_rate_before);
    return { net: acc.net + t.net, vat: acc.vat + t.vat, gross: acc.gross + t.gross };
  }, { net: 0, vat: 0, gross: 0 });

  const totalsAfter = correctionItems.reduce((acc, item) => {
    const t = calcItemTotals(item.quantity_after, item.unit_net_price_after, item.vat_rate_after);
    return { net: acc.net + t.net, vat: acc.vat + t.vat, gross: acc.gross + t.gross };
  }, { net: 0, vat: 0, gross: 0 });

  const diffNet = Math.round((totalsAfter.net - totalsBefore.net) * 100) / 100;
  const diffVat = Math.round((totalsAfter.vat - totalsBefore.vat) * 100) / 100;
  const diffGross = Math.round((totalsAfter.gross - totalsBefore.gross) * 100) / 100;

  const fmt = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    <div className="space-y-4">
      {/* Select original invoice */}
      <Card className="border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Korekta do faktury
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                      {inv.buyer_name} • {fmt(Number(inv.gross_total || 0))} zł
                    </span>
                  </span>
                </SelectItem>
              ))}
              {invoices.length === 0 && (
                <SelectItem value="__none" disabled>Brak faktur do korekty</SelectItem>
              )}
            </SelectContent>
          </Select>

          {/* Correction reason */}
          {selectedId && (
            <div className="space-y-2">
              <label className="text-xs font-medium">Powód korekty</label>
              <Select value={correctionReason} onValueChange={handleReasonChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CORRECTION_REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {correctionReason === 'other' && (
                <FloatingInput
                  label="Opis powodu korekty"
                  value={correctionReasonText}
                  onChange={e => {
                    setCorrectionReasonText(e.target.value);
                    emitChange(correctionItems, correctionReason, e.target.value, selectedInvoice);
                  }}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* BYŁO / POWINNO BYĆ tables */}
      {correctionItems.length > 0 && (
        <>
          {/* SEKCJA B — BYŁO */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Badge variant="outline" className="bg-muted">BYŁO</Badge>
                <span className="text-muted-foreground text-xs">(dane z faktury pierwotnej — tylko do odczytu)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">Lp.</TableHead>
                      <TableHead>Nazwa</TableHead>
                      <TableHead className="text-right w-16">Ilość</TableHead>
                      <TableHead className="w-12">J.m.</TableHead>
                      <TableHead className="text-right w-24">Cena netto</TableHead>
                      <TableHead className="text-right w-24">Wart. netto</TableHead>
                      <TableHead className="text-right w-14">VAT%</TableHead>
                      <TableHead className="text-right w-20">VAT</TableHead>
                      <TableHead className="text-right w-24">Brutto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {correctionItems.map((item, idx) => {
                      const t = calcItemTotals(item.quantity_before, item.unit_net_price_before, item.vat_rate_before);
                      return (
                        <TableRow key={idx} className="bg-muted/30">
                          <TableCell className="text-xs">{idx + 1}</TableCell>
                          <TableCell className="text-xs font-medium">{item.name}</TableCell>
                          <TableCell className="text-xs text-right">{item.quantity_before}</TableCell>
                          <TableCell className="text-xs">{item.unit}</TableCell>
                          <TableCell className="text-xs text-right">{fmt(item.unit_net_price_before)}</TableCell>
                          <TableCell className="text-xs text-right">{fmt(t.net)}</TableCell>
                          <TableCell className="text-xs text-right">{item.vat_rate_before}%</TableCell>
                          <TableCell className="text-xs text-right">{fmt(t.vat)}</TableCell>
                          <TableCell className="text-xs text-right font-medium">{fmt(t.gross)}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/50 font-medium">
                      <TableCell colSpan={5} className="text-xs text-right">Razem BYŁO:</TableCell>
                      <TableCell className="text-xs text-right">{fmt(totalsBefore.net)}</TableCell>
                      <TableCell />
                      <TableCell className="text-xs text-right">{fmt(totalsBefore.vat)}</TableCell>
                      <TableCell className="text-xs text-right">{fmt(totalsBefore.gross)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Arrow */}
          <div className="flex justify-center">
            <ArrowDown className="h-6 w-6 text-primary" />
          </div>

          {/* SEKCJA C — POWINNO BYĆ */}
          <Card className="border-primary/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">POWINNO BYĆ</Badge>
                <span className="text-muted-foreground text-xs">(edytuj wartości, które chcesz skorygować)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">Lp.</TableHead>
                      <TableHead>Nazwa</TableHead>
                      <TableHead className="text-right w-20">Ilość</TableHead>
                      <TableHead className="w-12">J.m.</TableHead>
                      <TableHead className="text-right w-28">Cena netto</TableHead>
                      <TableHead className="text-right w-24">Wart. netto</TableHead>
                      <TableHead className="text-right w-14">VAT%</TableHead>
                      <TableHead className="text-right w-20">VAT</TableHead>
                      <TableHead className="text-right w-24">Brutto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {correctionItems.map((item, idx) => {
                      const t = calcItemTotals(item.quantity_after, item.unit_net_price_after, item.vat_rate_after);
                      return (
                        <TableRow key={idx}>
                          <TableCell className="text-xs">{idx + 1}</TableCell>
                          <TableCell className="text-xs">
                            <div className="space-y-2">
                              <div className="font-medium">{item.name}</div>
                              <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                                <label className="flex items-center gap-1">
                                  <Checkbox checked={item.edit_quantity} onCheckedChange={(checked) => toggleCorrectionMode(idx, 'edit_quantity', checked === true)} />
                                  Ilość
                                </label>
                                <label className="flex items-center gap-1">
                                  <Checkbox checked={item.edit_price} onCheckedChange={(checked) => toggleCorrectionMode(idx, 'edit_price', checked === true)} />
                                  Cena
                                </label>
                                <label className="flex items-center gap-1">
                                  <Checkbox checked={item.edit_vat} onCheckedChange={(checked) => toggleCorrectionMode(idx, 'edit_vat', checked === true)} />
                                  VAT
                                </label>
                                <label className="flex items-center gap-1">
                                  <Checkbox checked={item.is_return} onCheckedChange={(checked) => toggleCorrectionMode(idx, 'is_return', checked === true)} />
                                  Zwrot
                                </label>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="p-1">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              className="w-full h-8 text-xs text-right border border-border rounded px-2 bg-background disabled:opacity-50"
                              value={item.quantity_after}
                              disabled={!item.edit_quantity && !item.is_return}
                              onChange={e => updateCorrectionItem(idx, 'quantity_after', parseFloat(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell className="text-xs">{item.unit}</TableCell>
                          <TableCell className="p-1">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              className="w-full h-8 text-xs text-right border border-border rounded px-2 bg-background disabled:opacity-50"
                              value={item.unit_net_price_after}
                              disabled={!item.edit_price}
                              onChange={e => updateCorrectionItem(idx, 'unit_net_price_after', parseFloat(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell className="text-xs text-right">{fmt(t.net)}</TableCell>
                          <TableCell className="p-1">
                            <Select value={item.vat_rate_after} onValueChange={(value) => updateCorrectionItem(idx, 'vat_rate_after', value)} disabled={!item.edit_vat}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {VAT_OPTIONS.map((rate) => (
                                  <SelectItem key={rate} value={rate}>{rate}%</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-xs text-right">{fmt(t.vat)}</TableCell>
                          <TableCell className="text-xs text-right font-medium">{fmt(t.gross)}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="font-medium">
                      <TableCell colSpan={5} className="text-xs text-right">Razem PO KOREKCIE:</TableCell>
                      <TableCell className="text-xs text-right">{fmt(totalsAfter.net)}</TableCell>
                      <TableCell />
                      <TableCell className="text-xs text-right">{fmt(totalsAfter.vat)}</TableCell>
                      <TableCell className="text-xs text-right">{fmt(totalsAfter.gross)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* SEKCJA D — PODSUMOWANIE RÓŻNICY */}
          <Card className="border-2 border-dashed">
            <CardContent className="pt-4">
              <h4 className="text-sm font-semibold mb-3">Podsumowanie korekty</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Netto wg pierwotnej:</span>
                  <span>{fmt(totalsBefore.net)} zł</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Netto wg korekty:</span>
                  <span>{fmt(totalsAfter.net)} zł</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Różnica netto:</span>
                  <span className={diffNet < 0 ? 'text-destructive' : diffNet > 0 ? 'text-primary' : ''}>
                    {diffNet > 0 ? '+' : ''}{fmt(diffNet)} zł
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT wg pierwotnej:</span>
                  <span>{fmt(totalsBefore.vat)} zł</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT wg korekty:</span>
                  <span>{fmt(totalsAfter.vat)} zł</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Różnica VAT:</span>
                  <span className={diffVat < 0 ? 'text-destructive' : diffVat > 0 ? 'text-primary' : ''}>
                    {diffVat > 0 ? '+' : ''}{fmt(diffVat)} zł
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-bold">
                  <span>RAZEM KOREKTA BRUTTO:</span>
                  <span className={diffGross < 0 ? 'text-destructive' : diffGross > 0 ? 'text-primary' : 'text-primary'}>
                    {diffGross > 0 ? '+' : ''}{fmt(diffGross)} zł
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
