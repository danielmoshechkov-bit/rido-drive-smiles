import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Paperclip, ShoppingCart, Receipt, ArrowUpCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  EXPENSE_CATEGORIES, PAYMENT_METHODS, type ExpenseCategory, type PaymentMethod,
  useCreateWorkshopExpense, uploadExpenseDocument,
} from '@/hooks/useWorkshopFinance';

const today = () => new Date().toISOString().slice(0, 10);

const SUBCATEGORIES: Record<ExpenseCategory, string[]> = {
  zakup: ['Części', 'Materiały', 'Internet', 'Śmieci', 'Inne'],
  oplata: ['Czynsz', 'Prąd', 'Abonament', 'Inne'],
  wyplata: ['Wypłata z kasy', 'Pensja', 'Zaliczka', 'Premia'],
};

const TITLES: Record<ExpenseCategory, { title: string; Icon: any }> = {
  zakup: { title: 'Dodaj zakup', Icon: ShoppingCart },
  oplata: { title: 'Dodaj opłatę', Icon: Receipt },
  wyplata: { title: 'Dodaj wypłatę z kasy', Icon: ArrowUpCircle },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  defaultCategory: ExpenseCategory;
}

// Pełny formularz wydatku w oknie (zakup / opłata / wypłata) — bez przeskoku na zakładkę.
export function WorkshopExpenseDialog({ open, onOpenChange, providerId, defaultCategory }: Props) {
  const createExpense = useCreateWorkshopExpense();
  const [category, setCategory] = useState<ExpenseCategory>(defaultCategory);
  const [subcategory, setSubcategory] = useState(SUBCATEGORIES[defaultCategory][0]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('gotowka');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(today());
  const [employeeId, setEmployeeId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [who, setWho] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCategory(defaultCategory); setSubcategory(SUBCATEGORIES[defaultCategory][0]);
      setAmount(''); setMethod('gotowka'); setDescription(''); setExpenseDate(today()); setEmployeeId(''); setFile(null); setWho('');
    }
  }, [open, defaultCategory]);

  const { data: employees = [] } = useQuery({
    queryKey: ['workshop-employees-for-expense-dialog', providerId],
    enabled: !!providerId && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_employees').select('id, name').eq('provider_id', providerId).eq('is_active', true).order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const setCat = (c: ExpenseCategory) => { setCategory(c); setSubcategory(SUBCATEGORIES[c][0]); if (c !== 'wyplata') setEmployeeId(''); };

  const handleSave = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error('Podaj kwotę'); return; }
    setSaving(true);
    try {
      let documentUrl: string | null = null;
      if (file) documentUrl = await uploadExpenseDocument(providerId, file);
      await createExpense.mutateAsync({
        provider_id: providerId, category, subcategory: subcategory || null,
        description: description || null, amount: amt, method, document_url: documentUrl,
        expense_date: expenseDate, employee_id: category === 'wyplata' && employeeId ? employeeId : null,
        created_by_name: who.trim() || null,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const { title, Icon } = TITLES[defaultCategory];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Icon className="h-5 w-5" /> {title}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Kategoria</Label>
            <Select value={category} onValueChange={(v) => setCat(v as ExpenseCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Podkategoria</Label>
            <Select value={subcategory} onValueChange={setSubcategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SUBCATEGORIES[category].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Kwota</Label>
            <Input onFocus={e => e.currentTarget.select()} type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" className="text-right" />
            onFocus={e => e.currentTarget.select()}
          </div>
          <div className="space-y-1.5">
            <Label>Forma płatności</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input onFocus={e => e.currentTarget.select()} type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
          </div>
          {category === 'wyplata' && (
            <div className="space-y-1.5">
              <Label>Pracownik (opcj.)</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="— wybierz —" /></SelectTrigger>
                <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5 col-span-2">
            <Label>Opis / za co</Label>
            <Input onFocus={e => e.currentTarget.select()} value={description} onChange={e => setDescription(e.target.value)} placeholder="np. olej + filtr, faktura FV/123" />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label className="flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> Dokument (faktura/paragon)</Label>
            <Input onFocus={e => e.currentTarget.select()} type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Zarejestrował (opcj.)</Label>
            <Input onFocus={e => e.currentTarget.select()} value={who} onChange={e => setWho(e.target.value)} placeholder="imię i nazwisko" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Zapisz</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
