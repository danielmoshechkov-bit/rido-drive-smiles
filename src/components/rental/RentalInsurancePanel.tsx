import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { ShieldCheck, Loader2, AlertTriangle, Upload } from 'lucide-react';
import { expiryColor, daysLeft, uploadRentalFile, noScroll } from '@/components/rental/rentalLib';

interface Row {
  id: string; title: string;
  plate?: string; brand?: string; model?: string;
  oc_to?: string | null; oc_premium?: number | null; przeglad_to?: string | null;
}

export function RentalInsurancePanel({ companyId }: { companyId: string }) {
  const sb = supabase as any;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<{ row: Row; kind: 'oc' | 'przeglad' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: subs } = await sb.from('rental_subjects')
      .select('id, title').eq('owner_company_id', companyId).eq('subject_kind', 'vehicle')
      .order('created_at', { ascending: false });
    const ids = (subs || []).map((s: any) => s.id);
    let veh: Record<string, any> = {}, oc: Record<string, any> = {}, insp: Record<string, any> = {};
    if (ids.length) {
      const { data: vs } = await sb.from('rental_vehicles').select('subject_id, brand, model, plate').in('subject_id', ids);
      veh = Object.fromEntries((vs || []).map((v: any) => [v.subject_id, v]));
      const { data: ps } = await sb.from('rental_vehicle_policies').select('subject_id, valid_to, premium').eq('ptype', 'OC').in('subject_id', ids).order('valid_to', { ascending: false });
      (ps || []).forEach((p: any) => { if (!oc[p.subject_id]) oc[p.subject_id] = p; });
      const { data: is } = await sb.from('rental_vehicle_inspections').select('subject_id, valid_to').in('subject_id', ids).order('valid_to', { ascending: false });
      (is || []).forEach((i: any) => { if (!insp[i.subject_id]) insp[i.subject_id] = i; });
    }
    setRows((subs || []).map((s: any) => ({
      id: s.id, title: s.title, plate: veh[s.id]?.plate, brand: veh[s.id]?.brand, model: veh[s.id]?.model,
      oc_to: oc[s.id]?.valid_to ?? null, oc_premium: oc[s.id]?.premium ?? null, przeglad_to: insp[s.id]?.valid_to ?? null,
    })));
    setLoading(false);
  }, [companyId, sb]);

  useEffect(() => { load(); }, [load]);

  const expiringSoon = rows.filter(r => {
    const a = daysLeft(r.oc_to); const b = daysLeft(r.przeglad_to);
    return (a != null && a <= 30) || (b != null && b <= 30);
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> OC / Przegląd</h2>

      {expiringSoon.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 flex items-start gap-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div>
              <span className="font-semibold">Zbliżające się terminy (≤30 dni):</span>{' '}
              {expiringSoon.map(r => `${r.plate || r.title}`).join(', ')}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Pojazd</TableHead><TableHead>OC do</TableHead><TableHead>Cena polisy</TableHead>
                <TableHead>Przegląd do</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.plate ? `${r.plate} · ` : ''}{[r.brand, r.model].filter(Boolean).join(' ') || r.title}</TableCell>
                    <TableCell><span className={`rounded-full text-xs px-2 py-0.5 ${expiryColor(r.oc_to)}`}>{r.oc_to || 'brak'}</span></TableCell>
                    <TableCell>{r.oc_premium != null ? `${r.oc_premium} zł` : '—'}</TableCell>
                    <TableCell><span className={`rounded-full text-xs px-2 py-0.5 ${expiryColor(r.przeglad_to)}`}>{r.przeglad_to || 'brak'}</span></TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => setEdit({ row: r, kind: 'oc' })}>OC</Button>
                      <Button size="sm" variant="outline" onClick={() => setEdit({ row: r, kind: 'przeglad' })}>Przegląd</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {edit && <EditDialog sb={sb} companyId={companyId} edit={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function EditDialog({ sb, companyId, edit, onClose, onSaved }: any) {
  const isOc = edit.kind === 'oc';
  const [validTo, setValidTo] = useState('');
  const [premium, setPremium] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!validTo) { toast.error('Podaj datę ważności'); return; }
    setBusy(true);
    try {
      let fileUrl: string | null = null;
      if (file) fileUrl = await uploadRentalFile(edit.row.id, file);
      if (isOc) {
        await sb.from('rental_vehicle_policies').insert({
          company_id: companyId, subject_id: edit.row.id, ptype: 'OC',
          valid_from: new Date().toISOString().slice(0, 10), valid_to: validTo,
          premium: premium ? parseFloat(premium.replace(',', '.')) : null, file_url: fileUrl,
        });
      } else {
        await sb.from('rental_vehicle_inspections').insert({
          company_id: companyId, subject_id: edit.row.id,
          inspection_date: new Date().toISOString().slice(0, 10), valid_to: validTo, result: 'pozytywny', file_url: fileUrl,
        });
      }
      toast.success(isOc ? 'Polisa OC zapisana' : 'Przegląd zapisany'); onSaved();
    } catch (e: any) { toast.error(e.message || 'Błąd'); } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isOc ? 'Polisa OC' : 'Przegląd'} — {edit.row.plate || edit.row.title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Ważne do *</Label><Input type="date" value={validTo} onChange={e => setValidTo(e.target.value)} /></div>
          {isOc && <div className="space-y-1.5"><Label>Cena polisy (zł)</Label>
            <Input type="text" inputMode="decimal" onWheel={noScroll} value={premium} onChange={e => setPremium(e.target.value)} /></div>}
          <div className="space-y-1.5"><Label>Skan / plik (opcjonalnie)</Label>
            <label className="inline-flex">
              <Button asChild variant="outline"><span><Upload className="h-4 w-4 mr-2" />{file ? file.name : 'Wybierz plik'}</span></Button>
              <input type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Anuluj</Button>
            <Button onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Zapisz</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
