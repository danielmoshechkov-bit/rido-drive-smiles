import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useIsWorkshopEmployee } from '@/hooks/useIsWorkshopEmployee';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Building2, Wrench, ArrowLeft, ClipboardList } from 'lucide-react';

export default function WorkshopEmployeePortal() {
  const navigate = useNavigate();
  const { loading, isWorkshopEmployee, records } = useIsWorkshopEmployee();
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }
      const { data } = await (supabase.from('workshop_order_assignments') as any)
        .select('id, order_id, provider_id, status, created_at, workshop_orders(order_number, status, vehicle_make, vehicle_model, registration_number, client_name)')
        .eq('employee_user_id', user.id)
        .order('created_at', { ascending: false });
      setOrders(data || []);
      setOrdersLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!isWorkshopEmployee) {
    return (
      <div className="container max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Wrench className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <h2 className="text-lg font-semibold">Brak dostępu</h2>
            <p className="text-sm text-muted-foreground">
              Nie jesteś przypisany/a do żadnego warsztatu jako pracownik. Jeśli właśnie otrzymałeś/aś zaproszenie email,
              kliknij link w wiadomości aby je przyjąć.
            </p>
            <Button variant="outline" onClick={() => navigate('/klient')}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Wróć do portalu klienta
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/klient')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Moje konto
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="h-6 w-6 text-primary" /> Pracownik Warsztatu
          </h1>
          <p className="text-sm text-muted-foreground">Twoje przydzielone zlecenia</p>
        </div>
      </div>

      <div className="grid gap-3">
        {records.map(r => (
          <Card key={r.id}>
            <CardContent className="py-3 flex items-center gap-3">
              <Building2 className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <div className="font-medium">{r.provider_name || 'Warsztat'}</div>
                <div className="text-xs text-muted-foreground uppercase">{r.role}</div>
              </div>
              <Badge variant="secondary">Aktywny</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Moje zlecenia ({orders.length})</h2>
          </div>
          {ordersLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Brak przydzielonych zleceń. Gdy warsztat przydzieli Ci zlecenie — pojawi się tutaj.
            </div>
          ) : (
            <div className="divide-y">
              {orders.map(o => (
                <button
                  key={o.id}
                  className="w-full text-left p-3 hover:bg-muted/50 flex items-center gap-3"
                  onClick={() => navigate(`/pracownik-warsztat/zlecenia/${o.order_id}`)}
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm">
                      {o.workshop_orders?.order_number || o.order_id.slice(0, 8)}
                      {o.workshop_orders?.registration_number && (
                        <span className="ml-2 text-muted-foreground">· {o.workshop_orders.registration_number}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[o.workshop_orders?.vehicle_make, o.workshop_orders?.vehicle_model].filter(Boolean).join(' ')}
                      {o.workshop_orders?.client_name && ` · ${o.workshop_orders.client_name}`}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">{o.status}</Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
