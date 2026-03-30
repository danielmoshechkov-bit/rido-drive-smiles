import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Brain, RefreshCw, Loader2, BookOpen, TrendingUp, Globe, Zap, AlertTriangle, Star, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const CATEGORY_LABELS: Record<string, string> = {
  algorithm_change: 'Zmiana algorytmu',
  new_feature: 'Nowa funkcja',
  policy_change: 'Zmiana polityki',
  best_practice: 'Best Practice',
  benchmark: 'Benchmark',
  creative_trend: 'Trend kreatywny',
  audience_insight: 'Insight odbiorców',
  cost_trend: 'Trend kosztowy',
};

const CATEGORY_COLORS: Record<string, string> = {
  algorithm_change: 'bg-red-100 text-red-800',
  new_feature: 'bg-green-100 text-green-800',
  policy_change: 'bg-orange-100 text-orange-800',
  best_practice: 'bg-blue-100 text-blue-800',
  benchmark: 'bg-purple-100 text-purple-800',
  creative_trend: 'bg-pink-100 text-pink-800',
  audience_insight: 'bg-cyan-100 text-cyan-800',
  cost_trend: 'bg-yellow-100 text-yellow-800',
};

const PLATFORM_BADGE: Record<string, { label: string; className: string }> = {
  meta: { label: 'Meta', className: 'bg-primary/10 text-primary' },
  google: { label: 'Google', className: 'bg-blue-100 text-blue-700' },
  both: { label: 'Oba', className: 'bg-muted text-muted-foreground' },
  industry: { label: 'Branża', className: 'bg-green-100 text-green-700' },
};

export function MarketingKnowledgeTab() {
  const [items, setItems] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [{ data: k }, { data: r }] = await Promise.all([
      (supabase as any).from('platform_knowledge').select('*').eq('is_active', true).order('relevance_score', { ascending: false }),
      (supabase as any).from('knowledge_bot_runs').select('*').order('started_at', { ascending: false }).limit(10)
    ]);
    setItems(k || []);
    setRuns(r || []);
    setLoading(false);
  };

  const runUpdate = async () => {
    setUpdating(true);
    try {
      const { error } = await supabase.functions.invoke('knowledge-update-bot');
      if (error) throw error;
      toast.success('Aktualizacja zakończona');
      loadData();
    } catch { toast.error('Błąd aktualizacji'); }
    setUpdating(false);
  };

  const filtered = items.filter(i => {
    if (platformFilter !== 'all' && i.platform !== platformFilter) return false;
    if (categoryFilter !== 'all' && i.category !== categoryFilter) return false;
    return true;
  });

  const lastRun = runs[0];
  const recentCount = items.filter(i => new Date(i.discovered_at) > new Date(Date.now() - 7 * 86400000)).length;
  const metaCount = items.filter(i => i.platform === 'meta').length;
  const googleCount = items.filter(i => i.platform === 'google').length;

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><Brain className="h-6 w-6 text-primary" /> Baza Wiedzy AI</h2>
          {lastRun && <p className="text-xs text-muted-foreground mt-1">Ostatnia aktualizacja: {new Date(lastRun.started_at).toLocaleString('pl-PL')} — {lastRun.status === 'completed' ? '✅' : '❌'}</p>}
        </div>
        <Button onClick={runUpdate} disabled={updating} className="gap-2">
          {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Aktualizuj teraz
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold">{items.length}</p>
          <p className="text-xs text-muted-foreground">Łącznie wpisów</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-green-600">{recentCount}</p>
          <p className="text-xs text-muted-foreground">Nowe (7 dni)</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-primary">{metaCount}</p>
          <p className="text-xs text-muted-foreground">Meta</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{googleCount}</p>
          <p className="text-xs text-muted-foreground">Google</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Platforma" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie</SelectItem>
            <SelectItem value="meta">Meta</SelectItem>
            <SelectItem value="google">Google</SelectItem>
            <SelectItem value="both">Oba</SelectItem>
            <SelectItem value="industry">Branżowe</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Kategoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Items */}
      <div className="space-y-3">
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Brak wpisów. Kliknij "Aktualizuj teraz" aby pobrać wiedzę.</p>}
        {filtered.map(item => (
          <Card key={item.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="outline" className={PLATFORM_BADGE[item.platform]?.className}>{PLATFORM_BADGE[item.platform]?.label}</Badge>
                    <Badge variant="outline" className={CATEGORY_COLORS[item.category]}>{CATEGORY_LABELS[item.category]}</Badge>
                    <div className="flex items-center gap-0.5 ml-auto">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <Star key={i} className={`h-3 w-3 ${i < item.relevance_score ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground/20'}`} />
                      ))}
                    </div>
                  </div>
                  <h3 className="font-medium text-sm">{item.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{item.summary}</p>
                  {item.full_content && (
                    <Collapsible open={expandedId === item.id} onOpenChange={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                      <CollapsibleTrigger className="text-xs text-primary mt-1 flex items-center gap-1">
                        {expandedId === item.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {expandedId === item.id ? 'Zwiń' : 'Zobacz więcej'}
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <p className="text-xs mt-2 p-2 bg-muted rounded">{item.full_content}</p>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                    {item.source_name && <span>📰 {item.source_name}</span>}
                    {item.published_at && <span>📅 {item.published_at}</span>}
                    {item.tags?.length > 0 && item.tags.map((t: string) => <Badge key={t} variant="outline" className="text-[10px] px-1 py-0">{t}</Badge>)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bot runs history */}
      {runs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Historia uruchomień bota</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {runs.map(r => (
                <div key={r.id} className="flex items-center justify-between text-xs border-b pb-2">
                  <span>{new Date(r.started_at).toLocaleString('pl-PL')}</span>
                  <Badge variant={r.status === 'completed' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'}>
                    {r.status === 'completed' ? '✅ OK' : r.status === 'failed' ? '❌ Błąd' : '⏳ W toku'}
                  </Badge>
                  <span>Znaleziono: {r.items_found}</span>
                  <span>Dodano: {r.items_added}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
