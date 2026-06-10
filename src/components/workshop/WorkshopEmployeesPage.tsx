import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, UserX, Loader2, Users, Mail, Send, X } from 'lucide-react';

const DEFAULT_ROLES = [
  { value: 'mechanic', label: 'Mechanik' },
  { value: 'reception', label: 'Recepcja' },
  { value: 'manager', label: 'Kierownik' },
  { value: 'owner', label: 'Właściciel' },
];

const RATE_TYPES = [
  { value: 'hourly', label: 'godzinowa', suffix: '/h' },
  { value: 'daily', label: 'dobowa', suffix: '/dzień' },
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
  const rolesKey = `workshop_roles_${providerId || 'na'}`;
  const rateKey = `workshop_rate_types_${providerId || 'na'}`;

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [poolEnabled, setPoolEnabled] = useState(false);
  const [poolSaving, setPoolSaving] = useState(false);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);

  const [roles, setRoles] = useState<{ value: string; label: string }[]>(DEFAULT_ROLES);
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [rateTypes, setRateTypes] = useState<Record<string, 'hourly' | 'daily'>>({});

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('mechanic');
  const [hourlyRate, setHourlyRate] = useState(0);
  const [rateType, setRateType] = useState<'hourly' | 'daily'>('hourly');
  const [phone, setPhone] = useState('');
  const [emailAddr, setEmailAddr] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [sendInvite, setSendInvite] = useState(true);
  const [invitingId, setInvitingId] = useState<string | null>(null);

  // Load roles + rate-type map from localStorage (per provider)
  useEffect(() => {
    if (!providerId) return;
    try {
      const r = localStorage.getItem(rolesKey);
      if (r) setRoles(JSON.parse(r));
      const rt = localStorage.getItem(rateKey);
      if (rt) setRateTypes(JSON.parse(rt));
    } catch { /* ignore */ }
  }, [providerId]);

  const saveRoles = (next: { value: string; label: string }[]) => {
    setRoles(next);
    try { localStorage.setItem(rolesKey, JSON.stringify(next)); } catch {}
  };
  const saveRateTypes = (next: Record<string, 'hourly' | 'daily'>) => {
    setRateTypes(next);
    try { localStorage.setItem(rateKey, JSON.stringify(next)); } catch {}
  };

  const addRole = () => {
    const label = newRoleLabel.trim();
    if (!label) return;
    const value = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30) || `role_${Date.now()}`;
    if (roles.some(r => r.value === value)) {
      toast.error('Taka rola już istnieje');
      return;
    }
    saveRoles([...roles, { value, label }]);
    setNewRoleLabel('');
  };
  const removeRole = (value: string) => {
    if (roles.length <= 1) {
      toast.error('Musi pozostać przynajmniej jedna rola');
      return;
    }
    saveRoles(roles.filter(r => r.value !== value));
    if (role === value) setRole(roles.find(r => r.value !== value)?.value || '');
  };

  useEffect(() => {
    if (providerId) fetchAll();
  }, [providerId]);

  const fetchAll = async () => {
    try {
      const [empRes, invRes, provRes] = await Promise.all([
        (supabase.from('workshop_employees') as any)
          .select('*').eq('provider_id', providerId).eq('is_active', true)
          .order('created_at', { ascending: true }),
        (supabase.from('workshop_employee_invitations') as any)
          .select('*').eq('provider_id', providerId).order('created_at', { ascending: false }),
        (supabase.from('service_providers') as any)
          .select('user_id').eq('id', providerId).maybeSingle(),
      ]);
      if (empRes.error) throw empRes.error;
      setEmployees(empRes.data || []);
      setInvitations(invRes.data || []);
      const ouid = (provRes as any)?.data?.user_id || null;
      setOwnerUserId(ouid);
      if (ouid) {
        const { data: ws } = await (supabase.from('workshop_settings') as any)
          .select('employees_can_claim_orders').eq('user_id', ouid).maybeSingle();
        setPoolEnabled(!!ws?.employees_can_claim_orders);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const togglePool = async (val: boolean) => {
    if (!ownerUserId) return;
    setPoolSaving(true);
    try {
      const { error } = await (supabase.from('workshop_settings') as any)
        .update({ employees_can_claim_orders: val }).eq('user_id', ownerUserId);
      if (error) throw error;
      setPoolEnabled(val);
      toast.success(val ? 'Pula zleceń włączona' : 'Pula zleceń wyłączona');
    } catch (e: any) { toast.error(e.message); }
    finally { setPoolSaving(false); }
  };

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
    setRateType('hourly');
    setPhone('');
    setEmailAddr('');
    setPinCode('');
    setIsActive(true);
    setSendInvite(true);
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
    setRateType(rateTypes[emp.id] || 'hourly');
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
      if ((data as any)?.email_sent) {
        toast.success(`Zaproszenie wysłane na ${emp.email}`);
      } else if ((data as any)?.action_link) {
        await navigator.clipboard.writeText((data as any).action_link);
        toast.success('Link zaproszenia skopiowany do schowka');
      } else {
        toast.success('Zaproszenie zarejestrowane');
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

      let savedId: string | null = editingId;
      if (editingId) {
        const { error } = await (supabase.from('workshop_employees') as any)
          .update(payload).eq('id', editingId);
        if (error) throw error;
        toast.success('Pracownik zaktualizowany');
      } else {
        const { data: ins, error } = await (supabase.from('workshop_employees') as any)
          .insert(payload).select('id').single();
        if (error) throw error;
        savedId = ins?.id || null;
        if (sendInvite) {
          try {
            const { data, error: invErr } = await supabase.functions.invoke('workshop-invite-employee', {
              body: { email: cleanEmail, provider_id: providerId, role, language_preference: 'pl' },
            });
            if (invErr) throw invErr;
            if ((data as any)?.email_sent) {
              toast.success(`Pracownik dodany. Zaproszenie wysłane na ${cleanEmail}`);
            } else if ((data as any)?.action_link) {
              await navigator.clipboard.writeText((data as any).action_link);
              toast.success('Pracownik dodany. Link zaproszenia skopiowany do schowka');
            } else {
              toast.success('Pracownik dodany');
            }
          } catch (invE: any) {
            toast.warning(`Pracownik dodany, ale zaproszenie nie zostało wysłane: ${invE.message}`);
          }
        } else {
          toast.success('Pracownik dodany. Zaproszenie nie zostało wysłane — możesz wysłać je później przyciskiem koperty.');
        }
      }

      // Persist rate type locally
      if (savedId) {
        const next = { ...rateTypes, [savedId]: rateType };
        saveRateTypes(next);
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

  const roleLabel = (r: string) => roles.find(x => x.value === r)?.label || r;
  const rateLabel = (emp: any) => {
    const t = rateTypes[emp.id] || 'hourly';
    const suffix = RATE_TYPES.find(x => x.value === t)?.suffix || '/h';
    return `${emp.hourly_rate} PLN${suffix}`;
  };

  if (!providerId) {
    return <p className="text-center text-muted-foreground py-8">Najpierw aktywuj konto usługodawcy.</p>;
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
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
                <TableHead>Stawka</TableHead>
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
                    <TableCell>{rateLabel(emp)}</TableCell>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
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
              <div className="flex items-center justify-between">
                <Label>Rola</Label>
                <span className="text-xs text-muted-foreground">Możesz dodać własną rolę</span>
              </div>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roles.map(r => (
                    <div key={r.value} className="flex items-center justify-between pr-1 hover:bg-muted/50 rounded">
                      <SelectItem value={r.value} className="flex-1">{r.label}</SelectItem>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); removeRole(r.value); }}
                        className="p-1 mr-1 rounded hover:bg-destructive/10 text-destructive"
                        title="Usuń rolę"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  placeholder="Nowa rola, np. Lakiernik"
                  value={newRoleLabel}
                  onChange={e => setNewRoleLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRole(); } }}
                  className="h-9"
                />
                <Button type="button" size="sm" variant="outline" onClick={addRole}>
                  <Plus className="h-4 w-4 mr-1" />Dodaj
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Stawka netto (PLN)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={hourlyRate || ''}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={e => setHourlyRate(e.target.value === '' ? 0 : Number(e.target.value))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Rodzaj stawki</Label>
                <Select value={rateType} onValueChange={(v) => setRateType(v as 'hourly' | 'daily')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RATE_TYPES.map(rt => <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Telefon służbowy</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Mail className="h-4 w-4" /> Email * <span className="text-xs text-muted-foreground font-normal">(pracownik dostanie zaproszenie)</span></Label>
              <Input type="email" required value={emailAddr} onChange={e => setEmailAddr(e.target.value)} placeholder="pracownik@firma.pl" />
            </div>
            <div className="space-y-2">
              <Label>PIN (4 cyfry, opcjonalny)</Label>
              <Input value={pinCode} onChange={e => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 4))} maxLength={4} placeholder="••••" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Aktywny</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            {!editingId && (
              <label className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-primary/5 cursor-pointer">
                <div>
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <Mail className="h-4 w-4 text-primary" /> Wyślij zaproszenie e-mail
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Pracownik otrzyma link aktywacyjny od razu po dodaniu
                  </div>
                </div>
                <Switch checked={sendInvite} onCheckedChange={setSendInvite} />
              </label>
            )}
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
