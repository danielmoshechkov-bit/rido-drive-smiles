import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Shield, AlertTriangle, CheckCircle, Info, Clock, RefreshCw,
  Eye, EyeOff, ExternalLink, Bell, Activity, History, Calendar
} from 'lucide-react';

interface KsefAlert {
  id: string;
  created_at: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string | null;
  action_required: string | null;
  source: string | null;
  source_url: string | null;
  is_read: boolean;
}

interface KsefConfig {
  id: string;
  user_id: string;
  alert_email: string | null;
  slack_webhook_url: string | null;
  scan_enabled: boolean;
  scan_frequency: string;
  notify_critical: boolean;
  notify_warning: boolean;
  notify_info: boolean;
  last_scan_at: string | null;
  last_scan_status: string;
  last_scan_alerts_count: number;
}

interface ScanHistory {
  id: string;
  created_at: string;
  status: 'ok' | 'error';
  sources_checked: number;
  alerts_found: number;
  error_message: string | null;
  duration_ms: number | null;
}

const KSEF_MILESTONES = [
  { date: '2026-02-01', event: 'KSeF obowiązkowy — firmy >200 mln zł' },
  { date: '2026-04-01', event: 'KSeF obowiązkowy — wszyscy przedsiębiorcy' },
  { date: '2027-01-01', event: 'KSeF dla mikroprzedsiębiorstw' },
];

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatScanDate(dateStr: string | null): string {
  if (!dateStr) return 'Nigdy';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return 'Przed chwilą';
  if (diffH < 24) return `${diffH}h temu`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'Wczoraj';
  return d.toLocaleDateString('pl-PL');
}

export function KsefMonitorView() {
  const [config, setConfig] = useState<KsefConfig | null>(null);
  const [alerts, setAlerts] = useState<KsefAlert[]>([]);
  const [scans, setScans] = useState<ScanHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanCooldown, setScanCooldown] = useState(false);
  const [showSlackKey, setShowSlackKey] = useState(false);

  // Form state
  const [formEmail, setFormEmail] = useState('');
  const [formSlack, setFormSlack] = useState('');
  const [formScanEnabled, setFormScanEnabled] = useState(true);
  const [formNotifyCritical, setFormNotifyCritical] = useState(true);
  const [formNotifyWarning, setFormNotifyWarning] = useState(true);
  const [formNotifyInfo, setFormNotifyInfo] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Load or create config
    let { data: cfg } = await (supabase as any)
      .from('ksef_monitor_config')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!cfg) {
      const { data: newCfg } = await (supabase as any)
        .from('ksef_monitor_config')
        .insert({ user_id: user.id })
        .select()
        .single();
      cfg = newCfg;
    }

    if (cfg) {
      setConfig(cfg);
      setFormEmail(cfg.alert_email || '');
      setFormSlack(cfg.slack_webhook_url || '');
      setFormScanEnabled(cfg.scan_enabled);
      setFormNotifyCritical(cfg.notify_critical);
      setFormNotifyWarning(cfg.notify_warning);
      setFormNotifyInfo(cfg.notify_info);
    }

    // Load alerts
    const { data: alertsData } = await (supabase as any)
      .from('ksef_monitor_alerts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(50);
    if (alertsData) setAlerts(alertsData);

    // Load scan history
    const { data: scansData } = await (supabase as any)
      .from('ksef_monitor_scans')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (scansData) setScans(scansData);

    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time subscription for new alerts
  useEffect(() => {
    const channel = (supabase as any)
      .channel('ksef-alerts-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ksef_monitor_alerts' }, (payload: any) => {
        setAlerts(prev => [payload.new, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from('ksef_monitor_config')
      .update({
        alert_email: formEmail || null,
        slack_webhook_url: formSlack || null,
        scan_enabled: formScanEnabled,
        notify_critical: formNotifyCritical,
        notify_warning: formNotifyWarning,
        notify_info: formNotifyInfo,
      })
      .eq('id', config.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Ustawienia zapisane ✓');
    loadData();
  };

  const handleScan = async () => {
    if (scanCooldown) { toast.error('Poczekaj 60 sekund między skanami'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setScanning(true);
    setScanCooldown(true);
    setTimeout(() => setScanCooldown(false), 60000);

    try {
      const { data, error } = await supabase.functions.invoke('ksef-monitor', {
        body: { user_id: user.id }
      });
      if (error) throw error;
      toast.success(`Skan zakończony: ${data?.alerts_found || 0} alertów znaleziono (${data?.duration_ms || 0}ms)`);
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'Błąd skanu');
    } finally {
      setScanning(false);
    }
  };

  const markAsRead = async (alertId: string) => {
    await (supabase as any)
      .from('ksef_monitor_alerts')
      .update({ is_read: true })
      .eq('id', alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  const unreadCritical = alerts.filter(a => a.severity === 'critical').length;
  const unreadWarning = alerts.filter(a => a.severity === 'warning').length;

  if (loading) return <div className="flex items-center justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {config?.last_scan_status === 'error' && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <span className="text-sm font-medium text-destructive">Ostatni skan nie powiódł się. Sprawdź klucz API.</span>
        </div>
      )}

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">Status API KSeF</span>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
              <span className="font-semibold">Online</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">Alerty do przeczytania</span>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{alerts.length}</span>
              {unreadCritical > 0 && <Badge variant="destructive" className="text-xs">{unreadCritical} kryt.</Badge>}
              {unreadWarning > 0 && <Badge className="text-xs bg-amber-500">{unreadWarning} ostrz.</Badge>}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">Ostatni skan</span>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="font-semibold">{formatScanDate(config?.last_scan_at || null)}</span>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">Status skanu</span>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </div>
            <ScanStatusBadge status={config?.last_scan_status || 'never'} />
          </CardContent>
        </Card>
      </div>

      {/* Configuration form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" /> Konfiguracja KSeF Monitor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="alert-email">Email do alertów</Label>
              <Input
                id="alert-email"
                type="email"
                placeholder="admin@twojafirma.pl"
                value={formEmail}
                onChange={e => setFormEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Na ten adres dotrą powiadomienia o zmianach w KSeF</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slack-webhook">Slack Webhook URL</Label>
              <div className="relative">
                <Input
                  id="slack-webhook"
                  type={showSlackKey ? 'text' : 'password'}
                  placeholder="https://hooks.slack.com/services/..."
                  value={formSlack}
                  onChange={e => setFormSlack(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowSlackKey(!showSlackKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSlackKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Opcjonalnie: alerty na kanał Slack</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-4">Opcje skanowania</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Automatyczny monitoring</Label>
                  <p className="text-xs text-muted-foreground">Agent sprawdza strony KSeF codziennie o 06:00</p>
                </div>
                <Switch checked={formScanEnabled} onCheckedChange={setFormScanEnabled} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Powiadamiaj o alertach krytycznych</Label>
                  <p className="text-xs text-muted-foreground">Natychmiastowe powiadomienia o ważnych zmianach</p>
                </div>
                <Switch checked={formNotifyCritical} onCheckedChange={setFormNotifyCritical} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Powiadamiaj o ostrzeżeniach</Label>
                  <p className="text-xs text-muted-foreground">Zmiany wymagające akcji w ciągu 7 dni</p>
                </div>
                <Switch checked={formNotifyWarning} onCheckedChange={setFormNotifyWarning} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Powiadamiaj o informacjach</Label>
                  <p className="text-xs text-muted-foreground">Komunikaty bez wpływu na kod</p>
                </div>
                <Switch checked={formNotifyInfo} onCheckedChange={setFormNotifyInfo} />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
              Zapisz ustawienia
            </Button>
            <Button variant="outline" onClick={handleScan} disabled={scanning || scanCooldown}>
              {scanning ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {scanning ? 'Skanuję...' : scanCooldown ? 'Poczekaj...' : 'Uruchom skan teraz'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Alerts and History tabs */}
      <Tabs defaultValue="alerts">
        <TabsList>
          <TabsTrigger value="alerts" className="gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Aktywne alerty
            {alerts.length > 0 && <Badge variant="destructive" className="ml-1 text-xs">{alerts.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" /> Historia skanów
          </TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="space-y-3 mt-4">
          {alerts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <p className="font-semibold">Brak alertów — wszystko OK 🎉</p>
                <p className="text-sm text-muted-foreground mt-1">System nie wykrył żadnych istotnych zmian w KSeF</p>
              </CardContent>
            </Card>
          ) : (
            alerts.map(alert => (
              <AlertCard key={alert.id} alert={alert} onMarkRead={markAsRead} />
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-3 font-medium">Data</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium">Źródła</th>
                      <th className="text-left p-3 font-medium">Alerty</th>
                      <th className="text-left p-3 font-medium">Czas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scans.length === 0 ? (
                      <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Brak historii skanów</td></tr>
                    ) : (
                      scans.map(scan => (
                        <tr key={scan.id} className="border-b last:border-0">
                          <td className="p-3">{new Date(scan.created_at).toLocaleString('pl-PL')}</td>
                          <td className="p-3">
                            <Badge variant={scan.status === 'ok' ? 'default' : 'destructive'} className={scan.status === 'ok' ? 'bg-green-600' : ''}>
                              {scan.status === 'ok' ? 'OK' : 'Błąd'}
                            </Badge>
                          </td>
                          <td className="p-3">{scan.sources_checked}</td>
                          <td className="p-3">{scan.alerts_found}</td>
                          <td className="p-3">{scan.duration_ms ? `${(scan.duration_ms / 1000).toFixed(1)}s` : '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* KSeF Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" /> Harmonogram terminów KSeF
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium">Data</th>
                  <th className="text-left p-3 font-medium">Zdarzenie</th>
                  <th className="text-left p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {KSEF_MILESTONES.map(m => {
                  const days = daysUntil(m.date);
                  const isPast = days < 0;
                  const isUrgent = !isPast && days <= 30;
                  return (
                    <tr key={m.date} className="border-b last:border-0">
                      <td className="p-3 font-mono">{new Date(m.date).toLocaleDateString('pl-PL')}</td>
                      <td className="p-3">{m.event}</td>
                      <td className="p-3">
                        {isPast ? (
                          <span className="text-green-600 font-medium">✅ Minął</span>
                        ) : isUrgent ? (
                          <span className="text-red-600 font-medium">🔴 Za {days} dni</span>
                        ) : (
                          <span className="text-blue-600 font-medium">🔵 Za {days} dni</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ScanStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'ok': return <Badge className="bg-green-600">OK</Badge>;
    case 'error': return <Badge variant="destructive">Błąd</Badge>;
    case 'running': return <Badge className="bg-amber-500 animate-pulse">Skanowanie...</Badge>;
    default: return <Badge variant="secondary">Nigdy</Badge>;
  }
}

function AlertCard({ alert, onMarkRead }: { alert: KsefAlert; onMarkRead: (id: string) => void }) {
  const borderColor = alert.severity === 'critical' ? 'border-l-red-500 bg-red-50 dark:bg-red-950/20'
    : alert.severity === 'warning' ? 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/20'
    : 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20';

  const severityLabel = alert.severity === 'critical' ? 'KRYTYCZNY'
    : alert.severity === 'warning' ? 'OSTRZEŻENIE' : 'INFO';

  const severityVariant = alert.severity === 'critical' ? 'destructive'
    : alert.severity === 'warning' ? 'default' : 'secondary';

  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={severityVariant as any} className={alert.severity === 'warning' ? 'bg-amber-500' : ''}>
                {severityLabel}
              </Badge>
              <span className="font-semibold">{alert.title}</span>
            </div>
            {alert.description && <p className="text-sm text-muted-foreground">{alert.description}</p>}
            {alert.action_required && (
              <div className="bg-destructive/10 border border-destructive/20 rounded p-2 text-sm text-destructive font-medium">
                → Wymagana akcja: {alert.action_required}
              </div>
            )}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{alert.source}</span>
              {alert.source_url && (
                <a href={alert.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                  Źródło <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <span>{new Date(alert.created_at).toLocaleString('pl-PL')}</span>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onMarkRead(alert.id)}>
            <CheckCircle className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
