import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Wrench, Printer, Save, Plus, X, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

interface PartLine { name: string; qty: string; note: string; }

export function WorkshopMechanicCardDialog({ open, onOpenChange, order }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [tasks, setTasks] = useState<string[]>([]);
  const [parts, setParts] = useState<PartLine[]>([]);
  const [mechanicNotes, setMechanicNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    // Parse tasks from description (numbered lines)
    const lines: string[] = (order.description || '')
      .split('\n')
      .map((l: string) => l.replace(/^\s*\d+\.\s*/, '').trim())
      .filter(Boolean);
    setTasks(lines.length ? lines : ['']);

    // Parse parts from existing order items (type === 'part') or saved mechanic_parts JSON
    const saved = order.mechanic_parts;
    if (Array.isArray(saved) && saved.length > 0) {
      setParts(saved);
    } else {
      const items = (order.items || []).filter((i: any) => (i.item_type || 'part') === 'part');
      setParts(items.length
        ? items.map((i: any) => ({ name: i.name || '', qty: String(i.quantity || ''), note: '' }))
        : [{ name: '', qty: '', note: '' }]);
    }
    setMechanicNotes(order.mechanic_notes || '');
    setMode('view');
  }, [open, order]);

  const addTask = () => setTasks([...tasks, '']);
  const updateTask = (i: number, v: string) => setTasks(tasks.map((t, idx) => idx === i ? v : t));
  const removeTask = (i: number) => setTasks(tasks.filter((_, idx) => idx !== i));

  const addPart = () => setParts([...parts, { name: '', qty: '', note: '' }]);
  const updatePart = (i: number, key: keyof PartLine, v: string) =>
    setParts(parts.map((p, idx) => idx === i ? { ...p, [key]: v } : p));
  const removePart = (i: number) => setParts(parts.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleanTasks = tasks.filter(t => t.trim());
      const cleanParts = parts.filter(p => p.name.trim());
      const description = cleanTasks.map((t, i) => `${i + 1}. ${t.trim()}`).join('\n');
      const { error } = await (supabase as any)
        .from('workshop_orders')
        .update({
          description,
          mechanic_parts: cleanParts,
          mechanic_notes: mechanicNotes || null,
        })
        .eq('id', order.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['workshop-orders'] });
      toast.success(t('workshop.mechanicCard.saved'));
      setMode('view');
    } catch (e: any) {
      toast.error(t('workshop.mechanicCard.saveError', { error: e.message }));
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) return;
    const v = order.vehicle || {};
    const c = order.client || {};
    const clientName = c.client_type === 'company' ? c.company_name : `${c.first_name || ''} ${c.last_name || ''}`.trim();
    const html = `
      <!doctype html><html><head><meta charset="utf-8"><title>${t('workshop.mechanicCard.printTitle', { number: order.order_number || '' })}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
        h1 { font-size: 20px; margin: 0 0 8px; }
        h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; }
        .row { padding: 4px 0; }
        ol, ul { padding-left: 20px; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
        th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
        th { background: #f0f0f0; }
        .empty { height: 28px; }
        .notes { min-height: 100px; border: 1px solid #ccc; padding: 8px; }
        @media print { body { padding: 12px; } }
      </style></head><body>
      <h1>${t('workshop.mechanicCard.printHeading')}</h1>
      <div style="font-size:13px;color:#555;">${t('workshop.mechanicCard.printOrderLabel')}: <b>${order.order_number || ''}</b> · ${t('workshop.mechanicCard.printDateLabel')}: ${new Date().toLocaleDateString('pl-PL')}</div>
      <h2>${t('workshop.mechanicCard.vehicleData')}</h2>
      <div class="grid">
        <div><b>${t('workshop.mechanicCard.brandModel')}:</b> ${[v.brand, v.model].filter(Boolean).join(' ') || '-'}</div>
        <div><b>${t('workshop.mechanicCard.plate')}:</b> ${v.plate || '-'}</div>
        <div><b>${t('workshop.mechanicCard.vin')}:</b> ${v.vin || '-'}</div>
        <div><b>${t('workshop.mechanicCard.year')}:</b> ${v.year || '-'}</div>
        <div><b>${t('workshop.mechanicCard.mileage')}:</b> ${order.mileage ? order.mileage + ' km' : '-'}</div>
        <div><b>${t('workshop.mechanicCard.fuel')}:</b> ${v.fuel_type || '-'}</div>
        <div><b>${t('workshop.mechanicCard.client')}:</b> ${clientName || '-'}</div>
        <div><b>${t('workshop.mechanicCard.phone')}:</b> ${c.phone || '-'}</div>
      </div>
      <h2>${t('workshop.mechanicCard.tasksScope')}</h2>
      <ol>${tasks.filter(t => t.trim()).map(t => `<li>${escapeHtml(t)}</li>`).join('') || '<li class="empty"></li>'}</ol>
      <h2>${t('workshop.mechanicCard.partsListPrint')}</h2>
      <table>
        <thead><tr><th style="width:50%">${t('workshop.mechanicCard.colPartName')}</th><th style="width:15%">${t('workshop.mechanicCard.colQty')}</th><th>${t('workshop.mechanicCard.colNotesCatalog')}</th></tr></thead>
        <tbody>
          ${parts.filter(p => p.name.trim()).map(p => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.qty)}</td><td>${escapeHtml(p.note)}</td></tr>`).join('')}
          ${Array.from({ length: Math.max(6 - parts.filter(p => p.name.trim()).length, 3) }).map(() => '<tr><td>&nbsp;</td><td></td><td></td></tr>').join('')}
        </tbody>
      </table>
      <h2>${t('workshop.mechanicCard.notesDiagnosis')}</h2>
      <div class="notes">${escapeHtml(mechanicNotes).replace(/\n/g, '<br>')}</div>
      <div style="margin-top:32px; display:flex; justify-content:space-between; font-size:12px;">
        <div>${t('workshop.mechanicCard.signatureLine')}</div>
        <div>${t('workshop.mechanicCard.completionDateLine')}</div>
      </div>
      <script>window.onload = () => { window.print(); }<\/script>
      </body></html>`;
    win.document.write(html);
    win.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" /> {t('workshop.mechanicCard.dialogTitle', { number: order?.order_number })}
          </DialogTitle>
        </DialogHeader>

        {/* Vehicle / Client summary */}
        <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <div><span className="text-muted-foreground">{t('workshop.mechanicCard.vehicleInline')} </span><b>{[order?.vehicle?.brand, order?.vehicle?.model].filter(Boolean).join(' ') || '-'}</b></div>
          <div><span className="text-muted-foreground">{t('workshop.mechanicCard.plateInline')} </span><b>{order?.vehicle?.plate || '-'}</b></div>
          <div><span className="text-muted-foreground">{t('workshop.mechanicCard.vinInline')} </span><b className="font-mono text-xs">{order?.vehicle?.vin || '-'}</b></div>
          <div><span className="text-muted-foreground">{t('workshop.mechanicCard.yearInline')} </span><b>{order?.vehicle?.year || '-'}</b></div>
          <div><span className="text-muted-foreground">{t('workshop.mechanicCard.clientInline')} </span><b>{order?.client ? (order.client.client_type === 'company' ? order.client.company_name : `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim()) : '-'}</b></div>
          <div><span className="text-muted-foreground">{t('workshop.mechanicCard.phoneInline')} </span><b>{order?.client?.phone || '-'}</b></div>
        </div>

        {/* Tasks */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">{t('workshop.mechanicCard.tasksScope')}</Label>
            {mode === 'edit' && (
              <Button variant="ghost" size="sm" onClick={addTask}><Plus className="h-3.5 w-3.5 mr-1" /> {t('workshop.mechanicCard.add')}</Button>
            )}
          </div>
          {mode === 'view' ? (
            <ol className="list-decimal pl-6 space-y-1 text-sm">
              {tasks.filter(t => t.trim()).map((task, i) => <li key={i}>{task}</li>)}
              {tasks.filter(t => t.trim()).length === 0 && <li className="text-muted-foreground list-none">{t('workshop.mechanicCard.noTasks')}</li>}
            </ol>
          ) : (
            <div className="space-y-2">
              {tasks.map((task, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6 text-right">{i + 1}.</span>
                  <Input value={task} onChange={e => updateTask(i, e.target.value)} placeholder={t('workshop.mechanicCard.taskPlaceholder')} />
                  {tasks.length > 1 && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeTask(i)}><X className="h-4 w-4" /></Button>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Parts */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">{t('workshop.mechanicCard.partsList')}</Label>
            {mode === 'edit' && (
              <Button variant="ghost" size="sm" onClick={addPart}><Plus className="h-3.5 w-3.5 mr-1" /> {t('workshop.mechanicCard.add')}</Button>
            )}
          </div>
          <div className="rounded-md border overflow-hidden">
            <div className="grid grid-cols-[1fr_70px_1fr_36px] gap-2 px-2 py-1.5 bg-muted/40 text-xs font-medium text-muted-foreground">
              <div>{t('workshop.mechanicCard.colPartName')}</div><div>{t('workshop.mechanicCard.colQty')}</div><div>{t('workshop.mechanicCard.colNotesCat')}</div><div></div>
            </div>
            {parts.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_1fr_36px] gap-2 px-2 py-1.5 border-t items-center">
                {mode === 'view' ? (
                  <>
                    <div className="text-sm truncate">{p.name || <span className="text-muted-foreground italic">—</span>}</div>
                    <div className="text-sm">{p.qty}</div>
                    <div className="text-sm text-muted-foreground truncate">{p.note}</div>
                    <div></div>
                  </>
                ) : (
                  <>
                    <Input value={p.name} onChange={e => updatePart(i, 'name', e.target.value)} placeholder={t('workshop.mechanicCard.partNamePlaceholder')} className="h-8" />
                    <Input value={p.qty} onChange={e => updatePart(i, 'qty', e.target.value)} placeholder={t('workshop.mechanicCard.qtyPlaceholder')} className="h-8" />
                    <Input value={p.note} onChange={e => updatePart(i, 'note', e.target.value)} placeholder={t('workshop.mechanicCard.notePlaceholder')} className="h-8" />
                    {parts.length > 1 && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removePart(i)}><X className="h-4 w-4" /></Button>}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Mechanic notes */}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">{t('workshop.mechanicCard.notesDiagnosis')}</Label>
          {mode === 'view' ? (
            <div className="rounded-md border p-2 min-h-[80px] text-sm whitespace-pre-wrap">
              {mechanicNotes || <span className="text-muted-foreground italic">{t('workshop.mechanicCard.noNotes')}</span>}
            </div>
          ) : (
            <Textarea value={mechanicNotes} onChange={e => setMechanicNotes(e.target.value)} rows={4} placeholder={t('workshop.mechanicCard.notesPlaceholder')} />
          )}
        </div>

        <DialogFooter className="flex flex-row justify-between sm:justify-between gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.print')}
          </Button>
          {mode === 'view' ? (
            <Button onClick={() => setMode('edit')}>
              <Pencil className="h-4 w-4 mr-2" /> {t('workshop.clients.edit')}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMode('view')}>{t('common.cancel')}</Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" /> {saving ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(s: string) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
