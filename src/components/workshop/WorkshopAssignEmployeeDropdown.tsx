import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { UserCog, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  orderId: string;
  providerId: string;
}

export const WorkshopAssignEmployeeDropdown = ({ orderId, providerId }: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [assigned, setAssigned] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [empRes, assignRes] = await Promise.all([
      (supabase.from('workshop_employees') as any)
        .select('id, user_id, name, role, status, phone')
        .eq('provider_id', providerId)
        .eq('is_active', true)
        .not('user_id', 'is', null),
      (supabase.from('workshop_order_assignments') as any)
        .select('id, employee_user_id, status')
        .eq('order_id', orderId),
    ]);
    setEmployees(empRes.data || []);
    setAssigned(assignRes.data || []);
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open]);
  useEffect(() => { load(); }, [orderId]);

  const isAssigned = (uid: string) => assigned.some(a => a.employee_user_id === uid);

  const toggle = async (emp: any) => {
    setBusy(true);
    try {
      if (isAssigned(emp.user_id)) {
        const { error } = await (supabase.from('workshop_order_assignments') as any)
          .delete().eq('order_id', orderId).eq('employee_user_id', emp.user_id);
        if (error) throw error;
        toast.success(`Usunięto przydział: ${emp.name}`);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await (supabase.from('workshop_order_assignments') as any)
          .insert({
            order_id: orderId,
            provider_id: providerId,
            employee_user_id: emp.user_id,
            assigned_by: user?.id,
            status: 'assigned',
          });
        if (error) throw error;
        toast.success(`Przydzielono: ${emp.name}`);

        // Centralized notification + SMS via edge function
        supabase.functions.invoke('workshop-notify-employee', {
          body: { order_id: orderId, event: 'assigned', employee_user_id: emp.user_id },
        }).catch(() => { /* best-effort */ });

      }
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };


  const assignedEmps = employees.filter(e => isAssigned(e.user_id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <UserCog className="h-4 w-4" />
          {assignedEmps.length === 0 ? 'Przydziel pracownika' : `Pracownicy: ${assignedEmps.length}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <div className="text-xs font-semibold px-2 py-1.5 text-muted-foreground">Przydziel do zlecenia</div>
        {assignedEmps.length > 0 && (
          <div className="flex flex-wrap gap-1 p-2 border-b mb-1">
            {assignedEmps.map(e => (
              <Badge key={e.user_id} variant="secondary" className="gap-1 pr-1">
                {e.name}
                <button onClick={() => toggle(e)} className="hover:bg-muted-foreground/20 rounded">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : employees.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            Brak aktywnych pracowników z kontem.<br /> Zaproś ich w "Pracownicy".
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {employees.map(emp => (
              <label key={emp.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                <Checkbox checked={isAssigned(emp.user_id)} disabled={busy} onCheckedChange={() => toggle(emp)} />
                <div className="flex-1">
                  <div className="text-sm">{emp.name}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">{emp.role}</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
