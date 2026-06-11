import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, X, Wrench, Package, Car, Save, ChevronDown, ChevronRight, HandHelping, Lock, CheckCircle2,
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

interface PartLine { id?: string; name: string; qty: string; }
interface ServiceLine { id?: string; name: string; hours: string; }
interface TaskBlock {
  key: string;          // group key — usually "<index>. <text>"
  index: number;
  text: string;
  expanded: boolean;
  parts: PartLine[];
  services: ServiceLine[];
  existingIds: string[]; // ids loaded from DB for this group (to update/delete)
}

const emptyPart = (): PartLine => ({ name: '', qty: '1' });
const emptyService = (): ServiceLine => ({ name: '', hours: '' });

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
  // refs for autofocus on Enter
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const focusKeyRef = useRef<string | null>(null);

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

        // Parse task list from description: lines like "1. xxx"
        const rawLines: string[] = String(o?.description || '')
          .split(/\n|(?=\d+\.\s)/).map(s => s.trim()).filter(Boolean);
        const parsedTasks: TaskBlock[] = (rawLines.length ? rawLines : ['Zakres prac']).map((l, i) => {
          const idx = i + 1;
          const text = l.replace(/^\d+\.\s*/, '');
          return {
            key: `${idx}. ${text}`,
            index: idx,
            text,
            expanded: true,
            parts: [],
            services: [],
            existingIds: [],
          };
        });

        // Load existing items
        const { data: items } = await (supabase.from('workshop_order_items') as any)
          .select('id, name, item_type, quantity, labor_hours, task_group, sort_order')
          .eq('order_id', orderId)
          .order('sort_order', { ascending: true });

        const byKey = new Map(parsedTasks.map(t => [t.key, t]));
        // Bucket "Inne" for items without matching task
        let other: TaskBlock | null = null;
        const getOther = () => {
          if (!other) {
            other = {
              key: 'Inne',
              index: parsedTasks.length + 1,
              text: 'Inne',
              expanded: true,
              parts: [],
              services: [],
              existingIds: [],
            };
          }
          return other;
        };

        for (const it of (items || [])) {
          // Strip legacy "[N. text] " prefix from name
          const cleanName = String(it.name || '').replace(/^\s*\[[^\]]+\]\s*/, '');
          const groupKey = it.task_group || (() => {
            // try to recover from prefix
            const m = String(it.name || '').match(/^\s*\[([^\]]+)\]/);
            return m ? m[1] : null;
          })();
          const block = (groupKey && byKey.get(groupKey)) || getOther();
          block.existingIds.push(it.id);
          if (it.item_type === 'part') {
            block.parts.push({ id: it.id, name: cleanName, qty: String(it.quantity ?? 1) });
          } else {
            block.services.push({ id: it.id, name: cleanName, hours: String(it.labor_hours ?? '') });
          }
        }

        const final = [...parsedTasks];
        if (other) final.push(other);
        // ensure each block has at least one empty row of each kind
        final.forEach(b => {
          if (b.parts.length === 0) b.parts.push(emptyPart());
          if (b.services.length === 0) b.services.push(emptyService());
        });
        setTasks(final);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, orderId]);

  // Auto-focus newly created input after re-render
  useEffect(() => {
    if (focusKeyRef.current) {
      const el = inputRefs.current[focusKeyRef.current];
      el?.focus();
      focusKeyRef.current = null;
    }
  });

  const toggleTask = (i: number) => setTasks(ts => ts.map((t, idx) => idx === i ? { ...t, expanded: !t.expanded } : t));

  const addPart = (ti: number) => {
    setTasks(ts => {
      const next = ts.map((t, idx) => idx === ti ? { ...t, parts: [...t.parts, emptyPart()] } : t);
      focusKeyRef.current = `p-${ti}-${next[ti].parts.length - 1}`;
      return next;
    });
  };
  const addService = (ti: number) => {
    setTasks(ts => {
      const next = ts.map((t, idx) => idx === ti ? { ...t, services: [...t.services, emptyService()] } : t);
      focusKeyRef.current = `s-${ti}-${next[ti].services.length - 1}`;
      return next;
    });
  };
  const updatePart = (ti: number, li: number, patch: Partial<PartLine>) => setTasks(ts =>
    ts.map((t, idx) => idx === ti ? { ...t, parts: t.parts.map((p, k) => k === li ? { ...p, ...patch } : p) } : t));
  const updateService = (ti: number, li: number, patch: Partial<ServiceLine>) => setTasks(ts =>
    ts.map((t, idx) => idx === ti ? { ...t, services: t.services.map((s, k) => k === li ? { ...s, ...patch } : s) } : t));
  const removePart = (ti: number, li: number) => setTasks(ts =>
    ts.map((t, idx) => idx === ti ? { ...t, parts: t.parts.filter((_, k) => k !== li) } : t));
  const removeService = (ti: number, li: number) => setTasks(ts =>
    ts.map((t, idx) => idx === ti ? { ...t, services: t.services.filter((_, k) => k !== li) } : t));

  const totals = useMemo(() => {
    let services = 0, parts = 0, hours = 0;
    tasks.forEach(t => {
      t.parts.forEach(p => { if (p.name.trim()) parts++; });
      t.services.forEach(s => { if (s.name.trim()) { services++; hours += parseFloat(s.hours || '0') || 0; } });
    });
    return { services, parts, hours };
  }, [tasks]);

  const handleClaim = async () => {
    if (!onClaim) return;
    setClaiming(true);
    try { await onClaim(); }
    finally { setClaiming(false); }
  };

  const handleSave = async () => {
    if (!orderId || readOnly) return;
    setSaving(true);
    try {
      // Build rows to insert (only items without id; updates not handled to keep it simple)
      const inserts: any[] = [];
      const updates: { id: string; patch: any }[] = [];
      const keepIds = new Set<string>();
      let sort = 1000;

      tasks.forEach(t => {
        const group = t.key;
        // parts first
        t.parts.forEach(p => {
          const name = p.name.trim();
          if (!name) return;
          const qty = parseFloat(p.qty || '1') || 1;
          if (p.id) {
            keepIds.add(p.id);
            updates.push({ id: p.id, patch: { name, quantity: qty, task_group: group } });
          } else {
            inserts.push({
              order_id: orderId, name, item_type: 'part',
              quantity: qty, unit: 'szt', task_group: group,
              employee_id: employeeId || null, mechanic: employeeName || null,
              sort_order: sort++, unit_price_net: 0, unit_price_gross: 0,
              total_net: 0, total_gross: 0, discount_percent: 0,
            });
          }
        });
        t.services.forEach(s => {
          const name = s.name.trim();
          if (!name) return;
          const hours = parseFloat(s.hours || '0') || 0;
          if (s.id) {
            keepIds.add(s.id);
            updates.push({ id: s.id, patch: { name, labor_hours: hours, task_group: group } });
          } else {
            inserts.push({
              order_id: orderId, name, item_type: 'service',
              quantity: 1, unit: 'usł.', labor_hours: hours, task_group: group,
              employee_id: employeeId || null, mechanic: employeeName || null,
              sort_order: sort++, unit_price_net: 0, unit_price_gross: 0,
              total_net: 0, total_gross: 0, discount_percent: 0,
            });
          }
        });
      });

      // Determine deletions: existing ids no longer kept
      const allExisting = tasks.flatMap(t => t.existingIds);
      const toDelete = allExisting.filter(id => !keepIds.has(id));

      if (toDelete.length) {
        const { error } = await (supabase.from('workshop_order_items') as any).delete().in('id', toDelete);
        if (error) throw error;
      }
      for (const u of updates) {
        const { error } = await (supabase.from('workshop_order_items') as any)
          .update(u.patch).eq('id', u.id);
        if (error) throw error;
      }
      if (inserts.length) {
        const { error } = await (supabase.from('workshop_order_items') as any).insert(inserts);
        if (error) throw error;
      }

      const total = inserts.length + updates.length;
      if (total === 0 && toDelete.length === 0) {
        toast.error('Dodaj co najmniej jedną pozycję');
        setSaving(false);
        return;
      }
      toast.success(`Zapisano: ${inserts.length} nowych, ${updates.length} zaktualizowanych${toDelete.length ? `, ${toDelete.length} usuniętych` : ''}`);
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Karta zlecenia — {order?.order_number || ''}
            {readOnly && (
              <Badge variant="outline" className="ml-2 gap-1 text-amber-700 border-amber-300 bg-amber-50">
                <Lock className="h-3 w-3" /> Tylko podgląd
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
                <Car className="h-4 w-4 text-primary" /> Pojazd
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 text-sm">
                <div><span className="text-muted-foreground">Marka/Model: </span><b>{[vehicle?.brand, vehicle?.model].filter(Boolean).join(' ') || '—'}</b></div>
                <div><span className="text-muted-foreground">Nr rej.: </span><b>{vehicle?.plate || '—'}</b></div>
                <div><span className="text-muted-foreground">Rok: </span><b>{vehicle?.year || '—'}</b></div>
                <div className="col-span-2"><span className="text-muted-foreground">VIN: </span><b className="font-mono text-xs">{vehicle?.vin || '—'}</b></div>
                <div><span className="text-muted-foreground">Silnik: </span><b>{vehicle?.engine_capacity_cm3 ? `${vehicle.engine_capacity_cm3} cm³` : '—'}{vehicle?.fuel_type ? ` · ${vehicle.fuel_type}` : ''}</b></div>
                <div><span className="text-muted-foreground">Przebieg: </span><b>{order?.mileage ? `${order.mileage} km` : '—'}</b></div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Zakres prac</Label>
                <div className="text-xs text-muted-foreground">
                  Części: {totals.parts} · Usługi: {totals.services} · {totals.hours.toFixed(2)} h
                </div>
              </div>

              {tasks.map((t, ti) => (
                <div key={t.key} className="rounded-lg border">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted text-left"
                    onClick={() => toggleTask(ti)}
                  >
                    {t.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <Badge variant="secondary" className="text-xs">{t.index}</Badge>
                    <span className="font-medium text-sm flex-1">{t.text || 'Zadanie'}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.parts.filter(p => p.name.trim()).length}cz · {t.services.filter(s => s.name.trim()).length}usł
                    </span>
                  </button>

                  {t.expanded && (
                    <div className="p-3 space-y-3">
                      {/* PARTS first */}
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1">
                          <Package className="h-3.5 w-3.5" /> Części do wymiany
                        </div>
                        <div className="space-y-1.5">
                          {t.parts.map((p, li) => (
                            <div key={li} className="grid grid-cols-[1fr_70px_36px] gap-2 items-center">
                              <Input
                                ref={el => { inputRefs.current[`p-${ti}-${li}`] = el; }}
                                value={p.name}
                                disabled={readOnly}
                                onChange={e => updatePart(ti, li, { name: e.target.value })}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && p.name.trim()) {
                                    e.preventDefault();
                                    addPart(ti);
                                  }
                                }}
                                placeholder="np. wahacz przedni prawy dolny"
                                className="h-9"
                              />
                              <Input
                                type="number" step="1" min="1"
                                value={p.qty} disabled={readOnly}
                                onFocus={e => e.currentTarget.select()}
                                onChange={e => updatePart(ti, li, { qty: e.target.value })}
                                placeholder="szt" className="h-9 text-center"
                              />
                              <Button
                                variant="ghost" size="icon" className="h-8 w-8"
                                disabled={readOnly || t.parts.length === 1}
                                onClick={() => removePart(ti, li)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        {!readOnly && (
                          <Button variant="ghost" size="sm" onClick={() => addPart(ti)} className="mt-1">
                            <Package className="h-3.5 w-3.5 mr-1" /> Dodaj część
                          </Button>
                        )}
                      </div>

                      {/* SERVICES below */}
                      <div className="border-t pt-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1">
                          <Wrench className="h-3.5 w-3.5" /> Robocizna
                        </div>
                        <div className="space-y-1.5">
                          {t.services.map((s, li) => (
                            <div key={li} className="grid grid-cols-[1fr_70px_36px] gap-2 items-center">
                              <Input
                                ref={el => { inputRefs.current[`s-${ti}-${li}`] = el; }}
                                value={s.name} disabled={readOnly}
                                onChange={e => updateService(ti, li, { name: e.target.value })}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && s.name.trim()) {
                                    e.preventDefault();
                                    addService(ti);
                                  }
                                }}
                                placeholder="np. wymiana wahacza"
                                className="h-9"
                              />
                              <Input
                                type="number" step="0.25" min="0"
                                value={s.hours} disabled={readOnly}
                                onFocus={e => e.currentTarget.select()}
                                onChange={e => updateService(ti, li, { hours: e.target.value })}
                                placeholder="h" className="h-9 text-center"
                              />
                              <Button
                                variant="ghost" size="icon" className="h-8 w-8"
                                disabled={readOnly || t.services.length === 1}
                                onClick={() => removeService(ti, li)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        {!readOnly && (
                          <Button variant="ghost" size="sm" onClick={() => addService(ti)} className="mt-1">
                            <Wrench className="h-3.5 w-3.5 mr-1" /> Dodaj robociznę
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {readOnly && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                To zlecenie jest w puli. Aby wpisywać części i robociznę, najpierw kliknij <b>Akceptuj zlecenie</b> — zostanie przypisane do Ciebie.
              </div>
            )}
          </>
        )}

        <DialogFooter className="flex flex-row justify-between sm:justify-between gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zamknij</Button>
          {readOnly ? (
            onClaim && (
              <Button onClick={handleClaim} disabled={claiming || loading}>
                {claiming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <HandHelping className="h-4 w-4 mr-2" />}
                Akceptuj zlecenie
              </Button>
            )
          ) : (
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Zapisz do zlecenia
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
