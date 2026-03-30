import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, Pause, Play, Loader2, Plus, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function MarketingCampaignsTab() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    const { data } = await supabase.from('agency_campaigns').select('*, agency_clients(company_name)').order('created_at', { ascending: false });
    setCampaigns(data || []);
    setLoading(false);
  };

  const toggleCampaign = async (id: string, current: string) => {
    const newStatus = current === 'active' ? 'paused' : 'active';
    await supabase.from('agency_campaigns').update({ status: newStatus }).eq('id', id);
    toast.success(`Kampania ${newStatus === 'active' ? 'aktywowana' : 'wstrzymana'}`);
    loadCampaigns();
  };

  const filtered = campaigns.filter(c => {
    if (platformFilter !== 'all' && c.platform !== platformFilter) return false;
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Kampanie & Reklamy</h2>
        <div className="flex items-center gap-2">
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Platforma" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie</SelectItem>
              <SelectItem value="meta">Meta</SelectItem>
              <SelectItem value="google">Google</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie</SelectItem>
              <SelectItem value="active">Aktywna</SelectItem>
              <SelectItem value="paused">Wstrzymana</SelectItem>
              <SelectItem value="ended">Zakończona</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Brak kampanii</p>
              <p className="text-xs mt-1">Podłącz konto reklamowe i zsynchronizuj kampanie</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Platforma</TableHead>
                  <TableHead>Klient</TableHead>
                  <TableHead className="text-right">Budżet</TableHead>
                  <TableHead className="text-right">Wydano dziś</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.platform === 'meta' ? 'Meta' : 'Google'}</Badge>
                    </TableCell>
                    <TableCell>{c.agency_clients?.company_name || 'GetRido'}</TableCell>
                    <TableCell className="text-right">{c.daily_budget?.toLocaleString('pl-PL')} zł</TableCell>
                    <TableCell className="text-right">{c.spend_today?.toLocaleString('pl-PL')} zł</TableCell>
                    <TableCell className="text-right font-semibold">{c.roas_current?.toFixed(2) || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'active' ? 'default' : c.status === 'paused' ? 'secondary' : 'outline'}>
                        {c.status === 'active' ? 'Aktywna' : c.status === 'paused' ? 'Wstrzymana' : 'Zakończona'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleCampaign(c.id, c.status)}>
                        {c.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}