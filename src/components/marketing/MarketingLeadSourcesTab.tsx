import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Webhook, FileSpreadsheet, Send, Facebook, Copy, Check, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type Source = any;

const TYPES = [
  { value: 'webhook', label: 'Webhook (Zapier/Make)', icon: Webhook },
  { value: 'google_sheets', label: 'Google Sheets', icon: FileSpreadsheet },
  { value: 'telegram', label: 'Telegram Bot', icon: Send },
  { value: 'meta_lead_ads', label: 'Meta Lead Ads', icon: Facebook },
];

export function MarketingLeadSourcesTab() {
  const [sources, setSources] = useState<Source[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({
    source_type: 'webhook', client_id: '', name: '',
    google_sheet_id: '', google_sheet_range: 'A:Z',
    telegram_bot_token: '', telegram_chat_id: '',
    meta_form_id: '', meta_page_id: '', meta_access_token: '',
  });

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: c }] = await Promise.all([
      (supabase as any).from('external_lead_sources').select('*, client:agency_clients(company_name)').order('created_at', { ascending: false }),
      supabase.from('agency_clients').select('id, company_name').order('company_name'),
    ]);
    setSources(s || []);
    setClients(c || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.client_id || !form.name) {
      toast.error('Wybierz klienta i podaj nazwę');
      return;
    }
    const payload: any = {
      client_id: form.client_id,
      source_type: form.source_type,
      name: form.name,
      is_active: true,
    };
    if (form.source_type === 'google_sheets') {
      payload.google_sheet_id = form.google_sheet_id;
      payload.google_sheet_range = form.google_sheet_range;
    } else if (form.source_type === 'telegram') {
      payload.telegram_bot_token = form.telegram_bot_token;
      payload.telegram_chat_id = form.telegram_chat_id;
    } else if (form.source_type === 'meta_lead_ads') {
      payload.meta_form_id = form.meta_form_id;
      payload.meta_page_id = form.meta_page_id;
      payload.meta_access_token = form.meta_access_token;
    }
    const { error } = await (supabase as any).from('external_lead_sources').insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success('Źródło dodane');
    setOpen(false);
    setForm({ source_type: 'webhook', client_id: '', name: '', google_sheet_id: '', google_sheet_range: 'A:Z', telegram_bot_token: '', telegram_chat_id: '', meta_form_id: '', meta_page_id: '', meta_access_token: '' });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Usunąć źródło?')) return;
    await (supabase as any).from('external_lead_sources').delete().eq('id', id);
    load();
  };

  const toggle = async (s: Source) => {
    await (supabase as any).from('external_lead_sources').update({ is_active: !s.is_active }).eq('id', s.id);
    load();
  };

  const sync = async (id: string) => {
    toast.info('Synchronizuję...');
    const { error } = await supabase.functions.invoke('sync-external-leads', { body: { source_id: id } });
    if (error) toast.error(error.message); else toast.success('Synchronizacja uruchomiona');
    setTimeout(load, 1500);
  };

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Skopiowano');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Źródła leadów</h2>
          <p className="text-muted-foreground text-sm">Webhooki, Google Sheets, Telegram, Meta Lead Ads</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" /> Dodaj źródło</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : sources.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Brak skonfigurowanych źródeł. Dodaj pierwsze, aby leady wpadały automatycznie.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {sources.map(s => {
            const TypeIcon = TYPES.find(t => t.value === s.source_type)?.icon || Webhook;
            return (
              <Card key={s.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="p-2 rounded bg-primary/10"><TypeIcon className="h-5 w-5 text-primary" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{s.name}</h3>
                          <Badge variant={s.is_active ? 'default' : 'secondary'}>{s.is_active ? 'Aktywne' : 'Wyłączone'}</Badge>
                          <Badge variant="outline">{TYPES.find(t => t.value === s.source_type)?.label}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">Klient: {s.client?.company_name || '—'}</p>
                        <p className="text-xs text-muted-foreground">Zaimportowano: {s.total_imported || 0} • Ostatnia synch: {s.last_synced_at ? new Date(s.last_synced_at).toLocaleString('pl-PL') : 'nigdy'}</p>
                        {s.source_type === 'webhook' && s.webhook_url && (
                          <div className="mt-2 flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">{s.webhook_url}</code>
                            <Button size="sm" variant="ghost" onClick={() => copy(s.webhook_url, s.id)}>
                              {copiedId === s.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            </Button>
                          </div>
                        )}
                        {s.source_type === 'meta_lead_ads' && s.meta_form_id && (
                          <p className="text-xs mt-1">✅ Meta połączona — Form ID: <code>{s.meta_form_id}</code></p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {(s.source_type === 'google_sheets' || s.source_type === 'telegram') && (
                        <Button size="sm" variant="outline" onClick={() => sync(s.id)}><RefreshCw className="h-3 w-3" /></Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => toggle(s)}>{s.is_active ? 'Wyłącz' : 'Włącz'}</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Dodaj źródło leadów</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Typ źródła</Label>
              <Select value={form.source_type} onValueChange={v => setForm({ ...form, source_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Klient</Label>
              <Select value={form.client_id} onValueChange={v => setForm({ ...form, client_id: v })}>
                <SelectTrigger><SelectValue placeholder="Wybierz klienta" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nazwa źródła</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="np. Leady z agencji XYZ" />
            </div>

            {form.source_type === 'google_sheets' && (
              <>
                <div><Label>ID arkusza Google</Label><Input value={form.google_sheet_id} onChange={e => setForm({ ...form, google_sheet_id: e.target.value })} placeholder="1BxiMVs0XRA5..." /></div>
                <div><Label>Zakres (np. Leady!A:Z)</Label><Input value={form.google_sheet_range} onChange={e => setForm({ ...form, google_sheet_range: e.target.value })} /></div>
              </>
            )}

            {form.source_type === 'telegram' && (
              <>
                <div><Label>Bot Token</Label><Input value={form.telegram_bot_token} onChange={e => setForm({ ...form, telegram_bot_token: e.target.value })} placeholder="123456:ABC..." /></div>
                <div><Label>Chat ID (opcjonalnie)</Label><Input value={form.telegram_chat_id} onChange={e => setForm({ ...form, telegram_chat_id: e.target.value })} /></div>
              </>
            )}

            {form.source_type === 'meta_lead_ads' && (
              <>
                <div><Label>Page Access Token</Label><Textarea value={form.meta_access_token} onChange={e => setForm({ ...form, meta_access_token: e.target.value })} rows={2} /></div>
                <div><Label>Page ID</Label><Input value={form.meta_page_id} onChange={e => setForm({ ...form, meta_page_id: e.target.value })} /></div>
                <div><Label>Form ID</Label><Input value={form.meta_form_id} onChange={e => setForm({ ...form, meta_form_id: e.target.value })} /></div>
                <p className="text-xs text-muted-foreground">Po zapisie zarejestruj webhook w Meta: subscribe page to leadgen events.</p>
              </>
            )}

            {form.source_type === 'webhook' && (
              <p className="text-sm text-muted-foreground">URL webhooka zostanie wygenerowany automatycznie po zapisaniu. Wklejasz go do Zapier/Make.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Anuluj</Button>
            <Button onClick={submit}>Dodaj źródło</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
