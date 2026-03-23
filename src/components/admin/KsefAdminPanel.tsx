import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Shield, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Clock, Building2, Loader2, Users, Mail, Plus, Trash2
} from 'lucide-react';

// ── Stats Cards ──
function KsefStatsCards({ companies }: { companies: any[] }) {
  const connected = companies.filter((c: any) => c.ksef_status === 'connected').length;
  const errors = companies.filter((c: any) => c.ksef_status === 'error').length;
  const notConfigured = companies.filter((c: any) => c.ksef_status === 'not_configured').length;

  const stats = [
    { icon: Users, color: 'text-primary', value: companies.length, label: 'Zarejestrowanych firm' },
    { icon: CheckCircle2, color: 'text-green-500', value: connected, label: 'Połączonych z KSeF' },
    { icon: XCircle, color: 'text-red-500', value: errors, label: 'Błędy połączenia' },
    { icon: Clock, color: 'text-muted-foreground', value: notConfigured, label: 'Nieskonfigurowanych' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {stats.map((s, i) => (
        <Card key={i}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <s.icon className={`h-8 w-8 ${s.color}`} />
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Companies Table ──
function KsefCompaniesTable({ companies }: { companies: any[] }) {
  const statusBadge = (status: string) => {
    switch (status) {
      case 'connected': return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> OK</Badge>;
      case 'error': return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Błąd</Badge>;
      default: return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Brak</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Firmy i status KSeF</CardTitle>
        <CardDescription>Wszystkie firmy zarejestrowane w systemie</CardDescription>
      </CardHeader>
      <CardContent>
        {companies.length > 0 ? (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Firma</TableHead>
                  <TableHead>NIP</TableHead>
                  <TableHead>Środowisko</TableHead>
                  <TableHead>Status KSeF</TableHead>
                  <TableHead>Ostatni test</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.company_name || '—'}</TableCell>
                    <TableCell className="font-mono text-sm">{c.nip || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.ksef_environment === 'production' ? '🏭 Produkcja' : '🧪 Test'}</Badge>
                    </TableCell>
                    <TableCell>{statusBadge(c.ksef_status || 'not_configured')}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.ksef_last_test_at ? new Date(c.ksef_last_test_at).toLocaleString('pl-PL') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">Brak firm — użytkownicy muszą najpierw uzupełnić dane w swoim panelu</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Email Notifications ──
function KsefNotificationEmails() {
  const queryClient = useQueryClient();
  const [newEmail, setNewEmail] = useState('');

  const { data: config } = useQuery({
    queryKey: ['admin-ksef-monitor-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ksef_monitor_config' as any)
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error && !error.message.includes('does not exist')) throw error;
      return data as any;
    },
  });

  const emails: string[] = config?.alert_emails || (config?.alert_email ? [config.alert_email] : []);

  const updateEmails = useMutation({
    mutationFn: async (updatedEmails: string[]) => {
      if (config?.id) {
        await supabase.from('ksef_monitor_config' as any).update({ alert_email: updatedEmails[0] || null } as any).eq('id', config.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ksef-monitor-config'] });
      toast.success('Lista emaili zaktualizowana');
    },
  });

  const addEmail = () => {
    if (!newEmail.trim() || !newEmail.includes('@')) return;
    const updated = [...emails, newEmail.trim()];
    updateEmails.mutate(updated);
    setNewEmail('');
  };

  const removeEmail = (idx: number) => {
    const updated = emails.filter((_, i) => i !== idx);
    updateEmails.mutate(updated);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Powiadomienia email</CardTitle>
        <CardDescription>Adresy email na które system wyśle alerty o zmianach w KSeF</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {emails.length > 0 && (
          <div className="space-y-2">
            {emails.map((email, i) => (
              <div key={i} className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm flex-1">{email}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeEmail(i)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="admin@firma.pl"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addEmail()}
          />
          <Button variant="outline" onClick={addEmail} disabled={!newEmail.includes('@')}>
            <Plus className="h-4 w-4 mr-1" /> Dodaj
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Monitor Panel ──
function KsefMonitorPanel() {
  const queryClient = useQueryClient();

  const { data: alerts } = useQuery({
    queryKey: ['admin-ksef-monitor-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ksef_monitor_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: logs, isLoading: loadingLogs } = useQuery({
    queryKey: ['admin-ksef-monitor-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ksef_monitor_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
  });

  const handleRunMonitor = async () => {
    try {
      const { error } = await supabase.functions.invoke('ksef-monitor');
      if (error) throw error;
      toast.success('Skanowanie KSeF uruchomione');
      queryClient.invalidateQueries({ queryKey: ['admin-ksef-monitor-log'] });
      queryClient.invalidateQueries({ queryKey: ['admin-ksef-monitor-alerts'] });
    } catch {
      toast.error('Nie udało się uruchomić skanowania');
    }
  };

  const severityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Krytyczny</Badge>;
      case 'warning': return <Badge className="bg-yellow-500">Ostrzeżenie</Badge>;
      default: return <Badge variant="secondary">Info</Badge>;
    }
  };

  const logStatusIcon = (status: string) => {
    switch (status) {
      case 'ok': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Monitor API KSeF</CardTitle>
        <CardDescription>Agent AI monitorujący zmiany w Krajowym Systemie e-Faktur</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={handleRunMonitor} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" /> Uruchom skanowanie teraz
          </Button>
          <span className="text-sm text-muted-foreground">
            Agent sprawdza codziennie: komunikaty techniczne MF, harmonogram wdrożenia, dokumentację API
          </span>
        </div>

        {/* Alerty */}
        {alerts && alerts.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Ostatnie alerty</p>
            {alerts.map((alert: any) => (
              <div key={alert.id} className={`border-l-4 p-3 rounded-r-md bg-muted/50 ${
                alert.severity === 'critical' ? 'border-l-destructive' : alert.severity === 'warning' ? 'border-l-yellow-500' : 'border-l-blue-500'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  {severityBadge(alert.severity)}
                  <span className="font-medium text-sm">{alert.title}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(alert.created_at).toLocaleString('pl-PL')}</span>
                </div>
                <p className="text-sm text-muted-foreground">{alert.description}</p>
                {alert.action_required && <p className="text-sm text-destructive mt-1">→ {alert.action_required}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Logi */}
        <p className="text-sm font-medium pt-2">Logi skanowania</p>
        {logs && logs.length > 0 ? (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">Status</TableHead>
                  <TableHead>Źródło</TableHead>
                  <TableHead>Wiadomość</TableHead>
                  <TableHead className="w-40">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell>{logStatusIcon(log.status)}</TableCell>
                    <TableCell className="text-xs">{log.source || '—'}</TableCell>
                    <TableCell className="text-sm">{log.message || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString('pl-PL')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">Brak logów — uruchom skanowanie</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Panel ──
export function KsefAdminPanel() {
  const { data: companies, isLoading } = useQuery({
    queryKey: ['admin-all-company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <KsefStatsCards companies={companies || []} />
      <KsefCompaniesTable companies={companies || []} />
      <Separator />
      <KsefNotificationEmails />
      <KsefMonitorPanel />
    </div>
  );
}
