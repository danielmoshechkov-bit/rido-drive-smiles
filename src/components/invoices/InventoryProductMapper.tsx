import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Package, Search, Plus } from 'lucide-react';

const VAT_RATES = ['23', '8', '5', '0', 'zw', 'np'];

interface InventoryProductMapperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string | null;
  userId?: string | null;
  itemName: string;
  itemNetPrice: number;
  itemQuantity: number;
  itemVatRate: string;
  /** Dla zapisu aliasu (auto-mapowanie kolejnych faktur) */
  supplierNip?: string | null;
  supplierName?: string | null;
  supplierSymbol?: string | null;
  onProductMapped: (productId: string) => void;
}

interface Product {
  id: string;
  name_sales: string;
  sku?: string | null;
  barcode?: string | null;
}

export function InventoryProductMapper({
  open,
  onOpenChange,
  entityId,
  userId,
  itemName,
  itemNetPrice,
  itemVatRate,
  supplierNip,
  supplierName,
  supplierSymbol,
  onProductMapped
}: InventoryProductMapperProps) {
  const [mode, setMode] = useState<'search' | 'create'>('search');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [newName, setNewName] = useState(itemName);
  const [newSku, setNewSku] = useState(supplierSymbol || '');
  const [newBarcode, setNewBarcode] = useState('');
  const [newNetPrice, setNewNetPrice] = useState(itemNetPrice);
  const [newVatRate, setNewVatRate] = useState(itemVatRate || '23');

  useEffect(() => {
    if (open) {
      setNewName(itemName);
      setNewSku(supplierSymbol || '');
      setNewNetPrice(itemNetPrice);
      setNewVatRate(itemVatRate || '23');
      searchProducts(itemName.split(' ').slice(0, 2).join(' '));
    }
  }, [open, itemName, itemNetPrice, itemVatRate, supplierSymbol]);

  const searchProducts = async (term: string) => {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('inventory_products')
        .select('id, name_sales, sku, barcode')
        .eq('is_active', true)
        .limit(20);
      
      if (entityId) query = query.eq('entity_id', entityId);
      else if (userId) query = query.eq('user_id', userId);
      
      if (term) {
        query = query.or(`name_sales.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`);
      }
      
      const { data } = await query;
      setProducts((data as Product[]) || []);
    } catch (err) {
      console.error('Error searching products:', err);
    } finally {
      setLoading(false);
    }
  };

  // Zapisz alias do auto-mapowania na przyszłość
  const saveAlias = async (productId: string) => {
    try {
      const normalized = (itemName || '').toLowerCase().trim().replace(/\s+/g, ' ');
      const payload: any = {
        product_id: productId,
        entity_id: entityId,
        user_id: userId,
        supplier_name: supplierName || null,
        supplier_nip: supplierNip || null,
        source_label: itemName,
        normalized_label: normalized,
        confidence: 1.0,
      };
      await (supabase as any).from('inventory_product_aliases').insert(payload);
    } catch (e) {
      console.warn('Alias save failed (non-critical):', e);
    }
  };

  const handleSelectProduct = async (product: Product) => {
    await saveAlias(product.id);
    onProductMapped(product.id);
    toast.success(`Przypisano: ${product.name_sales}. Zapamiętane na przyszłość.`);
    onOpenChange(false);
  };

  const handleCreateProduct = async () => {
    if (!newName.trim()) {
      toast.error('Podaj nazwę produktu');
      return;
    }

    setSaving(true);
    try {
      const insertData: any = {
        name_sales: newName.trim(),
        sku: newSku.trim() || null,
        barcode: newBarcode.trim() || null,
        default_sale_price_net: newNetPrice,
        default_purchase_price_net: itemNetPrice,
        vat_rate: newVatRate,
        is_active: true,
        unit: 'szt.',
        currency: 'PLN',
      };
      if (entityId) insertData.entity_id = entityId;
      if (userId) insertData.user_id = userId;

      const { data: newProduct, error } = await (supabase as any)
        .from('inventory_products')
        .insert(insertData)
        .select('id')
        .single();

      if (error) throw error;

      await saveAlias(newProduct.id);
      onProductMapped(newProduct.id);
      toast.success('Utworzono produkt i przypisano. Zapamiętane na przyszłość.');
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error creating product:', err);
      toast.error('Błąd tworzenia produktu: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const grossPrice = newNetPrice * (1 + (parseFloat(newVatRate) || 0) / 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Przypisz do produktu
          </DialogTitle>
        </DialogHeader>

        {mode === 'search' ? (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj produktu..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); searchProducts(e.target.value); }}
                className="pl-10"
              />
            </div>

            <div className="border rounded-lg max-h-48 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
              ) : products.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Brak produktów</div>
              ) : (
                products.map(product => (
                  <button key={product.id} onClick={() => handleSelectProduct(product)} className="w-full p-3 text-left hover:bg-accent border-b last:border-b-0">
                    <div className="font-medium text-sm">{product.name_sales}</div>
                    {product.sku && <div className="text-xs text-muted-foreground">SKU: {product.sku}</div>}
                  </button>
                ))
              )}
            </div>

            <Button onClick={() => setMode('create')} variant="outline" className="w-full gap-2">
              <Plus className="h-4 w-4" /> Utwórz nowy produkt
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Nazwa produktu *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>SKU</Label><Input value={newSku} onChange={(e) => setNewSku(e.target.value)} /></div>
              <div><Label>Kod kreskowy</Label><Input value={newBarcode} onChange={(e) => setNewBarcode(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Cena netto</Label><Input type="number" value={newNetPrice} onChange={(e) => setNewNetPrice(parseFloat(e.target.value) || 0)} /></div>
              <div><Label>VAT</Label>
                <Select value={newVatRate} onValueChange={setNewVatRate}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{VAT_RATES.map(rate => <SelectItem key={rate} value={rate}>{rate}%</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Brutto</Label><div className="h-10 flex items-center px-3 bg-muted rounded-md text-sm">{grossPrice.toFixed(2)} zł</div></div>
            </div>
          </div>
        )}

        <DialogFooter>
          {mode === 'create' && <Button variant="outline" onClick={() => setMode('search')}>Wróć</Button>}
          {mode === 'create' && <Button onClick={handleCreateProduct} disabled={saving || !newName.trim()}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Utwórz</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
