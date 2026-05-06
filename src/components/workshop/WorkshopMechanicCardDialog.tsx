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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

interface PartLine { name: string; qty: string; note: string; }

export function WorkshopMechanicCardDialog({ open, onOpenChange, order }: Props) {
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
      toast.success('Karta mechanika zapisana');
      setMode('view');
    } catch (e: any) {
      toast.error('Błąd zapisu: ' + e.message);
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
      <!doctype html><html><head><meta charset="utf-8"><title>Karta mechanika ${order.order_number || ''}</title>
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
      <h1>Karta mechanika</h1>
      <div style="font-size:13px;color:#555;">Zlecenie: <b>${order.order_number || ''}</b> · Data: ${new Date().toLocaleDateString('pl-PL')}</div>
      <h2>Dane pojazdu</h2>
      <div class="grid">
        <div><b>Marka / Model:</b> ${[v.brand, v.model].filter(Boolean).join(' ') || '-'}</div>
        <div><b>Nr rej.:</b> ${v.plate || '-'}</div>
        <div><b>VIN:</b> ${v.vin || '-'}</div>
        <div><b>Rok:</b> ${v.year || '-'}</div>
        <div><b>Przebieg:</b> ${order.mileage ? order.mileage + ' km' : '-'}</div>
        <div><b>Paliwo:</b> ${v.fuel_type || '-'}</div>
        <div><b>Klient:</b> ${clientName || '-'}</div>
        <div><b>Telefon:</b> ${c.phone || '-'}</div>
      </div>
      <h2>Zakres prac do wykonania</h2>
      <ol>${tasks.filter(t => t.trim()).map(t => `<li>${escapeHtml(t)}</li>`).join('') || '<li class="empty"></li>'}</ol>
      <h2>Lista części potrzebnych do naprawy (do uzupełnienia przez mechanika)</h2>
      <table>
        <thead><tr><th style="width:50%">Nazwa części</th><th style="width:15%">Ilość</th><th>Uwagi / nr katalogowy</th></tr></thead>
        <tbody>
          ${parts.filter(p => p.name.trim()).map(p => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.qty)}</td><td>${escapeHtml(p.note)}</td></tr>`).join('')}
          ${Array.from({ length: Math.max(6 - parts.filter(p => p.name.trim()).length, 3) }).map(() => '<tr><td>&nbsp;</td><td></td><td></td></tr>').join('')}
        </tbody>
      </table>
      <h2>Notatki mechanika / diagnoza</h2>
      <div class="notes">${escapeHtml(mechanicNotes).replace(/\n/g, '<br>')}</div>
      <div style="margin-top:32px; display:flex; justify-content:space-between; font-size:12px;">
        <div>Mechanik (podpis): ____________________</div>
        <div>Data zakończenia: ____________________</div>
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
            <Wrench className="h-5 w-5 text-primary" /> Karta mechanika — {order?.order_number}
          </DialogTitle>
        </DialogHeader>

        {/* Vehicle / Client summary */}
        <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <div><span className="text-muted-foreground">Pojazd: </span><b>{[order?.vehicle?.brand, order?.vehicle?.model].filter(Boolean).join(' ') || '-'}</b></div>
          <div><span className="text-muted-foreground">Nr rej.: </span><b>{order?.vehicle?.plate || '-'}</b></div>
          <div><span className="text-muted-foreground">VIN: </span><b className="font-mono text-xs">{order?.vehicle?.vin || '-'}</b></div>
          <div><span className="text-muted-foreground">Rok: </span><b>{order?.vehicle?.year || '-'}</b></div>
          <div><span className="text-muted-foreground">Klient: </span><b>{order?.client ? (order.client.client_type === 'company' ? order.client.company_name : `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim()) : '-'}</b></div>
          <div><span className="text-muted-foreground">Tel.: </span><b>{order?.client?.phone || '-'}</b></div>
        </div>

        {/* Tasks */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Zakres prac do wykonania</Label>
            {mode === 'edit' && (
              <Button variant="ghost" size="sm" onClick={addTask}><Plus className="h-3.5 w-3.5 mr-1" /> Dodaj</Button>
            )}
          </div>
          {mode === 'view' ? (
            <ol className="list-decimal pl-6 space-y-1 text-sm">
              {tasks.filter(t => t.trim()).map((t, i) => <li key={i}>{t}</li>)}
              {tasks.filter(t => t.trim()).length === 0 && <li className="text-muted-foreground list-none">Brak zadań</li>}
            </ol>
          ) : (
            <div className="space-y-2">
              {tasks.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6 text-right">{i + 1}.</span>
                  <Input value={t} onChange={e => updateTask(i, e.target.value)} placeholder="Opis zadania..." />
                  {tasks.length > 1 && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeTask(i)}><X className="h-4 w-4" /></Button>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Parts */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Lista części (mechanik uzupełnia)</Label>
            {mode === 'edit' && (
              <Button variant="ghost" size="sm" onClick={addPart}><Plus className="h-3.5 w-3.5 mr-1" /> Dodaj</Button>
            )}
          </div>
          <div className="rounded-md border overflow-hidden">
            <div className="grid grid-cols-[1fr_70px_1fr_36px] gap-2 px-2 py-1.5 bg-muted/40 text-xs font-medium text-muted-foreground">
              <div>Nazwa części</div><div>Ilość</div><div>Uwagi / nr kat.</div><div></div>
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
                    <Input value={p.name} onChange={e => updatePart(i, 'name', e.target.value)} placeholder="Nazwa" className="h-8" />
                    <Input value={p.qty} onChange={e => updatePart(i, 'qty', e.target.value)} placeholder="szt." className="h-8" />
                    <Input value={p.note} onChange={e => updatePart(i, 'note', e.target.value)} placeholder="nr kat. / uwagi" className="h-8" />
                    {parts.length > 1 && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removePart(i)}><X className="h-4 w-4" /></Button>}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Mechanic notes */}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Notatki mechanika / diagnoza</Label>
          {mode === 'view' ? (
            <div className="rounded-md border p-2 min-h-[80px] text-sm whitespace-pre-wrap">
              {mechanicNotes || <span className="text-muted-foreground italic">Brak notatek</span>}
            </div>
          ) : (
            <Textarea value={mechanicNotes} onChange={e => setMechanicNotes(e.target.value)} rows={4} placeholder="Diagnoza, sugestie, dodatkowe uwagi..." />
          )}
        </div>

        <DialogFooter className="flex flex-row justify-between sm:justify-between gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" /> Drukuj
          </Button>
          {mode === 'view' ? (
            <Button onClick={() => setMode('edit')}>
              <Pencil className="h-4 w-4 mr-2" /> Edytuj
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMode('view')}>Anuluj</Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" /> {saving ? 'Zapisywanie...' : 'Zapisz'}
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
