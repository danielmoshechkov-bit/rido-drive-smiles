import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wrench, Printer, Save, Plus, X, Pencil, Eye, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PORTAL_LANGS } from '@/i18n';
import { translateContentBatch } from '@/lib/contentTranslation';
import { useMechanicCardPrefs, MECHANIC_CARD_FIELDS } from '@/hooks/useMechanicCardPrefs';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

interface PartLine { name: string; qty: string; note: string; }

// Kody projektu -> locale BCP-47 do formatowania daty na wydruku
// (uwaga: ukraiński to w projekcie 'ua', ale Intl wymaga 'uk-UA').
const INTL_LOCALE: Record<string, string> = {
  pl: 'pl-PL', en: 'en-GB', ru: 'ru-RU', ua: 'uk-UA', kz: 'kk-KZ', de: 'de-DE', vi: 'vi-VN',
};

export function WorkshopMechanicCardDialog({ open, onOpenChange, order }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [tasks, setTasks] = useState<string[]>([]);
  const [parts, setParts] = useState<PartLine[]>([]);
  const [mechanicNotes, setMechanicNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const { visibleFields: vf, printLang, setVisibleField, setPrintLang } = useMechanicCardPrefs();
  // Ostatnio wybrany język wydruku (per warsztat, z DB); pierwszy raz = język UI.
  const effectivePrintLang = printLang || (i18n.language || 'pl').slice(0, 2);

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

  const handlePrint = async () => {
    // Okno otwieramy SYNCHRONICZNIE (gest użytkownika), zanim poleci await tłumaczenia —
    // inaczej popup-blocker utnie wydruk.
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) return;
    setPrinting(true);

    const lang = effectivePrintLang;
    // Etykiety/nagłówki karty w wybranym języku wydruku (niezależnie od języka UI).
    const pt = i18n.getFixedT(lang);
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;color:#555;padding:24px;">${pt('workshop.mechanicCard.printPreparing')}</body></html>`);

    const cleanTasks = tasks.filter(x => x.trim());
    const cleanParts = parts.filter(p => p.name.trim());

    // Treści wpisane ręcznie tłumaczy AI (wspólny silnik translate-content, terminologia
    // motoryzacyjna + globalny cache => drugi wydruk w tym samym języku jest natychmiastowy).
    // NIE tłumaczymy: marki/modelu, VIN, nr rej., roku, przebiegu, paliwa, danych klienta i ilości.
    let trTasks = cleanTasks;
    let trParts = cleanParts;
    let trNotes = mechanicNotes;
    try {
      const items = [
        ...(vf.tasks ? cleanTasks.map((text, i) => ({ entity_type: 'workshop_order', entity_id: order.id, field: `mc_task_${i}`, text, source_lang: 'auto' })) : []),
        ...(vf.parts ? cleanParts.flatMap((p, i) => [
          { entity_type: 'workshop_order', entity_id: order.id, field: `mc_part_name_${i}`, text: p.name, source_lang: 'auto' },
          ...(p.note.trim() ? [{ entity_type: 'workshop_order', entity_id: order.id, field: `mc_part_note_${i}`, text: p.note, source_lang: 'auto' }] : []),
        ]) : []),
        ...(vf.notes && mechanicNotes.trim() ? [{ entity_type: 'workshop_order', entity_id: order.id, field: 'mc_notes', text: mechanicNotes, source_lang: 'auto' }] : []),
      ];
      if (items.length) {
        const map = await translateContentBatch(items, lang, 'auto', 'automotive');
        const k = (field: string) => map[`workshop_order:${order.id}:${field}`];
        trTasks = cleanTasks.map((text, i) => k(`mc_task_${i}`) || text);
        trParts = cleanParts.map((p, i) => ({ ...p, name: k(`mc_part_name_${i}`) || p.name, note: p.note.trim() ? (k(`mc_part_note_${i}`) || p.note) : p.note }));
        trNotes = k('mc_notes') || mechanicNotes;
      }
    } catch (e: any) {
      console.warn('[mechanic-card] print translation failed, using originals', e?.message);
    }

    const v = order.vehicle || {};
    const c = order.client || {};
    const clientName = c.client_type === 'company' ? c.company_name : `${c.first_name || ''} ${c.last_name || ''}`.trim();
    const printDate = new Date().toLocaleDateString(INTL_LOCALE[lang] || 'pl-PL');
    const html = `
      <!doctype html><html><head><meta charset="utf-8"><title>${pt('workshop.mechanicCard.printTitle', { number: order.order_number || '' })}</title>
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
      <h1>${pt('workshop.mechanicCard.printHeading')}</h1>
      <div style="font-size:13px;color:#555;">${pt('workshop.mechanicCard.printOrderLabel')}: <b>${order.order_number || ''}</b> · ${pt('workshop.mechanicCard.printDateLabel')}: ${printDate}</div>
      <h2>${pt('workshop.mechanicCard.vehicleData')}</h2>
      <div class="grid">
        ${vf.vehicle ? `<div><b>${pt('workshop.mechanicCard.brandModel')}:</b> ${[v.brand, v.model].filter(Boolean).join(' ') || '-'}</div>` : ''}
        ${vf.plate ? `<div><b>${pt('workshop.mechanicCard.plate')}:</b> ${v.plate || '-'}</div>` : ''}
        ${vf.vin ? `<div><b>${pt('workshop.mechanicCard.vin')}:</b> ${v.vin || '-'}</div>` : ''}
        ${vf.year ? `<div><b>${pt('workshop.mechanicCard.year')}:</b> ${v.year || '-'}</div>` : ''}
        ${vf.mileage ? `<div><b>${pt('workshop.mechanicCard.mileage')}:</b> ${order.mileage ? order.mileage + ' km' : '-'}</div>` : ''}
        ${vf.fuel ? `<div><b>${pt('workshop.mechanicCard.fuel')}:</b> ${v.fuel_type || '-'}</div>` : ''}
        ${vf.client ? `<div><b>${pt('workshop.mechanicCard.client')}:</b> ${escapeHtml(clientName) || '-'}</div>` : ''}
        ${vf.phone ? `<div><b>${pt('workshop.mechanicCard.phone')}:</b> ${c.phone || '-'}</div>` : ''}
      </div>
      ${vf.tasks ? `
      <h2>${pt('workshop.mechanicCard.tasksScope')}</h2>
      <ol>${trTasks.map(x => `<li>${escapeHtml(x)}</li>`).join('') || '<li class="empty"></li>'}</ol>` : ''}
      ${vf.parts ? `
      <h2>${pt('workshop.mechanicCard.partsListPrint')}</h2>
      <table>
        <thead><tr><th style="width:50%">${pt('workshop.mechanicCard.colPartName')}</th><th style="width:15%">${pt('workshop.mechanicCard.colQty')}</th><th>${pt('workshop.mechanicCard.colNotesCatalog')}</th></tr></thead>
        <tbody>
          ${trParts.map(p => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.qty)}</td><td>${escapeHtml(p.note)}</td></tr>`).join('')}
          ${Array.from({ length: Math.max(6 - trParts.length, 3) }).map(() => '<tr><td>&nbsp;</td><td></td><td></td></tr>').join('')}
        </tbody>
      </table>` : ''}
      ${vf.notes ? `
      <h2>${pt('workshop.mechanicCard.notesDiagnosis')}</h2>
      <div class="notes">${escapeHtml(trNotes).replace(/\n/g, '<br>')}</div>` : ''}
      <div style="margin-top:32px; display:flex; justify-content:space-between; font-size:12px;">
        <div>${pt('workshop.mechanicCard.signatureLine')}</div>
        <div>${pt('workshop.mechanicCard.completionDateLine')}</div>
      </div>
      <script>window.onload = () => { window.print(); }<\/script>
      </body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
    setPrinting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" /> {t('workshop.mechanicCard.dialogTitle', { number: order?.order_number })}
          </DialogTitle>
        </DialogHeader>

        {/* Vehicle / Client summary — pola sterowane sekcją "Dane widoczne dla pracownika" */}
        {(vf.vehicle || vf.plate || vf.vin || vf.year || vf.client || vf.phone) && (
        <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          {vf.vehicle && <div><span className="text-muted-foreground">{t('workshop.mechanicCard.vehicleInline')} </span><b>{[order?.vehicle?.brand, order?.vehicle?.model].filter(Boolean).join(' ') || '-'}</b></div>}
          {vf.plate && <div><span className="text-muted-foreground">{t('workshop.mechanicCard.plateInline')} </span><b>{order?.vehicle?.plate || '-'}</b></div>}
          {vf.vin && <div><span className="text-muted-foreground">{t('workshop.mechanicCard.vinInline')} </span><b className="font-mono text-xs">{order?.vehicle?.vin || '-'}</b></div>}
          {vf.year && <div><span className="text-muted-foreground">{t('workshop.mechanicCard.yearInline')} </span><b>{order?.vehicle?.year || '-'}</b></div>}
          {vf.client && <div><span className="text-muted-foreground">{t('workshop.mechanicCard.clientInline')} </span><b>{order?.client ? (order.client.client_type === 'company' ? order.client.company_name : `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim()) : '-'}</b></div>}
          {vf.phone && <div><span className="text-muted-foreground">{t('workshop.mechanicCard.phoneInline')} </span><b>{order?.client?.phone || '-'}</b></div>}
        </div>
        )}

        {/* Tasks */}
        {vf.tasks && (
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
        )}

        {/* Parts */}
        {vf.parts && (
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
        )}

        {/* Mechanic notes */}
        {vf.notes && (
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
        )}

        {/* Dane widoczne dla pracownika — odznaczone pola znikają z karty i wydruku
            (dane w zleceniu zostają). Zestaw zapamiętywany per warsztat (DB). */}
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Eye className="h-4 w-4 text-primary" /> {t('workshop.mechanicCard.visibleFieldsTitle')}
          </div>
          <p className="text-xs text-muted-foreground">{t('workshop.mechanicCard.visibleFieldsHint')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
            {MECHANIC_CARD_FIELDS.map(field => (
              <div key={field} className="flex items-center gap-2">
                {/* id + htmlFor: Radix Checkbox to <button>, samo owinięcie <label> nie
                    przekazuje kliknięcia w tekst — musi być jawne powiązanie. */}
                <Checkbox
                  id={`mc-field-${field}`}
                  checked={vf[field]}
                  onCheckedChange={v => setVisibleField(field, v === true)}
                />
                <Label htmlFor={`mc-field-${field}`} className="text-sm font-normal cursor-pointer">
                  {t(`workshop.mechanicCard.field_${field}`)}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="flex flex-row justify-between sm:justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handlePrint} disabled={printing}>
              {printing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
              {t('workshop.orderDetail.print')}
            </Button>
            {/* Język wydruku — etykiety karty + tłumaczenie AI treści; zapamiętywany. */}
            <Select value={effectivePrintLang} onValueChange={setPrintLang}>
              <SelectTrigger className="h-9 w-[150px]" title={t('workshop.mechanicCard.printLangLabel')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PORTAL_LANGS.map(l => (
                  <SelectItem key={l.code} value={l.code}>{l.flag} {l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
