import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Sparkles, RefreshCw, Loader2, Check, X, Pause, Play, BarChart3, TrendingUp, Eye } from 'lucide-react';

export function MarketingCreativesTab() {
  const [variants, setVariants] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [{ data: v }, { data: c }] = await Promise.all([
      (supabase as any).from('ad_variants').select('*, agency_campaigns(name, platform)').order('created_at', { ascending: false }),
      (supabase as any).from('agency_campaigns').select('id, name').eq('status', 'active')
    ]);
    setVariants(v || []);
    setCampaigns(c || []);
    setLoading(false);
  };

  const runRotation = async () => {
    setRotating(true);
    try {
      const { error } = await supabase.functions.invoke('rotate-creatives');
      if (error) throw error;
      toast.success('Rotacja zakończona');
      loadData();
    } catch { toast.error('Błąd rotacji'); }
    setRotating(false);
  };

  const updateVariant = async (id: string, updates: any) => {
    await (supabase as any).from('ad_variants').update(updates).eq('id', id);
    toast.success('Zapisano');
    loadData();
  };

  const filtered = variants.filter(v => {
    if (campaignFilter !== 'all' && v.campaign_id !== campaignFilter) return false;
    if (statusFilter !== 'all' && v.status !== statusFilter) return false;
    return true;
  });

  const pending = variants.filter(v => v.status === 'pending_approval');
  const active = variants.filter(v => v.status === 'active');

  const STATUS_STYLE: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    pending_approval: 'bg-orange-100 text-orange-800',
    rejected: 'bg-red-100 text-red-800',
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><Sparkles className="h-6 w-6 text-primary" /> Kreacje & Rotacja AI</h2>
          <p className="text-xs text-muted-foreground">{active.length} aktywnych • {pending.length} do zatwierdzenia</p>
        </div>
        <Button onClick={runRotation} disabled={rotating} className="gap-2">
          {rotating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Uruchom rotację
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{variants.length}</p><p className="text-xs text-muted-foreground">Łącznie wariantów</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-green-600">{active.length}</p><p className="text-xs text-muted-foreground">Aktywne</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-orange-600">{pending.length}</p><p className="text-xs text-muted-foreground">Do zatwierdzenia</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-primary">{variants.filter(v => v.generated_by === 'ai_rotation').length}</p><p className="text-xs text-muted-foreground">AI generowane</p></CardContent></Card>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Kampania" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie kampanie</SelectItem>
            {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie</SelectItem>
            <SelectItem value="active">Aktywne</SelectItem>
            <SelectItem value="paused">Wstrzymane</SelectItem>
            <SelectItem value="pending_approval">Do zatwierdzenia</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Pending approval section */}
      {pending.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader><CardTitle className="text-sm text-orange-700">⏳ Kreacje do zatwierdzenia ({pending.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {pending.map(v => (
              <div key={v.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">{v.agency_campaigns?.name}</span>
                  {v.generated_by === 'ai_rotation' && <Badge className="bg-primary/10 text-primary text-[10px]">🤖 AI</Badge>}
                </div>
                <div className="space-y-1 mb-2">
                  <p className="text-sm font-medium">{v.headline}</p>
                  <p className="text-xs text-muted-foreground">{v.body_text}</p>
                  {v.generation_rationale && <p className="text-[10px] italic text-primary">💡 {v.generation_rationale}</p>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => updateVariant(v.id, { status: 'active' })} className="gap-1"><Check className="h-3 w-3" /> Zatwierdź</Button>
                  <Button size="sm" variant="destructive" onClick={() => updateVariant(v.id, { status: 'rejected' })} className="gap-1"><X className="h-3 w-3" /> Odrzuć</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* All variants */}
      <div className="space-y-3">
        {filtered.map(v => (
          <Card key={v.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge className={STATUS_STYLE[v.status] || 'bg-muted'}>{v.status === 'active' ? '✅ Aktywny' : v.status === 'paused' ? '⏸ Wstrzymany' : v.status}</Badge>
                    {v.agency_campaigns?.name && <Badge variant="outline" className="text-[10px]">{v.agency_campaigns.name}</Badge>}
                    {v.generated_by === 'ai_rotation' && <Badge className="bg-primary/10 text-primary text-[10px]">🤖 AI</Badge>}
                    {v.cta && <Badge variant="outline" className="text-[10px]">{v.cta}</Badge>}
                  </div>
                  <p className="font-medium text-sm">{v.headline || 'Brak nagłówka'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{v.body_text || 'Brak tekstu'}</p>
                  {v.description && <p className="text-[10px] text-muted-foreground">{v.description}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs">
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {v.impressions || 0} wyświetl.</span>
                    <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" /> CTR: {v.ctr || 0}%</span>
                    <span className="flex items-center gap-1">Kliknięć: {v.clicks || 0}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Rotacja</Label>
                      <Switch checked={v.rotation_enabled} onCheckedChange={val => updateVariant(v.id, { rotation_enabled: val })} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Auto-zatw.</Label>
                      <Switch checked={v.auto_approve_rotation} onCheckedChange={val => updateVariant(v.id, { auto_approve_rotation: val })} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {v.status === 'active' && <Button size="sm" variant="outline" onClick={() => updateVariant(v.id, { status: 'paused' })} className="gap-1 text-xs"><Pause className="h-3 w-3" /> Wstrzymaj</Button>}
                  {v.status === 'paused' && <Button size="sm" variant="outline" onClick={() => updateVariant(v.id, { status: 'active' })} className="gap-1 text-xs"><Play className="h-3 w-3" /> Aktywuj</Button>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Brak kreacji. Dodaj warianty do kampanii lub uruchom rotację AI.</p>}
      </div>
    </div>
  );
}
