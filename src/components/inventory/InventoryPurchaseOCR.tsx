// InventoryPurchaseOCR v4 - Full module with Zakupy OCR, Towary CRUD, CSV export
import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
// OCR uses analyze-invoice edge function directly
import { toast } from 'sonner';
import {
  Upload, FileText, Loader2, CheckCircle, Plus, Scan, Eye, Trash2,
  History, Package, Download, Edit, Save, X, Search, AlertCircle,
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
  // Company NIP for buyer validation
  const [companyNip, setCompanyNip] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [buyerNip, setBuyerNip] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab
  const [activeTab, setActiveTab] = useState<'zakupy' | 'towary' | 'eksport'>('zakupy');

  // Products from DB
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Supplier mappings
  const [supplierMappings, setSupplierMappings] = useState<Array<{ supplier_name: string; supplier_symbol?: string; product_id?: string }>>([]);

  // Past invoices
  const [pastInvoices, setPastInvoices] = useState<PurchaseInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);

  // Upload / OCR
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileMimeType, setFileMimeType] = useState<string>('');
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [invoiceHeader, setInvoiceHeader] = useState<InvoiceHeader | null>(null);
  const [ocrItems, setOcrItems] = useState<OCRItem[]>([]);
  const [ocrDone, setOcrDone] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Invoice mode: 'magazyn' = add to inventory, 'kosztowa' = cost invoice only
  const [invoiceMode, setInvoiceMode] = useState<'magazyn' | 'kosztowa'>('magazyn');
  const [autoMatchedCount, setAutoMatchedCount] = useState(0);

  // New product dialog
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductSku, setNewProductSku] = useState('');
  const [newProductSalePrice, setNewProductSalePrice] = useState('');
  const [newProductUnit, setNewProductUnit] = useState('szt.');
  const [newProductVat, setNewProductVat] = useState('23');
  const [newProductGtu, setNewProductGtu] = useState('');
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

  // View mode inside zakupy
  const [viewMode, setViewMode] = useState<'upload' | 'history'>('upload');

  // Towary tab
  const [productSearch, setProductSearch] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editProductOpen, setEditProductOpen] = useState(false);

  // CSV export
  const [exportMonth, setExportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [exporting, setExporting] = useState(false);

  /* ── Data fetching ─────────────────────────────────────────────────── */

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    const { data, error } = await supabase.from('products').select('*').order('name');
    if (!error && data) setProducts(data);
    setLoadingProducts(false);
  }, []);

  const fetchSupplierMappings = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('supplier_mappings')
      .select('supplier_name, supplier_symbol, product_id');
    if (data) setSupplierMappings(data);
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    const { data, error } = await supabase
      .from('purchase_invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && data) setPastInvoices(data);
    setLoadingInvoices(false);
  }, []);

  const fetchCompanyNip = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('company_settings')
      .select('nip, company_name')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) {
      setCompanyNip(data.nip?.replace(/[^0-9]/g, '') || null);
      setCompanyName(data.company_name || null);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchInvoices();
    fetchSupplierMappings();
    fetchCompanyNip();
  }, [fetchProducts, fetchInvoices, fetchSupplierMappings, fetchCompanyNip]);

  /* ── File upload (click + drag-and-drop) ───────────────────────────── */

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

  const processFile = async (file: File) => {
    setUploading(true);
    setOcrDone(false);
    setOcrItems([]);
    setInvoiceHeader(null);

    try {
      const b64 = await fileToBase64(file);
      setFileBase64(b64);
      setFileMimeType(file.type || 'application/octet-stream');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Musisz być zalogowany'); setUploading(false); return; }

      const fileExt = file.name.split('.').pop();
      const fileName = `purchase-invoices/${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('documents').upload(fileName, file);
      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error('Błąd przesyłania pliku');
        setUploading(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(fileName);
      setUploadedFileUrl(publicUrl);
      setUploading(false);
      
      // Auto-trigger OCR immediately after upload
      await runOCR(b64, file.type || 'application/octet-stream');
    } catch (err) {
      console.error('File processing error:', err);
      toast.error('Błąd przetwarzania pliku');
      setUploading(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  /* ── OCR via analyze-invoice Edge Function (Claude) ──────────────── */

  const runOCR = async (base64Data: string, mimeType: string) => {
    setProcessing(true);

    try {
      const { data: extractedData, error: extractError } = await supabase.functions.invoke('analyze-invoice', {
        body: { 
          fileBase64: base64Data,
          mimeType: mimeType
        }
      });

      if (extractError) {
        console.error('analyze-invoice error:', extractError);
        toast.error('Nie udało się odczytać faktury. Spróbuj ponownie.');
        setProcessing(false);
        return;
      }

      if (!extractedData?.success || !extractedData?.data) {
        toast.error('AI nie zwróciło wyniku. Spróbuj ponownie.');
        setProcessing(false);
        return;
      }

      const d = extractedData.data;

      // Map analyze-invoice response to our format
      setInvoiceHeader({
        supplier_name: d.sprzedawca?.nazwa || '',
        supplier_nip: d.sprzedawca?.nip || '',
        document_number: d.numer_faktury || '',
        purchase_date: d.data_wystawienia || new Date().toISOString().split('T')[0],
        payment_method: 'przelew',
        net_total: d.suma_netto || 0,
        vat_total: d.suma_vat || 0,
        gross_total: d.suma_brutto || 0,
      });

      // Extract buyer NIP for mismatch detection
      const extractedBuyerNip = (d.nabywca?.nip || '').replace(/[^0-9]/g, '');
      setBuyerNip(extractedBuyerNip || null);

      const ocrItemsList: OCRItem[] = (d.pozycje || []).map((item: any) => {
        const qty = Number(item.ilosc) || 1;
        const netPrice = Number(item.cena_netto) || 0;
        const vatRate = Number(String(item.vat_proc || '23').replace('%', ''));
        const totalNet = Number(item.wartosc_netto) || qty * netPrice;
        const totalGross = Number(item.wartosc_brutto) || totalNet * (1 + vatRate / 100);
        return {
          name: item.nazwa || '',
          quantity: qty,
          unit: item.jednostka || 'szt.',
          unit_price_net: netPrice,
          vat_rate: vatRate,
          total_net: totalNet,
          total_gross: totalGross,
          supplier_symbol: '',
          gtu_code: '',
          mapped_product_id: autoMatchProduct(item.nazwa || '', ''),
        };
      });

      const matched = ocrItemsList.filter(i => i.mapped_product_id).length;
      setAutoMatchedCount(matched);
      setOcrItems(ocrItemsList);
      setOcrDone(true);
      if (matched > 0) {
        toast.success(`Rozpoznano ${ocrItemsList.length} pozycji. 🧠 ${matched} auto-dopasowanych z pamięci!`);
      } else {
        toast.success(`Rozpoznano ${ocrItemsList.length} pozycji na fakturze.`);
      }
    } catch (err) {
      console.error('OCR error:', err);
      toast.error('Błąd OCR. Spróbuj ponownie.');
    } finally {
      setProcessing(false);
    }
  };

  const handleOCR = async () => {
    if (!fileBase64 || !fileMimeType) return;
    await runOCR(fileBase64, fileMimeType);
  };

  /* ── Auto-match (by supplier_symbol/index first, then name) ──────── */

  const autoMatchProduct = (name?: string, supplierSymbol?: string): string | undefined => {
    if (!products.length) return undefined;

    // 1. First try by supplier_symbol/index (most reliable — part numbers are stable)
    if (supplierSymbol) {
      const symbolLower = supplierSymbol.toLowerCase().trim();
      const mappingBySymbol = supplierMappings.find(m =>
        m.supplier_symbol && m.supplier_symbol.toLowerCase().trim() === symbolLower
      );
      if (mappingBySymbol?.product_id) return mappingBySymbol.product_id;

      // Also check SKU in products table
      const productBySku = products.find(p =>
        p.sku && p.sku.toLowerCase().trim() === symbolLower
      );
      if (productBySku) return productBySku.id;
    }

    if (!name) return undefined;
    const lower = name.toLowerCase().trim();

    // 2. Then try supplier_mappings by name
    const mappingByName = supplierMappings.find(m =>
      m.supplier_name.toLowerCase().trim() === lower
    );
    if (mappingByName?.product_id) return mappingByName.product_id;

    // 3. Fuzzy match by product name
    // Exact match first
    const exact = products.find(p => p.name.toLowerCase().trim() === lower);
    if (exact) return exact.id;

    // Substring match
    return products.find(p =>
      p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase())
    )?.id;
  };

  /* ── Product mapping ─────────────────────────────────────────────── */

  const handleMapProduct = (index: number, productId: string) => {
    setOcrItems(prev => prev.map((item, i) =>
      i === index ? { ...item, mapped_product_id: productId } : item
    ));
  };

  const openNewProductDialog = (index: number | null) => {
    const item = index !== null ? ocrItems[index] : null;
    setEditingItemIndex(index);
    setNewProductName(item?.name || '');
    setNewProductSku('');
    setNewProductSalePrice(item ? String(Math.round(item.unit_price_net * 1.3 * 100) / 100) : '');
    setNewProductUnit(item?.unit || 'szt.');
    setNewProductVat(item ? String(item.vat_rate) : '23');
    setNewProductGtu(item?.gtu_code || '');
    setNewProductOpen(true);
  };

  const handleCreateProduct = async () => {
    if (!newProductName.trim()) return;
    const item = editingItemIndex !== null ? ocrItems[editingItemIndex] : null;

    const { data, error } = await supabase
      .from('products')
      .insert({
        name: newProductName,
        sku: newProductSku || null,
        unit: newProductUnit,
        purchase_price: item?.unit_price_net || 0,
        sale_price: Number(newProductSalePrice) || 0,
        vat_rate: Number(newProductVat) || 23,
        stock_quantity: 0,
        gtu_code: newProductGtu || null,
      })
      .select()
      .single();

    if (error) { toast.error('Błąd tworzenia produktu'); return; }

    if (data) {
      if (editingItemIndex !== null) handleMapProduct(editingItemIndex, data.id);
      setProducts(prev => [...prev, data]);
      setNewProductOpen(false);
      toast.success(`Produkt "${newProductName}" utworzony`);
    }
  };

  /* ── Approve invoice ─────────────────────────────────────────────── */

  const handleApprove = async () => {
    if (!invoiceHeader || ocrItems.length === 0) return;
    setProcessing(true);

    try {
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
        ocr_raw: { items: ocrItems, header: invoiceHeader, mode: invoiceMode },
      };

      const { data: invoice, error: invError } = await supabase
        .from('purchase_invoices')
        .insert(insertPayload)
        .select()
        .single();

      if (invError || !invoice) {
        toast.error('Błąd tworzenia faktury');
        setProcessing(false);
        return;
      }

      for (const item of ocrItems) {
        await supabase.from('purchase_invoice_items').insert({
          purchase_invoice_id: invoice.id,
          product_id: (invoiceMode === 'magazyn' && item.mapped_product_id) ? item.mapped_product_id : null,
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

        // Only update stock if mode is 'magazyn' and product is mapped
        if (invoiceMode === 'magazyn' && item.mapped_product_id) {
          const product = products.find(p => p.id === item.mapped_product_id);
          if (product) {
            const newQty = (product.stock_quantity || 0) + item.quantity;
            await supabase.from('products')
              .update({ stock_quantity: newQty, purchase_price: item.unit_price_net })
              .eq('id', item.mapped_product_id);

            await supabase.from('stock_movements').insert({
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

          // Save supplier mapping for future auto-match
          if (item.supplier_symbol || item.name) {
            await (supabase as any).from('supplier_mappings').insert({
              supplier_name: item.name,
              supplier_symbol: item.supplier_symbol || null,
              product_id: item.mapped_product_id,
            });
          }
        }
      }

      const modeLabel = invoiceMode === 'magazyn' 
        ? '✅ Faktura zatwierdzona! Stany magazynowe zaktualizowane.' 
        : '✅ Faktura kosztowa zapisana!';
      toast.success(modeLabel);
      setOcrItems([]);
      setInvoiceHeader(null);
      setFileBase64(null);
      setUploadedFileUrl(null);
      setOcrDone(false);
      setAutoMatchedCount(0);
      await fetchProducts();
      await fetchInvoices();
      await fetchSupplierMappings();
    } catch {
      toast.error('Błąd zatwierdzania faktury');
    } finally {
      setProcessing(false);
    }
  };

  const removeItem = (index: number) => {
    setOcrItems(prev => prev.filter((_, i) => i !== index));
  };

  /* ── Towary: edit product ──────────────────────────────────────────── */

  const openEditProduct = (product: Product) => {
    setEditingProduct({ ...product });
    setEditProductOpen(true);
  };

  const handleSaveProduct = async () => {
    if (!editingProduct) return;
    const { id, ...updates } = editingProduct;
    const { error } = await supabase.from('products').update(updates).eq('id', id);
    if (error) { toast.error('Błąd zapisywania'); return; }
    toast.success('Produkt zaktualizowany');
    setEditProductOpen(false);
    setEditingProduct(null);
    await fetchProducts();
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Na pewno usunąć produkt?')) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) { toast.error('Błąd usuwania'); return; }
    toast.success('Produkt usunięty');
    await fetchProducts();
  };

  /* ── CSV export ────────────────────────────────────────────────────── */

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const [year, month] = exportMonth.split('-').map(Number);
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = month === 12 
        ? `${year + 1}-01-01` 
        : `${year}-${String(month + 1).padStart(2, '0')}-01`;

      // Fetch invoices for month
      const { data: invoices } = await supabase
        .from('purchase_invoices')
        .select('*')
        .gte('purchase_date', startDate)
        .lt('purchase_date', endDate)
        .order('purchase_date');

      if (!invoices || invoices.length === 0) {
        toast.error('Brak faktur w wybranym miesiącu');
        setExporting(false);
        return;
      }

      // Fetch all items for these invoices
      const invoiceIds = invoices.map(i => i.id);
      const { data: items } = await supabase
        .from('purchase_invoice_items')
        .select('*')
        .in('purchase_invoice_id', invoiceIds);

      // Build CSV
      const csvRows: string[] = [];
      csvRows.push([
        'Nr dokumentu', 'Data', 'Dostawca', 'NIP dostawcy', 'Forma płatności',
        'Netto faktury', 'VAT faktury', 'Brutto faktury',
        'Pozycja - nazwa', 'Ilość', 'Jednostka', 'Cena netto', 'Stawka VAT', 'Netto', 'Brutto', 'GTU',
      ].join(';'));

      for (const inv of invoices) {
        const invItems = (items || []).filter(it => it.purchase_invoice_id === inv.id);
        if (invItems.length === 0) {
          csvRows.push([
            inv.document_number, inv.purchase_date || '', inv.supplier_name || '',
            inv.supplier_nip || '', inv.payment_method || '',
            inv.total_net?.toFixed(2) || '', inv.total_vat?.toFixed(2) || '', inv.total_gross?.toFixed(2) || '',
            '', '', '', '', '', '', '', '',
          ].join(';'));
        } else {
          for (const it of invItems) {
            csvRows.push([
              inv.document_number, inv.purchase_date || '', inv.supplier_name || '',
              inv.supplier_nip || '', inv.payment_method || '',
              inv.total_net?.toFixed(2) || '', inv.total_vat?.toFixed(2) || '', inv.total_gross?.toFixed(2) || '',
              it.name || '', it.quantity || '', it.unit || '',
              it.unit_price_net?.toFixed(2) || '', `${it.vat_rate || ''}%`,
              it.total_net?.toFixed(2) || '', it.total_gross?.toFixed(2) || '', it.gtu_code || '',
            ].join(';'));
          }
        }
      }

      const bom = '\uFEFF';
      const csvContent = bom + csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zakupy_${exportMonth}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Wyeksportowano ${invoices.length} faktur`);
    } catch {
      toast.error('Błąd eksportu');
    } finally {
      setExporting(false);
    }
  };

  /* ── Filtered products for Towary tab ──────────────────────────────── */

  const filteredProducts = products.filter(p => {
    if (!productSearch) return true;
    const q = productSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q));
  });

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'zakupy' as const, label: 'Zakupy (OCR)', icon: Upload },
          { id: 'towary' as const, label: 'Towary', icon: Package },
          { id: 'eksport' as const, label: 'Eksport CSV', icon: Download },
        ].map(tab => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
            className="rounded-full"
          >
            <tab.icon className="h-4 w-4 mr-2" />
            {tab.label}
          </Button>
        ))}
      </div>

      {/* ═══════════ ZAKUPY TAB ═══════════ */}
      {activeTab === 'zakupy' && (
        <>
          <div className="flex gap-2">
            <Button variant={viewMode === 'upload' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('upload')} className="rounded-full">
              <Upload className="h-4 w-4 mr-2" />Nowa faktura
            </Button>
            <Button variant={viewMode === 'history' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('history')} className="rounded-full">
              <History className="h-4 w-4 mr-2" />Historia ({pastInvoices.length})
            </Button>
          </div>

          {viewMode === 'upload' && (
            <>
              {/* Dropzone */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" />Dodaj fakturę zakupową</CardTitle>
                  <CardDescription>Przeciągnij plik lub kliknij — AI odczyta pozycje automatycznie</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className={`flex flex-col items-center gap-4 p-8 border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
                      dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                  >
                    <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleFileSelect} className="hidden" />
                    {uploading ? (
                      <><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Przesyłanie...</p></>
                    ) : dragOver ? (
                      <><Upload className="h-10 w-10 text-primary" /><p className="text-sm font-medium text-primary">Upuść plik tutaj</p></>
                    ) : (
                      <>
                        <Upload className="h-10 w-10 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">Przeciągnij fakturę lub <span className="text-primary font-medium">kliknij aby wybrać</span></p>
                        <p className="text-xs text-muted-foreground/70">JPG, PNG, HEIC, PDF — max 20 MB</p>
                      </>
                    )}
                  </div>

                  {fileBase64 && !ocrDone && (
                    <Button onClick={handleOCR} disabled={processing} className="w-full mt-4" size="lg">
                      {processing ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rozpoznawanie przez AI...</>
                      ) : (
                        <><Scan className="h-4 w-4 mr-2" />Rozpoznaj fakturę (AI OCR)</>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* OCR Results */}
              {invoiceHeader && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Podgląd faktury</CardTitle>
                        {uploadedFileUrl && (
                          <a href={uploadedFileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1 mt-1">
                            <Eye className="h-3 w-3" />Otwórz plik źródłowy
                          </a>
                        )}
                      </div>
                      {invoiceMode === 'magazyn' && (
                        <Badge variant="outline">{ocrItems.filter(i => i.mapped_product_id).length}/{ocrItems.length} powiązanych</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Mode toggle */}
                    <div className="flex gap-2 p-1 bg-muted rounded-lg">
                      <button
                        onClick={() => setInvoiceMode('magazyn')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                          invoiceMode === 'magazyn' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Package className="h-4 w-4" />
                        📦 Dodaj do magazynu
                      </button>
                      <button
                        onClick={() => setInvoiceMode('kosztowa')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                          invoiceMode === 'kosztowa' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <FileText className="h-4 w-4" />
                        📄 Tylko faktura kosztowa
                      </button>
                    </div>

                    {invoiceMode === 'kosztowa' && (
                      <div className="p-3 rounded-lg bg-muted/50 border border-muted text-sm text-muted-foreground">
                        💡 Tryb kosztowy — faktura zostanie zapisana bez powiązania z magazynem. Pozycje nie aktualizują stanów.
                      </div>
                    )}

                    {/* Auto-match info */}
                    {invoiceMode === 'magazyn' && autoMatchedCount > 0 && (
                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
                        <span className="font-medium">🧠 System rozpoznał {autoMatchedCount} z {ocrItems.length} pozycji</span>
                        <span className="text-muted-foreground ml-1">— dopasowane automatycznie po indeksie/nazwie dostawcy</span>
                      </div>
                    )}

                    {/* Header info */}
                    <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{invoiceHeader.supplier_name || 'Brak nazwy'}</p>
                          {invoiceHeader.supplier_nip && <p className="text-xs text-muted-foreground">NIP: {invoiceHeader.supplier_nip}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-mono">{invoiceHeader.document_number}</p>
                          {invoiceHeader.purchase_date && <p className="text-xs text-muted-foreground">Data: {invoiceHeader.purchase_date}</p>}
                          {invoiceHeader.payment_method && <p className="text-xs text-muted-foreground">Płatność: {invoiceHeader.payment_method}</p>}
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
                        <h3 className="font-medium flex items-center gap-2"><Package className="h-4 w-4" />Pozycje ({ocrItems.length})</h3>
                        <div className="border rounded-lg overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Nazwa z faktury</TableHead>
                                <TableHead className="w-20 text-right">Ilość</TableHead>
                                <TableHead className="w-24 text-right">Cena netto</TableHead>
                                <TableHead className="w-20 text-right">VAT</TableHead>
                                <TableHead className="w-24 text-right">Brutto</TableHead>
                                {invoiceMode === 'magazyn' && <TableHead className="w-48">Produkt w magazynie</TableHead>}
                                <TableHead className="w-10"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {ocrItems.map((item, index) => (
                                <TableRow key={index}>
                                  <TableCell>
                                    <p className="font-medium text-sm">{item.name}</p>
                                    {item.supplier_symbol && <p className="text-xs text-muted-foreground">Indeks: {item.supplier_symbol}</p>}
                                    {item.gtu_code && <Badge variant="outline" className="text-[10px] mt-1">{item.gtu_code}</Badge>}
                                  </TableCell>
                                  <TableCell className="text-right text-sm">{item.quantity} {item.unit}</TableCell>
                                  <TableCell className="text-right text-sm font-mono">{item.unit_price_net.toFixed(2)}</TableCell>
                                  <TableCell className="text-right text-sm">{item.vat_rate}%</TableCell>
                                  <TableCell className="text-right text-sm font-mono font-semibold">{item.total_gross.toFixed(2)}</TableCell>
                                  {invoiceMode === 'magazyn' && (
                                    <TableCell>
                                      <div className="flex items-center gap-1">
                                        <Select value={item.mapped_product_id || '_none'} onValueChange={(v) => handleMapProduct(index, v === '_none' ? '' : v)}>
                                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="_none">— brak —</SelectItem>
                                            {products.map(p => (
                                              <SelectItem key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openNewProductDialog(index)} title="Utwórz nowy produkt">
                                          <Plus className="h-3 w-3" />
                                        </Button>
                                      </div>
                                      {item.mapped_product_id && (
                                        <div className="flex items-center gap-1 mt-1">
                                          <CheckCircle className="h-3 w-3 text-primary" />
                                          <span className="text-[10px] text-primary">Powiązany</span>
                                        </div>
                                      )}
                                    </TableCell>
                                  )}
                                  <TableCell>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(index)}>
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Approve */}
                        <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg gap-4">
                          <div>
                            {invoiceMode === 'magazyn' ? (
                              <>
                                <p className="text-sm font-medium">{ocrItems.filter(i => i.mapped_product_id).length} z {ocrItems.length} pozycji powiązanych z magazynem</p>
                                <p className="text-xs text-muted-foreground">Niepowiązane pozycje zapisane bez aktualizacji stanu</p>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-medium">{ocrItems.length} pozycji do zapisania</p>
                                <p className="text-xs text-muted-foreground">Faktura kosztowa — bez wpływu na stany magazynowe</p>
                              </>
                            )}
                          </div>
                          <Button onClick={handleApprove} disabled={processing} size="lg">
                            {processing ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Zatwierdzanie...</>
                            ) : invoiceMode === 'magazyn' ? (
                              <><CheckCircle className="h-4 w-4 mr-2" />Zatwierdź i dodaj do magazynu</>
                            ) : (
                              <><CheckCircle className="h-4 w-4 mr-2" />Zapisz fakturę kosztową</>
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

          {/* History */}
          {viewMode === 'history' && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Historia faktur zakupowych</CardTitle></CardHeader>
              <CardContent>
                {loadingInvoices ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : pastInvoices.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Brak faktur zakupowych</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
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
                              {inv.supplier_nip && <p className="text-xs text-muted-foreground">NIP: {inv.supplier_nip}</p>}
                            </TableCell>
                            <TableCell className="text-sm">{inv.purchase_date || new Date(inv.created_at).toLocaleDateString('pl-PL')}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{inv.total_net?.toFixed(2) || '—'}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold">{inv.total_gross?.toFixed(2) || '—'}</TableCell>
                            <TableCell>
                              <Badge variant={inv.status === 'approved' ? 'default' : 'secondary'}>
                                {inv.status === 'approved' ? 'Zatwierdzona' : inv.status || 'Nowa'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {inv.pdf_url && (
                                <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer">
                                  <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="h-4 w-4" /></Button>
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
        </>
      )}

      {/* ═══════════ TOWARY TAB ═══════════ */}
      {activeTab === 'towary' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Towary ({products.length})</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Szukaj..."
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    className="pl-9 w-48"
                  />
                </div>
                <Button size="sm" onClick={() => openNewProductDialog(null)}>
                  <Plus className="h-4 w-4 mr-1" />Dodaj towar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingProducts ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Brak towarów{productSearch ? ' pasujących do wyszukiwania' : ''}</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nazwa</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Jednostka</TableHead>
                      <TableHead className="text-right">Stan</TableHead>
                      <TableHead className="text-right">Cena zakupu</TableHead>
                      <TableHead className="text-right">Cena sprzedaży</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                      <TableHead className="text-center">GTU</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium text-sm">{p.name}</TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{p.sku || '—'}</TableCell>
                        <TableCell className="text-sm">{p.unit || 'szt.'}</TableCell>
                        <TableCell className="text-right text-sm">
                          <span className={`font-semibold ${(p.stock_quantity || 0) <= (p.low_stock_alert || 0) && (p.stock_quantity || 0) > 0 ? 'text-amber-600' : (p.stock_quantity || 0) === 0 ? 'text-destructive' : ''}`}>
                            {p.stock_quantity ?? 0}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono">{p.purchase_price?.toFixed(2) || '—'}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{p.sale_price?.toFixed(2) || '—'}</TableCell>
                        <TableCell className="text-right text-sm">{p.vat_rate ?? 23}%</TableCell>
                        <TableCell className="text-center text-xs">{p.gtu_code || '—'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditProduct(p)}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteProduct(p.id)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
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

      {/* ═══════════ EKSPORT CSV TAB ═══════════ */}
      {activeTab === 'eksport' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" />Eksport zestawienia zakupów</CardTitle>
            <CardDescription>Pobierz CSV z fakturami zakupowymi i pozycjami za wybrany miesiąc (do przekazania księgowej)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-4">
              <div>
                <Label>Miesiąc</Label>
                <Input type="month" value={exportMonth} onChange={e => setExportMonth(e.target.value)} className="w-48" />
              </div>
              <Button onClick={handleExportCSV} disabled={exporting}>
                {exporting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Eksportowanie...</> : <><Download className="h-4 w-4 mr-2" />Pobierz CSV</>}
              </Button>
            </div>
            <div className="p-4 rounded-lg bg-muted/30 text-sm text-muted-foreground">
              <p>📋 Plik CSV zawiera: nr dokumentu, datę, dane dostawcy, formę płatności, kwoty netto/VAT/brutto oraz wszystkie pozycje z każdej faktury.</p>
              <p className="mt-1">💡 Format: rozdzielony średnikiem (;), kodowanie UTF-8 z BOM — otworzy się poprawnie w Excelu.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════ NEW PRODUCT DIALOG ═══════════ */}
      <Dialog open={newProductOpen} onOpenChange={setNewProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowy produkt</DialogTitle>
            <DialogDescription>Dodaj nowy towar do bazy produktów</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nazwa produktu *</Label>
              <Input value={newProductName} onChange={e => setNewProductName(e.target.value)} placeholder="Jak ten produkt nazywasz?" />
            </div>
            <div>
              <Label>SKU / Kod</Label>
              <Input value={newProductSku} onChange={e => setNewProductSku(e.target.value)} placeholder="np. PROD-001" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cena sprzedaży netto (PLN)</Label>
                <Input type="number" step="0.01" value={newProductSalePrice} onChange={e => setNewProductSalePrice(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label>Jednostka</Label>
                <Select value={newProductUnit} onValueChange={setNewProductUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['szt.', 'kg', 'l', 'm', 'm²', 'opak.', 'usł.'].map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Stawka VAT (%)</Label>
                <Select value={newProductVat} onValueChange={setNewProductVat}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['23', '8', '5', '0', 'zw'].map(v => (
                      <SelectItem key={v} value={v}>{v === 'zw' ? 'Zwolniony' : `${v}%`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Kod GTU</Label>
                <Input value={newProductGtu} onChange={e => setNewProductGtu(e.target.value)} placeholder="np. GTU_01" />
              </div>
            </div>
            {editingItemIndex !== null && ocrItems[editingItemIndex] && (
              <p className="text-xs text-muted-foreground">
                Cena zakupu: {ocrItems[editingItemIndex].unit_price_net.toFixed(2)} zł netto. Sugerowana marża +30%: {(ocrItems[editingItemIndex].unit_price_net * 1.3).toFixed(2)} zł
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewProductOpen(false)}>Anuluj</Button>
            <Button onClick={handleCreateProduct}>Utwórz produkt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ EDIT PRODUCT DIALOG ═══════════ */}
      <Dialog open={editProductOpen} onOpenChange={setEditProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edycja produktu</DialogTitle>
            <DialogDescription>Zmień dane towaru</DialogDescription>
          </DialogHeader>
          {editingProduct && (
            <div className="space-y-4 py-2">
              <div>
                <Label>Nazwa</Label>
                <Input value={editingProduct.name} onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })} />
              </div>
              <div>
                <Label>SKU</Label>
                <Input value={editingProduct.sku || ''} onChange={e => setEditingProduct({ ...editingProduct, sku: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cena zakupu netto</Label>
                  <Input type="number" step="0.01" value={editingProduct.purchase_price || ''} onChange={e => setEditingProduct({ ...editingProduct, purchase_price: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Cena sprzedaży netto</Label>
                  <Input type="number" step="0.01" value={editingProduct.sale_price || ''} onChange={e => setEditingProduct({ ...editingProduct, sale_price: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Jednostka</Label>
                  <Select value={editingProduct.unit || 'szt.'} onValueChange={v => setEditingProduct({ ...editingProduct, unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['szt.', 'kg', 'l', 'm', 'm²', 'opak.', 'usł.'].map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>VAT (%)</Label>
                  <Input type="number" value={editingProduct.vat_rate ?? 23} onChange={e => setEditingProduct({ ...editingProduct, vat_rate: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>GTU</Label>
                  <Input value={editingProduct.gtu_code || ''} onChange={e => setEditingProduct({ ...editingProduct, gtu_code: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Stan magazynowy</Label>
                  <Input type="number" value={editingProduct.stock_quantity ?? 0} onChange={e => setEditingProduct({ ...editingProduct, stock_quantity: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Alert niskiego stanu</Label>
                  <Input type="number" value={editingProduct.low_stock_alert ?? 0} onChange={e => setEditingProduct({ ...editingProduct, low_stock_alert: Number(e.target.value) })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProductOpen(false)}>Anuluj</Button>
            <Button onClick={handleSaveProduct}><Save className="h-4 w-4 mr-2" />Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
