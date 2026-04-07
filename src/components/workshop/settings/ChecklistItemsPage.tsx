import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Edit2, GripVertical, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';

export function ChecklistItemsPage() {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: '', item_type: 'checkbox', is_required: false, sort_order: 0 });

  const { data: items = [] } = useQuery({
    queryKey: ['checklist-items'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await (supabase as any).from('checklist_items').select('*').eq('user_id', user.id).order('sort_order');
      if (error) throw error;
      if (!data || data.length === 0) {
        const defaults = [
          { label: 'Dowód rejestracyjny', item_type: 'checkbox', is_required: true, sort_order: 0 },
          { label: 'Poziom paliwa', item_type: 'text', is_required: false, sort_order: 1 },
          { label: 'Dokumenty w pojeździe', item_type: 'checkbox', is_required: false, sort_order: 2 },
          { label: 'Zgoda na jazdę próbną', item_type: 'checkbox', is_required: false, sort_order: 3 },
          { label: 'Uzupełnienie płynów', item_type: 'checkbox', is_required: false, sort_order: 4 },
          { label: 'Stan oświetlenia', item_type: 'checkbox', is_required: false, sort_order: 5 },
        ];
        for (const d of defaults) {
          await (supabase as any).from('checklist_items').insert({ ...d, user_id: user.id });
        }
        const { data: d2 } = await (supabase as any).from('checklist_items').select('*').eq('user_id', user.id).order('sort_order');
        return d2 || [];
      }
      return data;
    },
  });

  const saveMut = useMutation({
    mutationFn: async (payload: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      if (editId) {
        const { error } = await (supabase as any).from('checklist_items').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('checklist_items').insert({ ...payload, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checklist-items'] });
      toast.success(editId ? 'Pozycja zaktualizowana' : 'Pozycja dodana');
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('checklist_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checklist-items'] });
      toast.success('Pozycja usunięta');
    },
  });

  const closeDialog = () => {
    setShowDialog(false);
    setEditId(null);
    setForm({ label: '', item_type: 'checkbox', is_required: false, sort_order: 0 });
  };

  const openEdit = (item: any) => {
    setEditId(item.id);
    setForm({ label: item.label, item_type: item.item_type, is_required: item.is_required, sort_order: item.sort_order });
    setShowDialog(true);
  };

  const typeLabels: Record<string, string> = { checkbox: 'Checkbox', text: 'Tekst', select: 'Wybór' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Lista kontrolna przyjęcia pojazdu</h3>
          <p className="text-sm text-muted-foreground">Pozycje do sprawdzenia przy przyjęciu pojazdu do serwisu</p>
        </div>
        <Button onClick={() => { setForm(p => ({ ...p, sort_order: items.length })); setShowDialog(true); }} className="gap-2"><Plus className="h-4 w-4" /> Dodaj pozycję</Button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckSquare className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>Brak pozycji kontrolnych</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item: any) => (
            <Card key={item.id} className="border">
              <CardContent className="py-3 px-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{item.label}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{typeLabels[item.item_type] || item.item_type}</span>
                  {item.is_required && <span className="text-xs text-destructive font-medium">Wymagane</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}><Edit2 className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMut.mutate(item.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={v => !v && closeDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Edytuj pozycję' : 'Dodaj pozycję'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nazwa *</Label><Input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="np. Dowód rejestracyjny" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Typ pola</Label>
                <Select value={form.item_type} onValueChange={v => setForm(p => ({ ...p, item_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checkbox">Checkbox</SelectItem>
                    <SelectItem value="text">Tekst</SelectItem>
                    <SelectItem value="select">Wybór</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Kolejność</Label>
                <Input type="number" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_required} onCheckedChange={v => setForm(p => ({ ...p, is_required: v }))} />
              <Label>Wymagane</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Anuluj</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={!form.label.trim()}>Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
