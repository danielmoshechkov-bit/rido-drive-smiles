import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageCircle, TrendingUp, Target, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { pl, enUS } from 'date-fns/locale';

interface AdsTabProps {
  userId: string | null;
}

export function AdsTab({ userId }: AdsTabProps) {
  const { t, i18n } = useTranslation();
  const dateFnsLocale = i18n.language === 'pl' ? pl : enUS;

  const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    new: { label: t('ads.statusNew'), variant: 'outline' },
    accepted: { label: t('ads.statusAccepted'), variant: 'secondary' },
    in_progress: { label: t('ads.statusInProgress'), variant: 'secondary' },
    review: { label: t('ads.statusReview'), variant: 'outline' },
    active: { label: t('ads.statusActive'), variant: 'default' },
    paused: { label: t('ads.statusPaused'), variant: 'secondary' },
    completed: { label: t('ads.statusCompleted'), variant: 'secondary' },
    cancelled: { label: t('ads.statusCancelled'), variant: 'destructive' },
  };

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

  if (isLoading) return <p className="text-center py-8 text-muted-foreground">{t('ads.loading')}</p>;

  if (orders.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p className="font-medium">{t('ads.noOrders')}</p>
        <p className="text-sm">{t('ads.noOrdersHint')}</p>
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
                    <h3 className="font-semibold">{order.campaign_name || t('ads.campaign')}</h3>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </div>
                  {order.campaign_started_at && (
                    <p className="text-sm text-muted-foreground">📅 {t('ads.from')} {format(new Date(order.campaign_started_at), 'dd.MM.yyyy', { locale: dateFnsLocale })}</p>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="flex items-center gap-1"><TrendingUp className="h-4 w-4" /> {t('ads.leads')}: {order.leads_this_month || 0}</span>
                    <span className="flex items-center gap-1"><DollarSign className="h-4 w-4" /> {t('ads.spent')}: {order.spend_this_month || 0} zł</span>
                    <span className="flex items-center gap-1"><Target className="h-4 w-4" /> {t('ads.cpl')}: ~{order.cpl_avg || 0} zł</span>
                    <span>🎯 {t('ads.goal')}: {order.campaign_goal}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {order.unread_messages_provider > 0 && (
                    <Button variant="outline" size="sm">
                      <MessageCircle className="h-4 w-4 mr-1" /> {t('ads.chat')} ({order.unread_messages_provider})
                    </Button>
                  )}
                  <Button variant="outline" size="sm">{t('ads.manage')}</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}