import { useState } from 'react';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, CheckCircle, AlertTriangle, Clock, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { WorkshopDatePicker } from './WorkshopRangeCalendar';
import { WorkshopBreakdownDialog, type BreakdownRow } from './WorkshopBreakdownDialog';
import {
  PAYMENT_METHODS, EXPENSE_CATEGORIES, type PaymentMethod, type ExpenseCategory, type RecurringFrequency,
  useWorkshopRecurringCosts, useCreateRecurringCost, useUpdateRecurringCost, useDeleteRecurringCost,
  useCreateWorkshopExpense, recurringReminderLevel, advanceDueDate,
} from '@/hooks/useWorkshopFinance';

interface Props { providerId: string; }

const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

export function WorkshopRecurringCosts({ providerId }: Props) {
  const { data: costs = [] } = useWorkshopRecurringCosts(providerId);
  const createCost = useCreateRecurringCost();
  const updateCost = useUpdateRecurringCost();
  const deleteCost = useDeleteRecurringCost();
  const createExpense = useCreateWorkshopExpense();

  // Rentowność: koszty stałe przeliczone na miesiąc (tygodniowe ×4,33) vs wpływy
  // bieżącego miesiąca (płatności, bez anulowanych).
  const monthlyFixed = (costs as any[]).filter((c) => c.active)
    .reduce((s, c) => s + Number(c.amount || 0) * (c.frequency === 'weekly' ? 4.33 : 1), 0);
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const methodLabel = (m: string) => PAYMENT_METHODS.find((x) => x.value === m)?.label || m || '—';
  const { data: inflowRows = [] } = useQuery<BreakdownRow[]>({
    queryKey: ['recurring-rentownosc-inflow', providerId, monthPrefix],
    enabled: !!providerId,
    queryFn: async () => {
      const { data } = await (supabase as any).from('workshop_payments')
        .select('amount, paid_at, method, order_id, voided').eq('provider_id', providerId)
        .gte('paid_at', `${monthPrefix}-01`);
      return (data || [])
        .filter((p: any) => !p.voided && String(p.paid_at).slice(0, 7) === monthPrefix)
        .map((p: any) => ({ date: String(p.paid_at).slice(0, 10), label: methodLabel(p.method) + (p.order_id ? ' · zlecenie' : ''), amount: Number(p.amount || 0) }))
        .sort((a: BreakdownRow, b: BreakdownRow) => (a.date! < b.date! ? 1 : -1));
    },
  });
  const inflowMonth = inflowRows.reduce((s, r) => s + r.amount, 0);
  const rentownosc = Math.round((inflowMonth - monthlyFixed) * 100) / 100;
  // Rozbicie kosztów stałych przeliczonych na miesiąc
  const fixedRows: BreakdownRow[] = (costs as any[]).filter((c) => c.active)
    .map((c) => ({ label: `${c.name} (${c.frequency === 'weekly' ? 'tyg. ×4,33' : 'mies.'})`, amount: Number(c.amount || 0) * (c.frequency === 'weekly' ? 4.33 : 1) }));
  const [breakdown, setBreakdown] = useState<{ title: string; rows: BreakdownRow[] } | null>(null);
  const confirmAction = useConfirm();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('oplata');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [nextDue, setNextDue] = useState(today());
  const [endDate, setEndDate] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('przelew');
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null); setName(''); setCategory('oplata'); setAmount('');
    setFrequency('monthly'); setNextDue(today()); setEndDate(''); setMethod('przelew');
  };

  const startEdit = (c: any) => {
    setEditingId(c.id); setName(c.name); setCategory(c.category); setAmount(String(c.amount ?? ''));
    setFrequency(c.frequency); setNextDue(c.next_due_date); setEndDate(c.end_date || ''); setMethod(c.default_method || 'przelew');
  };

  const handleSave = async () => {
    const amt = Number(amount);
    if (!name.trim()) { toast.error('Podaj nazwę'); return; }
    if (!amt || amt <= 0) { toast.error('Podaj kwotę'); return; }
    const payload = { name: name.trim(), category, amount: amt, frequency, next_due_date: nextDue, end_date: endDate || null, default_method: method };
    if (editingId) {
      await updateCost.mutateAsync({ id: editingId, ...payload });
      toast.success('Zmiany zapisane');
    } else {
      await createCost.mutateAsync({ provider_id: providerId, ...payload, active: true });
    }
    resetForm();
  };

  // "Zatwierdź" = utwórz realny wydatek z szablonu i przesuń termin na następny okres.
  const approve = async (cost: any) => {
    await createExpense.mutateAsync({
      provider_id: providerId, category: cost.category, subcategory: cost.name,
      description: `Opłata cykliczna: ${cost.name}`, amount: cost.amount, method: cost.default_method,
      expense_date: today(), recurring_cost_id: cost.id, employee_id: null,
    });
    const nextDate = advanceDueDate(cost.next_due_date, cost.frequency);
    const past = cost.end_date && nextDate > cost.end_date;
    await updateCost.mutateAsync({ id: cost.id, next_due_date: nextDate, active: past ? false : cost.active });
    toast.success('Opłata zaksięgowana jako wydatek');
  };

  const reminderBadge = (cost: any) => {
    const lvl = recurringReminderLevel(cost.next_due_date);
    if (lvl === 'red') return <Badge className="bg-red-500 text-white gap-1"><AlertTriangle className="h-3 w-3" />pilne</Badge>;
    if (lvl === 'yellow') return <Badge className="bg-yellow-500 text-black gap-1"><Clock className="h-3 w-3" />wkrótce</Badge>;
    if (lvl === 'green') return <Badge className="bg-green-500 text-white gap-1"><Clock className="h-3 w-3" />zbliża się</Badge>;
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Rentowność: koszty stałe / miesiąc vs wpływy bieżącego miesiąca */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setBreakdown({ title: 'Koszty stałe / miesiąc', rows: fixedRows })}><CardContent className="py-3"><p className="text-xs text-muted-foreground">Koszty stałe / miesiąc</p><p className="text-xl font-bold tabular-nums text-destructive">{fmt(monthlyFixed)} zł</p></CardContent></Card>
        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setBreakdown({ title: 'Wpływy w tym miesiącu', rows: inflowRows })}><CardContent className="py-3"><p className="text-xs text-muted-foreground">Wpływy w tym miesiącu</p><p className="text-xl font-bold tabular-nums text-green-600">{fmt(inflowMonth)} zł</p></CardContent></Card>
        <Card className={rentownosc >= 0 ? 'border-green-500/40' : 'border-destructive/40'}><CardContent className="py-3"><p className="text-xs text-muted-foreground">Rentowność (wpływy − koszty stałe)</p><p className={`text-xl font-bold tabular-nums ${rentownosc >= 0 ? 'text-green-600' : 'text-destructive'}`}>{fmt(rentownosc)} zł</p></CardContent></Card>
      </div>
      <WorkshopBreakdownDialog open={!!breakdown} onOpenChange={(o) => { if (!o) setBreakdown(null); }} title={breakdown?.title || ''} rows={breakdown?.rows || []} />

      <Card>
        <CardContent className="py-4 space-y-4">
          <h3 className="font-semibold">{editingId ? 'Edytuj opłatę stałą' : 'Dodaj opłatę stałą (cykliczną)'}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5 col-span-2 md:col-span-1">
              <Label>Nazwa</Label>
              <Input onFocus={e => e.currentTarget.select()} value={name} onChange={e => setName(e.target.value)} placeholder="np. Czynsz" />
            </div>
            <div className="space-y-1.5">
              <Label>Kategoria</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EXPENSE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kwota</Label>
              <Input onFocus={e => e.currentTarget.select()} type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className="text-right" placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>Częstotliwość</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurringFrequency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Co tydzień</SelectItem>
                  <SelectItem value="monthly">Co miesiąc</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Najbliższy termin</Label>
              <WorkshopDatePicker value={nextDue} onChange={setNextDue} />
            </div>
            <div className="space-y-1.5">
              <Label>Do kiedy (opcj.)</Label>
              <WorkshopDatePicker value={endDate} onChange={setEndDate} placeholder="— bezterminowo —" />
            </div>
            <div className="space-y-1.5">
              <Label>Forma płatności</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={createCost.isPending || updateCost.isPending} className="gap-2">
              {editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {editingId ? 'Zapisz zmiany' : 'Dodaj opłatę'}
            </Button>
            {editingId && <Button variant="ghost" onClick={resetForm} className="gap-1"><X className="h-4 w-4" /> Anuluj edycję</Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa</TableHead>
                <TableHead>Termin</TableHead>
                <TableHead>Częstotliwość</TableHead>
                <TableHead className="text-right">Kwota</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costs.filter((c: any) => c.active).map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm tabular-nums">
                    <div className="flex items-center gap-2">{c.next_due_date} {reminderBadge(c)}</div>
                  </TableCell>
                  <TableCell className="text-sm">{c.frequency === 'weekly' ? 'co tydzień' : 'co miesiąc'}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmt(c.amount)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => approve(c)} disabled={createExpense.isPending}>
                        <CheckCircle className="h-3.5 w-3.5" /> Zatwierdź
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(c)} title="Edytuj">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={async () => { if (await confirmAction({ title: 'Usunąć opłatę cykliczną?', description: 'Tej operacji nie można cofnąć.' })) deleteCost.mutate(c.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {costs.filter((c: any) => c.active).length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Brak zdefiniowanych opłat cyklicznych.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
