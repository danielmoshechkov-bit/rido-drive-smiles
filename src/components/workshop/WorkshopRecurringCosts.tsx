import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
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

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('oplata');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [nextDue, setNextDue] = useState(today());
  const [endDate, setEndDate] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('przelew');

  const handleCreate = async () => {
    const amt = Number(amount);
    if (!name.trim()) { toast.error('Podaj nazwę'); return; }
    if (!amt || amt <= 0) { toast.error('Podaj kwotę'); return; }
    await createCost.mutateAsync({
      provider_id: providerId, name: name.trim(), category, amount: amt,
      frequency, next_due_date: nextDue, end_date: endDate || null, default_method: method, active: true,
    });
    setName(''); setAmount('');
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
    return null;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 space-y-4">
          <h3 className="font-semibold">Dodaj opłatę stałą (cykliczną)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5 col-span-2 md:col-span-1">
              <Label>Nazwa</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="np. Czynsz" />
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
              <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className="text-right" placeholder="0,00" />
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
              <Input type="date" value={nextDue} onChange={e => setNextDue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Do kiedy (opcj.)</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Forma płatności</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleCreate} disabled={createCost.isPending} className="gap-2"><Plus className="h-4 w-4" /> Dodaj opłatę</Button>
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
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { if (confirm('Usunąć opłatę cykliczną?')) deleteCost.mutate(c.id); }}>
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
