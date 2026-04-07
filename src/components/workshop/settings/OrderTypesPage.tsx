import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export function OrderTypesPage() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');

  const { data: types = [] } = useQuery({
    queryKey: ['order-types-settings'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await (supabase as any).from('order_types').select('*').eq('user_id', user.id).order('created_at');
      if (error) throw error;
      if (!data || data.length === 0) {
        const defaults = ['Serwis ogólny', 'Przegląd', 'Diagnostyka', 'Blacharnia', 'Wymiana opon', 'Inne'];
        for (const name of defaults) {
          await (supabase as any).from('order_types').insert({ name, user_id: user.id });
        }
        const { data: d2 } = await (supabase as any).from('order_types').select('*').eq('user_id', user.id).order('created_at');
        return d2 || [];
      }
      return data;
    },
  });

  const addMut = useMutation({
    mutationFn: async (name: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase as any).from('order_types').insert({ name, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-types-settings'] });
      setNewName('');
      toast.success('Rodzaj dodany');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('order_types').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-types-settings'] });
      toast.success('Rodzaj usunięty');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">Rodzaje zleceń</h3>
        <p className="text-sm text-muted-foreground">Definiuj typy zleceń dla warsztatu</p>
      </div>

      <div className="flex items-center gap-2">
        <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nazwa nowego rodzaju..." className="max-w-xs"
          onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) addMut.mutate(newName.trim()); }} />
        <Button onClick={() => newName.trim() && addMut.mutate(newName.trim())} disabled={!newName.trim()} className="gap-2"><Plus className="h-4 w-4" /> Dodaj</Button>
      </div>

      <div className="space-y-2">
        {types.map((t: any) => (
          <Card key={t.id} className="border">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-medium">{t.name}</span>
                {t.is_active ? <Badge className="bg-primary/10 text-primary text-xs">Aktywny</Badge> : <Badge variant="secondary" className="text-xs">Nieaktywny</Badge>}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMut.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
