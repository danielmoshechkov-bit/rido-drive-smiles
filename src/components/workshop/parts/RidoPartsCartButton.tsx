import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingBag, X, Package } from 'lucide-react';
import { usePartsOrders } from '@/hooks/useWorkshopParts';
import { format } from 'date-fns';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';

interface Props {
  providerId: string;
}

const statusLabels: Record<string, string> = {
  ordered: 'Zamówione',
  in_delivery: 'W dostawie',
  delivered: 'Dostarczone',
  cancelled: 'Anulowane',
};

const statusColors: Record<string, string> = {
  ordered: 'bg-amber-500',
  in_delivery: 'bg-blue-500',
  delivered: 'bg-green-500',
  cancelled: 'bg-red-500',
};

export function RidoPartsCartButton({ providerId }: Props) {
  const { data: orders = [] } = usePartsOrders(providerId);
  const activeOrders = orders.filter((o: any) => o.status !== 'delivered' && o.status !== 'cancelled');
  const allItems = orders.flatMap((o: any) => (o.items || []).map((item: any) => ({ ...item, order: o })));

  const fmt = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="Zamówienia części">
          <ShoppingBag className="h-5 w-5" />
          {activeOrders.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
              {activeOrders.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Zamówienia części
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {orders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingBag className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-sm">Brak zamówień</p>
            </div>
          ) : (
            orders.map((order: any) => (
              <div key={order.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase">{order.supplier_code}</Badge>
                    {order.supplier_order_id && (
                      <span className="text-xs text-muted-foreground">#{order.supplier_order_id}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${statusColors[order.status] || 'bg-gray-400'}`} />
                    <span className="text-xs">{statusLabels[order.status] || order.status}</span>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  {order.created_at && format(new Date(order.created_at), 'dd.MM.yyyy HH:mm')}
                </div>

                {(order.items || []).map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between text-xs py-1 border-t">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.product_name}</p>
                      <p className="text-muted-foreground">{item.manufacturer} · ×{item.quantity}</p>
                    </div>
                    <div className="text-right pl-2">
                      <p className="tabular-nums">{fmt(item.purchase_price_net)} zł</p>
                    </div>
                  </div>
                ))}

                <div className="flex justify-between text-xs font-semibold pt-1 border-t">
                  <span>Razem netto:</span>
                  <span>{fmt(order.total_net)} zł</span>
                </div>

                {order.invoice_number && (
                  <div className="text-xs text-muted-foreground">
                    📄 Faktura: {order.invoice_number}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
