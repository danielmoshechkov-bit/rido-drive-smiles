import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Target, TrendingUp, MessageCircle, User, DollarSign, MapPin, Users, CheckCircle } from 'lucide-react';

export default function SpecialistDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('orders');
  const [ordersSubTab, setOrdersSubTab] = useState('new');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate('/auth');
      else setUser(data.user);
    });
  }, []);

  // New orders (unassigned)
  const { data: newOrders = [] } = useQuery({
    queryKey: ['specialist-new-orders'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ad_orders')
        .select('*')
        .is('specialist_user_id', null)
        .eq('status', 'new')
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  // My orders
  const { data: myOrders = [] } = useQuery({
    queryKey: ['specialist-my-orders', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('ad_orders')
        .select('*')
        .eq('specialist_user_id', user.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const acceptMut = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.from('ad_orders').update({
        specialist_user_id: user.id,
        status: 'accepted',
      }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialist-new-orders'] });
      queryClient.invalidateQueries({ queryKey: ['specialist-my-orders'] });
      toast.success('Zlecenie przyjęte!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const GOAL_LABELS: Record<string, string> = {
    leads: '🎯 Leady', calls: '📞 Telefony', messages: '💬 Wiadomości', awareness: '👁️ Zasięg',
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center gap-4">
          <h1 className="font-bold text-lg">📣 Panel Specjalisty Marketingu</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="orders">
              Zlecenia {newOrders.length > 0 && <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">{newOrders.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="campaigns">Aktywne kampanie</TabsTrigger>
            <TabsTrigger value="messages">Wiadomości</TabsTrigger>
            <TabsTrigger value="account">Moje konto</TabsTrigger>
          </TabsList>

          {/* Orders Tab */}
          <TabsContent value="orders" className="mt-6 space-y-6">
            <Tabs value={ordersSubTab} onValueChange={setOrdersSubTab}>
              <TabsList>
                <TabsTrigger value="new">
                  Nowe zlecenia {newOrders.length > 0 && <Badge variant="destructive" className="ml-1">{newOrders.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="mine">Moje zlecenia</TabsTrigger>
                <TabsTrigger value="history">Historia</TabsTrigger>
              </TabsList>

              <TabsContent value="new" className="mt-4 space-y-4">
                {newOrders.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p className="font-medium">Brak nowych zleceń</p>
                  </div>
                ) : (
                  newOrders.map((order: any) => (
                    <Card key={order.id}>
                      <CardContent className="pt-6 space-y-3">
                        <h3 className="font-semibold text-lg">{order.campaign_name || 'Kampania reklamowa'}</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <span className="flex items-center gap-1"><DollarSign className="h-4 w-4" /> Budżet: {order.budget_monthly} zł/mies.</span>
                          <span className="flex items-center gap-1"><Target className="h-4 w-4" /> Cel: {GOAL_LABELS[order.campaign_goal] || order.campaign_goal}</span>
                          <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {order.target_location || '—'}</span>
                          {order.target_audience && <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {order.target_audience}</span>}
                        </div>
                        {order.additional_notes && (
                          <p className="text-sm text-muted-foreground italic">"{order.additional_notes}"</p>
                        )}
                        <div className="flex gap-2">
                          <Button onClick={() => acceptMut.mutate(order.id)} disabled={acceptMut.isPending}>
                            <CheckCircle className="h-4 w-4 mr-1" /> Przyjmij zlecenie
                          </Button>
                          <Button variant="outline">Szczegóły</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="mine" className="mt-4 space-y-4">
                {myOrders.length === 0 ? (
                  <p className="text-center py-12 text-muted-foreground">Brak przypisanych zleceń</p>
                ) : (
                  myOrders.map((order: any) => (
                    <Card key={order.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <h3 className="font-semibold">{order.campaign_name || 'Kampania'}</h3>
                            <Badge variant={order.status === 'active' ? 'default' : 'secondary'}>{order.status}</Badge>
                            <div className="flex gap-4 text-sm mt-2">
                              <span>Leady: {order.leads_this_month || 0}</span>
                              <span>Budżet: {order.budget_monthly} zł</span>
                              <span>CpL: {order.cpl_avg || 0} zł</span>
                            </div>
                          </div>
                          <Button variant="outline" size="sm">Zarządzaj</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                <p className="text-center py-12 text-muted-foreground">Historia zleceń pojawi się tutaj</p>
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Active Campaigns */}
          <TabsContent value="campaigns" className="mt-6">
            <p className="text-center py-12 text-muted-foreground">Aktywne kampanie pojawią się tutaj po uruchomieniu</p>
          </TabsContent>

          {/* Messages */}
          <TabsContent value="messages" className="mt-6">
            <p className="text-center py-12 text-muted-foreground">Wiadomości od klientów pojawią się tutaj</p>
          </TabsContent>

          {/* Account */}
          <TabsContent value="account" className="mt-6">
            <Card>
              <CardHeader><CardTitle>Moje konto specjalisty</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Profil specjalisty — edycja danych, portfolio, specjalizacje.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
