import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ClipboardCheck, ArrowDownToLine, Languages, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

const ACTION_LABEL_KEY: Record<string, string> = {
  replace: 'workshop.orderFindings.actionReplace',
  repair: 'workshop.orderFindings.actionRepair',
  inspection: 'workshop.orderFindings.actionInspection',
  diagnosis: 'workshop.orderFindings.actionDiagnosis',
  inne: 'workshop.orderFindings.actionOther',
};
const STATUS_BADGE: Record<string, { labelKey: string; variant: any }> = {
  pending: { labelKey: 'workshop.orderFindings.statusPending', variant: 'secondary' },
  approved: { labelKey: 'workshop.orderFindings.statusApproved', variant: 'default' },
  rejected: { labelKey: 'workshop.orderFindings.statusRejected', variant: 'destructive' },
};

interface Props {
  orderId: string;
  providerId: string;
}

export const WorkshopOrderEmployeeFindingsTab = ({ orderId, providerId }: Props) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [findings, setFindings] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.from('workshop_employee_findings') as any)
      .select('*').eq('order_id', orderId).order('created_at', { ascending: true });
    if (error) toast.error(error.message);
    setFindings(data || []);

    const uids = Array.from(new Set((data || []).map((f: any) => f.employee_user_id)));
    if (uids.length > 0) {
      const { data: emps } = await (supabase.from('workshop_employees') as any)
        .select('user_id, name').eq('provider_id', providerId).in('user_id', uids);
      const map: Record<string, string> = {};
      (emps || []).forEach((e: any) => { if (e.user_id) map[e.user_id] = e.name; });
      setEmployees(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [orderId]);

  const togglePick = (id: string) => {
    const ns = new Set(selected);
    ns.has(id) ? ns.delete(id) : ns.add(id);
    setSelected(ns);
  };

  const pending = findings.filter(f => f.status === 'pending');
  const allPendingSelected = pending.length > 0 && pending.every(f => selected.has(f.id));

  const toggleAll = () => {
    if (allPendingSelected) setSelected(new Set());
    else setSelected(new Set(pending.map(f => f.id)));
  };

  const move = async () => {
    if (selected.size === 0) { toast.error(t('workshop.orderFindings.selectAtLeastOne')); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('workshop-approve-findings', {
        body: { finding_ids: Array.from(selected) },
      });
      if (error) throw error;
      toast.success(t('workshop.orderFindings.movedToCard', { count: (data as any)?.moved_count ?? selected.size }));
      setSelected(new Set());
      await load();
    } catch (e: any) {
      toast.error(e.message || t('workshop.orderFindings.moveError'));
    } finally { setBusy(false); }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (findings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
          {t('workshop.orderFindings.noFindings')}<br />
          <span className="text-xs">{t('workshop.orderFindings.noFindingsHint')}</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold">{t('workshop.orderFindings.employeeFindings', { count: findings.length })}</span>
          {pending.length > 0 && <Badge variant="secondary">{t('workshop.orderFindings.pendingCount', { count: pending.length })}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
          {pending.length > 0 && (
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {allPendingSelected ? t('workshop.orderFindings.deselect') : t('workshop.orderFindings.selectAll')}
            </Button>
          )}
          <Button size="sm" disabled={busy || selected.size === 0} onClick={move}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ArrowDownToLine className="h-4 w-4 mr-1" />}
            {t('workshop.orderFindings.moveToCard', { count: selected.size })}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {findings.map(f => {
          const st = STATUS_BADGE[f.status] || STATUS_BADGE.pending;
          const isPending = f.status === 'pending';
          const empName = employees[f.employee_user_id] || t('workshop.employeePortal.employee');
          const showTranslation = f.description_pl && f.description_original_lang !== 'pl';
          return (
            <Card key={f.id} className={selected.has(f.id) ? 'ring-2 ring-primary' : ''}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    {isPending ? (
                      <Checkbox checked={selected.has(f.id)} onCheckedChange={() => togglePick(f.id)} />
                    ) : (
                      <div className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px]">{ACTION_LABEL_KEY[f.action_type] ? t(ACTION_LABEL_KEY[f.action_type]) : f.action_type}</Badge>
                      <Badge variant={st.variant} className="text-[10px]">{t(st.labelKey)}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {empName} · {formatDistanceToNow(new Date(f.created_at), { locale: pl, addSuffix: true })}
                      </span>
                    </div>
                    {showTranslation && (
                      <div className="text-sm">
                        <div className="font-medium">{f.description_pl}</div>
                        <div className="text-xs text-muted-foreground italic flex items-start gap-1 mt-0.5">
                          <Languages className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{t('workshop.orderFindings.original', { lang: (f.description_original_lang || '').toUpperCase() })}: {f.description_original}</span>
                        </div>
                      </div>
                    )}
                    {!showTranslation && <div className="text-sm">{f.description_original}</div>}
                    {(f.part_name || f.part_oe_code || f.estimated_hours > 0) && (
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {f.part_name && <span>{t('workshop.orderFindings.part')}: <b className="text-foreground">{f.part_name}</b></span>}
                        {f.part_oe_code && <span>OE: <b className="text-foreground">{f.part_oe_code}</b></span>}
                        {f.part_supplier && <span>{f.part_supplier}</span>}
                        {f.estimated_hours > 0 && <span>{t('workshop.orderFindings.labor')}: <b className="text-foreground">{f.estimated_hours}h</b></span>}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
