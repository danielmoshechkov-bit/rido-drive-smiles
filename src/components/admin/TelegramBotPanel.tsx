import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageCircle, Save, Loader2, ExternalLink, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const PROJECT_REF = 'wclrrytmrscqvsyxyvnn';
const WEBHOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/telegram-webhook`;

interface LogRow {
  id: string;
  user_id: string | null;
  notification_type: string;
  channel: string;
  status: string;
  error_message: string | null;
  sent_at: string;
}

interface Stats {
  connectedUsers: number;
  sent30d: number;
  successRate: number;
  topTypes: { type: string; count: number }[];
}

export function TelegramBotPanel() {
  const [botUsername, setBotUsername] = useState('');
  const [savedBotUsername, setSavedBotUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<Stats>({ connectedUsers: 0, sent30d: 0, successRate: 0, topTypes: [] });
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterChannel, setFilterChannel] = useState<string>('telegram');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const tokenConfigured = true; // Admins manage TELEGRAM_BOT_TOKEN via Supabase Secrets

  const loadSettings = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'telegram_bot_username')
      .maybeSingle();
    const username = (data?.value as any)?.username || '';
    setBotUsername(username);
    setSavedBotUsername(username);
  };

  const loadStats = async () => {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString();

    const [{ count: connected }, { data: sent }, { data: failed }, { data: top }] = await Promise.all([
      supabase.from('telegram_connections').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase
        .from('notification_log')
        .select('id', { count: 'exact', head: true })
        .eq('channel', 'telegram')
        .gte('sent_at', sinceIso)
        .eq('status', 'sent'),
      supabase
        .from('notification_log')
        .select('id', { count: 'exact', head: true })
        .eq('channel', 'telegram')
        .gte('sent_at', sinceIso)
        .neq('status', 'sent'),
      supabase
        .from('notification_log')
        .select('notification_type')
        .eq('channel', 'telegram')
        .gte('sent_at', sinceIso)
        .limit(1000),
    ]);

    const sentCount = (sent as any)?.length ?? 0;
    // count(exact, head:true) returns count via response, but we requested only ids;
    // use second call's count by re-querying — easier alt:
    const sent30d = await supabase
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'telegram')
      .eq('status', 'sent')
      .gte('sent_at', sinceIso);
    const failed30d = await supabase
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'telegram')
      .neq('status', 'sent')
      .gte('sent_at', sinceIso);

    const s = sent30d.count || 0;
    const f = failed30d.count || 0;
    const total = s + f;
    const tally = new Map<string, number>();
    (top || []).forEach((r: any) => tally.set(r.notification_type, (tally.get(r.notification_type) || 0) + 1));
    const topTypes = Array.from(tally.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    setStats({
      connectedUsers: connected || 0,
      sent30d: s,
      successRate: total === 0 ? 0 : Math.round((s / total) * 1000) / 10,
      topTypes,
    });
  };

  const loadLogs = async () => {
    let q = supabase
      .from('notification_log')
      .select('id,user_id,notification_type,channel,status,error_message,sent_at')
      .order('sent_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (filterChannel !== 'all') q = q.eq('channel', filterChannel);
    if (filterStatus !== 'all') q = q.eq('status', filterStatus);
    const { data } = await q;
    setLogs((data || []) as LogRow[]);
  };

  useEffect(() => {
    loadSettings();
    loadStats();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [page, filterStatus, filterChannel]);

  const handleSave = async () => {
    setSaving(true);
    const cleaned = botUsername.trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
    const { error } = await supabase.from('app_settings').upsert({
      key: 'telegram_bot_username',
      value: { username: cleaned },
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error('Błąd zapisu: ' + error.message);
      return;
    }
    setSavedBotUsername(cleaned);
    setBotUsername(cleaned);
    toast.success('Zapisano konfigurację bota');
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(WEBHOOK_URL);
    toast.success('Skopiowano webhook URL');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#229ED9]/10">
              <MessageCircle className="h-5 w-5 text-[#229ED9]" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base">Telegram Bot</CardTitle>
              <CardDescription>Integracja powiadomień przez Telegram</CardDescription>
            </div>
            <Badge variant={savedBotUsername && tokenConfigured ? 'default' : 'secondary'}>
              {savedBotUsername && tokenConfigured ? 'Aktywne' : 'Niezkonfigurowane'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
            <p className="font-medium">Bot Token</p>
            <p className="text-muted-foreground text-xs">
              Token bota przechowywany jest jako sekret Supabase pod nazwą <code className="bg-background px-1 py-0.5 rounded">TELEGRAM_BOT_TOKEN</code>.
              Aby go ustawić lub zmienić, użyj panelu sekretów Supabase. Pobierz token z{' '}
              <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-primary underline">@BotFather</a>.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Bot Username *</Label>
            <Input
              value={botUsername}
              onChange={(e) => setBotUsername(e.target.value)}
              placeholder="GetRidoBot (bez @ i bez https://t.me/)"
            />
            {savedBotUsername && (
              <a
                href={`https://t.me/${savedBotUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline inline-flex items-center gap-1"
              >
                https://t.me/{savedBotUsername} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <div className="flex gap-2">
              <Input value={WEBHOOK_URL} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={copyWebhook}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ustaw ten URL jako webhook bota w Telegramie (komenda <code>/setWebhook</code> u BotFather lub przez API)
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Zapisz konfigurację
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📊 Statystyki (30 dni)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Połączeni użytkownicy" value={stats.connectedUsers} />
            <Stat label="Wysłane powiadomienia" value={stats.sent30d} />
            <Stat label="Skuteczność" value={`${stats.successRate}%`} />
            <Stat label="Top typ" value={stats.topTypes[0]?.type || '—'} small />
          </div>
          {stats.topTypes.length > 0 && (
            <div className="mt-4 text-xs text-muted-foreground space-y-1">
              {stats.topTypes.map((t) => (
                <div key={t.type} className="flex justify-between border-b pb-1">
                  <span>{t.type}</span>
                  <span>{t.count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">📋 Ostatnie powiadomienia</CardTitle>
            <div className="flex gap-2">
              <Select value={filterChannel} onValueChange={(v) => { setPage(0); setFilterChannel(v); }}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie kanały</SelectItem>
                  <SelectItem value="telegram">Telegram</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="app">Aplikacja</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={(v) => { setPage(0); setFilterStatus(v); }}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie statusy</SelectItem>
                  <SelectItem value="sent">Wysłane</SelectItem>
                  <SelectItem value="failed">Błąd</SelectItem>
                  <SelectItem value="skipped_preferences">Pominięte (pref)</SelectItem>
                  <SelectItem value="skipped_quiet_hours">Pominięte (cisza)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-2">Czas</th>
                  <th className="py-2 pr-2">User</th>
                  <th className="py-2 pr-2">Typ</th>
                  <th className="py-2 pr-2">Kanał</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Błąd</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">Brak wpisów</td></tr>
                ) : logs.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="py-2 pr-2 whitespace-nowrap text-xs">{new Date(l.sent_at).toLocaleString('pl-PL')}</td>
                    <td className="py-2 pr-2 text-xs font-mono">{l.user_id?.slice(0, 8) || '—'}</td>
                    <td className="py-2 pr-2 text-xs">{l.notification_type}</td>
                    <td className="py-2 pr-2 text-xs">{l.channel}</td>
                    <td className="py-2 pr-2">
                      <Badge variant={l.status === 'sent' ? 'default' : l.status === 'failed' ? 'destructive' : 'secondary'}>
                        {l.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-2 text-xs text-destructive max-w-xs truncate">{l.error_message || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center pt-3">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              ← Poprzednie
            </Button>
            <span className="text-xs text-muted-foreground">Strona {page + 1}</span>
            <Button variant="outline" size="sm" disabled={logs.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>
              Następne →
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className="p-3 border rounded-lg">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={small ? 'text-sm font-medium truncate' : 'text-2xl font-semibold'}>{value}</p>
    </div>
  );
}
