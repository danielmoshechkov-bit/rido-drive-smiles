import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { TabsPill } from '@/components/ui/TabsPill';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { UniversalHomeButton } from '@/components/UniversalHomeButton';
import { MyGetRidoButton } from '@/components/MyGetRidoButton';
import { TopBarCredits } from '@/components/TopBarCredits';
import { MessageSquare, Send, RefreshCw, X, Edit, Trash2, Calendar, BarChart3, CheckCircle, AlertCircle, Clock, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

type TabKey = 'sent' | 'scheduled' | 'new' | 'stats';

function toSmsPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 9) return `+48${digits}`;
  if (digits.startsWith('48') && digits.length === 11) return `+${digits}`;
  return raw.startsWith('+') ? raw : `+${digits}`;
}

export default function WorkshopSmsCenter() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [providerId, setProviderId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [tab, setTab] = useState<TabKey>('sent');
  const [editingSms, setEditingSms] = useState<any>(null);

  // New SMS form
  const [newPhone, setNewPhone] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newScheduledAt, setNewScheduledAt] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }
      setUser(user);
      const { data: provider } = await supabase
        .from('service_providers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (provider) setProviderId(provider.id);
    })();
  }, []);

  // Sent SMS (status = sent OR failed)
  const { data: sentSms = [] } = useQuery({
    queryKey: ['workshop-sms', providerId, 'sent'],
    enabled: !!providerId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('workshop_sms_log')
        .select('*')
        .eq('provider_id', providerId)
        .in('status', ['sent', 'failed'])
        .order('created_at', { ascending: false })
        .limit(200);
      return data || [];
    },
  });

  // Scheduled SMS (booking reminders + manual scheduled)
  const { data: scheduledSms = [] } = useQuery({
    queryKey: ['workshop-sms', providerId, 'scheduled'],
    enabled: !!providerId,
    queryFn: async () => {
      // From workshop_sms_log
      const { data: manual } = await (supabase as any)
        .from('workshop_sms_log')
        .select('*')
        .eq('provider_id', providerId)
        .eq('status', 'scheduled')
        .order('scheduled_at', { ascending: true });
      // From booking_appointments (reminders for upcoming bookings)
      const { data: bookings } = await (supabase as any)
        .from('booking_appointments')
        .select('id, start_time, customer_phone, customer_name, service_name')
        .eq('provider_id', providerId)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true })
        .limit(50);
      const reminders = (bookings || []).map((b: any) => ({
        id: `reminder-${b.id}`,
        appointment_id: b.id,
        phone: b.customer_phone || '',
        message: `Przypomnienie: wizyta ${format(new Date(b.start_time), 'dd.MM.yyyy HH:mm', { locale: pl })} - ${b.service_name || ''}`,
        sms_type: 'reminder',
        status: 'scheduled',
        scheduled_at: new Date(new Date(b.start_time).getTime() - 24 * 3600 * 1000).toISOString(),
        _is_reminder: true,
        _booking: b,
      }));
      return [...(manual || []), ...reminders].sort((a: any, b: any) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      );
    },
  });

  const stats = useMemo(() => {
    const total = sentSms.length;
    const sent = sentSms.filter((s: any) => s.status === 'sent').length;
    const failed = sentSms.filter((s: any) => s.status === 'failed').length;
    const scheduled = scheduledSms.length;
    const totalParts = sentSms.reduce((sum: number, s: any) => sum + (s.parts_count || 1), 0);
    const byType: Record<string, number> = {};
    sentSms.forEach((s: any) => { byType[s.sms_type || 'inne'] = (byType[s.sms_type || 'inne'] || 0) + 1; });
    return { total, sent, failed, scheduled, totalParts, byType };
  }, [sentSms, scheduledSms]);

  const handleResend = async (sms: any) => {
    try {
      const { error } = await supabase.functions.invoke('workshop-send-sms', {
        body: { phone: toSmsPhone(sms.phone), message: sms.message, sms_type: sms.sms_type, provider_id: providerId, order_id: sms.order_id },
      });
      if (error) throw error;
      toast.success('SMS wysłany ponownie');
      qc.invalidateQueries({ queryKey: ['workshop-sms'] });
    } catch (e: any) {
      toast.error('Błąd: ' + e.message);
    }
  };

  const handleCancelScheduled = async (sms: any) => {
    if (sms._is_reminder) {
      toast.info('Aby anulować przypomnienie, usuń lub edytuj rezerwację');
      return;
    }
    try {
      await (supabase as any).from('workshop_sms_log').update({ status: 'cancelled' }).eq('id', sms.id);
      toast.success('SMS anulowany');
      qc.invalidateQueries({ queryKey: ['workshop-sms'] });
    } catch (e: any) {
      toast.error('Błąd: ' + e.message);
    }
  };

  const handleDeleteScheduled = async (sms: any) => {
    if (sms._is_reminder) return;
    if (!confirm('Usunąć zaplanowany SMS?')) return;
    try {
      await (supabase as any).from('workshop_sms_log').delete().eq('id', sms.id);
      toast.success('Usunięto');
      qc.invalidateQueries({ queryKey: ['workshop-sms'] });
    } catch (e: any) {
      toast.error('Błąd: ' + e.message);
    }
  };

  const handleSendNew = async () => {
    if (!newPhone || !newMessage || !providerId) {
      toast.error('Uzupełnij telefon i wiadomość');
      return;
    }
    setSending(true);
    try {
      const phoneFormatted = toSmsPhone(newPhone);
      if (newScheduledAt) {
        // Schedule it
        const { error } = await (supabase as any).from('workshop_sms_log').insert({
          provider_id: providerId,
          phone: phoneFormatted,
          message: newMessage,
          sms_type: 'manual',
          status: 'scheduled',
          scheduled_at: new Date(newScheduledAt).toISOString(),
          parts_count: Math.ceil(newMessage.length / 160),
        });
        if (error) throw error;
        toast.success('SMS zaplanowany');
      } else {
        const { error } = await supabase.functions.invoke('workshop-send-sms', {
          body: { phone: phoneFormatted, message: newMessage, sms_type: 'manual', provider_id: providerId },
        });
        if (error) throw error;
        // Log in our table
        await (supabase as any).from('workshop_sms_log').insert({
          provider_id: providerId,
          phone: phoneFormatted,
          message: newMessage,
          sms_type: 'manual',
          status: 'sent',
          sent_at: new Date().toISOString(),
          parts_count: Math.ceil(newMessage.length / 160),
        });
        toast.success('SMS wysłany');
      }
      setNewPhone(''); setNewMessage(''); setNewScheduledAt('');
      qc.invalidateQueries({ queryKey: ['workshop-sms'] });
      setTab(newScheduledAt ? 'scheduled' : 'sent');
    } catch (e: any) {
      toast.error('Błąd: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingSms) return;
    try {
      await (supabase as any).from('workshop_sms_log').update({
        phone: editingSms.phone,
        message: editingSms.message,
        scheduled_at: editingSms.scheduled_at,
      }).eq('id', editingSms.id);
      toast.success('Zaktualizowano');
      setEditingSms(null);
      qc.invalidateQueries({ queryKey: ['workshop-sms'] });
    } catch (e: any) {
      toast.error('Błąd: ' + e.message);
    }
  };

  const smsCount = Math.ceil(newMessage.length / 160);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/uslugi/panel')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Wróć
          </Button>
          <h1 className="font-bold text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" /> Centrum SMS
          </h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="sent">
              <CheckCircle className="h-4 w-4 mr-1" /> Wysłane <Badge variant="secondary" className="ml-2">{sentSms.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="scheduled">
              <Clock className="h-4 w-4 mr-1" /> Zaplanowane <Badge variant="secondary" className="ml-2">{scheduledSms.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="new"><Plus className="h-4 w-4 mr-1" /> Nowy SMS</TabsTrigger>
            <TabsTrigger value="stats"><BarChart3 className="h-4 w-4 mr-1" /> Statystyki</TabsTrigger>
          </TabsList>

          {/* Sent */}
          <TabsContent value="sent" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Telefon</TableHead>
                      <TableHead>Treść</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Akcje</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sentSms.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Brak wysłanych SMS</TableCell></TableRow>
                    ) : sentSms.map((sms: any) => (
                      <TableRow key={sms.id}>
                        <TableCell>
                          {sms.status === 'sent' ? <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Wysłany</Badge>
                            : <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Błąd</Badge>}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(sms.sent_at || sms.created_at), 'dd.MM.yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{sms.phone}</TableCell>
                        <TableCell className="max-w-md text-sm">
                          <div className="truncate">{sms.message}</div>
                          {sms.error_message && <div className="text-xs text-destructive">{sms.error_message}</div>}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{sms.sms_type || 'inne'}</Badge></TableCell>
                        <TableCell>
                          {sms.status === 'failed' && (
                            <Button size="sm" variant="outline" onClick={() => handleResend(sms)}>
                              <RefreshCw className="h-3 w-3 mr-1" /> Ponów
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Scheduled */}
          <TabsContent value="scheduled" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zaplanowano na</TableHead>
                      <TableHead>Telefon</TableHead>
                      <TableHead>Treść</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Powiązane</TableHead>
                      <TableHead>Akcje</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheduledSms.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Brak zaplanowanych SMS</TableCell></TableRow>
                    ) : scheduledSms.map((sms: any) => (
                      <TableRow key={sms.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          <Calendar className="h-3 w-3 inline mr-1" />
                          {format(new Date(sms.scheduled_at), 'dd.MM.yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{sms.phone}</TableCell>
                        <TableCell className="max-w-md text-sm truncate">{sms.message}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{sms.sms_type || 'inne'}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {sms._booking ? `Rezerwacja: ${sms._booking.customer_name || ''}` : sms.order_id ? 'Zlecenie' : '—'}
                        </TableCell>
                        <TableCell className="flex gap-1">
                          {!sms._is_reminder && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setEditingSms({ ...sms })}>
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleCancelScheduled(sms)}>
                                <X className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleDeleteScheduled(sms)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {sms._is_reminder && (
                            <Badge variant="secondary" className="text-xs">Przypomnienie auto</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* New SMS */}
          <TabsContent value="new" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Nowy SMS</CardTitle></CardHeader>
              <CardContent className="space-y-4 max-w-2xl">
                <div className="space-y-2">
                  <Label>Numer telefonu</Label>
                  <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+48 500 000 000" />
                </div>
                <div className="space-y-2">
                  <Label>Treść wiadomości</Label>
                  <Textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} rows={6} placeholder="Treść SMS..." />
                  <div className="text-xs text-muted-foreground">
                    Znaków: {newMessage.length} · Liczba SMS: {smsCount}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Zaplanuj wysyłkę (opcjonalnie)</Label>
                  <Input type="datetime-local" value={newScheduledAt} onChange={(e) => setNewScheduledAt(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Pozostaw puste, aby wysłać natychmiast</p>
                </div>
                <Button onClick={handleSendNew} disabled={sending} className="gap-2">
                  <Send className="h-4 w-4" /> {sending ? 'Wysyłanie...' : (newScheduledAt ? 'Zaplanuj SMS' : 'Wyślij SMS')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stats */}
          <TabsContent value="stats" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card><CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Wysłane łącznie</div>
                <div className="text-3xl font-bold">{stats.sent}</div>
              </CardContent></Card>
              <Card><CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Nieudane</div>
                <div className="text-3xl font-bold text-destructive">{stats.failed}</div>
              </CardContent></Card>
              <Card><CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Zaplanowane</div>
                <div className="text-3xl font-bold text-primary">{stats.scheduled}</div>
              </CardContent></Card>
              <Card><CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Zużyte części SMS</div>
                <div className="text-3xl font-bold">{stats.totalParts}</div>
              </CardContent></Card>
            </div>

            <Card className="mt-4">
              <CardHeader><CardTitle>Według typu</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(stats.byType).map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b pb-2">
                      <span className="capitalize">{k}</span>
                      <Badge>{v}</Badge>
                    </div>
                  ))}
                  {Object.keys(stats.byType).length === 0 && (
                    <p className="text-muted-foreground">Brak danych</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Edit dialog */}
      {editingSms && (
        <Dialog open={!!editingSms} onOpenChange={(v) => !v && setEditingSms(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edytuj zaplanowany SMS</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Telefon</Label>
                <Input value={editingSms.phone} onChange={(e) => setEditingSms({ ...editingSms, phone: e.target.value })} />
              </div>
              <div>
                <Label>Treść</Label>
                <Textarea value={editingSms.message} rows={6} onChange={(e) => setEditingSms({ ...editingSms, message: e.target.value })} />
              </div>
              <div>
                <Label>Zaplanowano na</Label>
                <Input
                  type="datetime-local"
                  value={editingSms.scheduled_at ? format(new Date(editingSms.scheduled_at), "yyyy-MM-dd'T'HH:mm") : ''}
                  onChange={(e) => setEditingSms({ ...editingSms, scheduled_at: new Date(e.target.value).toISOString() })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingSms(null)}>Anuluj</Button>
              <Button onClick={handleSaveEdit}>Zapisz</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
