import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Search, Package, Loader2, ShoppingCart, Image as ImageIcon, AlertTriangle, Sparkles } from 'lucide-react';
import { usePartsApi, useCreatePartsOrder, usePartsIntegrations } from '@/hooks/useWorkshopParts';
import { useCreateWorkshopOrderItem } from '@/hooks/useWorkshop';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  orderId: string;
  vehicleName?: string;
  vehicleVin?: string;
  initialSearch?: string;
  margin?: number;
}

interface SearchResult {
  id: string;
  code: string;
  name: string;
  manufacturer: string;
  supplier: string;
  supplierCode: string;
  purchasePriceNet: number;
  sellingPriceGross: number;
  suggestedPrice: number | null;
  isSuggested: boolean;
  availability: 'today' | 'tomorrow' | '2-3days' | 'unavailable';
  deliveryTime: string;
  imageUrl: string | null;
  selected: boolean;
  quantity: number;
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
  open, onOpenChange, providerId, orderId, vehicleName, vehicleVin, initialSearch, margin = 30,
}: Props) {
  const [query, setQuery] = useState(initialSearch || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOrdering, setIsOrdering] = useState(false);
  const [hoveredImage, setHoveredImage] = useState<string | null>(null);
  const partsApi = usePartsApi();
  const createPartsOrder = useCreatePartsOrder();
  const createOrderItem = useCreateWorkshopOrderItem();
  const { data: integrations = [] } = usePartsIntegrations(providerId);

  useEffect(() => {
    if (open && initialSearch) setQuery(initialSearch);
  }, [open, initialSearch]);

  const enabledIntegrations = (integrations as any[]).filter((i: any) => i.is_enabled && i.api_username);

  const handleSearch = async () => {
    if (!query.trim()) return;
    if (enabledIntegrations.length === 0) {
      toast.error('Brak skonfigurowanych hurtowni. Przejdź do Ustawienia → Integracje z hurtowniami.');
      return;
    }

    setIsSearching(true);
    setResults([]);

    try {
      // Search across all enabled wholesalers in parallel
      const searchPromises = enabledIntegrations.map(async (integration: any) => {
        try {
          const res = await partsApi.mutateAsync({
            action: 'search',
            provider_id: providerId,
            supplier_code: integration.supplier_code,
            params: { query: query.trim(), vin: vehicleVin || undefined },
          });

          const items = Array.isArray(res.results) ? res.results :
            res.results?.items || res.results?.products || res.results?.data || [];

          const supplierMargin = integration.sales_margin_percent || margin;
          const supplierName = integration.supplier_name || integration.supplier_code;

          return items.map((item: any, idx: number) => {
            const priceNet = item.price?.net || item.priceNet || item.price || 0;
            const avail = parseAvailability(item);
            const sellingGross = priceNet > 0 
              ? Math.round(priceNet * (1 + supplierMargin / 100) * 1.23 * 100) / 100 
              : 0;

            return {
              id: `${integration.supplier_code}-${item.hartCode || item.code || item.id || idx}`,
              code: item.hartCode || item.code || item.catalogNumber || '',
              name: item.name || item.description || item.productName || '',
              manufacturer: item.manufacturer?.name || item.manufacturer || item.brand || item.producerName || '',
              supplier: supplierName,
              supplierCode: integration.supplier_code,
              purchasePriceNet: priceNet,
              sellingPriceGross: sellingGross,
              suggestedPrice: null,
              isSuggested: priceNet === 0,
              availability: avail,
              deliveryTime: item.deliveryTime || (avail === 'today' ? 'Dziś' : avail === 'tomorrow' ? 'Jutro' : '2-3 dni'),
              imageUrl: item.imageUrl || item.image || item.photoUrl || item.thumbnailUrl || null,
              selected: false,
              quantity: 1,
            } as SearchResult;
          });
        } catch (err: any) {
          console.warn(`Search failed for ${integration.supplier_code}:`, err.message);
          return [];
        }
      });

      const allResults = await Promise.allSettled(searchPromises);
      const mergedResults: SearchResult[] = [];
      
      for (const result of allResults) {
        if (result.status === 'fulfilled') {
          mergedResults.push(...result.value);
        }
      }

      // Calculate AI suggested prices for items missing prices
      const itemsWithPrices = mergedResults.filter(r => r.purchasePriceNet > 0);
      const itemsWithoutPrices = mergedResults.filter(r => r.purchasePriceNet === 0);

      if (itemsWithoutPrices.length > 0 && itemsWithPrices.length > 0) {
        // Find similar items and suggest prices based on other wholesalers
        for (const item of itemsWithoutPrices) {
          const similar = itemsWithPrices.find(p => 
            p.name.toLowerCase().includes(item.name.toLowerCase().split(' ')[0]) ||
            (p.code && item.code && p.code === item.code)
          );
          if (similar) {
            item.suggestedPrice = similar.sellingPriceGross;
            item.sellingPriceGross = similar.sellingPriceGross;
            item.purchasePriceNet = similar.purchasePriceNet;
          }
        }
      }

      // Sort: available first, then by price
      mergedResults.sort((a, b) => {
        const availOrder = { today: 0, tomorrow: 1, '2-3days': 2, unavailable: 3 };
        const diff = availOrder[a.availability] - availOrder[b.availability];
        if (diff !== 0) return diff;
        return a.purchasePriceNet - b.purchasePriceNet;
      });

      setResults(mergedResults);
      if (mergedResults.length === 0) toast.info('Brak wyników dla tego zapytania');
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

  const updateQuantity = (id: string, qty: number) => {
    setResults(prev => prev.map(r => r.id === id ? { ...r, quantity: Math.max(1, qty) } : r));
  };

  const toggleAll = () => {
    const availableResults = results.filter(r => r.availability !== 'unavailable');
    const allSelected = availableResults.every(r => r.selected);
    setResults(prev => prev.map(r => r.availability === 'unavailable' ? r : { ...r, selected: !allSelected }));
  };

  const selected = results.filter(r => r.selected);
  const totalPurchase = selected.reduce((s, r) => s + r.purchasePriceNet * r.quantity, 0);
  const totalSelling = selected.reduce((s, r) => s + r.sellingPriceGross * r.quantity, 0);

  // Group selected by supplier for ordering
  const handleOrder = async () => {
    if (selected.length === 0) return;
    setIsOrdering(true);
    try {
      // Group by supplier
      const bySupplier: Record<string, SearchResult[]> = {};
      for (const s of selected) {
        if (!bySupplier[s.supplierCode]) bySupplier[s.supplierCode] = [];
        bySupplier[s.supplierCode].push(s);
      }

      for (const [supplierCode, items] of Object.entries(bySupplier)) {
        const positions = items.map(s => ({ hartCode: s.code, code: s.code, quantity: s.quantity }));

        let supplierOrderId = '';
        try {
          const basketRes = await partsApi.mutateAsync({
            action: 'add_to_basket',
            provider_id: providerId,
            supplier_code: supplierCode,
            params: { positions },
          });

          const basketIds = basketRes.basket?.positions?.map((p: any) => p.id) ||
            basketRes.basket?.basketPositionIds || [];

          if (basketIds.length > 0) {
            const orderRes = await partsApi.mutateAsync({
              action: 'place_order',
              provider_id: providerId,
              supplier_code: supplierCode,
              params: { basketPositionIds: basketIds },
            });
            supplierOrderId = orderRes.order?.orderId || orderRes.order?.id || '';
          }
        } catch (apiErr: any) {
          console.warn(`Order API failed for ${supplierCode}, saving locally:`, apiErr.message);
        }

        const orderItems = items.map(s => ({
          supplier_code: supplierCode,
          product_code: s.code,
          product_name: s.name,
          manufacturer: s.manufacturer,
          quantity: s.quantity,
          purchase_price_net: s.purchasePriceNet,
          selling_price_gross: s.sellingPriceGross,
          availability: s.availability,
          delivery_time: s.deliveryTime,
        }));

        const supplierPurchase = items.reduce((sum, s) => sum + s.purchasePriceNet * s.quantity, 0);
        const supplierSelling = items.reduce((sum, s) => sum + s.sellingPriceGross * s.quantity, 0);

        await createPartsOrder.mutateAsync({
          order: {
            provider_id: providerId,
            order_id: orderId,
            supplier_code: supplierCode,
            supplier_order_id: supplierOrderId,
            status: 'ordered',
            total_net: supplierPurchase,
            total_gross: supplierSelling,
          },
          items: orderItems,
        });

        // Add items to workshop order
        for (const s of items) {
          const priceGross = s.sellingPriceGross;
          const priceNet = Math.round(priceGross / 1.23 * 100) / 100;
          await createOrderItem.mutateAsync({
            order_id: orderId,
            item_type: 'part',
            name: `${s.name} (${s.manufacturer}) [${s.supplier}]`,
            unit: 'szt',
            quantity: s.quantity,
            unit_price_gross: priceGross,
            unit_price_net: priceNet,
            unit_cost_net: s.purchasePriceNet,
            unit_cost_gross: Math.round(s.purchasePriceNet * 1.23 * 100) / 100,
            discount_percent: 0,
            total_gross: priceGross * s.quantity,
            total_net: priceNet * s.quantity,
          });
        }
      }

      const supplierCount = Object.keys(bySupplier).length;
      toast.success(`Zamówiono ${selected.length} pozycji z ${supplierCount} hurtowni!`);
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

  // Get unique suppliers in results
  const suppliersInResults = [...new Set(results.map(r => r.supplier))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Rido Parts — Wyszukaj i zamów części
          </DialogTitle>
          <DialogDescription className="flex items-center gap-3">
            {vehicleName && <span>🚗 {vehicleName}</span>}
            {vehicleVin && <span className="text-xs font-mono">VIN: {vehicleVin}</span>}
            <span className="text-xs">
              Aktywne hurtownie: {enabledIntegrations.map((i: any) => i.supplier_name || i.supplier_code).join(', ') || 'brak'}
            </span>
          </DialogDescription>
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

        {/* Results info */}
        {results.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span>Znaleziono: <strong className="text-foreground">{results.length}</strong> wyników</span>
            {suppliersInResults.map(s => (
              <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
            ))}
          </div>
        )}

        {/* Results table */}
        <div className="flex-1 overflow-auto min-h-0">
          {isSearching && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Przeszukuję {enabledIntegrations.length} hurtowni...</p>
            </div>
          )}

          {!isSearching && results.length > 0 ? (
            <TooltipProvider>
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
                    <th className="p-2 w-12 text-center font-medium text-muted-foreground">Foto</th>
                    <th className="p-2 text-left font-medium text-muted-foreground">Nazwa towaru</th>
                    <th className="p-2 text-left font-medium text-muted-foreground w-24">Producent</th>
                    <th className="p-2 text-left font-medium text-muted-foreground w-24">Hurtownia</th>
                    <th className="p-2 text-center font-medium text-muted-foreground w-16">Szt.</th>
                    <th className="p-2 text-right font-medium text-muted-foreground w-24">Hurt netto</th>
                    <th className="p-2 text-right font-medium text-muted-foreground w-28">Detal brutto</th>
                    <th className="p-2 text-center font-medium text-muted-foreground w-20">Dostępn.</th>
                    <th className="p-2 text-center font-medium text-muted-foreground w-20">Dostawa</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b hover:bg-accent/30 transition-colors cursor-pointer ${r.availability === 'unavailable' ? 'opacity-40' : ''} ${r.selected ? 'bg-primary/5' : ''}`}
                      onClick={() => toggleSelect(r.id)}
                    >
                      <td className="p-2">
                        <Checkbox
                          checked={r.selected}
                          disabled={r.availability === 'unavailable'}
                          onCheckedChange={() => toggleSelect(r.id)}
                        />
                      </td>
                      <td className="p-2 text-center">
                        {r.imageUrl ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="w-8 h-8 rounded border overflow-hidden mx-auto cursor-zoom-in"
                                onMouseEnter={() => setHoveredImage(r.imageUrl)}
                                onMouseLeave={() => setHoveredImage(null)}
                              >
                                <img src={r.imageUrl} alt={r.name} className="w-full h-full object-cover" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="p-0">
                              <img src={r.imageUrl} alt={r.name} className="w-48 h-48 object-contain rounded" />
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <div className="w-8 h-8 rounded border bg-muted/50 flex items-center justify-center mx-auto">
                            <ImageIcon className="h-3 w-3 text-muted-foreground/50" />
                          </div>
                        )}
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
                      <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                        <Input
                          type="number"
                          min={1}
                          value={r.quantity}
                          onChange={e => updateQuantity(r.id, Number(e.target.value))}
                          className="w-12 h-6 text-center text-xs p-0"
                        />
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {r.purchasePriceNet > 0 ? (
                          <span>{fmt(r.purchasePriceNet)} zł</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {r.isSuggested && r.suggestedPrice ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 justify-end">
                                <Sparkles className="h-3 w-3" />
                                ~{fmt(r.suggestedPrice)} zł
                                <span className="text-[8px]">sugestia</span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">
                                <AlertTriangle className="h-3 w-3 inline mr-1 text-yellow-500" />
                                Cena sugerowana na podstawie innych hurtowni. Sprawdź i zmień jeśli potrzeba.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        ) : r.sellingPriceGross > 0 ? (
                          <span className="font-semibold">{fmt(r.sellingPriceGross)} zł</span>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 justify-end">
                                <AlertTriangle className="h-3 w-3" />
                                brak ceny
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Hurtownia nie podała ceny. Wpisz ręcznie po zamówieniu.</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className={`w-2.5 h-2.5 rounded-full ${availabilityColors[r.availability]}`} />
                          <span className="text-[10px]">{availabilityLabels[r.availability]}</span>
                        </div>
                      </td>
                      <td className="p-2 text-center text-muted-foreground text-[10px]">{r.deliveryTime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TooltipProvider>
          ) : !isSearching && results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Search className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-sm">Wpisz nazwę części i kliknij Szukaj</p>
              <p className="text-xs mt-1">Przeszukamy {enabledIntegrations.length} podłączonych hurtowni jednocześnie</p>
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
                <span className="text-muted-foreground text-xs">
                  (z {[...new Set(selected.map(s => s.supplier))].length} hurtowni)
                </span>
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
