import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCreateWorkshopOrderItem, useUpdateWorkshopOrder } from '@/hooks/useWorkshop';
import { Plus, Trash2, Package } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  order: any;
  providerId: string;
}

export function WorkshopOrderTasksTab({ order, providerId }: Props) {
  const createItem = useCreateWorkshopOrderItem();
  const [priceMode, setPriceMode] = useState<'net' | 'gross'>(order.price_mode || 'gross');

  // Tasks = items with type 'task', Goods = items with type 'goods'
  const tasks = (order.items || []).filter((i: any) => i.item_type !== 'goods');
  const goods = (order.items || []).filter((i: any) => i.item_type === 'goods');

  const [newTask, setNewTask] = useState({ name: '', mechanic: '', unit: 'oper', quantity: 1, price: 0, cost: 0, discount: 0 });
  const [newGoods, setNewGoods] = useState({ name: '', quantity: 1, unit: 'szt', price: 0, cost: 0, discount: 0 });

  const addTask = async () => {
    if (!newTask.name) return;
    const base = newTask.quantity * newTask.price;
    const discounted = base - (base * newTask.discount / 100);
    await createItem.mutateAsync({
      order_id: order.id,
      item_type: 'task',
      name: newTask.name,
      mechanic: newTask.mechanic || null,
      unit: newTask.unit,
      quantity: newTask.quantity,
      unit_price_gross: priceMode === 'gross' ? newTask.price : newTask.price * 1.23,
      unit_price_net: priceMode === 'net' ? newTask.price : newTask.price / 1.23,
      unit_cost_net: newTask.cost,
      unit_cost_gross: newTask.cost * 1.23,
      discount_percent: newTask.discount,
      total_gross: priceMode === 'gross' ? discounted : discounted * 1.23,
      total_net: priceMode === 'net' ? discounted : discounted / 1.23,
    });
    setNewTask({ name: '', mechanic: '', unit: 'oper', quantity: 1, price: 0, cost: 0, discount: 0 });
    toast.success('Zadanie dodane');
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
    setNewGoods({ name: '', quantity: 1, unit: 'szt', price: 0, cost: 0, discount: 0 });
    toast.success('Towar dodany');
  };

  const tasksTotal = tasks.reduce((s: number, t: any) => s + (t.total_gross || 0), 0);
  const goodsTotal = goods.reduce((s: number, g: any) => s + (g.total_gross || 0), 0);

  return (
    <div className="space-y-8">
      {/* Price mode toggle */}
      <div className="flex justify-end gap-1">
        <Button variant={priceMode === 'net' ? 'secondary' : 'ghost'} size="sm" onClick={() => setPriceMode('net')}>NETTO</Button>
        <Button variant={priceMode === 'gross' ? 'secondary' : 'ghost'} size="sm" onClick={() => setPriceMode('gross')}>BRUTTO</Button>
      </div>

      {/* TASKS */}
      <div>
        <h3 className="font-semibold text-lg mb-3">Zadania</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">LP</TableHead>
              <TableHead>Zadanie</TableHead>
              <TableHead>Mechanik</TableHead>
              <TableHead>Jedn</TableHead>
              <TableHead className="text-right">Ilość</TableHead>
              <TableHead className="text-right">Rabat</TableHead>
              <TableHead className="text-right">Koszt usł.</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((t: any, i: number) => (
              <TableRow key={t.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>{t.mechanic || <span className="text-primary text-sm cursor-pointer">wybierz</span>}</TableCell>
                <TableCell>{t.unit}</TableCell>
                <TableCell className="text-right">{t.quantity}</TableCell>
                <TableCell className="text-right">{t.discount_percent || 0}%</TableCell>
                <TableCell className="text-right">{(t.total_gross || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2 })}</TableCell>
                <TableCell className="text-right">▶</TableCell>
              </TableRow>
            ))}
            {tasks.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Brak danych</TableCell></TableRow>
            )}
            <TableRow className="font-semibold bg-muted/50">
              <TableCell colSpan={6}>Razem</TableCell>
              <TableCell className="text-right">{tasksTotal.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>

        {/* Add task row */}
        <div className="flex gap-2 mt-3 items-end">
          <Button onClick={addTask} className="gap-1 shrink-0"><Plus className="h-4 w-4" /> Dodaj</Button>
          <Input placeholder="Nazwa zadania" value={newTask.name} onChange={e => setNewTask(p => ({ ...p, name: e.target.value }))} />
          <Input placeholder="Mechanik" value={newTask.mechanic} onChange={e => setNewTask(p => ({ ...p, mechanic: e.target.value }))} className="w-28" />
          <Input type="number" placeholder="Ilość" value={newTask.quantity} onChange={e => setNewTask(p => ({ ...p, quantity: Number(e.target.value) }))} className="w-20" />
          <Input type="number" placeholder="Cena" value={newTask.price || ''} onChange={e => setNewTask(p => ({ ...p, price: Number(e.target.value) }))} className="w-28" />
        </div>
      </div>

      {/* GOODS / TOWARY */}
      <div>
        <h3 className="font-semibold text-lg mb-3">Towary</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">LP</TableHead>
              <TableHead>Towar</TableHead>
              <TableHead>Ilość</TableHead>
              <TableHead>J.M.</TableHead>
              <TableHead className="text-right">Cena</TableHead>
              <TableHead className="text-right">Koszt</TableHead>
              <TableHead className="text-right">Rabat</TableHead>
              <TableHead className="text-right">Wartość</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {goods.map((g: any, i: number) => (
              <TableRow key={g.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell>{g.quantity}</TableCell>
                <TableCell>{g.unit}</TableCell>
                <TableCell className="text-right">{(g.unit_price_gross || 0).toFixed(2)}</TableCell>
                <TableCell className="text-right">{(g.unit_cost_gross || 0).toFixed(2)}</TableCell>
                <TableCell className="text-right">{g.discount_percent || 0}%</TableCell>
                <TableCell className="text-right">{(g.total_gross || 0).toFixed(2)}</TableCell>
              </TableRow>
            ))}
            {goods.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Brak danych</TableCell></TableRow>
            )}
            <TableRow className="font-semibold bg-muted/50">
              <TableCell colSpan={7}>Razem</TableCell>
              <TableCell className="text-right">{goodsTotal.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {/* Add goods row */}
        <div className="flex gap-2 mt-3 items-end">
          <Button variant="outline" className="gap-1 shrink-0"><Package className="h-4 w-4" /> Z magazynu</Button>
          <Button onClick={addGoodsItem} className="gap-1 shrink-0"><Plus className="h-4 w-4" /> Dodaj pozycję</Button>
          <Input placeholder="Towar" value={newGoods.name} onChange={e => setNewGoods(p => ({ ...p, name: e.target.value }))} />
          <Input type="number" placeholder="Ilość" value={newGoods.quantity} onChange={e => setNewGoods(p => ({ ...p, quantity: Number(e.target.value) }))} className="w-20" />
          <Input type="number" placeholder="Cena" value={newGoods.price || ''} onChange={e => setNewGoods(p => ({ ...p, price: Number(e.target.value) }))} className="w-28" />
          <Input type="number" placeholder="Koszt" value={newGoods.cost || ''} onChange={e => setNewGoods(p => ({ ...p, cost: Number(e.target.value) }))} className="w-28" />
        </div>
      </div>

      {/* Grand total */}
      <div className="text-right font-bold text-lg border-t pt-3">
        Razem brutto: {(tasksTotal + goodsTotal).toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
      </div>
    </div>
  );
}
