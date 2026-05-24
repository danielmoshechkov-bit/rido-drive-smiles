import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Search, Package, Loader2, ShoppingCart, Image as ImageIcon, AlertTriangle, Sparkles, SearchX, Bot, ArrowLeft, CheckCircle2, XCircle, Wrench, Copy } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { usePartsApi, useCreatePartsOrder, usePartsIntegrations, useIcCatalogSync, useIcCatalogIntegration } from '@/hooks/useWorkshopParts';
import { useCreateWorkshopOrderItem } from '@/hooks/useWorkshop';
import { getConfiguredPartsIntegrations } from './partsIntegrationUtils';
import { toast } from 'sonner';

interface IcCatalogItem {
  ic_sku: string;
  ic_index: string | null;
  ic_tecdoc_id: string | null;
  name: string;
  manufacturer: string | null;
  oe_number: string | null;
  category_label: string | null;
  image_url?: string | null;
}

function normalizePartsSearchQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\bwachzae\b/g, 'wahacz')
    .replace(/\bwachacz\b/g, 'wahacz')
    .replace(/\bwachacze\b/g, 'wahacz')
    .replace(/\bwahacze\b/g, 'wahacz')
    .replace(/\bwachlacz\b/g, 'wahacz')
    .replace(/\brpzednie\b/g, 'przedni')
    .replace(/\brpzedni\b/g, 'przedni')
    .replace(/\bprzednie\b/g, 'przedni')
    .replace(/\btylnie\b/g, 'tylny')
    .replace(/\blewe\b/g, 'lewy')
    .replace(/\bprawe\b/g, 'prawy');
}

// ─── Search suggestions map ───
const SUGGESTIONS_MAP: Record<string, string[]> = {
  'wachacz': ['wahacz przedni lewy kompletny', 'wahacz przedni prawy kompletny', 'wahacz tylny lewy', 'wahacz tylny prawy'],
  'wahacz': ['wahacz przedni lewy kompletny', 'wahacz przedni prawy kompletny', 'wahacz tylny lewy', 'wahacz tylny prawy'],
  'klocki': ['klocki hamulcowe przednie', 'klocki hamulcowe tylne', 'klocki ceramiczne przednie'],
  'klock': ['klocki hamulcowe przednie', 'klocki hamulcowe tylne'],
  'tarcze': ['tarcze hamulcowe przednie', 'tarcze hamulcowe tylne', 'tarcze wentylowane przednie'],
  'tarcza': ['tarcze hamulcowe przednie', 'tarcze hamulcowe tylne'],
  'pasek': ['pasek rozrządu', 'pasek klinowy', 'pasek wielorowkowy'],
  'filtr': ['filtr oleju', 'filtr powietrza', 'filtr kabinowy', 'filtr paliwa'],
  'amortyzator': ['amortyzator przedni lewy', 'amortyzator przedni prawy', 'amortyzator tylny lewy', 'amortyzator tylny prawy'],
  'amortyza': ['amortyzator przedni lewy', 'amortyzator przedni prawy', 'amortyzator tylny'],
  'uszczelka': ['uszczelka pod głowicę', 'zestaw uszczelek głowicy', 'uszczelka pokrywy zaworów'],
  'olej': ['olej silnikowy 5W30', 'olej silnikowy 5W40', 'olej przekładniowy'],
  'świeca': ['świeca zapłonowa', 'świeca żarowa'],
  'swieca': ['świeca zapłonowa', 'świeca żarowa'],
  'sprzęgło': ['tarcza sprzęgła', 'zestaw sprzęgła kompletny', 'docisk sprzęgła'],
  'sprzeglo': ['tarcza sprzęgła', 'zestaw sprzęgła kompletny'],
  'rozrząd': ['zestaw rozrządu', 'zestaw rozrządu z pompą wody', 'pasek rozrządu'],
  'rozrzad': ['zestaw rozrządu', 'zestaw rozrządu z pompą wody'],
  'łożysko': ['łożysko koła przedniego', 'łożysko koła tylnego', 'łożysko oporowe'],
  'lozysko': ['łożysko koła przedniego', 'łożysko koła tylnego'],
  'chłodnica': ['chłodnica silnika', 'chłodnica klimatyzacji'],
  'chlodnica': ['chłodnica silnika', 'chłodnica klimatyzacji'],
  'pompa': ['pompa wody', 'pompa paliwa', 'pompa wspomagania'],
  'alternator': ['alternator', 'regulator alternatora'],
  'rozrusznik': ['rozrusznik', 'bendix rozrusznika'],
  'zawieszenie': ['wahacz przedni', 'drążek kierowniczy', 'końcówka drążka', 'łącznik stabilizatora'],
};

function generateSearchSuggestions(query: string): string[] {
  if (!query || query.trim().length < 3) return [];
  const q = query.trim().toLowerCase();
  for (const [key, suggestions] of Object.entries(SUGGESTIONS_MAP)) {
    if (q.includes(key)) return suggestions;
  }
  return [];
}

// Generate clarification button options from AI question
function generateClarificationButtons(query: string, clarificationQuestion: string): string[] {
  const q = query.trim();
  const cq = clarificationQuestion.toLowerCase();
  const needsSide = cq.includes('lew') || cq.includes('praw') || cq.includes('stron');
  const needsAxle = cq.includes('przód') || cq.includes('tył') || cq.includes('przedn') || cq.includes('tyln');
  const needsHeight = cq.includes('doln') || cq.includes('górn') || cq.includes('gorn');

  if (!needsSide && !needsAxle && !needsHeight) return [];

  const appendIfMissing = (base: string, value: string) => {
    if (!value) return base.trim();
    const normalizedBase = normalizePartsSearchQuery(base);
    const normalizedValue = normalizePartsSearchQuery(value);
    if (normalizedBase.includes(normalizedValue)) return base.trim();
    return `${base} ${value}`.replace(/\s+/g, ' ').trim();
  };

  const sideOptions = needsSide ? ['lewy', 'prawy'] : [''];
  const axleOptions = needsAxle ? ['przedni', 'tylny'] : [''];
  const heightOptions = needsHeight ? ['dolny', 'górny'] : [''];
  const buttons = new Set<string>();

  for (const axle of axleOptions) {
    for (const height of heightOptions) {
      for (const side of sideOptions) {
        let candidate = q;
        candidate = appendIfMissing(candidate, axle);
        candidate = appendIfMissing(candidate, height);
        candidate = appendIfMissing(candidate, side);
        buttons.add(candidate);
      }
    }
  }

  return [...buttons].slice(0, 8);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  orderId: string;
  vehicleName?: string;
  vehicleVin?: string;
  vehicle?: {
    brand?: string;
    model?: string;
    year?: number;
    engine_capacity?: number;
    engine_capacity_cm3?: number;
    engine_power?: number;
    engine_power_kw?: number;
    fuel_type?: string;
  } | null;
  initialSearch?: string;
  margin?: number;
  existingParts?: Array<{ name: string; quantity: number }>;
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
  isCheapest: boolean;
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
  open, onOpenChange, providerId, orderId, vehicleName, vehicleVin, vehicle, initialSearch, margin = 30, existingParts = [],
}: Props) {
  const [query, setQuery] = useState(initialSearch || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchHelp, setSearchHelp] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isOrdering, setIsOrdering] = useState(false);
  const [hoveredImage, setHoveredImage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPartIndex, setCurrentPartIndex] = useState(0);
  const [aiInfo, setAiInfo] = useState<{ partDescription?: string; searchedTerms?: string[]; aiResolved?: boolean } | null>(null);
  const [supplierDiagnostics, setSupplierDiagnostics] = useState<Record<string, { status: 'ok' | 'error' | 'searching'; count: number; message?: string; textFallback?: boolean }>>({});
  // _debug payload — wypełniany tylko dla zalogowanego admina (user_roles.role='admin')
  const [debugData, setDebugData] = useState<any>(null);
  const [debugSheetOpen, setDebugSheetOpen] = useState(false);
  // Click-to-zoom modal dla zdjęć części
  const [zoomedImage, setZoomedImage] = useState<{ url: string; alt: string } | null>(null);
  // Cross-supplier comparison — klik "Porównaj" przy wyniku
  const [crossSupplierData, setCrossSupplierData] = useState<{
    productCode: string;
    manufacturer: string;
    originalItemId: string;
    originalSupplier: string;
    originalSupplierCode: string;
    originalPrice: number;
    originalDelivery: string;
    results: any[];
    loading: boolean;
  } | null>(null);
  const partsApi = usePartsApi();
  const createPartsOrder = useCreatePartsOrder();
  const createOrderItem = useCreateWorkshopOrderItem();
  const icSync = useIcCatalogSync();
  const { data: icIntegration } = useIcCatalogIntegration(providerId);
  const [icCatalogResults, setIcCatalogResults] = useState<IcCatalogItem[]>([]);
  const [icCatalogResultsBackup, setIcCatalogResultsBackup] = useState<IcCatalogItem[]>([]);
  const [selectedIcPart, setSelectedIcPart] = useState<IcCatalogItem | null>(null);
  const { data: integrations = [] } = usePartsIntegrations(providerId);

  useEffect(() => {
    if (open) {
      if (initialSearch) setQuery(initialSearch);
      setSearchHelp(null);
      setAiInfo(null);
      setIcCatalogResults([]);
      setIcCatalogResultsBackup([]);
      setSelectedIcPart(null);
      if (existingParts.length > 0) {
        setCurrentPartIndex(0);
        const firstPart = existingParts[0].name;
        setQuery(firstPart);
        setTimeout(() => doSearch(firstPart), 200);
      }
    }
    if (!open) {
      setHasSearched(false);
      setResults([]);
      setSearchHelp(null);
      setCurrentPartIndex(0);
      setAiInfo(null);
      setIcCatalogResults([]);
      setIcCatalogResultsBackup([]);
      setSelectedIcPart(null);
    }
  }, [open]);

  const enabledIntegrations = getConfiguredPartsIntegrations(integrations as any[]);
  const hasInterCarsWholesaler = enabledIntegrations.some((integration: any) => integration.supplier_code === 'inter_cars');

  const suggestions = useMemo(
    () => generateSearchSuggestions(query),
    [query],
  );

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setTimeout(() => doSearch(suggestion), 50);
  };

  const searchInWholesalers = async (searchTerm: string) => {
    if (enabledIntegrations.length === 0) {
      setIsSearching(false);
      toast.error('Brak skonfigurowanych hurtowni. Przejdź do Ustawienia → Integracje z hurtowniami.');
      return;
    }

    setSearchHelp(null);
    setAiInfo(null);
    setIsSearching(true);
    setResults([]);
    setHasSearched(true);

    // Init diagnostics per supplier
    const initDiag: Record<string, { status: 'ok' | 'error' | 'searching'; count: number; message?: string }> = {};
    for (const i of enabledIntegrations) {
      initDiag[(i as any).supplier_code] = { status: 'searching', count: 0 };
    }
    setSupplierDiagnostics(initDiag);

    // Reset debug data for fresh search
    setDebugData(null);

    try {
      // ── Centralized AI resolve — JEDEN call Claude'a zamiast 3 (per hurtownia)
      // Wynik (oeNumbers + partDescription) jest przekazywany do każdej hurtowni przez params.preResolvedQuery
      let preResolvedQuery: any = null;
      let resolveDebug: any = null;
      try {
        const resolveRes = await partsApi.mutateAsync({
          action: 'resolve_query',
          provider_id: providerId,
          params: {
            query: searchTerm,
            vin: vehicleVin || undefined,
            vehicle: vehicle ? {
              brand: vehicle.brand,
              model: vehicle.model,
              year: vehicle.year,
              engineCapacityCm3: vehicle.engine_capacity_cm3 || vehicle.engine_capacity,
              enginePowerKw: vehicle.engine_power_kw || vehicle.engine_power,
              fuelType: vehicle.fuel_type,
            } : undefined,
          },
        });
        if (resolveRes && Array.isArray(resolveRes.oeNumbers)) {
          preResolvedQuery = {
            oeNumbers: resolveRes.oeNumbers,
            partDescription: resolveRes.partDescription,
            searchTermsMultiLang: resolveRes.searchTermsMultiLang,
            clarificationQuestion: resolveRes.clarificationQuestion,
            confidence: resolveRes.confidence,
          };
          console.log('[RidoParts] AI pre-resolved OE:', resolveRes.oeNumbers,
            'multilang:', resolveRes.searchTermsMultiLang,
            '(timeMs:', resolveRes.timeMs, ')');
          if (resolveRes._debug) resolveDebug = { ...resolveRes._debug, timeMs: resolveRes.timeMs };
        }
      } catch (resolveErr: any) {
        console.warn('[RidoParts] Centralized resolve failed, per-supplier fallback aktywny:', resolveErr?.message);
      }

      const searchPromises = enabledIntegrations.map(async (integration: any) => {
        try {
          const res = await partsApi.mutateAsync({
            action: 'search',
            provider_id: providerId,
            supplier_code: integration.supplier_code,
            params: {
              query: searchTerm,
              vin: vehicleVin || undefined,
              vehicle: vehicle ? {
                brand: vehicle.brand,
                model: vehicle.model,
                year: vehicle.year,
                engineCapacityCm3: vehicle.engine_capacity_cm3 || vehicle.engine_capacity,
                enginePowerKw: vehicle.engine_power_kw || vehicle.engine_power,
                fuelType: vehicle.fuel_type,
              } : undefined,
              preResolvedQuery,
            },
          });

          const items = Array.isArray(res.results) ? res.results :
            res.results?.items || res.results?.products || res.results?.data || [];

          const supplierMargin = integration.sales_margin_percent || margin;
          const supplierName = integration.supplier_name || integration.supplier_code;

          const mappedItems = items.map((item: any, idx: number) => {
            const priceNet = Number(item.price?.net ?? item.priceNet ?? item.price ?? 0);
            const avail = parseAvailability(item);
            const tecdocId = item.tecdocId || item.tecdoc_id;
            const sellingGross = priceNet > 0
              ? Math.round(priceNet * (1 + supplierMargin / 100) * 1.23 * 100) / 100
              : 0;

            return {
              id: `${integration.supplier_code}-${item.hartCode || item.partNumber || item.productCode || item.code || item.id || idx}`,
              code: item.hartCode || item.partNumber || item.productCode || item.code || item.catalogNumber || '',
              name: item.name || item.description || item.productName || item.partNumber || searchTerm,
              manufacturer: item.manufacturer?.name || item.manufacturer || item.brand || item.producerName || item.producer || '',
              supplier: supplierName,
              supplierCode: integration.supplier_code,
              purchasePriceNet: priceNet,
              sellingPriceGross: sellingGross,
              suggestedPrice: null,
              isSuggested: priceNet === 0,
              availability: avail,
              deliveryTime: item.deliveryTime || item.waitingTime || (avail === 'today' ? 'Dziś' : avail === 'tomorrow' ? 'Jutro' : '2-3 dni'),
              imageUrl: item.imageUrl || item.image_url || item.image || item.photoUrl || item.thumbnailUrl || (tecdocId ? `https://webservice.tecalliance.services/pegasus-3-0/img/A/${encodeURIComponent(tecdocId)}` : null),
              selected: false,
              quantity: 1,
              isCheapest: false,
            } as SearchResult;
          });

          setSupplierDiagnostics(prev => ({
            ...prev,
            [integration.supplier_code]: { status: 'ok', count: mappedItems.length, textFallback: !!res.usedTextFallback },
          }));

          return {
            items: mappedItems,
            clarificationQuestion: typeof res.clarificationQuestion === 'string' ? res.clarificationQuestion : null,
            aiResolved: res.aiResolved || false,
            partDescription: res.partDescription || null,
            searchedTerms: res.searchedTerms || [],
            supplierCode: integration.supplier_code,
            _debug: res._debug || null,
          };
        } catch (err: any) {
          console.warn(`Search failed for ${integration.supplier_code}:`, err.message);
          setSupplierDiagnostics(prev => ({
            ...prev,
            [integration.supplier_code]: { status: 'error', count: 0, message: err.message },
          }));
          return { items: [], clarificationQuestion: null, aiResolved: false, partDescription: null, searchedTerms: [], supplierCode: integration.supplier_code, _debug: null };
        }
      });

      const allResults = await Promise.allSettled(searchPromises);
      const mergedResults: SearchResult[] = [];
      const clarificationQuestions: string[] = [];
      let firstAiInfo: typeof aiInfo = null;
      const supplierDebugs: Record<string, any> = {};

      for (const result of allResults) {
        if (result.status === 'fulfilled') {
          mergedResults.push(...result.value.items);
          if (result.value.clarificationQuestion) {
            clarificationQuestions.push(result.value.clarificationQuestion);
          }
          if (result.value.aiResolved && !firstAiInfo) {
            firstAiInfo = {
              aiResolved: true,
              partDescription: result.value.partDescription,
              searchedTerms: result.value.searchedTerms,
            };
          }
          if (result.value._debug && result.value.supplierCode) {
            supplierDebugs[result.value.supplierCode] = result.value._debug;
          }
        }
      }

      // Jeśli admin → kompleksowy _debug payload do sheet'a
      if (resolveDebug || Object.keys(supplierDebugs).length > 0) {
        setDebugData({
          query: searchTerm,
          timestamp: new Date().toISOString(),
          vehicle: vehicle ? {
            brand: vehicle.brand,
            model: vehicle.model,
            year: vehicle.year,
            vin: vehicleVin,
            engineCapacityCm3: vehicle.engine_capacity_cm3 || vehicle.engine_capacity,
            enginePowerKw: vehicle.engine_power_kw || vehicle.engine_power,
            fuelType: vehicle.fuel_type,
          } : null,
          aiResolve: resolveDebug,
          suppliers: supplierDebugs,
          totalCandidates: mergedResults.length,
        });
      }

      // Cross-reference prices
      const itemsWithPrices = mergedResults.filter(r => r.purchasePriceNet > 0);
      const itemsWithoutPrices = mergedResults.filter(r => r.purchasePriceNet === 0);

      if (itemsWithoutPrices.length > 0 && itemsWithPrices.length > 0) {
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

      // NAJTANIEJ marker — najniższa cena netto wśród dostępnych itemów z prawdziwą ceną
      const pricedAndAvailable = mergedResults.filter(r => r.purchasePriceNet > 0 && r.availability !== 'unavailable');
      if (pricedAndAvailable.length > 1) {
        const minPrice = Math.min(...pricedAndAvailable.map(r => r.purchasePriceNet));
        for (const r of mergedResults) {
          r.isCheapest = r.purchasePriceNet === minPrice && r.availability !== 'unavailable' && r.purchasePriceNet > 0;
        }
      }

      setResults(mergedResults);
      setAiInfo(firstAiInfo);
      // Show clarification alongside (not instead of) results
      setSearchHelp(clarificationQuestions[0] || null);
    } catch (err: any) {
      toast.error(err.message || 'Błąd wyszukiwania');
    } finally {
      setIsSearching(false);
    }
  };

  const doSearch = async (searchQuery?: string) => {
    const rawQuery = (searchQuery || query).trim();
    if (!rawQuery) return;

    const normalizedQuery = normalizePartsSearchQuery(rawQuery);
    const effectiveQuery = normalizedQuery || rawQuery;

    if (!searchQuery && effectiveQuery !== query) {
      setQuery(effectiveQuery);
    }

    setIsSearching(true);
    setResults([]);
    setIcCatalogResults([]);
    setIcCatalogResultsBackup([]);
    setSelectedIcPart(null);
    setSearchHelp(null);
    setHasSearched(true);

    // Step 1: Search IC catalog first (local cache) when IC is configured
    const shouldSearchIcCatalog = icIntegration?.is_enabled || hasInterCarsWholesaler;
    if (shouldSearchIcCatalog) {
      try {
        const icRes = await icSync.mutateAsync({
          action: 'search_catalog',
          provider_id: providerId,
          query: effectiveQuery,
        });

        if (icRes.results && icRes.results.length > 0) {
          setIcCatalogResults(icRes.results);
          setIcCatalogResultsBackup(icRes.results);
          setIsSearching(false);
          return; // Show IC results for selection, don't search wholesalers yet
        }
        console.log('[RidoParts] IC catalog empty, falling through to wholesalers');
      } catch (e: any) {
        console.warn('[RidoParts] IC catalog search failed:', e?.message);
      }
    }

    // Step 2: No IC results or no IC → search wholesalers directly
    console.log('[RidoParts] Searching wholesalers with:', effectiveQuery, 'integrations:', enabledIntegrations.map((i: any) => i.supplier_code));
    await searchInWholesalers(effectiveQuery);
  };

  const handleIcPartSelect = async (part: IcCatalogItem) => {
    setSelectedIcPart(part);
    setIcCatalogResults([]);
    const searchTerm = part.ic_index || part.oe_number || part.ic_sku;
    setQuery(searchTerm);
    await searchInWholesalers(searchTerm);
  };

  const handleBackToIcResults = () => {
    setSelectedIcPart(null);
    setResults([]);
    setIcCatalogResults(icCatalogResultsBackup);
  };

  const handleSearch = () => doSearch();

  // Cross-supplier — szukaj tej samej części (producent + numer) w pozostałych hurtowniach
  const findInOtherWholesalers = async (item: SearchResult) => {
    setCrossSupplierData({
      productCode: item.code,
      manufacturer: item.manufacturer,
      originalItemId: item.id,
      originalSupplier: item.supplier,
      originalSupplierCode: item.supplierCode,
      originalPrice: item.purchasePriceNet,
      originalDelivery: item.deliveryTime,
      results: [],
      loading: true,
    });
    try {
      const res = await partsApi.mutateAsync({
        action: 'find_in_other_wholesalers',
        provider_id: providerId,
        params: {
          productCode: item.code,
          manufacturer: item.manufacturer,
          excludeSupplier: item.supplierCode,
        },
      });
      setCrossSupplierData(prev => prev ? {
        ...prev,
        results: Array.isArray(res.results) ? res.results : [],
        loading: false,
      } : prev);
    } catch (err: any) {
      toast.error(err.message || 'Błąd porównywania cen');
      setCrossSupplierData(prev => prev ? { ...prev, loading: false } : prev);
    }
  };

  // Zastąp oryginalną pozycję w głównej tabeli alternatywą z tańszej hurtowni
  const selectAlternative = (
    alt: any,
    altSupplierCode: string,
    altSupplierName: string,
  ) => {
    if (!crossSupplierData) return;
    const priceNet = Number(alt.price || 0);
    // Marża per-integration (spójność z głównym mapping'iem w searchInWholesalers)
    const altIntegration = (integrations as any[]).find((i: any) => i.supplier_code === altSupplierCode);
    const altMargin = altIntegration?.sales_margin_percent || margin;
    const sellingGross = priceNet > 0
      ? Math.round(priceNet * (1 + altMargin / 100) * 1.23 * 100) / 100
      : 0;
    const qty = typeof alt.availability === 'number' ? alt.availability : 0;
    const newAvail: SearchResult['availability'] = qty > 5 ? 'today' : qty > 0 ? 'tomorrow' : 'unavailable';
    const newItem: SearchResult = {
      id: `${altSupplierCode}-${alt.partNumber || alt.productCode || alt.code}-cross-${Date.now()}`,
      code: alt.partNumber || alt.productCode || alt.code || crossSupplierData.productCode,
      name: alt.name || `${crossSupplierData.manufacturer} ${crossSupplierData.productCode}`,
      manufacturer: alt.manufacturer || alt.producer || crossSupplierData.manufacturer,
      supplier: altSupplierName,
      supplierCode: altSupplierCode,
      purchasePriceNet: priceNet,
      sellingPriceGross: sellingGross,
      suggestedPrice: null,
      isSuggested: false,
      availability: newAvail,
      deliveryTime: alt.waitingTime || alt.deliveryTime || (qty > 0 ? 'Dziś' : 'Zapytaj'),
      imageUrl: alt.imageUrl || null,
      selected: true,
      quantity: 1,
      isCheapest: false,
    };
    setResults(prev => {
      const filtered = prev.filter(r => r.id !== crossSupplierData.originalItemId);
      const updated = [...filtered, newItem];
      // Re-sort jak po normalnym searchu
      updated.sort((a, b) => {
        const availOrder = { today: 0, tomorrow: 1, '2-3days': 2, unavailable: 3 };
        const diff = availOrder[a.availability] - availOrder[b.availability];
        if (diff !== 0) return diff;
        return a.purchasePriceNet - b.purchasePriceNet;
      });
      // Recompute NAJTANIEJ
      const priced = updated.filter(r => r.purchasePriceNet > 0 && r.availability !== 'unavailable');
      if (priced.length > 1) {
        const minPrice = Math.min(...priced.map(r => r.purchasePriceNet));
        for (const r of updated) {
          r.isCheapest = r.purchasePriceNet === minPrice && r.availability !== 'unavailable' && r.purchasePriceNet > 0;
        }
      }
      return updated;
    });
    toast.success(`Wymieniono ofertę: ${altSupplierName} — ${priceNet.toFixed(2)} zł netto`);
    setCrossSupplierData(null);
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

  const handleOrder = async () => {
    if (selected.length === 0) return;
    setIsOrdering(true);
    try {
      const bySupplier: Record<string, SearchResult[]> = {};
      for (const s of selected) {
        if (!bySupplier[s.supplierCode]) bySupplier[s.supplierCode] = [];
        bySupplier[s.supplierCode].push(s);
      }

      for (const [supplierCode, items] of Object.entries(bySupplier)) {
        const positions = items.map(s => supplierCode === 'hart'
          ? { hartCode: s.code, quantity: s.quantity }
          : { code: s.code, productCode: s.code, quantity: s.quantity }
        );

        let supplierOrderId = '';
        try {
          const basketRes = await partsApi.mutateAsync({
            action: 'add_to_basket',
            provider_id: providerId,
            supplier_code: supplierCode,
            params: { positions },
          });

          const basketIds = basketRes.basket?.basketPositionIds ||
            basketRes.basket?.successfulOrders?.map((p: any) => p.orderBufferPositionId) ||
            basketRes.basket?.positions?.map((p: any) => p.id ?? p.basketPositionId) || [];

          if (basketIds.length > 0) {
            const orderRes = await partsApi.mutateAsync({
              action: 'place_order',
              provider_id: providerId,
              supplier_code: supplierCode,
              params: { basketPositionIds: basketIds },
            });
            supplierOrderId = orderRes.order?.orderId || orderRes.order?.id || orderRes.order?.items?.[0]?.orderId || orderRes.order?.[0]?.orderId || '';
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
  const suppliersInResults = [...new Set(results.map(r => r.supplier))];

  const noResultsSuggestions = useMemo(() => {
    if (results.length > 0 || !hasSearched) return [];
    return generateSearchSuggestions(query);
  }, [results, hasSearched, query]);

  // Clarification buttons from AI question
  const clarificationButtons = useMemo(() => {
    if (!searchHelp || results.length > 0) return [];
    return generateClarificationButtons(query, searchHelp);
  }, [searchHelp, query, results.length]);

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

        {/* Missing vehicle data warning */}
        {(!vehicleVin && !vehicle?.brand) && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>Brak danych pojazdu.</strong> Uzupełnij VIN, markę i model auta, aby wyszukiwarka mogła dopasować prawidłowe części.
            </div>
          </div>
        )}

        {/* Existing order parts quick search */}
        {existingParts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-muted-foreground mr-1">📋 Części ze zlecenia:</span>
            {existingParts.map((part, idx) => (
              <Button
                key={idx}
                variant={query === part.name ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => {
                  setQuery(part.name);
                  setTimeout(() => doSearch(part.name), 50);
                }}
              >
                {part.name} ({part.quantity})
              </Button>
            ))}
          </div>
        )}

        {/* Search bar */}
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

        {/* AI info bar — what AI searched for */}
        {aiInfo?.aiResolved && aiInfo.searchedTerms && aiInfo.searchedTerms.length > 0 && !isSearching && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-1.5">
            <Bot className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>
              AI szukało: <strong className="text-foreground">{aiInfo.partDescription || query}</strong> → numery OE: {aiInfo.searchedTerms.join(', ')}
            </span>
          </div>
        )}

        {/* Text-only fallback banner — AI nie znalazło numerów OE, hurtownia szuka po tekście */}
        {!isSearching && Object.values(supplierDiagnostics).some(d => d.textFallback) && (
          <div className="flex items-center gap-2 text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span className="text-amber-800 dark:text-amber-200">
              🔍 Wyszukiwanie tekstowe — AI nie znalazło numerów OE, hurtownie szukają po opisie. Wyniki mogą być mniej trafne.
            </span>
          </div>
        )}

        {/* Per-wholesaler diagnostics */}
        {hasSearched && Object.keys(supplierDiagnostics).length > 0 && !isSearching && (
          <div className="flex items-center gap-3 text-[11px] bg-muted/20 rounded-md px-3 py-1.5 flex-wrap">
            <span className="text-muted-foreground font-medium">Status API:</span>
            {Object.entries(supplierDiagnostics).map(([code, diag]) => (
              <span key={code} className="flex items-center gap-1">
                {diag.status === 'searching' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                {diag.status === 'ok' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                {diag.status === 'error' && <XCircle className="h-3 w-3 text-red-500" />}
                <span className={diag.status === 'error' ? 'text-red-600' : diag.count > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                  {code === 'hart' ? 'Hart' : code === 'auto_partner' ? 'Auto Partner' : code === 'inter_cars' ? 'Inter Cars' : code}
                  {diag.status === 'ok' && `: ${diag.count} wyników`}
                  {diag.status === 'error' && ` (błąd)`}
                </span>
              </span>
            ))}
            {/* Diagnostyka — przycisk widoczny tylko dla admina (debugData wypełnia się tylko jeśli backend zwrócił _debug) */}
            {debugData && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 ml-auto gap-1 text-[10px]"
                onClick={() => setDebugSheetOpen(true)}
                title="Diagnostyka AI + hurtowni (tylko admin)"
              >
                <Wrench className="h-3 w-3" /> Diagnostyka
              </Button>
            )}
          </div>
        )}


        {suggestions.length > 0 && !isSearching && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground self-center mr-1">
              <Sparkles className="h-3 w-3 inline mr-1" />
              Sugestie:
            </span>
            {suggestions.map((s) => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2.5 hover:bg-primary/10 hover:border-primary"
                onClick={() => handleSuggestionClick(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        )}

        {/* Selected IC part banner */}
        {selectedIcPart && (
          <div className="flex items-center gap-2 text-xs rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <span>✅ Szukasz: <strong>{selectedIcPart.name}</strong> {selectedIcPart.manufacturer && `(${selectedIcPart.manufacturer})`}</span>
            <span className="text-muted-foreground">— wyniki z {suppliersInResults.length} hurtowni</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs ml-auto" onClick={handleBackToIcResults}>
              <ArrowLeft className="h-3 w-3 mr-1" /> Wróć do wyboru części
            </Button>
          </div>
        )}

        {/* Results info */}
        {results.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span>Znaleziono: <strong className="text-foreground">{results.length}</strong> wyników</span>
            {suppliersInResults.map(s => (
              <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
            ))}
            {aiInfo?.aiResolved && (
              <span className="text-[10px] text-primary">• Wyniki dla numerów OE znalezionych przez AI</span>
            )}
          </div>
        )}

        {/* Results table / empty state */}
        <div className="flex-1 overflow-auto min-h-0">
          {isSearching && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">
                AI analizuje zapytanie i przeszukuje {enabledIntegrations.length} hurtowni...
              </p>
            </div>
          )}

          {/* IC Catalog results — part selection */}
          {!isSearching && icCatalogResults.length > 0 && (
            <div className="space-y-3 p-2">
              <div className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Znaleziono <strong>{icCatalogResults.length}</strong> pasujących części w katalogu Inter Cars. Wybierz właściwą:</span>
              </div>
              <div className="space-y-2">
                {icCatalogResults.map((part) => (
                  <button
                    key={part.ic_sku}
                    type="button"
                    onClick={() => handleIcPartSelect(part)}
                    className="text-left w-full p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors flex gap-3"
                  >
                    <div className="w-16 h-16 rounded border bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden">
                      {(part.image_url || part.ic_tecdoc_id) ? (
                        <img
                          src={part.image_url || `https://webservice.tecalliance.services/pegasus-3-0/img/A/${encodeURIComponent(part.ic_tecdoc_id as string)}`}
                          alt={part.name}
                          className="w-full h-full object-contain"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <Package className={`h-6 w-6 text-muted-foreground/50 ${(part.image_url || part.ic_tecdoc_id) ? 'hidden' : ''}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{part.name}</p>
                      <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                        {part.manufacturer && <span>{part.manufacturer}</span>}
                        {part.category_label && <span className="text-primary/70">· {part.category_label}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {part.ic_index && <p className="font-mono text-[10px] text-muted-foreground">{part.ic_index}</p>}
                      {part.oe_number && <p className="text-[10px] text-muted-foreground">OE: {part.oe_number}</p>}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                ℹ️ Kliknij część → system sprawdzi ceny i dostępność we wszystkich hurtowniach
              </p>
            </div>
          )}

          {!isSearching && results.length > 0 && icCatalogResults.length === 0 && (
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
                      <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                        {r.imageUrl ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="w-8 h-8 rounded border overflow-hidden mx-auto cursor-zoom-in block hover:ring-2 hover:ring-primary/50 transition"
                                onMouseEnter={() => setHoveredImage(r.imageUrl)}
                                onMouseLeave={() => setHoveredImage(null)}
                                onClick={() => setZoomedImage({ url: r.imageUrl!, alt: r.name })}
                                title="Kliknij aby powiększyć"
                              >
                                <img src={r.imageUrl} alt={r.name} className="w-full h-full object-cover" />
                              </button>
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
                        {r.code && r.manufacturer && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              findInOtherWholesalers(r);
                            }}
                            className="mt-1 flex items-center gap-1 text-[10px] text-primary hover:underline cursor-pointer"
                            title="Znajdź tę część w innych hurtowniach"
                          >
                            <Search className="h-2.5 w-2.5" /> Porównaj
                          </button>
                        )}
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
                          <div className="flex items-center justify-end gap-1.5">
                            {r.isCheapest && (
                              <span
                                title="Najniższa cena hurtowa wśród dostępnych ofert"
                                className="bg-green-500/15 text-green-700 dark:text-green-400 text-[9px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap"
                              >
                                🏆 NAJTANIEJ
                              </span>
                            )}
                            <span className={r.isCheapest ? 'text-green-700 dark:text-green-400 font-semibold' : ''}>
                              {fmt(r.purchasePriceNet)} zł
                            </span>
                          </div>
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
                                Cena sugerowana na podstawie innych hurtowni.
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
          )}

          {/* Empty state after search — with clarification and suggestions */}
          {!isSearching && hasSearched && results.length === 0 && icCatalogResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <SearchX className="h-12 w-12 mb-4 opacity-30" />

              {/* AI clarification question */}
              {searchHelp && (
                <div className="mb-4 max-w-2xl rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800 px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Potrzebne doprecyzowanie</span>
                  </div>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">{searchHelp}</p>
                </div>
              )}

              {/* Clarification buttons */}
              {clarificationButtons.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center mb-4">
                  {clarificationButtons.map((btn) => (
                    <Button
                      key={btn}
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs hover:bg-primary/10 hover:border-primary"
                      onClick={() => handleSuggestionClick(btn)}
                    >
                      {btn}
                    </Button>
                  ))}
                </div>
              )}

              <p className="text-sm font-medium text-foreground mb-1">
                Nie znaleziono wyników dla: „{query}"
              </p>
              {aiInfo?.searchedTerms && aiInfo.searchedTerms.length > 0 && (
                <p className="text-xs mb-2">
                  Szukano numerów: {aiInfo.searchedTerms.join(', ')}
                </p>
              )}
              <p className="text-xs mb-4">
                Spróbuj innej frazy, numeru OE bezpośrednio z dokumentacji pojazdu lub wybierz jedną z sugestii
              </p>

              {noResultsSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                  {noResultsSuggestions.map((s) => (
                    <Button
                      key={s}
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs hover:bg-primary/10 hover:border-primary"
                      onClick={() => handleSuggestionClick(s)}
                    >
                      Spróbuj: {s}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Initial state — no search yet */}
          {!isSearching && !hasSearched && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="rounded-full bg-primary/10 p-4 mb-4">
                <Bot className="h-10 w-10 text-primary" />
              </div>
              <p className="text-base font-semibold mb-1">Wyszukaj części po opisie lub numerze</p>
              <p className="text-sm text-muted-foreground max-w-md mb-5">
                AI (Claude) tłumaczy opis (np. „klocki tylne") na numery OE i przeszukuje
                <strong className="text-foreground"> {enabledIntegrations.length} {enabledIntegrations.length === 1 ? 'hurtownię' : 'hurtownie'}</strong>
                {vehicle?.brand ? <> dla pojazdu <strong className="text-foreground">{vehicle.brand} {vehicle.model}</strong></> : ''}.
                Jeśli opis jest niejednoznaczny — AI zada pytanie doprecyzowujące.
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                <span className="text-xs text-muted-foreground self-center mr-1">Przykłady:</span>
                {['klocki hamulcowe tylne', 'tarcze hamulcowe przednie', 'filtr oleju', 'olej silnikowy 5W30', 'akumulator', 'amortyzator przedni'].map(ex => (
                  <Button
                    key={ex}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2.5 hover:bg-primary/10 hover:border-primary"
                    onClick={() => handleSuggestionClick(ex)}
                  >
                    {ex}
                  </Button>
                ))}
              </div>
              {enabledIntegrations.length === 0 && (
                <div className="mt-5 rounded-md bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Brak skonfigurowanych hurtowni. Przejdź do Ustawienia → Integracje z hurtowniami.
                </div>
              )}
            </div>
          )}
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

      {/* Cross-supplier porównanie — modal z tą samą częścią w pozostałych hurtowniach */}
      <Dialog open={!!crossSupplierData} onOpenChange={(open) => !open && setCrossSupplierData(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Porównanie cen: {crossSupplierData?.manufacturer} {crossSupplierData?.productCode}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Ta sama część — różne hurtownie. Wybierz najtańszą dla swojego zamówienia.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto space-y-4">
            {/* Twoja oferta — oryginalna z głównej tabeli */}
            {crossSupplierData && (
              <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-primary text-primary-foreground text-[10px]">Twoja oferta</Badge>
                  <span className="text-sm font-semibold">{crossSupplierData.originalSupplier}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="text-muted-foreground">
                    {crossSupplierData.manufacturer} {crossSupplierData.productCode}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{crossSupplierData.originalDelivery}</span>
                    <span className="font-bold text-base tabular-nums">
                      {fmt(crossSupplierData.originalPrice)} zł
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Loading state */}
            {crossSupplierData?.loading && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                <p className="text-sm text-muted-foreground">Szukam w innych hurtowniach...</p>
              </div>
            )}

            {/* Wyniki z innych hurtowni */}
            {!crossSupplierData?.loading && crossSupplierData && (() => {
              // Znajdź min cenę spośród WSZYSTKICH ofert (oryginał + alternatywy)
              const altPrices: number[] = [crossSupplierData.originalPrice];
              for (const sup of crossSupplierData.results) {
                if (sup.status !== 'ok') continue;
                for (const it of sup.items) {
                  const p = Number(it.price || 0);
                  if (p > 0) altPrices.push(p);
                }
              }
              const minPrice = altPrices.length > 0 ? Math.min(...altPrices) : 0;

              // Wyniki posortowane po cenie rosnąco (per supplier każda pozycja osobno)
              const flatAlts: Array<{ item: any; supplier: string; supplierName: string }> = [];
              for (const sup of crossSupplierData.results) {
                if (sup.status !== 'ok') continue;
                for (const it of sup.items) {
                  flatAlts.push({ item: it, supplier: sup.supplier, supplierName: sup.supplierName });
                }
              }
              flatAlts.sort((a, b) => Number(a.item.price || 0) - Number(b.item.price || 0));

              return (
                <>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Inne hurtownie
                  </div>

                  {/* Per supplier: jeśli error lub items pusto — komunikat */}
                  {crossSupplierData.results.map((sup) => {
                    if (sup.status === 'error') {
                      return (
                        <div key={sup.supplier} className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-2 text-xs text-red-700 dark:text-red-300">
                          ❌ {sup.supplierName}: {sup.error || 'Błąd zapytania'}
                        </div>
                      );
                    }
                    if (sup.status === 'unsupported') {
                      return (
                        <div key={sup.supplier} className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                          {sup.supplierName}: nieobsługiwana hurtownia
                        </div>
                      );
                    }
                    if (sup.items.length === 0) {
                      return (
                        <div key={sup.supplier} className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                          {sup.supplierName}: brak ofert dla {crossSupplierData.manufacturer} {crossSupplierData.productCode}
                          {sup.totalUnfiltered > 0 && (
                            <span className="ml-1 text-[10px]">({sup.totalUnfiltered} wyników bez tego producenta)</span>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })}

                  {/* Karty z wynikami (sorted by price asc) */}
                  {flatAlts.map((entry, idx) => {
                    const it = entry.item;
                    const priceNet = Number(it.price || 0);
                    const isMin = priceNet > 0 && priceNet === minPrice;
                    const qty = typeof it.availability === 'number' ? it.availability : 0;
                    const availLabel = qty > 5 ? 'Dziś' : qty > 0 ? 'Jutro' : 'Zapytaj';
                    return (
                      <div
                        key={`${entry.supplier}-${it.partNumber || it.productCode || idx}`}
                        className={`rounded-lg border p-3 ${isMin ? 'border-green-400 bg-green-50 dark:bg-green-950/20' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {it.imageUrl && (
                              <img src={it.imageUrl} alt="" className="h-8 w-8 rounded object-cover border shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{it.name || `${entry.supplierName} — ${it.partNumber}`}</div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {it.manufacturer || it.producer} · {it.partNumber || it.productCode}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="flex items-center gap-1.5 justify-end">
                              {isMin && (
                                <span className="bg-green-500/20 text-green-700 dark:text-green-400 text-[9px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap">
                                  🏆 NAJTANIEJ
                                </span>
                              )}
                              <span className={`text-base font-bold tabular-nums ${isMin ? 'text-green-700 dark:text-green-400' : ''}`}>
                                {fmt(priceNet)} zł
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {entry.supplierName} · {availLabel} · {it.waitingTime || it.deliveryTime || ''}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 flex justify-end">
                          <Button
                            size="sm"
                            variant={isMin ? 'default' : 'outline'}
                            className="h-7 text-xs"
                            onClick={() => selectAlternative(it, entry.supplier, entry.supplierName)}
                          >
                            Wybierz tę ofertę
                          </Button>
                        </div>
                      </div>
                    );
                  })}

                  {flatAlts.length === 0 && crossSupplierData.results.every(s => s.items.length === 0) && (
                    <div className="text-center py-6 text-sm text-muted-foreground">
                      Brak ofert {crossSupplierData.manufacturer} {crossSupplierData.productCode} w pozostałych hurtowniach.
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCrossSupplierData(null)}>
              Zostaw oryginalną
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zoom modal — pełnowymiarowe zdjęcie części po kliknięciu w thumbnail */}
      <Dialog open={!!zoomedImage} onOpenChange={(open) => !open && setZoomedImage(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm truncate pr-6">{zoomedImage?.alt || 'Zdjęcie części'}</DialogTitle>
          </DialogHeader>
          {zoomedImage && (
            <div className="flex items-center justify-center bg-muted/30 rounded-md p-4 min-h-[400px]">
              <img
                src={zoomedImage.url}
                alt={zoomedImage.alt}
                className="max-w-full max-h-[70vh] object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '';
                  (e.currentTarget as HTMLImageElement).alt = 'Nie udało się załadować zdjęcia';
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diagnostic Sheet — tylko admin (debugData wypełnia się tylko dla user_roles.role='admin') */}
      <Sheet open={debugSheetOpen} onOpenChange={setDebugSheetOpen}>
        <SheetContent className="w-full sm:max-w-[700px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              Diagnostyka wyszukiwania
            </SheetTitle>
            <SheetDescription className="text-xs">
              Pełne dane debugowe — AI prompt/response, użyte strategie per hurtownia, terminy wyszukiwania.
              Widoczne tylko dla administratorów.
            </SheetDescription>
          </SheetHeader>
          {debugData && (
            <div className="mt-4 space-y-3">
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
                    toast.success('Diagnostyka skopiowana do schowka');
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Skopiuj JSON
                </Button>
              </div>
              <pre className="text-[10px] bg-muted/40 rounded-md p-3 overflow-x-auto font-mono whitespace-pre-wrap break-words">
                {JSON.stringify(debugData, null, 2)}
              </pre>
            </div>
          )}
        </SheetContent>
      </Sheet>
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
