import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Upload, FileText, AlertTriangle, CheckCircle2, Loader2, TrendingDown,
  Package, Eye, Trash2, Download, X, Link2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { InventoryProductMapper } from './InventoryProductMapper';

interface PurchaseInvoice {
  id: string;
  document_number: string;
  supplier_name: string | null;
  supplier_nip: string | null;
  issue_date: string | null;
  purchase_date: string | null;
  due_date: string | null;
  total_net: number | null;
  total_vat: number | null;
  total_gross: number | null;
  vat_breakdown: Record<string, { net: number; vat: number; gross: number }> | null;
  status: string | null;
  is_paid: boolean | null;
  needs_review: boolean | null;
  inventory_processed: boolean | null;
  confidence: number | null;
  ai_category: string | null;
  pdf_url: string | null;
  file_name: string | null;
  payment_method: string | null;
}

interface PurchaseInvoiceItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price_net: number | null;
  vat_rate: number | null;
  total_net: number | null;
  total_gross: number | null;
  supplier_symbol: string | null;
  product_id?: string | null;
  product_name?: string | null;
}

const fmt = (n: number | null | undefined) =>
  ((n ?? 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + '\u00A0zł';

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  const months = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
  return `${months[parseInt(m) - 1]} ${y}`;
};

interface Props {
  entityId: string | null;
  userId: string | null;
}

export function PurchaseInvoicesModule({ entityId, userId }: Props) {
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; fileName: string }>({ current: 0, total: 0, fileName: '' });
  const [dragOver, setDragOver] = useState(false);
  const [activeMonth, setActiveMonth] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'months' | 'review'>('months');
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);
  const [selectedItems, setSelectedItems] = useState<PurchaseInvoiceItem[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [mapperItem, setMapperItem] = useState<PurchaseInvoiceItem | null>(null);

  // Load
  const loadInvoices = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('purchase_invoices')
      .select('*')
      .eq('user_id', userId)
      .order('issue_date', { ascending: false, nullsFirst: false });
    if (error) {
      toast.error('Błąd ładowania: ' + error.message);
    } else {
      setInvoices((data as any) || []);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  // Group by month
  const months = useMemo(() => {
    const map = new Map<string, PurchaseInvoice[]>();
    invoices.forEach(inv => {
      const date = inv.issue_date || inv.purchase_date;
      if (!date) return;
      const ym = date.substring(0, 7);
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym)!.push(inv);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [invoices]);

  const reviewQueue = useMemo(() => invoices.filter(i => i.needs_review), [invoices]);

  // Aktywny miesiąc - default najnowszy
  useEffect(() => {
    if (activeMonth === 'all' && months.length > 0) {
      setActiveMonth(months[0][0]);
    }
  }, [months, activeMonth]);

  const currentMonthInvoices = useMemo(() => {
    if (activeMonth === 'all') return invoices.filter(i => !i.needs_review);
    return (months.find(([ym]) => ym === activeMonth)?.[1] || []).filter(i => !i.needs_review);
  }, [months, activeMonth, invoices]);

  // Podsumowanie miesiąca
  const summary = useMemo(() => {
    const list = currentMonthInvoices;
    const totals = { net: 0, vat: 0, gross: 0, paid: 0, unpaid: 0, count: list.length };
    const byVat: Record<string, { net: number; vat: number; gross: number }> = {};
    list.forEach(inv => {
      totals.net += Number(inv.total_net || 0);
      totals.vat += Number(inv.total_vat || 0);
      totals.gross += Number(inv.total_gross || 0);
      if (inv.is_paid) totals.paid += Number(inv.total_gross || 0);
      else totals.unpaid += Number(inv.total_gross || 0);
      const breakdown = inv.vat_breakdown || {};
      Object.entries(breakdown).forEach(([rate, vals]: any) => {
        if (!byVat[rate]) byVat[rate] = { net: 0, vat: 0, gross: 0 };
        byVat[rate].net += Number(vals?.net || 0);
        byVat[rate].vat += Number(vals?.vat || 0);
        byVat[rate].gross += Number(vals?.gross || 0);
      });
    });
    return { totals, byVat };
  }, [currentMonthInvoices]);

  // Upload single file
  const processFile = async (file: File): Promise<void> => {
    if (!userId) return;
    setUploadProgress(p => ({ ...p, fileName: file.name }));

    // Read base64
    const base64 = await new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        res(result.split(',')[1]);
      };
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });

    // Parse via AI
    const { data: parseRes, error: parseErr } = await supabase.functions.invoke('parse-purchase-invoice', {
      body: { fileBase64: base64, mimeType: file.type, fileName: file.name },
    });

    if (parseErr || !parseRes?.success) {
      throw new Error(parseRes?.error || parseErr?.message || 'Parse failed');
    }
    const parsed = parseRes.data;

    // Upload PDF do storage
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('purchase-invoices')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) console.warn('Upload PDF failed:', upErr.message);

    const confidence = Number(parsed.confidence ?? 0.5);
    const needsReview = confidence < 0.8;

    // Insert invoice
    const { data: inv, error: invErr } = await supabase
      .from('purchase_invoices')
      .insert({
        user_id: userId,
        entity_id: entityId,
        document_number: parsed.document_number || file.name,
        supplier_name: parsed.supplier?.name || null,
        supplier_nip: parsed.supplier?.nip || null,
        supplier_address: parsed.supplier?.address || null,
        supplier_account: parsed.supplier?.account || null,
        issue_date: parsed.issue_date || null,
        sale_date: parsed.sale_date || null,
        purchase_date: parsed.issue_date || null,
        due_date: parsed.due_date || null,
        total_net: parsed.total_net,
        total_vat: parsed.total_vat,
        total_gross: parsed.total_gross,
        vat_breakdown: parsed.vat_breakdown || {},
        currency: parsed.currency || 'PLN',
        payment_method: parsed.payment_method || null,
        is_paid: !!parsed.is_paid,
        ai_category: parsed.ai_category || null,
        ai_notes: parsed.notes || null,
        confidence,
        needs_review: needsReview,
        inventory_processed: false,
        pdf_url: upErr ? null : path,
        file_name: file.name,
        source: 'ai_parse',
        status: needsReview ? 'review' : 'parsed',
        ocr_raw: parsed,
      })
      .select('id')
      .single();

    if (invErr) throw invErr;

    // Insert items + auto-mapowanie po aliasach (na podstawie poprzednich faktur od tego dostawcy)
    if (parsed.items?.length && inv?.id) {
      // Pobierz aliasy dla tego dostawcy (po NIP) – do auto-mapowania
      const supplierNip = parsed.supplier?.nip || null;
      let aliases: Array<{ product_id: string; normalized_label: string | null; source_label: string | null }> = [];
      if (supplierNip) {
        const { data: aliasData } = await (supabase as any)
          .from('inventory_product_aliases')
          .select('product_id, normalized_label, source_label')
          .eq('user_id', userId)
          .eq('supplier_nip', supplierNip);
        aliases = (aliasData as any[]) || [];
      }

      const norm = (s: string) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
      const itemsPayload = parsed.items.map((it: any) => {
        const itemNorm = norm(it.name || '');
        const matched = aliases.find(a => a.normalized_label === itemNorm);
        return {
          purchase_invoice_id: inv.id,
          name: it.name || 'Pozycja',
          supplier_symbol: it.sku || null,
          quantity: Number(it.quantity || 1),
          unit: it.unit || 'szt.',
          unit_price_net: Number(it.unit_price_net || 0),
          vat_rate: parseInt(String(it.vat_rate || '23').replace(/\D/g, '') || '23') || 23,
          total_net: Number(it.total_net || 0),
          total_gross: Number(it.total_gross || 0),
          product_id: matched?.product_id || null,
        };
      });
      const { error: itemsErr } = await supabase.from('purchase_invoice_items').insert(itemsPayload);
      if (itemsErr) console.warn('Items insert error:', itemsErr.message);
    }
  };

  const handleFiles = async (files: File[]) => {
    if (!files.length || !userId) return;
    setUploading(true);
    setUploadProgress({ current: 0, total: files.length, fileName: '' });

    let okCount = 0;
    let errCount = 0;
    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ current: i + 1, total: files.length, fileName: files[i].name });
      try {
        await processFile(files[i]);
        okCount++;
      } catch (e: any) {
        console.error('File failed:', files[i].name, e);
        errCount++;
        toast.error(`${files[i].name}: ${e.message}`);
      }
    }

    setUploading(false);
    if (okCount) toast.success(`Wczytano ${okCount} faktur(y)${errCount ? `, ${errCount} z błędem` : ''}`);
    await loadInvoices();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type === 'application/pdf' || f.type.startsWith('image/')
    );
    if (files.length === 0) {
      toast.error('Wgraj PDF lub zdjęcia faktur');
      return;
    }
    handleFiles(files);
  };

  // Resolve PDF URL: obsługuje (a) pełny URL z http(s), (b) ścieżkę w bucket purchase-invoices,
  // (c) starą ścieżkę z prefixem 'purchase-invoices/' w bucket 'documents'
  const resolvePdfUrl = async (pdfUrl: string | null | undefined): Promise<string | null> => {
    if (!pdfUrl) return null;
    if (/^https?:\/\//i.test(pdfUrl)) return pdfUrl; // pełny URL (publiczny lub stary)
    // spróbuj najpierw nowy bucket
    const { data: a } = await supabase.storage.from('purchase-invoices').createSignedUrl(pdfUrl, 600);
    if (a?.signedUrl) return a.signedUrl;
    // fallback do starego bucketa documents
    const { data: b } = await supabase.storage.from('documents').createSignedUrl(pdfUrl, 600);
    return b?.signedUrl || null;
  };

  const openInvoice = async (inv: PurchaseInvoice) => {
    setSelectedInvoice(inv);
    setSelectedItems([]);
    setPdfPreviewUrl(null);

    // Pozycje z nazwą produktu (jeśli przypisane)
    const { data } = await supabase
      .from('purchase_invoice_items')
      .select('*, inventory_products(id, name_sales)')
      .eq('purchase_invoice_id', inv.id);

    const enriched = ((data as any[]) || []).map(it => ({
      ...it,
      product_name: it.inventory_products?.name_sales || null,
    }));
    setSelectedItems(enriched);

    // Podgląd PDF
    const url = await resolvePdfUrl(inv.pdf_url);
    setPdfPreviewUrl(url);
  };

  const refreshSelectedItems = async () => {
    if (!selectedInvoice) return;
    const { data } = await supabase
      .from('purchase_invoice_items')
      .select('*, inventory_products(id, name_sales)')
      .eq('purchase_invoice_id', selectedInvoice.id);
    const enriched = ((data as any[]) || []).map(it => ({
      ...it,
      product_name: it.inventory_products?.name_sales || null,
    }));
    setSelectedItems(enriched);
  };

  const handleManualMap = async (productId: string) => {
    if (!mapperItem) return;
    const { error } = await (supabase as any)
      .from('purchase_invoice_items')
      .update({ product_id: productId })
      .eq('id', mapperItem.id);
    if (error) toast.error(error.message);
    else { setMapperItem(null); await refreshSelectedItems(); }
  };

  const acceptToInventory = async (inv: PurchaseInvoice) => {
    setProcessingId(inv.id);
    try {
      const { data, error } = await supabase.functions.invoke('process-purchase-inventory', {
        body: { invoiceId: inv.id },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || 'Błąd');
      toast.success(`Zatwierdzono. Magazyn: +${data.createdBatches} batch(y), +${data.createdProducts} nowe produkty`);
      await loadInvoices();
      if (selectedInvoice?.id === inv.id) setSelectedInvoice(null);
    } catch (e: any) {
      toast.error('Błąd: ' + e.message);
    } finally {
      setProcessingId(null);
    }
  };

  const acceptOnly = async (inv: PurchaseInvoice) => {
    const { error } = await supabase
      .from('purchase_invoices')
      .update({ needs_review: false, status: 'accepted' })
      .eq('id', inv.id);
    if (error) toast.error(error.message);
    else { toast.success('Zaakceptowano'); await loadInvoices(); }
  };

  const deleteInvoice = async (inv: PurchaseInvoice) => {
    if (!confirm(`Usunąć fakturę ${inv.document_number}?`)) return;
    if (inv.pdf_url && !/^https?:\/\//i.test(inv.pdf_url)) {
      await supabase.storage.from('purchase-invoices').remove([inv.pdf_url]).catch(() => {});
    }
    const { error } = await supabase.from('purchase_invoices').delete().eq('id', inv.id);
    if (error) toast.error(error.message);
    else { toast.success('Usunięto'); setSelectedInvoice(null); await loadInvoices(); }
  };

  const downloadPdf = async (inv: PurchaseInvoice) => {
    const url = await resolvePdfUrl(inv.pdf_url);
    if (!url) return toast.error('Brak pliku PDF');
    window.open(url, '_blank');
  };

  if (!userId) return <div className="text-center py-8 text-muted-foreground">Zaloguj się aby korzystać z faktur zakupowych</div>;

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <Card
        className={cn(
          'border-2 border-dashed transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-border',
          uploading && 'pointer-events-none opacity-70'
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <CardContent className="py-6">
          {uploading ? (
            <div className="text-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="font-medium">Przetwarzam {uploadProgress.current}/{uploadProgress.total}</p>
              <p className="text-sm text-muted-foreground truncate">{uploadProgress.fileName}</p>
            </div>
          ) : (
            <label className="cursor-pointer block text-center space-y-2">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="font-medium">Przeciągnij faktury (PDF / zdjęcia) lub kliknij aby wybrać</p>
              <p className="text-xs text-muted-foreground">AI rozpozna dane, podzieli na miesiące i przypisze do magazynu. Możesz wgrać do 30 plików naraz.</p>
              <input
                type="file"
                multiple
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => e.target.files && handleFiles(Array.from(e.target.files))}
              />
            </label>
          )}
        </CardContent>
      </Card>

      {/* Tabs: Miesiące vs Do akceptacji */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="months" className="gap-2">
            <FileText className="h-4 w-4" />
            Wszystkie ({invoices.filter(i => !i.needs_review).length})
          </TabsTrigger>
          <TabsTrigger value="review" className="gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Do akceptacji ({reviewQueue.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="months" className="space-y-4">
          {/* Pill-tabs miesięcy */}
          {months.length > 0 && (
            <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
              <div className="flex gap-2 w-max">
                {months.map(([ym, list]) => (
                  <button
                    key={ym}
                    onClick={() => setActiveMonth(ym)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm whitespace-nowrap border transition-colors',
                      activeMonth === ym ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted'
                    )}
                  >
                    {monthLabel(ym)} <span className="opacity-70">({list.filter(i => !i.needs_review).length})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Podsumowanie miesiąca */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Faktur</p><p className="text-xl font-bold">{summary.totals.count}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Netto</p><p className="text-xl font-bold">{fmt(summary.totals.net)}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">VAT do odliczenia</p><p className="text-xl font-bold text-blue-600">{fmt(summary.totals.vat)}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Brutto</p><p className="text-xl font-bold text-destructive">{fmt(summary.totals.gross)}</p></CardContent></Card>
          </div>

          {/* Rozbicie wg stawek VAT */}
          {Object.keys(summary.byVat).length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Rejestr VAT zakupów</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground">
                      <tr><th className="text-left py-1">Stawka</th><th className="text-right">Netto</th><th className="text-right">VAT</th><th className="text-right">Brutto</th></tr>
                    </thead>
                    <tbody>
                      {Object.entries(summary.byVat).sort().map(([rate, v]) => (
                        <tr key={rate} className="border-t"><td className="py-1.5 font-medium">{rate === 'zw' || rate === 'np' ? rate : `${rate}%`}</td><td className="text-right">{fmt(v.net)}</td><td className="text-right">{fmt(v.vat)}</td><td className="text-right">{fmt(v.gross)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lista faktur */}
          <InvoiceList
            invoices={currentMonthInvoices}
            loading={loading}
            onOpen={openInvoice}
            onAccept={acceptToInventory}
            processingId={processingId}
          />
        </TabsContent>

        <TabsContent value="review" className="space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>AI nie był pewny rozpoznania tych faktur (jakość zdjęcia, brakujące dane, niezgodne sumy). <strong>Zweryfikuj ręcznie</strong> przed zapisem do księgowości.</div>
          </div>
          <InvoiceList
            invoices={reviewQueue}
            loading={loading}
            onOpen={openInvoice}
            onAccept={acceptToInventory}
            processingId={processingId}
            highlightReview
          />
        </TabsContent>
      </Tabs>

      {/* Detail dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={(o) => !o && setSelectedInvoice(null)}>
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
          {selectedInvoice && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {selectedInvoice.document_number}
                  {selectedInvoice.needs_review && <Badge variant="outline" className="border-amber-500 text-amber-700"><AlertTriangle className="h-3 w-3 mr-1" />Do weryfikacji</Badge>}
                  {selectedInvoice.inventory_processed && <Badge variant="outline" className="border-green-500 text-green-700"><Package className="h-3 w-3 mr-1" />W magazynie</Badge>}
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 overflow-y-auto">
                {/* LEWO: Podgląd PDF */}
                <div className="bg-muted rounded-lg overflow-hidden min-h-[400px] lg:min-h-[600px] flex items-center justify-center">
                  {pdfPreviewUrl ? (
                    <iframe
                      src={pdfPreviewUrl}
                      title="Podgląd faktury"
                      className="w-full h-full min-h-[600px] border-0"
                    />
                  ) : (
                    <div className="text-center text-muted-foreground p-8">
                      <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{selectedInvoice.pdf_url ? 'Ładowanie podglądu...' : 'Brak załączonego PDF'}</p>
                    </div>
                  )}
                </div>

                {/* PRAWO: Dane + pozycje */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><Label>Sprzedawca</Label><p className="font-medium">{selectedInvoice.supplier_name}</p><p className="text-xs text-muted-foreground">NIP: {selectedInvoice.supplier_nip}</p></div>
                    <div><Label>Daty</Label><p>Wyst.: {selectedInvoice.issue_date || selectedInvoice.purchase_date}</p><p className="text-xs">Termin: {selectedInvoice.due_date || '—'}</p></div>
                    <div><Label>Kategoria AI</Label><Badge variant="secondary">{selectedInvoice.ai_category || '-'}</Badge></div>
                    <div><Label>Płatność</Label><p>{selectedInvoice.payment_method || '—'} {selectedInvoice.is_paid ? '✓ zapłacone' : '✗ niezapłacone'}</p></div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-muted">
                    <div><p className="text-xs text-muted-foreground">Netto</p><p className="font-bold">{fmt(selectedInvoice.total_net)}</p></div>
                    <div><p className="text-xs text-muted-foreground">VAT</p><p className="font-bold text-blue-600">{fmt(selectedInvoice.total_vat)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Brutto</p><p className="font-bold text-destructive">{fmt(selectedInvoice.total_gross)}</p></div>
                  </div>

                  <div>
                    <Label>Pozycje ({selectedItems.length})</Label>
                    {selectedItems.length === 0 ? (
                      <div className="text-center py-6 text-sm text-muted-foreground bg-muted/40 rounded mt-2">Brak pozycji – AI nie odczytał ich poprawnie. Edytuj fakturę lub usuń i wgraj ponownie.</div>
                    ) : (
                      <div className="space-y-1.5 mt-2">
                        {selectedItems.map(it => (
                          <div key={it.id} className="border rounded-lg p-2.5 text-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-medium truncate">{it.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {it.quantity} {it.unit} × {fmt(it.unit_price_net)} • VAT {it.vat_rate}%
                                  {it.supplier_symbol && <> • SKU: <span className="font-mono">{it.supplier_symbol}</span></>}
                                </p>
                              </div>
                              <p className="font-semibold whitespace-nowrap">{fmt(it.total_gross)}</p>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              {it.product_id ? (
                                <Badge variant="outline" className="border-green-500 text-green-700 text-xs">
                                  <Package className="h-3 w-3 mr-1" />
                                  Magazyn: {it.product_name || 'przypisano'}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-amber-400 text-amber-700 text-xs">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Brak przypisania
                                </Badge>
                              )}
                              <Button
                                size="sm"
                                variant={it.product_id ? 'outline' : 'default'}
                                onClick={() => setMapperItem(it)}
                                className="h-7 text-xs gap-1"
                              >
                                <Link2 className="h-3 w-3" />
                                {it.product_id ? 'Zmień' : 'Przypisz / +Dodaj'}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedInvoice.needs_review && (selectedInvoice as any).ai_notes && (
                    <div className="p-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900">
                      <strong>Uwagi AI:</strong> {(selectedInvoice as any).ai_notes}
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="gap-2 flex-wrap border-t pt-3 mt-2">
                {selectedInvoice.pdf_url && <Button variant="outline" onClick={() => downloadPdf(selectedInvoice)}><Download className="h-4 w-4 mr-1" />Pobierz PDF</Button>}
                <Button variant="outline" onClick={() => deleteInvoice(selectedInvoice)} className="text-destructive"><Trash2 className="h-4 w-4 mr-1" />Usuń</Button>
                {!selectedInvoice.inventory_processed ? (
                  <>
                    <Button variant="outline" onClick={() => acceptOnly(selectedInvoice)}>Akceptuj (bez magazynu)</Button>
                    <Button onClick={() => acceptToInventory(selectedInvoice)} disabled={processingId === selectedInvoice.id}>
                      {processingId === selectedInvoice.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Package className="h-4 w-4 mr-1" />}
                      Akceptuj → magazyn
                    </Button>
                  </>
                ) : (
                  <Badge variant="outline" className="border-green-500 text-green-700">Już w magazynie</Badge>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Mapper produktu */}
      {mapperItem && selectedInvoice && (
        <InventoryProductMapper
          open={!!mapperItem}
          onOpenChange={(o) => !o && setMapperItem(null)}
          entityId={entityId}
          userId={userId}
          itemName={mapperItem.name}
          itemNetPrice={Number(mapperItem.unit_price_net || 0)}
          itemQuantity={Number(mapperItem.quantity || 1)}
          itemVatRate={String(mapperItem.vat_rate || '23')}
          supplierNip={selectedInvoice.supplier_nip}
          supplierName={selectedInvoice.supplier_name}
          supplierSymbol={mapperItem.supplier_symbol}
          onProductMapped={handleManualMap}
        />
      )}
    </div>
  );
}

function InvoiceList({
  invoices, loading, onOpen, onAccept, processingId, highlightReview
}: {
  invoices: PurchaseInvoice[];
  loading: boolean;
  onOpen: (i: PurchaseInvoice) => void;
  onAccept: (i: PurchaseInvoice) => void;
  processingId: string | null;
  highlightReview?: boolean;
}) {
  if (loading) return <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  if (!invoices.length) return (
    <div className="text-center py-12 text-muted-foreground">
      <TrendingDown className="h-12 w-12 mx-auto mb-2 opacity-50" />
      <p>Brak faktur</p>
    </div>
  );
  return (
    <div className="space-y-2">
      {invoices.map(inv => (
        <Card
          key={inv.id}
          className={cn(
            'cursor-pointer hover:bg-muted/50 transition-colors',
            highlightReview && 'border-amber-300'
          )}
          onClick={() => onOpen(inv)}
        >
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-destructive/10 flex-shrink-0">
                  <FileText className="h-5 w-5 text-destructive" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{inv.document_number}</p>
                    {inv.needs_review && <Badge variant="outline" className="border-amber-500 text-amber-700 text-xs">⚠ weryfikacja</Badge>}
                    {inv.inventory_processed && <Badge variant="outline" className="border-green-500 text-green-700 text-xs"><Package className="h-3 w-3 mr-1" />magazyn</Badge>}
                    {inv.ai_category && <Badge variant="secondary" className="text-xs">{inv.ai_category}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {inv.supplier_name || 'Brak dostawcy'} {inv.supplier_nip && `• NIP ${inv.supplier_nip}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {inv.issue_date} {inv.due_date && `• termin ${inv.due_date}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  <p className="font-bold text-destructive">{fmt(inv.total_gross)}</p>
                  <p className="text-xs text-muted-foreground">netto {fmt(inv.total_net)} • VAT {fmt(inv.total_vat)}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onOpen(inv); }}><Eye className="h-3.5 w-3.5" /></Button>
                  {!inv.inventory_processed && (
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); onAccept(inv); }} disabled={processingId === inv.id}>
                      {processingId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
