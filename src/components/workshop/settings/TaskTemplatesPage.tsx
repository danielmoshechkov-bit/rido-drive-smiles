import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export function TaskTemplatesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', hours: 0, price: 0 });

  const { data: templates = [] } = useQuery({
    queryKey: ['task-templates'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await (supabase as any).from('task_templates').select('*').eq('user_id', user.id).eq('is_active', true).order('created_at');
      if (error) throw error;
      return data || [];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (payload: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      if (editId) {
        const { error } = await (supabase as any).from('task_templates').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('task_templates').insert({ ...payload, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-templates'] });
      toast.success(editId ? t('workshop.settings.taskTemplates.templateUpdated') : t('workshop.settings.taskTemplates.templateAdded'));
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('task_templates').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-templates'] });
      toast.success(t('workshop.settings.taskTemplates.templateDeleted'));
    },
  });

  const closeDialog = () => {
    setShowDialog(false);
    setEditId(null);
    setForm({ name: '', description: '', hours: 0, price: 0 });
  };

  const openEdit = (t: any) => {
    setEditId(t.id);
    setForm({ name: t.name, description: t.description || '', hours: t.hours || 0, price: t.price || 0 });
    setShowDialog(true);
  };

  const fmt = (v: number) => v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{t('workshop.settings.taskTemplates.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('workshop.settings.taskTemplates.subtitle')}</p>
        </div>
        <Button onClick={() => setShowDialog(true)} className="gap-2"><Plus className="h-4 w-4" /> {t('workshop.settings.taskTemplates.addTemplate')}</Button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>{t('workshop.settings.taskTemplates.empty')}</p>
          <p className="text-sm">{t('workshop.settings.taskTemplates.emptyHint')}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('workshop.settings.taskTemplates.colName')}</TableHead>
              <TableHead>{t('workshop.settings.taskTemplates.colDescription')}</TableHead>
              <TableHead className="text-right">{t('workshop.settings.taskTemplates.colHours')}</TableHead>
              <TableHead className="text-right">{t('workshop.settings.taskTemplates.colNetPrice')}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((tpl: any) => (
              <TableRow key={tpl.id}>
                <TableCell className="font-medium">{tpl.name}</TableCell>
                <TableCell className="text-muted-foreground">{tpl.description || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{tpl.hours || 0}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(tpl.price || 0)} zł</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(tpl)}><Edit2 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMut.mutate(tpl.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={showDialog} onOpenChange={v => !v && closeDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? t('workshop.settings.taskTemplates.editTemplate') : t('workshop.settings.taskTemplates.addTemplate')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t('workshop.settings.taskTemplates.nameLabel')}</Label><Input onFocus={e => e.currentTarget.select()} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder={t('workshop.settings.taskTemplates.namePlaceholder')} /></div>
            <div className="space-y-2"><Label>{t('workshop.settings.taskTemplates.descriptionLabel')}</Label><Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t('workshop.settings.taskTemplates.standardHoursLabel')}</Label><Input onFocus={e => e.currentTarget.select()} type="number" step="0.25" value={form.hours || ''} onChange={e => setForm(p => ({ ...p, hours: parseFloat(e.target.value) || 0 }))} /></div>
              onFocus={e => e.currentTarget.select()}
              <div className="space-y-2"><Label>{t('workshop.settings.taskTemplates.netPriceLabel')}</Label><Input onFocus={e => e.currentTarget.select()} type="number" value={form.price || ''} onChange={e => setForm(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))} /></div>
              onFocus={e => e.currentTarget.select()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>{t('common.cancel')}</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={!form.name.trim()}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
