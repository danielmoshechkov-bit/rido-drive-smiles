import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Loader2, X, Wrench, Check, ChevronDown, ChevronUp, HandHelping, Lock, ArrowRight, Plus,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  employeeName?: string;
  employeeId?: string;
  readOnly?: boolean;
  onClaim?: () => Promise<void> | void;
  onSaved?: () => void;
}

interface PartItem { id?: string; name: string; }
interface TaskBlock {
  key: string;
  index: number;
  complaint: string;       // co napisał klient (read-only nagłówek)
  text: string;            // czynność wykonana przez pracownika
  parts: PartItem[];
  time: string;            // godziny
  cost: string;            // zł
  confirmed: boolean;
  expanded: boolean;
  existingPartIds: string[];
  existingServiceId: string | null;
  timeError?: string;
  isAddon?: boolean;       // dodatek do naprawy (po akceptacji klienta)
}

const fmtMoney = (n: number) => `${n.toFixed(2).replace('.', ',')}\u00A0zł`;

export function EmployeeOrderCardDialog({
  open, onOpenChange, orderId, employeeName, employeeId,
  readOnly, onClaim, onSaved,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [tasks, setTasks] = useState<TaskBlock[]>([]);
  const partInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const timeInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!open || !orderId) return;
    (async () => {
      setLoading(true);
      try {
        const { data: o } = await (supabase.from('workshop_orders') as any)
          .select('*').eq('id', orderId).maybeSingle();
        setOrder(o);
        if (o?.vehicle_id) {
          const { data: v } = await (supabase.from('workshop_vehicles') as any)
            .select('*').eq('id', o.vehicle_id).maybeSingle();
          setVehicle(v);
        } else setVehicle(null);

        const rawLines: string[] = String(o?.description || '')
          .split(/\n|(?=\d+\.\s)/).map(s => s.trim()).filter(Boolean);
        const parsed: TaskBlock[] = (rawLines.length ? rawLines : ['Zakres prac']).map((l, i) => {
          const idx = i + 1;
          const complaint = l.replace(/^\d+\.\s*/, '');
          return {
            key: `${idx}. ${complaint}`,
            index: idx,
            complaint,
            text: '',
            parts: [],
            time: '',
            cost: '',
            confirmed: false,
            expanded: false,
            existingPartIds: [],
            existingServiceId: null,
          };
        });

        const { data: items } = await (supabase.from('workshop_order_items') as any)
          .select('id, name, item_type, quantity, labor_hours, task_group, sort_order, total_gross, unit_price_gross')
          .eq('order_id', orderId)
          .order('sort_order', { ascending: true });

        const byKey = new Map(parsed.map(t => [t.key, t]));
        let other: TaskBlock | null = null;
        const getOther = () => {
          if (!other) {
            other = {
              key: 'Inne', index: parsed.length + 1, text: 'Inne',
              parts: [], time: '', cost: '', confirmed: false, expanded: false,
              existingPartIds: [], existingServiceId: null,
            };
          }
          return other;
        };

        for (const it of (items || [])) {
          const cleanName = String(it.name || '').replace(/^\s*\[[^\]]+\]\s*/, '');
          const groupKey = it.task_group || (() => {
            const m = String(it.name || '').match(/^\s*\[([^\]]+)\]/);
            return m ? m[1] : null;
          })();
          const block = (groupKey && byKey.get(groupKey)) || getOther();
          if (it.item_type === 'part') {
            block.parts.push({ id: it.id, name: cleanName });
            block.existingPartIds.push(it.id);
          } else {
            // Pierwszy service = źródło czasu/kosztu punktu
            if (!block.existingServiceId) {
              block.existingServiceId = it.id;
              block.time = it.labor_hours != null ? String(it.labor_hours) : '';
              const cost = Number(it.total_gross || it.unit_price_gross || 0);
              block.cost = cost ? String(cost) : '';
            } else {
              // dodatkowe service jako "część" pomocnicza
              block.parts.push({ id: it.id, name: cleanName });
              block.existingPartIds.push(it.id);
            }
          }
        }

        const final = [...parsed];
        if (other) final.push(other);
        // confirmed = ma czas (najważniejszy znacznik)
        final.forEach(b => {
          if (parseFloat(b.time || '0') > 0) b.confirmed = true;
        });
        // otwórz pierwszy niewypełniony
        const firstEmpty = final.findIndex(b => !b.confirmed);
        if (firstEmpty >= 0) final[firstEmpty].expanded = true;
        else if (final.length) final[0].expanded = true;

        setTasks(final);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, orderId]);

  const confirmedCount = useMemo(() => tasks.filter(t => t.confirmed).length, [tasks]);
  const allConfirmed = tasks.length > 0 && confirmedCount === tasks.length;
  const progressPct = tasks.length ? (confirmedCount / tasks.length) * 100 : 0;

  const expandOnly = (i: number) => {
    setTasks(ts => ts.map((t, idx) => ({ ...t, expanded: idx === i ? !t.expanded : false })));
    setTimeout(() => partInputRefs.current[i]?.focus(), 50);
  };

  const addPart = (ti: number, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setTasks(ts => ts.map((t, idx) => idx === ti ? { ...t, parts: [...t.parts, { name: trimmed }] } : t));
    const el = partInputRefs.current[ti];
    if (el) { el.value = ''; el.focus(); }
  };

  const removePart = (ti: number, pi: number) => {
    setTasks(ts => ts.map((t, idx) => idx === ti ? { ...t, parts: t.parts.filter((_, k) => k !== pi) } : t));
  };

  const setTime = (ti: number, v: string) => setTasks(ts => ts.map((t, idx) =>
    idx === ti ? { ...t, time: v, timeError: undefined } : t));
  const setCost = (ti: number, v: string) => setTasks(ts => ts.map((t, idx) =>
    idx === ti ? { ...t, cost: v } : t));

  const confirmTask = (ti: number) => {
    const t = tasks[ti];
    const hrs = parseFloat(t.time || '0');
    if (!hrs || hrs <= 0) {
      setTasks(ts => ts.map((x, idx) => idx === ti ? { ...x, timeError: 'Czas naprawy jest obowiązkowy — wpisz zanim zatwierdzisz punkt' } : x));
      timeInputRefs.current[ti]?.focus();
      return;
    }
    setTasks(ts => {
      const next = ts.map((x, idx) => idx === ti
        ? { ...x, confirmed: true, expanded: false, timeError: undefined }
        : x);
      // znajdź następny niewypełniony i otwórz
      const nextEmpty = next.findIndex((x, idx) => idx > ti && !x.confirmed);
      const fallback = nextEmpty >= 0 ? nextEmpty : next.findIndex(x => !x.confirmed);
      if (fallback >= 0) {
        return next.map((x, idx) => idx === fallback ? { ...x, expanded: true } : x);
      }
      return next;
    });
  };

  const handleClaim = async () => {
    if (!onClaim) return;
    setClaiming(true);
    try { await onClaim(); } finally { setClaiming(false); }
  };

  const persistAll = async () => {
    if (!orderId) return false;
    const keepIds = new Set<string>();
    const updates: { id: string; patch: any }[] = [];
    const inserts: any[] = [];
    const deletes: string[] = [];
    let sort = 1000;

    tasks.forEach(t => {
      const group = t.key;
      // PARTS
      t.parts.forEach(p => {
        if (!p.name.trim()) return;
        if (p.id) {
          keepIds.add(p.id);
          updates.push({ id: p.id, patch: { name: p.name.trim(), quantity: 1, task_group: group } });
        } else {
          inserts.push({
            order_id: orderId, name: p.name.trim(), item_type: 'part',
            quantity: 1, unit: 'szt', task_group: group,
            employee_id: employeeId || null, mechanic: employeeName || null,
            sort_order: sort++, unit_price_net: 0, unit_price_gross: 0,
            total_net: 0, total_gross: 0, discount_percent: 0,
          });
        }
      });
      // SERVICE (czas + koszt)
      const hrs = parseFloat(t.time || '0') || 0;
      const cost = parseFloat(String(t.cost || '0').replace(',', '.')) || 0;
      const hasService = hrs > 0 || cost > 0;
      if (t.existingServiceId && hasService) {
        keepIds.add(t.existingServiceId);
        updates.push({
          id: t.existingServiceId,
          patch: {
            name: t.text || 'Robocizna', labor_hours: hrs, task_group: group,
            unit_price_gross: cost, total_gross: cost,
          },
        });
      } else if (!t.existingServiceId && hasService) {
        inserts.push({
          order_id: orderId, name: t.text || 'Robocizna', item_type: 'service',
          quantity: 1, unit: 'usł.', labor_hours: hrs, task_group: group,
          employee_id: employeeId || null, mechanic: employeeName || null,
          sort_order: sort++, unit_price_net: 0, unit_price_gross: cost,
          total_net: 0, total_gross: cost, discount_percent: 0,
        });
      } else if (t.existingServiceId && !hasService) {
        deletes.push(t.existingServiceId);
      }
    });

    // delete: istniejące not in keep i not w deletes
    const allExisting = tasks.flatMap(t => [...t.existingPartIds, t.existingServiceId].filter(Boolean) as string[]);
    const toDelete = Array.from(new Set([...deletes, ...allExisting.filter(id => !keepIds.has(id))]));

    if (toDelete.length) {
      const { error } = await (supabase.from('workshop_order_items') as any).delete().in('id', toDelete);
      if (error) throw error;
    }
    for (const u of updates) {
      const { error } = await (supabase.from('workshop_order_items') as any).update(u.patch).eq('id', u.id);
      if (error) throw error;
    }
    if (inserts.length) {
      const { error } = await (supabase.from('workshop_order_items') as any).insert(inserts);
      if (error) throw error;
    }
    return true;
  };

  const handleFinishDiagnosis = async () => {
    if (!orderId || readOnly) return;
    if (!allConfirmed) return;
    setSaving(true);
    try {
      await persistAll();
      const { data: { user } } = await supabase.auth.getUser();
      const { error: stErr } = await (supabase.from('workshop_orders') as any)
        .update({ status_name: 'Do wyceny' })
        .eq('id', orderId);
      if (stErr) throw stErr;
      await (supabase.from('workshop_order_events') as any).insert({
        order_id: orderId,
        event_type: 'diagnosis_done',
        actor_user_id: user?.id || null,
        actor_name: employeeName || null,
        actor_role: 'employee',
        to_status: 'Do wyceny',
      });
      toast.success('Diagnoza zakończona — zlecenie trafiło do wyceny');
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  const headerTitle = order?.order_number || (orderId ? orderId.slice(0, 8) : '');
  const vehicleHeader = [
    [vehicle?.brand, vehicle?.model].filter(Boolean).join(' '),
    vehicle?.year || '',
  ].filter(Boolean).join(' · ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[94vh] overflow-y-auto p-0 gap-0">
        {/* HEADER */}
        <div className="sticky top-0 z-10 bg-card border-b px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-base truncate">{headerTitle}</div>
              <div className="text-xs text-muted-foreground truncate">
                {vehicleHeader || 'Pojazd —'}
                {vehicle?.plate ? ` · ${vehicle.plate}` : ''}
              </div>
            </div>
            {readOnly && (
              <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 shrink-0">
                <Lock className="h-3 w-3" /> Podgląd
              </Badge>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <Progress value={progressPct} className="h-2 flex-1" />
            <span className="text-xs font-medium text-muted-foreground shrink-0">
              {confirmedCount} / {tasks.length} punktów
            </span>
          </div>
        </div>

        {/* BODY */}
        <div className="p-3 space-y-2 bg-muted/20">
          {loading ? (
            <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <>
              {tasks.map((t, ti) => {
                const filled = t.confirmed;
                const isOpen = t.expanded;
                const partsCount = t.parts.filter(p => p.name.trim()).length;
                const hrsNum = parseFloat(t.time || '0') || 0;
                const costNum = parseFloat(String(t.cost || '0').replace(',', '.')) || 0;
                const summary = filled
                  ? [
                      partsCount ? `${partsCount} ${partsCount === 1 ? 'część' : 'części'}` : null,
                      hrsNum ? `${hrsNum} h` : null,
                      costNum ? fmtMoney(costNum) : null,
                    ].filter(Boolean).join(' · ')
                  : 'Pusty — dotknij aby wypełnić';

                return (
                  <div
                    key={t.key}
                    className={`rounded-xl bg-card border transition-all ${
                      isOpen ? 'border-primary shadow-sm ring-1 ring-primary/20' : 'border-border'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => expandOnly(ti)}
                      className="w-full flex items-center gap-3 px-3 py-3 text-left"
                    >
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold ${
                        filled ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
                      }`}>
                        {filled ? <Check className="h-4 w-4" /> : t.index}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {t.index}. {t.text || 'Zadanie'}
                        </div>
                        <div className={`text-xs truncate ${filled ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {summary}
                        </div>
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-3 space-y-3 border-t border-border/60 pt-3">
                        {!readOnly && (
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                              Usterka / zakres
                            </div>
                            <Input
                              value={t.text}
                              onChange={(e) => setTasks(ts => ts.map((x, idx) => idx === ti ? { ...x, text: e.target.value, key: `${x.index}. ${e.target.value}` } : x))}
                              placeholder="Opisz usterkę (np. wymiana klocków)"
                              className="h-11 text-base"
                            />
                          </div>
                        )}
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                            Części
                          </div>
                          {t.parts.length > 0 && (
                            <div className="divide-y border rounded-md mb-2 bg-background">
                              {t.parts.map((p, pi) => (
                                <div key={pi} className="flex items-center gap-2 px-3 py-2">
                                  <span className="flex-1 text-sm">{p.name}</span>
                                  {!readOnly && (
                                    <button
                                      type="button" onClick={() => removePart(ti, pi)}
                                      className="text-muted-foreground hover:text-destructive p-1"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {!readOnly && (
                            <Input
                              ref={el => { partInputRefs.current[ti] = el; }}
                              placeholder="Wpisz część i naciśnij Enter…"
                              className="h-11 text-base"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addPart(ti, (e.target as HTMLInputElement).value);
                                }
                              }}
                            />
                          )}
                        </div>

                        {/* Czas + koszt */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Czas naprawy <span className="text-destructive">*</span>
                            </label>
                            <div className="relative">
                              <Input
                                ref={el => { timeInputRefs.current[ti] = el; }}
                                type="number" step="0.25" min="0" inputMode="decimal"
                                value={t.time} disabled={readOnly}
                                onFocus={e => e.currentTarget.select()}
                                onChange={e => setTime(ti, e.target.value)}
                                placeholder="0.5"
                                className={`h-11 text-base pr-8 ${t.timeError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">h</span>
                            </div>
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Koszt naprawy
                            </label>
                            <div className="relative">
                              <Input
                                type="number" step="0.01" min="0" inputMode="decimal"
                                value={t.cost} disabled={readOnly}
                                onFocus={e => e.currentTarget.select()}
                                onChange={e => setCost(ti, e.target.value)}
                                placeholder="opcjonalne"
                                className="h-11 text-base pr-10"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">zł</span>
                            </div>
                          </div>
                        </div>
                        {t.timeError && (
                          <p className="text-xs text-destructive">{t.timeError}</p>
                        )}

                        {!readOnly && (
                          <Button
                            onClick={() => confirmTask(ti)}
                            className="w-full h-11"
                          >
                            <Check className="h-4 w-4 mr-2" />
                            Zatwierdź punkt
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {!readOnly && (
                <Button
                  variant="outline"
                  className="w-full h-11 border-dashed"
                  onClick={() => setTasks(ts => {
                    const nextIdx = ts.length + 1;
                    const newBlock: TaskBlock = {
                      key: `${nextIdx}. `,
                      index: nextIdx,
                      text: '',
                      parts: [],
                      time: '',
                      cost: '',
                      confirmed: false,
                      expanded: true,
                      existingPartIds: [],
                      existingServiceId: null,
                    };
                    return ts.map(t => ({ ...t, expanded: false })).concat(newBlock);
                  })}
                >
                  <Plus className="h-4 w-4 mr-2" /> Dodaj pozycję
                </Button>
              )}

              {readOnly && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  Zlecenie z puli — kliknij <b>Akceptuj zlecenie</b>, aby przejąć je do siebie i zacząć diagnozę.
                </div>
              )}
            </>
          )}
        </div>

        {/* FOOTER */}
        <div className="sticky bottom-0 bg-card border-t p-3 space-y-2">
          {readOnly ? (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-11" onClick={() => onOpenChange(false)}>Zamknij</Button>
              {onClaim && (
                <Button className="flex-1 h-11" onClick={handleClaim} disabled={claiming || loading}>
                  {claiming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <HandHelping className="h-4 w-4 mr-2" />}
                  Akceptuj zlecenie
                </Button>
              )}
            </div>
          ) : (() => {
            const status = String(order?.status_name || '');
            const isAwaitingQuote = ['Do wyceny', 'Oczekuje na akceptację', 'Wycena gotowa', 'Wycena wysłana'].includes(status);
            const isApproved = ['Zaakceptowano', 'Akceptacja klienta', 'Zgoda na naprawę', 'W trakcie naprawy', 'Dodatek do naprawy'].includes(status);

            if (isAwaitingQuote) {
              return (
                <div className="space-y-2">
                  <div className="rounded-md bg-yellow-100 border border-yellow-300 text-yellow-900 text-sm text-center py-3 font-medium">
                    ⏳ Oczekuje na akceptację klienta
                  </div>
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => onOpenChange(false)}>Zamknij</Button>
                </div>
              );
            }

            if (isApproved) {
              const finishRepair = async () => {
                if (!orderId) return;
                setSaving(true);
                try {
                  await persistAll();
                  const { data: { user } } = await supabase.auth.getUser();
                  await (supabase.from('workshop_orders') as any)
                    .update({ status_name: 'Naprawione' }).eq('id', orderId);
                  await (supabase.from('workshop_order_events') as any).insert({
                    order_id: orderId, event_type: 'repair_done',
                    actor_user_id: user?.id || null, actor_name: employeeName || null,
                    actor_role: 'employee', to_status: 'Naprawione',
                  });
                  supabase.functions.invoke('workshop-notify-employee', {
                    body: { order_id: orderId, event: 'order_ready' },
                  }).catch(() => {});
                  toast.success('Naprawa zakończona');
                  onSaved?.(); onOpenChange(false);
                } catch (e: any) { toast.error(e.message || 'Błąd'); }
                finally { setSaving(false); }
              };
              const submitAddon = async () => {
                if (!orderId) return;
                setSaving(true);
                try {
                  await persistAll();
                  const { data: { user } } = await supabase.auth.getUser();
                  await (supabase.from('workshop_orders') as any)
                    .update({ status_name: 'Dodatek do naprawy', estimate_changed_after_send: true })
                    .eq('id', orderId);
                  await (supabase.from('workshop_order_events') as any).insert({
                    order_id: orderId, event_type: 'repair_addon',
                    actor_user_id: user?.id || null, actor_name: employeeName || null,
                    actor_role: 'employee', to_status: 'Dodatek do naprawy',
                  });
                  supabase.functions.invoke('workshop-notify-employee', {
                    body: { order_id: orderId, event: 'repair_addon_request' },
                  }).catch(() => {});
                  toast.success('Dodatek przekazany do akceptacji');
                  onSaved?.(); onOpenChange(false);
                } catch (e: any) { toast.error(e.message || 'Błąd'); }
                finally { setSaving(false); }
              };
              return (
                <div className="space-y-2">
                  <div className="rounded-md bg-green-100 border border-green-300 text-green-900 text-sm text-center py-2 font-medium">
                    ✓ Zgoda na naprawę — możesz pracować
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-11" onClick={submitAddon} disabled={saving}>
                      <Plus className="h-4 w-4 mr-1" /> Dodatek do naprawy
                    </Button>
                    <Button className="h-11 bg-red-600 hover:bg-red-700 text-white" onClick={finishRepair} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                      Zakończ naprawę
                    </Button>
                  </div>
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => onOpenChange(false)}>Zamknij</Button>
                </div>
              );
            }

            return (
              <>
                <Button
                  onClick={handleFinishDiagnosis}
                  disabled={!allConfirmed || saving || loading}
                  className="w-full h-12 text-base"
                >
                  {saving ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : (
                    <>Zakończ diagnozę <ArrowRight className="h-4 w-4 mx-1" /> Do wyceny</>
                  )}
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  {allConfirmed
                    ? 'Wszystkie punkty wypełnione — możesz zakończyć diagnozę'
                    : 'Aktywne po wypełnieniu wszystkich punktów'}
                </p>
                <Button variant="ghost" size="sm" className="w-full" onClick={() => onOpenChange(false)}>
                  <Wrench className="h-3.5 w-3.5 mr-1" /> Zamknij bez zakończenia
                </Button>
              </>
            );
          })()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
