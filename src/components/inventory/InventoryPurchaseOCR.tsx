// InventoryPurchaseOCR v2 - Real AI OCR integration
import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useInventoryProducts } from '@/hooks/useInventoryProducts';
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
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────────────── */

interface OCRItem {
  raw_name: string;
  qty: number;
  unit: string;
  unit_net: number;
  vat_rate: string;
  net_total: number;
  gross_total: number;
  supplier_code?: string;
  mapped_product_id?: string;
  remember_mapping: boolean;
}

interface InvoiceHeader {
  seller_name?: string;
  seller_nip?: string;
  seller_address?: string;
  invoice_number?: string;
  issue_date?: string;
  due_date?: string;
  net_total?: number;
  vat_total?: number;
  gross_total?: number;
  currency?: string;
}

interface PurchaseDocument {
  id: string;
  supplier_name?: string;
  supplier_nip?: string;
  document_number?: string;
  status: string;
  file_url?: string;
  created_at: string;
  gross_total?: number;
}

interface Props {
  entityId?: string;
}

/* ─── Component ──────────────────────────────────────────────────────── */

export function InventoryPurchaseOCR({ entityId }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { products, createProduct } = useInventoryProducts(entityId);
  const { execute: executeAI, isLoading: aiLoading } = useGetRidoAI();

  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<PurchaseDocument | null>(null);
  const [invoiceHeader, setInvoiceHeader] = useState<InvoiceHeader | null>(null);
  const [ocrItems, setOcrItems] = useState<OCRItem[]>([]);
  const [fileBase64, setFileBase64] = useState<string | null>(null);

  // New product dialog
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

  /* ── File upload ─────────────────────────────────────────────────── */

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:...;base64, prefix
        resolve(result.split(',')[1] || result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Musisz być zalogowany');
      setUploading(false);
      return;
    }

    try {
      // Convert to base64 for AI
      const b64 = await fileToBase64(file);
      setFileBase64(b64);

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

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

      // Create purchase document record
      const { data: doc, error: docError } = await (supabase as any)
        .from('purchase_documents')
        .insert({
          user_id: user.id,
          entity_id: entityId || null,
          file_url: publicUrl,
          file_name: file.name,
          status: 'new',
        })
        .select()
        .single();

      if (docError) {
        console.error('Document error:', docError);
        toast.error('Błąd tworzenia dokumentu');
        setUploading(false);
        return;
      }

      toast.success('Dokument przesłany. Kliknij "Rozpoznaj (OCR)" aby przetworzyć.');
      setSelectedDoc(doc);
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
    if (!selectedDoc || !fileBase64) return;

    setProcessing(true);

    try {
      const result = await executeAI({
        feature: 'ocr',
        taskType: 'ocr',
        query: 'Odczytaj tę fakturę zakupową i zwróć JSON z polami: { seller_name, seller_nip, seller_address, invoice_number, issue_date, due_date, items: [{name, quantity, unit, unit_price_net, vat_rate, total_net, total_gross, supplier_code}], net_total, vat_total, gross_total, currency }. Odpowiedz TYLKO samym JSON bez żadnego tekstu, bez markdown, bez komentarzy.',
        imageBase64: fileBase64,
      });

      if (!result?.result) {
        toast.error('AI nie zwróciło wyniku. Sprawdź konfigurację OCR w Centrum AI.');
        setProcessing(false);
        return;
      }

      // Parse JSON from AI response
      let parsed: any;
      try {
        // Try to extract JSON from response (may contain markdown code blocks)
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

      // Set header info
      setInvoiceHeader({
        seller_name: parsed.seller_name,
        seller_nip: parsed.seller_nip,
        seller_address: parsed.seller_address,
        invoice_number: parsed.invoice_number,
        issue_date: parsed.issue_date,
        due_date: parsed.due_date,
        net_total: parsed.net_total,
        vat_total: parsed.vat_total,
        gross_total: parsed.gross_total,
        currency: parsed.currency || 'PLN',
      });

      // Map items
      const items: OCRItem[] = (parsed.items || []).map((item: any) => ({
        raw_name: item.name || '',
        qty: Number(item.quantity) || 1,
        unit: item.unit || 'szt.',
        unit_net: Number(item.unit_price_net) || 0,
        vat_rate: String(item.vat_rate || '23').replace('%', ''),
        net_total: Number(item.total_net) || 0,
        gross_total: Number(item.total_gross) || 0,
        supplier_code: item.supplier_code || '',
        mapped_product_id: autoMatchProduct(item.name),
        remember_mapping: false,
      }));

      setOcrItems(items);
      toast.success(`OCR zakończony! Rozpoznano ${items.length} pozycji.`);

      // Update document status
      await (supabase as any)
        .from('purchase_documents')
        .update({
          status: 'parsed',
          supplier_name: parsed.seller_name,
          supplier_nip: parsed.seller_nip,
          document_number: parsed.invoice_number,
          gross_total: parsed.gross_total,
        })
        .eq('id', selectedDoc.id);

      setSelectedDoc(prev => prev ? { ...prev, status: 'parsed' } : null);
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
    const found = products.find(p =>
      p.name_sales.toLowerCase().includes(lower) ||
      lower.includes(p.name_sales.toLowerCase())
    );
    return found?.id;
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
    setNewProductName(item.raw_name);
    setNewProductPrice(String(Math.round(item.unit_net * 1.3 * 100) / 100));
    setNewProductOpen(true);
  };

  const handleCreateProduct = async () => {
    if (!newProductName.trim() || editingItemIndex === null) return;

    const item = ocrItems[editingItemIndex];
    const product = await createProduct({
      name_sales: newProductName,
      vat_rate: item.vat_rate,
      unit: item.unit,
      default_sale_price_net: Number(newProductPrice) || item.unit_net * 1.3,
      default_purchase_price_net: item.unit_net,
    });

    if (product) {
      handleMapProduct(editingItemIndex, product.id);
      setNewProductOpen(false);
      setNewProductName('');
      setNewProductPrice('');
      setEditingItemIndex(null);
      toast.success(`Produkt "${newProductName}" utworzony i powiązany`);
    }
  };

  /* ── Approve invoice ─────────────────────────────────────────────── */

  const handleApprove = async () => {
    if (!selectedDoc || ocrItems.length === 0) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setProcessing(true);

    try {
      for (const item of ocrItems) {
        // Create purchase document item
        await (supabase as any)
          .from('purchase_document_items')
          .insert({
            purchase_document_id: selectedDoc.id,
            raw_name_from_invoice: item.raw_name,
            qty: item.qty,
            unit: item.unit,
            unit_net: item.unit_net,
            vat_rate: item.vat_rate,
            net_total: item.net_total,
            vat_total: item.gross_total - item.net_total,
            gross_total: item.gross_total,
            mapped_product_id: item.mapped_product_id || null,
            remember_mapping: item.remember_mapping,
          });

        // If mapped to product, create batch and movement
        if (item.mapped_product_id) {
          await (supabase as any)
            .from('inventory_batches')
            .insert({
              product_id: item.mapped_product_id,
              purchase_document_id: selectedDoc.id,
              qty_in: item.qty,
              qty_remaining: item.qty,
              unit_cost_net: item.unit_net,
              vat_rate: item.vat_rate,
            });

          await (supabase as any)
            .from('inventory_movements')
            .insert({
              product_id: item.mapped_product_id,
              direction: 'in',
              qty: item.qty,
              source_type: 'purchase',
              source_id: selectedDoc.id,
              unit_cost_net: item.unit_net,
              created_by: user.id,
            });

          // Remember mapping as alias
          if (item.remember_mapping) {
            await (supabase as any)
              .from('inventory_product_aliases')
              .insert({
                user_id: user.id,
                entity_id: entityId || null,
                product_id: item.mapped_product_id,
                source_label: item.raw_name,
                normalized_label: item.raw_name.toLowerCase().trim(),
                supplier_name: invoiceHeader?.seller_name,
                supplier_nip: invoiceHeader?.seller_nip,
              });
          }
        }
      }

      // Update document status
      await (supabase as any)
        .from('purchase_documents')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: user.id,
        })
        .eq('id', selectedDoc.id);

      toast.success('Faktura zatwierdzona! Towar dodany do magazynu.');
      setSelectedDoc(null);
      setOcrItems([]);
      setInvoiceHeader(null);
      setFileBase64(null);
    } catch (error) {
      console.error('Error approving:', error);
      toast.error('Błąd zatwierdzania faktury');
    } finally {
      setProcessing(false);
    }
  };

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Faktury zakupowe (OCR)
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
              Obsługiwane formaty: JPG, PNG, HEIC, PDF
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Selected Document */}
      {selectedDoc && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Przetwarzanie dokumentu
                </CardTitle>
                <CardDescription>
                  {selectedDoc.file_url && (
                    <a
                      href={selectedDoc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      <Eye className="h-3 w-3" />
                      Podgląd pliku
                    </a>
                  )}
                </CardDescription>
              </div>
              <Badge>
                {selectedDoc.status === 'new' && 'Nowy'}
                {selectedDoc.status === 'parsed' && 'Rozpoznany'}
                {selectedDoc.status === 'approved' && 'Zatwierdzony'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* OCR Button */}
            {selectedDoc.status === 'new' && (
              <Button onClick={handleOCR} disabled={processing || aiLoading} className="w-full">
                {(processing || aiLoading) ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rozpoznawanie przez AI...</>
                ) : (
                  <><Scan className="h-4 w-4 mr-2" />Rozpoznaj fakturę (AI OCR)</>
                )}
              </Button>
            )}

            {/* Invoice Header */}
            {invoiceHeader && (
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{invoiceHeader.seller_name}</p>
                    {invoiceHeader.seller_nip && (
                      <p className="text-xs text-muted-foreground">NIP: {invoiceHeader.seller_nip}</p>
                    )}
                    {invoiceHeader.seller_address && (
                      <p className="text-xs text-muted-foreground">{invoiceHeader.seller_address}</p>
                    )}
                  </div>
                  <div className="text-right">
                    {invoiceHeader.invoice_number && (
                      <p className="text-sm font-mono">{invoiceHeader.invoice_number}</p>
                    )}
                    {invoiceHeader.issue_date && (
                      <p className="text-xs text-muted-foreground">Data: {invoiceHeader.issue_date}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-4 text-xs pt-2 border-t">
                  <span>Netto: <strong>{invoiceHeader.net_total?.toFixed(2)} {invoiceHeader.currency}</strong></span>
                  <span>VAT: <strong>{invoiceHeader.vat_total?.toFixed(2)} {invoiceHeader.currency}</strong></span>
                  <span>Brutto: <strong>{invoiceHeader.gross_total?.toFixed(2)} {invoiceHeader.currency}</strong></span>
                </div>
              </div>
            )}

            {/* OCR Items */}
            {ocrItems.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-medium">Rozpoznane pozycje ({ocrItems.length}):</h3>

                {ocrItems.map((item, index) => (
                  <div key={index} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{item.raw_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.qty} {item.unit} × {item.unit_net.toFixed(2)} zł = {item.net_total.toFixed(2)} zł netto
                        </p>
                        {item.supplier_code && (
                          <p className="text-xs text-muted-foreground">Kod dostawcy: {item.supplier_code}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">VAT {item.vat_rate}%</Badge>
                        {item.mapped_product_id ? (
                          <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Powiązany</Badge>
                        ) : (
                          <Badge variant="secondary"><AlertCircle className="h-3 w-3 mr-1" />Niepowiązany</Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Label className="text-xs">Powiąż z produktem magazynowym:</Label>
                        <Select
                          value={item.mapped_product_id || ''}
                          onValueChange={(v) => handleMapProduct(index, v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Wybierz produkt..." />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name_sales} {p.sku ? `(${p.sku})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-5"
                        onClick={() => openNewProductDialog(index)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Nowy produkt
                      </Button>
                    </div>

                    {item.mapped_product_id && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`remember-${index}`}
                          checked={item.remember_mapping}
                          onCheckedChange={(checked) => {
                            setOcrItems(prev => prev.map((it, i) =>
                              i === index ? { ...it, remember_mapping: !!checked } : it
                            ));
                          }}
                        />
                        <Label htmlFor={`remember-${index}`} className="text-sm">
                          Zapamiętaj powiązanie dla przyszłych faktur od tego dostawcy
                        </Label>
                      </div>
                    )}
                  </div>
                ))}

                {/* Approve Button */}
                <Button
                  onClick={handleApprove}
                  disabled={processing}
                  className="w-full"
                  size="lg"
                >
                  {processing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Zatwierdzanie...</>
                  ) : (
                    <><CheckCircle className="h-4 w-4 mr-2" />Zatwierdź fakturę i dodaj do magazynu</>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* New Product Dialog */}
      <Dialog open={newProductOpen} onOpenChange={setNewProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowy produkt magazynowy</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nazwa produktu (sprzedażowa)</Label>
              <Input
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="Jak ten produkt nazywasz w swoim sklepie?"
              />
            </div>
            <div>
              <Label>Cena sprzedaży netto (PLN)</Label>
              <Input
                type="number"
                step="0.01"
                value={newProductPrice}
                onChange={(e) => setNewProductPrice(e.target.value)}
                placeholder="0.00"
              />
              {editingItemIndex !== null && (
                <p className="text-xs text-muted-foreground mt-1">
                  Cena zakupu: {ocrItems[editingItemIndex]?.unit_net.toFixed(2)} zł netto.
                  Sugerowana cena sprzedaży (+30%): {(ocrItems[editingItemIndex]?.unit_net * 1.3).toFixed(2)} zł
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewProductOpen(false)}>Anuluj</Button>
            <Button onClick={handleCreateProduct}>Utwórz i powiąż</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
