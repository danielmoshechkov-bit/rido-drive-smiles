import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

export function OrderStatusesPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', color: '#6B7280', sort_order: 0, is_default: false });

  const { data: statuses = [] } = useQuery({
    queryKey: ['order-statuses-settings'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await (supabase as any)
        .from('order_statuses')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order');
      if (error) throw error;
      if (!data || data.length === 0) {
        // Insert defaults
        const defaults = [
          { name: 'Przyjęcie do serwisu', color: '#EF4444', sort_order: 0, is_default: true },
          { name: 'W trakcie naprawy', color: '#F59E0B', sort_order: 1 },
          { name: 'Gotowy do odbioru', color: '#10B981', sort_order: 2 },
          { name: 'Wydany', color: '#6B7280', sort_order: 3 },
          { name: 'Anulowany', color: '#374151', sort_order: 4 },
        ];
        for (const d of defaults) {
          await (supabase as any).from('order_statuses').insert({ ...d, user_id: user.id });
        }
        const { data: d2 } = await (supabase as any).from('order_statuses').select('*').eq('user_id', user.id).order('sort_order');
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
        const { error } = await (supabase as any).from('order_statuses').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('order_statuses').insert({ ...payload, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-statuses-settings'] });
      toast.success(editId ? 'Status zaktualizowany' : 'Status dodany');
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('order_statuses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-statuses-settings'] });
      toast.success('Status usunięty');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const closeDialog = () => {
    setShowAdd(false);
    setEditId(null);
    setForm({ name: '', color: '#6B7280', sort_order: 0, is_default: false });
  };

  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({ name: s.name, color: s.color, sort_order: s.sort_order, is_default: s.is_default });
    setShowAdd(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Statusy zleceń</h3>
          <p className="text-sm text-muted-foreground">Definiuj własne statusy dla zleceń warsztatowych</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2"><Plus className="h-4 w-4" /> Dodaj status</Button>
      </div>

      <div className="space-y-2">
        {statuses.map((s: any) => (
          <Card key={s.id} className="border">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: s.color }} />
                <span className="font-medium">{s.name}</span>
                {s.is_default && <Badge variant="secondary" className="text-xs">Domyślny</Badge>}
                <span className="text-xs text-muted-foreground">Kolejność: {s.sort_order}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}><Edit2 className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMut.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showAdd} onOpenChange={v => !v && closeDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Edytuj status' : 'Dodaj status'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nazwa *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="flex items-center gap-4">
              <div className="space-y-2">
                <Label>Kolor</Label>
                <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} className="w-12 h-10 rounded border cursor-pointer" />
              </div>
              <div className="space-y-2">
                <Label>Kolejność</Label>
                <Input type="number" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} className="w-20" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_default} onCheckedChange={v => setForm(p => ({ ...p, is_default: v }))} />
              <Label>Domyślny status</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Anuluj</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={!form.name.trim()}>Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
