import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingBag, Package, FileText, Loader2, RefreshCw } from 'lucide-react';
import { usePartsOrders } from '@/hooks/useWorkshopParts';
import { usePartsApi } from '@/hooks/useWorkshopParts';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
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
  const { data: orders = [], refetch } = usePartsOrders(providerId);
  const partsApi = usePartsApi();
  const [isFetchingInvoices, setIsFetchingInvoices] = useState(false);
  const activeOrders = orders.filter((o: any) => o.status !== 'delivered' && o.status !== 'cancelled');

  const fmt = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fetchInvoices = async () => {
    setIsFetchingInvoices(true);
    try {
      const dateTo = format(new Date(), 'yyyy-MM-dd');
      const dateFrom = format(subDays(new Date(), 7), 'yyyy-MM-dd');

      // Fetch invoices
      const invoicesRes = await partsApi.mutateAsync({
        action: 'get_invoices',
        provider_id: providerId,
        supplier_code: 'hart',
        params: { dateFrom, dateTo },
      });

      const invoices = invoicesRes.invoices?.items || invoicesRes.invoices || [];
      let newInvoiceCount = 0;

      // Process invoices - update matching orders
      for (const inv of invoices) {
        const invoiceNumber = inv.number || inv.invoiceNumber || inv.documentNumber;
        if (!invoiceNumber) continue;

        // Try to match with orders by supplier_order_id
        const matchingOrder = orders.find((o: any) =>
          o.supplier_code === 'hart' && o.supplier_order_id &&
          (inv.orderNumber === o.supplier_order_id || inv.orderId === o.supplier_order_id)
        );

        if (matchingOrder) {
          await (supabase as any)
            .from('workshop_parts_orders')
            .update({
              invoice_number: invoiceNumber,
              status: 'delivered',
            })
            .eq('id', matchingOrder.id);
          newInvoiceCount++;
        }
      }

      // Fetch delivery notes - mark orders as "in_delivery"
      try {
        const dnRes = await partsApi.mutateAsync({
          action: 'get_delivery_notes',
          provider_id: providerId,
          supplier_code: 'hart',
          params: { dateFrom, dateTo },
        });

        const deliveryNotes = dnRes.deliveryNotes?.items || dnRes.deliveryNotes || [];
        for (const dn of deliveryNotes) {
          const matchingOrder = orders.find((o: any) =>
            o.supplier_code === 'hart' && o.status === 'ordered' &&
            o.supplier_order_id && (dn.orderNumber === o.supplier_order_id || dn.orderId === o.supplier_order_id)
          );

          if (matchingOrder) {
            await (supabase as any)
              .from('workshop_parts_orders')
              .update({ status: 'in_delivery' })
              .eq('id', matchingOrder.id);
          }
        }
      } catch (dnErr) {
        console.warn('Delivery notes fetch failed:', dnErr);
      }

      // Fetch invoice corrections
      try {
        const corrRes = await partsApi.mutateAsync({
          action: 'get_invoice_corrections',
          provider_id: providerId,
          supplier_code: 'hart',
          params: { dateFrom, dateTo },
        });

        const corrections = corrRes.corrections?.items || corrRes.corrections || [];
        for (const corr of corrections) {
          const matchingOrder = orders.find((o: any) =>
            o.supplier_code === 'hart' && o.invoice_number &&
            (corr.originalInvoiceNumber === o.invoice_number)
          );

          if (matchingOrder && corr.totalNet) {
            await (supabase as any)
              .from('workshop_parts_orders')
              .update({
                total_net: corr.totalNet,
                total_gross: corr.totalGross || corr.totalNet * 1.23,
              })
              .eq('id', matchingOrder.id);
          }
        }
      } catch (corrErr) {
        console.warn('Invoice corrections fetch failed:', corrErr);
      }

      await refetch();

      if (newInvoiceCount > 0) {
        toast.success(`📄 Pobrano ${newInvoiceCount} nowych faktur z Hart`);
      } else if (invoices.length > 0) {
        toast.info('Brak nowych faktur do przypisania');
      } else {
        toast.info('Brak faktur z ostatnich 7 dni');
      }
    } catch (err: any) {
      toast.error(err.message || 'Błąd pobierania faktur');
    } finally {
      setIsFetchingInvoices(false);
    }
  };

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

        {/* Fetch invoices button */}
        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={fetchInvoices}
            disabled={isFetchingInvoices || orders.length === 0}
          >
            {isFetchingInvoices ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Pobierz faktury z hurtowni
          </Button>
        </div>

        <div className="mt-4 space-y-4">
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
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Faktura: {order.invoice_number}
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
