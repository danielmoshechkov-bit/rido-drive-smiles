import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Edit2, Zap, Hand } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { translateWorkshopStatus } from '@/utils/workshopStatusStyle';
import { useWorkshopStatusSettings, useUpdateWorkshopStatusSettings } from '@/hooks/useWorkshop';

interface Props {
  providerId?: string;
}

const AUTO_TRIGGER_OPTIONS = [
  { value: '', labelKey: 'workshop.settings.orderStatuses.trigger.none' },
  { value: 'order_created', labelKey: 'workshop.settings.orderStatuses.trigger.orderCreated' },
  { value: 'protocol_signed', labelKey: 'workshop.settings.orderStatuses.trigger.protocolSigned' },
  { value: 'estimate_prepared', labelKey: 'workshop.settings.orderStatuses.trigger.estimatePrepared' },
  { value: 'estimate_sent', labelKey: 'workshop.settings.orderStatuses.trigger.estimateSent' },
  { value: 'estimate_accepted', labelKey: 'workshop.settings.orderStatuses.trigger.estimateAccepted' },
  { value: 'ready_sms_sent', labelKey: 'workshop.settings.orderStatuses.trigger.readySmsSent' },
];

const DEFAULT_AUTO_STATUSES = [
  { name: 'Nowe zlecenie', color: '#EF4444', sort_order: 0, is_default: true, auto_trigger: 'order_created' },
  { name: 'Przyjęcie do serwisu', color: '#F97316', sort_order: 1, auto_trigger: 'protocol_signed' },
  { name: 'Wycena gotowa', color: '#EAB308', sort_order: 2, auto_trigger: 'estimate_prepared' },
  { name: 'Wycena wysłana', color: '#F97316', sort_order: 3, auto_trigger: 'estimate_sent' },
  { name: 'Zaakceptowano', color: '#22C55E', sort_order: 4, auto_trigger: 'estimate_accepted' },
  { name: 'Gotowy do odbioru', color: '#6B7280', sort_order: 5, auto_trigger: 'ready_sms_sent' },
  { name: 'Zakończone', color: '#374151', sort_order: 6, auto_trigger: '' },
];

export function OrderStatusesPage({ providerId }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', color: '#6B7280', sort_order: 0, is_default: false, auto_trigger: '' });

  const { data: statusSettings } = useWorkshopStatusSettings(providerId || undefined);
  const updateStatusSettings = useUpdateWorkshopStatusSettings();

  const { data: statuses = [] } = useQuery({
    queryKey: ['order-statuses-settings'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await (supabase as any)
        .from('order_statuses')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order');
      if (error) throw error;
      if (!data || data.length === 0) {
        const defaults = DEFAULT_AUTO_STATUSES;
        for (const d of defaults) {
          await (supabase as any).from('order_statuses').insert({ ...d, user_id: user.id });
        }
        const { data: d2 } = await (supabase as any).from('order_statuses').select('*').eq('user_id', user.id).order('sort_order');
        return d2 || [];
      }
      return data;
    },
  });

  const saveMut = useMutation({
    mutationFn: async (payload: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      if (editId) {
        const { error } = await (supabase as any).from('order_statuses').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('order_statuses').insert({ ...payload, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-statuses-settings'] });
      toast.success(editId ? t('workshop.settings.orderStatuses.statusUpdated') : t('workshop.settings.orderStatuses.statusAdded'));
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('order_statuses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-statuses-settings'] });
      toast.success(t('workshop.settings.orderStatuses.statusDeleted'));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const closeDialog = () => {
    setShowAdd(false);
    setEditId(null);
    setForm({ name: '', color: '#6B7280', sort_order: 0, is_default: false, auto_trigger: '' });
  };

  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({ name: s.name, color: s.color, sort_order: s.sort_order, is_default: s.is_default, auto_trigger: s.auto_trigger || '' });
    setShowAdd(true);
  };

  const isAutoMode = statusSettings?.status_mode === 'auto';

  return (
    <div className="space-y-4">
      {/* Auto/Manual Mode Toggle */}
      <Card className="border-2">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-base">{t('workshop.settings.orderStatuses.modeTitle')}</h3>
              <p className="text-sm text-muted-foreground">
                {isAutoMode
                  ? t('workshop.settings.orderStatuses.modeAutoDesc')
                  : t('workshop.settings.orderStatuses.modeManualDesc')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant={!isAutoMode ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => providerId && updateStatusSettings.mutate({ providerId, status_mode: 'manual' })}
              >
                <Hand className="h-4 w-4" /> {t('workshop.settings.orderStatuses.modeManual')}
              </Button>
              <Button
                variant={isAutoMode ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => providerId && updateStatusSettings.mutate({ providerId, status_mode: 'auto' })}
              >
                <Zap className="h-4 w-4" /> {t('workshop.settings.orderStatuses.modeAuto')}
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
        {statuses.map((s: any) => (
          <Card key={s.id} className="border">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: s.color }} />
                <span className="font-medium">{translateWorkshopStatus(s.name, t)}</span>
                {s.is_default && <Badge variant="secondary" className="text-xs">{t('workshop.settings.orderStatuses.defaultBadge')}</Badge>}
                {isAutoMode && s.auto_trigger && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Zap className="h-3 w-3" />
                    {(() => {
                      const opt = AUTO_TRIGGER_OPTIONS.find(o => o.value === s.auto_trigger);
                      return opt ? t(opt.labelKey) : s.auto_trigger;
                    })()}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">{t('workshop.settings.orderStatuses.order')}: {s.sort_order}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}><Edit2 className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMut.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
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
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="flex items-center gap-4">
              <div className="space-y-2">
                <Label>{t('workshop.settings.orderStatuses.colorLabel')}</Label>
                <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} className="w-12 h-10 rounded border cursor-pointer" />
              </div>
              <div className="space-y-2">
                <Label>{t('workshop.settings.orderStatuses.orderLabel')}</Label>
                <Input type="number" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} className="w-20" />
              </div>
            </div>
            {isAutoMode && (
              <div className="space-y-2">
                <Label>{t('workshop.settings.orderStatuses.autoTriggerLabel')}</Label>
                <Select value={form.auto_trigger} onValueChange={v => setForm(p => ({ ...p, auto_trigger: v }))}>
                  <SelectTrigger><SelectValue placeholder={t('workshop.settings.orderStatuses.selectActionPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    {AUTO_TRIGGER_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value || '__none'}>{t(opt.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('workshop.settings.orderStatuses.autoTriggerHint')}</p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={form.is_default} onCheckedChange={v => setForm(p => ({ ...p, is_default: v }))} />
              <Label>{t('workshop.settings.orderStatuses.defaultStatusLabel')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>{t('common.cancel')}</Button>
            <Button onClick={() => saveMut.mutate({
              ...form,
              auto_trigger: form.auto_trigger === '__none' ? null : (form.auto_trigger || null),
            })} disabled={!form.name.trim()}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
