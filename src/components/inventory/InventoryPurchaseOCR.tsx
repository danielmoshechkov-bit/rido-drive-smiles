// InventoryPurchaseOCR v3 - Uses products, purchase_invoices, purchase_invoice_items tables
import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useGetRidoAI } from '@/hooks/useGetRidoAI';
import { toast } from 'sonner';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  Plus,
  Scan,
  Eye,
  AlertCircle,
  Trash2,
  History,
  Package,
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────────────── */

interface Product {
  id: string;
  name: string;
  sku?: string;
  unit?: string;
  purchase_price?: number;
  sale_price?: number;
  vat_rate?: number;
  stock_quantity?: number;
  low_stock_alert?: number;
  gtu_code?: string;
}

interface OCRItem {
  name: string;
  quantity: number;
  unit: string;
  unit_price_net: number;
  vat_rate: number;
  total_net: number;
  total_gross: number;
  supplier_symbol?: string;
  gtu_code?: string;
  mapped_product_id?: string;
}

interface InvoiceHeader {
  supplier_name?: string;
  supplier_nip?: string;
  document_number?: string;
  purchase_date?: string;
  payment_method?: string;
  net_total?: number;
  vat_total?: number;
  gross_total?: number;
}

interface PurchaseInvoice {
  id: string;
  document_number: string;
  supplier_name?: string;
  supplier_nip?: string;
  purchase_date?: string;
  total_net?: number;
  total_vat?: number;
  total_gross?: number;
  status?: string;
  pdf_url?: string;
  created_at: string;
}

interface Props {
  entityId?: string;
}

/* ─── Component ──────────────────────────────────────────────────────── */

export function InventoryPurchaseOCR({ entityId }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { execute: executeAI, isLoading: aiLoading } = useGetRidoAI();

  // Products from DB
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Supplier mappings
  const [supplierMappings, setSupplierMappings] = useState<Array<{supplier_name: string; supplier_symbol?: string; product_id?: string}>>([]);

  // Past invoices
  const [pastInvoices, setPastInvoices] = useState<PurchaseInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);

  // Current flow
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);

  // OCR results
  const [invoiceHeader, setInvoiceHeader] = useState<InvoiceHeader | null>(null);
  const [ocrItems, setOcrItems] = useState<OCRItem[]>([]);
  const [ocrDone, setOcrDone] = useState(false);

  // New product dialog
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductSalePrice, setNewProductSalePrice] = useState('');
  const [newProductUnit, setNewProductUnit] = useState('szt.');
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<'upload' | 'history'>('upload');

  /* ── Fetch products ────────────────────────────────────────────────── */

  const fetchProducts = async () => {
    setLoadingProducts(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name');
    if (!error && data) setProducts(data);
    setLoadingProducts(false);
  };

  const fetchSupplierMappings = async () => {
    const { data } = await (supabase as any)
      .from('supplier_mappings')
      .select('supplier_name, supplier_symbol, product_id');
    if (data) setSupplierMappings(data);
  };

  /* ── Fetch past invoices ───────────────────────────────────────────── */

  const fetchInvoices = async () => {
    setLoadingInvoices(true);
    const { data, error } = await supabase
      .from('purchase_invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && data) setPastInvoices(data);
    setLoadingInvoices(false);
  };

  useEffect(() => {
    fetchProducts();
    fetchInvoices();
  }, []);

  /* ── File upload ─────────────────────────────────────────────────── */

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1] || result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setOcrDone(false);
    setOcrItems([]);
    setInvoiceHeader(null);

    try {
      const b64 = await fileToBase64(file);
      setFileBase64(b64);

      // Upload to storage
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Musisz być zalogowany'); setUploading(false); return; }

      const fileExt = file.name.split('.').pop();
      const fileName = `purchase-invoices/${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error('Błąd przesyłania pliku');
        setUploading(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);

      setUploadedFileUrl(publicUrl);
      toast.success('Plik przesłany. Kliknij "Rozpoznaj" aby AI odczytało fakturę.');
    } catch (err) {
      console.error('File processing error:', err);
      toast.error('Błąd przetwarzania pliku');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /* ── OCR via AI ──────────────────────────────────────────────────── */

  const handleOCR = async () => {
    if (!fileBase64) return;

    setProcessing(true);

    try {
      const result = await executeAI({
        feature: 'ocr',
        taskType: 'ocr',
        query: `Odczytaj tę fakturę zakupową i zwróć JSON z polami:
{
  "supplier_name": "...",
  "supplier_nip": "...",
  "document_number": "...",
  "purchase_date": "YYYY-MM-DD",
  "payment_method": "przelew/gotówka/karta",
  "items": [
    {
      "name": "nazwa towaru",
      "quantity": 1,
      "unit": "szt.",
      "unit_price_net": 10.00,
      "vat_rate": 23,
      "total_net": 10.00,
      "total_gross": 12.30,
      "supplier_symbol": "kod dostawcy jeśli jest",
      "gtu_code": "GTU_XX jeśli jest"
    }
  ],
  "net_total": 0,
  "vat_total": 0,
  "gross_total": 0
}
Odpowiedz TYLKO samym JSON bez żadnego tekstu, bez markdown.`,
        imageBase64: fileBase64,
      });

      if (!result?.result) {
        toast.error('AI nie zwróciło wyniku. Sprawdź konfigurację OCR w Centrum AI.');
        setProcessing(false);
        return;
      }

      let parsed: any;
      try {
        let jsonStr = result.result;
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];
        jsonStr = jsonStr.trim();
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        console.error('JSON parse error:', parseErr, result.result);
        toast.error('AI zwróciło nieprawidłowy format. Spróbuj ponownie.');
        setProcessing(false);
        return;
      }

      setInvoiceHeader({
        supplier_name: parsed.supplier_name,
        supplier_nip: parsed.supplier_nip,
        document_number: parsed.document_number,
        purchase_date: parsed.purchase_date,
        payment_method: parsed.payment_method,
        net_total: parsed.net_total,
        vat_total: parsed.vat_total,
        gross_total: parsed.gross_total,
      });

      const items: OCRItem[] = (parsed.items || []).map((item: any) => ({
        name: item.name || '',
        quantity: Number(item.quantity) || 1,
        unit: item.unit || 'szt.',
        unit_price_net: Number(item.unit_price_net) || 0,
        vat_rate: Number(String(item.vat_rate || '23').replace('%', '')),
        total_net: Number(item.total_net) || 0,
        total_gross: Number(item.total_gross) || 0,
        supplier_symbol: item.supplier_symbol || '',
        gtu_code: item.gtu_code || '',
        mapped_product_id: autoMatchProduct(item.name),
      }));

      setOcrItems(items);
      setOcrDone(true);
      toast.success(`Rozpoznano ${items.length} pozycji na fakturze.`);
    } catch (err) {
      console.error('OCR error:', err);
      toast.error('Błąd OCR. Sprawdź konfigurację AI.');
    } finally {
      setProcessing(false);
    }
  };

  /* ── Auto-match product by name ──────────────────────────────────── */

  const autoMatchProduct = (name?: string): string | undefined => {
    if (!name || !products.length) return undefined;
    const lower = name.toLowerCase().trim();
    // First try supplier_mappings (loaded with products)
    const mapping = supplierMappings.find(m =>
      m.supplier_name.toLowerCase() === lower ||
      (m.supplier_symbol && m.supplier_symbol.toLowerCase() === lower)
    );
    if (mapping?.product_id) return mapping.product_id;
    // Fallback: fuzzy match by product name
    return products.find(p =>
      p.name.toLowerCase().includes(lower) ||
      lower.includes(p.name.toLowerCase())
    )?.id;
  };

  /* ── Product mapping ─────────────────────────────────────────────── */

  const handleMapProduct = (index: number, productId: string) => {
    setOcrItems(prev => prev.map((item, i) =>
      i === index ? { ...item, mapped_product_id: productId } : item
    ));
  };

  const openNewProductDialog = (index: number) => {
    const item = ocrItems[index];
    setEditingItemIndex(index);
    setNewProductName(item.name);
    setNewProductSalePrice(String(Math.round(item.unit_price_net * 1.3 * 100) / 100));
    setNewProductUnit(item.unit);
    setNewProductOpen(true);
  };

  const handleCreateProduct = async () => {
    if (!newProductName.trim() || editingItemIndex === null) return;

    const item = ocrItems[editingItemIndex];

    const { data, error } = await supabase
      .from('products')
      .insert({
        name: newProductName,
        unit: newProductUnit,
        purchase_price: item.unit_price_net,
        sale_price: Number(newProductSalePrice) || item.unit_price_net * 1.3,
        vat_rate: item.vat_rate,
        stock_quantity: 0,
        gtu_code: item.gtu_code || null,
      })
      .select()
      .single();

    if (error) {
      toast.error('Błąd tworzenia produktu');
      return;
    }

    if (data) {
      handleMapProduct(editingItemIndex, data.id);
      setProducts(prev => [...prev, data]);
      setNewProductOpen(false);
      setNewProductName('');
      setNewProductSalePrice('');
      setEditingItemIndex(null);
      toast.success(`Produkt "${newProductName}" utworzony`);
    }
  };

  /* ── Approve invoice ─────────────────────────────────────────────── */

  const handleApprove = async () => {
    if (!invoiceHeader || ocrItems.length === 0) return;

    setProcessing(true);

    try {
      // 1. Create purchase_invoice
      const insertPayload: any = {
        document_number: invoiceHeader.document_number || `FZ-${Date.now()}`,
        supplier_name: invoiceHeader.supplier_name,
        supplier_nip: invoiceHeader.supplier_nip,
        purchase_date: invoiceHeader.purchase_date,
        payment_method: invoiceHeader.payment_method,
        total_net: invoiceHeader.net_total,
        total_vat: invoiceHeader.vat_total,
        total_gross: invoiceHeader.gross_total,
        pdf_url: uploadedFileUrl,
        status: 'approved',
        ocr_raw: { items: ocrItems, header: invoiceHeader },
      };

      const { data: invoice, error: invError } = await supabase
        .from('purchase_invoices')
        .insert(insertPayload)
        .select()
        .single();

      if (invError || !invoice) {
        console.error('Invoice create error:', invError);
        toast.error('Błąd tworzenia faktury');
        setProcessing(false);
        return;
      }

      // 2. Create purchase_invoice_items and update stock
      for (const item of ocrItems) {
        await supabase
          .from('purchase_invoice_items')
          .insert({
            purchase_invoice_id: invoice.id,
            product_id: item.mapped_product_id || null,
            name: item.name,
            supplier_symbol: item.supplier_symbol || null,
            quantity: item.quantity,
            unit: item.unit,
            unit_price_net: item.unit_price_net,
            total_net: item.total_net,
            vat_rate: item.vat_rate,
            total_gross: item.total_gross,
            gtu_code: item.gtu_code || null,
          });

        // 3. Update stock_quantity + create stock_movement + supplier_mapping
        if (item.mapped_product_id) {
          const product = products.find(p => p.id === item.mapped_product_id);
          if (product) {
            const newQty = (product.stock_quantity || 0) + item.quantity;
            await supabase
              .from('products')
              .update({
                stock_quantity: newQty,
                purchase_price: item.unit_price_net,
              })
              .eq('id', item.mapped_product_id);

            // stock_movements record
            await supabase
              .from('stock_movements')
              .insert({
                product_id: item.mapped_product_id,
                movement_type: 'purchase',
                quantity: item.quantity,
                unit_price: item.unit_price_net,
                invoice_id: invoice.id,
                invoice_number: invoiceHeader.document_number || null,
                supplier: invoiceHeader.supplier_name || null,
                notes: `OCR import: ${item.name}`,
              } as any);
          }

          // supplier_mappings — zapamiętaj powiązanie nazwy dostawcy z produktem
          if (item.supplier_symbol || item.name) {
            await supabase
              .from('supplier_mappings' as any)
              .insert({
                supplier_name: item.name,
                supplier_symbol: item.supplier_symbol || null,
                product_id: item.mapped_product_id,
              });
          }
        }
      }

      toast.success('✅ Faktura zatwierdzona! Stany magazynowe zaktualizowane.');

      // Reset
      setOcrItems([]);
      setInvoiceHeader(null);
      setFileBase64(null);
      setUploadedFileUrl(null);
      setOcrDone(false);

      // Refresh data
      await fetchProducts();
      await fetchInvoices();
    } catch (error) {
      console.error('Error approving:', error);
      toast.error('Błąd zatwierdzania faktury');
    } finally {
      setProcessing(false);
    }
  };

  /* ── Remove item ─────────────────────────────────────────────────── */

  const removeItem = (index: number) => {
    setOcrItems(prev => prev.filter((_, i) => i !== index));
  };

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* View toggle */}
      <div className="flex gap-2">
        <Button
          variant={viewMode === 'upload' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('upload')}
          className="rounded-full"
        >
          <Upload className="h-4 w-4 mr-2" />
          Nowa faktura
        </Button>
        <Button
          variant={viewMode === 'history' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('history')}
          className="rounded-full"
        >
          <History className="h-4 w-4 mr-2" />
          Historia ({pastInvoices.length})
        </Button>
      </div>

      {viewMode === 'upload' && (
        <>
          {/* Upload Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Dodaj fakturę zakupową
              </CardTitle>
              <CardDescription>
                Prześlij zdjęcie lub PDF faktury — AI odczyta pozycje automatycznie
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-4 p-8 border-2 border-dashed rounded-lg">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  size="lg"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Przesyłanie...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" />Wybierz plik lub zrób zdjęcie</>
                  )}
                </Button>
                <p className="text-sm text-muted-foreground">
                  JPG, PNG, HEIC, PDF — max 20 MB
                </p>
              </div>

              {/* OCR Button */}
              {fileBase64 && !ocrDone && (
                <Button
                  onClick={handleOCR}
                  disabled={processing || aiLoading}
                  className="w-full mt-4"
                  size="lg"
                >
                  {(processing || aiLoading) ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rozpoznawanie przez AI...</>
                  ) : (
                    <><Scan className="h-4 w-4 mr-2" />Rozpoznaj fakturę (AI OCR)</>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Invoice Preview */}
          {invoiceHeader && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Podgląd faktury
                    </CardTitle>
                    {uploadedFileUrl && (
                      <a
                        href={uploadedFileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
                      >
                        <Eye className="h-3 w-3" />
                        Otwórz plik źródłowy
                      </a>
                    )}
                  </div>
                  <Badge variant="outline">
                    {ocrItems.filter(i => i.mapped_product_id).length}/{ocrItems.length} powiązanych
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Header info */}
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{invoiceHeader.supplier_name || 'Brak nazwy'}</p>
                      {invoiceHeader.supplier_nip && (
                        <p className="text-xs text-muted-foreground">NIP: {invoiceHeader.supplier_nip}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono">{invoiceHeader.document_number}</p>
                      {invoiceHeader.purchase_date && (
                        <p className="text-xs text-muted-foreground">Data: {invoiceHeader.purchase_date}</p>
                      )}
                      {invoiceHeader.payment_method && (
                        <p className="text-xs text-muted-foreground">Płatność: {invoiceHeader.payment_method}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs pt-2 border-t">
                    <span>Netto: <strong>{invoiceHeader.net_total?.toFixed(2)} zł</strong></span>
                    <span>VAT: <strong>{invoiceHeader.vat_total?.toFixed(2)} zł</strong></span>
                    <span>Brutto: <strong>{invoiceHeader.gross_total?.toFixed(2)} zł</strong></span>
                  </div>
                </div>

                {/* Items table */}
                {ocrItems.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Pozycje ({ocrItems.length})
                    </h3>

                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nazwa z faktury</TableHead>
                            <TableHead className="w-20 text-right">Ilość</TableHead>
                            <TableHead className="w-24 text-right">Cena netto</TableHead>
                            <TableHead className="w-20 text-right">VAT</TableHead>
                            <TableHead className="w-24 text-right">Brutto</TableHead>
                            <TableHead className="w-48">Produkt</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ocrItems.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                <p className="font-medium text-sm">{item.name}</p>
                                {item.supplier_symbol && (
                                  <p className="text-xs text-muted-foreground">Kod: {item.supplier_symbol}</p>
                                )}
                                {item.gtu_code && (
                                  <Badge variant="outline" className="text-[10px] mt-1">{item.gtu_code}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {item.quantity} {item.unit}
                              </TableCell>
                              <TableCell className="text-right text-sm font-mono">
                                {item.unit_price_net.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {item.vat_rate}%
                              </TableCell>
                              <TableCell className="text-right text-sm font-mono font-semibold">
                                {item.total_gross.toFixed(2)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Select
                                    value={item.mapped_product_id || '_none'}
                                    onValueChange={(v) => handleMapProduct(index, v === '_none' ? '' : v)}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Wybierz..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="_none">— brak —</SelectItem>
                                      {products.map(p => (
                                        <SelectItem key={p.id} value={p.id}>
                                          {p.name} {p.sku ? `(${p.sku})` : ''}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    onClick={() => openNewProductDialog(index)}
                                    title="Utwórz nowy produkt"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                                {item.mapped_product_id && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <CheckCircle className="h-3 w-3 text-green-600" />
                                    <span className="text-[10px] text-green-600">Powiązany</span>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => removeItem(index)}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Approve */}
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                      <div>
                        <p className="text-sm font-medium">
                          {ocrItems.filter(i => i.mapped_product_id).length} z {ocrItems.length} pozycji powiązanych z produktami
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Niepowiązane pozycje zostaną zapisane bez aktualizacji stanu magazynowego
                        </p>
                      </div>
                      <Button
                        onClick={handleApprove}
                        disabled={processing}
                        size="lg"
                      >
                        {processing ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Zatwierdzanie...</>
                        ) : (
                          <><CheckCircle className="h-4 w-4 mr-2" />Zatwierdź fakturę</>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* History view */}
      {viewMode === 'history' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historia faktur zakupowych
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingInvoices ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : pastInvoices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Brak faktur zakupowych</p>
                <p className="text-sm mt-1">Dodaj pierwszą fakturę w zakładce "Nowa faktura"</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nr dokumentu</TableHead>
                      <TableHead>Dostawca</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Netto</TableHead>
                      <TableHead className="text-right">Brutto</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pastInvoices.map(inv => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-sm">{inv.document_number}</TableCell>
                        <TableCell>
                          <p className="text-sm">{inv.supplier_name || '—'}</p>
                          {inv.supplier_nip && (
                            <p className="text-xs text-muted-foreground">NIP: {inv.supplier_nip}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {inv.purchase_date || new Date(inv.created_at).toLocaleDateString('pl-PL')}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {inv.total_net?.toFixed(2) || '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          {inv.total_gross?.toFixed(2) || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={inv.status === 'approved' ? 'default' : 'secondary'}>
                            {inv.status === 'approved' ? 'Zatwierdzona' : inv.status || 'Nowa'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {inv.pdf_url && (
                            <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* New Product Dialog */}
      <Dialog open={newProductOpen} onOpenChange={setNewProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowy produkt</DialogTitle>
            <DialogDescription>
              Dodaj nowy towar do bazy produktów
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nazwa produktu</Label>
              <Input
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="Jak ten produkt nazywasz?"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cena sprzedaży netto (PLN)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newProductSalePrice}
                  onChange={(e) => setNewProductSalePrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Jednostka</Label>
                <Select value={newProductUnit} onValueChange={setNewProductUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="szt.">szt.</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="l">l</SelectItem>
                    <SelectItem value="m">m</SelectItem>
                    <SelectItem value="m²">m²</SelectItem>
                    <SelectItem value="opak.">opak.</SelectItem>
                    <SelectItem value="usł.">usł.</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editingItemIndex !== null && ocrItems[editingItemIndex] && (
              <p className="text-xs text-muted-foreground">
                Cena zakupu: {ocrItems[editingItemIndex].unit_price_net.toFixed(2)} zł netto.
                Sugerowana marża +30%: {(ocrItems[editingItemIndex].unit_price_net * 1.3).toFixed(2)} zł
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewProductOpen(false)}>Anuluj</Button>
            <Button onClick={handleCreateProduct}>Utwórz produkt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
