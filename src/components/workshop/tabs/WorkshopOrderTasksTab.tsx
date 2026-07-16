import { DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createWorkshopOrderItemsBatch, useUpdateWorkshopOrderItem, useDeleteWorkshopOrderItem, useUpdateWorkshopOrder } from '@/hooks/useWorkshop';
import { usePartsIntegrations } from '@/hooks/useWorkshopParts';
import { Plus, Trash2, Package, Wrench, Search, EyeOff, Sparkles, AlertTriangle, GripVertical, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RidoPartsSearchModal } from '../parts/RidoPartsSearchModal';
import { RidoPartsConfigModal } from '../parts/RidoPartsConfigModal';
import { getConfiguredPartsIntegrations } from '../parts/partsIntegrationUtils';
import { ServiceAutocomplete } from '../pricing/ServiceAutocomplete';
import { InventoryProductAutocomplete } from '../InventoryProductAutocomplete';
import { RidoPriceModal } from '../pricing/RidoPriceModal';
import { WorkshopVehicleEditDialog } from '../WorkshopVehicleEditDialog';
import { useSaveServicePrice, useSaveAnonymousPrice } from '@/hooks/useServicePriceHistory';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { useWorkshopTranslations, TranslatableField } from '@/hooks/useWorkshopTranslations';
import { VAT_RATE, safeNumber, getDiscountPercent, getLineTotal } from '@/utils/workshopOrderTotals';

interface Props {
  order: any;
  providerId: string;
}

type DiscountType = 'percent' | 'amount';

interface TaskRow {
  draftKey?: string;
  name: string;
  mechanic: string;
  quantity: number;
  price_net: number;
  price_gross: number;
  cost_net: number;
  cost_gross: number;
  discount: number;
  discountType: DiscountType;
  employee_id: string;
  labor_hours: number;
}

interface GoodsRow {
  draftKey?: string;
  name: string;
  quantity: number;
  unit: string;
  price_net: number;
  price_gross: number;
  cost_net: number;
  cost_gross: number;
  discount: number;
  discountType: DiscountType;
  task_name: string;
  inventory_product_id?: string | null;
}

type DropIndicator = {
  index: number;
  position: 'before' | 'after';
};

// PERF P4: wpis kolejki commitów pozycji (patrz enqueueEntries w komponencie).
type CommitEntry = {
  payload: any;
  /** przywraca draft do poprawki po błędzie zapisu paczki */
  restore: () => void;
  /** efekty uboczne wykonywane dopiero PO udanym zapisie (np. historia cen) */
  onCommitted?: () => void;
};

const getLineCost = (item: any, gross: boolean) => {
  const quantity = safeNumber(item.quantity) || 1;
  const unitCost = gross ? safeNumber(item.unit_cost_gross) : safeNumber(item.unit_cost_net);
  if (unitCost > 0) return unitCost * quantity;

  const fallbackUnitCost = gross ? safeNumber(item.unit_cost_net) * VAT_RATE : safeNumber(item.unit_cost_gross) / VAT_RATE;
  return fallbackUnitCost > 0 ? fallbackUnitCost * quantity : 0;
};

const sortItemsBySortOrder = (items: any[]) => {
  return [...items].sort((a, b) => {
    // Addon items always pinned to the top
    const aAddon = a?.is_addon ? 1 : 0;
    const bAddon = b?.is_addon ? 1 : 0;
    if (aAddon !== bAddon) return bAddon - aAddon;

    const aSortOrder = typeof a?.sort_order === 'number' ? a.sort_order : Number.MAX_SAFE_INTEGER;
    const bSortOrder = typeof b?.sort_order === 'number' ? b.sort_order : Number.MAX_SAFE_INTEGER;

    if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;

    const aCreatedAt = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const bCreatedAt = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return aCreatedAt - bCreatedAt;
  });
};

// FIX: "odcisk" treści wyceny — tylko pola które definują ofertę cenową
// (nazwa/typ/ilość/ceny/rabat), niezależnie od kolejności. Służy do porównania
// bieżących pozycji z tym, co klient podpisał (snapshot) → estimate_changed_after_send
// ma być true tylko gdy REALNA zawartość się różni; powrót do stanu = brak zmiany.
const estimateFingerprint = (items: any[]) => (items || [])
  .map((i: any) =>
    `${String(i.name || '').trim().toLowerCase()}|${i.item_type || ''}|${safeNumber(i.quantity)}|` +
    `${safeNumber(i.unit_price_net)}|${safeNumber(i.unit_price_gross)}|${safeNumber(i.discount_percent)}`)
  .sort()
  .join('||');

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number) => {
  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
};

export function WorkshopOrderTasksTab({ order, providerId }: Props) {
  const { t } = useTranslation();
  const updateItem = useUpdateWorkshopOrderItem();
  const deleteItem = useDeleteWorkshopOrderItem();
  const updateOrder = useUpdateWorkshopOrder();
  const queryClient = useQueryClient();
  const { data: partsIntegrations = [] } = usePartsIntegrations(providerId);
  const configuredPartsIntegrations = getConfiguredPartsIntegrations(partsIntegrations as any[]);

  // Employees for labor tracking
  const { data: workshopEmployees = [] } = useQuery({
    queryKey: ['workshop-employees-for-labor', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_employees')
        .select('id, name, salary')
        .eq('provider_id', providerId)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Task templates
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['task-templates-for-order'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await (supabase as any)
        .from('task_templates')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Workshop settings for default hourly rate
  const { data: workshopSettings } = useQuery({
    queryKey: ['workshop-settings-hourly'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await (supabase as any)
        .from('workshop_settings')
        .select('hourly_rate')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
  });

  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  // Separate price modes for services and parts
  const [taskPriceMode, setTaskPriceMode] = useState<'net' | 'gross'>(order.price_mode || 'gross');
  const [goodsPriceMode, setGoodsPriceMode] = useState<'net' | 'gross'>(order.price_mode || 'gross');

  const [ridoSearchOpen, setRidoSearchOpen] = useState(false);
  const [ridoConfigOpen, setRidoConfigOpen] = useState(false);
  const [ridoPriceOpen, setRidoPriceOpen] = useState(false);
  const [vehicleDataWarningOpen, setVehicleDataWarningOpen] = useState(false);
  const [vehicleEditOpen, setVehicleEditOpen] = useState(false);
  const saveServicePrice = useSaveServicePrice(providerId);
  const saveAnonymousPrice = useSaveAnonymousPrice();

  // Editing saved items inline
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [quoteWarningShown, setQuoteWarningShown] = useState(false);
  const [taskPreview, setTaskPreview] = useState<any[] | null>(null);
  const [goodsPreview, setGoodsPreview] = useState<any[] | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [draggingGoodsId, setDraggingGoodsId] = useState<string | null>(null);
  const [taskDropIndicator, setTaskDropIndicator] = useState<DropIndicator | null>(null);
  const [goodsDropIndicator, setGoodsDropIndicator] = useState<DropIndicator | null>(null);
  const serviceCardRef = useRef<HTMLDivElement>(null);
  const goodsCardRef = useRef<HTMLDivElement>(null);
  const autoSavingTaskDraftsRef = useRef(false);
  const autoSavingGoodsDraftsRef = useRef(false);

  // Load Rido Price settings
  const { data: ridoPriceSettings } = useQuery({
    queryKey: ['rido-price-settings', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('rido_price_settings')
        .select('*')
        .eq('provider_id', providerId)
        .maybeSingle();
      return data;
    },
  });

  // FIX: snapshot OSTATNIEGO podpisanego kosztorysu — do porównania, czy bieżące
  // pozycje różnią się od podpisanych. Odblokowuje poprawne czyszczenie flagi
  // "zmiana po wysłaniu" gdy warsztat cofnie zmianę do stanu podpisanego.
  const { data: signedEstimateSnapshot } = useQuery({
    queryKey: ['workshop-signed-estimate-snapshot', order.id],
    enabled: !!order.id && !!order.quote_accepted,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('workshop_order_signatures')
        .select('snapshot')
        .eq('order_id', order.id)
        .eq('document_type', 'cost_estimate')
        .not('snapshot', 'is', null)
        .order('signed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.snapshot || null;
    },
  });

  // EFEKT A — status wyprowadzany z FLAG (nie z porównania ze snapshotem).
  // Zasada: "Dodatek do naprawy" (bursztyn) = jest zmiana ZROBIONA ale NIEWYSŁANA
  // do klienta. Nadpisujemy TYLKO statusy z rodziny wyceny (nie ręczne/inne).
  // Kluczowe dla buga migania: świeży podpis ustawia quote_accepted=true +
  // estimate_changed_after_send=false (RPC), więc target = "Zaakceptowano" i
  // NIE ma tu żadnego porównania ze (nieświeżym) snapshotem → zero migania.
  useEffect(() => {
    if (!order?.id) return;
    const s = order.status_name;
    const FAMILY = ['Wycena wysłana', 'Zaakceptowano', 'Dodatek do naprawy', 'Wycena do wysłania', 'Przyjęcie do serwisu'];
    if (!FAMILY.includes(s)) return; // nie ruszaj statusów spoza rodziny wyceny
    const hasItems = (order.items || []).length > 0;
    const unsent = !!order.estimate_changed_after_send;
    let target: string | null = null;
    if (order.quote_accepted) {
      // zmiana/dodatek PO podpisie klienta, niewysłana → "Dodatek do naprawy"
      target = unsent ? 'Dodatek do naprawy' : 'Zaakceptowano';
    } else if (order.estimate_sent_to_client) {
      // pkt 1: wysłana, jeszcze niepodpisana, ale zmieniona ponownie → "Dodatek do naprawy"
      target = unsent ? 'Dodatek do naprawy' : 'Wycena wysłana';
    } else if (hasItems && (s === 'Przyjęcie do serwisu' || s === 'Wycena do wysłania')) {
      // pkt 2: PIERWSZA wycena zrobiona po przyjęciu, jeszcze NIEWYSŁANA →
      // "Wycena do wysłania" (NIE "Dodatek do naprawy" — to nie dodatek).
      target = 'Wycena do wysłania';
    }
    if (target && target !== s) updateOrder.mutate({ id: order.id, status_name: target });
  }, [order?.id, order.status_name, order.quote_accepted, order.estimate_sent_to_client, order.estimate_changed_after_send, order.items]);

  // EFEKT B — czyszczenie flagi "niewysłana zmiana" gdy pozycje WRÓCĄ do stanu
  // z PODPISANEGO snapshotu (status wróci przez Efekt A). Uruchamia się TYLKO gdy
  // flaga jest true (po realnej zmianie) — świeżego podpisu (flaga=false) NIE
  // dotyka, więc nie korzysta z potencjalnie nieświeżego snapshotu = brak migania.
  useEffect(() => {
    if (!order?.id || !order.quote_accepted || !order.estimate_changed_after_send) return;
    const snapItems = signedEstimateSnapshot?.items;
    if (!Array.isArray(snapItems)) return;
    if (estimateFingerprint(order.items) === estimateFingerprint(snapItems)) {
      updateOrder.mutate({ id: order.id, estimate_changed_after_send: false });
    }
  }, [order?.id, order.items, order.quote_accepted, order.estimate_changed_after_send, signedEstimateSnapshot]);

  // Memoized so the sort only re-runs when the items actually change, not on every
  // keystroke/render (the parent now hands down a stable `order` identity).
  const sortedTaskItems = useMemo(
    () => sortItemsBySortOrder((order.items || []).filter((i: any) => i.item_type === 'service' || i.item_type === 'task' || (i.item_type !== 'part' && i.item_type !== 'goods' && i.item_type !== 'other'))),
    [order.items]
  );
  const sortedGoodsItems = useMemo(
    () => sortItemsBySortOrder((order.items || []).filter((i: any) => i.item_type === 'part' || i.item_type === 'goods' || i.item_type === 'other')),
    [order.items]
  );
  const tasks = taskPreview ?? sortedTaskItems;
  const goods = goodsPreview ?? sortedGoodsItems;

  // CORE: nazwy pozycji w języku admina ('auto' — mechanik mógł wpisać po UA/RU).
  // Podgląd i edycja pokazują tłumaczenie; saveEdit pomija nazwę gdy admin jej nie
  // zmienił → oryginał mechanika zostaje (klient nadal dostaje tłumaczenie ze źródła).
  const nameTransFields = useMemo<TranslatableField[]>(() => {
    const out: TranslatableField[] = [];
    for (const it of (order.items || [])) {
      if (it?.id && it?.name) out.push({ entity_type: 'item', entity_id: String(it.id), field: 'name', text: String(it.name) });
    }
    return out;
  }, [order.items]);
  const { t: tName } = useWorkshopTranslations(nameTransFields, 'auto');
  const nameDisplay = (item: any) => tName('item', String(item.id), 'name', item.name || '') || (item.name || '');

  const isTaskGross = taskPriceMode === 'gross';
  const isGoodsGross = goodsPriceMode === 'gross';

  const createEmptyTask = (): TaskRow => ({ draftKey: crypto.randomUUID(), name: '', mechanic: '', quantity: 1, price_net: 0, price_gross: 0, cost_net: 0, cost_gross: 0, discount: 0, discountType: 'percent', employee_id: '', labor_hours: 0 });
  const emptyTask: TaskRow = createEmptyTask();
  const [taskRows, setTaskRows] = useState<TaskRow[]>([{ ...emptyTask }]);
  const [taskSearch, setTaskSearch] = useState('');

  const createEmptyGoods = (): GoodsRow => ({ draftKey: crypto.randomUUID(), name: '', quantity: 1, unit: 'szt', price_net: 0, price_gross: 0, cost_net: 0, cost_gross: 0, discount: 0, discountType: 'percent', task_name: '', inventory_product_id: null });
  const emptyGoods: GoodsRow = createEmptyGoods();
  const [goodsRows, setGoodsRows] = useState<GoodsRow[]>([{ ...emptyGoods }]);
  const [goodsSearch, setGoodsSearch] = useState('');
  const draftStorageKey = `workshop-order-draft:${order.id}`;

  useEffect(() => {
    setTaskPreview(null);
    setGoodsPreview(null);
    setDraggingTaskId(null);
    setDraggingGoodsId(null);
    setTaskDropIndicator(null);
    setGoodsDropIndicator(null);
  }, [order.items]);

  const syncPrice = (val: number, field: 'net' | 'gross') => {
    if (field === 'net') return { net: val, gross: Math.round(val * VAT_RATE * 100) / 100 };
    return { net: Math.round(val / VAT_RATE * 100) / 100, gross: val };
  };

  const calcDiscountedValue = (rawValue: number, discount: number, discountType: DiscountType) => {
    if (discountType === 'amount') return Math.max(0, rawValue - discount);
    return Math.max(0, rawValue - (rawValue * discount / 100));
  };

  const getDraftPrice = (row: Pick<TaskRow | GoodsRow, 'price_net' | 'price_gross'>, gross: boolean) => {
    const grossValue = safeNumber(row.price_gross);
    const netValue = safeNumber(row.price_net);
    return gross
      ? (grossValue || (netValue > 0 ? netValue * VAT_RATE : 0))
      : (netValue || (grossValue > 0 ? grossValue / VAT_RATE : 0));
  };

  const getDraftCost = (row: Pick<TaskRow | GoodsRow, 'cost_net' | 'cost_gross'>, gross: boolean) => {
    const grossValue = safeNumber(row.cost_gross);
    const netValue = safeNumber(row.cost_net);
    return gross
      ? (grossValue || (netValue > 0 ? netValue * VAT_RATE : 0))
      : (netValue || (grossValue > 0 ? grossValue / VAT_RATE : 0));
  };

  const hasTaskDraftValue = (row: TaskRow) => row.name.trim().length > 0 || row.mechanic.trim().length > 0 || getDraftPrice(row, true) > 0 || getDraftCost(row, true) > 0;
  const hasGoodsDraftValue = (row: GoodsRow) => row.name.trim().length > 0 || row.unit.trim().length > 0 || getDraftPrice(row, true) > 0 || getDraftCost(row, true) > 0;

  const isTaskDraftFilled = (row: TaskRow) => row.name.trim().length > 0 && getDraftPrice(row, isTaskGross) > 0;
  const isGoodsDraftFilled = (row: GoodsRow) => row.name.trim().length > 0 && getDraftPrice(row, isGoodsGross) > 0;

  const getDraftTaskTotal = (row: TaskRow) => {
    const raw = row.quantity * getDraftPrice(row, isTaskGross);
    return calcDiscountedValue(raw, row.discount, row.discountType);
  };

  const getDraftTaskCost = (row: TaskRow) => getDraftCost(row, isTaskGross) * row.quantity;

  const getDraftGoodsTotal = (row: GoodsRow) => {
    const raw = row.quantity * getDraftPrice(row, isGoodsGross);
    return calcDiscountedValue(raw, row.discount, row.discountType);
  };

  const getDraftGoodsCost = (row: GoodsRow) => getDraftCost(row, isGoodsGross) * row.quantity;

  const getNextSortOrder = (items: any[]) => items.reduce((max, item) => {
    const currentOrder = typeof item?.sort_order === 'number' ? item.sort_order : -1;
    return Math.max(max, currentOrder);
  }, -1) + 1;

  // ======================================================================
  // PERF P4: kolejka commitów pozycji.
  // Każdy Enter/auto-save DOKŁADA wiersze do wspólnej kolejki zamiast odpalać
  // własną równoległą pętlę zapisu (wyścig: kolizje sort_order z nieświeżego
  // cache + refetch całej listy per pozycja = przeskakująca tabela).
  //  - optimistic insert do cache dzieje się synchronicznie przy enqueue
  //    (pozycja widoczna od razu, mimo że paczka leci później),
  //  - paczka zbierana w oknie ~400 ms od PIERWSZEJ pozycji leci JEDNYM
  //    upsertem (createWorkshopOrderItemsBatch: 1 request + 1 recompute),
  //  - kolejne paczki serializuje łańcuch promise (zero równoległości),
  //  - invalidacja listy raz, po opróżnieniu kolejki (realtime B1 i tak
  //    merguje INSERT-y; refetch tylko domyka spójność),
  //  - toast zbiorczy "Dodano N pozycji" per paczka,
  //  - błąd paczki: wiersze znikają z cache, drafty wracają do poprawki.
  const pendingEntriesRef = useRef<CommitEntry[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushChainRef = useRef<Promise<void>>(Promise.resolve());
  const drainResolversRef = useRef<Array<() => void>>([]);
  // Liczniki sort_order: alokacja synchroniczna przy Enter — cache bywa
  // nieświeży między szybkimi Enterami, więc licznik ref wygrywa z bazą
  // (max), a przy zewnętrznych zmianach (inny user, drag&drop) baza dogania.
  const taskSortRef = useRef<number | null>(null);
  const goodsSortRef = useRef<number | null>(null);

  const allocSortOrder = (kind: 'task' | 'goods') => {
    const ref = kind === 'task' ? taskSortRef : goodsSortRef;
    const base = getNextSortOrder(kind === 'task' ? tasks : goods);
    const val = Math.max(ref.current ?? base, base);
    ref.current = val + 1;
    return val;
  };

  const patchCachesWithItems = (items: any[]) => {
    queryClient.setQueriesData({ queryKey: ['workshop-orders'] }, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((o: any) => {
        if (o?.id !== order.id) return o;
        const existing = Array.isArray(o.items) ? o.items : [];
        const fresh = items.filter((it) => !existing.some((e: any) => e.id === it.id));
        return fresh.length ? { ...o, items: [...existing, ...fresh] } : o;
      });
    });
  };

  const removeItemsFromCaches = (items: any[]) => {
    const ids = new Set(items.map((it) => it.id));
    queryClient.setQueriesData({ queryKey: ['workshop-orders'] }, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((o: any) =>
        o?.id === order.id && Array.isArray(o.items)
          ? { ...o, items: o.items.filter((it: any) => !ids.has(it.id)) }
          : o
      );
    });
  };

  const flushPendingEntries = async () => {
    const batch = pendingEntriesRef.current;
    pendingEntriesRef.current = [];
    const resolvers = drainResolversRef.current;
    drainResolversRef.current = [];
    if (batch.length > 0) {
      try {
        await createWorkshopOrderItemsBatch(batch.map((e) => e.payload));
        batch.forEach((e) => e.onCommitted?.());
        toast.success(t('workshop.orderTasks.itemsAdded', { count: batch.length }));
      } catch (e: any) {
        removeItemsFromCaches(batch.map((entry) => entry.payload));
        batch.forEach((entry) => entry.restore());
        toast.error(e?.message || t('common.saveError'));
      }
    }
    resolvers.forEach((resolve) => resolve());
    if (pendingEntriesRef.current.length === 0 && !flushTimerRef.current) {
      queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });
    }
  };

  /** Zwrócona obietnica rozwiązuje się, gdy paczka z tymi wierszami jest
   *  zapisana w bazie (albo przywrócona do draftów po błędzie). */
  const enqueueEntries = (entries: CommitEntry[]) => {
    if (entries.length === 0) return Promise.resolve();
    // Jak w dawnym onMutate: utnij refetche w locie, żeby odpowiedź sprzed
    // Entera nie nadpisała na chwilę cache bez świeżo dodanych wierszy.
    void queryClient.cancelQueries({ queryKey: ['workshop-orders'] });
    patchCachesWithItems(entries.map((e) => e.payload));
    pendingEntriesRef.current.push(...entries);
    return new Promise<void>((resolve) => {
      drainResolversRef.current.push(resolve);
      // Okno liczone od PIERWSZEJ pozycji paczki (bez resetu przy kolejnych) —
      // szybkie Entery sklejają się, a zapis nie odwleka się w nieskończoność.
      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(() => {
          flushTimerRef.current = null;
          flushChainRef.current = flushChainRef.current.then(flushPendingEntries);
        }, 400);
      }
    });
  };

  const clearTaskDragState = () => {
    setDraggingTaskId(null);
    setTaskDropIndicator(null);
  };

  const clearGoodsDragState = () => {
    setDraggingGoodsId(null);
    setGoodsDropIndicator(null);
  };

  const focusTaskDraftRow = (draftKey?: string) => {
    if (!draftKey) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const input = serviceCardRef.current?.querySelector<HTMLInputElement>(`tr[data-task-draft-key="${draftKey}"] input`);
        input?.focus();
      });
    });
  };

  const focusGoodsDraftRow = (draftKey?: string) => {
    if (!draftKey) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const input = goodsCardRef.current?.querySelector<HTMLInputElement>(`tr[data-goods-draft-key="${draftKey}"] input`);
        input?.focus();
      });
    });
  };

  const getDropIndicator = (event: DragEvent<HTMLTableRowElement>, index: number): DropIndicator => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY - bounds.top < bounds.height / 2 ? 'before' : 'after';
    return { index, position };
  };

  const persistSortOrder = async (items: any[]) => {
    const results = await Promise.all(
      items.map((item, index) =>
        (supabase as any)
          .from('workshop_order_items')
          .update({ sort_order: index })
          .eq('id', item.id)
      )
    );

    const failedUpdate = results.find((result: any) => result.error);
    if (failedUpdate?.error) throw failedUpdate.error;

    await queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });
  };

  const reorderItems = async (
    items: any[],
    activeId: string,
    indicator: DropIndicator | null,
    setPreview: (nextItems: any[] | null) => void,
    clearDragState: () => void,
  ) => {
    const fromIndex = items.findIndex(item => item.id === activeId);
    if (fromIndex === -1) {
      clearDragState();
      return;
    }

    let targetIndex = indicator ? indicator.index : fromIndex;
    if (indicator?.position === 'after') targetIndex += 1;
    if (targetIndex > items.length) targetIndex = items.length;
    if (targetIndex > fromIndex) targetIndex -= 1;

    if (targetIndex === fromIndex) {
      clearDragState();
      return;
    }

    const reorderedItems = moveItem(items, fromIndex, targetIndex).map((item, index) => ({
      ...item,
      sort_order: index,
    }));

    setPreview(reorderedItems);
    clearDragState();

    try {
      await persistSortOrder(reorderedItems);
    } catch (error: any) {
      setPreview(null);
      toast.error(error?.message || t('workshop.orderTasks.reorderError'));
    }
  };

  const getTaskRowClasses = (item: any, index: number) => {
    const itemId = item?.id;
    const isDragging = draggingTaskId === itemId;
    const isDropBefore = taskDropIndicator?.index === index && taskDropIndicator.position === 'before';
    const isDropAfter = taskDropIndicator?.index === index && taskDropIndicator.position === 'after';
    const isAddon = !!item?.is_addon;

    return [
      'border-b text-sm transition-colors',
      isAddon
        ? 'bg-red-50 ring-1 ring-red-400 hover:bg-red-100'
        : (isDragging ? 'bg-accent/40 opacity-60' : 'hover:bg-accent/30'),
      isDropBefore ? 'border-t-2 border-t-primary' : '',
      isDropAfter ? 'border-b-2 border-b-primary' : '',
    ].filter(Boolean).join(' ');
  };

  const getGoodsRowClasses = (item: any, index: number) => {
    const itemId = item?.id;
    const isDragging = draggingGoodsId === itemId;
    const isDropBefore = goodsDropIndicator?.index === index && goodsDropIndicator.position === 'before';
    const isDropAfter = goodsDropIndicator?.index === index && goodsDropIndicator.position === 'after';
    const isAddon = !!item?.is_addon;

    return [
      'border-b text-sm transition-colors',
      isAddon
        ? 'bg-red-50 ring-1 ring-red-400 hover:bg-red-100'
        : (isDragging ? 'bg-accent/40 opacity-60' : 'hover:bg-accent/30'),
      isDropBefore ? 'border-t-2 border-t-primary' : '',
      isDropAfter ? 'border-b-2 border-b-primary' : '',
    ].filter(Boolean).join(' ');
  };

  // Client confirmation warning check
  const showQuoteWarningIfNeeded = () => {
    // FIX: ostrzegaj przy KAŻDEJ realnej zmianie podpisanej wyceny (nie „raz i
    // koniec") — każda zmiana = przypomnienie, że trzeba wysłać ponownie.
    if (order.quote_accepted) {
      toast.warning(t('workshop.orderTasks.quoteAcceptedWarning'), {
        duration: 6000,
        icon: <AlertTriangle className="h-5 w-5" />,
      });
    }
  };

  // Task row handlers
  const updateTaskRow = (idx: number, updates: Partial<TaskRow>) => {
    setTaskRows(prev => prev.map((r, i) => i === idx ? { ...r, ...updates } : r));
  };

  const updateTaskRowPrice = (idx: number, val: number) => {
    const { net, gross } = syncPrice(val, isTaskGross ? 'gross' : 'net');
    updateTaskRow(idx, { price_net: net, price_gross: gross });
  };

  const addTaskRow = async () => {
    // Auto-save any filled draft rows first, so that pressing Enter / "Dodaj usługę"
    // commits the previous row to DB before opening a new empty draft.
    const filled = taskRows.filter(isTaskDraftFilled);
    const incomplete = taskRows.filter(r => !r.name.trim() && getDraftPrice(r, isTaskGross) > 0);
    if (incomplete.length > 0) {
      toast.error(t('workshop.orderTasks.fillServiceName'), {
        icon: <AlertTriangle className="h-5 w-5" />,
      });
      return;
    }
    if (filled.length > 0) {
      // PERF P4: draft znika SYNCHRONICZNIE (optimistic insert w enqueueEntries
      // od razu pokazuje pozycję wśród zapisanych — bez kolizji klucza React,
      // bo zapisany wiersz dostaje id = draftKey, a draft prefiks "draft-").
      // Zapis idzie przez wspólną kolejkę: zero równoległych pętli i wyścigu
      // o sort_order przy szybkim dodawaniu.
      showQuoteWarningIfNeeded();
      const entries = filled.map(buildTaskEntry);
      const nextRow = createEmptyTask();
      setTaskRows([nextRow]);
      requestAnimationFrame(() => focusTaskDraftRow(nextRow.draftKey));
      void enqueueEntries(entries);
      return;
    }
    const nextRow = createEmptyTask();
    setTaskRows(prev => [...prev, nextRow]);
    focusTaskDraftRow(nextRow.draftKey);
  };

  const removeTaskRow = (idx: number) => {
    if (taskRows.length <= 1) {
      setTaskRows([createEmptyTask()]);
      return;
    }
    setTaskRows(prev => prev.filter((_, i) => i !== idx));
  };

  // PERF P4: buduje wpis kolejki dla draftu usługi. Sam zapis wykonuje kolejka
  // (enqueueEntries): restore przywraca padnięty draft do poprawki, onCommitted
  // dopisuje historię cen dopiero PO udanym zapisie paczki. Toast sukcesu jest
  // zbiorczy per paczka (flushPendingEntries), nie per wiersz.
  const buildTaskEntry = (row: TaskRow): CommitEntry => {
    const rawTotal = isTaskGross ? row.quantity * row.price_gross : row.quantity * row.price_net;
    const totalAfterDiscount = row.discountType === 'percent'
      ? rawTotal - (rawTotal * row.discount / 100)
      : rawTotal - row.discount;
    const discountPercent = rawTotal > 0 ? ((rawTotal - totalAfterDiscount) / rawTotal) * 100 : 0;
    return {
      payload: {
        // Stable client id from the draft row → idempotent commit. A re-commit of the
        // same draft (auto-save race / tab remount restoring the draft) reuses this id
        // and is ignored by the upsert instead of producing a duplicate line.
        id: row.draftKey || crypto.randomUUID(),
        order_id: order.id,
        item_type: 'service',
        name: row.name,
        mechanic: row.mechanic || null,
        unit: 'oper',
        quantity: row.quantity,
        sort_order: allocSortOrder('task'),
        unit_price_gross: row.price_gross,
        unit_price_net: row.price_net,
        unit_cost_net: row.cost_net,
        unit_cost_gross: row.cost_gross,
        discount_percent: discountPercent,
        total_gross: isTaskGross ? totalAfterDiscount : totalAfterDiscount * VAT_RATE,
        total_net: isTaskGross ? totalAfterDiscount / VAT_RATE : totalAfterDiscount,
      },
      restore: () => setTaskRows(prev => [...prev.filter(r => r.draftKey !== row.draftKey), row]),
      onCommitted: () => {
        // Save to price history
        saveServicePrice.mutate({ name: row.name, priceNet: row.price_net, priceGross: row.price_gross });
        // Save anonymous data if enabled
        if (ridoPriceSettings?.share_anonymous_data !== false) {
          saveAnonymousPrice.mutate({
            name: row.name,
            priceNet: row.price_net,
            priceGross: row.price_gross,
            brand: order.vehicle?.brand,
            model: order.vehicle?.model,
            engineCapacity: order.vehicle?.engine_capacity,
            city: order.client?.city,
            industry: ridoPriceSettings?.industry || 'warsztat',
          });
        }
      },
    };
  };

  // Goods row handlers
  const updateGoodsRow = (idx: number, updates: Partial<GoodsRow>) => {
    setGoodsRows(prev => prev.map((r, i) => i === idx ? { ...r, ...updates } : r));
  };

  const updateGoodsRowPrice = (idx: number, val: number) => {
    const { net, gross } = syncPrice(val, isGoodsGross ? 'gross' : 'net');
    updateGoodsRow(idx, { price_net: net, price_gross: gross });
  };

  const updateGoodsRowCost = (idx: number, val: number) => {
    const { net, gross } = syncPrice(val, isGoodsGross ? 'gross' : 'net');
    updateGoodsRow(idx, { cost_net: net, cost_gross: gross });
  };

  const addGoodsRow = async () => {
    const filled = goodsRows.filter(isGoodsDraftFilled);
    const incomplete = goodsRows.filter(r => !r.name.trim() && getDraftPrice(r, isGoodsGross) > 0);
    if (incomplete.length > 0) {
      toast.error(t('workshop.orderTasks.fillPartName'), {
        icon: <AlertTriangle className="h-5 w-5" />,
      });
      return;
    }
    if (filled.length > 0) {
      // PERF P4: jak w addTaskRow — draft znika synchronicznie, zapis przez
      // wspólną kolejkę (optimistic insert od razu, paczka jednym upsertem).
      showQuoteWarningIfNeeded();
      const entries = filled.map(buildGoodsEntry);
      const nextRow = createEmptyGoods();
      setGoodsRows([nextRow]);
      requestAnimationFrame(() => focusGoodsDraftRow(nextRow.draftKey));
      void enqueueEntries(entries);
      return;
    }
    const nextRow = createEmptyGoods();
    setGoodsRows(prev => [...prev, nextRow]);
    focusGoodsDraftRow(nextRow.draftKey);
  };

  const removeGoodsRow = (idx: number) => {
    if (goodsRows.length <= 1) {
      setGoodsRows([createEmptyGoods()]);
      return;
    }
    setGoodsRows(prev => prev.filter((_, i) => i !== idx));
  };

  // PERF P4: jak buildTaskEntry — wpis kolejki dla draftu części.
  const buildGoodsEntry = (row: GoodsRow): CommitEntry => {
    const rawTotal = isGoodsGross ? row.quantity * row.price_gross : row.quantity * row.price_net;
    const totalAfterDiscount = row.discountType === 'percent'
      ? rawTotal - (rawTotal * row.discount / 100)
      : rawTotal - row.discount;
    const discountPercent = rawTotal > 0 ? ((rawTotal - totalAfterDiscount) / rawTotal) * 100 : 0;
    return {
      payload: {
        // Stable client id from the draft row → idempotent commit (see buildTaskEntry).
        id: row.draftKey || crypto.randomUUID(),
        order_id: order.id,
        item_type: 'part',
        name: row.name,
        unit: row.unit,
        quantity: row.quantity,
        inventory_product_id: row.inventory_product_id || null,
        sort_order: allocSortOrder('goods'),
        unit_price_gross: row.price_gross,
        unit_price_net: row.price_net,
        unit_cost_net: row.cost_net,
        unit_cost_gross: row.cost_gross,
        discount_percent: discountPercent,
        total_gross: isGoodsGross ? totalAfterDiscount : totalAfterDiscount * VAT_RATE,
        total_net: isGoodsGross ? totalAfterDiscount / VAT_RATE : totalAfterDiscount,
      },
      restore: () => setGoodsRows(prev => [...prev.filter(r => r.draftKey !== row.draftKey), row]),
    };
  };

  // Inline edit saved items
  const startEdit = (itemId: string, field: string, currentValue: string | number) => {
    // FIX: NIE ostrzegaj przy samym kliknięciu w pole — ostrzeżenie tylko przy
    // FAKTYCZNEJ zmianie (patrz saveEdit, który pomija zapis gdy wartość ta sama).
    setEditingItemId(itemId);
    setEditingField(field);
    if (field === 'price' || field === 'cost' || field === 'quantity') {
      const normalized = String(currentValue).replace(',', '.');
      const numericValue = Number(normalized);
      setEditingValue(numericValue === 0 ? '' : normalized);
      return;
    }
    setEditingValue(String(currentValue));
  };

  const saveEdit = async (item: any) => {
    if (!editingItemId || !editingField) return;
    // Snapshot edit state and clear it BEFORE awaiting the mutation. Otherwise the
    // post-await reset can clobber a NEW edit the user started by clicking another
    // input (causing the previous edit to appear unsaved / reset to 0,00).
    const myId = editingItemId;
    const myField = editingField;
    const myValue = editingValue;
    setEditingItemId(null);
    setEditingField(null);
    setEditingValue('');

    const updates: any = {};
    const isService = item.item_type === 'service' || item.item_type === 'task';
    const gross = isService ? isTaskGross : isGoodsGross;

    // FIX: każde pole zapisujemy TYLKO gdy realna wartość się zmieniła — samo
    // wejście/wyjście z pola (bez zmiany) nie ma generować zapisu ani flagi
    // "zmiana po wysłaniu wyceny".
    if (myField === 'name') {
      // Nie nadpisuj oryginału mechanika, jeśli admin nie zmienił przetłumaczonej nazwy
      if (myValue !== nameDisplay(item)) updates.name = myValue;
    } else if (myField === 'quantity') {
      const newQty = Math.max(1, parseInt(myValue) || 1);
      if (newQty !== (safeNumber(item.quantity) || 1)) {
        updates.quantity = newQty;
        const unitPrice = gross ? safeNumber(item.unit_price_gross) : safeNumber(item.unit_price_net);
        const rawTotal = newQty * unitPrice;
        const disc = item.discount_percent || 0;
        const afterDiscount = rawTotal - (rawTotal * disc / 100);
        updates.total_gross = gross ? afterDiscount : afterDiscount * VAT_RATE;
        updates.total_net = gross ? afterDiscount / VAT_RATE : afterDiscount;
      }
    } else if (myField === 'price') {
      const val = parseFloat(myValue.replace(',', '.')) || 0;
      const synced = syncPrice(val, gross ? 'gross' : 'net');
      if (synced.net !== safeNumber(item.unit_price_net) || synced.gross !== safeNumber(item.unit_price_gross)) {
        updates.unit_price_net = synced.net;
        updates.unit_price_gross = synced.gross;
        const rawTotal = (item.quantity || 1) * (gross ? synced.gross : synced.net);
        const disc = item.discount_percent || 0;
        const afterDiscount = rawTotal - (rawTotal * disc / 100);
        updates.total_gross = gross ? afterDiscount : afterDiscount * VAT_RATE;
        updates.total_net = gross ? afterDiscount / VAT_RATE : afterDiscount;
      }
    } else if (myField === 'cost') {
      const val = parseFloat(myValue.replace(',', '.')) || 0;
      const synced = syncPrice(val, gross ? 'gross' : 'net');
      if (synced.net !== safeNumber(item.unit_cost_net) || synced.gross !== safeNumber(item.unit_cost_gross)) {
        updates.unit_cost_net = synced.net;
        updates.unit_cost_gross = synced.gross;
      }
    } else if (myField === 'mechanic') {
      if ((myValue || null) !== (item.mechanic || null)) updates.mechanic = myValue || null;
    } else if (myField === 'labor_hours') {
      const hours = parseFloat(myValue.replace(',', '.')) || 0;
      if (hours !== safeNumber(item.labor_hours)) {
        updates.labor_hours = hours;
        const emp = workshopEmployees.find((e: any) => e.id === item.employee_id);
        const hourlyRate = emp?.salary ? emp.salary / 160 : (workshopSettings?.hourly_rate || 150);
        updates.labor_cost = Math.round(hours * hourlyRate * 100) / 100;
      }
    } else if (myField === 'unit') {
      const newUnit = (myValue || '').trim() || 'szt';
      if (newUnit !== (item.unit || 'szt')) updates.unit = newUnit;
    } else if (myField === 'discount') {
      const disc = Math.max(0, Math.min(100, parseFloat(myValue.replace(',', '.')) || 0));
      if (disc !== safeNumber(item.discount_percent)) {
        updates.discount_percent = disc;
        const qty = safeNumber(item.quantity) || 1;
        const unitPrice = gross ? safeNumber(item.unit_price_gross) : safeNumber(item.unit_price_net);
        const rawTotal = qty * unitPrice;
        const afterDiscount = rawTotal - (rawTotal * disc / 100);
        updates.total_gross = gross ? afterDiscount : afterDiscount * VAT_RATE;
        updates.total_net = gross ? afterDiscount / VAT_RATE : afterDiscount;
      }
    }

    if (Object.keys(updates).length === 0) return; // nic się nie zmieniło — nie zapisuj
    showQuoteWarningIfNeeded(); // ostrzeżenie TYLKO przy realnej zmianie podpisanej wyceny
    await updateItem.mutateAsync({ id: myId, ...updates });
  };

  const cancelEdit = () => {
    setEditingItemId(null);
    setEditingField(null);
  };

  const handleDeleteItem = async (id: string) => {
    showQuoteWarningIfNeeded();
    await deleteItem.mutateAsync(id);
    toast.success(t('workshop.workList.itemRemoved'));
  };

  const fmt = (v: number) => v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getTaskItemPrice = (item: any) => isTaskGross ? safeNumber(item.unit_price_gross) : safeNumber(item.unit_price_net);
  const getTaskItemTotal = (item: any) => getLineTotal(item, isTaskGross);
  const getGoodsItemPrice = (item: any) => isGoodsGross ? safeNumber(item.unit_price_gross) : safeNumber(item.unit_price_net);
  const getGoodsItemCost = (item: any) => getLineCost(item, isGoodsGross) / (safeNumber(item.quantity) || 1);
  const getGoodsItemTotal = (item: any) => getLineTotal(item, isGoodsGross);

  const tasksTotal = tasks.reduce((s: number, t: any) => s + getTaskItemTotal(t), 0);
  const goodsTotal = goods.reduce((s: number, g: any) => s + getGoodsItemTotal(g), 0);
  const tasksCost = tasks.reduce((s: number, t: any) => s + getLineCost(t, isTaskGross), 0);
  const goodsCost = goods.reduce((s: number, g: any) => s + getLineCost(g, isGoodsGross), 0);
  const savedTasksNetTotal = tasks.reduce((s: number, t: any) => s + getLineTotal(t, false), 0);
  const savedGoodsNetTotal = goods.reduce((s: number, g: any) => s + getLineTotal(g, false), 0);
  const savedGrandGrossTotal = tasks.reduce((s: number, t: any) => s + getLineTotal(t, true), 0) + goods.reduce((s: number, g: any) => s + getLineTotal(g, true), 0);
  const savedGrandNetTotal = savedTasksNetTotal + savedGoodsNetTotal;

  const draftTasksTotal = taskRows.reduce((sum, row) => sum + (isTaskDraftFilled(row) ? getDraftTaskTotal(row) : 0), 0);
  const draftTasksCost = taskRows.reduce((sum, row) => sum + (isTaskDraftFilled(row) ? getDraftTaskCost(row) : 0), 0);
  const draftGoodsTotal = goodsRows.reduce((sum, row) => sum + (isGoodsDraftFilled(row) ? getDraftGoodsTotal(row) : 0), 0);
  const draftGoodsCost = goodsRows.reduce((sum, row) => sum + (isGoodsDraftFilled(row) ? getDraftGoodsCost(row) : 0), 0);

  const displayTasksTotal = tasksTotal + draftTasksTotal;
  const displayGoodsTotal = goodsTotal + draftGoodsTotal;
  const displayTasksProfit = displayTasksTotal - (tasksCost + draftTasksCost);
  const displayGoodsProfit = displayGoodsTotal - (goodsCost + draftGoodsCost);
  const displayGrandTotal = displayTasksTotal + displayGoodsTotal;
  const displayGrandCost = tasksCost + goodsCost + draftTasksCost + draftGoodsCost;
  const displayGrandProfit = displayGrandTotal - displayGrandCost;

  // Load drafts from localStorage ONCE on mount, and deduplicate against already-saved items
  // to prevent re-saving rows that were already persisted in a previous session
  // (which caused duplicate items each time the order was re-opened).
  const draftLoadedRef = useRef(false);
  useEffect(() => {
    if (draftLoadedRef.current) return;
    draftLoadedRef.current = true;
    try {
      const rawDraft = localStorage.getItem(draftStorageKey);
      if (!rawDraft) return;

      const parsed = JSON.parse(rawDraft);

      // Primary dedup: a committed item now carries an id equal to the draft row's
      // draftKey, so a restored draft whose item already exists is matched exactly
      // (independent of name edits / translations).
      const savedItemIds = new Set(
        ((order.items || []) as any[])
          .map((i) => String(i.id || ''))
          .filter(Boolean)
      );
      // Secondary dedup (legacy items without a draftKey-based id): match by name.
      const savedTaskNames = new Set(
        ((order.items || []) as any[])
          .filter((i) => i.item_type === 'service' || i.item_type === 'task' || (i.item_type !== 'part' && i.item_type !== 'goods' && i.item_type !== 'other'))
          .map((i) => String(i.name || '').trim().toLowerCase())
          .filter(Boolean)
      );
      const savedGoodsNames = new Set(
        ((order.items || []) as any[])
          .filter((i) => i.item_type === 'part' || i.item_type === 'goods' || i.item_type === 'other')
          .map((i) => String(i.name || '').trim().toLowerCase())
          .filter(Boolean)
      );

      const filteredTasks = Array.isArray(parsed?.tasks)
        ? parsed.tasks.filter((row: TaskRow) => {
            if (row.draftKey && savedItemIds.has(String(row.draftKey))) return false;
            const key = String(row.name || '').trim().toLowerCase();
            return key && !savedTaskNames.has(key);
          })
        : [];
      const filteredGoods = Array.isArray(parsed?.goods)
        ? parsed.goods.filter((row: GoodsRow) => {
            if (row.draftKey && savedItemIds.has(String(row.draftKey))) return false;
            const key = String(row.name || '').trim().toLowerCase();
            return key && !savedGoodsNames.has(key);
          })
        : [];

      if (filteredTasks.length > 0) {
        setTaskRows(filteredTasks.map((row: TaskRow) => ({ ...createEmptyTask(), ...row, draftKey: row.draftKey || crypto.randomUUID() })));
      }
      if (filteredGoods.length > 0) {
        setGoodsRows(filteredGoods.map((row: GoodsRow) => ({ ...createEmptyGoods(), ...row, draftKey: row.draftKey || crypto.randomUUID() })));
      }

      // If everything in draft was already saved, clear the stale draft now
      if (filteredTasks.length === 0 && filteredGoods.length === 0) {
        localStorage.removeItem(draftStorageKey);
      }
    } catch {
      localStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey, order.items]);

  useEffect(() => {
    const draftPayload = {
      tasks: taskRows.filter(hasTaskDraftValue),
      goods: goodsRows.filter(hasGoodsDraftValue),
    };

    if (draftPayload.tasks.length === 0 && draftPayload.goods.length === 0) {
      localStorage.removeItem(draftStorageKey);
      return;
    }

    localStorage.setItem(draftStorageKey, JSON.stringify(draftPayload));
  }, [draftStorageKey, taskRows, goodsRows]);

  // Sync order totals to DB whenever saved items change
  useEffect(() => {
    const currentGross = safeNumber(order.total_gross);
    const currentNet = safeNumber(order.total_net);
    if (Math.abs(currentGross - savedGrandGrossTotal) < 0.01 && Math.abs(currentNet - savedGrandNetTotal) < 0.01) {
      return;
    }

    // Single write path: updateOrder already updates workshop_orders and invalidates
    // the cache on success. The previous direct supabase.update() + updateOrder.mutate()
    // wrote the same row twice and triggered an extra refetch on every item change.
    updateOrder.mutate({ id: order.id, total_gross: savedGrandGrossTotal, total_net: savedGrandNetTotal });
  }, [order.id, order.total_gross, order.total_net, savedGrandGrossTotal, savedGrandNetTotal]);

  const saveTaskDraftRows = async (focusNewRow = false) => {
    // Detect rows with price but no name — warn user instead of silently dropping
    const incompleteRows = taskRows.filter(r => !r.name.trim() && getDraftPrice(r, isTaskGross) > 0);
    if (incompleteRows.length > 0) {
      toast.error(t('workshop.orderTasks.fillServiceName'), {
        icon: <AlertTriangle className="h-5 w-5" />,
      });
      // Don't auto-save anything; let the user fix the row
      return;
    }
    const rowsToSave = taskRows.filter(isTaskDraftFilled);
    if (rowsToSave.length === 0) {
      // Don't add extra rows, just ensure there's at least one empty row
      if (taskRows.length === 0) setTaskRows([createEmptyTask()]);
      return;
    }

    // PERF P4: reset draftów synchronicznie, zapis przez wspólną kolejkę.
    // await = wiersze SĄ w bazie (albo wróciły do draftów po błędzie) — na tym
    // polegają wołający, np. "zapisz wszystko" przed podglądem kosztorysu.
    showQuoteWarningIfNeeded();
    const entries = rowsToSave.map(buildTaskEntry);
    setTaskRows([createEmptyTask()]);
    await enqueueEntries(entries);

    if (focusNewRow) {
      // Focus the first service input in the new row after React re-render
      requestAnimationFrame(() => {
        const inputs = serviceCardRef.current?.querySelectorAll<HTMLInputElement>('tr.bg-primary\\/5 input[type="text"], tr.bg-primary\\/5 input:not([type])');
        if (inputs && inputs.length > 0) inputs[0].focus();
      });
    }
  };


  const saveGoodsDraftRows = async (focusNewRow = false) => {
    const incompleteRows = goodsRows.filter(r => !r.name.trim() && getDraftPrice(r, isGoodsGross) > 0);
    if (incompleteRows.length > 0) {
      toast.error(t('workshop.orderTasks.fillPartName'), {
        icon: <AlertTriangle className="h-5 w-5" />,
      });
      return;
    }
    const rowsToSave = goodsRows.filter(isGoodsDraftFilled);
    if (rowsToSave.length === 0) {
      // Don't add extra rows, just ensure there's at least one empty row
      if (goodsRows.length === 0) setGoodsRows([createEmptyGoods()]);
      return;
    }

    // PERF P4: reset draftów synchronicznie, zapis przez wspólną kolejkę (jw.).
    showQuoteWarningIfNeeded();
    const entries = rowsToSave.map(buildGoodsEntry);
    setGoodsRows([createEmptyGoods()]);
    await enqueueEntries(entries);

    if (focusNewRow) {
      requestAnimationFrame(() => {
        const inputs = goodsCardRef.current?.querySelectorAll<HTMLInputElement>('tr.bg-amber-500\\/5 input[type="text"], tr.bg-amber-500\\/5 input:not([type])');
        if (inputs && inputs.length > 0) inputs[0].focus();
      });
    }
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;

      // Ignore clicks inside autocomplete dropdowns - they should only fill the row, never auto-save
      if (target instanceof Element && target.closest('[data-autocomplete-dropdown="true"]')) {
        return;
      }
      // Ignore clicks on the Rido Wycena trigger or any Radix dialog/popover/select content —
      // opening these should NOT auto-save drafts (preserves the input layout).
      if (
        target instanceof Element &&
        target.closest(
          '[data-rido-estimate-trigger="true"], [role="dialog"], [data-radix-popper-content-wrapper], [data-radix-select-content], [data-radix-popover-content]',
        )
      ) {
        return;
      }

      if (
        serviceCardRef.current &&
        !serviceCardRef.current.contains(target) &&
        taskRows.some(isTaskDraftFilled) &&
        !autoSavingTaskDraftsRef.current
      ) {
        autoSavingTaskDraftsRef.current = true;
        void saveTaskDraftRows().finally(() => {
          autoSavingTaskDraftsRef.current = false;
        });
      }

      if (
        goodsCardRef.current &&
        !goodsCardRef.current.contains(target) &&
        goodsRows.some(isGoodsDraftFilled) &&
        !autoSavingGoodsDraftsRef.current
      ) {
        autoSavingGoodsDraftsRef.current = true;
        void saveGoodsDraftRows().finally(() => {
          autoSavingGoodsDraftsRef.current = false;
        });
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [taskRows, goodsRows, saveTaskDraftRows, saveGoodsDraftRows]);


  // Inline rabat editor for saved rows (persistent % / zł selector + input)
  const SavedRowDiscountEditor = ({ item, isGross }: { item: any; isGross: boolean }) => {
    const qty = safeNumber(item.quantity) || 1;
    const unitPrice = isGross ? safeNumber(item.unit_price_gross) : safeNumber(item.unit_price_net);
    const rawTotal = qty * unitPrice;
    const savedPercent = safeNumber(item.discount_percent) || 0;
    const initialType: DiscountType = (item._discount_type_ui as DiscountType) || 'percent';
    const initialValue = initialType === 'amount'
      ? Math.round((rawTotal * savedPercent / 100) * 100) / 100
      : savedPercent;
    const [dType, setDType] = useState<DiscountType>(initialType);
    const [dValue, setDValue] = useState<number>(initialValue);

    const commit = async (nextType: DiscountType, nextValue: number) => {
      const safeVal = Math.max(0, nextValue || 0);
      let percent = 0;
      if (nextType === 'percent') {
        percent = Math.min(100, safeVal);
      } else if (rawTotal > 0) {
        percent = Math.min(100, (safeVal / rawTotal) * 100);
      }
      const afterDiscount = rawTotal - (rawTotal * percent / 100);
      await updateItem.mutateAsync({
        id: item.id,
        discount_percent: percent,
        total_gross: isGross ? afterDiscount : afterDiscount * VAT_RATE,
        total_net: isGross ? afterDiscount / VAT_RATE : afterDiscount,
      });
    };

    return (
      <div className="flex items-center gap-1 justify-center" onClick={e => e.stopPropagation()}>
        <Select
          value={dType}
          onValueChange={(v: DiscountType) => {
            setDType(v);
            commit(v, dValue);
          }}
        >
          <SelectTrigger className="h-9 text-xs w-16 shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="percent">%</SelectItem>
            <SelectItem value="amount">zł</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          placeholder="0"
          value={dValue || ''}
          onChange={e => setDValue(Number(e.target.value))}
          onBlur={() => commit(dType, dValue)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-9 text-sm text-right w-16 shrink-0"
        />
      </div>
    );
  };

  // Inline editable cell renderer
  const renderEditableCell = (
    item: any,
    field: string,
    displayValue: string,
    className: string = '',
    align: 'left' | 'center' | 'right' = 'left',
  ) => {
    const isEditing = editingItemId === item.id && editingField === field;
    const inputAlignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

    const getFieldValue = () => {
      if (field === 'name') return nameDisplay(item);
      if (field === 'mechanic') return item.mechanic || '';
      if (field === 'unit') return item.unit || '';
      if (field === 'price') {
        const isService = item.item_type === 'service' || item.item_type === 'task';
        return isService
          ? (isTaskGross ? item.unit_price_gross : item.unit_price_net) || 0
          : (isGoodsGross ? item.unit_price_gross : item.unit_price_net) || 0;
      }
      if (field === 'cost') {
        return isGoodsGross ? safeNumber(item.unit_cost_gross) : safeNumber(item.unit_cost_net);
      }
      if (field === 'quantity') {
        return safeNumber(item.quantity) || 1;
      }
      if (field === 'discount') {
        return safeNumber(item.discount_percent) || 0;
      }
      return displayValue;
    };

    if (isEditing) {
      return (
        <Input
          autoFocus
          value={editingValue}
          onChange={e => setEditingValue(e.target.value)}
          onFocus={e => e.currentTarget.select()}
          onBlur={() => saveEdit(item)}
          onKeyDown={e => {
            if (e.key === 'Enter') saveEdit(item);
            if (e.key === 'Escape') cancelEdit();
          }}
          className={`h-9 w-full text-sm ${inputAlignClass} ${className}`}
          type="text"
          inputMode={['price', 'cost', 'quantity'].includes(field) ? 'decimal' : undefined}
        />
      );
    }
    return (
      <button
        type="button"
        className={`flex h-9 w-full items-center rounded-md border border-input bg-background px-2 py-1 text-sm transition-colors hover:border-primary hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          align === 'right'
            ? 'justify-end text-right'
            : align === 'center'
              ? 'justify-center text-center'
              : 'justify-start text-left'
        } ${className}`}
        onClick={() => startEdit(item.id, field, getFieldValue())}
      >
        <span className={`block w-full min-w-0 ${field === 'name' || field === 'mechanic' ? 'truncate' : ''}`}>
          {displayValue}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Quote accepted warning banner */}
      {order.quote_accepted && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{t('workshop.orderTasks.quoteAcceptedBanner')}</span>
        </div>
      )}

      {/* Summary badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="outline" className="text-sm px-3 py-1.5 gap-1.5">
          <Wrench className="h-3.5 w-3.5" />
          {t('workshop.orderTasks.servicesLabel')}: {fmt(displayTasksTotal)}
        </Badge>
        <Badge variant="outline" className="text-sm px-3 py-1.5 gap-1.5">
          <Package className="h-3.5 w-3.5" />
          {t('workshop.orderTasks.partsLabel')}: {fmt(displayGoodsTotal)}
        </Badge>
        {displayGrandCost > 0 && (
          <Badge variant="secondary" className="text-sm px-3 py-1.5">
            {t('workshop.orderTasks.marginLabel')}: {fmt(displayGrandProfit)} ({displayGrandTotal > 0 ? Math.round((displayGrandProfit / displayGrandTotal) * 100) : 0}%)
          </Badge>
        )}
      </div>

      {/* SERVICES / ROBOCIZNA */}
      <div ref={serviceCardRef}>
      <Card className="border-l-4 border-l-primary">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-base">{t('workshop.orderTasks.laborServicesHeading')}</h3>
              <Badge variant="secondary" className="text-xs">{tasks.length}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                <Button variant={taskPriceMode === 'net' ? 'default' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setTaskPriceMode('net')}>{t('workshop.orderTasks.net')}</Button>
                <Button variant={taskPriceMode === 'gross' ? 'default' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setTaskPriceMode('gross')}>{t('workshop.orderTasks.gross')}</Button>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={taskSearch} onChange={e => setTaskSearch(e.target.value)} placeholder={t('workshop.orderTasks.searchServicePlaceholder')} className="pl-8 h-8 w-40 text-xs" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '40px' }} />
                <col style={{ width: '26%' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '170px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '72px' }} />
              </colgroup>
              <thead>
                <tr className="border-b bg-muted/10">
                  <th className="p-2 text-center font-medium text-muted-foreground">{t('workshop.orderTasks.colNo')}</th>
                  <th className="p-2 text-center text-[11px] font-medium text-muted-foreground">{t('workshop.orderTasks.colService')}</th>
                  <th className="p-2 text-center text-[11px] font-medium text-muted-foreground">{t('workshop.orderTasks.colEmployee')}</th>
                  <th className="p-2 text-center text-[11px] font-medium text-muted-foreground">{t('workshop.orderTasks.colTimeH')}</th>
                  <th className="p-2 text-center text-[11px] font-medium text-muted-foreground border-r border-border/60">{t('workshop.orderTasks.colPrice')}</th>
                  <th className="p-2 text-center text-[11px] font-medium text-muted-foreground border-l border-border/60 bg-muted/30">{t('workshop.orderTasks.colDiscount')}</th>
                  <th className="p-2 text-center text-[11px] font-medium text-muted-foreground">{t('workshop.orderTasks.colAfterDiscount')}</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task: any, i: number) => {
                  const quantity = safeNumber(task.quantity) || 1;
                  const price = getTaskItemPrice(task) * quantity;
                  const total = getTaskItemTotal(task);
                  const hasDiscount = getDiscountPercent(task) > 0;
                  return (
                    <tr
                      key={task.id}
                      className={getTaskRowClasses(task, i)}
                      onDragOver={event => {
                        if (!draggingTaskId) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setTaskDropIndicator(getDropIndicator(event, i));
                      }}
                      onDrop={async event => {
                        event.preventDefault();
                        if (!draggingTaskId) return;
                        await reorderItems(tasks, draggingTaskId, getDropIndicator(event, i), setTaskPreview, clearTaskDragState);
                      }}
                    >
                      <td className="p-2 text-center text-muted-foreground">{i + 1}</td>
                      <td className="p-1.5 font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            draggable
                            title={t('workshop.orderTasks.dragToReorder')}
                            className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
                            onDragStart={event => {
                              setDraggingTaskId(task.id);
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('text/plain', task.id);
                            }}
                            onDragEnd={clearTaskDragState}
                            onClick={event => event.stopPropagation()}
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <div className="min-w-0 flex-1">
                            {task.is_addon && (
                              <Badge className="mr-2 bg-red-600 text-white text-[9px] uppercase px-1.5 py-0 animate-pulse">{t('workshop.orderTasks.addonBadge')}</Badge>
                            )}
                            {renderEditableCell(task, 'name', nameDisplay(task))}
                          </div>
                        </div>
                      </td>
                      <td className="p-1.5 text-muted-foreground">
                        {workshopEmployees.length > 0 ? (
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={task.employee_id || ''}
                            onChange={async (e) => {
                              await updateItem.mutateAsync({ id: task.id, employee_id: e.target.value || null });
                            }}
                          >
                            <option value="">—</option>
                            {workshopEmployees.map((emp: any) => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </select>
                        ) : renderEditableCell(task, 'mechanic', task.mechanic || '—')}
                      </td>
                      <td className="p-1.5 tabular-nums">
                        {renderEditableCell(task, 'labor_hours', String(safeNumber(task.labor_hours) || '—'), 'tabular-nums', 'center')}
                      </td>
                      <td className="p-1.5 tabular-nums border-r border-border/60">{renderEditableCell(task, 'price', fmt(price), 'tabular-nums', 'right')}</td>
                      <td className="p-1.5 text-center border-l border-border/60 bg-muted/10"><SavedRowDiscountEditor item={task} isGross={isTaskGross} /></td>
                      <td className="p-2 text-center font-semibold tabular-nums">{fmt(total)}</td>
                      <td className="p-2 text-center">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteItem(task.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}

                {/* Input rows */}
                {taskRows.map((row, idx) => {
                  const rowTotal = isTaskGross ? row.quantity * row.price_gross : row.quantity * row.price_net;
                  const hasDiscount = row.discount > 0;
                  const afterDiscount = row.discountType === 'percent'
                    ? rowTotal - (rowTotal * row.discount / 100)
                    : rowTotal - row.discount;
                  const nameMissing = !row.name.trim() && getDraftPrice(row, isTaskGross) > 0;
                  // FIX duplikatów: prefiks "draft-" — zapisana pozycja dostaje id === draftKey,
                  // więc goły draftKey kolidowałby z key={task.id} zapisanego wiersza obok.
                  return (
                    <tr key={`draft-${row.draftKey ?? `new-task-${idx}`}`} className={nameMissing ? 'bg-destructive/10' : 'bg-primary/5'} data-task-draft-key={row.draftKey}>
                      <td className="p-2 text-center text-muted-foreground">
                        {tasks.length + idx + 1}
                      </td>
                      <td className="p-1.5">
                        <ServiceAutocomplete
                          value={row.name}
                          onChange={name => updateTaskRow(idx, { name })}
                          onSelectSuggestion={(name, priceNet, priceGross) => {
                            updateTaskRow(idx, { name, price_net: priceNet, price_gross: priceGross });
                            // Auto-add new row and focus it for fast continuous entry
                            setTimeout(() => addTaskRow(), 50);
                          }}
                          providerId={providerId}
                          className={`h-9 w-full text-sm min-w-0 ${nameMissing ? 'border-destructive ring-1 ring-destructive' : ''}`}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                               addTaskRow();
                            }
                          }}
                        />
                        {nameMissing && (
                          <p className="text-[10px] text-destructive mt-0.5 px-1">{t('workshop.orderTasks.enterNameToCount')}</p>
                        )}
                      </td>
                      <td className="p-1.5">
                        {workshopEmployees.length > 0 ? (
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={row.employee_id}
                            onChange={e => updateTaskRow(idx, { employee_id: e.target.value })}
                          >
                            <option value="">—</option>
                            {workshopEmployees.map((emp: any) => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            placeholder={t('workshop.orderTasks.employeePlaceholder')}
                            value={row.mechanic}
                            onChange={e => updateTaskRow(idx, { mechanic: e.target.value })}
                            className="h-9 w-full text-sm min-w-0"
                          />
                        )}
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          step="0.25"
                          min="0"
                          placeholder="0"
                          value={row.labor_hours || ''}
                          onChange={e => updateTaskRow(idx, { labor_hours: parseFloat(e.target.value) || 0 })}
                          className="h-9 w-full text-sm text-center min-w-0"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                               addTaskRow();
                            }
                          }}
                        />
                      </td>
                      <td className="p-1.5 border-r border-border/60">
                        <Input
                          type="number"
                          placeholder={isTaskGross ? t('workshop.orderTasks.grossPlaceholder') : t('workshop.orderTasks.netPlaceholder')}
                          value={isTaskGross ? (row.price_gross || '') : (row.price_net || '')}
                          onChange={e => updateTaskRowPrice(idx, Number(e.target.value))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                               addTaskRow();
                            }
                          }}
                          className="h-9 w-full text-sm text-right min-w-0"
                        />
                      </td>
                      <td className="p-1.5 border-l border-border/60 bg-muted/10">
                        <div className="flex items-center gap-1 justify-center">
                          <Select value={row.discountType} onValueChange={(v: DiscountType) => updateTaskRow(idx, { discountType: v })}>
                             <SelectTrigger className="h-9 text-xs w-16 shrink-0"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percent">%</SelectItem>
                              <SelectItem value="amount">zł</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            placeholder="0"
                            value={row.discount || ''}
                            onChange={e => updateTaskRow(idx, { discount: Number(e.target.value) })}
                            className="h-9 text-sm text-right w-16 shrink-0"
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addTaskRow();
                              }
                            }}
                          />
                        </div>
                      </td>
                      <td className="p-1.5 text-right text-sm font-semibold tabular-nums">
                        {hasDiscount ? fmt(afterDiscount) : fmt(rowTotal)}
                      </td>
                      <td className="p-1.5 text-center">
                        <Button onClick={() => removeTaskRow(idx)} size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {/* Sum row */}
                {(() => {
                  const totalLaborHours = tasks.reduce((s: number, t: any) => s + safeNumber(t.labor_hours), 0) + taskRows.reduce((s, r) => s + r.labor_hours, 0);
                  const totalLaborCost = tasks.reduce((s: number, t: any) => s + safeNumber(t.labor_cost), 0);
                  return (
                    <>
                      {totalLaborHours > 0 && (
                        <tr className="bg-muted/20 text-sm border-b">
                          <td className="p-2"></td>
                          <td className="p-2" colSpan={5}>
                            <span className="text-muted-foreground">{t('workshop.orderTasks.totalTime')}: <strong>{totalLaborHours.toFixed(2)} h</strong></span>
                            {totalLaborCost > 0 && <span className="ml-4 text-muted-foreground">{t('workshop.orderTasks.laborCost')}: <strong>{fmt(totalLaborCost)} zł</strong></span>}
                          </td>
                          <td className="p-2"></td>
                          <td className="p-2"></td>
                        </tr>
                      )}
                      <tr className="bg-muted/30 font-semibold text-sm border-b">
                        <td className="p-2"></td>
                        <td className="p-2" colSpan={5}>{t('workshop.orderTasks.totalServices')}</td>
                        <td className="p-2 text-right tabular-nums">{fmt(displayTasksTotal)}</td>
                        <td className="p-2"></td>
                      </tr>
                    </>
                  );
                })()}
                <tr className="bg-primary/5">
                  <td colSpan={8} className="p-1.5">
                    <div className="flex items-center gap-2">
                      <Button onClick={addTaskRow} variant="ghost" size="sm" className="gap-1 text-xs text-primary">
                        <Plus className="h-3.5 w-3.5" /> {t('workshop.orderTasks.addService')}
                      </Button>
                      {taskTemplates.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 h-7 text-xs"
                          onClick={() => setTemplateModalOpen(true)}
                        >
                          <ClipboardList className="h-3.5 w-3.5" /> {t('workshop.orderTasks.addFromTemplate')}
                        </Button>
                      )}
                      {(tasks.length > 0 || taskRows.some(r => r.name.trim())) && ridoPriceSettings?.ai_suggestions_enabled !== false && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 h-7 text-xs border-primary text-primary hover:bg-primary/10"
                          data-rido-estimate-trigger="true"
                          onClick={() => {
                            // NIE zapisujemy draftów — Rido Wycena działa na tasks (zapisanych) + taskRows (drafty) bez zmiany layoutu.
                            const vehicle = order.vehicle;
                            const missingVehicleData = !vehicle?.vin || !vehicle?.brand || !vehicle?.model || !vehicle?.year;
                            if (missingVehicleData) {
                              setVehicleDataWarningOpen(true);
                              setRidoPriceOpen(true);
                              return;
                            }
                            setVehicleDataWarningOpen(false);
                            setRidoPriceOpen(true);
                          }}
                        >
                          <Sparkles className="h-3.5 w-3.5" /> {t('workshop.orderTasks.ridoEstimate')}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* PARTS / CZĘŚCI */}
      <div ref={goodsCardRef}>
      <Card className="border-l-4 border-l-amber-500">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-amber-500" />
              <h3 className="font-semibold text-base">{t('workshop.orderTasks.partsMaterialsHeading')}</h3>
              <Badge variant="secondary" className="text-xs">{goods.length}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                <Button variant={goodsPriceMode === 'net' ? 'default' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setGoodsPriceMode('net')}>{t('workshop.orderTasks.net')}</Button>
                <Button variant={goodsPriceMode === 'gross' ? 'default' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setGoodsPriceMode('gross')}>{t('workshop.orderTasks.gross')}</Button>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={goodsSearch} onChange={e => setGoodsSearch(e.target.value)} placeholder={t('workshop.orderTasks.searchPartPlaceholder')} className="pl-8 h-8 w-40 text-xs" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '40px' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '72px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '170px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '50px' }} />
              </colgroup>
              <thead>
                <tr className="border-b bg-muted/10">
                  <th className="p-2 text-center font-medium text-muted-foreground">{t('workshop.orderTasks.colNo')}</th>
                  <th className="p-2 text-center font-medium text-muted-foreground">{t('workshop.orderTasks.colName')}</th>
                  <th className="p-2 text-center text-[11px] font-medium text-muted-foreground">{t('workshop.orderTasks.colQuantity')}</th>
                  <th className="p-2 text-center text-[11px] font-medium text-muted-foreground">{t('workshop.orderTasks.colUnit')}</th>
                  <th className="p-2 text-center text-[11px] font-medium text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <EyeOff className="h-3 w-3" />
                      <span>{t('workshop.orderTasks.colCost')}</span>
                    </div>
                  </th>
                  <th className="p-2 text-center text-[11px] font-medium text-muted-foreground">{t('workshop.orderTasks.colPrice')}</th>
                  <th className="p-2 text-center text-[11px] font-medium text-muted-foreground border-r border-border/60">{t('workshop.orderTasks.colTotal')}</th>
                  <th className="p-2 text-center text-[11px] font-medium text-muted-foreground border-l border-border/60 bg-muted/30">{t('workshop.orderTasks.colDiscount')}</th>
                  <th className="p-2 text-center text-[11px] font-medium text-muted-foreground">{t('workshop.orderTasks.colAfterDiscountShort')}</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {goods.map((g: any, i: number) => {
                  const itemPrice = getGoodsItemPrice(g);
                  const quantity = safeNumber(g.quantity) || 1;
                  const rawTotal = itemPrice * quantity;
                  const itemTotal = getGoodsItemTotal(g);
                  const itemCost = getGoodsItemCost(g);
                  const hasDiscount = getDiscountPercent(g) > 0;
                  return (
                    <tr
                      key={g.id}
                      className={getGoodsRowClasses(g, i)}
                      onDragOver={event => {
                        if (!draggingGoodsId) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setGoodsDropIndicator(getDropIndicator(event, i));
                      }}
                      onDrop={async event => {
                        event.preventDefault();
                        if (!draggingGoodsId) return;
                        await reorderItems(goods, draggingGoodsId, getDropIndicator(event, i), setGoodsPreview, clearGoodsDragState);
                      }}
                    >
                      <td className="p-2 text-center text-muted-foreground">{i + 1}</td>
                      <td className="p-1.5 font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            draggable
                            title={t('workshop.orderTasks.dragToReorder')}
                            className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
                            onDragStart={event => {
                              setDraggingGoodsId(g.id);
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('text/plain', g.id);
                            }}
                            onDragEnd={clearGoodsDragState}
                            onClick={event => event.stopPropagation()}
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <div className="min-w-0 flex-1">
                            {g.is_addon && (
                              <Badge className="mr-2 bg-red-600 text-white text-[9px] uppercase px-1.5 py-0 animate-pulse">{t('workshop.orderTasks.addonBadge')}</Badge>
                            )}
                            {renderEditableCell(g, 'name', nameDisplay(g))}
                          </div>
                        </div>
                      </td>
                      <td className="p-1">{renderEditableCell(g, 'quantity', String(g.quantity), '', 'center')}</td>
                      <td className="p-1.5">{renderEditableCell(g, 'unit', g.unit || 'szt', '', 'center')}</td>
                      <td className="p-1.5 text-muted-foreground tabular-nums">{renderEditableCell(g, 'cost', fmt(itemCost), 'tabular-nums', 'right')}</td>
                      <td className="p-1.5 tabular-nums">{renderEditableCell(g, 'price', fmt(itemPrice), 'tabular-nums', 'right')}</td>
                      <td className="p-2 text-center tabular-nums border-r border-border/60">{fmt(rawTotal)}</td>
                      <td className="p-1.5 text-center border-l border-border/60 bg-muted/10"><SavedRowDiscountEditor item={g} isGross={isGoodsGross} /></td>
                      <td className="p-2 text-center font-semibold tabular-nums">{fmt(itemTotal)}</td>
                      <td className="p-2 text-center">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteItem(g.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}

                {/* Input rows */}
                {goodsRows.map((row, idx) => {
                  const rowTotal = isGoodsGross ? row.quantity * row.price_gross : row.quantity * row.price_net;
                  const hasDiscount = row.discount > 0;
                  const afterDiscount = row.discountType === 'percent'
                    ? rowTotal - (rowTotal * row.discount / 100)
                    : rowTotal - row.discount;
                  const nameMissing = !row.name.trim() && getDraftPrice(row, isGoodsGross) > 0;
                  return (
                    <tr key={`draft-${row.draftKey ?? `new-goods-${idx}`}`} className={nameMissing ? 'bg-destructive/10' : 'bg-amber-500/5'} data-goods-draft-key={row.draftKey}>
                      <td className="p-2 text-center text-muted-foreground">
                        {goods.length + idx + 1}
                      </td>
                      <td className="p-1.5">
                        <InventoryProductAutocomplete
                          value={row.name}
                          placeholder={t('workshop.orderTasks.enterPartNamePlaceholder')}
                          className={`h-9 w-full text-sm min-w-0 ${nameMissing ? 'border-destructive ring-1 ring-destructive' : ''}`}
                          onChange={(name) => updateGoodsRow(idx, { name, inventory_product_id: null })}
                          onSelectProduct={(p) => updateGoodsRow(idx, {
                            name: p.name_sales,
                            inventory_product_id: p.id,
                            price_net: Number(p.default_sale_price_net) || 0,
                            price_gross: Number(p.default_sale_price_gross) || 0,
                            cost_net: Number(p.default_purchase_price_net) || 0,
                            cost_gross: Number(p.default_purchase_price_gross) || 0,
                          })}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                               addGoodsRow();
                            }
                          }}
                        />
                        {nameMissing && (
                          <p className="text-[10px] text-destructive mt-0.5 px-1">{t('workshop.orderTasks.enterNameToCount')}</p>
                        )}
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          min={1}
                          value={row.quantity}
                          onChange={e => updateGoodsRow(idx, { quantity: Number(e.target.value) })}
                          className="h-9 w-full text-sm text-center min-w-0 px-2"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                               addGoodsRow();
                            }
                          }}
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          placeholder="szt"
                          value={row.unit}
                          onChange={e => updateGoodsRow(idx, { unit: e.target.value })}
                          className="h-9 w-full text-sm text-center min-w-0 px-2"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                               addGoodsRow();
                            }
                          }}
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          placeholder={t('workshop.orderTasks.costPlaceholder')}
                          title={t('workshop.orderTasks.costTitle')}
                          value={isGoodsGross ? (row.cost_gross || '') : (row.cost_net || '')}
                          onChange={e => updateGoodsRowCost(idx, Number(e.target.value))}
                          className="h-9 w-full text-sm text-right min-w-0 px-2"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addGoodsRow();
                            }
                          }}
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          placeholder={isGoodsGross ? t('workshop.orderTasks.grossPlaceholder') : t('workshop.orderTasks.netPlaceholder')}
                          value={isGoodsGross ? (row.price_gross || '') : (row.price_net || '')}
                          onChange={e => updateGoodsRowPrice(idx, Number(e.target.value))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                               addGoodsRow();
                            }
                          }}
                          className="h-9 w-full text-sm text-right min-w-0 px-2"
                        />
                      </td>
                      <td className="p-1.5 text-right text-sm tabular-nums border-r border-border/60">
                        {fmt(rowTotal)}
                      </td>
                      <td className="p-1.5 border-l border-border/60 bg-muted/10">
                        <div className="flex items-center gap-1 justify-center">
                          <Select value={row.discountType} onValueChange={(v: DiscountType) => updateGoodsRow(idx, { discountType: v })}>
                            <SelectTrigger className="h-9 text-xs w-16 shrink-0"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percent">%</SelectItem>
                              <SelectItem value="amount">zł</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            placeholder="0"
                            value={row.discount || ''}
                            onChange={e => updateGoodsRow(idx, { discount: Number(e.target.value) })}
                            className="h-9 text-sm text-right w-16 shrink-0"
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addGoodsRow();
                              }
                            }}
                          />
                        </div>
                      </td>
                      <td className="p-1.5 text-right text-sm font-semibold tabular-nums">
                        {fmt(afterDiscount)}
                      </td>
                      <td className="p-1.5 text-center">
                           <Button onClick={() => removeGoodsRow(idx)} size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive">
                             <Trash2 className="h-4 w-4" />
                          </Button>
                      </td>
                    </tr>
                  );
                })}
                {/* Sum row */}
                <tr className="bg-muted/30 font-semibold text-sm border-b">
                  <td className="p-2"></td>
                  <td className="p-2" colSpan={7}>{t('workshop.orderTasks.totalParts')}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(displayGoodsTotal)}</td>
                  <td className="p-2"></td>
                </tr>
                <tr className="bg-amber-500/5">
                  <td colSpan={10} className="p-1.5">
                    <div className="flex items-center gap-2">
                      <Button onClick={addGoodsRow} variant="ghost" size="sm" className="gap-1 text-xs text-amber-600">
                        <Plus className="h-3.5 w-3.5" /> {t('workshop.orderTasks.addItem')}
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1 h-7 text-xs">
                        <Package className="h-3.5 w-3.5" /> {t('workshop.orderTasks.addFromWarehouse')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 h-7 text-xs border-primary text-primary hover:bg-primary/10"
                        onClick={async () => {
                          const hasEnabledIntegration = configuredPartsIntegrations.length > 0;
                          if (hasEnabledIntegration) {
                            // Autosave draft rows before opening search
                            await saveGoodsDraftRows();
                            await saveTaskDraftRows();
                            // Check vehicle data
                            const v = order.vehicle;
                            if (!v?.vin && !v?.brand) {
                              toast.error(t('workshop.orderTasks.missingVehicleData'));
                              return;
                            }
                            setRidoSearchOpen(true);
                          } else {
                            setRidoConfigOpen(true);
                          }
                        }}
                      >
                        <Search className="h-3.5 w-3.5" /> {t('workshop.orderTasks.findPartsWithRido')}
                      </Button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* GRAND TOTAL */}
      <Card className="bg-muted/50 max-w-5xl">
        <CardContent className="py-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-background/70 px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">{t('workshop.orderTasks.laborFromClient')}</p>
              <p className="text-lg font-bold tabular-nums">{fmt(displayTasksTotal)}</p>
            </div>
            <div className="rounded-xl border bg-background/70 px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">{t('workshop.orderTasks.partsFromClient')}</p>
              <p className="text-lg font-bold tabular-nums">{fmt(displayGoodsTotal)}</p>
            </div>
            <div className="rounded-xl border bg-background/70 px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">{t('workshop.orderTasks.totalSpend')}</p>
              <p className="text-lg font-bold text-muted-foreground tabular-nums">{fmt(displayGrandCost)}</p>
            </div>
            <div className="rounded-xl border bg-background/70 px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">{t('workshop.orderTasks.totalProfit')}</p>
              <p className={`text-lg font-bold tabular-nums ${displayGrandProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {fmt(displayGrandProfit)}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border bg-background/70 px-4 py-3">
              <p className="text-xs text-muted-foreground mb-2">{t('workshop.orderTasks.laborHeading')}</p>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{t('workshop.orderTasks.fromClient')}</span>
                <span className="font-semibold tabular-nums">{fmt(displayTasksTotal)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>{t('workshop.orderTasks.ownCost')}</span>
                <span className="font-semibold tabular-nums">{fmt(tasksCost + draftTasksCost)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold">
                <span>{t('workshop.orderTasks.profit')}</span>
                <span className="tabular-nums">{fmt(displayTasksProfit)}</span>
              </div>
            </div>
            <div className="rounded-xl border bg-background/70 px-4 py-3">
              <p className="text-xs text-muted-foreground mb-2">{t('workshop.orderTasks.partsMaterialsHeading')}</p>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{t('workshop.orderTasks.fromClient')}</span>
                <span className="font-semibold tabular-nums">{fmt(displayGoodsTotal)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>{t('workshop.orderTasks.purchaseCost')}</span>
                <span className="font-semibold tabular-nums">{fmt(goodsCost + draftGoodsCost)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold">
                <span>{t('workshop.orderTasks.profit')}</span>
                <span className="tabular-nums">{fmt(displayGoodsProfit)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-background px-4 py-4 md:pr-10">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('workshop.orderTasks.orderSummary')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('workshop.orderTasks.orderSummaryDesc')}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-1">{t('workshop.orderTasks.totalFromClient')}</p>
              <p className="text-3xl font-bold tabular-nums">{fmt(displayGrandTotal)}</p>
              {displayGrandTotal > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('workshop.orderTasks.marginLabel')}: {Math.round((displayGrandProfit / displayGrandTotal) * 100)}%
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rido Parts Modals */}
      <RidoPartsSearchModal
        open={ridoSearchOpen}
        onOpenChange={setRidoSearchOpen}
        providerId={providerId}
        orderId={order.id}
        vehicleName={order.vehicle ? `${order.vehicle.brand || ''} ${order.vehicle.model || ''} ${order.vehicle.year || ''}`.trim() : undefined}
        vehicleVin={order.vehicle?.vin || undefined}
        vehicle={order.vehicle || null}
        margin={configuredPartsIntegrations[0]?.sales_margin_percent || 30}
        existingParts={goods.filter((g: any) => g.name && g.name.trim()).map((g: any) => ({ name: g.name, quantity: g.quantity || 1 }))}
      />
      <RidoPartsConfigModal
        open={ridoConfigOpen}
        onOpenChange={setRidoConfigOpen}
        onGoToSettings={() => {
          setRidoConfigOpen(false);
          toast.info(t('workshop.orderTasks.goToIntegrations'));
        }}
      />

      {/* Rido Price Modal — działa wyłącznie na zapisanych pozycjach (tasks). Drafty są zapisywane PRZED otwarciem modala. */}
      <RidoPriceModal
        open={ridoPriceOpen}
        onOpenChange={setRidoPriceOpen}
        services={[
          ...tasks.map((t: any) => ({
            name: t.name,
            currentPrice: isTaskGross ? (t.unit_price_gross || 0) : (t.unit_price_net || 0),
          })),
          ...taskRows
            .filter(r => r.name.trim().length > 0)
            .map(r => ({
              name: r.name,
              currentPrice: isTaskGross ? (r.price_gross || 0) : (r.price_net || 0),
            })),
        ]}
        vehicle={order.vehicle}
        city={order.client?.city}
        voivodeship={order.client?.voivodeship}
        industry={ridoPriceSettings?.industry}
        priceMode={taskPriceMode}
        missingVehicleData={vehicleDataWarningOpen}
        onCompleteVehicleData={() => {
          setRidoPriceOpen(false);
          setVehicleEditOpen(true);
        }}
        onApplySuggestions={(prices) => {
          const draftRowIndices = taskRows
            .map((r, i) => ({ r, i }))
            .filter(({ r }) => r.name.trim().length > 0)
            .map(({ i }) => i);

          prices.forEach(({ index, price }) => {
            if (index < tasks.length) {
              // Saved task — update via mutation
              const target = tasks[index];
              if (!target?.id) return;
              const net = isTaskGross ? Math.round((price / VAT_RATE) * 100) / 100 : price;
              const gross = isTaskGross ? price : Math.round(price * VAT_RATE * 100) / 100;
              const quantity = safeNumber(target.quantity) || 1;
              const discountPercent = safeNumber(target.discount_percent);
              const raw = (isTaskGross ? gross : net) * quantity;
              const discounted = raw - (raw * discountPercent / 100);
              updateItem.mutate({
                id: target.id,
                unit_price_net: net,
                unit_price_gross: gross,
                total_gross: isTaskGross ? discounted : discounted * VAT_RATE,
                total_net: isTaskGross ? discounted / VAT_RATE : discounted,
              });
            } else {
              // Draft row — update local state without saving
              const draftPos = index - tasks.length;
              const rowIdx = draftRowIndices[draftPos];
              if (rowIdx === undefined) return;
              const net = isTaskGross ? Math.round((price / VAT_RATE) * 100) / 100 : price;
              const gross = isTaskGross ? price : Math.round(price * VAT_RATE * 100) / 100;
              updateTaskRow(rowIdx, { price_net: net, price_gross: gross });
            }
          });
        }}
      />

      {order.vehicle && (
        <WorkshopVehicleEditDialog
          vehicle={order.vehicle}
          open={vehicleEditOpen}
          onOpenChange={setVehicleEditOpen}
        />
      )}
    </div>
  );
}
