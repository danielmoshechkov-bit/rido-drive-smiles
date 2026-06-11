import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useIsWorkshopEmployee } from '@/hooks/useIsWorkshopEmployee';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Loader2, Wrench, ArrowLeft, ClipboardList, Briefcase, Calendar,
  Inbox, History, CheckCircle2, Hourglass, HandHelping, Building2,
} from 'lucide-react';
import { EmployeeOrderCardDialog } from '@/components/workshop/EmployeeOrderCardDialog';
import { EmployeeNotificationsBell } from '@/components/workshop/EmployeeNotificationsBell';
import { StationOrderNoteDialog } from '@/components/workshop/StationOrderNoteDialog';
import { EmployeeWorkListDialog } from '@/components/workshop/EmployeeWorkListDialog';
import { useWorkshopTranslations, TranslatableField } from '@/hooks/useWorkshopTranslations';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

type Tab = 'home' | 'mine' | 'pool' | 'history';

export default function WorkshopEmployeePortal() {
  const navigate = useNavigate();
  const { loading, isWorkshopEmployee, records } = useIsWorkshopEmployee();
  const [tab, setTab] = useState<Tab>('home');
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [mine, setMine] = useState<any[]>([]);
  const [pool, setPool] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [poolEnabled, setPoolEnabled] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [openFromPool, setOpenFromPool] = useState(false);
  const [openProviderId, setOpenProviderId] = useState<string | null>(null);
  const [openPreviewMode, setOpenPreviewMode] = useState(false);
  // Lista prac dialog
  const [workListOrderId, setWorkListOrderId] = useState<string | null>(null);
  // station-mode (e.g. Myjnia) — simplified note + finish dialog
  const [stationOpenId, setStationOpenId] = useState<string | null>(null);
  const [stationOpenName, setStationOpenName] = useState<string | null>(null);
  // employee's stations (for filter pills)
  const [myStations, setMyStations] = useState<{ id: string; name: string; color: string }[]>([]);
  const [stationFilter, setStationFilter] = useState<string>('all');

  const providerIds = useMemo(() => records.map(r => r.provider_id), [records]);
  const primaryProvider = records[0];

  const loadAll = async () => {
    setDataLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate('/auth'); return; }
    setUserId(user.id);
    setUserName(user.user_metadata?.full_name || user.email || 'Pracownik');

    // Pool toggle — read workshop_settings for the provider's owner
    if (primaryProvider) {
      const { data: prov } = await (supabase.from('service_providers') as any)
        .select('user_id').eq('id', primaryProvider.provider_id).maybeSingle();
      if (prov?.user_id) {
        const { data: ws } = await (supabase.from('workshop_settings') as any)
          .select('employees_can_claim_orders').eq('user_id', prov.user_id).maybeSingle();
        setPoolEnabled(!!ws?.employees_can_claim_orders);
      }
    }

    // My assignments — include station_id on order + vehicle for richer list display
    const { data: mineData } = await (supabase.from('workshop_order_assignments') as any)
      .select('id, order_id, provider_id, status, assigned_at, workshop_orders(id, order_number, status_name, vehicle_id, client_id, scheduled_date, scheduled_start, acceptance_date, mileage, description, station_id, has_unread_notes, vehicle:workshop_vehicles(brand, model, plate))')
      .eq('employee_user_id', user.id)
      .order('assigned_at', { ascending: false });
    setMine(mineData || []);


    // Stations this employee belongs to (across all their providers)
    const { data: stMaps } = await (supabase.from('workshop_station_employees') as any)
      .select('station_id, workshop_stations(id, name, color, is_active)')
      .eq('employee_user_id', user.id);
    setMyStations(((stMaps || []) as any[])
      .map(m => m.workshop_stations)
      .filter((s: any) => s && s.is_active)
      .map((s: any) => ({ id: s.id, name: s.name, color: s.color })));

    // Pool — all ACTIVE provider orders (not completed/cancelled), so employee can pick any to inspect
    if (providerIds.length) {
      const { data: pooledOrders } = await (supabase.from('workshop_orders') as any)
        .select('id, order_number, status_name, scheduled_date, scheduled_start, description, provider_id, vehicle:workshop_vehicles(brand, model, plate)')

        .in('provider_id', providerIds)
        .order('created_at', { ascending: false })
        .limit(100);
      const assignedToMe = new Set((mineData || []).map((a: any) => a.order_id));
      setPool(((pooledOrders || []) as any[]).filter(o => {
        const s = (o.status_name || '').toLowerCase();
        if (s.includes('zakończ') || s.includes('anulow')) return false;
        return !assignedToMe.has(o.id);
      }));
    }

    // History — orders the employee was assigned to AND that are finished.
    // We show the full order (items list + station + vehicle) grouped by station.
    const { data: histAssigns } = await (supabase.from('workshop_order_assignments') as any)
      .select('id, order_id, provider_id, assigned_at, workshop_orders(id, order_number, status_name, station_id, description, has_unread_notes, completed_at, vehicle:workshop_vehicles(brand, model, plate), items:workshop_order_items(id, name, quantity, unit, unit_price_gross, kind))')
      .eq('employee_user_id', user.id)
      .order('assigned_at', { ascending: false })
      .limit(80);
    const finished = ((histAssigns || []) as any[]).filter(a => {
      const s = (a.workshop_orders?.status_name || '').toLowerCase();
      return s.includes('zakończ') || s.includes('naprawione') || s.includes('gotow') || s.includes('odbioru');
    });
    setHistory(finished);

    setDataLoading(false);
  };

  useEffect(() => { if (!loading && isWorkshopEmployee) loadAll(); /* eslint-disable-next-line */ }, [loading, isWorkshopEmployee, records.length]);

  // Realtime — when admin assigns / changes status, refresh immediately.
  // We listen to INSERT/DELETE on assignments (without server-side filter, so
  // we don't depend on the row matching us — we just refetch and let RLS decide)
  // and to UPDATEs on workshop_orders (status changes).
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`emp-portal-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workshop_order_assignments' }, () => loadAll())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'workshop_order_assignments' }, () => loadAll())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workshop_orders' }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [userId]);

  // Deep-link: open ?order=<id> after first load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oid = params.get('order');
    if (oid && !dataLoading) {
      setOpenOrderId(oid);
    }
    // eslint-disable-next-line
  }, [dataLoading]);

  const claim = async (orderId: string, providerId: string) => {
    if (!userId) return;
    setBusy(orderId);
    try {
      const { error } = await (supabase.from('workshop_order_assignments') as any).insert({
        order_id: orderId, provider_id: providerId, employee_user_id: userId,
        assigned_by: userId, status: 'assigned',
      });
      if (error) throw error;
      await (supabase.from('workshop_order_assignment_history') as any).insert({
        order_id: orderId, provider_id: providerId, employee_user_id: userId,
        action: 'claimed', performed_by: userId,
      });
      toast.success('Zlecenie przyjęte');
      await loadAll();
    } catch (e: any) { toast.error(e.message || 'Nie udało się przyjąć zlecenia'); }
    finally { setBusy(null); }
  };

  const release = async (assignmentId: string, orderId: string, providerId: string) => {
    if (!userId) return;
    if (!confirm('Zwrócić zlecenie do puli? Inni pracownicy będą mogli je przejąć.')) return;
    setBusy(assignmentId);
    try {
      const { error } = await (supabase.from('workshop_order_assignments') as any)
        .delete().eq('id', assignmentId);
      if (error) throw error;
      await (supabase.from('workshop_order_assignment_history') as any).insert({
        order_id: orderId, provider_id: providerId, employee_user_id: userId,
        action: 'released', performed_by: userId,
      });
      toast.success('Zlecenie zwrócone do puli');
      await loadAll();
    } catch (e: any) { toast.error(e.message || 'Błąd'); }
    finally { setBusy(null); }
  };

  // IMPORTANT: all hooks must run on every render — keep them ABOVE any early returns.
  const translationFields = useMemo<TranslatableField[]>(() => {
    const out: TranslatableField[] = [];
    const seen = new Set<string>();
    const pushDesc = (oid: string, desc?: string) => {
      if (!oid || !desc) return;
      const key = `order:${oid}:description`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ entity_type: 'order', entity_id: oid, field: 'description', text: desc });
    };
    mine.forEach((a: any) => pushDesc(a.order_id, a.workshop_orders?.description));
    pool.forEach((o: any) => pushDesc(o.id, o.description));
    history.forEach((a: any) => {
      pushDesc(a.order_id, a.workshop_orders?.description);
      (a.workshop_orders?.items || []).forEach((it: any) => {
        if (!it?.id || !it?.name) return;
        const k = `item:${it.id}:name`;
        if (seen.has(k)) return;
        seen.add(k);
        out.push({ entity_type: 'item', entity_id: String(it.id), field: 'name', text: String(it.name) });
      });
    });
    return out;
  }, [mine, pool, history]);

  const { t: tr } = useWorkshopTranslations(translationFields, 'pl');

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (!isWorkshopEmployee) {
    return (
      <div className="container max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Wrench className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <h2 className="text-lg font-semibold">Brak dostępu</h2>
            <p className="text-sm text-muted-foreground">
              Nie jesteś przypisany/a do żadnego warsztatu. Jeśli właśnie otrzymałeś/aś zaproszenie email — kliknij link w wiadomości.
            </p>
            <Button variant="outline" onClick={() => navigate('/klient')}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Wróć do portalu klienta
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = {
    mine: mine.length,
    inProgress: mine.filter(m => (m.workshop_orders?.status_name || '').toLowerCase().includes('trakcie') || m.status === 'in_progress').length,
    done: mine.filter(m => (m.workshop_orders?.status_name || '').toLowerCase().includes('zakończ')).length,
    pool: pool.length,
  };

  return (
    <div className="container max-w-5xl mx-auto p-3 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/klient')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Moje konto
        </Button>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" /> Moja Praca
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            {primaryProvider?.provider_name || 'Twój warsztat'} · {primaryProvider?.role?.toUpperCase()}
          </p>
        </div>
        <LanguageSwitcher />
        <EmployeeNotificationsBell />
      </div>

      {/* Quick stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <StatTile icon={<ClipboardList className="h-5 w-5" />} label="Moje zlecenia" value={stats.mine}
          active={tab === 'mine'} onClick={() => setTab('mine')} />
        <StatTile icon={<Hourglass className="h-5 w-5" />} label="W trakcie" value={stats.inProgress} accent="warning" />
        <StatTile icon={<CheckCircle2 className="h-5 w-5" />} label="Zakończone" value={stats.done} accent="success" />
        <StatTile
          icon={<Inbox className="h-5 w-5" />} label="Dostępne" value={stats.pool}
          active={tab === 'pool'} onClick={() => setTab('pool')}
        />
      </div>

      {/* Nav pill tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
        <NavPill active={tab === 'home'} onClick={() => setTab('home')} icon={<Briefcase className="h-3.5 w-3.5" />} label="Start" />
        <NavPill active={tab === 'mine'} onClick={() => setTab('mine')} icon={<ClipboardList className="h-3.5 w-3.5" />} label={`Moje (${stats.mine})`} />
        <NavPill active={tab === 'pool'} onClick={() => setTab('pool')} icon={<Inbox className="h-3.5 w-3.5" />} label={`Aktywne (${stats.pool})`} />
        <NavPill active={tab === 'history'} onClick={() => setTab('history')} icon={<History className="h-3.5 w-3.5" />} label="Historia" />
      </div>

      {dataLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : tab === 'home' ? (
        <div className="grid sm:grid-cols-2 gap-3">
          <ActionTile
            title="Moje zlecenia"
            sub={`${stats.mine} aktywnych`}
            icon={<ClipboardList className="h-6 w-6 text-primary" />}
            onClick={() => setTab('mine')}
          />
          <ActionTile
            title="Aktywne zlecenia"
            sub={poolEnabled
              ? `${stats.pool} w warsztacie — możesz przejąć`
              : `${stats.pool} w warsztacie (podgląd)`}
            icon={<Inbox className="h-6 w-6 text-primary" />}
            onClick={() => setTab('pool')}
          />

          <ActionTile
            title="Kalendarz"
            sub="Twoje terminy"
            icon={<Calendar className="h-6 w-6 text-primary" />}
            onClick={() => navigate('/kalendarz')}
          />
          <ActionTile
            title="Historia"
            sub="Przyjęte i zwrócone"
            icon={<History className="h-6 w-6 text-primary" />}
            onClick={() => setTab('history')}
          />
        </div>
      ) : tab === 'mine' ? (
        <Section title={`Moje zlecenia (${mine.length})`} icon={<ClipboardList className="h-4 w-4 text-primary" />}>
          {/* Station filter pills — only when employee has any station */}
          {myStations.length > 0 && (
            <div className="px-3 py-2 border-b flex gap-1.5 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setStationFilter('all')}
                className={`shrink-0 px-3 py-1 rounded-full text-xs border ${stationFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-muted'}`}
              >Wszystkie ({mine.length})</button>
              {myStations.map(s => {
                const n = mine.filter(a => a.workshop_orders?.station_id === s.id).length;
                return (
                  <button key={s.id} onClick={() => setStationFilter(s.id)}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs border inline-flex items-center gap-1.5 ${stationFilter === s.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-muted'}`}>
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {s.name} ({n})
                  </button>
                );
              })}
            </div>
          )}
          {(() => {
            const filtered = mine.filter(a => {
              if (stationFilter === 'all') return true;
              return a.workshop_orders?.station_id === stationFilter;
            });
            if (filtered.length === 0) {
              return <Empty text={mine.length === 0
                ? 'Brak przydzielonych zleceń. Gdy warsztat coś przydzieli — pojawi się tutaj.'
                : 'Brak zleceń na tym stanowisku.'} />;
            }
            return (
            <div className="divide-y">
              {filtered.map(a => {
                const st = String(a.workshop_orders?.status_name || '');
                const sid = a.workshop_orders?.station_id;
                const station = sid ? myStations.find(s => s.id === sid) : null;
                const tone = ['Do wyceny','Wycena gotowa','Wycena wysłana','Oczekuje na akceptację','Dodatek do naprawy'].includes(st)
                  ? 'yellow'
                  : ['Akceptacja klienta','Zaakceptowano','Zgoda na naprawę','W trakcie naprawy','Zadania wykonane','Gotowy do odbioru'].includes(st)
                    ? 'green'
                    : ['Naprawione','Zakończone'].includes(st)
                      ? 'red'
                      : 'gray';
                const toneRow = tone === 'yellow' ? 'bg-yellow-50/70 border-l-yellow-400'
                  : tone === 'green' ? 'bg-green-50/70 border-l-green-500'
                  : tone === 'red' ? 'bg-red-50/70 border-l-red-500'
                  : 'bg-muted/30 border-l-gray-300';
                const isApproved = ['Zaakceptowano','Akceptacja klienta','Zgoda na naprawę','W trakcie naprawy','Dodatek do naprawy','Poprawka'].includes(st);
                const isFinished = ['Naprawione','Zakończone','Anulowane','Gotowy do odbioru'].includes(st);
                const hasNote = !!a.workshop_orders?.has_unread_notes;
                const veh = a.workshop_orders?.vehicle;
                const vehLine = veh ? [veh.brand, veh.model, veh.plate].filter(Boolean).join(' · ') : '';
                const openOrder = () => {
                  // Finished orders: read-only preview only; mechanic can't edit history.
                  if (isFinished) {
                    setOpenPreviewMode(true);
                    setOpenFromPool(false);
                    setOpenProviderId(a.provider_id);
                    setOpenOrderId(a.order_id);
                    return;
                  }
                  // Station-mode dialog: when this order belongs to one of the
                  // employee's stations — either because admin sent a note
                  // (hasNote) OR because the status is the station name /
                  // "<station> — realizacja" (worker still active there).
                  const stOnStation = !!station && (
                    hasNote ||
                    st === station.name ||
                    st.toLowerCase().startsWith(station.name.toLowerCase())
                  );
                  if (stOnStation) {
                    setStationOpenId(a.order_id);
                    setStationOpenName(station!.name);
                  } else if (isApproved) {
                    setWorkListOrderId(a.order_id);
                  } else {
                    setOpenPreviewMode(false);
                    setOpenFromPool(false);
                    setOpenProviderId(a.provider_id);
                    setOpenOrderId(a.order_id);
                  }
                };
                return (
                <div key={a.id} className={`p-3 flex items-center gap-3 border-l-4 ${toneRow}`}>
                  {a.workshop_orders?.has_unread_notes && (
                    <span title="Nowa notatka od administratora" className="text-amber-500 text-lg leading-none">!</span>
                  )}
                  <button className="flex-1 text-left hover:opacity-80" onClick={openOrder}>
                    <div className="font-semibold text-sm flex items-center gap-2 text-foreground">
                      <span>{a.workshop_orders?.order_number || a.order_id.slice(0, 8)}</span>
                      {vehLine && <span className="text-foreground font-semibold">· {vehLine}</span>}
                      {station && (
                        <Badge className="text-[10px] px-1.5 py-0" style={{ background: station.color, color: '#fff' }}>
                          {station.name}
                        </Badge>
                      )}
                    </div>
                    {a.workshop_orders?.description && (
                      <div className="text-xs text-foreground/90 mt-0.5 line-clamp-2 whitespace-pre-wrap">
                        {tr('order', a.order_id, 'description', a.workshop_orders.description)}
                      </div>
                    )}
                  </button>


                  {(() => {
                    const map: Record<string, string> = {
                      'Do wyceny': 'bg-yellow-500 text-black hover:bg-yellow-600',
                      'Oczekuje na akceptację': 'bg-yellow-500 text-black hover:bg-yellow-600',
                      'Wycena gotowa': 'bg-yellow-500 text-black hover:bg-yellow-600',
                      'Wycena wysłana': 'bg-yellow-500 text-black hover:bg-yellow-600',
                      'Zaakceptowano': 'bg-green-600 text-white hover:bg-green-700',
                      'Akceptacja klienta': 'bg-green-600 text-white hover:bg-green-700',
                      'Zgoda na naprawę': 'bg-green-600 text-white hover:bg-green-700',
                      'W trakcie naprawy': 'bg-amber-400 text-black hover:bg-amber-500',
                      'Dodatek do naprawy': 'bg-yellow-500 text-black hover:bg-yellow-600',
                      'Naprawione': 'bg-violet-600 text-white hover:bg-violet-700',
                      'Gotowy do odbioru': 'bg-emerald-600 text-white hover:bg-emerald-700',
                      'Zakończone': 'bg-gray-700 text-white hover:bg-gray-800',
                    };
                    const cls = map[st] || (station ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-400 text-white hover:bg-gray-500');
                    const label = st && map[st] ? st : (station ? station.name : 'Przydzielone');
                    return <Badge className={`${cls} text-xs`}>{label}</Badge>;
                  })()}
                  {/* Action buttons */}
                  {isApproved && !station && (
                    <>
                      <Button
                        size="sm" variant="outline"
                        onClick={() => {
                          setOpenPreviewMode(true);
                          setOpenFromPool(false);
                          setOpenProviderId(a.provider_id);
                          setOpenOrderId(a.order_id);
                        }}
                        title="Karta zlecenia — podgląd diagnozy"
                      >
                        Karta
                      </Button>
                      <Button
                        size="sm"
                        className="bg-primary text-primary-foreground"
                        onClick={() => setWorkListOrderId(a.order_id)}
                      >
                        Lista prac
                      </Button>
                    </>
                  )}
                  {!isFinished && (
                    <Button
                      variant="ghost" size="sm" disabled={busy === a.id}
                      onClick={() => release(a.id, a.order_id, a.provider_id)}
                    >
                      {busy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Zwróć'}
                    </Button>
                  )}

                </div>
                );
              })}
            </div>
            );
          })()}
        </Section>
      ) : tab === 'pool' ? (
        <Section title={`Aktywne zlecenia warsztatu (${pool.length})`} icon={<Inbox className="h-4 w-4 text-primary" />}>
          {pool.length === 0 ? (
            <Empty text="Brak aktywnych zleceń." />
          ) : (
            <div className="divide-y">
              {pool.map(o => (
                <div key={o.id} className="p-3 flex items-center gap-3 bg-amber-50/60 border-l-4 border-l-amber-400">
                  <button
                    className="flex-1 text-left hover:opacity-80"
                    onClick={() => { setOpenFromPool(true); setOpenProviderId(o.provider_id); setOpenOrderId(o.id); }}
                  >
                    <div className="font-semibold text-sm text-foreground flex items-center gap-2 flex-wrap">
                      <span>{o.order_number || o.id.slice(0, 8)}</span>
                      {o.vehicle && (
                        <span className="text-foreground font-semibold">
                          · {[o.vehicle.brand, o.vehicle.model, o.vehicle.plate].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                    {o.description && (
                      <div className="text-xs text-foreground/90 mt-0.5 line-clamp-2 whitespace-pre-wrap">
                        {tr('order', o.id, 'description', o.description)}
                      </div>
                    )}
                  </button>


                  <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 bg-amber-100">Aktywne</Badge>

                  {poolEnabled && (
                    <Button
                      size="sm" disabled={busy === o.id}
                      onClick={() => claim(o.id, o.provider_id)}
                    >
                      {busy === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><HandHelping className="h-3.5 w-3.5 mr-1" />Przyjmij</>}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      ) : (
        <Section title={`Historia (${history.length})`} icon={<History className="h-4 w-4 text-primary" />}>
          {history.length === 0 ? (
            <Empty text="Brak wykonanych zleceń." />
          ) : (() => {
            // Group by station — "Bez stanowiska" for orders without one
            const groups: Record<string, { name: string; color: string; items: any[] }> = {};
            history.forEach((a: any) => {
              const sid = a.workshop_orders?.station_id || 'none';
              const st = myStations.find(s => s.id === sid);
              const key = sid;
              if (!groups[key]) {
                groups[key] = {
                  name: st?.name || 'Bez stanowiska',
                  color: st?.color || '#94a3b8',
                  items: [],
                };
              }
              groups[key].items.push(a);
            });
            return (
              <div className="divide-y">
                {Object.entries(groups).map(([key, g]) => (
                  <div key={key} className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                      <h3 className="font-semibold text-sm">{g.name}</h3>
                      <Badge variant="outline" className="text-[10px]">{g.items.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {g.items.map((a: any) => {
                        const o = a.workshop_orders;
                        const veh = o?.vehicle;
                        const vehLine = veh ? [veh.brand, veh.model, veh.plate].filter(Boolean).join(' · ') : '';
                        const items = (o?.items || []) as any[];
                        return (
                          <div
                            key={a.id}
                            className="rounded-md border bg-muted/30 p-2.5 cursor-pointer hover:bg-muted/50"
                            onClick={() => {
                              setOpenPreviewMode(true);
                              setOpenFromPool(false);
                              setOpenProviderId(a.provider_id);
                              setOpenOrderId(a.order_id);
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-semibold">
                                {o?.order_number || a.order_id.slice(0, 8)}
                                {vehLine && <span className="text-foreground/80 font-normal"> · {vehLine}</span>}
                              </div>
                              <Badge className="bg-gray-700 text-white text-[10px]">
                                {o?.status_name || 'Zakończone'}
                              </Badge>
                            </div>
                            {o?.description && (
                              <div className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                                {tr('order', a.order_id, 'description', o.description)}
                              </div>
                            )}
                            {items.length > 0 && (
                              <ul className="mt-1.5 text-xs space-y-0.5">
                                {items.slice(0, 6).map((it: any) => (
                                  <li key={it.id} className="flex justify-between gap-2 text-foreground/80">
                                    <span className="truncate">
                                      {it.kind === 'part' ? '🔧 ' : '🛠️ '}
                                      {tr('item', String(it.id), 'name', it.name)} {it.quantity ? `× ${it.quantity} ${it.unit || ''}` : ''}
                                    </span>
                                  </li>
                                ))}
                                {items.length > 6 && (
                                  <li className="text-[11px] text-muted-foreground">…i {items.length - 6} więcej</li>
                                )}
                              </ul>
                            )}
                            {o?.completed_at && (
                              <div className="text-[11px] text-muted-foreground mt-1">
                                Zakończone: {new Date(o.completed_at).toLocaleString('pl')}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </Section>
      )}

      {/* Provider info card */}
      <div className="grid gap-2">
        {records.map(r => (
          <Card key={r.id}>
            <CardContent className="py-3 flex items-center gap-3">
              <Building2 className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <div className="font-medium text-sm">{r.provider_name || 'Warsztat'}</div>
                <div className="text-[11px] text-muted-foreground uppercase">{r.role}</div>
              </div>
              <Badge className="bg-green-500 text-white hover:bg-green-600">Aktywny</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <EmployeeOrderCardDialog
        open={!!openOrderId}
        onOpenChange={(v) => { if (!v) { setOpenOrderId(null); setOpenFromPool(false); setOpenPreviewMode(false); } }}
        orderId={openOrderId}
        employeeId={primaryProvider?.id}
        employeeName={userName}
        readOnly={openFromPool || openPreviewMode}
        onClaim={openFromPool && openOrderId && openProviderId ? async () => {
          await claim(openOrderId, openProviderId);
          setOpenFromPool(false);
          setTab('mine');
          setOpenOrderId(null);
        } : undefined}
        onSaved={loadAll}
      />

      <StationOrderNoteDialog
        open={!!stationOpenId}
        onOpenChange={(v) => { if (!v) { setStationOpenId(null); setStationOpenName(null); } }}
        orderId={stationOpenId}
        stationName={stationOpenName}
        onDone={loadAll}
      />

      <EmployeeWorkListDialog
        open={!!workListOrderId}
        onOpenChange={(v) => { if (!v) setWorkListOrderId(null); }}
        orderId={workListOrderId}
        employeeId={primaryProvider?.id}
        employeeName={userName}
        onSaved={loadAll}
      />
    </div>
  );
}

function StatTile({ icon, label, value, active, onClick, accent, disabled }: any) {
  const accentCls = accent === 'success' ? 'text-green-600' : accent === 'warning' ? 'text-amber-600' : 'text-primary';
  return (
    <button
      onClick={onClick} disabled={disabled}
      className={`text-left rounded-xl border bg-card p-3 transition hover:shadow-md ${active ? 'ring-2 ring-primary' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className={`flex items-center gap-1.5 text-xs font-medium ${accentCls}`}>{icon}{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </button>
  );
}

function NavPill({ active, onClick, icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition border ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-muted'}`}
    >{icon}{label}</button>
  );
}

function ActionTile({ title, sub, icon, onClick, disabled }: any) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      className={`text-left rounded-xl border bg-card p-4 transition hover:shadow-md hover:border-primary ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">{icon}</div>
        <div>
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-xs text-muted-foreground">{sub}</div>
        </div>
      </div>
    </button>
  );
}

function Section({ title, icon, children }: any) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          {icon}<h2 className="font-semibold text-sm">{title}</h2>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-8 text-center text-sm text-muted-foreground">{text}</div>;
}
