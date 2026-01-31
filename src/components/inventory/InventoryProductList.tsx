import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useInventoryProducts, InventoryProduct } from '@/hooks/useInventoryProducts';
import { CategorySelector } from './CategorySelector';
import { 
  Package, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Loader2,
  Barcode,
  TrendingUp,
  TrendingDown,
  AlertTriangle
} from 'lucide-react';

const VAT_RATES = ['23', '8', '5', '0', 'zw', 'np'];
const UNITS = ['szt.', 'usł.', 'godz.', 'km', 'kg', 'm²', 'm³', 'kpl.'];

interface Props {
  entityId?: string;
  showBarcode?: boolean;
}

export function InventoryProductList({ entityId, showBarcode = false }: Props) {
  const { products, loading, createProduct, updateProduct, deleteProduct } = useInventoryProducts(entityId);
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name_sales: '',
    sku: '',
    vat_rate: '23',
    unit: 'szt.',
    default_sale_price_net: '',
    default_sale_price_gross: '',
    default_purchase_price_net: '',
    default_purchase_price_gross: '',
    barcode: '',
    category: '',
    notes: '',
  });

  const filteredProducts = products.filter(p => 
    p.name_sales.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenNew = () => {
    setEditingProduct(null);
    setFormData({
      name_sales: '',
      sku: '',
      vat_rate: '23',
      unit: 'szt.',
      default_sale_price_net: '',
      default_sale_price_gross: '',
      default_purchase_price_net: '',
      default_purchase_price_gross: '',
      barcode: '',
      category: '',
      notes: '',
    });
    setShowDialog(true);
  };

  const handleEdit = (product: InventoryProduct) => {
    setEditingProduct(product);
    setFormData({
      name_sales: product.name_sales,
      sku: product.sku || '',
      vat_rate: product.vat_rate,
      unit: product.unit,
      default_sale_price_net: product.default_sale_price_net?.toString() || '',
      default_sale_price_gross: product.default_sale_price_gross?.toString() || '',
      default_purchase_price_net: product.default_purchase_price_net?.toString() || '',
      default_purchase_price_gross: product.default_purchase_price_gross?.toString() || '',
      barcode: product.barcode || '',
      category: product.category || '',
      notes: product.notes || '',
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.name_sales.trim()) return;

    const saleNet = parseFloat(formData.default_sale_price_net) || 0;
    const purchaseNet = parseFloat(formData.default_purchase_price_net) || 0;
    const vatRate = parseFloat(formData.vat_rate) || 0;
    
    // Calculate gross prices
    const saleGross = formData.default_sale_price_gross 
      ? parseFloat(formData.default_sale_price_gross) 
      : saleNet * (1 + vatRate / 100);
    const purchaseGross = formData.default_purchase_price_gross 
      ? parseFloat(formData.default_purchase_price_gross) 
      : purchaseNet * (1 + vatRate / 100);

    const productData = {
      name_sales: formData.name_sales,
      sku: formData.sku || null,
      vat_rate: formData.vat_rate,
      unit: formData.unit,
      default_sale_price_net: saleNet || null,
      default_sale_price_gross: saleGross || null,
      default_purchase_price_net: purchaseNet || null,
      default_purchase_price_gross: purchaseGross || null,
      barcode: formData.barcode || null,
      category: formData.category || null,
      notes: formData.notes || null,
    };

    if (editingProduct) {
      await updateProduct(editingProduct.id, productData);
    } else {
      await createProduct(productData);
    }

    setShowDialog(false);
  };

  // Calculate margin for display
  const getMargin = (product: InventoryProduct) => {
    if (!product.default_sale_price_net || !product.default_purchase_price_net) return null;
    const margin = product.default_sale_price_net - product.default_purchase_price_net;
    const marginPercent = (margin / product.default_purchase_price_net) * 100;
    return { value: margin, percent: marginPercent };
  };

  // Recalculate gross when net or VAT changes
  const handleNetPriceChange = (field: 'sale' | 'purchase', value: string) => {
    const netValue = parseFloat(value) || 0;
    const vatRate = parseFloat(formData.vat_rate) || 0;
    const grossValue = netValue * (1 + vatRate / 100);
    
    if (field === 'sale') {
      setFormData({
        ...formData,
        default_sale_price_net: value,
        default_sale_price_gross: grossValue ? grossValue.toFixed(2) : ''
      });
    } else {
      setFormData({
        ...formData,
        default_purchase_price_net: value,
        default_purchase_price_gross: grossValue ? grossValue.toFixed(2) : ''
      });
    }
  };

  const handleGrossPriceChange = (field: 'sale' | 'purchase', value: string) => {
    const grossValue = parseFloat(value) || 0;
    const vatRate = parseFloat(formData.vat_rate) || 0;
    const netValue = grossValue / (1 + vatRate / 100);
    
    if (field === 'sale') {
      setFormData({
        ...formData,
        default_sale_price_gross: value,
        default_sale_price_net: netValue ? netValue.toFixed(2) : ''
      });
    } else {
      setFormData({
        ...formData,
        default_purchase_price_gross: value,
        default_purchase_price_net: netValue ? netValue.toFixed(2) : ''
      });
    }
  };

  const handleVatChange = (newVat: string) => {
    const vatRate = parseFloat(newVat) || 0;
    const saleNet = parseFloat(formData.default_sale_price_net) || 0;
    const purchaseNet = parseFloat(formData.default_purchase_price_net) || 0;
    
    setFormData({
      ...formData,
      vat_rate: newVat,
      default_sale_price_gross: saleNet ? (saleNet * (1 + vatRate / 100)).toFixed(2) : '',
      default_purchase_price_gross: purchaseNet ? (purchaseNet * (1 + vatRate / 100)).toFixed(2) : ''
    });
  };

  const handleDelete = async (product: InventoryProduct) => {
    if (confirm(`Czy na pewno chcesz usunąć "${product.name_sales}"?`)) {
      await deleteProduct(product.id);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Towary i usługi
              </CardTitle>
              <CardDescription>
                Kartoteka produktów z domyślnymi cenami
              </CardDescription>
            </div>
            <Button onClick={handleOpenNew}>
              <Plus className="h-4 w-4 mr-2" />
              Dodaj produkt
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Szukaj po nazwie, SKU lub kodzie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Products List */}
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Brak produktów</p>
              <p className="text-sm mt-1">Dodaj pierwszy produkt do magazynu</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProducts.map((product) => {
                const margin = getMargin(product);
                return (
                  <div 
                    key={product.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Package className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{product.name_sales}</p>
                          {product.category && (
                            <Badge variant="secondary" className="text-xs">
                              {product.category}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {product.sku && <span>SKU: {product.sku}</span>}
                          {showBarcode && product.barcode && (
                            <span className="flex items-center gap-1">
                              <Barcode className="h-3 w-3" />
                              {product.barcode}
                            </span>
                          )}
                          <span>• {product.unit}</span>
                          <span>• VAT {product.vat_rate}%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Prices and Margin */}
                      <div className="text-right space-y-0.5">
                        <div className="flex items-center gap-3">
                          {product.default_purchase_price_net && (
                            <div className="text-xs text-muted-foreground">
                              <span>Zakup: </span>
                              <span>{product.default_purchase_price_net.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</span>
                            </div>
                          )}
                          <div>
                            <p className="font-semibold">
                              {product.default_sale_price_net?.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł
                            </p>
                            <p className="text-xs text-muted-foreground">sprzedaż netto</p>
                          </div>
                        </div>
                        {margin && (
                          <div className={`flex items-center gap-1 text-xs ${margin.value >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                            {margin.value >= 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            <span>
                              Marża: {margin.value.toFixed(2)} zł ({margin.percent.toFixed(1)}%)
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(product)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(product)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'Edytuj produkt' : 'Nowy produkt'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Nazwa produktu *</Label>
              <Input
                value={formData.name_sales}
                onChange={(e) => setFormData({ ...formData, name_sales: e.target.value })}
                placeholder="np. Zapałki kominkowe"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>SKU / Kod</Label>
                <Input
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="np. ZAP-001"
                />
              </div>
              {showBarcode && (
                <div>
                  <Label>Kod kreskowy</Label>
                  <Input
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="np. 5901234123457"
                  />
                </div>
              )}
            </div>

            {/* Category Selector */}
            <CategorySelector
              value={formData.category}
              onChange={(v) => setFormData({ ...formData, category: v })}
              entityId={entityId}
            />

            {/* VAT and Unit */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Jednostka</Label>
                <Select 
                  value={formData.unit} 
                  onValueChange={(v) => setFormData({ ...formData, unit: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Stawka VAT</Label>
                <Select 
                  value={formData.vat_rate} 
                  onValueChange={handleVatChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VAT_RATES.map(v => (
                      <SelectItem key={v} value={v}>{v}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Purchase Prices */}
            <div className="border-t pt-4">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">Cena zakupu</Label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <Label>Netto</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.default_purchase_price_net}
                    onChange={(e) => handleNetPriceChange('purchase', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label>Brutto</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.default_purchase_price_gross}
                    onChange={(e) => handleGrossPriceChange('purchase', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* Sale Prices */}
            <div className="border-t pt-4">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">Cena sprzedaży</Label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <Label>Netto</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.default_sale_price_net}
                    onChange={(e) => handleNetPriceChange('sale', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label>Brutto</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.default_sale_price_gross}
                    onChange={(e) => handleGrossPriceChange('sale', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
              
              {/* Margin Preview */}
              {formData.default_purchase_price_net && formData.default_sale_price_net && (
                <div className="mt-3 p-3 bg-muted rounded-lg">
                  {(() => {
                    const purchase = parseFloat(formData.default_purchase_price_net) || 0;
                    const sale = parseFloat(formData.default_sale_price_net) || 0;
                    const margin = sale - purchase;
                    const marginPercent = purchase > 0 ? (margin / purchase) * 100 : 0;
                    const isNegative = margin < 0;
                    
                    return (
                      <div className={`flex items-center gap-2 text-sm ${isNegative ? 'text-destructive' : 'text-green-600'}`}>
                        {isNegative ? (
                          <>
                            <AlertTriangle className="h-4 w-4" />
                            <span>Uwaga: sprzedajesz poniżej ceny zakupu!</span>
                          </>
                        ) : (
                          <>
                            <TrendingUp className="h-4 w-4" />
                            <span>Marża: {margin.toFixed(2)} zł ({marginPercent.toFixed(1)}%)</span>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            <div>
              <Label>Notatki</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Dodatkowe informacje..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Anuluj
            </Button>
            <Button onClick={handleSave} disabled={!formData.name_sales.trim()}>
              {editingProduct ? 'Zapisz zmiany' : 'Dodaj produkt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
