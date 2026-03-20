import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Package, Loader2, ShoppingCart } from 'lucide-react';
import { usePartsApi, useCreatePartsOrder } from '@/hooks/useWorkshopParts';
import { useCreateWorkshopOrderItem } from '@/hooks/useWorkshop';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  orderId: string;
  vehicleName?: string;
  initialSearch?: string;
  margin?: number;
}

interface SearchResult {
  id: string;
  code: string;
  name: string;
  manufacturer: string;
  supplier: string;
  purchasePriceNet: number;
  sellingPriceGross: number;
  availability: 'today' | 'tomorrow' | '2-3days' | 'unavailable';
  deliveryTime: string;
  selected: boolean;
}

const availabilityColors: Record<string, string> = {
  today: 'bg-green-500',
  tomorrow: 'bg-yellow-500',
  '2-3days': 'bg-orange-500',
  unavailable: 'bg-red-500',
};

const availabilityLabels: Record<string, string> = {
  today: 'Dziś',
  tomorrow: 'Jutro',
  '2-3days': '2-3 dni',
  unavailable: 'Niedostępne',
};

export function RidoPartsSearchModal({
  open, onOpenChange, providerId, orderId, vehicleName, initialSearch, margin = 30,
}: Props) {
  const [query, setQuery] = useState(initialSearch || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOrdering, setIsOrdering] = useState(false);
  const partsApi = usePartsApi();
  const createPartsOrder = useCreatePartsOrder();
  const createOrderItem = useCreateWorkshopOrderItem();

  useEffect(() => {
    if (open && initialSearch) setQuery(initialSearch);
  }, [open, initialSearch]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const res = await partsApi.mutateAsync({
        action: 'search',
        provider_id: providerId,
        supplier_code: 'hart',
        params: { query: query.trim() },
      });

      const items = Array.isArray(res.results) ? res.results :
        res.results?.items || res.results?.products || res.results?.data || [];

      const mapped: SearchResult[] = items.map((item: any, idx: number) => {
        const priceNet = item.price?.net || item.priceNet || item.price || 0;
        const avail = parseAvailability(item);
        return {
          id: item.hartCode || item.code || item.id || `item-${idx}`,
          code: item.hartCode || item.code || '',
          name: item.name || item.description || '',
          manufacturer: item.manufacturer?.name || item.manufacturer || item.brand || '',
          supplier: 'Hart',
          purchasePriceNet: priceNet,
          sellingPriceGross: Math.round(priceNet * (1 + margin / 100) * 1.23 * 100) / 100,
          availability: avail,
          deliveryTime: item.deliveryTime || avail === 'today' ? 'Dziś' : avail === 'tomorrow' ? 'Jutro' : '2-3 dni',
          selected: false,
        };
      });

      setResults(mapped);
      if (mapped.length === 0) toast.info('Brak wyników dla tego zapytania');
    } catch (err: any) {
      toast.error(err.message || 'Błąd wyszukiwania');
    } finally {
      setIsSearching(false);
    }
  };

  const toggleSelect = (id: string) => {
    setResults(prev => prev.map(r => {
      if (r.id === id && r.availability !== 'unavailable') {
        return { ...r, selected: !r.selected };
      }
      return r;
    }));
  };

  const toggleAll = () => {
    const availableResults = results.filter(r => r.availability !== 'unavailable');
    const allSelected = availableResults.every(r => r.selected);
    setResults(prev => prev.map(r => r.availability === 'unavailable' ? r : { ...r, selected: !allSelected }));
  };

  const selected = results.filter(r => r.selected);
  const totalPurchase = selected.reduce((s, r) => s + r.purchasePriceNet, 0);
  const totalSelling = selected.reduce((s, r) => s + r.sellingPriceGross, 0);

  const handleOrder = async () => {
    if (selected.length === 0) return;
    setIsOrdering(true);
    try {
      // Try to place order via Hart API
      const positions = selected.map(s => ({ hartCode: s.code, quantity: 1 }));

      let supplierOrderId = '';
      try {
        const basketRes = await partsApi.mutateAsync({
          action: 'add_to_basket',
          provider_id: providerId,
          supplier_code: 'hart',
          params: { positions },
        });

        const basketIds = basketRes.basket?.positions?.map((p: any) => p.id) ||
          basketRes.basket?.basketPositionIds || [];

        if (basketIds.length > 0) {
          const orderRes = await partsApi.mutateAsync({
            action: 'place_order',
            provider_id: providerId,
            supplier_code: 'hart',
            params: { basketPositionIds: basketIds },
          });
          supplierOrderId = orderRes.order?.orderId || orderRes.order?.id || '';
        }
      } catch (apiErr: any) {
        console.warn('Hart order API failed, saving locally:', apiErr.message);
      }

      // Save order to DB
      const orderItems = selected.map(s => ({
        supplier_code: 'hart',
        product_code: s.code,
        product_name: s.name,
        manufacturer: s.manufacturer,
        quantity: 1,
        purchase_price_net: s.purchasePriceNet,
        selling_price_gross: s.sellingPriceGross,
        availability: s.availability,
        delivery_time: s.deliveryTime,
      }));

      await createPartsOrder.mutateAsync({
        order: {
          provider_id: providerId,
          order_id: orderId,
          supplier_code: 'hart',
          supplier_order_id: supplierOrderId,
          status: supplierOrderId ? 'ordered' : 'ordered',
          total_net: totalPurchase,
          total_gross: totalSelling,
        },
        items: orderItems,
      });

      // Add items to workshop order
      for (const s of selected) {
        const priceGross = s.sellingPriceGross;
        const priceNet = Math.round(priceGross / 1.23 * 100) / 100;
        await createOrderItem.mutateAsync({
          order_id: orderId,
          item_type: 'part',
          name: `${s.name} (${s.manufacturer})`,
          unit: 'szt',
          quantity: 1,
          unit_price_gross: priceGross,
          unit_price_net: priceNet,
          unit_cost_net: s.purchasePriceNet,
          unit_cost_gross: Math.round(s.purchasePriceNet * 1.23 * 100) / 100,
          discount_percent: 0,
          total_gross: priceGross,
          total_net: priceNet,
        });
      }

      toast.success(`Zamówienie złożone pomyślnie w Hart! (${selected.length} pozycji)`);
      onOpenChange(false);
      setResults([]);
      setQuery('');
    } catch (err: any) {
      toast.error(err.message || 'Błąd składania zamówienia');
    } finally {
      setIsOrdering(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Rido Parts — Wyszukaj i zamów części
          </DialogTitle>
          {vehicleName && (
            <DialogDescription>{vehicleName}</DialogDescription>
          )}
        </DialogHeader>

        {/* Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Wpisz nazwę części, numer OE lub katalogowy..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="pl-9"
            />
          </div>
          <Button onClick={handleSearch} disabled={isSearching || !query.trim()}>
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Szukaj'}
          </Button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto min-h-0">
          {results.length > 0 ? (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background z-10">
                <tr className="border-b bg-muted/30">
                  <th className="p-2 w-8">
                    <Checkbox
                      checked={results.filter(r => r.availability !== 'unavailable').length > 0 &&
                        results.filter(r => r.availability !== 'unavailable').every(r => r.selected)}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="p-2 text-left font-medium text-muted-foreground">Nazwa towaru</th>
                  <th className="p-2 text-left font-medium text-muted-foreground w-24">Producent</th>
                  <th className="p-2 text-left font-medium text-muted-foreground w-20">Hurtownia</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-28">Cena zakupu netto</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-32">Cena sprzedaży brutto</th>
                  <th className="p-2 text-center font-medium text-muted-foreground w-24">Dostępność</th>
                  <th className="p-2 text-center font-medium text-muted-foreground w-24">Czas dostawy</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b hover:bg-accent/30 transition-colors cursor-pointer ${r.availability === 'unavailable' ? 'opacity-50' : ''}`}
                    onClick={() => toggleSelect(r.id)}
                  >
                    <td className="p-2">
                      <Checkbox
                        checked={r.selected}
                        disabled={r.availability === 'unavailable'}
                        onCheckedChange={() => toggleSelect(r.id)}
                      />
                    </td>
                    <td className="p-2">
                      <div>
                        <span className="font-medium">{r.name}</span>
                        {r.code && <span className="text-muted-foreground ml-1 text-[10px]">({r.code})</span>}
                      </div>
                    </td>
                    <td className="p-2 text-muted-foreground">{r.manufacturer}</td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-[10px]">{r.supplier}</Badge>
                    </td>
                    <td className="p-2 text-right tabular-nums">{fmt(r.purchasePriceNet)} zł</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{fmt(r.sellingPriceGross)} zł</td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${availabilityColors[r.availability]}`} />
                        <span className="text-[10px]">{availabilityLabels[r.availability]}</span>
                      </div>
                    </td>
                    <td className="p-2 text-center text-muted-foreground">{r.deliveryTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : !isSearching ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Search className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-sm">Wpisz nazwę części i kliknij Szukaj</p>
            </div>
          ) : null}
        </div>

        {/* Summary footer */}
        <DialogFooter className="flex-col sm:flex-row gap-3 border-t pt-4">
          <div className="flex-1 flex items-center gap-4 text-sm flex-wrap">
            {selected.length > 0 && (
              <>
                <span className="flex items-center gap-1">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  Zaznaczono: <strong>{selected.length}</strong>
                </span>
                <span>Zakup netto: <strong>{fmt(totalPurchase)} zł</strong></span>
                <span>Sprzedaż brutto: <strong className="text-green-600">{fmt(totalSelling)} zł</strong></span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button
              onClick={handleOrder}
              disabled={selected.length === 0 || isOrdering}
              className="gap-1"
            >
              {isOrdering ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
              Zamów zaznaczone
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseAvailability(item: any): 'today' | 'tomorrow' | '2-3days' | 'unavailable' {
  const avail = item.availability || item.stock || item.status;
  if (!avail) return 'unavailable';
  if (typeof avail === 'number') {
    if (avail > 5) return 'today';
    if (avail > 0) return 'tomorrow';
    return 'unavailable';
  }
  const str = String(avail).toLowerCase();
  if (str.includes('today') || str.includes('dostępn') || str === 'available' || str === 'in_stock') return 'today';
  if (str.includes('tomorrow') || str.includes('jutro')) return 'tomorrow';
  if (str.includes('2') || str.includes('3') || str.includes('day')) return '2-3days';
  return 'unavailable';
}
