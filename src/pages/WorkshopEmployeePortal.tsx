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

    // My assignments — FIX: use assigned_at, not created_at
    const { data: mineData } = await (supabase.from('workshop_order_assignments') as any)
      .select('id, order_id, provider_id, status, assigned_at, workshop_orders(id, order_number, status_name, vehicle_id, client_id, scheduled_date, scheduled_start, acceptance_date, mileage, description)')
      .eq('employee_user_id', user.id)
      .order('assigned_at', { ascending: false });
    setMine(mineData || []);

    // Pool — all ACTIVE provider orders (not completed/cancelled), so employee can pick any to inspect
    if (providerIds.length) {
      const { data: pooledOrders } = await (supabase.from('workshop_orders') as any)
        .select('id, order_number, status_name, scheduled_date, scheduled_start, description, provider_id')
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

    // History
    const { data: hist } = await (supabase.from('workshop_order_assignment_history') as any)
      .select('id, order_id, action, note, created_at')
      .eq('employee_user_id', user.id)
      .order('created_at', { ascending: false }).limit(30);
    setHistory(hist || []);

    setDataLoading(false);
  };

  useEffect(() => { if (!loading && isWorkshopEmployee) loadAll(); /* eslint-disable-next-line */ }, [loading, isWorkshopEmployee, records.length]);

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
        <NavPill active={tab === 'pool'} onClick={() => setTab('pool')} icon={<Inbox className="h-3.5 w-3.5" />} label={`Pula (${stats.pool})`} />
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
            title={poolEnabled ? 'Dostępne zlecenia' : 'Pula zleceń (wyłączona)'}
            sub={poolEnabled ? `${stats.pool} czeka na pracownika` : 'Pracodawca nie udostępnił puli'}
            icon={<Inbox className="h-6 w-6 text-primary" />}
            onClick={() => poolEnabled && setTab('pool')}
            disabled={!poolEnabled}
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
          {mine.length === 0 ? (
            <Empty text="Brak przydzielonych zleceń. Gdy warsztat coś przydzieli — pojawi się tutaj." />
          ) : (
            <div className="divide-y">
              {mine.map(a => (
                <div key={a.id} className="p-3 flex items-center gap-3 bg-green-50/60 border-l-4 border-l-green-500">
                  <button
                    className="flex-1 text-left hover:opacity-80"
                    onClick={() => { setOpenFromPool(false); setOpenProviderId(a.provider_id); setOpenOrderId(a.order_id); }}
                  >
                    <div className="font-medium text-sm">
                      {a.workshop_orders?.order_number || a.order_id.slice(0, 8)}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-1">
                      {a.workshop_orders?.description || a.workshop_orders?.status_name || '—'}
                    </div>
                  </button>
                  <Badge className="bg-green-600 hover:bg-green-700 text-white text-xs">Przydzielone</Badge>
                  <Button
                    variant="ghost" size="sm" disabled={busy === a.id}
                    onClick={() => release(a.id, a.order_id, a.provider_id)}
                  >
                    {busy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Zwróć'}
                  </Button>
                </div>
              ))}
            </div>
          )}
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
                    <div className="font-medium text-sm">{o.order_number || o.id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1">
                      {o.description || o.status_name || '—'}
                    </div>
                  </button>
                  <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 bg-amber-100">W puli</Badge>
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
        <Section title="Historia" icon={<History className="h-4 w-4 text-primary" />}>
          {history.length === 0 ? (
            <Empty text="Brak wpisów." />
          ) : (
            <div className="divide-y">
              {history.map(h => (
                <div key={h.id} className="p-3 flex items-center gap-3 text-sm">
                  <Badge variant={h.action === 'released' ? 'outline' : 'secondary'} className="text-[10px] uppercase">
                    {h.action}
                  </Badge>
                  <div className="flex-1 text-xs text-muted-foreground">
                    {new Date(h.created_at).toLocaleString('pl')} · {h.order_id.slice(0, 8)}
                  </div>
                </div>
              ))}
            </div>
          )}
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
        onOpenChange={(v) => { if (!v) setOpenOrderId(null); }}
        orderId={openOrderId}
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
