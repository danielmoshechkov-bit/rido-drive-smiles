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

export function WorkshopOrderTasksTab({ order, providerId }: Props) {
  const createItem = useCreateWorkshopOrderItem();
  const [priceMode, setPriceMode] = useState<'net' | 'gross'>(order.price_mode || 'gross');

  const tasks = (order.items || []).filter((i: any) => i.item_type !== 'goods');
  const goods = (order.items || []).filter((i: any) => i.item_type === 'goods');

  const [newTask, setNewTask] = useState({ name: '', mechanic: '', quantity: 1, price: 0, cost: 0, discount: 0, estimated_hours: 0 });
  const [newGoods, setNewGoods] = useState({ name: '', quantity: 1, unit: 'szt', price: 0, cost: 0, discount: 0, task_name: '' });
  const [taskSearch, setTaskSearch] = useState('');
  const [goodsSearch, setGoodsSearch] = useState('');

  const addTask = async () => {
    if (!newTask.name) return;
    const base = newTask.quantity * newTask.price;
    const discounted = base - (base * newTask.discount / 100);
    await createItem.mutateAsync({
      order_id: order.id,
      item_type: 'task',
      name: newTask.name,
      mechanic: newTask.mechanic || null,
      unit: 'oper',
      quantity: newTask.quantity,
      unit_price_gross: priceMode === 'gross' ? newTask.price : newTask.price * 1.23,
      unit_price_net: priceMode === 'net' ? newTask.price : newTask.price / 1.23,
      unit_cost_net: newTask.cost,
      unit_cost_gross: newTask.cost * 1.23,
      discount_percent: newTask.discount,
      total_gross: priceMode === 'gross' ? discounted : discounted * 1.23,
      total_net: priceMode === 'net' ? discounted : discounted / 1.23,
    });
    setNewTask({ name: '', mechanic: '', quantity: 1, price: 0, cost: 0, discount: 0, estimated_hours: 0 });
    toast.success('Usługa dodana');
  };

  const addGoodsItem = async () => {
    if (!newGoods.name) return;
    const base = newGoods.quantity * newGoods.price;
    const discounted = base - (base * newGoods.discount / 100);
    await createItem.mutateAsync({
      order_id: order.id,
      item_type: 'goods',
      name: newGoods.name,
      unit: newGoods.unit,
      quantity: newGoods.quantity,
      unit_price_gross: priceMode === 'gross' ? newGoods.price : newGoods.price * 1.23,
      unit_price_net: priceMode === 'net' ? newGoods.price : newGoods.price / 1.23,
      unit_cost_net: newGoods.cost,
      unit_cost_gross: newGoods.cost * 1.23,
      discount_percent: newGoods.discount,
      total_gross: priceMode === 'gross' ? discounted : discounted * 1.23,
      total_net: priceMode === 'net' ? discounted : discounted / 1.23,
    });
    setNewGoods({ name: '', quantity: 1, unit: 'szt', price: 0, cost: 0, discount: 0, task_name: '' });
    toast.success('Część dodana');
  };

  const fmt = (v: number) => v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  const tasksTotal = tasks.reduce((s: number, t: any) => s + (t.total_gross || 0), 0);
  const tasksCost = tasks.reduce((s: number, t: any) => s + ((t.unit_cost_gross || 0) * (t.quantity || 1)), 0);
  const goodsTotal = goods.reduce((s: number, g: any) => s + (g.total_gross || 0), 0);
  const goodsCost = goods.reduce((s: number, g: any) => s + ((g.unit_cost_gross || 0) * (g.quantity || 1)), 0);
  const grandTotal = tasksTotal + goodsTotal;
  const grandCost = tasksCost + goodsCost;
  const grandProfit = grandTotal - grandCost;

  return (
    <div className="space-y-6">
      {/* Mode toggle & summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
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

          {/* Header */}
          <div className="grid grid-cols-[auto_1fr_120px_80px_80px_100px_80px_100px_100px_40px] gap-1 px-4 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/10">
            <span className="w-8 text-center">#</span>
            <span>Opis usługi</span>
            <span>Pracownik</span>
            <span className="text-center">Ilość</span>
            <span className="text-right">Czas</span>
            <span className="text-right">Cena klienta</span>
            <span className="text-right">Rabat</span>
            <span className="text-right">Koszt własny</span>
            <span className="text-right">Wartość</span>
            <span></span>
          </div>

          {/* Items */}
          {tasks.map((t: any, i: number) => (
            <div key={t.id} className="grid grid-cols-[auto_1fr_120px_80px_80px_100px_80px_100px_100px_40px] gap-1 px-4 py-2.5 items-center border-b hover:bg-accent/30 transition-colors text-sm">
              <span className="w-8 text-center text-xs text-muted-foreground">{i + 1}</span>
              <span className="font-medium truncate">{t.name}</span>
              <span className="text-xs text-muted-foreground">{t.mechanic || '—'}</span>
              <span className="text-center">{t.quantity}</span>
              <span className="text-right text-xs text-muted-foreground flex items-center justify-end gap-1">
                <Clock className="h-3 w-3" /> {t.estimated_hours || '0'}h
              </span>
              <span className="text-right tabular-nums">{fmt(t.unit_price_gross || 0)}</span>
              <span className="text-right text-xs">{t.discount_percent || 0}%</span>
              <span className="text-right text-xs text-muted-foreground tabular-nums">{fmt((t.unit_cost_gross || 0) * (t.quantity || 1))}</span>
              <span className="text-right font-semibold tabular-nums">{fmt(t.total_gross || 0)}</span>
              <span className="text-center">
                {t.status === 'done' 
                  ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                  : <Play className="h-4 w-4 text-primary cursor-pointer hover:scale-110 transition-transform" />
                }
              </span>
            </div>
          ))}
          {tasks.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Brak usług — dodaj pierwszą pozycję poniżej
            </div>
          )}

          {/* Sum row */}
          <div className="grid grid-cols-[auto_1fr_120px_80px_80px_100px_80px_100px_100px_40px] gap-1 px-4 py-2 bg-muted/30 font-semibold text-sm border-b">
            <span className="w-8"></span>
            <span>Razem usługi</span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span className="text-right text-xs text-muted-foreground tabular-nums">{fmt(tasksCost)}</span>
            <span className="text-right tabular-nums">{fmt(tasksTotal)}</span>
            <span></span>
          </div>

          {/* Add new service */}
          <div className="grid grid-cols-[auto_1fr_120px_80px_80px_100px_80px_100px_auto] gap-2 px-4 py-3 items-end">
            <Button onClick={addTask} size="sm" className="gap-1 h-9 w-8 p-0" disabled={!newTask.name}>
              <Plus className="h-4 w-4" />
            </Button>
            <Input placeholder="Nazwa usługi (np. Wymiana klocków)" value={newTask.name} onChange={e => setNewTask(p => ({ ...p, name: e.target.value }))} className="h-9 text-sm" />
            <Input placeholder="Pracownik" value={newTask.mechanic} onChange={e => setNewTask(p => ({ ...p, mechanic: e.target.value }))} className="h-9 text-sm" />
            <Input type="number" min={1} value={newTask.quantity} onChange={e => setNewTask(p => ({ ...p, quantity: Number(e.target.value) }))} className="h-9 text-sm text-center" />
            <Input type="number" step="0.5" placeholder="0h" value={newTask.estimated_hours || ''} onChange={e => setNewTask(p => ({ ...p, estimated_hours: Number(e.target.value) }))} className="h-9 text-sm text-right" />
            <Input type="number" placeholder="Cena" value={newTask.price || ''} onChange={e => setNewTask(p => ({ ...p, price: Number(e.target.value) }))} className="h-9 text-sm text-right" />
            <Input type="number" placeholder="0%" value={newTask.discount || ''} onChange={e => setNewTask(p => ({ ...p, discount: Number(e.target.value) }))} className="h-9 text-sm text-right" />
            <Input type="number" placeholder="Koszt" value={newTask.cost || ''} onChange={e => setNewTask(p => ({ ...p, cost: Number(e.target.value) }))} className="h-9 text-sm text-right" />
            <Button onClick={addTask} size="sm" className="gap-1 h-9" disabled={!newTask.name}>
              Dodaj usługę
            </Button>
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

          {/* Header */}
          <div className="grid grid-cols-[auto_1fr_100px_80px_60px_100px_100px_80px_100px_100px] gap-1 px-4 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/10">
            <span className="w-8 text-center">#</span>
            <span>Nazwa części</span>
            <span>Do usługi</span>
            <span className="text-center">Ilość</span>
            <span className="text-center">J.M.</span>
            <span className="text-right">Cena klienta</span>
            <span className="text-right">Cena zakupu</span>
            <span className="text-right">Rabat</span>
            <span className="text-right">Marża</span>
            <span className="text-right">Wartość</span>
          </div>

          {/* Items */}
          {goods.map((g: any, i: number) => {
            const itemCost = (g.unit_cost_gross || 0) * (g.quantity || 1);
            const itemValue = g.total_gross || 0;
            const itemMargin = itemValue - itemCost;
            return (
              <div key={g.id} className="grid grid-cols-[auto_1fr_100px_80px_60px_100px_100px_80px_100px_100px] gap-1 px-4 py-2.5 items-center border-b hover:bg-accent/30 transition-colors text-sm">
                <span className="w-8 text-center text-xs text-muted-foreground">{i + 1}</span>
                <span className="font-medium truncate">{g.name}</span>
                <span className="text-xs text-muted-foreground">—</span>
                <span className="text-center">{g.quantity}</span>
                <span className="text-center text-xs">{g.unit}</span>
                <span className="text-right tabular-nums">{fmt(g.unit_price_gross || 0)}</span>
                <span className="text-right text-xs text-muted-foreground tabular-nums">{fmt(g.unit_cost_gross || 0)}</span>
                <span className="text-right text-xs">{g.discount_percent || 0}%</span>
                <span className={`text-right text-xs tabular-nums ${itemMargin >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                  {fmt(itemMargin)}
                </span>
                <span className="text-right font-semibold tabular-nums">{fmt(itemValue)}</span>
              </div>
            );
          })}
          {goods.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Brak części — dodaj pozycję poniżej lub pobierz z magazynu
            </div>
          )}

          {/* Sum row */}
          <div className="grid grid-cols-[auto_1fr_100px_80px_60px_100px_100px_80px_100px_100px] gap-1 px-4 py-2 bg-muted/30 font-semibold text-sm border-b">
            <span className="w-8"></span>
            <span>Razem części</span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span className="text-right text-xs text-muted-foreground tabular-nums">{fmt(goodsCost)}</span>
            <span></span>
            <span className={`text-right text-xs tabular-nums ${goodsTotal - goodsCost >= 0 ? 'text-green-600' : 'text-destructive'}`}>
              {fmt(goodsTotal - goodsCost)}
            </span>
            <span className="text-right tabular-nums">{fmt(goodsTotal)}</span>
          </div>

          {/* Add new part */}
          <div className="grid grid-cols-[auto_1fr_100px_80px_60px_100px_100px_80px_auto] gap-2 px-4 py-3 items-end">
            <Button onClick={addGoodsItem} size="sm" className="gap-1 h-9 w-8 p-0 bg-amber-500 hover:bg-amber-600" disabled={!newGoods.name}>
              <Plus className="h-4 w-4" />
            </Button>
            <Input placeholder="Nazwa części (np. Klocki hamulcowe)" value={newGoods.name} onChange={e => setNewGoods(p => ({ ...p, name: e.target.value }))} className="h-9 text-sm" />
            <Select value={newGoods.task_name} onValueChange={v => setNewGoods(p => ({ ...p, task_name: v }))}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Usługa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">—</SelectItem>
                {tasks.map((t: any) => (
                  <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" min={1} value={newGoods.quantity} onChange={e => setNewGoods(p => ({ ...p, quantity: Number(e.target.value) }))} className="h-9 text-sm text-center" />
            <Select value={newGoods.unit} onValueChange={v => setNewGoods(p => ({ ...p, unit: v }))}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="szt">szt.</SelectItem>
                <SelectItem value="kpl">kpl.</SelectItem>
                <SelectItem value="l">l</SelectItem>
                <SelectItem value="m">m</SelectItem>
              </SelectContent>
            </Select>
            <Input type="number" placeholder="Cena" value={newGoods.price || ''} onChange={e => setNewGoods(p => ({ ...p, price: Number(e.target.value) }))} className="h-9 text-sm text-right" />
            <Input type="number" placeholder="Koszt zakupu" value={newGoods.cost || ''} onChange={e => setNewGoods(p => ({ ...p, cost: Number(e.target.value) }))} className="h-9 text-sm text-right" />
            <Input type="number" placeholder="0%" value={newGoods.discount || ''} onChange={e => setNewGoods(p => ({ ...p, discount: Number(e.target.value) }))} className="h-9 text-sm text-right" />
            <Button onClick={addGoodsItem} size="sm" className="gap-1 h-9 bg-amber-500 hover:bg-amber-600" disabled={!newGoods.name}>
              Dodaj część
            </Button>
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
              <p className="text-xs text-muted-foreground mb-1">Wartość dla klienta</p>
              <p className="text-2xl font-bold tabular-nums">{fmt(grandTotal)}</p>
              <p className="text-xs text-muted-foreground mt-1">{priceMode === 'gross' ? 'brutto' : 'netto'}</p>
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
