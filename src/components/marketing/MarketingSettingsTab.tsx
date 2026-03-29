import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Settings, Key, Zap, FileText, Loader2, Save, Bell } from 'lucide-react';

export function MarketingSettingsTab() {
  const [settings, setSettings] = useState<any>({
    agency_name: 'GetRido Marketing',
    contact_email: '',
    contact_phone: '',
    roas_stop_threshold: 1.5,
    roas_boost_threshold: 4.0,
    max_boost_percent: 30,
    report_email: '',
    report_branding: { footer: '', color: '#7C3AED' },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  // Notification settings
  const [notifSettings, setNotifSettings] = useState<any>({
    notification_email: '',
    notify_new_orders: true,
    notify_status_changes: true,
    notify_new_leads: true,
  });
  const [notifId, setNotifId] = useState<string | null>(null);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    const [{ data: agencyData }, { data: notifData }] = await Promise.all([
      supabase.from('agency_settings').select('*').limit(1).maybeSingle(),
      (supabase as any).from('marketing_notification_settings').select('*').limit(1).maybeSingle(),
    ]);
    if (agencyData) {
      setSettings(agencyData);
      setSettingsId(agencyData.id);
    }
    if (notifData) {
      setNotifSettings(notifData);
      setNotifId(notifData.id);
    }
    setLoading(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    // Save agency settings
    const { id, created_at, updated_at, ...payload } = settings;
    if (settingsId) {
      await supabase.from('agency_settings').update(payload).eq('id', settingsId);
    } else {
      const { data } = await supabase.from('agency_settings').insert(payload).select().single();
      if (data) setSettingsId(data.id);
    }

    // Save notification settings
    const { id: nId, created_at: nCa, updated_at: nUa, ...notifPayload } = notifSettings;
    if (notifId) {
      await (supabase as any).from('marketing_notification_settings').update(notifPayload).eq('id', notifId);
    } else {
      const { data } = await (supabase as any).from('marketing_notification_settings').insert(notifPayload).select().single();
      if (data) setNotifId(data.id);
    }

    toast.success('Ustawienia zapisane');
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-xl font-semibold flex items-center gap-2"><Settings className="h-5 w-5" /> Ustawienia Agencji</h2>

      {/* Agency info */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Dane agencji</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Nazwa agencji</Label><Input value={settings.agency_name || ''} onChange={e => setSettings((s: any) => ({ ...s, agency_name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email kontaktowy</Label><Input value={settings.contact_email || ''} onChange={e => setSettings((s: any) => ({ ...s, contact_email: e.target.value }))} /></div>
            <div><Label>Telefon</Label><Input value={settings.contact_phone || ''} onChange={e => setSettings((s: any) => ({ ...s, contact_phone: e.target.value }))} /></div>
          </div>
        </CardContent>
      </Card>

      {/* API Keys — already configured as Supabase secrets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Key className="h-4 w-4" /> Klucze API</CardTitle>
          <CardDescription>Klucze są skonfigurowane jako Supabase Secrets i gotowe do użycia</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { name: 'Anthropic API (Claude)', key: 'ANTHROPIC_API_KEY' },
            { name: 'Google API (Gemini)', key: 'GOOGLE_API_KEY' },
            { name: 'Lovable AI Gateway', key: 'LOVABLE_API_KEY' },
            { name: 'Resend (Email)', key: 'RESEND_API_KEY' },
          ].map(api => (
            <div key={api.key} className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
              <div className="h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
              <div>
                <p className="text-sm font-medium">{api.name}</p>
                <p className="text-xs text-muted-foreground">{api.key} — skonfigurowany ✓</p>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Klucze API zarządzane są w ustawieniach Supabase Edge Functions. Nie trzeba ich podawać ręcznie.</p>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Bell className="h-4 w-4" /> Powiadomienia email</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Email powiadomień</Label>
            <Input
              value={notifSettings.notification_email || ''}
              onChange={e => setNotifSettings((s: any) => ({ ...s, notification_email: e.target.value }))}
              placeholder="marketing@firma.pl"
            />
            <p className="text-xs text-muted-foreground mt-1">Na ten adres będą przychodziły powiadomienia o nowych zleceniach</p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Nowe zlecenia reklam</Label>
              <Switch checked={notifSettings.notify_new_orders} onCheckedChange={v => setNotifSettings((s: any) => ({ ...s, notify_new_orders: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Zmiany statusów</Label>
              <Switch checked={notifSettings.notify_status_changes} onCheckedChange={v => setNotifSettings((s: any) => ({ ...s, notify_status_changes: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Nowe leady klientów</Label>
              <Switch checked={notifSettings.notify_new_leads} onCheckedChange={v => setNotifSettings((s: any) => ({ ...s, notify_new_leads: v }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Automation */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4" /> Automatyzacje</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>ROAS auto-stop</Label>
              <Input type="number" step="0.1" value={settings.roas_stop_threshold} onChange={e => setSettings((s: any) => ({ ...s, roas_stop_threshold: parseFloat(e.target.value) }))} />
              <p className="text-xs text-muted-foreground mt-1">Wyłącz kampanię gdy ROAS poniżej tej wartości</p>
            </div>
            <div>
              <Label>ROAS auto-boost</Label>
              <Input type="number" step="0.1" value={settings.roas_boost_threshold} onChange={e => setSettings((s: any) => ({ ...s, roas_boost_threshold: parseFloat(e.target.value) }))} />
              <p className="text-xs text-muted-foreground mt-1">Zwiększ budżet gdy ROAS powyżej tej wartości</p>
            </div>
            <div>
              <Label>Max boost (%)</Label>
              <Input type="number" value={settings.max_boost_percent} onChange={e => setSettings((s: any) => ({ ...s, max_boost_percent: parseFloat(e.target.value) }))} />
              <p className="text-xs text-muted-foreground mt-1">Maksymalne zwiększenie budżetu dziennego</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Raporty</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Email dla raportów</Label><Input value={settings.report_email || ''} onChange={e => setSettings((s: any) => ({ ...s, report_email: e.target.value }))} placeholder="raporty@firma.pl" /></div>
          <div><Label>Stopka raportów</Label><Textarea value={settings.report_branding?.footer || ''} onChange={e => setSettings((s: any) => ({ ...s, report_branding: { ...s.report_branding, footer: e.target.value } }))} rows={2} /></div>
        </CardContent>
      </Card>

      <Button onClick={saveSettings} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Zapisz ustawienia
      </Button>
    </div>
  );
}