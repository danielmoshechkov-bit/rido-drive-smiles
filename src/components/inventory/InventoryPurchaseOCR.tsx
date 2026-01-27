import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useInventoryProducts } from '@/hooks/useInventoryProducts';
import { toast } from 'sonner';
import { 
  Upload, 
  FileText, 
  Loader2, 
  CheckCircle,
  Package,
  Plus,
  Scan,
  Eye
} from 'lucide-react';

interface OCRItem {
  raw_name: string;
  qty: number;
  unit: string;
  unit_net: number;
  vat_rate: string;
  net_total: number;
  mapped_product_id?: string;
  remember_mapping: boolean;
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

export function InventoryPurchaseOCR({ entityId }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { products, createProduct } = useInventoryProducts(entityId);
  
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [documents, setDocuments] = useState<PurchaseDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<PurchaseDocument | null>(null);
  const [ocrItems, setOcrItems] = useState<OCRItem[]>([]);
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

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

    // Upload file
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
    setUploading(false);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleOCR = async () => {
    if (!selectedDoc) return;
    
    setProcessing(true);
    
    // Symulacja OCR - w produkcji wywołaj edge function
    // Tutaj tworzymy przykładowe dane do demonstracji
    setTimeout(() => {
      const mockItems: OCRItem[] = [
        {
          raw_name: 'Produkt przykładowy 1',
          qty: 10,
          unit: 'szt.',
          unit_net: 25.00,
          vat_rate: '23',
          net_total: 250.00,
          remember_mapping: false,
        },
        {
          raw_name: 'Usługa transportowa',
          qty: 1,
          unit: 'usł.',
          unit_net: 150.00,
          vat_rate: '23',
          net_total: 150.00,
          remember_mapping: false,
        },
      ];
      
      setOcrItems(mockItems);
      setProcessing(false);
      toast.success('OCR zakończony. Sprawdź i popraw pozycje.');
      
      // Update document status
      (supabase as any)
        .from('purchase_documents')
        .update({ status: 'parsed' })
        .eq('id', selectedDoc.id);
    }, 2000);
  };

  const handleApprove = async () => {
    if (!selectedDoc || ocrItems.length === 0) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setProcessing(true);

    try {
      for (const item of ocrItems) {
        // Create purchase document item
        const { data: purchaseItem } = await (supabase as any)
          .from('purchase_document_items')
          .insert({
            purchase_document_id: selectedDoc.id,
            raw_name_from_invoice: item.raw_name,
            qty: item.qty,
            unit: item.unit,
            unit_net: item.unit_net,
            vat_rate: item.vat_rate,
            net_total: item.net_total,
            vat_total: item.net_total * (parseFloat(item.vat_rate) / 100),
            gross_total: item.net_total * (1 + parseFloat(item.vat_rate) / 100),
            mapped_product_id: item.mapped_product_id || null,
            remember_mapping: item.remember_mapping,
          })
          .select()
          .single();

        // If mapped to product, create batch and movement
        if (item.mapped_product_id) {
          // Create batch
          await (supabase as any)
            .from('inventory_batches')
            .insert({
              product_id: item.mapped_product_id,
              purchase_document_id: selectedDoc.id,
              purchase_item_id: purchaseItem?.id,
              qty_in: item.qty,
              qty_remaining: item.qty,
              unit_cost_net: item.unit_net,
              vat_rate: item.vat_rate,
            });

          // Create movement
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

          // If remember_mapping, create alias
          if (item.remember_mapping) {
            await (supabase as any)
              .from('inventory_product_aliases')
              .insert({
                user_id: user.id,
                entity_id: entityId || null,
                product_id: item.mapped_product_id,
                source_label: item.raw_name,
                normalized_label: item.raw_name.toLowerCase().trim(),
                supplier_name: selectedDoc.supplier_name,
                supplier_nip: selectedDoc.supplier_nip,
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
    } catch (error) {
      console.error('Error approving:', error);
      toast.error('Błąd zatwierdzania faktury');
    } finally {
      setProcessing(false);
    }
  };

  const handleMapProduct = (index: number, productId: string) => {
    setOcrItems(prev => prev.map((item, i) => 
      i === index ? { ...item, mapped_product_id: productId } : item
    ));
  };

  const handleCreateProduct = async () => {
    if (!newProductName.trim() || editingItemIndex === null) return;

    const product = await createProduct({
      name_sales: newProductName,
      vat_rate: ocrItems[editingItemIndex].vat_rate,
      unit: ocrItems[editingItemIndex].unit,
      default_sale_price_net: ocrItems[editingItemIndex].unit_net * 1.3, // 30% markup
    });

    if (product) {
      handleMapProduct(editingItemIndex, product.id);
      setShowNewProductModal(false);
      setNewProductName('');
      setEditingItemIndex(null);
    }
  };

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
            Prześlij zdjęcie lub PDF faktury zakupowej
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
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Przesyłanie...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Wybierz plik lub zrób zdjęcie
                </>
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
              <Button onClick={handleOCR} disabled={processing} className="w-full">
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Rozpoznawanie...
                  </>
                ) : (
                  <>
                    <Scan className="h-4 w-4 mr-2" />
                    Rozpoznaj (OCR)
                  </>
                )}
              </Button>
            )}

            {/* OCR Items */}
            {ocrItems.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-medium">Rozpoznane pozycje:</h3>
                
                {ocrItems.map((item, index) => (
                  <div key={index} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{item.raw_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.qty} {item.unit} × {item.unit_net.toFixed(2)} zł = {item.net_total.toFixed(2)} zł netto
                        </p>
                      </div>
                      <Badge variant="outline">VAT {item.vat_rate}%</Badge>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Label className="text-xs">Powiąż z produktem:</Label>
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
                                {p.name_sales}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setEditingItemIndex(index);
                          setNewProductName(item.raw_name);
                          setShowNewProductModal(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Nowy
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
                          Zapamiętaj to powiązanie dla przyszłych faktur
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
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Zatwierdzanie...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Zatwierdź fakturę i dodaj do magazynu
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* New Product Modal (simple) */}
      {showNewProductModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle>Utwórz nowy produkt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nazwa produktu</Label>
                <Input
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="Nazwa produktu w magazynie"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => {
                  setShowNewProductModal(false);
                  setEditingItemIndex(null);
                }}>
                  Anuluj
                </Button>
                <Button className="flex-1" onClick={handleCreateProduct}>
                  Utwórz i powiąż
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
