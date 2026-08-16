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
import { Checkbox } from '@/components/ui/checkbox';
import { TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { TabsPill } from '@/components/ui/TabsPill';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { UniversalHomeButton } from '@/components/UniversalHomeButton';
import { MyGetRidoButton } from '@/components/MyGetRidoButton';
import { TopBarCredits } from '@/components/TopBarCredits';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { sprawdzTrescSms } from '@/lib/smsModeration';
import { MessageSquare, Send, RefreshCw, X, Edit, Trash2, Calendar, BarChart3, CheckCircle, AlertCircle, AlertTriangle, Clock, Plus, Eye, ChevronLeft, ChevronRight, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

type TabKey = 'sent' | 'scheduled' | 'new' | 'stats';

const NA_STRONE = 25;

function toSmsPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 9) return `+48${digits}`;
  if (digits.startsWith('48') && digits.length === 11) return `+${digits}`;
  return raw.startsWith('+') ? raw : `+${digits}`;
}

/** '2026-08' → 'sierpień 2026' */
const nazwaMiesiaca = (m: string) => {
  const [rok, mies] = m.split('-').map(Number);
  return format(new Date(rok, (mies || 1) - 1, 1), 'LLLL yyyy', { locale: pl });
};

/** Zakres dat miesiąca do zapytania (od pierwszego do pierwszego następnego). */
const zakresMiesiaca = (m: string) => {
  const [rok, mies] = m.split('-').map(Number);
  const od = new Date(Date.UTC(rok, (mies || 1) - 1, 1));
  const doDaty = new Date(Date.UTC(rok, mies || 1, 1));
  return { od: od.toISOString(), do: doDaty.toISOString() };
};

export default function WorkshopSmsCenter() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirmAction = useConfirm();
  const [providerId, setProviderId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [tab, setTab] = useState<TabKey>('sent');
  const [editingSms, setEditingSms] = useState<any>(null);
  const [podglad, setPodglad] = useState<any>(null);

  // Wysłane: wybrany miesiąc i strona w obrębie miesiąca.
  const [miesiac, setMiesiac] = useState<string | null>(null);
  const [strona, setStrona] = useState(0);

  // Zaplanowane: zaznaczenie do działań zbiorczych.
  const [zaznaczone, setZaznaczone] = useState<Set<string>>(new Set());

  // Nowy SMS
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
        // Konto może mieć więcej niż jeden warsztat (plan Sieci). `maybeSingle`
        // zwraca wtedy BŁĄD, nie pierwszy wiersz — ekran się wywala. Bierzemy
        // najstarszy i tak samo we wszystkich miejscach, żeby różne ekrany
        // nie pokazywały różnych firm.
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (provider) setProviderId(provider.id);
    })();
  }, []);

  // MIESIĄCE + LICZNIKI — z bazy, bo tylko ona zna pełny zbiór.
  // Wcześniej ekran wczytywał 200 ostatnich wiadomości i z nich liczył
  // „wysłane łącznie": przy 403 SMS-ach w historii pokazywał 200.
  const { data: miesiace = [] } = useQuery({
    queryKey: ['workshop-sms-miesiace', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('workshop_sms_miesiace', { p_provider: providerId });
      if (error) throw error;
      return (data || []) as Array<{ miesiac: string; wyslane: number; nieudane: number; czesci: number }>;
    },
  });

  useEffect(() => {
    if (!miesiac && miesiace.length) setMiesiac(miesiace[0].miesiac);
  }, [miesiace, miesiac]);

  // Wysłane w wybranym miesiącu, stronami.
  const { data: wyslaneStrona } = useQuery({
    queryKey: ['workshop-sms', providerId, 'sent', miesiac, strona],
    enabled: !!providerId && !!miesiac,
    queryFn: async () => {
      const { od, do: doDaty } = zakresMiesiaca(miesiac!);
      const { data, count } = await (supabase as any)
        .from('workshop_sms_log')
        .select('*', { count: 'exact' })
        .eq('provider_id', providerId)
        .in('status', ['sent', 'failed'])
        .gte('created_at', od)
        .lt('created_at', doDaty)
        .order('created_at', { ascending: false })
        .range(strona * NA_STRONE, strona * NA_STRONE + NA_STRONE - 1);
      return { wiersze: data || [], razem: count || 0 };
    },
  });
  const sentSms = wyslaneStrona?.wiersze || [];
  const razemWMiesiacu = wyslaneStrona?.razem || 0;
  const stron = Math.max(1, Math.ceil(razemWMiesiacu / NA_STRONE));

  // Scheduled SMS — z workshop_sms_log + auto-przypomnienia z workshop_client_bookings
  const { data: scheduledSms = [] } = useQuery({
    queryKey: ['workshop-sms', providerId, 'scheduled'],
    enabled: !!providerId,
    queryFn: async () => {
      const { data: manual } = await (supabase as any)
        .from('workshop_sms_log')
        .select('*')
        .eq('provider_id', providerId)
        .eq('status', 'scheduled')
        .order('scheduled_at', { ascending: true });

      // Auto-przypomnienia z aktywnych rezerwacji warsztatu
      const { data: bookings } = await (supabase as any)
        .from('workshop_client_bookings')
        .select('id, appointment_date, appointment_time, phone, first_name, last_name, service_description, plate, brand, model, reminder_times, reminder_enabled, status')
        .eq('provider_id', providerId)
        .eq('reminder_enabled', true)
        .in('status', ['scheduled', 'confirmed'])
        .gte('appointment_date', new Date().toISOString().slice(0, 10))
        .order('appointment_date', { ascending: true })
        .limit(200);

      const reminders: any[] = [];
      (bookings || []).forEach((b: any) => {
        const apptAt = new Date(`${b.appointment_date}T${b.appointment_time || '08:00:00'}`);
        const times: string[] = Array.isArray(b.reminder_times) ? b.reminder_times : [];
        times.forEach((t: string) => {
          const m = String(t).match(/^(\d+)h$/i);
          if (!m) return;
          const hoursBefore = parseInt(m[1], 10);
          const sendAt = new Date(apptAt.getTime() - hoursBefore * 3600 * 1000);
          if (sendAt.getTime() < Date.now() - 60 * 60 * 1000) return; // pomiń mocno przeterminowane
          const name = `${b.first_name || ''} ${b.last_name || ''}`.trim() || 'klient';
          const car = [b.brand, b.model, b.plate].filter(Boolean).join(' ');
          reminders.push({
            id: `reminder-${b.id}-${t}`,
            appointment_id: b.id,
            phone: b.phone || '',
            message: `Przypomnienie (${t} przed): wizyta ${format(apptAt, 'dd.MM.yyyy HH:mm', { locale: pl })}${car ? ` — ${car}` : ''}${b.service_description ? `. Usługa: ${b.service_description}` : ''}`,
            sms_type: `reminder_${t}`,
            status: 'scheduled',
            scheduled_at: sendAt.toISOString(),
            _is_reminder: true,
            _lead: t,
            _booking: { ...b, customer_name: name },
          });
        });
      });

      return [...(manual || []), ...reminders].sort((a: any, b: any) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      );
    },
  });

  const podsumowanie = useMemo(() => {
    const wyslane = miesiace.reduce((s, m) => s + Number(m.wyslane || 0), 0);
    const nieudane = miesiace.reduce((s, m) => s + Number(m.nieudane || 0), 0);
    const czesci = miesiace.reduce((s, m) => s + Number(m.czesci || 0), 0);
    return { wyslane, nieudane, czesci, miesiecy: miesiace.length };
  }, [miesiace]);

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

  // ── Działania na zaplanowanych ────────────────────────────────────────
  const przelaczZaznaczenie = (id: string) => {
    setZaznaczone(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const wybrane = scheduledSms.filter((s: any) => zaznaczone.has(s.id));
  const wybraneWlasne = wybrane.filter((s: any) => !s._is_reminder);
  const wybranePrzypomnienia = wybrane.filter((s: any) => s._is_reminder);

  /** Wyłączenie auto-przypomnienia = zdjęcie tego wyprzedzenia z rezerwacji. */
  const wylaczPrzypomnienie = async (sms: any) => {
    const b = sms._booking;
    const pozostale = (Array.isArray(b?.reminder_times) ? b.reminder_times : []).filter((t: string) => t !== sms._lead);
    await (supabase as any).from('workshop_client_bookings').update({
      reminder_times: pozostale,
      reminder_enabled: pozostale.length > 0,
    }).eq('id', b.id);
  };

  const anulujZaznaczone = async () => {
    if (!wybrane.length) return;
    const opis = [
      wybraneWlasne.length ? `${wybraneWlasne.length} własnych` : '',
      wybranePrzypomnienia.length ? `${wybranePrzypomnienia.length} automatycznych przypomnień` : '',
    ].filter(Boolean).join(' i ');
    const zgoda = await confirmAction({
      title: `Anulować wysyłkę: ${opis}?`,
      description: 'Wiadomości nie zostaną wysłane. Automatyczne przypomnienia znikną z rezerwacji — samą wizytę to zostawia bez zmian.',
      confirmLabel: 'Anuluj wysyłkę',
    });
    if (!zgoda) return;
    try {
      if (wybraneWlasne.length) {
        await (supabase as any).from('workshop_sms_log')
          .update({ status: 'cancelled' })
          .in('id', wybraneWlasne.map((s: any) => s.id));
      }
      for (const s of wybranePrzypomnienia) await wylaczPrzypomnienie(s);
      setZaznaczone(new Set());
      toast.success(`Anulowano: ${opis}`);
      qc.invalidateQueries({ queryKey: ['workshop-sms'] });
    } catch (e: any) {
      toast.error('Błąd: ' + e.message);
    }
  };

  const usunZaznaczone = async () => {
    if (!wybraneWlasne.length) return;
    const zgoda = await confirmAction({
      title: `Usunąć ${wybraneWlasne.length} zaplanowanych SMS-ów?`,
      description: 'Znikną z listy bez śladu. Automatycznych przypomnień to nie dotyczy — te wyłącza się przyciskiem obok.',
    });
    if (!zgoda) return;
    try {
      await (supabase as any).from('workshop_sms_log').delete().in('id', wybraneWlasne.map((s: any) => s.id));
      setZaznaczone(new Set());
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
    // Kontrola treści także tutaj, mimo blokady na serwerze: chodzi o to, żeby
    // powiedzieć wprost, CO jest nie tak, zamiast pokazać surowy błąd z API.
    const ocena = sprawdzTrescSms(newMessage);
    if (!ocena.dozwolone) {
      toast.error(ocena.komunikat || 'Treść zablokowana');
      return;
    }
    setSending(true);
    try {
      const phoneFormatted = toSmsPhone(newPhone);
      if (newScheduledAt) {
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
      qc.invalidateQueries({ queryKey: ['workshop-sms-miesiace'] });
      setTab(newScheduledAt ? 'scheduled' : 'sent');
    } catch (e: any) {
      toast.error('Błąd: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingSms) return;
    const ocena = sprawdzTrescSms(editingSms.message || '');
    if (!ocena.dozwolone) { toast.error(ocena.komunikat || 'Treść zablokowana'); return; }
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
  const ocenaNowego = newMessage.trim() ? sprawdzTrescSms(newMessage) : { dozwolone: true } as ReturnType<typeof sprawdzTrescSms>;

  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b shadow-sm flex-shrink-0">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <UniversalHomeButton />
            <div className="hidden sm:block">
              <h1 className="font-semibold text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" /> Centrum SMS
              </h1>
              <p className="text-xs text-muted-foreground">Wysłane, zaplanowane i nowe wiadomości warsztatu</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/uslugi/panel')}>← Panel</Button>
            <TopBarCredits />
            <MyGetRidoButton user={user} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <TabsPill value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsTrigger value="sent">
            <CheckCircle className="h-4 w-4 mr-1" /> Wysłane <Badge variant="secondary" className="ml-2">{podsumowanie.wyslane}</Badge>
          </TabsTrigger>
          <TabsTrigger value="scheduled">
            <Clock className="h-4 w-4 mr-1" /> Zaplanowane <Badge variant="secondary" className="ml-2">{scheduledSms.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="new"><Plus className="h-4 w-4 mr-1" /> Nowy SMS</TabsTrigger>
          <TabsTrigger value="stats"><BarChart3 className="h-4 w-4 mr-1" /> Statystyki</TabsTrigger>

          {/* ── WYSŁANE: miesiąc → strona → podgląd całej treści ── */}
          <TabsContent value="sent" className="mt-4 space-y-3">
            {miesiace.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {miesiace.map((m) => (
                  <Button
                    key={m.miesiac}
                    size="sm"
                    variant={m.miesiac === miesiac ? 'default' : 'outline'}
                    onClick={() => { setMiesiac(m.miesiac); setStrona(0); }}
                    className="capitalize"
                  >
                    {nazwaMiesiaca(m.miesiac)}
                    <Badge variant="secondary" className="ml-2">{Number(m.wyslane) + Number(m.nieudane)}</Badge>
                  </Button>
                ))}
              </div>
            )}

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
                      <TableHead className="text-right">Akcje</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sentSms.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Brak wysłanych SMS w tym miesiącu</TableCell></TableRow>
                    ) : sentSms.map((sms: any) => (
                      <TableRow key={sms.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setPodglad(sms)}>
                        <TableCell>
                          {sms.status === 'sent' ? <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Wysłany</Badge>
                            : <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Błąd</Badge>}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(sms.sent_at || sms.created_at), 'dd.MM.yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="font-mono text-sm whitespace-nowrap">{sms.phone}</TableCell>
                        <TableCell className="max-w-md text-sm">
                          <div className="line-clamp-2">{sms.message}</div>
                          {sms.error_message && <div className="text-xs text-destructive">{sms.error_message}</div>}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{sms.sms_type || 'inne'}</Badge></TableCell>
                        <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" onClick={() => setPodglad(sms)} title="Pokaż całą treść">
                            <Eye className="h-4 w-4" />
                          </Button>
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

            {stron > 1 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Strona {strona + 1} z {stron} · {razemWMiesiacu} wiadomości w tym miesiącu
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={strona === 0} onClick={() => setStrona(s => s - 1)}>
                    <ChevronLeft className="h-4 w-4" /> Poprzednia
                  </Button>
                  <Button size="sm" variant="outline" disabled={strona + 1 >= stron} onClick={() => setStrona(s => s + 1)}>
                    Następna <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── ZAPLANOWANE: zaznaczanie i działania zbiorcze ── */}
          <TabsContent value="scheduled" className="mt-4 space-y-3">
            {zaznaczone.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-muted/40 px-3 py-2">
                <span className="text-sm">Zaznaczono: {zaznaczone.size}</span>
                <Button size="sm" variant="outline" onClick={anulujZaznaczone}>
                  <X className="h-4 w-4 mr-1" /> Anuluj wysyłkę
                </Button>
                {wybraneWlasne.length > 0 && (
                  <Button size="sm" variant="outline" className="text-destructive" onClick={usunZaznaczone}>
                    <Trash2 className="h-4 w-4 mr-1" /> Usuń ({wybraneWlasne.length})
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setZaznaczone(new Set())}>Odznacz</Button>
              </div>
            )}

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={scheduledSms.length > 0 && zaznaczone.size === scheduledSms.length}
                          onCheckedChange={(v) => setZaznaczone(v ? new Set(scheduledSms.map((s: any) => s.id)) : new Set())}
                          aria-label="Zaznacz wszystkie"
                        />
                      </TableHead>
                      <TableHead>Zaplanowano na</TableHead>
                      <TableHead>Telefon</TableHead>
                      <TableHead>Treść</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Powiązane</TableHead>
                      <TableHead className="text-right">Akcje</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheduledSms.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Brak zaplanowanych SMS</TableCell></TableRow>
                    ) : scheduledSms.map((sms: any) => (
                      <TableRow key={sms.id} className={zaznaczone.has(sms.id) ? 'bg-primary/5' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={zaznaczone.has(sms.id)}
                            onCheckedChange={() => przelaczZaznaczenie(sms.id)}
                            aria-label="Zaznacz"
                          />
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          <Calendar className="h-3 w-3 inline mr-1" />
                          {format(new Date(sms.scheduled_at), 'dd.MM.yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="font-mono text-sm whitespace-nowrap">{sms.phone}</TableCell>
                        <TableCell className="max-w-md text-sm">
                          <div className="line-clamp-2">{sms.message}</div>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{sms.sms_type || 'inne'}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {sms._booking ? `Rezerwacja: ${sms._booking.customer_name || ''}` : sms.order_id ? 'Zlecenie' : '—'}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => setPodglad(sms)} title="Pokaż całą treść">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {!sms._is_reminder ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setEditingSms({ ...sms })} title="Edytuj">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm" variant="ghost" className="text-destructive" title="Usuń"
                                onClick={async () => {
                                  if (!(await confirmAction({ title: 'Usunąć zaplanowany SMS?', description: 'Nie zostanie wysłany.' }))) return;
                                  await (supabase as any).from('workshop_sms_log').delete().eq('id', sms.id);
                                  toast.success('Usunięto');
                                  qc.invalidateQueries({ queryKey: ['workshop-sms'] });
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm" variant="ghost" title="Wyłącz to przypomnienie przy rezerwacji"
                              onClick={async () => {
                                if (!(await confirmAction({
                                  title: 'Wyłączyć to przypomnienie?',
                                  description: 'Zniknie z rezerwacji. Sama wizyta zostaje bez zmian.',
                                  confirmLabel: 'Wyłącz',
                                }))) return;
                                await wylaczPrzypomnienie(sms);
                                toast.success('Przypomnienie wyłączone');
                                qc.invalidateQueries({ queryKey: ['workshop-sms'] });
                              }}
                            >
                              <BellOff className="h-4 w-4" />
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

          {/* ── NOWY SMS ── */}
          <TabsContent value="new" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Nowy SMS</CardTitle></CardHeader>
              <CardContent className="space-y-4 max-w-2xl">
                <div className="space-y-2">
                  <Label>Numer telefonu</Label>
                  <Input onFocus={e => e.currentTarget.select()} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+48 500 000 000" />
                </div>
                <div className="space-y-2">
                  <Label>Treść wiadomości</Label>
                  <Textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} rows={6} placeholder="Treść SMS..." />
                  <div className="text-xs text-muted-foreground">
                    Znaków: {newMessage.length} · Liczba SMS: {smsCount}
                  </div>
                  {!ocenaNowego.dozwolone && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{ocenaNowego.komunikat}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Zaplanuj wysyłkę (opcjonalnie)</Label>
                  <Input type="datetime-local" value={newScheduledAt} onChange={(e) => setNewScheduledAt(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Pozostaw puste, aby wysłać natychmiast</p>
                </div>
                <Button onClick={handleSendNew} disabled={sending || !ocenaNowego.dozwolone} className="gap-2">
                  <Send className="h-4 w-4" /> {sending ? 'Wysyłanie...' : (newScheduledAt ? 'Zaplanuj SMS' : 'Wyślij SMS')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── STATYSTYKI: liczby z CAŁEJ historii, miesiąc po miesiącu ── */}
          <TabsContent value="stats" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Wysłane (cała historia)</div>
                <div className="text-3xl font-bold">{podsumowanie.wyslane}</div>
              </CardContent></Card>
              <Card><CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Nieudane</div>
                <div className="text-3xl font-bold text-destructive">{podsumowanie.nieudane}</div>
              </CardContent></Card>
              <Card><CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Zaplanowane</div>
                <div className="text-3xl font-bold text-primary">{scheduledSms.length}</div>
              </CardContent></Card>
              <Card><CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Zużyte części SMS</div>
                <div className="text-3xl font-bold">{podsumowanie.czesci}</div>
                <p className="text-[11px] text-muted-foreground mt-1">Tyle schodzi z pakietu — dłuższa wiadomość to więcej części.</p>
              </CardContent></Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Miesiąc po miesiącu</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Miesiąc</TableHead>
                      <TableHead className="text-right">Wysłane</TableHead>
                      <TableHead className="text-right">Nieudane</TableHead>
                      <TableHead className="text-right">Części SMS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {miesiace.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Brak wysłanych SMS</TableCell></TableRow>
                    ) : miesiace.map((m) => (
                      <TableRow
                        key={m.miesiac}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => { setMiesiac(m.miesiac); setStrona(0); setTab('sent'); }}
                      >
                        <TableCell className="capitalize">{nazwaMiesiaca(m.miesiac)}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.wyslane}</TableCell>
                        <TableCell className={`text-right tabular-nums ${Number(m.nieudane) > 0 ? 'text-destructive' : ''}`}>{m.nieudane}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.czesci}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </TabsPill>
      </main>

      {/* Podgląd całej treści — w tabeli mieszczą się dwa wiersze, a SMS bywa dłuższy */}
      {podglad && (
        <Dialog open={!!podglad} onOpenChange={(v) => !v && setPodglad(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Treść wiadomości</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{podglad.sms_type || 'inne'}</Badge>
                <span className="font-mono">{podglad.phone}</span>
                <span>
                  {podglad.status === 'scheduled'
                    ? `zaplanowany na ${format(new Date(podglad.scheduled_at), 'dd.MM.yyyy HH:mm')}`
                    : format(new Date(podglad.sent_at || podglad.created_at), 'dd.MM.yyyy HH:mm')}
                </span>
                {podglad.parts_count > 1 && <span>· {podglad.parts_count} części</span>}
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 whitespace-pre-wrap">{podglad.message}</div>
              {podglad.error_message && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive text-xs">
                  {podglad.error_message}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPodglad(null)}>Zamknij</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edycja zaplanowanego */}
      {editingSms && (
        <Dialog open={!!editingSms} onOpenChange={(v) => !v && setEditingSms(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edytuj zaplanowany SMS</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Telefon</Label>
                <Input onFocus={e => e.currentTarget.select()} value={editingSms.phone} onChange={(e) => setEditingSms({ ...editingSms, phone: e.target.value })} />
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
