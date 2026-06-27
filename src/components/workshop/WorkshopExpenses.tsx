import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Loader2, Trash2, Paperclip, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  EXPENSE_CATEGORIES, PAYMENT_METHODS, type ExpenseCategory, type PaymentMethod,
  useWorkshopExpenses, useCreateWorkshopExpense, useDeleteWorkshopExpense, uploadExpenseDocument,
} from '@/hooks/useWorkshopFinance';
import { WorkshopRecurringCosts } from './WorkshopRecurringCosts';

interface Props { providerId: string; initialTab?: 'wydatki' | 'cykliczne'; }

const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

const SUBCATEGORIES: Record<ExpenseCategory, string[]> = {
  zakup: ['Części', 'Materiały', 'Internet', 'Śmieci', 'Inne'],
  oplata: ['Czynsz', 'Prąd', 'Abonament', 'Inne'],
  wyplata: ['Pensja', 'Zaliczka', 'Premia'],
};

export function WorkshopExpenses({ providerId, initialTab = 'wydatki' }: Props) {
  const [category, setCategory] = useState<ExpenseCategory>('zakup');
  const [subcategory, setSubcategory] = useState('Części');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('gotowka');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(today());
  const [employeeId, setEmployeeId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState<'wydatki' | 'cykliczne'>(initialTab);
  const [filterCat, setFilterCat] = useState<ExpenseCategory | 'all'>('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const { data: expenses = [] } = useWorkshopExpenses(providerId, { category: filterCat, from: filterFrom || undefined, to: filterTo || undefined });
  const createExpense = useCreateWorkshopExpense();
  const deleteExpense = useDeleteWorkshopExpense();

  const { data: employees = [] } = useQuery({
    queryKey: ['workshop-employees-for-expenses', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_employees').select('id, name').eq('provider_id', providerId).eq('is_active', true).order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const setCat = (c: ExpenseCategory) => { setCategory(c); setSubcategory(SUBCATEGORIES[c][0]); if (c !== 'wyplata') setEmployeeId(''); };

  const total = expenses.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);

  const handleSave = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error('Podaj kwotę'); return; }
    setSaving(true);
    try {
      let documentUrl: string | null = null;
      if (file) documentUrl = await uploadExpenseDocument(providerId, file);
      await createExpense.mutateAsync({
        provider_id: providerId,
        category,
        subcategory: subcategory || null,
        description: description || null,
        amount: amt,
        method,
        document_url: documentUrl,
        expense_date: expenseDate,
        employee_id: category === 'wyplata' && employeeId ? employeeId : null,
      });
      setAmount(''); setDescription(''); setFile(null); setEmployeeId('');
    } finally {
      setSaving(false);
    }
  };

  const tabToggle = (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
      <Button variant={tab === 'wydatki' ? 'default' : 'ghost'} size="sm" className="h-9 px-4 font-medium" onClick={() => setTab('wydatki')}>Wydatki jednorazowe</Button>
      <Button variant={tab === 'cykliczne' ? 'default' : 'ghost'} size="sm" className="h-9 px-4 font-medium" onClick={() => setTab('cykliczne')}>Opłaty stałe</Button>
    </div>
  );

  if (tab === 'cykliczne') {
    return (
      <div className="space-y-4">
        {tabToggle}
        <WorkshopRecurringCosts providerId={providerId} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tabToggle}
      {/* Form */}
      <Card>
        <CardContent className="py-4 space-y-4">
          <h3 className="font-semibold">Zarejestruj zakup / wydatek</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Kategoria</Label>
              <Select value={category} onValueChange={(v) => setCat(v as ExpenseCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Podkategoria</Label>
              <Select value={subcategory} onValueChange={setSubcategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUBCATEGORIES[category].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kwota</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" className="text-right" />
            </div>
            <div className="space-y-1.5">
              <Label>Forma płatności</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
            </div>
            {category === 'wyplata' && (
              <div className="space-y-1.5">
                <Label>Pracownik</Label>
                <Select value={employeeId} onValueChange={setEmployeeId}>
                  <SelectTrigger><SelectValue placeholder="— wybierz —" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5 col-span-2">
              <Label>Opis / za co</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="np. olej + filtr, faktura FV/123" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> Dokument (faktura/paragon)</Label>
              <Input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Zapisz wydatek
          </Button>
        </CardContent>
      </Card>

      {/* Filters + list */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterCat} onValueChange={(v) => setFilterCat(v as any)}>
              <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie kategorie</SelectItem>
                {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="h-8 w-[150px]" title="Od" />
            <span className="text-muted-foreground">—</span>
            <Input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="h-8 w-[150px]" title="Do" />
            <div className="flex-1" />
            <span className="text-sm text-muted-foreground">Razem: <span className="font-semibold text-foreground tabular-nums">{fmt(total)} zł</span></span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Kategoria</TableHead>
                <TableHead>Opis</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead className="text-right">Kwota</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm tabular-nums">{e.expense_date}</TableCell>
                  <TableCell className="text-sm">
                    {EXPENSE_CATEGORIES.find(c => c.value === e.category)?.label || e.category}
                    {e.subcategory ? ` · ${e.subcategory}` : ''}
                    {e.employee?.name ? ` · ${e.employee.name}` : ''}
                  </TableCell>
                  <TableCell className="text-sm">
                    {e.description || '—'}
                    {e.document_url && (
                      <a href={e.document_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center text-primary hover:underline text-xs">
                        <Paperclip className="h-3 w-3 mr-0.5" />dok <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{PAYMENT_METHODS.find(m => m.value === e.method)?.label || e.method || '—'}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmt(e.amount)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { if (confirm('Usunąć wydatek?')) deleteExpense.mutate(e.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {expenses.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Brak wydatków w wybranym zakresie.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
