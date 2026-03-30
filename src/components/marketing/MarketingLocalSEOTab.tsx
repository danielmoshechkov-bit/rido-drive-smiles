import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { MapPin, RefreshCw, Loader2, Check, X, Eye, Clock, Globe, FileText } from 'lucide-react';

export function MarketingLocalSEOTab() {
  const [clients, setClients] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [{ data: c }, { data: p }] = await Promise.all([
      (supabase as any).from('agency_clients').select('id, company_name, city, industry, local_seo_enabled, auto_approve_seo, google_business_id').order('company_name'),
      (supabase as any).from('local_seo_posts').select('*, agency_clients(company_name)').order('created_at', { ascending: false }).limit(50)
    ]);
    setClients(c || []);
    setPosts(p || []);
    setLoading(false);
  };

  const toggleSEO = async (clientId: string, field: string, value: boolean) => {
    await (supabase as any).from('agency_clients').update({ [field]: value }).eq('id', clientId);
    toast.success('Zapisano');
    loadData();
  };

  const runAutopilot = async () => {
    setGenerating(true);
    try {
      const { error } = await supabase.functions.invoke('local-seo-autopilot');
      if (error) throw error;
      toast.success('Posty SEO wygenerowane');
      loadData();
    } catch { toast.error('Błąd generowania'); }
    setGenerating(false);
  };

  const updatePostStatus = async (id: string, status: string) => {
    await (supabase as any).from('local_seo_posts').update({
      status,
      ...(status === 'published' ? { published_at: new Date().toISOString() } : {})
    }).eq('id', id);
    toast.success(`Post ${status === 'scheduled' ? 'zatwierdzony' : status === 'rejected' ? 'odrzucony' : 'opublikowany'}`);
    loadData();
  };

  const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending_approval: { label: '⏳ Oczekuje', variant: 'secondary' },
    scheduled: { label: '📅 Zaplanowany', variant: 'outline' },
    published: { label: '✅ Opublikowany', variant: 'default' },
    rejected: { label: '❌ Odrzucony', variant: 'destructive' },
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const enabledClients = clients.filter(c => c.local_seo_enabled);
  const pendingPosts = posts.filter(p => p.status === 'pending_approval');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><MapPin className="h-6 w-6 text-primary" /> Local SEO Autopilot</h2>
          <p className="text-xs text-muted-foreground">{enabledClients.length} klientów z aktywnym SEO • {pendingPosts.length} postów do zatwierdzenia</p>
        </div>
        <Button onClick={runAutopilot} disabled={generating} className="gap-2">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Generuj posty teraz
        </Button>
      </div>

      {/* Klienci - ustawienia SEO */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Globe className="h-4 w-4" /> Klienci — ustawienia Local SEO</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {clients.map(client => (
              <div key={client.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                <div>
                  <p className="font-medium text-sm">{client.company_name}</p>
                  <p className="text-xs text-muted-foreground">{client.city || 'Brak miasta'} • {client.industry || 'Brak branży'}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">SEO</Label>
                    <Switch checked={client.local_seo_enabled} onCheckedChange={v => toggleSEO(client.id, 'local_seo_enabled', v)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Auto</Label>
                    <Switch checked={client.auto_approve_seo} onCheckedChange={v => toggleSEO(client.id, 'auto_approve_seo', v)} disabled={!client.local_seo_enabled} />
                  </div>
                </div>
              </div>
            ))}
            {clients.length === 0 && <p className="text-center text-muted-foreground text-sm">Brak klientów. Dodaj klientów w zakładce Klienci.</p>}
          </div>
        </CardContent>
      </Card>

      {/* Posty do zatwierdzenia */}
      {pendingPosts.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader><CardTitle className="text-sm text-orange-700">⏳ Posty oczekujące na zatwierdzenie ({pendingPosts.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {pendingPosts.map(post => (
              <div key={post.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">{post.agency_clients?.company_name}</span>
                  <Badge variant="outline" className="text-[10px]">{post.platform}</Badge>
                </div>
                <p className="text-sm mb-2">{post.post_text}</p>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => updatePostStatus(post.id, 'scheduled')} className="gap-1"><Check className="h-3 w-3" /> Zatwierdź</Button>
                  <Button size="sm" variant="destructive" onClick={() => updatePostStatus(post.id, 'rejected')} className="gap-1"><X className="h-3 w-3" /> Odrzuć</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Wszystkie posty */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Wszystkie posty SEO</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {posts.map(post => {
              const sb = STATUS_BADGE[post.status] || STATUS_BADGE.pending_approval;
              return (
                <div key={post.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium">{post.agency_clients?.company_name}</span>
                      <Badge variant={sb.variant} className="text-[10px]">{sb.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{post.post_text}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground ml-2 whitespace-nowrap">
                    {new Date(post.created_at).toLocaleDateString('pl-PL')}
                  </span>
                </div>
              );
            })}
            {posts.length === 0 && <p className="text-center text-muted-foreground text-sm py-4">Brak postów. Włącz SEO dla klientów i kliknij "Generuj".</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
