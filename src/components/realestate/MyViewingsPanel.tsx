import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Calendar, CheckCircle, Clock, XCircle, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const STATUS_MAP: Record<string, { labelKey: string; color: string }> = {
  pending: { labelKey: 'cp.viewings.pending', color: 'bg-yellow-500' },
  contacting_agents: { labelKey: 'cp.viewings.contactingAgents', color: 'bg-blue-500' },
  partial: { labelKey: 'cp.viewings.partial', color: 'bg-orange-500' },
  confirmed: { labelKey: 'cp.viewings.confirmed', color: 'bg-green-500' },
  completed: { labelKey: 'cp.viewings.completed', color: 'bg-muted-foreground' },
  cancelled: { labelKey: 'cp.viewings.cancelled', color: 'bg-destructive' },
};

export function MyViewingsPanel() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<any[]>([]);
  const [slots, setSlots] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('viewing_requests' as any)
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false });

    setRequests((data as any[]) || []);

    // Fetch slots for each request
    if (data && data.length > 0) {
      const requestIds = (data as any[]).map((r: any) => r.id);
      const { data: slotsData } = await supabase
        .from('viewing_slots' as any)
        .select('*')
        .in('request_id', requestIds);

      const grouped: Record<string, any[]> = {};
      (slotsData as any[] || []).forEach((s: any) => {
        if (!grouped[s.request_id]) grouped[s.request_id] = [];
        grouped[s.request_id].push(s);
      });
      setSlots(grouped);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="font-semibold mb-1">{t('cp.viewings.noViewings')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('cp.viewings.noViewingsDesc')}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Eye className="h-5 w-5 text-primary" />
        {t('cp.viewings.title')}
      </h2>

      {requests.map((req) => {
        const status = STATUS_MAP[req.status] || STATUS_MAP.pending;
        const requestSlots = slots[req.id] || [];

        return (
          <Card key={req.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {t('cp.viewings.planTitle', { count: (req.listing_ids as string[])?.length || 0 })}
                </CardTitle>
                <Badge className={status.color}>{t(status.labelKey)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('cp.viewings.createdAt')}: {new Date(req.created_at).toLocaleDateString('pl-PL')}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {requestSlots.map((slot) => (
                <div key={slot.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm">
                  {slot.status === 'confirmed' ? (
                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : slot.status === 'declined' ? (
                    <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                  )}
                  <span className="flex-1">
                    {slot.status === 'confirmed' ? t('cp.viewings.confirmed') :
                     slot.status === 'declined' ? t('cp.viewings.declined') : t('cp.viewings.waitingAgent')}
                  </span>
                </div>
              ))}

              {requestSlots.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('cp.viewings.contactingProgress')}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
