import { DragEvent, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCreateWorkshopOrderItem, useUpdateWorkshopOrderItem, useDeleteWorkshopOrderItem, useUpdateWorkshopOrder } from '@/hooks/useWorkshop';
import { usePartsIntegrations } from '@/hooks/useWorkshopParts';
import { Plus, Trash2, Package, Wrench, Search, EyeOff, Sparkles, AlertTriangle, GripVertical, Clock, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RidoPartsSearchModal } from '../parts/RidoPartsSearchModal';
import { RidoPartsConfigModal } from '../parts/RidoPartsConfigModal';
import { getConfiguredPartsIntegrations } from '../parts/partsIntegrationUtils';
import { ServiceAutocomplete } from '../pricing/ServiceAutocomplete';
import { RidoPriceModal } from '../pricing/RidoPriceModal';
import { useSaveServicePrice, useSaveAnonymousPrice } from '@/hooks/useServicePriceHistory';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  order: any;
  providerId: string;
}

const VAT_RATE = 1.23;

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
}

type DropIndicator = {
  index: number;
  position: 'before' | 'after';
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getDiscountPercent = (item: any) => safeNumber(item.discount_percent);

const getLineTotal = (item: any, gross: boolean) => {
  const stored = gross ? safeNumber(item.total_gross) : safeNumber(item.total_net);
  if (stored > 0) return stored;

  const quantity = safeNumber(item.quantity) || 1;
  const unitPrice = gross ? safeNumber(item.unit_price_gross) : safeNumber(item.unit_price_net);
  const raw = unitPrice * quantity;
  const discountPercent = getDiscountPercent(item);
  return raw - (raw * discountPercent / 100);
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
    const aSortOrder = typeof a?.sort_order === 'number' ? a.sort_order : Number.MAX_SAFE_INTEGER;
    const bSortOrder = typeof b?.sort_order === 'number' ? b.sort_order : Number.MAX_SAFE_INTEGER;

    if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;

    const aCreatedAt = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const bCreatedAt = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return aCreatedAt - bCreatedAt;
  });
};

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number) => {
  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
};

export function WorkshopOrderTasksTab({ order, providerId }: Props) {
  const createItem = useCreateWorkshopOrderItem();
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

  const sortedTaskItems = sortItemsBySortOrder((order.items || []).filter((i: any) => i.item_type === 'service' || i.item_type === 'task' || (i.item_type !== 'part' && i.item_type !== 'goods' && i.item_type !== 'other')));
  const sortedGoodsItems = sortItemsBySortOrder((order.items || []).filter((i: any) => i.item_type === 'part' || i.item_type === 'goods' || i.item_type === 'other'));
  const tasks = taskPreview ?? sortedTaskItems;
  const goods = goodsPreview ?? sortedGoodsItems;

  const isTaskGross = taskPriceMode === 'gross';
  const isGoodsGross = goodsPriceMode === 'gross';

  const createEmptyTask = (): TaskRow => ({ draftKey: crypto.randomUUID(), name: '', mechanic: '', quantity: 1, price_net: 0, price_gross: 0, cost_net: 0, cost_gross: 0, discount: 0, discountType: 'percent', employee_id: '', labor_hours: 0 });
  const emptyTask: TaskRow = createEmptyTask();
  const [taskRows, setTaskRows] = useState<TaskRow[]>([{ ...emptyTask }]);
  const [taskSearch, setTaskSearch] = useState('');

  const createEmptyGoods = (): GoodsRow => ({ draftKey: crypto.randomUUID(), name: '', quantity: 1, unit: 'szt', price_net: 0, price_gross: 0, cost_net: 0, cost_gross: 0, discount: 0, discountType: 'percent', task_name: '' });
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

  const clearTaskDragState = () => {
    setDraggingTaskId(null);
    setTaskDropIndicator(null);
  };

  const clearGoodsDragState = () => {
    setDraggingGoodsId(null);
    setGoodsDropIndicator(null);
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
      toast.error(error?.message || 'Nie udało się zapisać nowej kolejności pozycji');
    }
  };

  const getTaskRowClasses = (itemId: string, index: number) => {
    const isDragging = draggingTaskId === itemId;
    const isDropBefore = taskDropIndicator?.index === index && taskDropIndicator.position === 'before';
    const isDropAfter = taskDropIndicator?.index === index && taskDropIndicator.position === 'after';

    return [
      'border-b text-sm transition-colors',
      isDragging ? 'bg-accent/40 opacity-60' : 'hover:bg-accent/30',
      isDropBefore ? 'border-t-2 border-t-primary' : '',
      isDropAfter ? 'border-b-2 border-b-primary' : '',
    ].filter(Boolean).join(' ');
  };

  const getGoodsRowClasses = (itemId: string, index: number) => {
    const isDragging = draggingGoodsId === itemId;
    const isDropBefore = goodsDropIndicator?.index === index && goodsDropIndicator.position === 'before';
    const isDropAfter = goodsDropIndicator?.index === index && goodsDropIndicator.position === 'after';

    return [
      'border-b text-sm transition-colors',
      isDragging ? 'bg-accent/40 opacity-60' : 'hover:bg-accent/30',
      isDropBefore ? 'border-t-2 border-t-primary' : '',
      isDropAfter ? 'border-b-2 border-b-primary' : '',
    ].filter(Boolean).join(' ');
  };

  // Client confirmation warning check
  const showQuoteWarningIfNeeded = () => {
    if (order.quote_accepted && !quoteWarningShown) {
      toast.warning('Klient zaakceptował kosztorys. Po zmianach należy ponownie poinformować klienta o aktualizacji wyceny.', {
        duration: 6000,
        icon: <AlertTriangle className="h-5 w-5" />,
      });
      setQuoteWarningShown(true);
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

  const addTaskRow = () => setTaskRows(prev => [...prev, createEmptyTask()]);

  const removeTaskRow = (idx: number) => {
    if (taskRows.length <= 1) {
      setTaskRows([createEmptyTask()]);
      return;
    }
    setTaskRows(prev => prev.filter((_, i) => i !== idx));
  };

  const submitTask = async (row: TaskRow, idx: number, sortOrder?: number) => {
    if (!row.name) return;
    showQuoteWarningIfNeeded();
    const rawTotal = isTaskGross ? row.quantity * row.price_gross : row.quantity * row.price_net;
    const totalAfterDiscount = row.discountType === 'percent'
      ? rawTotal - (rawTotal * row.discount / 100)
      : rawTotal - row.discount;
    const discountPercent = rawTotal > 0 ? ((rawTotal - totalAfterDiscount) / rawTotal) * 100 : 0;

    await createItem.mutateAsync({
      order_id: order.id,
      item_type: 'service',
      name: row.name,
      mechanic: row.mechanic || null,
      unit: 'oper',
      quantity: row.quantity,
      sort_order: sortOrder ?? getNextSortOrder(tasks),
      unit_price_gross: row.price_gross,
      unit_price_net: row.price_net,
      unit_cost_net: row.cost_net,
      unit_cost_gross: row.cost_gross,
      discount_percent: discountPercent,
      total_gross: isTaskGross ? totalAfterDiscount : totalAfterDiscount * VAT_RATE,
      total_net: isTaskGross ? totalAfterDiscount / VAT_RATE : totalAfterDiscount,
    } as any);

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

    setTaskRows(prev => prev.map((r, i) => i === idx ? createEmptyTask() : r));
    toast.success('Usługa dodana');
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

  const addGoodsRow = () => setGoodsRows(prev => [...prev, createEmptyGoods()]);

  const removeGoodsRow = (idx: number) => {
    if (goodsRows.length <= 1) {
      setGoodsRows([createEmptyGoods()]);
      return;
    }
    setGoodsRows(prev => prev.filter((_, i) => i !== idx));
  };

  const submitGoods = async (row: GoodsRow, idx: number, sortOrder?: number) => {
    if (!row.name) return;
    showQuoteWarningIfNeeded();
    const rawTotal = isGoodsGross ? row.quantity * row.price_gross : row.quantity * row.price_net;
    const totalAfterDiscount = row.discountType === 'percent'
      ? rawTotal - (rawTotal * row.discount / 100)
      : rawTotal - row.discount;
    const discountPercent = rawTotal > 0 ? ((rawTotal - totalAfterDiscount) / rawTotal) * 100 : 0;

    await createItem.mutateAsync({
      order_id: order.id,
      item_type: 'part',
      name: row.name,
      unit: row.unit,
      quantity: row.quantity,
      sort_order: sortOrder ?? getNextSortOrder(goods),
      unit_price_gross: row.price_gross,
      unit_price_net: row.price_net,
      unit_cost_net: row.cost_net,
      unit_cost_gross: row.cost_gross,
      discount_percent: discountPercent,
      total_gross: isGoodsGross ? totalAfterDiscount : totalAfterDiscount * VAT_RATE,
      total_net: isGoodsGross ? totalAfterDiscount / VAT_RATE : totalAfterDiscount,
    });

    setGoodsRows(prev => prev.map((r, i) => i === idx ? createEmptyGoods() : r));
    toast.success('Część dodana');
  };

  // Inline edit saved items
  const startEdit = (itemId: string, field: string, currentValue: string | number) => {
    showQuoteWarningIfNeeded();
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
    const updates: any = {};
    const isService = item.item_type === 'service' || item.item_type === 'task';
    const gross = isService ? isTaskGross : isGoodsGross;

    if (editingField === 'name') {
      updates.name = editingValue;
    } else if (editingField === 'quantity') {
      const newQty = Math.max(1, parseInt(editingValue) || 1);
      updates.quantity = newQty;
      const unitPrice = gross ? safeNumber(item.unit_price_gross) : safeNumber(item.unit_price_net);
      const rawTotal = newQty * unitPrice;
      const disc = item.discount_percent || 0;
      const afterDiscount = rawTotal - (rawTotal * disc / 100);
      updates.total_gross = gross ? afterDiscount : afterDiscount * VAT_RATE;
      updates.total_net = gross ? afterDiscount / VAT_RATE : afterDiscount;
    } else if (editingField === 'price') {
      const val = parseFloat(editingValue.replace(',', '.')) || 0;
      const synced = syncPrice(val, gross ? 'gross' : 'net');
      updates.unit_price_net = synced.net;
      updates.unit_price_gross = synced.gross;
      const rawTotal = (item.quantity || 1) * (gross ? synced.gross : synced.net);
      const disc = item.discount_percent || 0;
      const afterDiscount = rawTotal - (rawTotal * disc / 100);
      updates.total_gross = gross ? afterDiscount : afterDiscount * VAT_RATE;
      updates.total_net = gross ? afterDiscount / VAT_RATE : afterDiscount;
    } else if (editingField === 'cost') {
      const val = parseFloat(editingValue.replace(',', '.')) || 0;
      const synced = syncPrice(val, gross ? 'gross' : 'net');
      updates.unit_cost_net = synced.net;
      updates.unit_cost_gross = synced.gross;
    } else if (editingField === 'mechanic') {
      updates.mechanic = editingValue || null;
    } else if (editingField === 'labor_hours') {
      const hours = parseFloat(editingValue.replace(',', '.')) || 0;
      updates.labor_hours = hours;
      // Calculate labor cost: hours × employee rate or default rate
      const emp = workshopEmployees.find((e: any) => e.id === item.employee_id);
      const hourlyRate = emp?.salary ? emp.salary / 160 : (workshopSettings?.hourly_rate || 150);
      updates.labor_cost = Math.round(hours * hourlyRate * 100) / 100;
    }

    await updateItem.mutateAsync({ id: editingItemId, ...updates });
    setEditingItemId(null);
    setEditingField(null);
  };

  const cancelEdit = () => {
    setEditingItemId(null);
    setEditingField(null);
  };

  const handleDeleteItem = async (id: string) => {
    showQuoteWarningIfNeeded();
    await deleteItem.mutateAsync(id);
    toast.success('Pozycja usunięta');
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

  useEffect(() => {
    try {
      const rawDraft = localStorage.getItem(draftStorageKey);
      if (!rawDraft) return;

      const parsed = JSON.parse(rawDraft);
      if (Array.isArray(parsed?.tasks) && parsed.tasks.length > 0) {
        setTaskRows(parsed.tasks.map((row: TaskRow) => ({ ...createEmptyTask(), ...row, draftKey: row.draftKey || crypto.randomUUID() })));
      }
      if (Array.isArray(parsed?.goods) && parsed.goods.length > 0) {
        setGoodsRows(parsed.goods.map((row: GoodsRow) => ({ ...createEmptyGoods(), ...row, draftKey: row.draftKey || crypto.randomUUID() })));
      }
    } catch {
      localStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey]);

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

    console.log('[WorkshopTasks] Syncing order totals:', { currentGross, savedGrandGrossTotal, currentNet, savedGrandNetTotal });
    // Direct DB update + cache invalidation
    (supabase as any)
      .from('workshop_orders')
      .update({ total_gross: savedGrandGrossTotal, total_net: savedGrandNetTotal })
      .eq('id', order.id)
      .then(() => {
        updateOrder.mutate({ id: order.id, total_gross: savedGrandGrossTotal, total_net: savedGrandNetTotal });
      });
  }, [order.id, order.total_gross, order.total_net, savedGrandGrossTotal, savedGrandNetTotal]);

  const saveTaskDraftRows = async () => {
    const rowsToSave = taskRows.filter(isTaskDraftFilled);
    if (rowsToSave.length === 0) {
      addTaskRow();
      return;
    }

    let nextSortOrder = getNextSortOrder(tasks);
    for (const row of rowsToSave) {
      const sourceIndex = taskRows.findIndex(candidate => candidate === row);
      await submitTask(row, sourceIndex >= 0 ? sourceIndex : 0, nextSortOrder);
      nextSortOrder += 1;
    }

    setTaskRows([createEmptyTask()]);
  };


  const saveGoodsDraftRows = async () => {
    const rowsToSave = goodsRows.filter(isGoodsDraftFilled);
    if (rowsToSave.length === 0) {
      addGoodsRow();
      return;
    }

    let nextSortOrder = getNextSortOrder(goods);
    for (const row of rowsToSave) {
      const sourceIndex = goodsRows.findIndex(candidate => candidate === row);
      await submitGoods(row, sourceIndex >= 0 ? sourceIndex : 0, nextSortOrder);
      nextSortOrder += 1;
    }

    setGoodsRows([createEmptyGoods()]);
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;

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
      if (field === 'name') return item.name || '';
      if (field === 'mechanic') return item.mechanic || '';
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
        className={`flex h-9 w-full items-center rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
          <span>Klient zaakceptował kosztorys. Wszelkie zmiany wymagają ponownego poinformowania klienta.</span>
        </div>
      )}

      {/* Summary badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="outline" className="text-sm px-3 py-1.5 gap-1.5">
          <Wrench className="h-3.5 w-3.5" />
          Usługi: {fmt(displayTasksTotal)}
        </Badge>
        <Badge variant="outline" className="text-sm px-3 py-1.5 gap-1.5">
          <Package className="h-3.5 w-3.5" />
          Części: {fmt(displayGoodsTotal)}
        </Badge>
        {displayGrandCost > 0 && (
          <Badge variant="secondary" className="text-sm px-3 py-1.5">
            Marża: {fmt(displayGrandProfit)} ({displayGrandTotal > 0 ? Math.round((displayGrandProfit / displayGrandTotal) * 100) : 0}%)
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
              <h3 className="font-semibold text-base">Robocizna / Usługi</h3>
              <Badge variant="secondary" className="text-xs">{tasks.length}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                <Button variant={taskPriceMode === 'net' ? 'default' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setTaskPriceMode('net')}>NETTO</Button>
                <Button variant={taskPriceMode === 'gross' ? 'default' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setTaskPriceMode('gross')}>BRUTTO</Button>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={taskSearch} onChange={e => setTaskSearch(e.target.value)} placeholder="Szukaj usługi..." className="pl-8 h-8 w-40 text-xs" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '40px' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '56px' }} />
              </colgroup>
              <thead>
                <tr className="border-b bg-muted/10">
                  <th className="p-2 text-center font-medium text-muted-foreground">LP</th>
                  <th className="p-2 text-left text-[11px] font-medium text-muted-foreground">USŁUGA</th>
                  <th className="p-2 text-left text-[11px] font-medium text-muted-foreground">PRACOWNIK</th>
                  <th className="p-2 text-center text-[11px] font-medium text-muted-foreground">CZAS [h]</th>
                  <th className="p-2 text-right text-[11px] font-medium text-muted-foreground">CENA</th>
                  <th className="p-2 text-right text-[11px] font-medium text-muted-foreground">RABAT</th>
                  <th className="p-2 text-right text-[11px] font-medium text-muted-foreground">PO RABACIE</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t: any, i: number) => {
                  const quantity = safeNumber(t.quantity) || 1;
                  const price = getTaskItemPrice(t) * quantity;
                  const total = getTaskItemTotal(t);
                  const hasDiscount = getDiscountPercent(t) > 0;
                  return (
                    <tr
                      key={t.id}
                      className={getTaskRowClasses(t.id, i)}
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
                      <td className="p-1 font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            draggable
                            title="Przeciągnij, aby zmienić kolejność"
                            className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
                            onDragStart={event => {
                              setDraggingTaskId(t.id);
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('text/plain', t.id);
                            }}
                            onDragEnd={clearTaskDragState}
                            onClick={event => event.stopPropagation()}
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <div className="min-w-0 flex-1">{renderEditableCell(t, 'name', t.name)}</div>
                        </div>
                      </td>
                      <td className="p-1 text-muted-foreground">
                        {workshopEmployees.length > 0 ? (
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={t.employee_id || ''}
                            onChange={async (e) => {
                              await updateItem.mutateAsync({ id: t.id, employee_id: e.target.value || null });
                            }}
                          >
                            <option value="">—</option>
                            {workshopEmployees.map((emp: any) => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </select>
                        ) : renderEditableCell(t, 'mechanic', t.mechanic || '—')}
                      </td>
                      <td className="p-1 tabular-nums">
                        {renderEditableCell(t, 'labor_hours', String(safeNumber(t.labor_hours) || '—'), 'tabular-nums', 'center')}
                      </td>
                      <td className="p-1 tabular-nums">{renderEditableCell(t, 'price', fmt(price), 'tabular-nums', 'right')}</td>
                      <td className="p-2 text-right">{hasDiscount ? `${Math.round(getDiscountPercent(t))}%` : '—'}</td>
                      <td className="p-2 text-right font-semibold tabular-nums">{fmt(total)}</td>
                      <td className="p-2 text-center">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteItem(t.id)}>
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
                  return (
                    <tr key={`new-task-${idx}`} className="bg-primary/5">
                      <td className="p-2 text-center text-muted-foreground">
                        {tasks.length + idx + 1}
                      </td>
                      <td className="p-1.5">
                        <ServiceAutocomplete
                          value={row.name}
                          onChange={name => updateTaskRow(idx, { name })}
                          onSelectSuggestion={(name, priceNet, priceGross) => {
                            updateTaskRow(idx, { name, price_net: priceNet, price_gross: priceGross });
                          }}
                          providerId={providerId}
                          className="h-9 w-full text-sm min-w-0"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void saveTaskDraftRows();
                            }
                          }}
                        />
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
                            placeholder="Pracownik"
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
                              void saveTaskDraftRows();
                            }
                          }}
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          placeholder={isTaskGross ? 'Brutto' : 'Netto'}
                          value={isTaskGross ? (row.price_gross || '') : (row.price_net || '')}
                          onChange={e => updateTaskRowPrice(idx, Number(e.target.value))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void saveTaskDraftRows();
                            }
                          }}
                          className="h-9 w-full text-sm text-right min-w-0"
                        />
                      </td>
                      <td className="p-1.5">
                        <div className="flex items-center gap-1">
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
                                void saveTaskDraftRows();
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
                <tr className="bg-muted/30 font-semibold text-sm border-b">
                  <td className="p-2"></td>
                  <td className="p-2" colSpan={4}>Razem usługi</td>
                  <td className="p-2 text-right tabular-nums">{fmt(displayTasksTotal)}</td>
                  <td className="p-2"></td>
                </tr>
                <tr className="bg-primary/5">
                  <td colSpan={7} className="p-1.5">
                    <div className="flex items-center gap-2">
                      <Button onClick={saveTaskDraftRows} variant="ghost" size="sm" className="gap-1 text-xs text-primary">
                        <Plus className="h-3.5 w-3.5" /> Dodaj usługę
                      </Button>
                      {(tasks.length > 0 || taskRows.some(r => r.name.trim())) && ridoPriceSettings?.ai_suggestions_enabled !== false && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 h-7 text-xs border-primary text-primary hover:bg-primary/10"
                          onClick={() => setRidoPriceOpen(true)}
                        >
                          <Sparkles className="h-3.5 w-3.5" /> Rido Wycena
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
              <h3 className="font-semibold text-base">Części i materiały</h3>
              <Badge variant="secondary" className="text-xs">{goods.length}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                <Button variant={goodsPriceMode === 'net' ? 'default' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setGoodsPriceMode('net')}>NETTO</Button>
                <Button variant={goodsPriceMode === 'gross' ? 'default' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setGoodsPriceMode('gross')}>BRUTTO</Button>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={goodsSearch} onChange={e => setGoodsSearch(e.target.value)} placeholder="Szukaj części..." className="pl-8 h-8 w-40 text-xs" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '40px' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '72px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '50px' }} />
              </colgroup>
              <thead>
                <tr className="border-b bg-muted/10">
                  <th className="p-2 text-center font-medium text-muted-foreground">LP</th>
                  <th className="p-2 text-left font-medium text-muted-foreground">NAZWA</th>
                  <th className="p-2 text-center text-[11px] font-medium text-muted-foreground">ILOŚĆ</th>
                  <th className="p-2 text-center text-[11px] font-medium text-muted-foreground">J.M.</th>
                  <th className="p-2 text-right text-[11px] font-medium text-muted-foreground">
                    <div className="flex items-center justify-end gap-1">
                      <EyeOff className="h-3 w-3" />
                      <span>KOSZT</span>
                    </div>
                  </th>
                  <th className="p-2 text-right text-[11px] font-medium text-muted-foreground">CENA</th>
                  <th className="p-2 text-right text-[11px] font-medium text-muted-foreground">RAZEM</th>
                  <th className="p-2 text-right text-[11px] font-medium text-muted-foreground">RABAT</th>
                  <th className="p-2 text-right text-[11px] font-medium text-muted-foreground">PO RAB.</th>
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
                      className={getGoodsRowClasses(g.id, i)}
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
                      <td className="p-1 font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            draggable
                            title="Przeciągnij, aby zmienić kolejność"
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
                          <div className="min-w-0 flex-1">{renderEditableCell(g, 'name', g.name)}</div>
                        </div>
                      </td>
                      <td className="p-1">{renderEditableCell(g, 'quantity', String(g.quantity), '', 'center')}</td>
                      <td className="p-2 text-center">{g.unit}</td>
                      <td className="p-1 text-muted-foreground tabular-nums">{renderEditableCell(g, 'cost', fmt(itemCost), 'tabular-nums', 'right')}</td>
                      <td className="p-1 tabular-nums">{renderEditableCell(g, 'price', fmt(itemPrice), 'tabular-nums', 'right')}</td>
                      <td className="p-2 text-right tabular-nums">{fmt(rawTotal)}</td>
                      <td className="p-2 text-right">{hasDiscount ? `${Math.round(getDiscountPercent(g))}%` : '—'}</td>
                      <td className="p-2 text-right font-semibold tabular-nums">{fmt(itemTotal)}</td>
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
                  return (
                    <tr key={`new-goods-${idx}`} className="bg-amber-500/5">
                      <td className="p-2 text-center text-muted-foreground">
                        {goods.length + idx + 1}
                      </td>
                      <td className="p-1.5">
                        <Input
                          placeholder="Wpisz nazwę części..."
                          value={row.name}
                          onChange={e => updateGoodsRow(idx, { name: e.target.value })}
                          className="h-9 w-full text-sm min-w-0"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void saveGoodsDraftRows();
                            }
                          }}
                        />
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
                              void saveGoodsDraftRows();
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
                              void saveGoodsDraftRows();
                            }
                          }}
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          placeholder="Koszt"
                          title="Koszt zakupu — widoczne tylko dla serwisu"
                          value={isGoodsGross ? (row.cost_gross || '') : (row.cost_net || '')}
                          onChange={e => updateGoodsRowCost(idx, Number(e.target.value))}
                          className="h-9 w-full text-sm text-right min-w-0 px-2"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void saveGoodsDraftRows();
                            }
                          }}
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          placeholder={isGoodsGross ? 'Brutto' : 'Netto'}
                          value={isGoodsGross ? (row.price_gross || '') : (row.price_net || '')}
                          onChange={e => updateGoodsRowPrice(idx, Number(e.target.value))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void saveGoodsDraftRows();
                            }
                          }}
                          className="h-9 w-full text-sm text-right min-w-0 px-2"
                        />
                      </td>
                      <td className="p-1.5 text-right text-sm tabular-nums">
                        {fmt(rowTotal)}
                      </td>
                      <td className="p-1.5">
                        <div className="flex items-center gap-1">
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
                                void saveGoodsDraftRows();
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
                  <td className="p-2" colSpan={7}>Razem części</td>
                  <td className="p-2 text-right tabular-nums">{fmt(displayGoodsTotal)}</td>
                  <td className="p-2"></td>
                </tr>
                <tr className="bg-amber-500/5">
                  <td colSpan={10} className="p-1.5">
                    <div className="flex items-center gap-2">
                      <Button onClick={saveGoodsDraftRows} variant="ghost" size="sm" className="gap-1 text-xs text-amber-600">
                        <Plus className="h-3.5 w-3.5" /> Dodaj pozycję
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1 h-7 text-xs">
                        <Package className="h-3.5 w-3.5" /> Dodaj z magazynu
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 h-7 text-xs border-primary text-primary hover:bg-primary/10"
                        onClick={() => {
                          const hasEnabledIntegration = configuredPartsIntegrations.length > 0;
                          if (hasEnabledIntegration) {
                            setRidoSearchOpen(true);
                          } else {
                            setRidoConfigOpen(true);
                          }
                        }}
                      >
                        <Search className="h-3.5 w-3.5" /> Znajdź części z Rido
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
              <p className="text-xs text-muted-foreground mb-1">Robocizna od klienta</p>
              <p className="text-lg font-bold tabular-nums">{fmt(displayTasksTotal)}</p>
            </div>
            <div className="rounded-xl border bg-background/70 px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Części od klienta</p>
              <p className="text-lg font-bold tabular-nums">{fmt(displayGoodsTotal)}</p>
            </div>
            <div className="rounded-xl border bg-background/70 px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Wydasz łącznie</p>
              <p className="text-lg font-bold text-muted-foreground tabular-nums">{fmt(displayGrandCost)}</p>
            </div>
            <div className="rounded-xl border bg-background/70 px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Zysk łącznie</p>
              <p className={`text-lg font-bold tabular-nums ${displayGrandProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {fmt(displayGrandProfit)}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border bg-background/70 px-4 py-3">
              <p className="text-xs text-muted-foreground mb-2">Robocizna</p>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>Od klienta</span>
                <span className="font-semibold tabular-nums">{fmt(displayTasksTotal)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>Koszt własny</span>
                <span className="font-semibold tabular-nums">{fmt(tasksCost + draftTasksCost)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold">
                <span>Zysk</span>
                <span className="tabular-nums">{fmt(displayTasksProfit)}</span>
              </div>
            </div>
            <div className="rounded-xl border bg-background/70 px-4 py-3">
              <p className="text-xs text-muted-foreground mb-2">Części i materiały</p>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>Od klienta</span>
                <span className="font-semibold tabular-nums">{fmt(displayGoodsTotal)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>Koszt zakupu</span>
                <span className="font-semibold tabular-nums">{fmt(goodsCost + draftGoodsCost)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold">
                <span>Zysk</span>
                <span className="tabular-nums">{fmt(displayGoodsProfit)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-background px-4 py-4 md:pr-10">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Podsumowanie zlecenia</p>
              <p className="text-sm text-muted-foreground mt-1">Koszt części i robocizny vs. końcowa wartość sprzedaży.</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-1">Łącznie od klienta</p>
              <p className="text-3xl font-bold tabular-nums">{fmt(displayGrandTotal)}</p>
              {displayGrandTotal > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Marża: {Math.round((displayGrandProfit / displayGrandTotal) * 100)}%
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
          toast.info('Przejdź do Ustawienia → Integracje w menu bocznym');
        }}
      />

      {/* Rido Price Modal */}
      <RidoPriceModal
        open={ridoPriceOpen}
        onOpenChange={setRidoPriceOpen}
        services={[
          ...tasks.map((t: any) => ({ name: t.name, currentPrice: isTaskGross ? (t.unit_price_gross || 0) : (t.unit_price_net || 0) })),
          ...taskRows.filter(r => r.name.trim()).map(r => ({
            name: r.name,
            currentPrice: isTaskGross ? r.price_gross : r.price_net,
          })),
        ]}
        vehicle={order.vehicle}
        city={order.client?.city}
        voivodeship={order.client?.voivodeship}
        industry={ridoPriceSettings?.industry}
        priceMode={taskPriceMode}
        onApplySuggestions={(prices) => {
          const savedCount = tasks.length;
          prices.forEach(({ index, price }) => {
            if (index < savedCount && tasks[index]) {
              const target = tasks[index];
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
            }
          });

          setTaskRows(prev => {
            const updated = [...prev];
            prices.forEach(({ index, price }) => {
              const rowIdx = index - savedCount;
              if (rowIdx >= 0 && rowIdx < updated.length) {
                const { net, gross } = isTaskGross
                  ? { net: Math.round((price / VAT_RATE) * 100) / 100, gross: price }
                  : { net: price, gross: Math.round(price * VAT_RATE * 100) / 100 };
                updated[rowIdx] = { ...updated[rowIdx], price_net: net, price_gross: gross };
              }
            });
            return updated;
          });
        }}
      />
    </div>
  );
}
