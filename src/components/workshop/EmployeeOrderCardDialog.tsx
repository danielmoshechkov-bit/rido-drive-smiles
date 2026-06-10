import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, X, Wrench, Package, Car, Save, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  employeeName?: string;
  employeeId?: string;
  onSaved?: () => void;
}

type LineKind = 'service' | 'part';
interface Line {
  id?: string;
  kind: LineKind;
  name: string;
  qty: string;        // for parts
  hours: string;      // for services
}
interface TaskBlock {
  index: number;
  text: string;
  expanded: boolean;
  lines: Line[];
}

export function EmployeeOrderCardDialog({ open, onOpenChange, orderId, employeeName, employeeId, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [tasks, setTasks] = useState<TaskBlock[]>([]);

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

        // Parse tasks from description (numbered lines like "1. xxx")
        const rawLines: string[] = String(o?.description || '')
          .split(/\n|(?=\d+\.\s)/).map(s => s.trim()).filter(Boolean);
        const parsed = rawLines.map((l, i) => ({
          index: i + 1,
          text: l.replace(/^\d+\.\s*/, ''),
          expanded: true,
          lines: [{ kind: 'service' as LineKind, name: '', qty: '1', hours: '' }],
        }));
        setTasks(parsed.length ? parsed : [{
          index: 1, text: 'Zakres prac', expanded: true,
          lines: [{ kind: 'service', name: '', qty: '1', hours: '' }],
        }]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, orderId]);

  const toggleTask = (i: number) => setTasks(ts => ts.map((t, idx) => idx === i ? { ...t, expanded: !t.expanded } : t));
  const addLine = (ti: number, kind: LineKind) => setTasks(ts => ts.map((t, idx) =>
    idx === ti ? { ...t, lines: [...t.lines, { kind, name: '', qty: '1', hours: '' }] } : t));
  const updateLine = (ti: number, li: number, patch: Partial<Line>) => setTasks(ts => ts.map((t, idx) =>
    idx === ti ? { ...t, lines: t.lines.map((ln, k) => k === li ? { ...ln, ...patch } : ln) } : t));
  const removeLine = (ti: number, li: number) => setTasks(ts => ts.map((t, idx) =>
    idx === ti ? { ...t, lines: t.lines.filter((_, k) => k !== li) } : t));

  const totals = useMemo(() => {
    let services = 0, parts = 0, hours = 0;
    tasks.forEach(t => t.lines.forEach(l => {
      if (!l.name.trim()) return;
      if (l.kind === 'service') { services++; hours += parseFloat(l.hours || '0') || 0; }
      else parts++;
    }));
    return { services, parts, hours };
  }, [tasks]);

  const handleSave = async () => {
    if (!orderId) return;
    setSaving(true);
    try {
      const rows: any[] = [];
      let sort = 1000;
      tasks.forEach(t => t.lines.forEach(l => {
        const name = l.name.trim();
        if (!name) return;
        const taskPrefix = t.text ? `[${t.index}. ${t.text}] ` : '';
        if (l.kind === 'service') {
          const hours = parseFloat(l.hours || '0') || 0;
          rows.push({
            order_id: orderId,
            name: `${taskPrefix}${name}`,
            item_type: 'service',
            quantity: 1,
            unit: 'usł.',
            labor_hours: hours,
            employee_id: employeeId || null,
            mechanic: employeeName || null,
            sort_order: sort++,
            unit_price_net: 0,
            unit_price_gross: 0,
            total_net: 0,
            total_gross: 0,
            discount_percent: 0,
          });
        } else {
          const qty = parseFloat(l.qty || '1') || 1;
          rows.push({
            order_id: orderId,
            name: `${taskPrefix}${name}`,
            item_type: 'part',
            quantity: qty,
            unit: 'szt',
            employee_id: employeeId || null,
            mechanic: employeeName || null,
            sort_order: sort++,
            unit_price_net: 0,
            unit_price_gross: 0,
            total_net: 0,
            total_gross: 0,
            discount_percent: 0,
          });
        }
      }));
      if (rows.length === 0) {
        toast.error('Dodaj co najmniej jedną pozycję');
        setSaving(false);
        return;
      }
      const { error } = await (supabase.from('workshop_order_items') as any).insert(rows);
      if (error) throw error;
      toast.success(`Zapisano ${rows.length} pozycji do zlecenia`);
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
            <Wrench className="h-5 w-5 text-primary" /> Karta zlecenia — {order?.order_number || ''}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <>
            {/* Vehicle info */}
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

            {/* Tasks */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Zakres prac — dodaj co zrobiłeś</Label>
                <div className="text-xs text-muted-foreground">
                  Usługi: {totals.services} · Części: {totals.parts} · {totals.hours.toFixed(2)} h
                </div>
              </div>

              {tasks.map((t, ti) => (
                <div key={ti} className="rounded-lg border">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted text-left"
                    onClick={() => toggleTask(ti)}
                  >
                    {t.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <Badge variant="secondary" className="text-xs">{t.index}</Badge>
                    <span className="font-medium text-sm flex-1">{t.text || 'Zadanie'}</span>
                    <span className="text-xs text-muted-foreground">{t.lines.filter(l => l.name.trim()).length} poz.</span>
                  </button>

                  {t.expanded && (
                    <div className="p-2 space-y-1.5">
                      {t.lines.map((l, li) => (
                        <div key={li} className="grid grid-cols-[90px_1fr_70px_36px] gap-2 items-center">
                          <select
                            value={l.kind}
                            onChange={e => updateLine(ti, li, { kind: e.target.value as LineKind })}
                            className="h-9 rounded-md border bg-background px-2 text-xs"
                          >
                            <option value="service">Usługa</option>
                            <option value="part">Część</option>
                          </select>
                          <Input
                            value={l.name}
                            onChange={e => updateLine(ti, li, { name: e.target.value })}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && l.name.trim()) {
                                e.preventDefault();
                                addLine(ti, l.kind);
                                setTimeout(() => {
                                  const inputs = (e.currentTarget.closest('.p-2') as HTMLElement)?.querySelectorAll('input');
                                  (inputs?.[(inputs.length - 2)] as HTMLInputElement)?.focus();
                                }, 50);
                              }
                            }}
                            placeholder={l.kind === 'service' ? 'np. wahacz przedni dolny lewy' : 'np. filtr oleju'}
                            className="h-9"
                          />
                          {l.kind === 'service' ? (
                            <Input
                              type="number" step="0.25" min="0"
                              value={l.hours}
                              onFocus={e => e.currentTarget.select()}
                              onChange={e => updateLine(ti, li, { hours: e.target.value })}
                              placeholder="h"
                              className="h-9 text-center"
                            />
                          ) : (
                            <Input
                              type="number" step="1" min="1"
                              value={l.qty}
                              onFocus={e => e.currentTarget.select()}
                              onChange={e => updateLine(ti, li, { qty: e.target.value })}
                              placeholder="szt"
                              className="h-9 text-center"
                            />
                          )}
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => removeLine(ti, li)}
                            disabled={t.lines.length === 1}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <Button variant="ghost" size="sm" onClick={() => addLine(ti, 'service')}>
                          <Wrench className="h-3.5 w-3.5 mr-1" /> Dodaj usługę
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => addLine(ti, 'part')}>
                          <Package className="h-3.5 w-3.5 mr-1" /> Dodaj część
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <DialogFooter className="flex flex-row justify-between sm:justify-between gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zamknij</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Zapisz do zlecenia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
