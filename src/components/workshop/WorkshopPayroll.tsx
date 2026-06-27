import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  type PayUnit, type PayoutType,
  useWorkshopFinanceSettings, useSaveFinanceSettings,
  useWorkshopPayouts, useCreatePayout, useUpdateEmployeePay, computeBaseDue,
} from '@/hooks/useWorkshopFinance';

interface Props { providerId: string; }

const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DAYS = [{ iso: 1, l: 'Pon' }, { iso: 2, l: 'Wt' }, { iso: 3, l: 'Śr' }, { iso: 4, l: 'Czw' }, { iso: 5, l: 'Pt' }, { iso: 6, l: 'Sob' }, { iso: 7, l: 'Niedz' }];
const PAY_UNITS: { value: PayUnit; label: string }[] = [
  { value: 'hour', label: 'godzina' }, { value: 'day', label: 'dzień' }, { value: 'week', label: 'tydzień' }, { value: 'month', label: 'miesiąc' },
];

function startOfWeek() { const d = new Date(); const iso = d.getDay() === 0 ? 7 : d.getDay(); d.setDate(d.getDate() - (iso - 1)); return d.toISOString().slice(0, 10); }
function startOfMonth() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }
const today = () => new Date().toISOString().slice(0, 10);

export function WorkshopPayroll({ providerId }: Props) {
  const { data: settings } = useWorkshopFinanceSettings(providerId);
  const saveSettings = useSaveFinanceSettings();
  const updatePay = useUpdateEmployeePay();
  const createPayout = useCreatePayout();

  const [from, setFrom] = useState(startOfWeek());
  const [to, setTo] = useState(today());

  // local schedule editor
  const [workDays, setWorkDays] = useState<number[] | null>(null);
  const [workStart, setWorkStart] = useState<string | null>(null);
  const [workEnd, setWorkEnd] = useState<string | null>(null);
  const sched = {
    work_days: workDays ?? settings?.work_days ?? [1, 2, 3, 4, 5],
    work_start: workStart ?? settings?.work_start ?? '08:00',
    work_end: workEnd ?? settings?.work_end ?? '16:00',
  };
  const toggleDay = (iso: number) =>
    setWorkDays((prev) => {
      const cur = prev ?? settings?.work_days ?? [1, 2, 3, 4, 5];
      return cur.includes(iso) ? cur.filter((d: number) => d !== iso) : [...cur, iso].sort();
    });

  const { data: employees = [] } = useQuery({
    queryKey: ['workshop-payroll-employees', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_employees').select('id, name, pay_rate, pay_unit, hourly_rate').eq('provider_id', providerId).eq('is_active', true).order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: payouts = [] } = useWorkshopPayouts(providerId, { from, to });

  // rate editor state per employee
  const [rateEdit, setRateEdit] = useState<Record<string, { rate: string; unit: PayUnit }>>({});
  const getRate = (e: any) => rateEdit[e.id] ?? { rate: String(e.pay_rate ?? e.hourly_rate ?? ''), unit: (e.pay_unit ?? 'hour') as PayUnit };

  // payout dialog
  const [payoutFor, setPayoutFor] = useState<any | null>(null);
  const [payoutType, setPayoutType] = useState<PayoutType>('zaliczka');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutNote, setPayoutNote] = useState('');

  const payoutsForEmp = (id: string) => payouts.filter((p: any) => p.employee_id === id);
  const sumType = (id: string, types: PayoutType[]) => payoutsForEmp(id).filter((p: any) => types.includes(p.type)).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

  const settle = (e: any) => {
    const r = getRate(e);
    const base = computeBaseDue(Number(r.rate) || 0, r.unit, sched, from, to);
    const premie = sumType(e.id, ['premia']);
    const paid = sumType(e.id, ['zaliczka', 'wyplata']);
    const due = Math.round((base + premie) * 100) / 100;
    return { base, premie, paid, due, left: Math.round((due - paid) * 100) / 100 };
  };

  const saveRate = async (e: any) => {
    const r = getRate(e);
    await updatePay.mutateAsync({ id: e.id, pay_rate: Number(r.rate) || 0, pay_unit: r.unit });
    toast.success('Stawka zapisana');
  };

  const savePayout = async () => {
    const amt = Number(payoutAmount);
    if (!amt || amt <= 0) { toast.error('Podaj kwotę'); return; }
    await createPayout.mutateAsync({
      provider_id: providerId, employee_id: payoutFor.id, type: payoutType, amount: amt,
      period_start: from, period_end: to, note: payoutNote || null,
    });
    setPayoutAmount(''); setPayoutNote(''); setPayoutFor(null);
  };

  return (
    <div className="space-y-4">
      {/* Schedule */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <h3 className="font-semibold">Grafik warsztatu (do rozliczania stawek)</h3>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label>Dni robocze</Label>
              <div className="flex gap-1">
                {DAYS.map((d) => (
                  <Button key={d.iso} type="button" variant={sched.work_days.includes(d.iso) ? 'default' : 'outline'} size="sm" className="h-8 w-11 px-0" onClick={() => toggleDay(d.iso)}>{d.l}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Od</Label>
              <Input type="time" value={sched.work_start} onChange={e => setWorkStart(e.target.value)} className="w-28" />
            </div>
            <div className="space-y-1.5">
              <Label>Do</Label>
              <Input type="time" value={sched.work_end} onChange={e => setWorkEnd(e.target.value)} className="w-28" />
            </div>
            <Button onClick={() => saveSettings.mutate({ provider_id: providerId, ...sched })} disabled={saveSettings.isPending} className="gap-2">
              {saveSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Zapisz grafik
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Period */}
      <Card>
        <CardContent className="py-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5"><Label>Okres od</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>do</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <Button variant="outline" size="sm" className="h-9" onClick={() => { setFrom(startOfWeek()); setTo(today()); }}>Ten tydzień</Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => { setFrom(startOfMonth()); setTo(today()); }}>Ten miesiąc</Button>
        </CardContent>
      </Card>

      {/* Employees settlement */}
      <Card>
        <CardContent className="py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pracownik</TableHead>
                <TableHead>Stawka</TableHead>
                <TableHead className="text-right">Należność (baza)</TableHead>
                <TableHead className="text-right">Premie</TableHead>
                <TableHead className="text-right">Wypłacono</TableHead>
                <TableHead className="text-right">Pozostało</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e: any) => {
                const r = getRate(e);
                const s = settle(e);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input type="number" step="0.01" value={r.rate} onChange={ev => setRateEdit(p => ({ ...p, [e.id]: { ...getRate(e), rate: ev.target.value } }))} className="h-8 w-20 text-right" />
                        <Select value={r.unit} onValueChange={(v) => setRateEdit(p => ({ ...p, [e.id]: { ...getRate(e), unit: v as PayUnit } }))}>
                          <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>{PAY_UNITS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => saveRate(e)} title="Zapisz stawkę"><Save className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(s.base)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(s.premie)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(s.paid)}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${s.left > 0 ? 'text-amber-600' : 'text-green-600'}`}>{fmt(s.left)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => { setPayoutFor(e); setPayoutType('zaliczka'); }}>
                        <Plus className="h-3.5 w-3.5" /> Wypłata/Premia
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {employees.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Brak aktywnych pracowników.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payout dialog */}
      <Dialog open={!!payoutFor} onOpenChange={(v) => { if (!v) setPayoutFor(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{payoutFor?.name} — dodaj pozycję</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Typ</Label>
              <Select value={payoutType} onValueChange={(v) => setPayoutType(v as PayoutType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="zaliczka">Zaliczka</SelectItem>
                  <SelectItem value="wyplata">Wypłata</SelectItem>
                  <SelectItem value="premia">Premia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kwota</Label>
              <Input type="number" step="0.01" min="0" value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)} className="text-right" placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>Notatka (opcj.)</Label>
              <Input value={payoutNote} onChange={e => setPayoutNote(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">Premia dolicza się do „należy się"; zaliczka/wypłata pomniejszają „pozostało".</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPayoutFor(null)}>Anuluj</Button>
              <Button onClick={savePayout} disabled={createPayout.isPending} className="gap-2">{createPayout.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Zapisz</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
