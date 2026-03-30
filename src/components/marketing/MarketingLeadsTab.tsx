import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Flame, Thermometer, Snowflake, Plus, Search, Loader2, Phone, Mail, Building2, Clock, Target, TrendingUp } from 'lucide-react';

const PRIORITY_CONFIG = {
  hot: { icon: Flame, label: '🔥 Gorący', color: 'bg-red-100 text-red-800 border-red-300' },
  warm: { icon: Thermometer, label: '🌤 Ciepły', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  cold: { icon: Snowflake, label: '❄️ Zimny', color: 'bg-blue-100 text-blue-800 border-blue-300' },
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Nowy', contacted: 'Skontaktowany', qualified: 'Kwalifikowany', converted: 'Konwersja', lost: 'Utracony'
};

export function MarketingLeadsTab() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', city: '', company: '', message: '', campaign_id: '' });

  useEffect(() => { loadLeads(); }, []);

  const loadLeads = async () => {
    const { data } = await (supabase as any).from('marketing_leads').select('*, agency_campaigns(name, platform)').order('ai_score', { ascending: false });
    setLeads(data || []);
    setLoading(false);
  };

  const updateStatus = async (id: string, status: string) => {
    const updates: any = { status };
    if (status === 'contacted') updates.contacted_at = new Date().toISOString();
    if (status === 'converted') { updates.converted_at = new Date().toISOString(); updates.converted = true; }
    await (supabase as any).from('marketing_leads').update(updates).eq('id', id);
    toast.success(`Status zmieniony na: ${STATUS_LABELS[status]}`);
    loadLeads();
  };

  const addLead = async () => {
    if (!form.name.trim()) return toast.error('Podaj imię');
    setScoring(true);
    try {
      const { error } = await supabase.functions.invoke('score-lead', { body: form });
      if (error) throw error;
      toast.success('Lead dodany i oceniony przez AI');
      setAddOpen(false);
      setForm({ name: '', email: '', phone: '', city: '', company: '', message: '', campaign_id: '' });
      loadLeads();
    } catch { toast.error('Błąd dodawania leadu'); }
    setScoring(false);
  };

  const filtered = leads.filter(l => {
    if (priorityFilter !== 'all' && l.ai_priority !== priorityFilter) return false;
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return l.name?.toLowerCase().includes(s) || l.email?.toLowerCase().includes(s) || l.company?.toLowerCase().includes(s);
    }
    return true;
  });

  const stats = {
    total: leads.length,
    hot: leads.filter(l => l.ai_priority === 'hot').length,
    warm: leads.filter(l => l.ai_priority === 'warm').length,
    converted: leads.filter(l => l.converted).length,
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold flex items-center gap-2"><Target className="h-6 w-6 text-primary" /> Leady AI</h2>
        <Button onClick={() => setAddOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Dodaj lead</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">Łącznie</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-red-600">{stats.hot}</p><p className="text-xs text-muted-foreground">🔥 Gorące</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-yellow-600">{stats.warm}</p><p className="text-xs text-muted-foreground">🌤 Ciepłe</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-green-600">{stats.converted}</p><p className="text-xs text-muted-foreground">✅ Konwersje</p></CardContent></Card>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj..." className="pl-9" />
        </div>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priorytet" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie</SelectItem>
            <SelectItem value="hot">🔥 Gorące</SelectItem>
            <SelectItem value="warm">🌤 Ciepłe</SelectItem>
            <SelectItem value="cold">❄️ Zimne</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.map(lead => {
          const prio = PRIORITY_CONFIG[lead.ai_priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.cold;
          return (
            <Card key={lead.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge className={prio.color}>{prio.label}</Badge>
                      <div className="flex items-center gap-1">
                        <div className="h-2 rounded-full bg-muted w-24 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${lead.ai_score}%`, backgroundColor: lead.ai_score >= 70 ? '#ef4444' : lead.ai_score >= 40 ? '#f59e0b' : '#6b7280' }} />
                        </div>
                        <span className="text-xs font-bold">{lead.ai_score}/100</span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[lead.status] || lead.status}</Badge>
                    </div>
                    <h3 className="font-medium">{lead.name} {lead.company && <span className="text-muted-foreground">— {lead.company}</span>}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>}
                      {lead.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</span>}
                      {lead.city && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{lead.city}</span>}
                      {lead.agency_campaigns?.name && <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />{lead.agency_campaigns.name}</span>}
                    </div>
                    {lead.ai_recommendation && (
                      <p className="text-xs mt-2 p-2 bg-primary/5 rounded-lg border border-primary/10">💡 {lead.ai_recommendation}</p>
                    )}
                    {lead.follow_up_timing && (
                      <span className="inline-flex items-center gap-1 text-[10px] mt-1 text-muted-foreground"><Clock className="h-3 w-3" /> Follow-up: {lead.follow_up_timing}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {lead.status === 'new' && <Button size="sm" variant="outline" onClick={() => updateStatus(lead.id, 'contacted')} className="text-xs">📞 Skontaktowany</Button>}
                    {(lead.status === 'new' || lead.status === 'contacted') && <Button size="sm" variant="outline" onClick={() => updateStatus(lead.id, 'qualified')} className="text-xs">✅ Kwalifikowany</Button>}
                    {lead.status !== 'converted' && lead.status !== 'lost' && (
                      <>
                        <Button size="sm" className="text-xs bg-green-600 hover:bg-green-700" onClick={() => updateStatus(lead.id, 'converted')}>💰 Konwersja</Button>
                        <Button size="sm" variant="ghost" className="text-xs text-red-500" onClick={() => updateStatus(lead.id, 'lost')}>Utracony</Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Brak leadów. Dodaj ręcznie lub podłącz webhook z Meta Lead Ads.</p>}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dodaj lead (AI oceni automatycznie)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Imię i nazwisko *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
              <div><Label>Telefon</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Firma</Label><Input value={form.company} onChange={e => setForm({...form, company: e.target.value})} /></div>
              <div><Label>Miasto</Label><Input value={form.city} onChange={e => setForm({...form, city: e.target.value})} /></div>
            </div>
            <div><Label>Wiadomość</Label><Textarea value={form.message} onChange={e => setForm({...form, message: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Anuluj</Button>
            <Button onClick={addLead} disabled={scoring} className="gap-2">
              {scoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
              {scoring ? 'AI ocenia...' : 'Dodaj i oceń AI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
