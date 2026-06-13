// Lista prac — view active after client accepted the quote.
// Employee sees only: vehicle, grouped tasks (labor + parts), NO prices.
// Can remove items (decreases price → no client re-accept needed)
// or add via "Dodatek do naprawy" modal (increases price → admin/client re-accept).
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Loader2, X, Check, PackagePlus, Plus, Wrench, ClipboardList,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWorkshopTranslations, TranslatableField } from '@/hooks/useWorkshopTranslations';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string | null;
  employeeId?: string;
  employeeName?: string;
  onSaved?: () => void;
}

interface Item {
  id: string;
  name: string;
  item_type: 'part' | 'service' | string;
  labor_hours: number | null;
  task_group: string | null;
  sort_order: number | null;
  is_addon?: boolean;
}

interface Group {
  key: string;
  service: Item | null;
  parts: Item[];
  isAddon: boolean;
}

export function EmployeeWorkListDialog({
  open, onOpenChange, orderId, employeeId, employeeName, onSaved,
}: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  // Addon modal state
  const [addonOpen, setAddonOpen] = useState(false);
  const [addonParts, setAddonParts] = useState<string[]>([]);
  const [addonPartDraft, setAddonPartDraft] = useState('');
  const [addonLabor, setAddonLabor] = useState('');
  const [addonHours, setAddonHours] = useState('');
  const [addonSaving, setAddonSaving] = useState(false);

  const load = async () => {
    if (!orderId) return;
    setLoading(true);
    const { data: o } = await (supabase.from('workshop_orders') as any)
      .select('id, order_number, status_name, vehicle_id, description, mileage')
      .eq('id', orderId).maybeSingle();
    setOrder(o);
    if (o?.vehicle_id) {
      const { data: v } = await (supabase.from('workshop_vehicles') as any)
        .select('id, brand, model, plate, year').eq('id', o.vehicle_id).maybeSingle();
      setVehicle(v);
    } else setVehicle(null);

    const { data: its } = await (supabase.from('workshop_order_items') as any)
      .select('id, name, item_type, labor_hours, task_group, sort_order, is_addon')
      .eq('order_id', orderId)
      .order('sort_order', { ascending: true });
    setItems(((its || []) as any[]).map(i => ({
      ...i, name: String(i.name || '').replace(/^\s*\[[^\]]+\]\s*/, ''),
    })));
    setLoading(false);
  };

  useEffect(() => { if (open && orderId) load(); /* eslint-disable-next-line */ }, [open, orderId]);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const it of items) {
      const k = it.task_group || 'Inne';
      if (!map.has(k)) map.set(k, { key: k, service: null, parts: [], isAddon: !!it.is_addon });
      const g = map.get(k)!;
      if (it.is_addon) g.isAddon = true;
      if (it.item_type === 'service' && !g.service) g.service = it;
      else g.parts.push(it);
    }
    // addons on top
    return Array.from(map.values()).sort((a, b) => {
      if (a.isAddon !== b.isAddon) return a.isAddon ? -1 : 1;
      return a.key.localeCompare(b.key);
    });
  }, [items]);

  // CORE: batchowe tłumaczenie pozycji pracy (nazwy usług/części + nagłówki grup
  // + opis) na język mechanika. Terminologia automotive.
  const trFields = useMemo<TranslatableField[]>(() => {
    const out: TranslatableField[] = [];
    const seen = new Set<string>();
    const push = (et: string, id: string, field: string, text?: string | null) => {
      if (!id || !text) return;
      const k = `${et}:${id}:${field}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ entity_type: et, entity_id: id, field, text: String(text) });
    };
    for (const it of items) push('item', String(it.id), 'name', it.name);
    for (const g of groups) push('item', `grp_${g.key}`, 'name', g.key);
    if (order?.description) push('order', String(order.id), 'description', order.description);
    return out;
  }, [items, groups, order]);
  // 'auto' — pozycje to mix: zadania od admina (PL) + części dopisane przez mechanika
  // w jego języku. Wykrywamy źródło per pozycję, każdy widzi u siebie.
  const { t: tr } = useWorkshopTranslations(trFields, 'auto');

  const removeItem = async (id: string) => {
    if (!confirm(t('workshop.workList.confirmRemoveItem'))) return;
    setBusy(id);
    try {
      const { error } = await (supabase.from('workshop_order_items') as any).delete().eq('id', id);
      if (error) throw error;
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase.from('workshop_order_events') as any).insert({
        order_id: orderId, event_type: 'item_removed',
        actor_user_id: user?.id || null, actor_name: employeeName || null,
        actor_role: 'employee',
        note: `Usunięto pozycję z listy prac (id: ${id.slice(0, 8)})`,
      });
      setItems(its => its.filter(i => i.id !== id));
      toast.success(t('workshop.workList.itemRemoved'));
    } catch (e: any) {
      toast.error(e.message || t('common.saveError'));
    } finally {
      setBusy(null);
    }
  };

  const submitAddon = async () => {
    if (!orderId) return;
    // Auto-commit draft part if user typed but forgot to press Enter / "+"
    let partsList = [...addonParts];
    const draft = addonPartDraft.trim();
    if (draft) { partsList.push(draft); setAddonParts(partsList); setAddonPartDraft(''); }

    const hrs = parseFloat(addonHours || '0') || 0;
    if (partsList.length === 0 && !addonLabor.trim() && hrs === 0) {
      toast.error(t('workshop.workList.enterPartOrLabor'));
      return;
    }
    // Warn if parts added but no labor
    if (partsList.length > 0 && !addonLabor.trim() && hrs === 0) {
      if (!confirm(t('workshop.workList.confirmNoLabor'))) return;
    }
    setAddonSaving(true);
    try {
      // Find lowest existing sort_order so addons sit above everything (negative integers within int4 range).
      const { data: minRow } = await (supabase.from('workshop_order_items') as any)
        .select('sort_order').eq('order_id', orderId)
        .order('sort_order', { ascending: true }).limit(1).maybeSingle();
      const minExisting = typeof minRow?.sort_order === 'number' ? minRow.sort_order : 0;
      let s = Math.min(minExisting, 0) - 1;
      const inserts: any[] = [];
      partsList.forEach(name => {
        inserts.push({
          order_id: orderId, name, item_type: 'part',
          quantity: 1, unit: 'szt', task_group: 'Dodatek do naprawy',
          employee_id: employeeId || null, mechanic: employeeName || null,
          sort_order: s++, unit_price_net: 0, unit_price_gross: 0,
          total_net: 0, total_gross: 0, discount_percent: 0, is_addon: true,
        });
      });
      if (addonLabor.trim() || hrs > 0) {
        inserts.push({
          order_id: orderId, name: addonLabor.trim() || 'Robocizna (dodatek)',
          item_type: 'service', quantity: 1, unit: 'usł.', labor_hours: hrs,
          task_group: 'Dodatek do naprawy',
          employee_id: employeeId || null, mechanic: employeeName || null,
          sort_order: s++, unit_price_net: 0, unit_price_gross: 0,
          total_net: 0, total_gross: 0, discount_percent: 0, is_addon: true,
        });
      }
      const { error } = await (supabase.from('workshop_order_items') as any).insert(inserts);
      if (error) throw error;
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase.from('workshop_orders') as any)
        .update({ status_name: 'Dodatek do naprawy', estimate_changed_after_send: true })
        .eq('id', orderId);
      await (supabase.from('workshop_order_events') as any).insert({
        order_id: orderId, event_type: 'repair_addon',
        actor_user_id: user?.id || null, actor_name: employeeName || null,
        actor_role: 'employee', to_status: 'Dodatek do naprawy',
        note: `Dodatek z Listy prac: ${partsList.length} cz., ${hrs}h${
          partsList.length > 0 && !addonLabor.trim() && hrs === 0
            ? ' (bez robocizny — zaakceptowane przez pracownika)'
            : ''
        }`,
      });
      supabase.functions.invoke('workshop-notify-employee', {
        body: { order_id: orderId, event: 'repair_addon_request' },
      }).catch(() => {});
      toast.success(t('workshop.workList.addonSentToAdmin'));
      setAddonOpen(false);
      setAddonParts([]); setAddonPartDraft(''); setAddonLabor(''); setAddonHours('');
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || t('common.saveError'));
    } finally {
      setAddonSaving(false);
    }
  };

  const finishRepair = async () => {
    if (!orderId) return;
    setFinishing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase.from('workshop_orders') as any)
        .update({ status_name: 'Naprawione', repaired_at: new Date().toISOString(), repaired_by_user_id: user?.id || null })
        .eq('id', orderId);
      await (supabase.from('workshop_order_events') as any).insert({
        order_id: orderId, event_type: 'repair_done',
        actor_user_id: user?.id || null, actor_name: employeeName || null,
        actor_role: 'employee', to_status: 'Naprawione',
      });
      supabase.functions.invoke('workshop-notify-employee', {
        body: { order_id: orderId, event: 'order_ready' },
      }).catch(() => {});
      toast.success(t('workshop.workList.repairFinishedHanded'));
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || t('common.saveError'));
    } finally {
      setFinishing(false);
    }
  };

  const status = String(order?.status_name || '');
  const isWaitingAddon = status === 'Dodatek do naprawy';
  const veh = vehicle ? `${vehicle.brand || ''} ${vehicle.model || ''}`.trim() : t('workshop.workList.vehicle');
  const plate = vehicle?.plate || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[94vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-5 w-5 text-primary" />
            {t('workshop.workList.title')} · {order?.order_number || ''}
          </DialogTitle>
          <div className="text-xs text-muted-foreground">
            {veh}{vehicle?.year ? ` · ${vehicle.year}` : ''}{plate ? ` · ${plate}` : ''}
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="p-3 space-y-3 bg-muted/20">
              {isWaitingAddon && (
                <div className="rounded-md bg-yellow-100 border border-yellow-300 text-yellow-900 text-sm py-2 px-3 font-medium">
                  ⏳ {t('workshop.workList.waitingAddonNote')}
                </div>
              )}
              {groups.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  {t('workshop.workList.noItems')}
                </div>
              ) : groups.map(g => (
                <div key={g.key} className={`rounded-xl bg-card border p-3 space-y-2 ${
                  g.isAddon ? 'border-orange-300 ring-1 ring-orange-200' : ''
                }`}>
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-sm flex-1">{tr('item', `grp_${g.key}`, 'name', g.key)}</div>
                    {g.isAddon && (
                      <Badge className="bg-orange-500 text-white text-[10px]">{t('workshop.workList.addonBadge')}</Badge>
                    )}
                  </div>

                  {g.service && (
                    <div className="rounded-md border bg-background px-3 py-2 flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-primary shrink-0" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{tr('item', g.service.id, 'name', g.service.name) || t('workshop.workList.labor')}</div>
                        {g.service.labor_hours ? (
                          <div className="text-xs text-muted-foreground">{g.service.labor_hours} h</div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={busy === g.service.id}
                        onClick={() => g.service && removeItem(g.service.id)}
                        className="text-muted-foreground hover:text-destructive p-1 disabled:opacity-50"
                        title={t('workshop.workList.removeItemTooltip')}
                      >
                        {busy === g.service.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <X className="h-4 w-4" />}
                      </button>
                    </div>
                  )}

                  {g.parts.length > 0 && (
                    <div className="divide-y border rounded-md bg-background">
                      {g.parts.map(p => (
                        <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                          <span className="flex-1 text-sm">{tr('item', p.id, 'name', p.name)}</span>
                          <button
                            type="button"
                            disabled={busy === p.id}
                            onClick={() => removeItem(p.id)}
                            className="text-muted-foreground hover:text-destructive p-1 disabled:opacity-50"
                            title={t('workshop.workList.removePartTooltip')}
                          >
                            {busy === p.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <X className="h-4 w-4" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="border-t p-3 flex-col gap-2 sm:flex-col">
          <div className="grid grid-cols-2 gap-2 w-full">
            <Button
              variant="outline"
              className="h-11 border-orange-400 text-orange-700 hover:bg-orange-50"
              onClick={() => setAddonOpen(true)}
              disabled={finishing || isWaitingAddon}
            >
              <PackagePlus className="h-4 w-4 mr-1" /> {t('workshop.workList.repairAddon')}
            </Button>
            <Button
              className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={finishRepair}
              disabled={finishing || isWaitingAddon || groups.length === 0}
            >
              {finishing
                ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                : <Check className="h-4 w-4 mr-1" />}
              {t('workshop.workList.finishRepair')}
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => onOpenChange(false)}>
            {t('workshop.workList.close')}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* ADDON */}
      <Dialog open={addonOpen} onOpenChange={(o) => !addonSaving && setAddonOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <PackagePlus className="h-5 w-5" /> {t('workshop.workList.repairAddon')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-orange-50 border border-orange-200 text-orange-900 text-xs p-2">
              {t('workshop.workList.addonInfo')}
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-foreground mb-1.5">{t('workshop.workList.additionalParts')}</div>
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
                  placeholder={t('workshop.workList.enterPartPlaceholder')}
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
                  type="button" variant="outline" className="h-11 px-3 shrink-0"
                  onClick={() => {
                    const v = addonPartDraft.trim();
                    if (v) { setAddonParts(ps => [...ps, v]); setAddonPartDraft(''); }
                  }}
                  aria-label={t('workshop.workList.addPartAria')}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-foreground mb-1.5">{t('workshop.workList.additionalLabor')}</div>
              <Input
                value={addonLabor} onChange={(e) => setAddonLabor(e.target.value)}
                placeholder={t('workshop.workList.laborPlaceholder')} className="h-11"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-foreground">{t('workshop.workList.timeHours')}</label>
              <Input
                type="number" step="0.25" min="0" inputMode="decimal"
                value={addonHours} onChange={(e) => setAddonHours(e.target.value)}
                placeholder="0.5" className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddonOpen(false)} disabled={addonSaving}>{t('common.cancel')}</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              disabled={addonSaving}
              onClick={submitAddon}
            >
              {addonSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              {t('workshop.workList.sendForAcceptance')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
