import { useEffect, useState } from 'react';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Plus, Trash2, Users, Building2, CheckCircle2, Circle } from 'lucide-react';
import { toast } from 'sonner';

interface Props { providerId: string; }
type Station = { id: string; name: string; color: string; sort_order: number; is_active: boolean; };
type Employee = { user_id: string; first_name: string | null; last_name: string | null; email: string | null; };
type Mapping = { station_id: string; employee_user_id: string; id: string; };

const PALETTE = ['#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

export function WorkshopStationsManager({ providerId }: Props) {
  const { t } = useTranslation();  const confirmAction = useConfirm();

  const [stations, setStations] = useState<Station[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [color, setColor] = useState(PALETTE[0]);

  const load = async () => {
    setLoading(true);
    const [s, e, m] = await Promise.all([
      (supabase.from('workshop_stations') as any).select('*').eq('provider_id', providerId).order('sort_order', { ascending: true }),
      (supabase.from('workshop_employees') as any)
        .select('user_id, first_name, last_name, email').eq('provider_id', providerId).eq('status', 'active').not('user_id', 'is', null),
      (supabase.from('workshop_station_employees') as any).select('id, station_id, employee_user_id').eq('provider_id', providerId),
    ]);
    setStations(s.data || []);
    setEmployees(e.data || []);
    setMappings(m.data || []);
    setLoading(false);
  };

  useEffect(() => { if (providerId) load(); /* eslint-disable-next-line */ }, [providerId]);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const { error } = await (supabase.from('workshop_stations') as any).insert({
      provider_id: providerId, name, color, sort_order: stations.length,
    });
    if (error) return toast.error(error.message);
    setNewName(''); toast.success(t('workshop.stations.stationAdded'));
    await load();
  };

  const toggleActive = async (s: Station) => {
    await (supabase.from('workshop_stations') as any).update({ is_active: !s.is_active }).eq('id', s.id);
    await load();
  };

  const remove = async (id: string) => {
    if (!(await confirmAction({ title: t('workshop.stations.confirmRemove') }))) return;
    await (supabase.from('workshop_stations') as any).delete().eq('id', id);
    await load();
  };

  const toggleAssign = async (stationId: string, userId: string) => {
    const existing = mappings.find(m => m.station_id === stationId && m.employee_user_id === userId);
    if (existing) {
      await (supabase.from('workshop_station_employees') as any).delete().eq('id', existing.id);
    } else {
      await (supabase.from('workshop_station_employees') as any).insert({
        station_id: stationId, employee_user_id: userId, provider_id: providerId,
      });
    }
    await load();
  };

  const empName = (e: Employee) => [e.first_name, e.last_name].filter(Boolean).join(' ') || e.email || '—';
  const initials = (e: Employee) => {
    const n = empName(e);
    return n.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" /> {t('workshop.dashboard.stations.title')}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t('workshop.stations.headerHint')}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap items-center">
              <Input onFocus={e => e.currentTarget.select()} value={newName} onChange={e => setNewName(e.target.value)}
                placeholder={t('workshop.stations.namePlaceholder')}
                onKeyDown={e => e.key === 'Enter' && add()} className="flex-1 min-w-[200px]" />
              <div className="flex gap-1">
                {PALETTE.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-foreground' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
              <Button size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" /> {t('workshop.stations.add')}</Button>
            </div>

            {stations.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('workshop.stations.empty')}
              </p>
            )}

            {stations.map(s => {
              const assignedIds = new Set(mappings.filter(m => m.station_id === s.id).map(m => m.employee_user_id));
              return (
                <div key={s.id} className="rounded-lg border bg-card p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className={`font-medium ${s.is_active ? '' : 'line-through text-muted-foreground'}`}>{s.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {t('workshop.stations.employeeCount', { count: assignedIds.size })}
                    </Badge>
                    <div className="ml-auto flex items-center gap-3">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`act-${s.id}`} className="text-xs text-muted-foreground cursor-pointer">
                              {t('workshop.stations.orderStatus')}
                            </Label>
                            <Switch id={`act-${s.id}`} checked={s.is_active} onCheckedChange={() => toggleActive(s)} />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {s.is_active
                            ? t('workshop.stations.activeTooltip')
                            : t('workshop.stations.inactiveTooltip')}
                        </TooltipContent>
                      </Tooltip>
                      <Button variant="ghost" size="icon" onClick={() => remove(s.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <div className="border-t pt-2">
                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Users className="h-3 w-3" /> {t('workshop.stations.assignedEmployees')}
                    </div>
                    {employees.length === 0 ? (
                      <div className="text-xs text-muted-foreground">{t('workshop.stations.noEmployees')}</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {employees.map(e => {
                          const on = assignedIds.has(e.user_id);
                          return (
                            <button
                              key={e.user_id}
                              onClick={() => toggleAssign(s.id, e.user_id)}
                              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-left transition-colors ${
                                on
                                  ? 'bg-primary/5 border-primary/40'
                                  : 'bg-muted/30 border-transparent hover:bg-muted/60'
                              }`}
                            >
                              <div
                                className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                                style={{ background: s.color }}
                              >
                                {initials(e)}
                              </div>
                              <span className="flex-1 text-sm truncate">{empName(e)}</span>
                              {on
                                ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                                : <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
