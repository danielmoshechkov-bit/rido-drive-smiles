import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Plus, Users, Building2, Mail, Loader2, Search, Phone, MapPin, Globe, ChevronDown, Instagram, BarChart3, Target, FileText, Eye, X, Send } from 'lucide-react';

interface Client {
  id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  nip: string | null;
  website: string | null;
  notes: string | null;
  status: string | null;
  monthly_budget: number | null;
  total_leads: number | null;
  total_spent: number | null;
  meta_ad_account_id: string | null;
  meta_access_token: string | null;
  google_ad_account_id: string | null;
  google_refresh_token: string | null;
  instagram_account_id: string | null;
  instagram_access_token: string | null;
  portal_user_id: string | null;
  assigned_to: string | null;
  created_at: string;
}

const emptyForm = {
  company_name: '', first_name: '', last_name: '', contact_email: '', contact_name: '',
  phone: '', city: '', address: '', nip: '', website: '', notes: '',
  meta_ad_account_id: '', meta_access_token: '', google_ad_account_id: '', google_refresh_token: '',
  instagram_account_id: '', instagram_access_token: '', assigned_to: '', monthly_budget: 0,
};

export function MarketingClientsTab() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [portalMatch, setPortalMatch] = useState<string | null>(null);
  const [apiSectionOpen, setApiSectionOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [clientLeads, setClientLeads] = useState<any[]>([]);
  const [clientReports, setClientReports] = useState<any[]>([]);
  const [portalOrders, setPortalOrders] = useState<any[]>([]);
  const [detailTab, setDetailTab] = useState('profile');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportForm, setReportForm] = useState({ title: '', period_from: '', period_to: '', summary: '' });
  const [generatingReport, setGeneratingReport] = useState(false);

  useEffect(() => { loadClients(); }, []);

  const loadClients = async () => {
    const { data } = await (supabase as any).from('agency_clients').select('*').order('created_at', { ascending: false });
    setClients(data || []);
    setLoading(false);
  };

  const checkPortalUser = async (email: string) => {
    if (!email || !email.includes('@')) { setPortalMatch(null); return; }
    const { data } = await supabase.rpc('admin_find_user_by_email', { p_email: email });
    if (data && (data as any[]).length > 0) {
      setPortalMatch((data as any[])[0].id);
    } else {
      setPortalMatch(null);
    }
  };

  const saveClient = async () => {
    if (!form.company_name.trim()) { toast.error('Podaj nazwę firmy'); return; }
    setSaving(true);
    const payload: any = {
      company_name: form.company_name, first_name: form.first_name || null,
      last_name: form.last_name || null, contact_email: form.contact_email || null,
      contact_name: form.contact_name || null, phone: form.phone || null,
      city: form.city || null, address: form.address || null, nip: form.nip || null,
      website: form.website || null, notes: form.notes || null,
      monthly_budget: form.monthly_budget || 0,
      meta_ad_account_id: form.meta_ad_account_id || null,
      meta_access_token: form.meta_access_token || null,
      google_ad_account_id: form.google_ad_account_id || null,
      google_refresh_token: form.google_refresh_token || null,
      instagram_account_id: form.instagram_account_id || null,
      instagram_access_token: form.instagram_access_token || null,
      assigned_to: form.assigned_to || null,
      portal_user_id: portalMatch || null,
    };
    if (editingClient) {
      await (supabase as any).from('agency_clients').update(payload).eq('id', editingClient.id);
      toast.success('Klient zaktualizowany');
    } else {
      await (supabase as any).from('agency_clients').insert(payload);
      toast.success('Klient dodany');
    }
    setShowAdd(false);
    setEditingClient(null);
    setForm(emptyForm);
    setPortalMatch(null);
    setSaving(false);
    loadClients();
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setForm({
      company_name: client.company_name || '', first_name: client.first_name || '',
      last_name: client.last_name || '', contact_email: client.contact_email || '',
      contact_name: client.contact_name || '', phone: client.phone || '',
      city: client.city || '', address: client.address || '', nip: client.nip || '',
      website: client.website || '', notes: client.notes || '',
      monthly_budget: client.monthly_budget || 0,
      meta_ad_account_id: client.meta_ad_account_id || '',
      meta_access_token: client.meta_access_token || '',
      google_ad_account_id: client.google_ad_account_id || '',
      google_refresh_token: client.google_refresh_token || '',
      instagram_account_id: client.instagram_account_id || '',
      instagram_access_token: client.instagram_access_token || '',
      assigned_to: client.assigned_to || '',
    });
    setPortalMatch(client.portal_user_id || null);
    setShowAdd(true);
  };

  const openDetails = async (client: Client) => {
    setSelectedClient(client);
    setDetailTab('profile');
    // Load campaigns
    const { data: camps } = await (supabase as any).from('agency_campaigns')
      .select('*').eq('client_id', client.id).order('created_at', { ascending: false });
    setCampaigns(camps || []);
    // Load reports
    const { data: reps } = await (supabase as any).from('client_reports')
      .select('*').eq('client_id', client.id).order('created_at', { ascending: false });
    setClientReports(reps || []);
    // Load portal orders if linked
    if (client.portal_user_id) {
      const { data: orders } = await (supabase as any).from('provider_ad_orders')
        .select('*, provider_services(name)')
        .order('created_at', { ascending: false });
      setPortalOrders(orders || []);
    }
  };

  const generateAIReport = async () => {
    if (!selectedClient) return;
    setGeneratingReport(true);
    try {
      const { data } = await supabase.functions.invoke('marketing-agent-chat', {
        body: {
          messages: [{ role: 'user', content: `Wygeneruj raport marketingowy dla firmy ${selectedClient.company_name}. Miasto: ${selectedClient.city || 'brak'}. Budżet: ${selectedClient.monthly_budget || 0} zł/mies. Kampanie: ${campaigns.length}. Podsumuj wyniki i zasugeruj optymalizacje.` }],
          systemPrompt: 'Jesteś ekspertem marketingu. Generujesz profesjonalne raporty po polsku.'
        }
      });
      setReportForm(f => ({ ...f, summary: data?.result || data?.content || '' }));
    } catch { toast.error('Błąd generowania raportu AI'); }
    setGeneratingReport(false);
  };

  const saveReport = async () => {
    if (!selectedClient || !reportForm.title) { toast.error('Podaj tytuł raportu'); return; }
    await (supabase as any).from('client_reports').insert({
      client_id: selectedClient.id, title: reportForm.title,
      period_from: reportForm.period_from || null, period_to: reportForm.period_to || null,
      summary: reportForm.summary, campaigns_data: { campaigns_count: campaigns.length },
      leads_count: selectedClient.total_leads || 0, spent: selectedClient.total_spent || 0,
    });
    toast.success('Raport zapisany');
    setShowReportModal(false);
    setReportForm({ title: '', period_from: '', period_to: '', summary: '' });
    openDetails(selectedClient);
  };

  const filtered = clients.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [c.company_name, c.first_name, c.last_name, c.city, c.contact_email, c.phone, c.contact_name]
      .some(v => v?.toLowerCase().includes(s));
  });

  const getInitials = (c: Client) => {
    const f = c.first_name?.[0] || c.company_name?.[0] || '';
    const l = c.last_name?.[0] || '';
    return (f + l).toUpperCase() || '?';
  };

  if (selectedClient) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedClient(null)}>← Powrót</Button>
          <h2 className="text-xl font-semibold">{selectedClient.company_name}</h2>
          {selectedClient.portal_user_id && <Badge className="bg-green-100 text-green-700">✓ Konto GetRido</Badge>}
        </div>

        <Tabs value={detailTab} onValueChange={setDetailTab}>
          <TabsList>
            <TabsTrigger value="profile">Profil</TabsTrigger>
            <TabsTrigger value="campaigns">Kampanie ({campaigns.length})</TabsTrigger>
            <TabsTrigger value="reports">Raporty ({clientReports.length})</TabsTrigger>
            {selectedClient.portal_user_id && <TabsTrigger value="orders">Zlecenia z portalu</TabsTrigger>}
          </TabsList>

          <TabsContent value="profile">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Dane kontaktowe</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p><strong>Imię i nazwisko:</strong> {selectedClient.first_name} {selectedClient.last_name}</p>
                  <p><strong>Kontakt:</strong> {selectedClient.contact_name}</p>
                  <p><strong>Email:</strong> {selectedClient.contact_email}</p>
                  <p><strong>Telefon:</strong> {selectedClient.phone || '—'}</p>
                  <p><strong>Miasto:</strong> {selectedClient.city || '—'}</p>
                  <p><strong>Adres:</strong> {selectedClient.address || '—'}</p>
                  <p><strong>NIP:</strong> {selectedClient.nip || '—'}</p>
                  <p><strong>WWW:</strong> {selectedClient.website || '—'}</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => openEdit(selectedClient)}>Edytuj dane</Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Połączenia platform</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${selectedClient.meta_ad_account_id ? 'bg-blue-500' : 'bg-gray-300'}`} />
                    <span>Meta Ads: {selectedClient.meta_ad_account_id ? 'Połączono' : 'Brak'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${selectedClient.google_ad_account_id ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span>Google Ads: {selectedClient.google_ad_account_id ? 'Połączono' : 'Brak'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${selectedClient.instagram_account_id ? 'bg-pink-500' : 'bg-gray-300'}`} />
                    <span>Instagram: {selectedClient.instagram_account_id ? 'Połączono' : 'Brak'}</span>
                  </div>
                  {selectedClient.notes && (
                    <div className="mt-3 p-2 bg-muted rounded text-xs"><strong>Notatki:</strong> {selectedClient.notes}</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="campaigns">
            {campaigns.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Brak kampanii dla tego klienta</CardContent></Card>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nazwa</TableHead><TableHead>Platforma</TableHead><TableHead>Status</TableHead>
                    <TableHead>Budżet</TableHead><TableHead>ROAS</TableHead><TableHead>Wydane</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell><Badge variant="outline">{c.platform}</Badge></TableCell>
                      <TableCell><Badge variant={c.status === 'active' ? 'default' : 'secondary'}>{c.status}</Badge></TableCell>
                      <TableCell>{c.daily_budget} zł/dzień</TableCell>
                      <TableCell>{c.roas_current?.toFixed(1) || '—'}</TableCell>
                      <TableCell>{c.spend_today?.toFixed(0) || 0} zł</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="reports">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Raporty klienta</h3>
              <Button size="sm" onClick={() => setShowReportModal(true)} className="gap-1.5">
                <FileText className="h-4 w-4" /> Generuj raport
              </Button>
            </div>
            {clientReports.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Brak raportów</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {clientReports.map(r => (
                  <Card key={r.id}>
                    <CardContent className="py-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{r.title}</p>
                        <p className="text-xs text-muted-foreground">{r.period_from} — {r.period_to}</p>
                      </div>
                      <Badge variant={r.status === 'sent' ? 'default' : 'secondary'}>{r.status === 'sent' ? 'Wysłany' : 'Szkic'}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {selectedClient.portal_user_id && (
            <TabsContent value="orders">
              {portalOrders.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Brak zleceń z portalu</CardContent></Card>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usługa</TableHead><TableHead>Typ</TableHead><TableHead>Budżet</TableHead><TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portalOrders.map(o => (
                      <TableRow key={o.id}>
                        <TableCell>{(o as any).provider_services?.name || '—'}</TableCell>
                        <TableCell>{o.ad_type}</TableCell>
                        <TableCell>{o.budget} zł</TableCell>
                        <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          )}
        </Tabs>

        {/* Report Generation Modal */}
        <Dialog open={showReportModal} onOpenChange={setShowReportModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Generuj raport</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Tytuł raportu</Label><Input value={reportForm.title} onChange={e => setReportForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Od</Label><Input type="date" value={reportForm.period_from} onChange={e => setReportForm(f => ({ ...f, period_from: e.target.value }))} /></div>
                <div><Label>Do</Label><Input type="date" value={reportForm.period_to} onChange={e => setReportForm(f => ({ ...f, period_to: e.target.value }))} /></div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Podsumowanie</Label>
                  <Button size="sm" variant="outline" onClick={generateAIReport} disabled={generatingReport} className="gap-1 text-xs">
                    {generatingReport ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Generuj AI
                  </Button>
                </div>
                <Textarea value={reportForm.summary} onChange={e => setReportForm(f => ({ ...f, summary: e.target.value }))} rows={6} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReportModal(false)}>Anuluj</Button>
              <Button onClick={saveReport}>Zapisz raport</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Klienci Agencji</h2>
        <Button onClick={() => { setEditingClient(null); setForm(emptyForm); setShowAdd(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Dodaj klienta
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj po nazwie, imieniu, mieście, emailu..." className="pl-10" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{search ? 'Brak wyników wyszukiwania' : 'Brak klientów agencji'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(client => (
            <Card key={client.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 w-10 h-10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                    {getInitials(client)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{client.first_name} {client.last_name}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> {client.company_name}
                    </p>
                    {client.city && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" /> {client.city}</p>}
                    {client.contact_email && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Mail className="h-3 w-3" /> {client.contact_email}</p>}
                    {client.phone && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" /> {client.phone}</p>}

                    {/* Platform icons */}
                    <div className="flex gap-2 mt-2">
                      <div className={`w-5 h-5 rounded text-xs flex items-center justify-center ${client.meta_ad_account_id ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-400'}`}>M</div>
                      <div className={`w-5 h-5 rounded text-xs flex items-center justify-center ${client.google_ad_account_id ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>G</div>
                      <div className={`w-5 h-5 rounded text-xs flex items-center justify-center ${client.instagram_account_id ? 'bg-pink-500 text-white' : 'bg-gray-200 text-gray-400'}`}>I</div>
                      {client.portal_user_id && <Badge variant="outline" className="text-xs h-5 px-1">GetRido ✓</Badge>}
                    </div>

                    {/* Stats */}
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">{client.total_leads || 0} leadów</Badge>
                      <Badge variant="secondary" className="text-xs">{client.total_spent || 0} zł</Badge>
                    </div>

                    <div className="flex gap-1.5 mt-3">
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => openDetails(client)}>
                        <Eye className="h-3 w-3 mr-1" /> Szczegóły
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => openEdit(client)}>
                        Edytuj
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Client Modal */}
      <Dialog open={showAdd} onOpenChange={(open) => { setShowAdd(open); if (!open) { setEditingClient(null); setPortalMatch(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingClient ? 'Edytuj klienta' : 'Dodaj klienta agencji'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Basic Data */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground">Dane podstawowe</h4>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Imię</Label><Input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} /></div>
                <div><Label>Nazwisko</Label><Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} /></div>
              </div>
              <div><Label>Nazwa firmy *</Label><Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} /></div>
              <div>
                <Label>Email kontaktowy</Label>
                <div className="relative">
                  <Input type="email" value={form.contact_email} onChange={e => {
                    setForm(f => ({ ...f, contact_email: e.target.value }));
                    checkPortalUser(e.target.value);
                  }} />
                  {portalMatch && <Badge className="absolute right-2 top-1/2 -translate-y-1/2 bg-green-100 text-green-700 text-xs">✓ Konto w systemie</Badge>}
                </div>
              </div>
              <div><Label>Osoba kontaktowa</Label><Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Telefon</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div><Label>Miasto</Label><Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
              </div>
              <div><Label>Adres</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>NIP</Label><Input value={form.nip} onChange={e => setForm(f => ({ ...f, nip: e.target.value }))} /></div>
                <div><Label>Strona WWW</Label><Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} /></div>
              </div>
              <div><Label>Budżet miesięczny (zł)</Label><Input type="number" value={form.monthly_budget} onChange={e => setForm(f => ({ ...f, monthly_budget: Number(e.target.value) }))} /></div>
              <div><Label>Notatki</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>

            {/* API Accounts (collapsible) */}
            <Collapsible open={apiSectionOpen} onOpenChange={setApiSectionOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between text-sm font-semibold text-muted-foreground">
                  Konta reklamowe
                  <ChevronDown className={`h-4 w-4 transition-transform ${apiSectionOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Meta Ads Account ID</Label><Input value={form.meta_ad_account_id} onChange={e => setForm(f => ({ ...f, meta_ad_account_id: e.target.value }))} placeholder="act_..." /></div>
                  <div><Label>Meta Access Token</Label><Input type="password" value={form.meta_access_token} onChange={e => setForm(f => ({ ...f, meta_access_token: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Google Ads Account ID</Label><Input value={form.google_ad_account_id} onChange={e => setForm(f => ({ ...f, google_ad_account_id: e.target.value }))} placeholder="123-456-7890" /></div>
                  <div><Label>Google Refresh Token</Label><Input type="password" value={form.google_refresh_token} onChange={e => setForm(f => ({ ...f, google_refresh_token: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Instagram Account ID</Label><Input value={form.instagram_account_id} onChange={e => setForm(f => ({ ...f, instagram_account_id: e.target.value }))} /></div>
                  <div><Label>Instagram Access Token</Label><Input type="password" value={form.instagram_access_token} onChange={e => setForm(f => ({ ...f, instagram_access_token: e.target.value }))} /></div>
                </div>
                <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                  Konta reklamowe możesz podłączyć później w ustawieniach klienta. Pracownik tworzy konto na platformie, podłącza API i od tej chwili AI agent może zarządzać kampaniami automatycznie.
                </p>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Anuluj</Button>
            <Button onClick={saveClient} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{editingClient ? 'Zapisz' : 'Dodaj'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
