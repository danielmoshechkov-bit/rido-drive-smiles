import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  ClipboardList, 
  Plus, 
  Download,
  CheckCircle,
  Loader2,
  Package,
  FileSpreadsheet
} from 'lucide-react';

interface StocktakingItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku?: string;
  unit: string;
  system_qty: number;
  counted_qty: number | null;
  diff_qty: number | null;
  applied: boolean;
}

interface Stocktaking {
  id: string;
  name?: string;
  status: string;
  created_at: string;
  items?: StocktakingItem[];
}

interface Props {
  entityId?: string;
}

export function InventoryStocktaking({ entityId }: Props) {
  const [stocktakings, setStocktakings] = useState<Stocktaking[]>([]);
  const [activeStocktaking, setActiveStocktaking] = useState<Stocktaking | null>(null);
  const [items, setItems] = useState<StocktakingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    fetchStocktakings();
  }, [entityId]);

  const fetchStocktakings = async () => {
    setLoading(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await (supabase as any)
      .from('stocktakings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error) {
      setStocktakings(data || []);
    }
    
    setLoading(false);
  };

  const createStocktaking = async () => {
    setCreating(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setCreating(false);
      return;
    }

    // Create stocktaking
    const { data: stocktaking, error: stError } = await (supabase as any)
      .from('stocktakings')
      .insert({
        user_id: user.id,
        entity_id: entityId || null,
        name: `Inwentaryzacja ${new Date().toLocaleDateString('pl-PL')}`,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (stError) {
      console.error('Error creating stocktaking:', stError);
      toast.error('Błąd tworzenia inwentaryzacji');
      setCreating(false);
      return;
    }

    // Fetch all products with current stock
    let query = (supabase as any)
      .from('inventory_products')
      .select('id, name_sales, sku, unit')
      .eq('is_active', true);

    if (entityId) {
      query = query.eq('entity_id', entityId);
    } else {
      query = query.eq('user_id', user.id);
    }

    const { data: products } = await query;

    // For each product, calculate stock and create item
    const stocktakingItems: StocktakingItem[] = [];
    
    for (const product of (products || [])) {
      const { data: batches } = await (supabase as any)
        .from('inventory_batches')
        .select('qty_remaining')
        .eq('product_id', product.id);

      const systemQty = (batches || []).reduce((sum: number, b: any) => 
        sum + (parseFloat(b.qty_remaining) || 0), 0
      );

      const { data: item } = await (supabase as any)
        .from('stocktaking_items')
        .insert({
          stocktaking_id: stocktaking.id,
          product_id: product.id,
          system_qty: systemQty,
          counted_qty: null,
          diff_qty: null,
        })
        .select()
        .single();

      if (item) {
        stocktakingItems.push({
          ...item,
          product_name: product.name_sales,
          product_sku: product.sku,
          unit: product.unit,
        });
      }
    }

    setActiveStocktaking(stocktaking);
    setItems(stocktakingItems);
    setCreating(false);
    toast.success('Inwentaryzacja utworzona. Wpisz stany faktyczne.');
  };

  const loadStocktaking = async (st: Stocktaking) => {
    setLoading(true);
    
    const { data: itemsData } = await (supabase as any)
      .from('stocktaking_items')
      .select(`
        *,
        inventory_products (
          name_sales,
          sku,
          unit
        )
      `)
      .eq('stocktaking_id', st.id);

    const mappedItems: StocktakingItem[] = (itemsData || []).map((item: any) => ({
      id: item.id,
      product_id: item.product_id,
      product_name: item.inventory_products?.name_sales || 'Nieznany',
      product_sku: item.inventory_products?.sku,
      unit: item.inventory_products?.unit || 'szt.',
      system_qty: item.system_qty,
      counted_qty: item.counted_qty,
      diff_qty: item.diff_qty,
      applied: item.applied,
    }));

    setActiveStocktaking(st);
    setItems(mappedItems);
    setLoading(false);
  };

  const updateCountedQty = async (itemId: string, value: string) => {
    const counted = parseFloat(value);
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const diff = isNaN(counted) ? null : counted - item.system_qty;

    await (supabase as any)
      .from('stocktaking_items')
      .update({ 
        counted_qty: isNaN(counted) ? null : counted,
        diff_qty: diff,
      })
      .eq('id', itemId);

    setItems(prev => prev.map(i => 
      i.id === itemId ? { ...i, counted_qty: isNaN(counted) ? null : counted, diff_qty: diff } : i
    ));
  };

  const applyCorrections = async () => {
    if (!activeStocktaking) return;
    
    setApplying(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setApplying(false);
      return;
    }

    const itemsWithDiff = items.filter(i => i.diff_qty !== null && i.diff_qty !== 0 && !i.applied);

    for (const item of itemsWithDiff) {
      // Create adjustment movement
      await (supabase as any)
        .from('inventory_movements')
        .insert({
          product_id: item.product_id,
          direction: 'adjust',
          qty: item.diff_qty,
          source_type: 'stocktaking',
          source_id: activeStocktaking.id,
          note: `Inwentaryzacja: różnica ${item.diff_qty! > 0 ? '+' : ''}${item.diff_qty}`,
          created_by: user.id,
        });

      // Adjust batches
      if (item.diff_qty! > 0) {
        // Add to stock
        await (supabase as any)
          .from('inventory_batches')
          .insert({
            product_id: item.product_id,
            qty_in: item.diff_qty,
            qty_remaining: item.diff_qty,
            unit_cost_net: 0,
          });
      } else {
        // Remove from stock (FIFO)
        let toRemove = Math.abs(item.diff_qty!);
        const { data: batches } = await (supabase as any)
          .from('inventory_batches')
          .select('id, qty_remaining')
          .eq('product_id', item.product_id)
          .gt('qty_remaining', 0)
          .order('received_at', { ascending: true });

        for (const batch of (batches || [])) {
          if (toRemove <= 0) break;
          const remove = Math.min(toRemove, parseFloat(batch.qty_remaining));
          await (supabase as any)
            .from('inventory_batches')
            .update({ qty_remaining: parseFloat(batch.qty_remaining) - remove })
            .eq('id', batch.id);
          toRemove -= remove;
        }
      }

      // Mark item as applied
      await (supabase as any)
        .from('stocktaking_items')
        .update({ applied: true, applied_at: new Date().toISOString() })
        .eq('id', item.id);
    }

    // Complete stocktaking
    await (supabase as any)
      .from('stocktakings')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', activeStocktaking.id);

    toast.success('Korekty zostały zastosowane');
    setActiveStocktaking(null);
    setItems([]);
    fetchStocktakings();
    setApplying(false);
  };

  const exportToPDF = () => {
    // Generate simple HTML for printing
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Inwentaryzacja ${activeStocktaking?.name || ''}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { font-size: 18px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background: #f0f0f0; }
          .counted { width: 100px; }
        </style>
      </head>
      <body>
        <h1>Inwentaryzacja: ${activeStocktaking?.name || 'Bez nazwy'}</h1>
        <p>Data: ${new Date().toLocaleDateString('pl-PL')}</p>
        <table>
          <thead>
            <tr>
              <th>Lp.</th>
              <th>Nazwa produktu</th>
              <th>SKU</th>
              <th>Jednostka</th>
              <th>Stan systemowy</th>
              <th class="counted">Stan faktyczny</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${item.product_name}</td>
                <td>${item.product_sku || '-'}</td>
                <td>${item.unit}</td>
                <td>${item.system_qty.toFixed(2)}</td>
                <td></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  };

  if (loading && !activeStocktaking) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  // Active stocktaking view
  if (activeStocktaking) {
    const itemsWithDiff = items.filter(i => i.diff_qty !== null && i.diff_qty !== 0);
    
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                {activeStocktaking.name}
              </CardTitle>
              <CardDescription>
                Wpisz stany faktyczne dla każdego produktu
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportToPDF}>
                <Download className="h-4 w-4 mr-2" />
                Drukuj listę
              </Button>
              {activeStocktaking.status !== 'completed' && itemsWithDiff.length > 0 && (
                <Button onClick={applyCorrections} disabled={applying}>
                  {applying ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Zastosuj korekty ({itemsWithDiff.length})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div 
                key={item.id}
                className={`flex items-center justify-between p-3 border rounded-lg ${
                  item.diff_qty && item.diff_qty !== 0 
                    ? item.diff_qty > 0 
                      ? 'border-green-200 bg-green-50' 
                      : 'border-red-200 bg-red-50'
                    : ''
                }`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-sm text-muted-foreground w-8">{index + 1}.</span>
                  <div className="flex-1">
                    <p className="font-medium">{item.product_name}</p>
                    {item.product_sku && (
                      <p className="text-xs text-muted-foreground">SKU: {item.product_sku}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">System</p>
                    <p className="font-medium">{item.system_qty.toFixed(2)} {item.unit}</p>
                  </div>
                  
                  <div className="w-24">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Faktycznie"
                      value={item.counted_qty ?? ''}
                      onChange={(e) => updateCountedQty(item.id, e.target.value)}
                      disabled={item.applied}
                      className="text-center"
                    />
                  </div>
                  
                  {item.diff_qty !== null && item.diff_qty !== 0 && (
                    <Badge variant={item.diff_qty > 0 ? 'default' : 'destructive'}>
                      {item.diff_qty > 0 ? '+' : ''}{item.diff_qty.toFixed(2)}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // List view
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Inwentaryzacja
            </CardTitle>
            <CardDescription>
              Sprawdź stany faktyczne i wyrównaj różnice
            </CardDescription>
          </div>
          <Button onClick={createStocktaking} disabled={creating}>
            {creating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Nowa inwentaryzacja
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {stocktakings.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">Brak inwentaryzacji</p>
            <p className="text-sm mt-1">Utwórz pierwszą inwentaryzację magazynu</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stocktakings.map((st) => (
              <div 
                key={st.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => loadStocktaking(st)}
              >
                <div>
                  <p className="font-medium">{st.name || 'Inwentaryzacja'}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(st.created_at).toLocaleDateString('pl-PL')}
                  </p>
                </div>
                <Badge variant={st.status === 'completed' ? 'default' : 'secondary'}>
                  {st.status === 'draft' && 'Szkic'}
                  {st.status === 'in_progress' && 'W trakcie'}
                  {st.status === 'completed' && 'Zakończona'}
                  {st.status === 'cancelled' && 'Anulowana'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
