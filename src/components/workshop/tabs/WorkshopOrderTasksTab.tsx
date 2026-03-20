import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCreateWorkshopOrderItem, useUpdateWorkshopOrder } from '@/hooks/useWorkshop';
import { usePartsIntegrations } from '@/hooks/useWorkshopParts';
import { Plus, Trash2, Package, Wrench, Play, CheckCircle2, Search, Eye, EyeOff, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RidoPartsSearchModal } from '../parts/RidoPartsSearchModal';
import { RidoPartsConfigModal } from '../parts/RidoPartsConfigModal';

interface Props {
  order: any;
  providerId: string;
}

const VAT_RATE = 1.23;

type DiscountType = 'percent' | 'amount';

interface TaskRow {
  name: string;
  mechanic: string;
  quantity: number;
  price_net: number;
  price_gross: number;
  cost_net: number;
  cost_gross: number;
  discount: number;
  discountType: DiscountType;
}

interface GoodsRow {
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

export function WorkshopOrderTasksTab({ order, providerId }: Props) {
  const createItem = useCreateWorkshopOrderItem();
  const { data: partsIntegrations = [] } = usePartsIntegrations(providerId);
  const [priceMode, setPriceMode] = useState<'net' | 'gross'>(order.price_mode || 'gross');
  const [ridoSearchOpen, setRidoSearchOpen] = useState(false);
  const [ridoConfigOpen, setRidoConfigOpen] = useState(false);

  const tasks = (order.items || []).filter((i: any) => i.item_type === 'service' || i.item_type === 'task' || (i.item_type !== 'part' && i.item_type !== 'goods' && i.item_type !== 'other'));
  const goods = (order.items || []).filter((i: any) => i.item_type === 'part' || i.item_type === 'goods' || i.item_type === 'other');

  const isGross = priceMode === 'gross';

  const emptyTask: TaskRow = { name: '', mechanic: '', quantity: 1, price_net: 0, price_gross: 0, cost_net: 0, cost_gross: 0, discount: 0, discountType: 'percent' };
  const [taskRows, setTaskRows] = useState<TaskRow[]>([{ ...emptyTask }]);
  const [taskSearch, setTaskSearch] = useState('');

  const emptyGoods: GoodsRow = { name: '', quantity: 1, unit: 'szt', price_net: 0, price_gross: 0, cost_net: 0, cost_gross: 0, discount: 0, discountType: 'percent', task_name: '' };
  const [goodsRows, setGoodsRows] = useState<GoodsRow[]>([{ ...emptyGoods }]);
  const [goodsSearch, setGoodsSearch] = useState('');

  const syncPrice = (val: number, field: 'net' | 'gross') => {
    if (field === 'net') return { net: val, gross: Math.round(val * VAT_RATE * 100) / 100 };
    return { net: Math.round(val / VAT_RATE * 100) / 100, gross: val };
  };

  const calcTotal = (qty: number, priceGross: number, priceNet: number, discount: number, discountType: DiscountType) => {
    const base = isGross ? qty * priceGross : qty * priceNet;
    if (discountType === 'percent') return base - (base * discount / 100);
    return base - discount;
  };

  const calcAfterDiscount = (total: number, discount: number, discountType: DiscountType) => {
    if (discount <= 0) return total;
    if (discountType === 'percent') return total - (total * discount / 100);
    return total - discount;
  };

  // Task row handlers
  const updateTaskRow = (idx: number, updates: Partial<TaskRow>) => {
    setTaskRows(prev => prev.map((r, i) => i === idx ? { ...r, ...updates } : r));
  };

  const updateTaskRowPrice = (idx: number, val: number) => {
    const { net, gross } = syncPrice(val, isGross ? 'gross' : 'net');
    updateTaskRow(idx, { price_net: net, price_gross: gross });
  };

  const addTaskRow = () => setTaskRows(prev => [...prev, { ...emptyTask }]);

  const removeTaskRow = (idx: number) => {
    if (taskRows.length <= 1) return;
    setTaskRows(prev => prev.filter((_, i) => i !== idx));
  };

  const submitTask = async (row: TaskRow, idx: number) => {
    if (!row.name) return;
    const rawTotal = isGross ? row.quantity * row.price_gross : row.quantity * row.price_net;
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
      unit_price_gross: row.price_gross,
      unit_price_net: row.price_net,
      unit_cost_net: row.cost_net,
      unit_cost_gross: row.cost_gross,
      discount_percent: discountPercent,
      total_gross: isGross ? totalAfterDiscount : totalAfterDiscount * VAT_RATE,
      total_net: isGross ? totalAfterDiscount / VAT_RATE : totalAfterDiscount,
    } as any);

    // Reset this row and keep it
    setTaskRows(prev => prev.map((r, i) => i === idx ? { ...emptyTask } : r));
    toast.success('Usługa dodana');
  };

  // Goods row handlers
  const updateGoodsRow = (idx: number, updates: Partial<GoodsRow>) => {
    setGoodsRows(prev => prev.map((r, i) => i === idx ? { ...r, ...updates } : r));
  };

  const updateGoodsRowPrice = (idx: number, val: number) => {
    const { net, gross } = syncPrice(val, isGross ? 'gross' : 'net');
    updateGoodsRow(idx, { price_net: net, price_gross: gross });
  };

  const updateGoodsRowCost = (idx: number, val: number) => {
    const { net, gross } = syncPrice(val, isGross ? 'gross' : 'net');
    updateGoodsRow(idx, { cost_net: net, cost_gross: gross });
  };

  const addGoodsRow = () => setGoodsRows(prev => [...prev, { ...emptyGoods }]);

  const removeGoodsRow = (idx: number) => {
    if (goodsRows.length <= 1) return;
    setGoodsRows(prev => prev.filter((_, i) => i !== idx));
  };

  const submitGoods = async (row: GoodsRow, idx: number) => {
    if (!row.name) return;
    const rawTotal = isGross ? row.quantity * row.price_gross : row.quantity * row.price_net;
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
      unit_price_gross: row.price_gross,
      unit_price_net: row.price_net,
      unit_cost_net: row.cost_net,
      unit_cost_gross: row.cost_gross,
      discount_percent: discountPercent,
      total_gross: isGross ? totalAfterDiscount : totalAfterDiscount * VAT_RATE,
      total_net: isGross ? totalAfterDiscount / VAT_RATE : totalAfterDiscount,
    });

    setGoodsRows(prev => prev.map((r, i) => i === idx ? { ...emptyGoods } : r));
    toast.success('Część dodana');
  };

  const fmt = (v: number) => v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getItemPrice = (item: any) => isGross ? (item.unit_price_gross || 0) : (item.unit_price_net || 0);
  const getItemCost = (item: any) => isGross ? (item.unit_cost_gross || 0) : (item.unit_cost_net || 0);
  const getItemTotal = (item: any) => isGross ? (item.total_gross || 0) : (item.total_net || 0);

  const tasksTotal = tasks.reduce((s: number, t: any) => s + getItemTotal(t), 0);
  const tasksCost = tasks.reduce((s: number, t: any) => s + (getItemCost(t) * (t.quantity || 1)), 0);
  const goodsTotal = goods.reduce((s: number, g: any) => s + getItemTotal(g), 0);
  const goodsCost = goods.reduce((s: number, g: any) => s + (getItemCost(g) * (g.quantity || 1)), 0);
  const grandTotal = tasksTotal + goodsTotal;
  const grandCost = tasksCost + goodsCost;
  const grandProfit = grandTotal - grandCost;

  return (
    <div className="space-y-6">
      {/* Mode toggle & summary */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="outline" className="text-sm px-3 py-1.5 gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            Usługi: {fmt(tasksTotal)}
          </Badge>
          <Badge variant="outline" className="text-sm px-3 py-1.5 gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Części: {fmt(goodsTotal)}
          </Badge>
          {grandCost > 0 && (
            <Badge variant="secondary" className="text-sm px-3 py-1.5">
              Marża: {fmt(grandProfit)} ({grandTotal > 0 ? Math.round((grandProfit / grandTotal) * 100) : 0}%)
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          <Button variant={priceMode === 'net' ? 'default' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setPriceMode('net')}>NETTO</Button>
          <Button variant={priceMode === 'gross' ? 'default' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setPriceMode('gross')}>BRUTTO</Button>
        </div>
      </div>

      {/* SERVICES / ROBOCIZNA */}
      <Card className="border-l-4 border-l-primary">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-base">Robocizna / Usługi</h3>
              <Badge variant="secondary" className="text-xs">{tasks.length}</Badge>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={taskSearch} onChange={e => setTaskSearch(e.target.value)} placeholder="Szukaj usługi..." className="pl-8 h-8 w-40 text-xs" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/10">
                  <th className="w-10 p-2 text-center font-medium text-muted-foreground">LP</th>
                  <th className="p-2 text-left font-medium text-muted-foreground min-w-[200px]">USŁUGA</th>
                  <th className="p-2 text-left font-medium text-muted-foreground w-28">PRACOWNIK</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-24">KOSZT USŁ.</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-28">RABAT</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-24">PO RABACIE</th>
                  <th className="w-10 p-2"></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t: any, i: number) => {
                  const price = getItemPrice(t) * (t.quantity || 1);
                  const total = getItemTotal(t);
                  const hasDiscount = (t.discount_percent || 0) > 0;
                  return (
                    <tr key={t.id} className="border-b hover:bg-accent/30 transition-colors text-sm">
                      <td className="p-2 text-center text-muted-foreground">{i + 1}</td>
                      <td className="p-2 font-medium">{t.name}</td>
                      <td className="p-2 text-muted-foreground">{t.mechanic || '—'}</td>
                      <td className="p-2 text-right tabular-nums">{fmt(price)}</td>
                      <td className="p-2 text-right">{t.discount_percent ? `${Math.round(t.discount_percent)}%` : '—'}</td>
                      <td className="p-2 text-right font-semibold tabular-nums">{hasDiscount ? fmt(total) : '—'}</td>
                      <td className="p-2 text-center">
                        <Play className="h-4 w-4 text-primary cursor-pointer hover:scale-110 transition-transform" />
                      </td>
                    </tr>
                  );
                })}

                {/* Sum row */}
                <tr className="bg-muted/30 font-semibold text-sm border-b">
                  <td className="p-2"></td>
                  <td className="p-2" colSpan={2}>Razem usługi</td>
                  <td className="p-2 text-right tabular-nums">{fmt(tasksTotal)}</td>
                  <td className="p-2"></td>
                  <td className="p-2"></td>
                  <td className="p-2"></td>
                </tr>

                {/* Input rows */}
                {taskRows.map((row, idx) => {
                  const rowTotal = isGross ? row.quantity * row.price_gross : row.quantity * row.price_net;
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
                        <Input
                          placeholder="Wpisz nazwę usługi..."
                          value={row.name}
                          onChange={e => updateTaskRow(idx, { name: e.target.value })}
                          className="h-9 text-sm"
                          onKeyDown={e => e.key === 'Enter' && submitTask(row, idx)}
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          placeholder="Pracownik"
                          value={row.mechanic}
                          onChange={e => updateTaskRow(idx, { mechanic: e.target.value })}
                          className="h-9 text-sm"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          placeholder={isGross ? 'Brutto' : 'Netto'}
                          value={isGross ? (row.price_gross || '') : (row.price_net || '')}
                          onChange={e => updateTaskRowPrice(idx, Number(e.target.value))}
                          className="h-9 text-sm text-right"
                        />
                      </td>
                      <td className="p-1.5">
                        <div className="flex items-center gap-1">
                          <Select value={row.discountType} onValueChange={(v: DiscountType) => updateTaskRow(idx, { discountType: v })}>
                            <SelectTrigger className="h-9 text-xs w-16"><SelectValue /></SelectTrigger>
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
                            className="h-9 text-sm text-right w-16"
                          />
                        </div>
                      </td>
                      <td className="p-1.5 text-right text-sm font-semibold tabular-nums">
                        {hasDiscount ? fmt(afterDiscount) : fmt(rowTotal)}
                      </td>
                      <td className="p-1.5 text-center">
                        {taskRows.length > 1 && (
                          <Button onClick={() => removeTaskRow(idx)} size="sm" variant="ghost" className="h-8 w-8 p-0">
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-primary/5">
                  <td colSpan={7} className="p-1.5">
                    <Button onClick={addTaskRow} variant="ghost" size="sm" className="gap-1 text-xs text-primary">
                      <Plus className="h-3.5 w-3.5" /> Dodaj kolejną usługę
                    </Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* PARTS / CZĘŚCI */}
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
                <Button variant={priceMode === 'net' ? 'default' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setPriceMode('net')}>NETTO</Button>
                <Button variant={priceMode === 'gross' ? 'default' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setPriceMode('gross')}>BRUTTO</Button>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={goodsSearch} onChange={e => setGoodsSearch(e.target.value)} placeholder="Szukaj części..." className="pl-8 h-8 w-40 text-xs" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/10">
                  <th className="w-10 p-2 text-center font-medium text-muted-foreground">LP</th>
                  <th className="p-2 text-left font-medium text-muted-foreground min-w-[180px]">NAZWA</th>
                  <th className="p-2 text-center font-medium text-muted-foreground w-16">ILOŚĆ</th>
                  <th className="p-2 text-center font-medium text-muted-foreground w-14">J.M.</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-24">CENA</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-28">
                    <div className="flex items-center justify-end gap-1">
                      <EyeOff className="h-3 w-3" />
                      <span>KOSZT ZAKUPU</span>
                    </div>
                  </th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-24">RAZEM</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-28">RABAT</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-24">PO RABACIE</th>
                  <th className="w-8 p-2"></th>
                </tr>
              </thead>
              <tbody>
                {goods.map((g: any, i: number) => {
                  const itemPrice = getItemPrice(g);
                  const rawTotal = itemPrice * (g.quantity || 1);
                  const itemTotal = getItemTotal(g);
                  const itemCost = getItemCost(g);
                  const hasDiscount = (g.discount_percent || 0) > 0;
                  return (
                    <tr key={g.id} className="border-b hover:bg-accent/30 transition-colors text-sm">
                      <td className="p-2 text-center text-muted-foreground">{i + 1}</td>
                      <td className="p-2 font-medium">{g.name}</td>
                      <td className="p-2 text-center">{g.quantity}</td>
                      <td className="p-2 text-center">{g.unit}</td>
                      <td className="p-2 text-right tabular-nums">{fmt(itemPrice)}</td>
                      <td className="p-2 text-right text-muted-foreground tabular-nums">{fmt(itemCost)}</td>
                      <td className="p-2 text-right tabular-nums">{fmt(rawTotal)}</td>
                      <td className="p-2 text-right">{g.discount_percent ? `${Math.round(g.discount_percent)}%` : '—'}</td>
                      <td className="p-2 text-right font-semibold tabular-nums">{hasDiscount ? fmt(itemTotal) : '—'}</td>
                      <td className="p-2"></td>
                    </tr>
                  );
                })}

                {/* Sum row */}
                <tr className="bg-muted/30 font-semibold text-sm border-b">
                  <td className="p-2"></td>
                  <td className="p-2" colSpan={5}>Razem części</td>
                  <td className="p-2 text-right tabular-nums">{fmt(goodsTotal)}</td>
                  <td className="p-2"></td>
                  <td className="p-2"></td>
                  <td className="p-2"></td>
                </tr>

                {/* Input rows */}
                {goodsRows.map((row, idx) => {
                  const rowTotal = isGross ? row.quantity * row.price_gross : row.quantity * row.price_net;
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
                          className="h-9 text-sm"
                          onKeyDown={e => e.key === 'Enter' && submitGoods(row, idx)}
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          min={1}
                          value={row.quantity}
                          onChange={e => updateGoodsRow(idx, { quantity: Number(e.target.value) })}
                          className="h-9 text-sm text-center"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          placeholder="szt."
                          value={row.unit}
                          onChange={e => updateGoodsRow(idx, { unit: e.target.value })}
                          className="h-9 text-sm text-center"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          placeholder={isGross ? 'Brutto' : 'Netto'}
                          value={isGross ? (row.price_gross || '') : (row.price_net || '')}
                          onChange={e => updateGoodsRowPrice(idx, Number(e.target.value))}
                          className="h-9 text-sm text-right"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          placeholder="Tylko serwis"
                          title="Koszt zakupu — widoczne tylko dla serwisu, klient nie widzi tej wartości"
                          value={isGross ? (row.cost_gross || '') : (row.cost_net || '')}
                          onChange={e => updateGoodsRowCost(idx, Number(e.target.value))}
                          className="h-9 text-sm text-right"
                        />
                      </td>
                      <td className="p-1.5 text-right text-sm tabular-nums">
                        {fmt(rowTotal)}
                      </td>
                      <td className="p-1.5">
                        <div className="flex items-center gap-1">
                          <Select value={row.discountType} onValueChange={(v: DiscountType) => updateGoodsRow(idx, { discountType: v })}>
                            <SelectTrigger className="h-9 text-xs w-16"><SelectValue /></SelectTrigger>
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
                            className="h-9 text-sm text-right w-16"
                          />
                        </div>
                      </td>
                      <td className="p-1.5 text-right text-sm font-semibold tabular-nums">
                        {hasDiscount ? fmt(afterDiscount) : '—'}
                      </td>
                      <td className="p-1.5 text-center">
                        {goodsRows.length > 1 && (
                          <Button onClick={() => removeGoodsRow(idx)} size="sm" variant="ghost" className="h-8 w-8 p-0">
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-amber-500/5">
                  <td colSpan={10} className="p-1.5">
                    <div className="flex items-center gap-2">
                      <Button onClick={addGoodsRow} variant="ghost" size="sm" className="gap-1 text-xs text-amber-600">
                        <Plus className="h-3.5 w-3.5" /> Dodaj pozycję ręcznie
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1 h-7 text-xs">
                        <Package className="h-3.5 w-3.5" /> Dodaj z magazynu
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 h-7 text-xs border-primary text-primary hover:bg-primary/10"
                        onClick={() => {
                          const hasEnabledIntegration = partsIntegrations.some((i: any) => i.is_enabled && i.api_username);
                          if (hasEnabledIntegration) {
                            setRidoSearchOpen(true);
                          } else {
                            setRidoConfigOpen(true);
                          }
                        }}
                      >
                        <Search className="h-3.5 w-3.5" /> Znajdź z Rido
                      </Button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* GRAND TOTAL */}
      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Koszt własny</p>
              <p className="text-lg font-bold text-muted-foreground tabular-nums">{fmt(grandCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Razem {isGross ? 'brutto' : 'netto'}</p>
              <p className="text-2xl font-bold tabular-nums">{fmt(grandTotal)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Zysk</p>
              <p className={`text-lg font-bold tabular-nums ${grandProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                {fmt(grandProfit)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {grandTotal > 0 ? `${Math.round((grandProfit / grandTotal) * 100)}% marży` : '—'}
              </p>
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
        margin={partsIntegrations.find((i: any) => i.is_enabled)?.sales_margin_percent || 30}
      />
      <RidoPartsConfigModal
        open={ridoConfigOpen}
        onOpenChange={setRidoConfigOpen}
        onGoToSettings={() => {
          setRidoConfigOpen(false);
          toast.info('Przejdź do Ustawienia → Integracje w menu bocznym');
        }}
      />
    </div>
  );
}
