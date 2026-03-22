import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useState } from 'react';

interface Props {
  order: any;
}

const VAT_RATE = 1.23;

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

  const fallbackUnitCost = gross
    ? safeNumber(item.unit_cost_net) * VAT_RATE
    : safeNumber(item.unit_cost_gross) / VAT_RATE;

  return fallbackUnitCost > 0 ? fallbackUnitCost * quantity : 0;
};

export function WorkshopOrderSummaryTab({ order }: Props) {
  const [priceMode, setPriceMode] = useState<'net' | 'gross'>('gross');

  const tasks = (order.items || []).filter((i: any) => i.item_type === 'service' || i.item_type === 'task');
  const goods = (order.items || []).filter((i: any) => i.item_type === 'part' || i.item_type === 'goods' || i.item_type === 'other');

  const isGross = priceMode === 'gross';

  const tasksValue = tasks.reduce((s: number, t: any) => s + getLineTotal(t, isGross), 0);
  const tasksCost = tasks.reduce((s: number, t: any) => s + getLineCost(t, isGross), 0);
  const tasksProfit = tasksValue - tasksCost;

  const goodsValue = goods.reduce((s: number, g: any) => s + getLineTotal(g, isGross), 0);
  const goodsCost = goods.reduce((s: number, g: any) => s + getLineCost(g, isGross), 0);
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
            <TableCell className="text-right">{fmt(tasksCost)}</TableCell>
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
            <TableCell className="text-right">{fmt(tasksCost + goodsCost)}</TableCell>
            <TableCell className="text-right text-green-600">{fmt(tasksProfit + goodsProfit)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
