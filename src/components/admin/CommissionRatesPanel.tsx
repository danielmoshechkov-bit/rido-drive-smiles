import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Loader2, Trash2, Percent } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Provider { id: string; company_name: string; }
interface Category { id: string; name: string; }
interface Commission {
  id: string;
  provider_id: string;
  category_id: string | null;
  commission_type: string;
  commission_value: number;
  is_promo: boolean;
  valid_from: string | null;
  valid_to: string | null;
  service_providers?: { company_name: string };
  service_categories?: { name: string };
}

export function CommissionRatesPanel() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [providerId, setProviderId] = useState('');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [commissionType, setCommissionType] = useState('percent_margin');
  const [commissionValue, setCommissionValue] = useState('10');
  const [isPromo, setIsPromo] = useState(false);
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: provs }, { data: cats }, { data: comms }] = await Promise.all([
      supabase.from('service_providers').select('id, company_name').order('company_name'),
      supabase.from('service_categories').select('id, name').order('name'),
      supabase.from('service_provider_commissions').select(`
        *, service_providers(company_name), service_categories(name)
      `).order('created_at', { ascending: false }),
    ]);
    setProviders(provs || []);
    setCategories(cats || []);
    setCommissions((comms as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!providerId) { toast.error('Wybierz usługodawcę'); return; }
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('service_provider_commissions').insert([{
      provider_id: providerId,
      category_id: categoryId === 'all' ? null : categoryId,
      commission_type: commissionType,
      commission_value: parseFloat(commissionValue),
      is_promo: isPromo,
      valid_from: validFrom || null,
      valid_to: validTo || null,
      created_by: user?.id,
    }]);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Stawka prowizji dodana');
    setShowAdd(false);
    load();
  };

  const deleteRate = async (id: string) => {
    if (!confirm('Usunąć stawkę?')) return;
    await supabase.from('service_provider_commissions').delete().eq('id', id);
    toast.success('Usunięto');
    load();
  };

  const labelType = (t: string) => ({
    percent_margin: '% od marży (części + robocizna)',
    percent_total: '% od całości',
    flat_per_booking: 'Stała kwota / zlecenie',
  } as Record<string, string>)[t] || t;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Percent className="h-5 w-5" /> Stawki prowizji</CardTitle>
            <CardDescription>Domyślnie 10% od marży na częściach + robocizny. Możesz ustawić indywidualnie per usługodawca lub kategoria.</CardDescription>
          </div>
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" /> Dodaj stawkę</Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-6"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : commissions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Brak indywidualnych stawek. Wszyscy mają domyślnie 10% od marży.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usługodawca</TableHead>
                <TableHead>Kategoria</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Wartość</TableHead>
                <TableHead>Ważność</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commissions.map(c => (
                <TableRow key={c.id}>
                  <TableCell>{c.service_providers?.company_name}</TableCell>
                  <TableCell>{c.service_categories?.name || <Badge variant="outline">Wszystkie</Badge>}</TableCell>
                  <TableCell className="text-xs">{labelType(c.commission_type)}</TableCell>
                  <TableCell className="font-bold">
                    {c.commission_value}{c.commission_type === 'flat_per_booking' ? ' zł' : '%'}
                    {c.is_promo && <Badge className="ml-2 bg-orange-500">Promo</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.valid_from || '—'} → {c.valid_to || 'bez końca'}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => deleteRate(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dodaj stawkę prowizji</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Usługodawca *</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                <SelectContent>
                  {providers.map(p => <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kategoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie kategorie</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Typ prowizji</Label>
              <Select value={commissionType} onValueChange={setCommissionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent_margin">% od marży (zalecane)</SelectItem>
                  <SelectItem value="percent_total">% od całości faktury</SelectItem>
                  <SelectItem value="flat_per_booking">Stała kwota / zlecenie</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Wartość ({commissionType === 'flat_per_booking' ? 'zł' : '%'})</Label>
              <Input type="number" value={commissionValue} onChange={(e) => setCommissionValue(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Promocyjna stawka</Label>
              <Switch checked={isPromo} onCheckedChange={setIsPromo} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Od</Label><Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></div>
              <div><Label>Do</Label><Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Anuluj</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
