import { useState, useEffect } from 'react';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { WorkshopPayroll } from './WorkshopPayroll';
import { useTranslation } from 'react-i18next';
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
  { value: 'mechanic', labelKey: 'workshop.employees.roles.mechanic' },
  { value: 'reception', labelKey: 'workshop.employees.roles.reception' },
  { value: 'manager', labelKey: 'workshop.employees.roles.manager' },
  { value: 'owner', labelKey: 'workshop.employees.roles.owner' },
];

const RATE_TYPES = [
  { value: 'hourly', labelKey: 'workshop.employees.rateType.hourly' },
  { value: 'daily', labelKey: 'workshop.employees.rateType.daily' },
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
  const { t } = useTranslation();  const confirmAction = useConfirm();

  const rolesKey = `workshop_roles_${providerId || 'na'}`;
  const rateKey = `workshop_rate_types_${providerId || 'na'}`;
  const [payrollView, setPayrollView] = useState<'lista' | 'rozliczenia'>('lista');
  const defaultRoles = DEFAULT_ROLES.map(r => ({ value: r.value, label: t(r.labelKey) }));

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [poolEnabled, setPoolEnabled] = useState(false);
  const [poolSaving, setPoolSaving] = useState(false);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);

  const [roles, setRoles] = useState<{ value: string; label: string }[]>(defaultRoles);
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
  const [inviteEmail, setInviteEmail] = useState(true);
  const [inviteSms, setInviteSms] = useState(false);
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
      toast.error(t('workshop.employees.roleExists'));
      return;
    }
    saveRoles([...roles, { value, label }]);
    setNewRoleLabel('');
  };
  const removeRole = (value: string) => {
    if (roles.length <= 1) {
      toast.error(t('workshop.employees.atLeastOneRole'));
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
      // Upsert — older accounts may not have a workshop_settings row yet, in which
      // case .update().eq() updates 0 rows silently and the toggle never persists.
      const { error } = await (supabase.from('workshop_settings') as any)
        .upsert({ user_id: ownerUserId, employees_can_claim_orders: val }, { onConflict: 'user_id' });
      if (error) throw error;
      setPoolEnabled(val);
      toast.success(val ? t('workshop.employees.poolEnabled') : t('workshop.employees.poolDisabled'));
    } catch (e: any) { toast.error(e.message); }
    finally { setPoolSaving(false); }
  };

  const statusFor = (emp: any): { key: string; label: string; className: string } => {
    if (emp.is_active === false || emp.status === 'inactive') {
      return { key: 'inactive', label: t('workshop.employees.status.inactive'), className: 'bg-muted text-muted-foreground' };
    }
    if (emp.user_id && emp.status === 'active') {
      return { key: 'active', label: t('workshop.employees.status.active'), className: 'bg-green-500 text-white hover:bg-green-600' };
    }
    const inv = emp.email
      ? invitations.find(i => (i.invited_email || '').toLowerCase() === emp.email.toLowerCase())
      : null;
    if (inv?.status === 'accepted') return { key: 'active', label: t('workshop.employees.status.active'), className: 'bg-green-500 text-white hover:bg-green-600' };
    if (inv?.status === 'rejected') return { key: 'rejected', label: t('workshop.employees.status.rejected'), className: 'bg-destructive text-destructive-foreground' };
    if (inv?.status === 'pending') return { key: 'pending', label: t('workshop.employees.status.invited'), className: 'bg-yellow-500 text-black hover:bg-yellow-600' };
    if (emp.email) return { key: 'pending', label: t('workshop.employees.status.invited'), className: 'bg-yellow-500 text-black hover:bg-yellow-600' };
    return { key: 'inactive', label: t('workshop.employees.status.noAccount'), className: 'bg-muted text-muted-foreground' };
  };

  const removeEmployee = async (emp: any) => {
    if (!(await confirmAction({ title: t('workshop.employees.confirmRemove', { name: emp.name }) }))) return;
    try {
      const { error } = await (supabase.from('workshop_employees') as any)
        .update({ is_active: false, status: 'inactive', removed_at: new Date().toISOString() })
        .eq('id', emp.id);
      if (error) throw error;
      toast.success(t('workshop.employees.employeeRemoved'));
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
      toast.error(t('workshop.employees.noEmailEditFirst'));
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
        toast.success(t('workshop.employees.inviteSentTo', { email: emp.email }));
      } else if ((data as any)?.action_link) {
        await navigator.clipboard.writeText((data as any).action_link);
        toast.success(t('workshop.employees.inviteLinkCopied'));
      } else {
        toast.success(t('workshop.employees.inviteRegistered'));
      }
      fetchAll();
    } catch (e: any) {
      toast.error(e.message || t('workshop.employees.inviteSendError'));
    } finally {
      setInvitingId(null);
    }
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error(t('workshop.employees.nameRequired'));
      return;
    }
    const cleanEmail = emailAddr.trim().toLowerCase();
    const cleanPhone = phone.trim();
    if (!editingId) {
      if (!cleanEmail && !cleanPhone) {
        toast.error('Podaj e‑mail lub numer telefonu — na ten kanał pracownik dostanie zaproszenie.');
        return;
      }
      if (cleanEmail && !cleanEmail.includes('@')) {
        toast.error('Nieprawidłowy adres e‑mail.');
        return;
      }
      if (sendInvite) {
        const willEmail = inviteEmail && !!cleanEmail;
        const willSms = inviteSms && !!cleanPhone;
        if (!willEmail && !willSms) {
          toast.error('Wybierz kanał zaproszenia: e‑mail (wymaga adresu) lub SMS (wymaga telefonu).');
          return;
        }
      }
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
        toast.success(t('workshop.employees.employeeUpdated'));
      } else {
        const { data: ins, error } = await (supabase.from('workshop_employees') as any)
          .insert(payload).select('id').single();
        if (error) throw error;
        savedId = ins?.id || null;
        if (sendInvite) {
          try {
            const { data, error: invErr } = await supabase.functions.invoke('workshop-invite-employee', {
              body: { email: cleanEmail || null, provider_id: providerId, role, language_preference: 'pl', phone: cleanPhone || null, send_email: inviteEmail, send_sms: inviteSms },
            });
            if (invErr) throw invErr;
            const d = data as any;
            if (d?.sms_sent && d?.email_sent) toast.success(`Zaproszenie wysłane SMS-em i e-mailem`);
            else if (d?.sms_sent) toast.success(`Zaproszenie wysłane SMS-em na ${phone}`);
            else if (d?.email_sent) toast.success(t('workshop.employees.addedInviteSentTo', { email: cleanEmail }));
            else if (d?.action_link) {
              await navigator.clipboard.writeText(d.action_link);
              toast.success(t('workshop.employees.addedInviteLinkCopied'));
            } else {
              toast.success(t('workshop.employees.employeeAdded'));
            }
          } catch (invE: any) {
            toast.warning(t('workshop.employees.addedInviteFailed', { error: invE.message }));
          }
        } else {
          toast.success(t('workshop.employees.addedNoInvite'));
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
      toast.error(err.message || t('workshop.employees.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = (r: string) => roles.find(x => x.value === r)?.label || r;
  const rateLabel = (emp: any) => {
    const rt = rateTypes[emp.id] || 'hourly';
    const suffix = rt === 'daily' ? t('workshop.employees.rateSuffix.daily') : t('workshop.employees.rateSuffix.hourly');
    return `${emp.hourly_rate} PLN${suffix}`;
  };

  if (!providerId) {
    return <p className="text-center text-muted-foreground py-8">{t('workshop.employees.activateProviderFirst')}</p>;
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const payrollToggle = (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5 w-fit">
      <Button variant={payrollView === 'lista' ? 'default' : 'ghost'} size="sm" className="h-8" onClick={() => setPayrollView('lista')}>Pracownicy</Button>
      <Button variant={payrollView === 'rozliczenia' ? 'default' : 'ghost'} size="sm" className="h-8" onClick={() => setPayrollView('rozliczenia')}>Rozliczenia / Wypłaty</Button>
    </div>
  );

  if (payrollView === 'rozliczenia' && providerId) {
    return (
      <div className="space-y-4">
        {payrollToggle}
        <WorkshopPayroll providerId={providerId} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {payrollToggle}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">{t('workshop.employees.title', { count: employees.length })}</h3>
        </div>
        <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-1" />{t('workshop.employees.addEmployee')}</Button>
      </div>

      <Card>
        <CardContent className="p-4 flex items-start gap-3">
          <div className="flex-1">
            <Label className="text-sm font-semibold">{t('workshop.employees.poolTitle')}</Label>
            <p className="text-xs text-muted-foreground mt-1">
              {t('workshop.employees.poolDesc')}
            </p>
          </div>
          <Switch checked={poolEnabled} disabled={poolSaving || !ownerUserId} onCheckedChange={togglePool} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('workshop.employees.colName')}</TableHead>
                <TableHead>{t('workshop.employees.colRole')}</TableHead>
                <TableHead>{t('workshop.employees.colPhone')}</TableHead>
                <TableHead>{t('workshop.employees.colEmail')}</TableHead>
                <TableHead>{t('workshop.employees.colRate')}</TableHead>
                <TableHead>{t('workshop.employees.colStatus')}</TableHead>
                <TableHead className="text-right">{t('workshop.employees.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t('workshop.employees.noEmployees')}</TableCell></TableRow>
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
                        title={st.key === 'rejected' ? t('workshop.employees.resendInvite') : t('workshop.employees.sendInvite')}
                        onClick={() => handleSendInvite(emp)}
                        disabled={invitingId === emp.id || !emp.email}
                      >
                        {invitingId === emp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 text-primary" />}
                      </Button>
                      <Button variant="ghost" size="icon" title={t('workshop.employees.edit')} onClick={() => openEdit(emp)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title={t('workshop.employees.removeEmployee')} onClick={() => removeEmployee(emp)}>
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
            <DialogTitle>{editingId ? t('workshop.employees.editEmployee') : t('workshop.employees.addEmployee')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('workshop.employees.firstNameRequired')}</Label>
                <Input onFocus={e => e.currentTarget.select()} value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('workshop.employees.lastNameRequired')}</Label>
                <Input onFocus={e => e.currentTarget.select()} value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('workshop.employees.role')}</Label>
                <span className="text-xs text-muted-foreground">{t('workshop.employees.canAddCustomRole')}</span>
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
                        title={t('workshop.employees.removeRole')}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  onFocus={e => e.currentTarget.select()}
                  placeholder={t('workshop.employees.newRolePlaceholder')}
                  value={newRoleLabel}
                  onChange={e => setNewRoleLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRole(); } }}
                  className="h-9"
                />
                <Button type="button" size="sm" variant="outline" onClick={addRole}>
                  <Plus className="h-4 w-4 mr-1" />{t('workshop.employees.add')}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('workshop.employees.netRate')}</Label>
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
                <Label>{t('workshop.employees.rateTypeLabel')}</Label>
                <Select value={rateType} onValueChange={(v) => setRateType(v as 'hourly' | 'daily')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RATE_TYPES.map(rt => <SelectItem key={rt.value} value={rt.value}>{t(rt.labelKey)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('workshop.employees.businessPhone')}</Label>
              <Input onFocus={e => e.currentTarget.select()} value={phone} onChange={e => setPhone(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Mail className="h-4 w-4" /> E‑mail <span className="text-xs text-muted-foreground font-normal">(albo telefon — wystarczy jeden kanał, na niego pójdzie zaproszenie)</span></Label>
              <Input onFocus={e => e.currentTarget.select()} type="email" value={emailAddr} onChange={e => setEmailAddr(e.target.value)} placeholder={t('workshop.employees.emailPlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('workshop.employees.pinLabel')}</Label>
              <Input onFocus={e => e.currentTarget.select()} value={pinCode} onChange={e => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 4))} maxLength={4} placeholder="••••" />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t('workshop.employees.active')}</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            {!editingId && (
              <label className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-primary/5 cursor-pointer">
                <div>
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <Mail className="h-4 w-4 text-primary" /> {t('workshop.employees.sendEmailInvite')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('workshop.employees.sendEmailInviteHint')}
                  </div>
                </div>
                <Switch checked={sendInvite} onCheckedChange={setSendInvite} />
              </label>
            )}
            {!editingId && sendInvite && (
              <div className="flex items-center gap-4 px-1 text-sm flex-wrap">
                <span className="text-muted-foreground">Wyślij przez:</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={inviteEmail} onChange={e => setInviteEmail(e.target.checked)} /> E‑mail
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={inviteSms} onChange={e => setInviteSms(e.target.checked)} /> SMS (link rejestracji)
                </label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingId ? t('workshop.employees.saveChanges') : t('workshop.employees.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
