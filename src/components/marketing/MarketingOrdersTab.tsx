import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { FileText, Clock, Megaphone, DollarSign, Target, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'Oczekuje', color: 'bg-yellow-100 text-yellow-800' },
  active: { label: 'Aktywna', color: 'bg-green-100 text-green-800' },
  paused: { label: 'Wstrzymana', color: 'bg-gray-100 text-gray-800' },
  rejected: { label: 'Odrzucona', color: 'bg-red-100 text-red-800' },
  completed: { label: 'Zakończona', color: 'bg-blue-100 text-blue-800' },
};

const AD_TYPE_MAP: Record<string, string> = {
  standard: 'Darmowa',
  featured: 'Wyróżniona (99 zł)',
  banner: 'Baner Premium (299 zł)',
};

export function MarketingOrdersTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['marketing-orders', statusFilter, typeFilter],
    queryFn: async () => {
      let q = (supabase as any)
        .from('provider_ad_orders')
        .select(`*, service_providers!provider_id(company_name, company_phone, company_email, company_city), provider_services!service_id(name, price_from)`)
        .order('created_at', { ascending: false });
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (typeFilter !== 'all') q = q.eq('ad_type', typeFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const stats = {
    pending: orders.filter((o: any) => o.status === 'pending').length,
    active: orders.filter((o: any) => o.status === 'active').length,
    revenue: orders.filter((o: any) => o.status === 'active').reduce((s: number, o: any) => s + (Number(o.budget) || 0), 0),
    totalLeads: orders.reduce((s: number, o: any) => s + (o.leads_count || 0), 0),
  };

  const changeStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === 'active') updates.starts_at = new Date().toISOString();
      const { error } = await (supabase as any).from('provider_ad_orders').update(updates).eq('id', id);
      if (error) throw error;

      // Send notification
      if (['active', 'rejected', 'completed'].includes(status)) {
        const order = orders.find((o: any) => o.id === id);
        if (order) {
          supabase.functions.invoke('send-notification', {
            body: { type: 'ad_status_change', order_id: id, new_status: status, provider_id: order.provider_id }
          }).catch(console.error);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-orders'] });
      toast.success('Status zmieniony');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <FileText className="h-5 w-5" /> Zlecenia reklam od usługodawców
      </h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Nowe zlecenia</p><p className="text-2xl font-bold text-orange-600">{stats.pending}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Aktywne kampanie</p><p className="text-2xl font-bold text-green-600">{stats.active}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Przychód (miesięcznie)</p><p className="text-2xl font-bold text-primary">{stats.revenue} zł</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Łączne leady</p><p className="text-2xl font-bold text-blue-600">{stats.totalLeads}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie statusy</SelectItem>
            {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Typ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie typy</SelectItem>
            <SelectItem value="standard">Darmowa</SelectItem>
            <SelectItem value="featured">Wyróżniona</SelectItem>
            <SelectItem value="banner">Baner Premium</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Ładowanie...</p>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">Brak zleceń</p>
              <p className="text-sm">Zlecenia od usługodawców pojawią się tutaj</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Firma</TableHead>
                  <TableHead>Usługa</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Budżet</TableHead>
                  <TableHead>Miasto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order: any) => (
                  <>
                    <TableRow key={order.id} className="cursor-pointer" onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}>
                      <TableCell className="text-sm">{format(new Date(order.created_at), 'dd.MM.yy', { locale: pl })}</TableCell>
                      <TableCell className="font-medium">{order.service_providers?.company_name || '—'}</TableCell>
                      <TableCell className="text-sm">{order.provider_services?.name || '—'}</TableCell>
                      <TableCell className="text-sm">{AD_TYPE_MAP[order.ad_type] || order.ad_type}</TableCell>
                      <TableCell>{order.budget} zł</TableCell>
                      <TableCell className="text-sm">{order.target_city || '—'}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full ${STATUS_MAP[order.status]?.color || 'bg-gray-100'}`}>
                          {STATUS_MAP[order.status]?.label || order.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <Select value={order.status} onValueChange={v => changeStatusMut.mutate({ id: order.id, status: v })}>
                            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {expandedId === order.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedId === order.id && (
                      <TableRow key={`${order.id}-detail`}>
                        <TableCell colSpan={8}>
                          <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div><span className="text-muted-foreground">Telefon:</span> {order.service_providers?.company_phone || '—'}</div>
                              <div><span className="text-muted-foreground">Email:</span> {order.service_providers?.company_email || '—'}</div>
                              <div><span className="text-muted-foreground">Miasto:</span> {order.service_providers?.company_city || '—'}</div>
                              <div><span className="text-muted-foreground">Czas trwania:</span> {order.duration_days} dni</div>
                            </div>
                            {order.ad_title && <div><span className="text-sm text-muted-foreground">Tytuł:</span> <span className="text-sm font-medium">{order.ad_title}</span></div>}
                            {order.ad_description && <div><span className="text-sm text-muted-foreground">Opis:</span> <p className="text-sm">{order.ad_description}</p></div>}
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>Wyświetlenia: <strong>{order.impressions}</strong></div>
                              <div>Kliknięcia: <strong>{order.clicks}</strong></div>
                              <div>Leady: <strong>{order.leads_count}</strong></div>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">Notatki admina:</p>
                              <Textarea
                                value={adminNotes[order.id] ?? (order.ad_description || '')}
                                onChange={e => setAdminNotes(prev => ({ ...prev, [order.id]: e.target.value }))}
                                rows={2}
                                placeholder="Notatki wewnętrzne..."
                              />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
