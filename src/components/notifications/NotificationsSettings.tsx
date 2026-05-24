import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Bell, Mail, MessageSquare, Smartphone, Clock, Loader2, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  NOTIFICATION_MODULES,
  ALL_CHANNELS,
  CHANNEL_LABELS,
  buildDefaultPrefs,
  prefKey,
  type NotificationChannel,
  type NotificationModule,
} from '@/config/notificationTypes';
import { TelegramConnectButton } from '@/components/notifications/TelegramConnectButton';

interface Props {
  /** Filter shown modules. If omitted — all. */
  visibleModules?: NotificationModule['key'][];
  userEmail?: string | null;
  userPhone?: string | null;
}

export function NotificationsSettings({ visibleModules, userEmail, userPhone }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [quietEnabled, setQuietEnabled] = useState(true);
  const [quietStart, setQuietStart] = useState('20:00');
  const [quietEnd, setQuietEnd] = useState('08:00');

  const modules = useMemo(
    () => (visibleModules ? NOTIFICATION_MODULES.filter((m) => visibleModules.includes(m.key)) : NOTIFICATION_MODULES),
    [visibleModules]
  );

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', u.user.id)
        .maybeSingle();

      const defaults = buildDefaultPrefs();
      if (data) {
        setPrefs({ ...defaults, ...((data.prefs as Record<string, boolean>) || {}) });
        setQuietEnabled(data.quiet_hours_enabled);
        setQuietStart(String(data.quiet_hours_start).slice(0, 5));
        setQuietEnd(String(data.quiet_hours_end).slice(0, 5));
      } else {
        setPrefs(defaults);
      }
      setLoading(false);
    })();
  }, []);

  const togglePref = (type: string, channel: NotificationChannel) => {
    const k = prefKey(type, channel);
    setPrefs((p) => ({ ...p, [k]: !p[k] }));
  };

  const setModuleAll = (mod: NotificationModule, value: boolean) => {
    setPrefs((p) => {
      const next = { ...p };
      for (const t of mod.types) {
        for (const c of ALL_CHANNELS) {
          next[prefKey(t.key, c)] = value;
        }
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error('Brak sesji');
      const { error } = await supabase.from('notification_preferences').upsert(
        {
          user_id: u.user.id,
          prefs,
          quiet_hours_enabled: quietEnabled,
          quiet_hours_start: quietStart + ':00',
          quiet_hours_end: quietEnd + ':00',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
      if (error) throw error;
      toast.success('Zapisano ustawienia powiadomień');
    } catch (e: any) {
      toast.error('Błąd zapisu: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    toast.info('Funkcja testowa zostanie aktywowana po wdrożeniu kanału Telegram przez administratora');
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Channels */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" /> Kanały powiadomień
          </CardTitle>
          <CardDescription>Wybierz jakimi sposobami chcesz otrzymywać powiadomienia</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Email</p>
                <p className="text-xs text-muted-foreground">{userEmail || '—'}</p>
              </div>
            </div>
            <Badge variant="default">Aktywne</Badge>
          </div>
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">SMS</p>
                <p className="text-xs text-muted-foreground">{userPhone || 'Brak numeru'} • płatne 0,10 zł/szt</p>
              </div>
            </div>
            <Badge variant={userPhone ? 'default' : 'secondary'}>{userPhone ? 'Aktywne' : 'Brak numeru'}</Badge>
          </div>
          <div className="flex items-center justify-between p-3 border rounded-lg gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-[#229ED9]" />
              <div>
                <p className="font-medium text-sm">Telegram</p>
                <p className="text-xs text-muted-foreground">Najszybsze powiadomienia, bezpłatne</p>
              </div>
            </div>
            <TelegramConnectButton variant="compact" />
          </div>
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Aplikacja (push)</p>
                <p className="text-xs text-muted-foreground">Powiadomienia w portalu</p>
              </div>
            </div>
            <Badge variant="default">Aktywne</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Per-module preference tables */}
      {modules.map((mod) => (
        <Card key={mod.key}>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">{mod.label}</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setModuleAll(mod, true)}>
                  Zaznacz wszystko
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setModuleAll(mod, false)}>
                  Odznacz wszystko
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left font-medium pb-2 pr-4">Typ powiadomienia</th>
                    {ALL_CHANNELS.map((c) => (
                      <th key={c} className="font-medium pb-2 px-2 text-center w-16">
                        {CHANNEL_LABELS[c]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mod.types.map((t) => (
                    <tr key={t.key} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span>{t.label}</span>
                          {t.critical && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              KRYT
                            </Badge>
                          )}
                        </div>
                      </td>
                      {ALL_CHANNELS.map((c) => (
                        <td key={c} className="text-center py-2 px-2">
                          <Checkbox
                            checked={!!prefs[prefKey(t.key, c)]}
                            onCheckedChange={() => togglePref(t.key, c)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Quiet hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Cisza nocna
          </CardTitle>
          <CardDescription>
            W godzinach ciszy nie wysyłamy Telegrama ani SMS — z wyjątkiem alertów krytycznych (czerwony status floty itp.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Switch checked={quietEnabled} onCheckedChange={setQuietEnabled} id="quiet" />
            <Label htmlFor="quiet">Włącz ciszę nocną</Label>
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div className="space-y-2">
              <Label>Od</Label>
              <Input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} disabled={!quietEnabled} />
            </div>
            <div className="space-y-2">
              <Label>Do</Label>
              <Input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} disabled={!quietEnabled} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={handleTest} className="gap-2">
          <Send className="h-4 w-4" /> Wyślij test
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Zapisz ustawienia
        </Button>
      </div>
    </div>
  );
}
