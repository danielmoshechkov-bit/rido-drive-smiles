import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCreateWorkshopOrderItem, useUpdateWorkshopOrder } from '@/hooks/useWorkshop';
import { Plus, Trash2, Package, Wrench, Clock, Play, CheckCircle2, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface Props {
  order: any;
  providerId: string;
}

const VAT_RATE = 1.23;

export function WorkshopOrderTasksTab({ order, providerId }: Props) {
  const createItem = useCreateWorkshopOrderItem();
  const [priceMode, setPriceMode] = useState<'net' | 'gross'>(order.price_mode || 'gross');

  const tasks = (order.items || []).filter((i: any) => i.item_type !== 'goods');
  const goods = (order.items || []).filter((i: any) => i.item_type === 'goods');

  const isGross = priceMode === 'gross';

  // New task inline row
  const emptyTask = { name: '', mechanic: '', quantity: 1, price_net: 0, price_gross: 0, cost_net: 0, cost_gross: 0, discount: 0 };
  const [newTask, setNewTask] = useState(emptyTask);
  const [taskSearch, setTaskSearch] = useState('');

  // New goods inline row
  const emptyGoods = { name: '', quantity: 1, unit: 'szt', price_net: 0, price_gross: 0, cost_net: 0, cost_gross: 0, discount: 0, task_name: '' };
  const [newGoods, setNewGoods] = useState(emptyGoods);
  const [goodsSearch, setGoodsSearch] = useState('');

  // Sync net<->gross helper
  const syncPrice = (val: number, field: 'net' | 'gross') => {
    if (field === 'net') return { net: val, gross: Math.round(val * VAT_RATE * 100) / 100 };
    return { net: Math.round(val / VAT_RATE * 100) / 100, gross: val };
  };

  const updateTaskPrice = (val: number) => {
    const { net, gross } = syncPrice(val, isGross ? 'gross' : 'net');
    setNewTask(p => ({ ...p, price_net: net, price_gross: gross }));
  };

  const updateTaskCost = (val: number) => {
    const { net, gross } = syncPrice(val, isGross ? 'gross' : 'net');
    setNewTask(p => ({ ...p, cost_net: net, cost_gross: gross }));
  };

  const updateGoodsPrice = (val: number) => {
    const { net, gross } = syncPrice(val, isGross ? 'gross' : 'net');
    setNewGoods(p => ({ ...p, price_net: net, price_gross: gross }));
  };

  const updateGoodsCost = (val: number) => {
    const { net, gross } = syncPrice(val, isGross ? 'gross' : 'net');
    setNewGoods(p => ({ ...p, cost_net: net, cost_gross: gross }));
  };

  const calcTotal = (qty: number, priceGross: number, priceNet: number, discount: number) => {
    const base = isGross ? qty * priceGross : qty * priceNet;
    return base - (base * discount / 100);
  };

  const addTask = async () => {
    if (!newTask.name) return;
    const totalGross = calcTotal(newTask.quantity, newTask.price_gross, newTask.price_net, newTask.discount);
    const totalNet = calcTotal(newTask.quantity, newTask.price_net, newTask.price_net, newTask.discount);
    await createItem.mutateAsync({
      order_id: order.id,
      item_type: 'task',
      name: newTask.name,
      mechanic: newTask.mechanic || null,
      unit: 'oper',
      quantity: newTask.quantity,
      unit_price_gross: newTask.price_gross,
      unit_price_net: newTask.price_net,
      unit_cost_net: newTask.cost_net,
      unit_cost_gross: newTask.cost_gross,
      discount_percent: newTask.discount,
      total_gross: isGross ? totalGross : totalGross * VAT_RATE,
      total_net: isGross ? totalGross / VAT_RATE : totalGross,
    } as any);
    setNewTask(emptyTask);
    toast.success('Usługa dodana');
  };

  const addGoodsItem = async () => {
    if (!newGoods.name) return;
    const totalGross = calcTotal(newGoods.quantity, newGoods.price_gross, newGoods.price_net, newGoods.discount);
    await createItem.mutateAsync({
      order_id: order.id,
      item_type: 'goods',
      name: newGoods.name,
      unit: newGoods.unit,
      quantity: newGoods.quantity,
      unit_price_gross: newGoods.price_gross,
      unit_price_net: newGoods.price_net,
      unit_cost_net: newGoods.cost_net,
      unit_cost_gross: newGoods.cost_gross,
      discount_percent: newGoods.discount,
      total_gross: isGross ? totalGross : totalGross * VAT_RATE,
      total_net: isGross ? totalGross / VAT_RATE : totalGross,
    });
    setNewGoods(emptyGoods);
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
          <Button
            variant={priceMode === 'net' ? 'default' : 'ghost'}
            size="sm"
            className="text-xs h-7"
            onClick={() => setPriceMode('net')}
          >
            NETTO
          </Button>
          <Button
            variant={priceMode === 'gross' ? 'default' : 'ghost'}
            size="sm"
            className="text-xs h-7"
            onClick={() => setPriceMode('gross')}
          >
            BRUTTO
          </Button>
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

          {/* Table header */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/10">
                  <th className="w-10 p-2 text-center font-medium text-muted-foreground">LP</th>
                  <th className="p-2 text-left font-medium text-muted-foreground min-w-[200px]">ZADANIE</th>
                  <th className="p-2 text-left font-medium text-muted-foreground w-28">MECHANIK</th>
                  <th className="p-2 text-center font-medium text-muted-foreground w-16">ILOŚĆ</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-24">
                    CENA {isGross ? 'BR.' : 'NT.'}
                  </th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-16">RABAT</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-24">
                    KOSZT {isGross ? 'BR.' : 'NT.'}
                  </th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-24">WARTOŚĆ</th>
                  <th className="w-10 p-2"></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t: any, i: number) => (
                  <tr key={t.id} className="border-b hover:bg-accent/30 transition-colors text-sm">
                    <td className="p-2 text-center text-muted-foreground">{i + 1}</td>
                    <td className="p-2 font-medium">{t.name}</td>
                    <td className="p-2 text-muted-foreground">{t.mechanic || '—'}</td>
                    <td className="p-2 text-center">{t.quantity}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(getItemPrice(t))}</td>
                    <td className="p-2 text-right">{t.discount_percent || 0}%</td>
                    <td className="p-2 text-right text-muted-foreground tabular-nums">{fmt(getItemCost(t))}</td>
                    <td className="p-2 text-right font-semibold tabular-nums">{fmt(getItemTotal(t))}</td>
                    <td className="p-2 text-center">
                      <Play className="h-4 w-4 text-primary cursor-pointer hover:scale-110 transition-transform" />
                    </td>
                  </tr>
                ))}
                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-muted-foreground">
                      Brak usług — dodaj pierwszą pozycję poniżej
                    </td>
                  </tr>
                )}
                {/* Sum row */}
                <tr className="bg-muted/30 font-semibold text-sm border-b">
                  <td className="p-2"></td>
                  <td className="p-2" colSpan={3}>Razem usługi</td>
                  <td className="p-2"></td>
                  <td className="p-2 text-right text-muted-foreground tabular-nums">{fmt(tasksCost)}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(tasksTotal)}</td>
                  <td className="p-2"></td>
                </tr>
                {/* Add new row - inline like invoice */}
                <tr className="bg-primary/5">
                  <td className="p-2 text-center">
                    <Button onClick={addTask} size="sm" className="h-8 w-8 p-0" disabled={!newTask.name}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </td>
                  <td className="p-1.5">
                    <Input
                      placeholder="Wpisz nazwę usługi..."
                      value={newTask.name}
                      onChange={e => setNewTask(p => ({ ...p, name: e.target.value }))}
                      className="h-9 text-sm"
                      onKeyDown={e => e.key === 'Enter' && addTask()}
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      placeholder="Pracownik"
                      value={newTask.mechanic}
                      onChange={e => setNewTask(p => ({ ...p, mechanic: e.target.value }))}
                      className="h-9 text-sm"
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      type="number"
                      min={1}
                      value={newTask.quantity}
                      onChange={e => setNewTask(p => ({ ...p, quantity: Number(e.target.value) }))}
                      className="h-9 text-sm text-center"
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      type="number"
                      placeholder={isGross ? 'Brutto' : 'Netto'}
                      value={isGross ? (newTask.price_gross || '') : (newTask.price_net || '')}
                      onChange={e => updateTaskPrice(Number(e.target.value))}
                      className="h-9 text-sm text-right"
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      type="number"
                      placeholder="0%"
                      value={newTask.discount || ''}
                      onChange={e => setNewTask(p => ({ ...p, discount: Number(e.target.value) }))}
                      className="h-9 text-sm text-right"
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      type="number"
                      placeholder={isGross ? 'Koszt br.' : 'Koszt nt.'}
                      value={isGross ? (newTask.cost_gross || '') : (newTask.cost_net || '')}
                      onChange={e => updateTaskCost(Number(e.target.value))}
                      className="h-9 text-sm text-right"
                    />
                  </td>
                  <td className="p-1.5 text-right text-sm font-semibold tabular-nums">
                    {fmt(calcTotal(
                      newTask.quantity,
                      newTask.price_gross,
                      newTask.price_net,
                      newTask.discount
                    ))}
                  </td>
                  <td className="p-1.5">
                    <Button onClick={addTask} size="sm" className="h-8 w-8 p-0" variant="ghost" disabled={!newTask.name}>
                      <CheckCircle2 className="h-4 w-4" />
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
              <Button variant="outline" size="sm" className="gap-1 h-8 text-xs">
                <Package className="h-3.5 w-3.5" /> Z magazynu
              </Button>
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
                  <th className="p-2 text-left font-medium text-muted-foreground min-w-[200px]">TOWAR</th>
                  <th className="p-2 text-left font-medium text-muted-foreground w-28">DO USŁUGI</th>
                  <th className="p-2 text-center font-medium text-muted-foreground w-16">ILOŚĆ</th>
                  <th className="p-2 text-center font-medium text-muted-foreground w-14">J.M.</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-24">
                    CENA {isGross ? 'BR.' : 'NT.'}
                  </th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-24">
                    KOSZT {isGross ? 'BR.' : 'NT.'}
                  </th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-16">RABAT</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-24">MARŻA</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-24">WARTOŚĆ</th>
                </tr>
              </thead>
              <tbody>
                {goods.map((g: any, i: number) => {
                  const itemCost = getItemCost(g) * (g.quantity || 1);
                  const itemValue = getItemTotal(g);
                  const itemMargin = itemValue - itemCost;
                  return (
                    <tr key={g.id} className="border-b hover:bg-accent/30 transition-colors text-sm">
                      <td className="p-2 text-center text-muted-foreground">{i + 1}</td>
                      <td className="p-2 font-medium">{g.name}</td>
                      <td className="p-2 text-muted-foreground">—</td>
                      <td className="p-2 text-center">{g.quantity}</td>
                      <td className="p-2 text-center">{g.unit}</td>
                      <td className="p-2 text-right tabular-nums">{fmt(getItemPrice(g))}</td>
                      <td className="p-2 text-right text-muted-foreground tabular-nums">{fmt(getItemCost(g))}</td>
                      <td className="p-2 text-right">{g.discount_percent || 0}%</td>
                      <td className={`p-2 text-right tabular-nums ${itemMargin >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {fmt(itemMargin)}
                      </td>
                      <td className="p-2 text-right font-semibold tabular-nums">{fmt(itemValue)}</td>
                    </tr>
                  );
                })}
                {goods.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-muted-foreground">
                      Brak części — dodaj pozycję poniżej lub pobierz z magazynu
                    </td>
                  </tr>
                )}
                {/* Sum row */}
                <tr className="bg-muted/30 font-semibold text-sm border-b">
                  <td className="p-2"></td>
                  <td className="p-2" colSpan={4}>Razem części</td>
                  <td className="p-2"></td>
                  <td className="p-2 text-right text-muted-foreground tabular-nums">{fmt(goodsCost)}</td>
                  <td className="p-2"></td>
                  <td className={`p-2 text-right tabular-nums ${goodsTotal - goodsCost >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {fmt(goodsTotal - goodsCost)}
                  </td>
                  <td className="p-2 text-right tabular-nums">{fmt(goodsTotal)}</td>
                </tr>
                {/* Add new part inline */}
                <tr className="bg-amber-500/5">
                  <td className="p-2 text-center">
                    <Button onClick={addGoodsItem} size="sm" className="h-8 w-8 p-0 bg-amber-500 hover:bg-amber-600" disabled={!newGoods.name}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </td>
                  <td className="p-1.5">
                    <Input
                      placeholder="Wpisz nazwę części..."
                      value={newGoods.name}
                      onChange={e => setNewGoods(p => ({ ...p, name: e.target.value }))}
                      className="h-9 text-sm"
                      onKeyDown={e => e.key === 'Enter' && addGoodsItem()}
                    />
                  </td>
                  <td className="p-1.5">
                    <Select value={newGoods.task_name} onValueChange={v => setNewGoods(p => ({ ...p, task_name: v }))}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Usługa" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {tasks.map((t: any) => (
                          <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-1.5">
                    <Input
                      type="number"
                      min={1}
                      value={newGoods.quantity}
                      onChange={e => setNewGoods(p => ({ ...p, quantity: Number(e.target.value) }))}
                      className="h-9 text-sm text-center"
                    />
                  </td>
                  <td className="p-1.5">
                    <Select value={newGoods.unit} onValueChange={v => setNewGoods(p => ({ ...p, unit: v }))}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="szt">szt.</SelectItem>
                        <SelectItem value="kpl">kpl.</SelectItem>
                        <SelectItem value="l">l</SelectItem>
                        <SelectItem value="m">m</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-1.5">
                    <Input
                      type="number"
                      placeholder={isGross ? 'Brutto' : 'Netto'}
                      value={isGross ? (newGoods.price_gross || '') : (newGoods.price_net || '')}
                      onChange={e => updateGoodsPrice(Number(e.target.value))}
                      className="h-9 text-sm text-right"
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      type="number"
                      placeholder={isGross ? 'Koszt br.' : 'Koszt nt.'}
                      value={isGross ? (newGoods.cost_gross || '') : (newGoods.cost_net || '')}
                      onChange={e => updateGoodsCost(Number(e.target.value))}
                      className="h-9 text-sm text-right"
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      type="number"
                      placeholder="0%"
                      value={newGoods.discount || ''}
                      onChange={e => setNewGoods(p => ({ ...p, discount: Number(e.target.value) }))}
                      className="h-9 text-sm text-right"
                    />
                  </td>
                  <td className="p-1.5"></td>
                  <td className="p-1.5 text-right text-sm font-semibold tabular-nums">
                    {fmt(calcTotal(
                      newGoods.quantity,
                      newGoods.price_gross,
                      newGoods.price_net,
                      newGoods.discount
                    ))}
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
    </div>
  );
}
