import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, UserX, Loader2, Users } from 'lucide-react';

const ROLES = [
  { value: 'mechanic', label: 'Mechanik' },
  { value: 'reception', label: 'Recepcja' },
  { value: 'manager', label: 'Kierownik' },
  { value: 'owner', label: 'Właściciel' },
];

interface Employee {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  role: string;
  hourly_rate: number;
  phone: string;
  pin_code?: string;
  is_active: boolean;
}

export const WorkshopEmployeesPage = ({ providerId }: { providerId: string | null }) => {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('mechanic');
  const [hourlyRate, setHourlyRate] = useState(0);
  const [phone, setPhone] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (providerId) fetchEmployees();
  }, [providerId]);

  const fetchEmployees = async () => {
    try {
      const { data, error } = await (supabase.from('workshop_employees') as any)
        .select('*')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setEmployees(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setRole('mechanic');
    setHourlyRate(0);
    setPhone('');
    setPinCode('');
    setIsActive(true);
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (emp: Employee) => {
    const parts = (emp.name || '').split(' ');
    setFirstName(emp.first_name || parts[0] || '');
    setLastName(emp.last_name || parts.slice(1).join(' ') || '');
    setRole(emp.role || 'mechanic');
    setHourlyRate(emp.hourly_rate || 0);
    setPhone(emp.phone || '');
    setPinCode(emp.pin_code || '');
    setIsActive(emp.is_active);
    setEditingId(emp.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('Imię i nazwisko są wymagane');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        provider_id: providerId,
        name: `${firstName.trim()} ${lastName.trim()}`,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role,
        hourly_rate: hourlyRate,
        phone,
        pin_code: pinCode || null,
        is_active: isActive,
      };

      if (editingId) {
        const { error } = await (supabase.from('workshop_employees') as any)
          .update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('workshop_employees') as any)
          .insert(payload);
        if (error) throw error;
      }

      toast.success(editingId ? 'Pracownik zaktualizowany' : 'Pracownik dodany');
      setDialogOpen(false);
      resetForm();
      fetchEmployees();
    } catch (err: any) {
      toast.error(err.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (emp: Employee) => {
    try {
      const { error } = await (supabase.from('workshop_employees') as any)
        .update({ is_active: !emp.is_active }).eq('id', emp.id);
      if (error) throw error;
      fetchEmployees();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const roleLabel = (r: string) => ROLES.find(x => x.value === r)?.label || r;

  if (!providerId) {
    return <p className="text-center text-muted-foreground py-8">Najpierw aktywuj konto usługodawcy.</p>;
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Pracownicy ({employees.length})</h3>
        </div>
        <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-1" />Dodaj pracownika</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Imię i nazwisko</TableHead>
                <TableHead>Rola</TableHead>
                <TableHead>Stawka/h</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Brak pracowników</TableCell></TableRow>
              )}
              {employees.map(emp => (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium">{emp.name}</TableCell>
                  <TableCell>{roleLabel(emp.role)}</TableCell>
                  <TableCell>{emp.hourly_rate} PLN</TableCell>
                  <TableCell>
                    <Badge variant={emp.is_active ? 'default' : 'secondary'}>
                      {emp.is_active ? 'Aktywny' : 'Nieaktywny'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(emp)}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => toggleActive(emp)}>
                      <UserX className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edytuj pracownika' : 'Dodaj pracownika'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Imię *</Label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Nazwisko *</Label>
                <Input value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Rola</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Stawka godzinowa netto (PLN)</Label>
                <Input type="number" value={hourlyRate} onChange={e => setHourlyRate(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Telefon służbowy</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>PIN (4 cyfry, opcjonalny)</Label>
              <Input value={pinCode} onChange={e => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 4))} maxLength={4} placeholder="••••" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Aktywny</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Anuluj</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingId ? 'Zapisz zmiany' : 'Dodaj'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
