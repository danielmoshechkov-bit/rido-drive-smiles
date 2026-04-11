import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Separator } from '@/components/ui/separator';
import { Wrench, Package } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export function WorkshopEstimatePreviewDialog({ open, onOpenChange, order }: Props) {
  const { data: tasks = [] } = useQuery({
    queryKey: ['workshop-order-tasks-preview', order?.id],
    queryFn: async () => {
      if (!order?.id) return [];
      const { data } = await (supabase as any)
        .from('workshop_order_tasks')
        .select('*')
        .eq('order_id', order.id)
        .order('sort_order', { ascending: true });
      return data || [];
    },
    enabled: open && !!order?.id,
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['workshop-order-parts-preview', order?.id],
    queryFn: async () => {
      if (!order?.id) return [];
      const { data } = await (supabase as any)
        .from('workshop_order_parts')
        .select('*')
        .eq('order_id', order.id)
        .order('sort_order', { ascending: true });
      return data || [];
    },
    enabled: open && !!order?.id,
  });

  const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const servicesTotal = tasks.reduce((sum: number, t: any) => sum + (t.price_gross || 0), 0);
  const partsTotal = parts.reduce((sum: number, p: any) => sum + ((p.price_gross || 0) * (p.quantity || 1)), 0);
  const grandTotal = servicesTotal + partsTotal;

  const clientName = order?.client
    ? order.client.client_type === 'company'
      ? order.client.company_name
      : `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim()
    : '—';

  const vehicleName = order?.vehicle
    ? `${order.vehicle.brand || ''} ${order.vehicle.model || ''} ${order.vehicle.plate || ''}`.trim()
    : '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Podgląd kosztorysu — {order?.order_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 text-sm text-muted-foreground">
          <p>Klient: <span className="text-foreground font-medium">{clientName}</span></p>
          <p>Pojazd: <span className="text-foreground font-medium">{vehicleName}</span></p>
        </div>

        <Separator />

        {/* Services */}
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
            <Wrench className="h-4 w-4" /> Robocizna / Usługi ({tasks.length})
          </h3>
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">Brak pozycji</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-1 pr-2">LP</th>
                  <th className="text-left py-1">Usługa</th>
                  <th className="text-right py-1">Cena brutto</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t: any, i: number) => (
                  <tr key={t.id} className="border-b border-dashed">
                    <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5">{t.description || '—'}</td>
                    <td className="py-1.5 text-right font-medium">{fmt(t.price_gross)} zł</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={2} className="py-1.5 text-right">Razem usługi:</td>
                  <td className="py-1.5 text-right">{fmt(servicesTotal)} zł</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <Separator />

        {/* Parts */}
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
            <Package className="h-4 w-4" /> Części i materiały ({parts.length})
          </h3>
          {parts.length === 0 ? (
            <p className="text-xs text-muted-foreground">Brak pozycji</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-1 pr-2">LP</th>
                  <th className="text-left py-1">Nazwa</th>
                  <th className="text-right py-1">Ilość</th>
                  <th className="text-right py-1">Cena</th>
                  <th className="text-right py-1">Wartość</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((p: any, i: number) => (
                  <tr key={p.id} className="border-b border-dashed">
                    <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5">{p.name || '—'}</td>
                    <td className="py-1.5 text-right">{p.quantity || 1}</td>
                    <td className="py-1.5 text-right">{fmt(p.price_gross)} zł</td>
                    <td className="py-1.5 text-right font-medium">{fmt((p.price_gross || 0) * (p.quantity || 1))} zł</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={4} className="py-1.5 text-right">Razem części:</td>
                  <td className="py-1.5 text-right">{fmt(partsTotal)} zł</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <Separator />

        <div className="flex justify-between items-center text-base font-bold">
          <span>RAZEM DO ZAPŁATY:</span>
          <span>{fmt(grandTotal)} zł</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
