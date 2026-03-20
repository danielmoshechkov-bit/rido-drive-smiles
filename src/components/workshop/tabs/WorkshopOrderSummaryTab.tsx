import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useState } from 'react';

interface Props {
  order: any;
}

export function WorkshopOrderSummaryTab({ order }: Props) {
  const [priceMode, setPriceMode] = useState<'net' | 'gross'>('gross');

  const tasks = (order.items || []).filter((i: any) => i.item_type === 'service' || i.item_type === 'task' || (i.item_type !== 'part' && i.item_type !== 'goods' && i.item_type !== 'other'));
  const goods = (order.items || []).filter((i: any) => i.item_type === 'part' || i.item_type === 'goods' || i.item_type === 'other');

  const isGross = priceMode === 'gross';

  const tasksValue = tasks.reduce((s: number, t: any) => s + (isGross ? t.total_gross : t.total_net || 0), 0);
  const tasksCost = tasks.reduce((s: number, t: any) => s + ((t.unit_cost_gross || 0) * (t.quantity || 1)), 0);
  const tasksProfit = tasksValue - (isGross ? tasksCost : tasksCost / 1.23);

  const goodsValue = goods.reduce((s: number, g: any) => s + (isGross ? g.total_gross : g.total_net || 0), 0);
  const goodsCost = goods.reduce((s: number, g: any) => s + ((isGross ? g.unit_cost_gross : g.unit_cost_net || 0) * (g.quantity || 1)), 0);
  const goodsProfit = goodsValue - goodsCost;

  const fmt = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-1">
        <Button variant={priceMode === 'net' ? 'secondary' : 'ghost'} size="sm" onClick={() => setPriceMode('net')}>NETTO</Button>
        <Button variant={priceMode === 'gross' ? 'secondary' : 'ghost'} size="sm" onClick={() => setPriceMode('gross')}>BRUTTO</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead></TableHead>
            <TableHead className="text-right">Wartość</TableHead>
            <TableHead className="text-right">Koszt</TableHead>
            <TableHead className="text-right">Zysk</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-medium">Zadania</TableCell>
            <TableCell className="text-right">{fmt(tasksValue)}</TableCell>
            <TableCell className="text-right">{fmt(isGross ? tasksCost : tasksCost / 1.23)}</TableCell>
            <TableCell className="text-right font-medium text-green-600">{fmt(tasksProfit)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">Towary</TableCell>
            <TableCell className="text-right">{fmt(goodsValue)}</TableCell>
            <TableCell className="text-right">{fmt(goodsCost)}</TableCell>
            <TableCell className="text-right font-medium text-green-600">{fmt(goodsProfit)}</TableCell>
          </TableRow>
          <TableRow className="font-bold border-t-2">
            <TableCell>Razem</TableCell>
            <TableCell className="text-right">{fmt(tasksValue + goodsValue)}</TableCell>
            <TableCell className="text-right">{fmt((isGross ? tasksCost : tasksCost / 1.23) + goodsCost)}</TableCell>
            <TableCell className="text-right text-green-600">{fmt(tasksProfit + goodsProfit)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
