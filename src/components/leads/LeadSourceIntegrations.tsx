import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plug, Plus, Copy, Trash2, Loader2, ExternalLink, FileSpreadsheet, Facebook, Globe } from 'lucide-react';

interface Source {
  id: string;
  source_type: string;
  source_name: string | null;
  is_active: boolean;
  webhook_url: string | null;
  webhook_secret: string | null;
  meta_form_id: string | null;
  meta_access_token: string | null;
  total_imported: number | null;
  last_synced_at: string | null;
  client_id: string | null;
}

interface Props { userId: string | null; }

const TYPE_META: Record<string, { label: string; icon: any; color: string; description: string }> = {
  meta_lead_ads: {
    label: 'Meta Lead Ads',
    icon: Facebook,
    color: 'bg-blue-100 text-blue-700',
    description: 'Pobiera leady automatycznie z formularzy Facebook/Instagram. Wymaga Form ID i tokena dostępu (Meta Business).',
  },
  google_lead_form: {
    label: 'Google Lead Form Ads',
    icon: Globe,
    color: 'bg-yellow-100 text-yellow-700',
    description: 'Webhook dla rozszerzeń formularzy Google Ads — skonfiguruj URL webhooka w Google Ads → Audience → Lead form.',
  },
  csv_sheets: {
    label: 'Arkusz CSV / Google Sheets',
    icon: FileSpreadsheet,
    color: 'bg-green-100 text-green-700',
    description: 'Webhook do dosyłania leadów z dowolnego źródła (Zapier, Make, n8n, Google Sheets via Apps Script).',
  },
  custom: {
    label: 'Własne źródło / API',
    icon: Plug,
    color: 'bg-gray-100 text-gray-700',
    description: 'Ogólny endpoint do podpięcia z dowolnego CRM-u lub formularza WWW.',
  },
};

export function LeadSourceIntegrations({ userId }: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newType, setNewType] = useState('meta_lead_ads');
  const [newName, setNewName] = useState('');
  const [newFormId, setNewFormId] = useState('');
  const [newToken, setNewToken] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('external_lead_sources')
        .select('*')
        .eq('client_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSources((data as any) || []);
    } catch (e: any) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

  const handleAdd = async () => {
    if (!userId) return;
    if (!newName.trim()) { toast.error('Podaj nazwę źródła'); return; }
    setSaving(true);
    try {
      const payload: any = {
        client_id: userId,
        source_type: newType,
        source_name: newName.trim(),
        is_active: true,
      };
      if (newType === 'meta_lead_ads') {
        if (!newFormId.trim()) throw new Error('Podaj Meta Form ID');
        payload.meta_form_id = newFormId.trim();
        payload.meta_access_token = newToken.trim() || null;
      }
      const { error } = await supabase.from('external_lead_sources').insert(payload);
      if (error) throw error;
      toast.success('Źródło dodane');
      setAddOpen(false);
      setNewName(''); setNewFormId(''); setNewToken('');
      load();
    } catch (e: any) {
      toast.error('Błąd: ' + e.message);
    }
    setSaving(false);
  };

  const toggle = async (s: Source) => {
    const { error } = await supabase.from('external_lead_sources').update({ is_active: !s.is_active }).eq('id', s.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Usunąć źródło? Webhook przestanie działać.')) return;
    const { error } = await supabase.from('external_lead_sources').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Usunięto');
    load();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Skopiowano');
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Plug className="h-4 w-4" /> Integracje źródeł leadów</CardTitle>
            <CardDescription className="text-xs mt-1">
              Podłącz Meta Ads, Google Lead Form lub arkusze, aby leady wpadały tutaj automatycznie.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Dodaj źródło
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : sources.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Brak skonfigurowanych integracji. Kliknij <strong>Dodaj źródło</strong>, aby zacząć pobierać leady automatycznie z Meta lub Google.
          </p>
        ) : (
          <div className="space-y-2">
            {sources.map(s => {
              const meta = TYPE_META[s.source_type] || TYPE_META.custom;
              const Icon = meta.icon;
              return (
                <div key={s.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className={`p-1.5 rounded ${meta.color}`}><Icon className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{s.source_name}</span>
                          <Badge variant={s.is_active ? 'default' : 'secondary'} className="text-xs">
                            {s.is_active ? 'Aktywne' : 'Wyłączone'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{meta.label}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Zaimportowano: {s.total_imported || 0} {s.last_synced_at && `· ostatnio ${new Date(s.last_synced_at).toLocaleString('pl')}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => toggle(s)} className="h-8 text-xs">
                        {s.is_active ? 'Wyłącz' : 'Włącz'}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(s.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {s.webhook_url && (
                    <div className="bg-muted/50 rounded p-2 space-y-1">
                      <Label className="text-xs text-muted-foreground">Webhook URL (skopiuj do Meta / Google / Zapier):</Label>
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-background border rounded px-2 py-1 flex-1 truncate">{s.webhook_url}</code>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copy(s.webhook_url!)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                  {s.source_type === 'meta_lead_ads' && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" />
                      Form ID: <code className="bg-muted px-1.5 py-0.5 rounded">{s.meta_form_id}</code>
                      {!s.meta_access_token && <span className="text-amber-600">· Brak tokena</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Add source dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dodaj źródło leadów</DialogTitle>
            <DialogDescription>
              Wybierz typ integracji i postępuj zgodnie z instrukcją.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Typ</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      <span className="flex items-center gap-2"><v.icon className="h-4 w-4" /> {v.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{TYPE_META[newType]?.description}</p>
            </div>
            <div>
              <Label>Nazwa (np. „Reklama wymiana opon — Meta”)</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            {newType === 'meta_lead_ads' && (
              <>
                <div>
                  <Label>Meta Form ID *</Label>
                  <Input value={newFormId} onChange={e => setNewFormId(e.target.value)} placeholder="np. 1234567890" />
                  <p className="text-xs text-muted-foreground mt-1">Znajdziesz w Meta Business → Instant Forms.</p>
                </div>
                <div>
                  <Label>Long-lived Access Token (opcjonalnie)</Label>
                  <Input type="password" value={newToken} onChange={e => setNewToken(e.target.value)} placeholder="EAAB..." />
                  <p className="text-xs text-muted-foreground mt-1">Bez tokena platforma użyje globalnego tokena GetRido (jeśli skonfigurowany).</p>
                </div>
              </>
            )}
            {newType !== 'meta_lead_ads' && (
              <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                Po zapisaniu otrzymasz unikalny <strong>webhook URL</strong>, który należy wkleić w panelu Google Ads / Zapier / arkusza.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Anuluj</Button>
            <Button onClick={handleAdd} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Dodaj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
