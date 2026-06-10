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
import { Plus, Edit, UserX, Loader2, Users, Mail, Send } from 'lucide-react';

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
  email?: string;
  pin_code?: string;
  is_active: boolean;
}

export const WorkshopEmployeesPage = ({ providerId }: { providerId: string | null }) => {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('mechanic');
  const [hourlyRate, setHourlyRate] = useState(0);
  const [phone, setPhone] = useState('');
  const [emailAddr, setEmailAddr] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [invitingId, setInvitingId] = useState<string | null>(null);

  useEffect(() => {
    if (providerId) fetchAll();
  }, [providerId]);

  const fetchAll = async () => {
    try {
      const [empRes, invRes] = await Promise.all([
        (supabase.from('workshop_employees') as any)
          .select('*').eq('provider_id', providerId).order('created_at', { ascending: true }),
        (supabase.from('workshop_employee_invitations') as any)
          .select('*').eq('provider_id', providerId).order('created_at', { ascending: false }),
      ]);
      if (empRes.error) throw empRes.error;
      setEmployees(empRes.data || []);
      setInvitations(invRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  const fetchEmployees = fetchAll;

  // Resolve unified status per employee row by matching email against invitations
  const statusFor = (emp: any): { key: string; label: string; className: string } => {
    if (emp.is_active === false || emp.status === 'inactive') {
      return { key: 'inactive', label: 'Nieaktywny', className: 'bg-muted text-muted-foreground' };
    }
    if (emp.user_id && emp.status === 'active') {
      return { key: 'active', label: 'Aktywny', className: 'bg-green-500 text-white hover:bg-green-600' };
    }
    const inv = emp.email
      ? invitations.find(i => (i.invited_email || '').toLowerCase() === emp.email.toLowerCase())
      : null;
    if (inv?.status === 'accepted') return { key: 'active', label: 'Aktywny', className: 'bg-green-500 text-white hover:bg-green-600' };
    if (inv?.status === 'rejected') return { key: 'rejected', label: 'Odrzucony', className: 'bg-destructive text-destructive-foreground' };
    if (inv?.status === 'pending') return { key: 'pending', label: 'Zaproszony', className: 'bg-yellow-500 text-black hover:bg-yellow-600' };
    if (emp.email) return { key: 'pending', label: 'Zaproszony', className: 'bg-yellow-500 text-black hover:bg-yellow-600' };
    return { key: 'inactive', label: 'Bez konta', className: 'bg-muted text-muted-foreground' };
  };

  const removeEmployee = async (emp: any) => {
    if (!confirm(`Usunąć pracownika ${emp.name}? Konto zostanie zdezaktywowane.`)) return;
    try {
      const { error } = await (supabase.from('workshop_employees') as any)
        .update({ is_active: false, status: 'inactive', removed_at: new Date().toISOString() })
        .eq('id', emp.id);
      if (error) throw error;
      toast.success('Pracownik usunięty');
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };


  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setRole('mechanic');
    setHourlyRate(0);
    setPhone('');
    setEmailAddr('');
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
    setEmailAddr(emp.email || '');
    setPinCode(emp.pin_code || '');
    setIsActive(emp.is_active);
    setEditingId(emp.id);
    setDialogOpen(true);
  };

  const handleSendInvite = async (emp: Employee) => {
    if (!emp.email) {
      toast.error('Brak adresu email — edytuj pracownika i dodaj email');
      return;
    }
    setInvitingId(emp.id);
    try {
      const { data, error } = await supabase.functions.invoke('workshop-invite-employee', {
        body: {
          email: emp.email.toLowerCase(),
          provider_id: providerId,
          role: emp.role || 'mechanic',
          language_preference: 'pl',
        },
      });
      if (error) throw error;
      if ((data as any)?.action_link && !(data as any)?.email_sent) {
        await navigator.clipboard.writeText((data as any).action_link);
        toast.success('Link zaproszenia skopiowany do schowka');
      } else {
        toast.success(`Zaproszenie wysłane na ${emp.email}`);
      }
      fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Błąd wysyłki zaproszenia');
    } finally {
      setInvitingId(null);
    }
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('Imię i nazwisko są wymagane');
      return;
    }
    const cleanEmail = emailAddr.trim().toLowerCase();
    if (!editingId && (!cleanEmail || !cleanEmail.includes('@'))) {
      toast.error('Email pracownika jest wymagany — pracownik dostanie zaproszenie');
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
        email: cleanEmail || null,
        pin_code: pinCode || null,
        is_active: isActive,
      };

      if (editingId) {
        const { error } = await (supabase.from('workshop_employees') as any)
          .update(payload).eq('id', editingId);
        if (error) throw error;
        toast.success('Pracownik zaktualizowany');
      } else {
        const { error } = await (supabase.from('workshop_employees') as any).insert(payload);
        if (error) throw error;
        // Auto-send invitation
        try {
          const { data, error: invErr } = await supabase.functions.invoke('workshop-invite-employee', {
            body: { email: cleanEmail, provider_id: providerId, role, language_preference: 'pl' },
          });
          if (invErr) throw invErr;
          if ((data as any)?.action_link && !(data as any)?.email_sent) {
            await navigator.clipboard.writeText((data as any).action_link);
            toast.success('Pracownik dodany. Link zaproszenia skopiowany do schowka');
          } else {
            toast.success(`Pracownik dodany. Zaproszenie wysłane na ${cleanEmail}`);
          }
        } catch (invE: any) {
          toast.warning(`Pracownik dodany, ale zaproszenie nie zostało wysłane: ${invE.message}`);
        }
      }

      setDialogOpen(false);
      resetForm();
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
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
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Imię i nazwisko</TableHead>
                <TableHead>Rola</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Stawka/h</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Brak pracowników</TableCell></TableRow>
              )}
              {employees.map(emp => {
                const st = statusFor(emp);
                return (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">{emp.name}</TableCell>
                    <TableCell>{roleLabel(emp.role)}</TableCell>
                    <TableCell>{emp.phone || '—'}</TableCell>
                    <TableCell className="text-sm">{emp.email || '—'}</TableCell>
                    <TableCell>{emp.hourly_rate} PLN</TableCell>
                    <TableCell>
                      <Badge className={st.className}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={st.key === 'rejected' ? 'Wyślij ponownie' : 'Wyślij zaproszenie'}
                        onClick={() => handleSendInvite(emp)}
                        disabled={invitingId === emp.id || !emp.email}
                      >
                        {invitingId === emp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 text-primary" />}
                      </Button>
                      <Button variant="ghost" size="icon" title="Edytuj" onClick={() => openEdit(emp)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Usuń pracownika" onClick={() => removeEmployee(emp)}>
                        <UserX className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
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
              <Label className="flex items-center gap-1.5"><Mail className="h-4 w-4" /> Email (potrzebny do zaproszenia)</Label>
              <Input type="email" value={emailAddr} onChange={e => setEmailAddr(e.target.value)} placeholder="pracownik@firma.pl" />
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

