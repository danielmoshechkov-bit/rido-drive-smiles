import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, Phone, Car, CheckCircle2, XCircle, Loader2, AlertTriangle, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  providerId: string;
  onSelectOrder?: (order: any) => void;
}

type Booking = {
  id: string;
  booking_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_notes: string | null;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  estimated_price: number | null;
  status: string;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_plate: string | null;
  service_id: string;
  service_name?: string;
  created_at: string;
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Wymaga potwierdzenia', cls: 'bg-red-500 text-white' },
  confirmed: { label: 'Potwierdzona', cls: 'bg-green-500 text-white' },
  in_progress: { label: 'W trakcie', cls: 'bg-amber-500 text-white' },
  completed: { label: 'Zakończona', cls: 'bg-gray-700 text-white' },
  cancelled: { label: 'Odrzucona', cls: 'bg-gray-400 text-white' },
};

export function WorkshopPortalBookings({ providerId, onSelectOrder }: Props) {
  const queryClient = useQueryClient();
  const [actingId, setActingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Otwórz rezerwację jako zlecenie warsztatowe (utwórz jeśli nie istnieje)
  const openAsOrder = async (b: Booking) => {
    if (!onSelectOrder) return;
    setOpeningId(b.id);
    try {
      const sb: any = supabase as any;

      // 1) Czy zlecenie już istnieje?
      const { data: existing } = await sb
        .from('workshop_orders')
        .select('*, client:workshop_clients(*), vehicle:workshop_vehicles(*), items:workshop_order_items(*)')
        .eq('booking_id', b.id)
        .maybeSingle();

      if (existing) {
        onSelectOrder(existing);
        return;
      }

      // 2) Klient — szukaj po telefonie u tego providera
      const phoneDigits = (b.customer_phone || '').replace(/\D/g, '').slice(-9);
      let clientId: string | null = null;
      if (phoneDigits) {
        const { data: existingClients } = await sb
          .from('workshop_clients')
          .select('id, phone')
          .eq('provider_id', providerId);
        const found = (existingClients || []).find((c: any) => (c.phone || '').replace(/\D/g, '').slice(-9) === phoneDigits);
        if (found) clientId = found.id;
      }
      if (!clientId) {
        const nameParts = (b.customer_name || '').trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || null;
        const { data: newClient, error: cErr } = await sb
          .from('workshop_clients')
          .insert({
            provider_id: providerId,
            client_type: 'private',
            first_name: firstName,
            last_name: lastName,
            phone: b.customer_phone,
            email: b.customer_email,
          })
          .select('id')
          .single();
        if (cErr) throw cErr;
        clientId = newClient.id;
      }

      // 3) Pojazd — szukaj po nr rej
      let vehicleId: string | null = null;
      const plateNorm = (b.vehicle_plate || '').toUpperCase().replace(/\s/g, '');
      if (plateNorm) {
        const { data: existingVeh } = await sb
          .from('workshop_vehicles')
          .select('id, plate')
          .eq('provider_id', providerId);
        const fv = (existingVeh || []).find((v: any) => (v.plate || '').toUpperCase().replace(/\s/g, '') === plateNorm);
        if (fv) vehicleId = fv.id;
      }
      if (!vehicleId && (b.vehicle_brand || b.vehicle_model || plateNorm)) {
        const { data: newVeh, error: vErr } = await sb
          .from('workshop_vehicles')
          .insert({
            provider_id: providerId,
            owner_client_id: clientId,
            brand: b.vehicle_brand,
            model: b.vehicle_model,
            year: b.vehicle_year,
            plate: plateNorm || null,
          })
          .select('id')
          .single();
        if (vErr) throw vErr;
        vehicleId = newVeh.id;
      }

      // 4) Zlecenie
      const description = [b.service_name, b.customer_notes].filter(Boolean).join(' — ');
      const scheduledStart = b.scheduled_date && b.scheduled_time
        ? `${b.scheduled_date}T${(b.scheduled_time || '').substring(0, 5)}:00`
        : null;
      const scheduledEnd = scheduledStart && b.duration_minutes
        ? new Date(new Date(scheduledStart).getTime() + b.duration_minutes * 60000).toISOString()
        : null;

      const orderNumber = `ZL-${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}-${Math.floor(Math.random() * 900) + 100}`;

      const { data: newOrder, error: oErr } = await sb
        .from('workshop_orders')
        .insert({
          provider_id: providerId,
          order_number: orderNumber,
          client_id: clientId,
          vehicle_id: vehicleId,
          booking_id: b.id,
          description,
          status_name: 'Przyjęcie do serwisu',
          scheduled_date: b.scheduled_date,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
        })
        .select('*, client:workshop_clients(*), vehicle:workshop_vehicles(*), items:workshop_order_items(*)')
        .single();
      if (oErr) throw oErr;

      toast.success('Utworzono zlecenie z rezerwacji');
      queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });
      onSelectOrder(newOrder);
    } catch (e: any) {
      console.error('openAsOrder error:', e);
      toast.error(e.message || 'Nie udało się otworzyć zlecenia');
    } finally {
      setOpeningId(null);
    }
  };

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['portal-bookings', providerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('service_bookings')
        .select('*')
        .eq('provider_id', providerId)
        .eq('source', 'portal')
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true });
      if (error) {
        console.error('[WorkshopPortalBookings] load error:', error);
        throw error;
      }
      const list = (data || []) as any[];
      const serviceIds = Array.from(new Set(list.map((b) => b.service_id).filter(Boolean)));
      let nameMap: Record<string, string> = {};
      if (serviceIds.length > 0) {
        const { data: svcs } = await (supabase as any)
          .from('provider_services')
          .select('id, name')
          .in('id', serviceIds);
        nameMap = Object.fromEntries((svcs || []).map((s: any) => [s.id, s.name]));
      }
      return list.map((b) => ({ ...b, service_name: nameMap[b.service_id] || '' })) as Booking[];
    },
    enabled: !!providerId,
  });

  // Realtime
  useEffect(() => {
    if (!providerId) return;
    const ch = (supabase as any)
      .channel(`portal-bookings-list-${providerId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'service_bookings',
        filter: `provider_id=eq.${providerId}`,
      }, () => queryClient.invalidateQueries({ queryKey: ['portal-bookings', providerId] }))
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
  }, [providerId, queryClient]);

  const handleConfirm = async (b: Booking) => {
    setActingId(b.id);
    try {
      const { error } = await (supabase as any)
        .from('service_bookings')
        .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
        .eq('id', b.id);
      if (error) throw error;
      // Send confirmation SMS (best effort)
      supabase.functions.invoke('booking-notify', {
        body: { booking_id: b.id, type: 'confirmed' }
      }).catch(() => {});
      toast.success('Rezerwacja potwierdzona — klient otrzyma SMS');
      queryClient.invalidateQueries({ queryKey: ['portal-bookings', providerId] });
      queryClient.invalidateQueries({ queryKey: ['pending-bookings-count'] });
    } catch (e: any) {
      toast.error(e.message || 'Błąd potwierdzania');
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (b: Booking) => {
    if (!confirm(`Odrzucić rezerwację ${b.booking_number}?`)) return;
    setActingId(b.id);
    try {
      const { error } = await (supabase as any)
        .from('service_bookings')
        .update({ status: 'cancelled' })
        .eq('id', b.id);
      if (error) throw error;
      toast.success('Rezerwacja odrzucona');
      queryClient.invalidateQueries({ queryKey: ['portal-bookings', providerId] });
    } catch (e: any) {
      toast.error(e.message || 'Błąd');
    } finally {
      setActingId(null);
    }
  };

  const openEdit = (b: Booking) => {
    setEditing(b);
    setEditDate(b.scheduled_date);
    setEditTime((b.scheduled_time || '').substring(0, 5));
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    if (!editDate || !editTime) {
      toast.error('Podaj datę i godzinę');
      return;
    }
    const oldDate = editing.scheduled_date;
    const oldTime = editing.scheduled_time;
    const changed = oldDate !== editDate || (oldTime || '').substring(0, 5) !== editTime;

    setSavingEdit(true);
    try {
      const { error } = await (supabase as any)
        .from('service_bookings')
        .update({
          scheduled_date: editDate,
          scheduled_time: editTime,
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', editing.id);
      if (error) throw error;

      // Wyślij SMS — rescheduled jeśli zmiana terminu, w przeciwnym razie confirmed
      supabase.functions.invoke('booking-notify', {
        body: {
          booking_id: editing.id,
          type: changed ? 'rescheduled' : 'confirmed',
          old_date: oldDate,
          old_time: oldTime,
        },
      }).catch((e) => console.error('booking-notify invoke error:', e));

      toast.success(changed ? 'Termin zmieniony — klient otrzyma SMS' : 'Rezerwacja potwierdzona');
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['portal-bookings', providerId] });
      queryClient.invalidateQueries({ queryKey: ['pending-bookings-count'] });
    } catch (e: any) {
      toast.error(e.message || 'Błąd zapisu');
    } finally {
      setSavingEdit(false);
    }
  };

  if (!providerId) return null;

  return (
    <Card className="border-primary/30">
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-primary/5">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Rezerwacje z portalu</h3>
            <Badge variant="secondary" className="text-xs">{bookings.length}</Badge>
          </div>
          <span className="text-xs text-muted-foreground">Klienci umówili się przez GetRido</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            Brak rezerwacji z portalu
          </div>
        ) : (
          <>
            {/* Mobile */}
            <div className="md:hidden divide-y">
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className="p-3 space-y-2 cursor-pointer hover:bg-accent/40 transition-colors"
                  onClick={() => openAsOrder(b)}
                  title="Otwórz jako zlecenie"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{b.booking_number}</span>
                        <Badge className={`${STATUS_LABELS[b.status]?.cls} text-[10px]`}>
                          {STATUS_LABELS[b.status]?.label || b.status}
                        </Badge>
                        {openingId === b.id && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                      </div>
                      <p className="text-sm font-medium mt-1">{b.customer_name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {b.customer_phone}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium">{format(new Date(b.scheduled_date), 'dd.MM', { locale: pl })}</p>
                      <p className="text-xs text-primary">{b.scheduled_time}</p>
                    </div>
                  </div>
                  {(b.vehicle_brand || b.vehicle_model) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Car className="h-3 w-3" /> {b.vehicle_brand} {b.vehicle_model} {b.vehicle_plate && `· ${b.vehicle_plate}`}
                    </p>
                  )}
                  {b.service_name && <p className="text-xs"><span className="text-muted-foreground">Usługa:</span> {b.service_name}</p>}
                  {b.customer_notes && <p className="text-xs italic text-muted-foreground line-clamp-2">{b.customer_notes}</p>}
                  <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                    {b.status === 'pending' && (
                      <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => handleConfirm(b)} disabled={actingId === b.id}>
                        {actingId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCircle2 className="h-3 w-3 mr-1" /> Potwierdź</>}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(b)} title="Edytuj termin">
                      <Pencil className="h-3 w-3 mr-1" /> Edytuj
                    </Button>
                    {b.status === 'pending' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleReject(b)} disabled={actingId === b.id}>
                        <XCircle className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Klient / Telefon</TableHead>
                    <TableHead>Pojazd</TableHead>
                    <TableHead>Usługa</TableHead>
                    <TableHead>Termin</TableHead>
                    <TableHead className="text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((b) => (
                    <TableRow
                      key={b.id}
                      className="cursor-pointer hover:bg-accent/40 transition-colors"
                      onClick={() => openAsOrder(b)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-primary" />
                          <span className="font-medium text-sm">{b.booking_number}</span>
                          {openingId === b.id && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${STATUS_LABELS[b.status]?.cls} text-xs whitespace-nowrap`}>
                          {b.status === 'pending' && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {STATUS_LABELS[b.status]?.label || b.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">{b.customer_name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {b.customer_phone}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {(b.vehicle_brand || b.vehicle_model) ? (
                          <div className="text-sm flex items-center gap-1.5">
                            <Car className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{b.vehicle_brand} {b.vehicle_model}</span>
                            {b.vehicle_plate && <span className="text-xs text-muted-foreground">· {b.vehicle_plate}</span>}
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{b.service_name || '—'}</span>
                        {b.customer_notes && <p className="text-xs text-muted-foreground italic line-clamp-1 max-w-[200px]">{b.customer_notes}</p>}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <div className="font-medium">{format(new Date(b.scheduled_date), 'dd.MM.yyyy', { locale: pl })}</div>
                          <div className="text-primary">{b.scheduled_time}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          {b.status === 'pending' && (
                            <Button size="sm" className="h-7 text-xs" onClick={() => handleConfirm(b)} disabled={actingId === b.id}>
                              {actingId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCircle2 className="h-3 w-3 mr-1" /> Potwierdź</>}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => openEdit(b)} title="Edytuj termin">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {b.status === 'pending' ? (
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleReject(b)} disabled={actingId === b.id} title="Odrzuć">
                              <XCircle className="h-3 w-3" />
                            </Button>
                          ) : (
                            <a href={`tel:${b.customer_phone}`} className="inline-flex">
                              <Button size="sm" variant="outline" className="h-7 px-2" title="Zadzwoń">
                                <Phone className="h-3 w-3" />
                              </Button>
                            </a>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edytuj termin rezerwacji</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {editing.booking_number} · {editing.customer_name} · {editing.customer_phone}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Data</Label>
                  <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Godzina</Label>
                  <Input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Po zapisie klient otrzyma SMS: jeśli zmieniono termin — informacja o nowym terminie; w przeciwnym razie — potwierdzenie wizyty.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={savingEdit}>Anuluj</Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Zapisz i wyślij SMS'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
