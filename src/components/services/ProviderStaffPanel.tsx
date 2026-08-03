// Zarządzanie zespołem usługodawcy — widoczne na karcie firmy (styl Booksy).
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';

interface Staff {
  id: string;
  name: string;
  role: string | null;
  photo_url: string | null;
  bio: string | null;
  is_active: boolean;
  sort_order: number;
}

const EMPTY = { name: '', role: '', photo_url: '', bio: '', is_active: true };

export function ProviderStaffPanel({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const { data: staff = [] } = useQuery({
    queryKey: ['provider-staff', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('provider_staff')
        .select('*')
        .eq('provider_id', providerId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as Staff[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        provider_id: providerId,
        name: form.name.trim(),
        role: form.role.trim() || null,
        photo_url: form.photo_url.trim() || null,
        bio: form.bio.trim() || null,
        is_active: form.is_active,
      };
      if (!payload.name) throw new Error('Podaj imię i nazwisko');
      const q = editing
        ? (supabase as any).from('provider_staff').update(payload).eq('id', editing.id)
        : (supabase as any).from('provider_staff').insert({ ...payload, sort_order: staff.length });
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-staff', providerId] });
      setDialog(false);
      setEditing(null);
      setForm({ ...EMPTY });
      toast.success('Zapisano');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('provider_staff').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-staff', providerId] });
      toast.success('Usunięto');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Zespół widoczny na Twojej karcie — klient widzi, kto go obsłuży.
          </p>
          <Button
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => { setEditing(null); setForm({ ...EMPTY }); setDialog(true); }}
          >
            <Plus className="h-4 w-4" /> Dodaj osobę
          </Button>
        </div>

        {staff.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">Nie dodano jeszcze pracowników</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {staff.map(m => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border p-3">
                {m.photo_url ? (
                  <img src={m.photo_url} alt={m.name} className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-primary/15 flex items-center justify-center font-bold text-primary">
                    {m.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.role || '—'}{!m.is_active && ' · ukryty'}
                  </p>
                </div>
                <Button
                  variant="ghost" size="icon"
                  onClick={() => {
                    setEditing(m);
                    setForm({
                      name: m.name, role: m.role || '', photo_url: m.photo_url || '',
                      bio: m.bio || '', is_active: m.is_active,
                    });
                    setDialog(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove.mutate(m.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edytuj osobę' : 'Dodaj osobę'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Imię i nazwisko</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Stanowisko</Label>
              <Input
                value={form.role}
                onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                placeholder="np. Mechanik, Detailer, Doradca"
              />
            </div>
            <div className="space-y-2">
              <Label>Zdjęcie (URL)</Label>
              <Input value={form.photo_url} onChange={e => setForm(p => ({ ...p, photo_url: e.target.value }))} placeholder="https://…" />
            </div>
            <div className="space-y-2">
              <Label>Krótki opis</Label>
              <Textarea rows={3} className="resize-none" value={form.bio} onChange={e => setForm(p => ({ ...p, bio: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
              <span className="text-sm">Widoczny na karcie firmy</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Anuluj</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
