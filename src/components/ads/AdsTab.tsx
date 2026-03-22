import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageCircle, TrendingUp, Target, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface AdsTabProps {
  userId: string | null;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  new: { label: 'Nowe', variant: 'outline' },
  accepted: { label: 'Przyjęte', variant: 'secondary' },
  in_progress: { label: 'W konfiguracji', variant: 'secondary' },
  review: { label: 'Do akceptacji', variant: 'outline' },
  active: { label: 'Aktywna ✓', variant: 'default' },
  paused: { label: 'Wstrzymana', variant: 'secondary' },
  completed: { label: 'Zakończona', variant: 'secondary' },
  cancelled: { label: 'Anulowana', variant: 'destructive' },
};

export function AdsTab({ userId }: AdsTabProps) {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['ad-orders', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from('ad_orders')
        .select('*')
        .eq('provider_user_id', userId)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!userId,
  });

  if (isLoading) return <p className="text-center py-8 text-muted-foreground">Ładowanie...</p>;

  if (orders.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p className="font-medium">Brak zleceń reklamowych</p>
        <p className="text-sm">Kliknij "Reklamuj" przy dowolnej usłudze, aby uruchomić kampanię</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order: any) => {
        const statusInfo = STATUS_BADGE[order.status] || { label: order.status, variant: 'outline' as const };
        return (
          <Card key={order.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{order.campaign_name || 'Kampania'}</h3>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </div>
                  {order.campaign_started_at && (
                    <p className="text-sm text-muted-foreground">📅 od {format(new Date(order.campaign_started_at), 'dd.MM.yyyy', { locale: pl })}</p>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="flex items-center gap-1"><TrendingUp className="h-4 w-4" /> Leady: {order.leads_this_month || 0}</span>
                    <span className="flex items-center gap-1"><DollarSign className="h-4 w-4" /> Wydano: {order.spend_this_month || 0} zł</span>
                    <span className="flex items-center gap-1"><Target className="h-4 w-4" /> CpL: ~{order.cpl_avg || 0} zł</span>
                    <span>🎯 Cel: {order.campaign_goal}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {order.unread_messages_provider > 0 && (
                    <Button variant="outline" size="sm">
                      <MessageCircle className="h-4 w-4 mr-1" /> Czat ({order.unread_messages_provider})
                    </Button>
                  )}
                  <Button variant="outline" size="sm">Zarządzaj</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
