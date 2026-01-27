import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Package, 
  Search, 
  Plus,
  Minus,
  History,
  Loader2,
  TrendingUp,
  TrendingDown,
  ArrowUpDown
} from 'lucide-react';

interface ProductWithStock {
  id: string;
  name_sales: string;
  sku?: string;
  unit: string;
  stock_qty: number;
  avg_cost: number;
}

interface Movement {
  id: string;
  direction: 'in' | 'out' | 'adjust';
  qty: number;
  source_type: string;
  note?: string;
  created_at: string;
}

interface Props {
  entityId?: string;
}

export function InventoryStockView({ entityId }: Props) {
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Adjustment dialog
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductWithStock | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'remove'>('add');
  const [adjustmentQty, setAdjustmentQty] = useState('');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  
  // History dialog
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    fetchProductsWithStock();
  }, [entityId]);

  const fetchProductsWithStock = async () => {
    setLoading(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Fetch products
    let query = (supabase as any)
      .from('inventory_products')
      .select('id, name_sales, sku, unit')
      .eq('is_active', true)
      .order('name_sales');

    if (entityId) {
      query = query.eq('entity_id', entityId);
    } else {
      query = query.eq('user_id', user.id);
    }

    const { data: productsData, error } = await query;

    if (error) {
      console.error('Error fetching products:', error);
      setLoading(false);
      return;
    }

    // For each product, calculate stock from batches
    const productsWithStock: ProductWithStock[] = await Promise.all(
      (productsData || []).map(async (product: any) => {
        const { data: stockData } = await (supabase as any)
          .from('inventory_batches')
          .select('qty_remaining, unit_cost_net')
          .eq('product_id', product.id);

        let totalQty = 0;
        let totalCost = 0;
        
        (stockData || []).forEach((batch: any) => {
          totalQty += parseFloat(batch.qty_remaining) || 0;
          totalCost += (parseFloat(batch.qty_remaining) || 0) * (parseFloat(batch.unit_cost_net) || 0);
        });

        const avgCost = totalQty > 0 ? totalCost / totalQty : 0;

        return {
          ...product,
          stock_qty: totalQty,
          avg_cost: avgCost,
        };
      })
    );

    setProducts(productsWithStock);
    setLoading(false);
  };

  const handleAdjust = (product: ProductWithStock, type: 'add' | 'remove') => {
    setSelectedProduct(product);
    setAdjustmentType(type);
    setAdjustmentQty('');
    setAdjustmentNote('');
    setShowAdjustDialog(true);
  };

  const handleSaveAdjustment = async () => {
    if (!selectedProduct || !adjustmentQty) return;

    const qty = parseFloat(adjustmentQty);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Podaj prawidłową ilość');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const direction = adjustmentType === 'add' ? 'in' : 'out';
    const finalQty = adjustmentType === 'remove' ? -qty : qty;

    // Create movement record
    const { error: movementError } = await (supabase as any)
      .from('inventory_movements')
      .insert({
        product_id: selectedProduct.id,
        direction: direction === 'in' ? 'adjust' : 'adjust',
        qty: finalQty,
        source_type: 'manual_adjust',
        note: adjustmentNote || `Korekta ręczna: ${adjustmentType === 'add' ? '+' : '-'}${qty}`,
        created_by: user.id,
      });

    if (movementError) {
      console.error('Error creating movement:', movementError);
      toast.error('Błąd zapisywania korekty');
      return;
    }

    // If adding, create a new batch
    if (adjustmentType === 'add') {
      await (supabase as any)
        .from('inventory_batches')
        .insert({
          product_id: selectedProduct.id,
          qty_in: qty,
          qty_remaining: qty,
          unit_cost_net: selectedProduct.avg_cost || 0,
        });
    } else {
      // If removing, reduce from existing batches (FIFO)
      let remainingToRemove = qty;
      const { data: batches } = await (supabase as any)
        .from('inventory_batches')
        .select('id, qty_remaining')
        .eq('product_id', selectedProduct.id)
        .gt('qty_remaining', 0)
        .order('received_at', { ascending: true });

      for (const batch of (batches || [])) {
        if (remainingToRemove <= 0) break;
        
        const toRemove = Math.min(remainingToRemove, parseFloat(batch.qty_remaining));
        await (supabase as any)
          .from('inventory_batches')
          .update({ qty_remaining: parseFloat(batch.qty_remaining) - toRemove })
          .eq('id', batch.id);
        
        remainingToRemove -= toRemove;
      }
    }

    toast.success('Korekta została zapisana');
    setShowAdjustDialog(false);
    fetchProductsWithStock();
  };

  const handleShowHistory = async (product: ProductWithStock) => {
    setSelectedProduct(product);
    setHistoryLoading(true);
    setShowHistoryDialog(true);

    const { data, error } = await (supabase as any)
      .from('inventory_movements')
      .select('*')
      .eq('product_id', product.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching movements:', error);
    } else {
      setMovements(data || []);
    }
    
    setHistoryLoading(false);
  };

  const filteredProducts = products.filter(p =>
    p.name_sales.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  );

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
          <CardTitle className="flex items-center gap-2">
            <ArrowUpDown className="h-5 w-5" />
            Stan magazynowy
          </CardTitle>
          <CardDescription>
            Aktualne stany i korekty magazynowe
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Szukaj produktu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Products List */}
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Brak produktów w magazynie</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProducts.map((product) => (
                <div 
                  key={product.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Package className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{product.name_sales}</p>
                      {product.sku && (
                        <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <Badge variant={product.stock_qty > 0 ? 'default' : 'secondary'}>
                          {product.stock_qty.toFixed(2)} {product.unit}
                        </Badge>
                      </div>
                      {product.avg_cost > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Śr. koszt: {product.avg_cost.toFixed(2)} zł
                        </p>
                      )}
                    </div>
                    
                    <div className="flex gap-1">
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => handleAdjust(product, 'add')}
                        title="Dodaj stan"
                      >
                        <Plus className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => handleAdjust(product, 'remove')}
                        title="Zdejmij stan"
                      >
                        <Minus className="h-4 w-4 text-destructive" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleShowHistory(product)}
                        title="Historia ruchów"
                      >
                        <History className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Adjustment Dialog */}
      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjustmentType === 'add' ? 'Dodaj stan' : 'Zdejmij ze stanu'}
            </DialogTitle>
          </DialogHeader>
          
          {selectedProduct && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{selectedProduct.name_sales}</p>
                <p className="text-sm text-muted-foreground">
                  Aktualny stan: {selectedProduct.stock_qty.toFixed(2)} {selectedProduct.unit}
                </p>
              </div>

              <div>
                <Label>Ilość {selectedProduct.unit}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adjustmentQty}
                  onChange={(e) => setAdjustmentQty(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div>
                <Label>Powód korekty</Label>
                <Textarea
                  value={adjustmentNote}
                  onChange={(e) => setAdjustmentNote(e.target.value)}
                  placeholder="np. Zniszczone, Błąd liczenia..."
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustDialog(false)}>
              Anuluj
            </Button>
            <Button 
              onClick={handleSaveAdjustment}
              variant={adjustmentType === 'add' ? 'default' : 'destructive'}
            >
              {adjustmentType === 'add' ? 'Dodaj' : 'Zdejmij'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historia ruchów: {selectedProduct?.name_sales}
            </DialogTitle>
          </DialogHeader>
          
          {historyLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : movements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Brak historii ruchów</p>
            </div>
          ) : (
            <div className="space-y-2">
              {movements.map((m) => (
                <div 
                  key={m.id}
                  className="flex items-center justify-between p-3 border rounded-lg text-sm"
                >
                  <div className="flex items-center gap-3">
                    {m.qty > 0 ? (
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-destructive" />
                    )}
                    <div>
                      <p className="font-medium">
                        {m.qty > 0 ? '+' : ''}{m.qty} {selectedProduct?.unit}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.source_type === 'purchase' && 'Zakup'}
                        {m.source_type === 'sale' && 'Sprzedaż'}
                        {m.source_type === 'stocktaking' && 'Inwentaryzacja'}
                        {m.source_type === 'manual_adjust' && 'Korekta ręczna'}
                        {m.note && ` - ${m.note}`}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(m.created_at).toLocaleDateString('pl-PL')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
