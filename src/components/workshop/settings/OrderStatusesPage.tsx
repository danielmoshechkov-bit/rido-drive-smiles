import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Edit2, Palette, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { translateWorkshopStatus, getStatusStyle, TONE_HEX } from '@/utils/workshopStatusStyle';
import {
  useWorkshopStatuses,
  useWorkshopStatusSettings,
  useUpdateWorkshopStatusSettings,
} from '@/hooks/useWorkshop';

interface Props {
  providerId?: string;
}

// UWAGA: ta strona edytuje workshop_order_statuses (per PROVIDER) — tę samą tabelę,
// z której czyta picker statusów na zleceniach. Wcześniej pisała do order_statuses
// (per user), przez co zmiany nie miały żadnego efektu na zleceniach.
// Statusy scalone: 'Akceptacja klienta' -> 'Zaakceptowano' (nie pozwalamy jej dodać).
// Silnik auto/manual (status_mode/auto_trigger) nie ma implementacji — UI schowane,
// żeby nie obiecywać automatyzacji, której nie ma (osobne zadanie).
const MERGED_STATUS = 'Akceptacja klienta';

export function OrderStatusesPage({ providerId }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', color: '#6B7280', sort_order: 0, is_default: false });
  const [saving, setSaving] = useState(false);

  const { data: statuses = [] } = useWorkshopStatuses(providerId);
  const { data: statusSettings } = useWorkshopStatusSettings(providerId);
  const updateStatusSettings = useUpdateWorkshopStatusSettings();
  const customColors = (statusSettings as any)?.color_mode === 'custom';

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['workshop-statuses', providerId] });
  };

  const save = async () => {
    if (!providerId) return;
    const name = form.name.trim();
    if (!name) return;
    if (name === MERGED_STATUS) {
      toast.error(t('workshop.settings.orderStatuses.mergedStatusBlocked'));
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        const { error } = await (supabase as any).from('workshop_order_statuses')
          .update({ name, color: form.color, sort_order: form.sort_order, is_default: form.is_default })
          .eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('workshop_order_statuses')
          .insert({ provider_id: providerId, name, color: form.color, sort_order: form.sort_order, is_default: form.is_default });
        if (error) throw error;
      }
      invalidate();
      toast.success(editId ? t('workshop.settings.orderStatuses.statusUpdated') : t('workshop.settings.orderStatuses.statusAdded'));
      closeDialog();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const { error } = await (supabase as any).from('workshop_order_statuses').delete().eq('id', id);
      if (error) throw error;
      invalidate();
      toast.success(t('workshop.settings.orderStatuses.statusDeleted'));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const setStatusColor = async (id: string, color: string) => {
    try {
      const { error } = await (supabase as any).from('workshop_order_statuses').update({ color }).eq('id', id);
      if (error) throw error;
      invalidate();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const closeDialog = () => {
    setShowAdd(false);
    setEditId(null);
    setForm({ name: '', color: '#6B7280', sort_order: 0, is_default: false });
  };

  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({ name: s.name, color: s.color || '#6B7280', sort_order: s.sort_order, is_default: !!s.is_default });
    setShowAdd(true);
  };

  /** Kolor wyświetlany przy statusie: Ręczne = hex z DB, Zalecane = paleta. */
  const displayColor = (s: any) =>
    customColors && s.color ? s.color : TONE_HEX[getStatusStyle(s.name).tone];

  return (
    <div className="space-y-4">
      {/* Tryb kolorów: Zalecane (paleta portalu) / Ręczne (hex per status) */}
      <Card className="border-2">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold text-base">{t('workshop.settings.orderStatuses.colorsTitle')}</h3>
              <p className="text-sm text-muted-foreground">
                {customColors
                  ? t('workshop.settings.orderStatuses.colorsCustomDesc')
                  : t('workshop.settings.orderStatuses.colorsRecommendedDesc')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant={!customColors ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => providerId && updateStatusSettings.mutate({ providerId, color_mode: 'recommended' })}
              >
                <Sparkles className="h-4 w-4" /> {t('workshop.settings.orderStatuses.colorsRecommended')}
              </Button>
              <Button
                variant={customColors ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => providerId && updateStatusSettings.mutate({ providerId, color_mode: 'custom' })}
              >
                <Palette className="h-4 w-4" /> {t('workshop.settings.orderStatuses.colorsCustom')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{t('workshop.settings.orderStatuses.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('workshop.settings.orderStatuses.subtitle')}</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2"><Plus className="h-4 w-4" /> {t('workshop.settings.orderStatuses.addStatus')}</Button>
      </div>

      <div className="space-y-2">
        {(statuses as any[]).map((s: any) => (
          <Card key={s.id} className="border">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {customColors ? (
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(s.color || '') ? s.color : '#6B7280'}
                    onChange={e => setStatusColor(s.id, e.target.value)}
                    title={t('workshop.settings.orderStatuses.colorLabel')}
                    className="w-6 h-6 rounded-full border cursor-pointer p-0 bg-transparent"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: displayColor(s) }} />
                )}
                <span className="font-medium">{translateWorkshopStatus(s.name, t)}</span>
                {s.is_default && <Badge variant="secondary" className="text-xs">{t('workshop.settings.orderStatuses.defaultBadge')}</Badge>}
                <span className="text-xs text-muted-foreground">{t('workshop.settings.orderStatuses.order')}: {s.sort_order}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}><Edit2 className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showAdd} onOpenChange={v => !v && closeDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? t('workshop.settings.orderStatuses.editStatus') : t('workshop.settings.orderStatuses.addStatus')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('workshop.settings.orderStatuses.nameLabel')}</Label>
              <Input onFocus={e => e.currentTarget.select()} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="flex items-center gap-4">
              {customColors && (
                <div className="space-y-2">
                  <Label>{t('workshop.settings.orderStatuses.colorLabel')}</Label>
                  <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} className="w-12 h-10 rounded border cursor-pointer" />
                </div>
              )}
              <div className="space-y-2">
                <Label>{t('workshop.settings.orderStatuses.orderLabel')}</Label>
                <Input onFocus={e => e.currentTarget.select()} type="number" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} className="w-20" />
                onFocus={e => e.currentTarget.select()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_default} onCheckedChange={v => setForm(p => ({ ...p, is_default: v }))} />
              <Label>{t('workshop.settings.orderStatuses.defaultStatusLabel')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>{t('common.cancel')}</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
