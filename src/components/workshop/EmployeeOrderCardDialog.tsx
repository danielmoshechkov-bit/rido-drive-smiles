import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Loader2, X, Wrench, Check, ChevronDown, ChevronUp, HandHelping, Lock, ArrowRight, Plus, PackagePlus,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation, Trans } from 'react-i18next';
import { translateWorkshopStatus } from '@/utils/workshopStatusStyle';
import { useWorkshopTranslations, TranslatableField } from '@/hooks/useWorkshopTranslations';

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
  const { t: tr } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [tasks, setTasks] = useState<TaskBlock[]>([]);
  const partInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const timeInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  // Addon dialog state
  const [addonOpen, setAddonOpen] = useState(false);
  const [addonParts, setAddonParts] = useState<string[]>([]);
  const [addonPartDraft, setAddonPartDraft] = useState('');
  const [addonLabor, setAddonLabor] = useState('');
  const [addonHours, setAddonHours] = useState('');
  const [addonCost, setAddonCost] = useState('');
  const [addonSaving, setAddonSaving] = useState(false);

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
              key: 'Inne', index: parsed.length + 1, complaint: 'Inne', text: '',
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

  // CORE: tłumaczenie treści zgłoszenia klienta (tytuł pozycji + "Обращение клиента")
  // na język mechanika. Parts to edytowalne pola robocze — nie tłumaczymy.
  const tcFields = useMemo<TranslatableField[]>(() => {
    const out: TranslatableField[] = [];
    tasks.forEach(t => {
      const txt = t.complaint || t.text;
      if (txt && orderId) out.push({ entity_type: 'order', entity_id: `${orderId}#${t.index}`, field: 'complaint', text: txt });
    });
    return out;
  }, [tasks, orderId]);
  const { t: tc } = useWorkshopTranslations(tcFields, 'pl');
  const tComplaint = (t: TaskBlock) =>
    tc('order', `${orderId}#${t.index}`, 'complaint', t.complaint || t.text);
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
    // Auto-commit any unsaved part draft so the typed text doesn't get lost.
    const draftEl = partInputRefs.current[ti];
    const draftVal = draftEl?.value?.trim();
    let workingTasks = tasks;
    if (draftVal) {
      workingTasks = tasks.map((t, idx) => idx === ti
        ? { ...t, parts: [...t.parts, { name: draftVal }] }
        : t);
      if (draftEl) draftEl.value = '';
    }
    const t = workingTasks[ti];
    const hrs = parseFloat(t.time || '0');
    if (!hrs || hrs <= 0) {
      setTasks(workingTasks.map((x, idx) => idx === ti ? { ...x, timeError: tr('workshop.employeeCard.timeRequired') } : x));
      timeInputRefs.current[ti]?.focus();
      return;
    }
    const confirmed = workingTasks.map((x, idx) => idx === ti
      ? { ...x, confirmed: true, expanded: false, timeError: undefined }
      : x);
    const nextEmpty = confirmed.findIndex((x, idx) => idx > ti && !x.confirmed);
    const fallback = nextEmpty >= 0 ? nextEmpty : confirmed.findIndex(x => !x.confirmed);
    if (fallback >= 0) {
      setTasks(confirmed.map((x, idx) => idx === fallback ? { ...x, expanded: true } : x));
    } else {
      setTasks(confirmed);
    }
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
      toast.success(tr('workshop.employeeCard.diagnosisDone'));
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || tr('common.saveError'));
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
                {vehicleHeader || tr('workshop.employeeCard.vehicleFallback')}
                {vehicle?.plate ? ` · ${vehicle.plate}` : ''}
              </div>
            </div>
            {readOnly && (
              <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 shrink-0">
                <Lock className="h-3 w-3" /> {tr('workshop.employeeCard.preview')}
              </Badge>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <Progress value={progressPct} className="h-2 flex-1" />
            <span className="text-xs font-medium text-muted-foreground shrink-0">
              {tr('workshop.employeeCard.pointsProgress', { done: confirmedCount, total: tasks.length })}
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
                      partsCount ? tr('workshop.employeeCard.partsCount', { count: partsCount }) : null,
                      hrsNum ? `${hrsNum} h` : null,
                      costNum ? fmtMoney(costNum) : null,
                    ].filter(Boolean).join(' · ')
                  : tr('workshop.employeeCard.emptyTapToFill');

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
                          {t.index}. {tComplaint(t) || tr('workshop.employeeCard.task')}
                          {t.isAddon && (
                            <Badge className="ml-2 bg-yellow-400 text-yellow-950 text-[10px]">{tr('workshop.employeeCard.addon')}</Badge>
                          )}
                        </div>
                        <div className={`text-xs truncate ${filled ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {summary}
                        </div>
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-3 space-y-3 border-t border-border/60 pt-3">
                        {t.complaint && (
                          <div className="rounded-md bg-muted/60 border px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{tr('workshop.employeeCard.clientComplaint')}</div>
                            <div className="text-sm text-foreground">{tComplaint(t)}</div>
                          </div>
                        )}
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wide text-foreground mb-1.5">
                            {tr('workshop.employeeCard.parts')}
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
                            <div className="flex gap-2">
                              <Input
                                ref={el => { partInputRefs.current[ti] = el; }}
                                placeholder={tr('workshop.employeeCard.enterPartPlaceholder')}
                                className="h-11 text-base flex-1"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addPart(ti, (e.target as HTMLInputElement).value);
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                className="h-11 px-3 shrink-0"
                                onClick={() => {
                                  const el = partInputRefs.current[ti];
                                  if (el) addPart(ti, el.value);
                                }}
                                aria-label={tr('workshop.employeeCard.addPartAria')}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                        {!readOnly && (
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-wide text-foreground mb-1.5">
                              {tr('workshop.employeeCard.workDoneLabor')}
                            </div>
                            <Input
                              value={t.text}
                              onChange={(e) => setTasks(ts => ts.map((x, idx) => idx === ti ? { ...x, text: e.target.value } : x))}
                              placeholder={tr('workshop.employeeCard.laborPlaceholder')}
                              className="h-11 text-base"
                            />
                          </div>
                        )}

                        {/* Czas + koszt */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] font-bold uppercase tracking-wide text-foreground">
                              {tr('workshop.employeeCard.repairTime')} <span className="text-destructive">*</span>
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
                            <label className="text-[11px] font-bold uppercase tracking-wide text-foreground">
                              {tr('workshop.employeeCard.repairCost')}
                            </label>
                            <div className="relative">
                              <Input
                                type="number" step="0.01" min="0" inputMode="decimal"
                                value={t.cost} disabled={readOnly}
                                onFocus={e => e.currentTarget.select()}
                                onChange={e => setCost(ti, e.target.value)}
                                placeholder={tr('workshop.employeeCard.optional')}
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
                            {tr('workshop.employeeCard.confirmPoint')}
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
                      complaint: '',
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
                  <Plus className="h-4 w-4 mr-2" /> {tr('workshop.employeeCard.addItem')}
                </Button>
              )}

              {readOnly && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <Trans i18nKey="workshop.employeeCard.poolHint" components={{ b: <b /> }} />
                </div>
              )}
            </>
          )}
        </div>

        {/* FOOTER */}
        <div className="sticky bottom-0 bg-card border-t p-3 space-y-2">
          {readOnly ? (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-11" onClick={() => onOpenChange(false)}>{tr('workshop.employeeCard.close')}</Button>
              {onClaim && (
                <Button className="flex-1 h-11" onClick={handleClaim} disabled={claiming || loading}>
                  {claiming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <HandHelping className="h-4 w-4 mr-2" />}
                  {tr('workshop.employeeCard.acceptOrder')}
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
                    ⏳ {tr('workshop.employeeCard.awaitingClientAcceptance')}
                  </div>
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => onOpenChange(false)}>{tr('workshop.employeeCard.close')}</Button>
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
                  toast.success(tr('workshop.employeeCard.repairFinished'));
                  onSaved?.(); onOpenChange(false);
                } catch (e: any) { toast.error(e.message || tr('common.saveError')); }
                finally { setSaving(false); }
              };
              const openAddon = () => {
                setAddonParts([]);
                setAddonPartDraft('');
                setAddonLabor('');
                setAddonHours('');
                setAddonCost('');
                setAddonOpen(true);
              };
              return (
                <div className="space-y-2">
                  <div className="rounded-md bg-green-100 border border-green-300 text-green-900 text-sm text-center py-2 font-medium">
                    ✓ {tr('workshop.employeeCard.repairApprovedCanWork')}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-11 border-orange-400 text-orange-700 hover:bg-orange-50" onClick={openAddon} disabled={saving}>
                      <PackagePlus className="h-4 w-4 mr-1" /> {tr('workshop.employeeCard.repairAddon')}
                    </Button>
                    <Button className="h-11 bg-red-600 hover:bg-red-700 text-white" onClick={finishRepair} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                      {tr('workshop.employeeCard.finishRepair')}
                    </Button>
                  </div>
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => onOpenChange(false)}>{tr('workshop.employeeCard.close')}</Button>
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
                    <>{tr('workshop.employeeCard.finishDiagnosis')} <ArrowRight className="h-4 w-4 mx-1" /> {translateWorkshopStatus('Do wyceny', tr)}</>
                  )}
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  {allConfirmed
                    ? tr('workshop.employeeCard.allPointsFilled')
                    : tr('workshop.employeeCard.activeAfterAllPoints')}
                </p>
                <Button variant="ghost" size="sm" className="w-full" onClick={() => onOpenChange(false)}>
                  <Wrench className="h-3.5 w-3.5 mr-1" /> {tr('workshop.employeeCard.closeWithoutFinishing')}
                </Button>
              </>
            );
          })()}
        </div>
      </DialogContent>

      {/* ADDON DIALOG */}
      <Dialog open={addonOpen} onOpenChange={(o) => !addonSaving && setAddonOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <PackagePlus className="h-5 w-5" />
              {tr('workshop.employeeCard.repairAddon')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-orange-50 border border-orange-200 text-orange-900 text-xs p-2">
              {tr('workshop.employeeCard.addonInfo')}
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-foreground mb-1.5">{tr('workshop.employeeCard.additionalParts')}</div>
              {addonParts.length > 0 && (
                <div className="divide-y border rounded-md mb-2 bg-background">
                  {addonParts.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2">
                      <span className="flex-1 text-sm">{p}</span>
                      <button type="button" onClick={() => setAddonParts(ps => ps.filter((_, k) => k !== i))} className="text-muted-foreground hover:text-destructive p-1">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={addonPartDraft}
                  onChange={(e) => setAddonPartDraft(e.target.value)}
                  placeholder={tr('workshop.employeeCard.enterPartPlaceholder')}
                  className="h-11 flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const v = addonPartDraft.trim();
                      if (v) { setAddonParts(ps => [...ps, v]); setAddonPartDraft(''); }
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 px-3 shrink-0"
                  onClick={() => {
                    const v = addonPartDraft.trim();
                    if (v) { setAddonParts(ps => [...ps, v]); setAddonPartDraft(''); }
                  }}
                  aria-label={tr('workshop.employeeCard.addPartAria')}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-foreground mb-1.5">{tr('workshop.employeeCard.additionalLabor')}</div>
              <Input
                value={addonLabor}
                onChange={(e) => setAddonLabor(e.target.value)}
                placeholder={tr('workshop.employeeCard.laborPlaceholder')}
                className="h-11"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-foreground">{tr('workshop.employeeCard.timeHours')}</label>
                <Input
                  type="number" step="0.25" min="0" inputMode="decimal"
                  value={addonHours}
                  onChange={(e) => setAddonHours(e.target.value)}
                  placeholder="0.5"
                  className="h-11"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-foreground">{tr('workshop.employeeCard.costZl')}</label>
                <Input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  value={addonCost}
                  onChange={(e) => setAddonCost(e.target.value)}
                  placeholder={tr('workshop.employeeCard.optional')}
                  className="h-11"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddonOpen(false)} disabled={addonSaving}>{tr('common.cancel')}</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              disabled={
                addonSaving ||
                (addonParts.length === 0 && !addonLabor.trim() && !addonHours && !addonCost)
              }
              onClick={async () => {
                if (!orderId) return;
                setAddonSaving(true);
                try {
                  const hrs = parseFloat(addonHours || '0') || 0;
                  const cost = parseFloat(String(addonCost || '0').replace(',', '.')) || 0;
                  const inserts: any[] = [];
                  // Negative sort_order so addons appear at TOP of admin pricing.
                  // IMPORTANT: must fit in int4 — Date.now() overflows, so derive from existing min.
                  const { data: minRow } = await (supabase.from('workshop_order_items') as any)
                    .select('sort_order').eq('order_id', orderId)
                    .order('sort_order', { ascending: true }).limit(1).maybeSingle();
                  const minExisting = typeof minRow?.sort_order === 'number' ? minRow.sort_order : 0;
                  let s = Math.min(minExisting, 0) - 1;
                  addonParts.forEach(name => {
                    inserts.push({
                      order_id: orderId, name, item_type: 'part',
                      quantity: 1, unit: 'szt', task_group: 'Dodatek do naprawy',
                      employee_id: employeeId || null, mechanic: employeeName || null,
                      sort_order: s++, unit_price_net: 0, unit_price_gross: 0,
                      total_net: 0, total_gross: 0, discount_percent: 0,
                      is_addon: true,
                    });
                  });
                  if (addonLabor.trim() || hrs > 0 || cost > 0) {
                    inserts.push({
                      order_id: orderId, name: addonLabor.trim() || 'Robocizna (dodatek)',
                      item_type: 'service', quantity: 1, unit: 'usł.',
                      labor_hours: hrs, task_group: 'Dodatek do naprawy',
                      employee_id: employeeId || null, mechanic: employeeName || null,
                      sort_order: s++, unit_price_net: 0, unit_price_gross: cost,
                      total_net: 0, total_gross: cost, discount_percent: 0,
                      is_addon: true,
                    });
                  }
                  if (inserts.length === 0) {
                    toast.error(tr('workshop.employeeCard.enterPartOrLabor'));
                    setAddonSaving(false); return;
                  }
                  const { error: insErr } = await (supabase.from('workshop_order_items') as any).insert(inserts);
                  if (insErr) throw insErr;

                  const { data: { user } } = await supabase.auth.getUser();
                  await (supabase.from('workshop_orders') as any)
                    .update({ status_name: 'Dodatek do naprawy', estimate_changed_after_send: true })
                    .eq('id', orderId);
                  await (supabase.from('workshop_order_events') as any).insert({
                    order_id: orderId, event_type: 'repair_addon',
                    actor_user_id: user?.id || null, actor_name: employeeName || null,
                    actor_role: 'employee', to_status: 'Dodatek do naprawy',
                    note: `Dodatek: ${addonParts.length} cz., ${hrs}h, ${cost} zł`,
                  });
                  supabase.functions.invoke('workshop-notify-employee', {
                    body: { order_id: orderId, event: 'repair_addon_request' },
                  }).catch(() => {});
                  toast.success(tr('workshop.employeeCard.addonSentToAdmin'));
                  setAddonOpen(false);
                  onSaved?.();
                  onOpenChange(false);
                } catch (e: any) {
                  toast.error(e.message || tr('common.saveError'));
                } finally {
                  setAddonSaving(false);
                }
              }}
            >
              {addonSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              {tr('workshop.employeeCard.sendForAcceptance')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

