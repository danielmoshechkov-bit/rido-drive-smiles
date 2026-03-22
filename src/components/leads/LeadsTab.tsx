import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Search, Eye, User } from 'lucide-react';
import { format } from 'date-fns';
import { pl, enUS } from 'date-fns/locale';
import { LeadDetailDrawer } from './LeadDetailDrawer';

interface LeadsTabProps {
  providerId: string | null;
  userId: string | null;
}

export function LeadsTab({ providerId, userId }: LeadsTabProps) {
  const { t, i18n } = useTranslation();
  const dateFnsLocale = i18n.language === 'pl' ? pl : enUS;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [newLead, setNewLead] = useState({
    first_name: '', last_name: '', phone: '', email: '', city: '',
    service_id: '', notes: '', priority: 'normal' as string,
  });

  const STATUS_MAP: Record<string, { label: string; color: string }> = {
    new: { label: `🔵 ${t('leads.statusNew')}`, color: 'bg-blue-100 text-blue-800' },
    viewed: { label: `👁️ ${t('leads.statusViewed')}`, color: 'bg-gray-100 text-gray-800' },
    contacted: { label: `📞 ${t('leads.statusContacted')}`, color: 'bg-yellow-100 text-yellow-800' },
    in_conversation: { label: `💬 ${t('leads.statusInConversation')}`, color: 'bg-orange-100 text-orange-800' },
    meeting_booked: { label: `📅 ${t('leads.statusMeetingBooked')}`, color: 'bg-green-100 text-green-800' },
    converted: { label: `✅ ${t('leads.statusConverted')}`, color: 'bg-emerald-100 text-emerald-800' },
    rejected: { label: `❌ ${t('leads.statusRejected')}`, color: 'bg-red-100 text-red-800' },
    no_answer: { label: `📵 ${t('leads.statusNoAnswer')}`, color: 'bg-gray-100 text-gray-600' },
    opted_out: { label: `🚫 ${t('leads.statusOptedOut')}`, color: 'bg-gray-100 text-gray-500' },
  };

  const SOURCE_MAP: Record<string, string> = {
    meta: `📘 ${t('leads.sourceMeta')}`,
    manual: `✋ ${t('leads.sourceManual')}`,
    website: `🌐 ${t('leads.sourceWebsite')}`,
    phone: `📞 ${t('leads.sourcePhone')}`,
    referral: `🤝 ${t('leads.sourceReferral')}`,
  };

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads', userId, statusFilter, sourceFilter, search],
    queryFn: async () => {
      if (!userId) return [];
      let q = supabase.from('leads').select('*').eq('provider_user_id', userId).order('created_at', { ascending: false });
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (sourceFilter !== 'all') q = q.eq('source', sourceFilter);
      if (search) q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
      const { data } = await q.limit(200);
      return data || [];
    },
    enabled: !!userId,
  });

  const stats = {
    newToday: leads.filter((l: any) => l.status === 'new' && new Date(l.created_at).toDateString() === new Date().toDateString()).length,
    total: leads.length,
    meetingsBooked: leads.filter((l: any) => l.status === 'meeting_booked').length,
    converted: leads.filter((l: any) => l.status === 'converted').length,
  };

  const addLeadMut = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error(t('leads.noUser'));
      const { error } = await supabase.from('leads').insert({
        provider_user_id: userId, source: 'manual',
        first_name: newLead.first_name, last_name: newLead.last_name,
        phone: newLead.phone, email: newLead.email || null,
        city: newLead.city || null, notes: newLead.notes || null,
        priority: newLead.priority, service_id: newLead.service_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(t('leads.leadAdded'));
      setAddLeadOpen(false);
      setNewLead({ first_name: '', last_name: '', phone: '', email: '', city: '', service_id: '', notes: '', priority: 'normal' });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">🔥 {t('leads.newToday')}</CardTitle></CardHeader>
          <CardContent><span className={`text-2xl font-bold ${stats.newToday > 0 ? 'text-destructive' : ''}`}>{stats.newToday}</span></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">📊 {t('leads.total')}</CardTitle></CardHeader>
          <CardContent><span className="text-2xl font-bold">{stats.total}</span></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">📅 {t('leads.meetingsBooked')}</CardTitle></CardHeader>
          <CardContent><span className="text-2xl font-bold text-green-600">{stats.meetingsBooked}</span></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">✅ {t('leads.converted')}</CardTitle></CardHeader>
          <CardContent><span className="text-2xl font-bold text-emerald-600">{stats.converted}</span></CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('leads.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder={t('leads.status')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('leads.allStatuses')}</SelectItem>
            {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t('leads.source')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('leads.allSources')}</SelectItem>
            {Object.entries(SOURCE_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => setAddLeadOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> {t('leads.addLead')}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">{t('leads.loading')}</p>
          ) : leads.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">{t('leads.noLeads')}</p>
              <p className="text-sm">{t('leads.noLeadsHint')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('leads.lead')}</TableHead>
                  <TableHead>{t('leads.contact')}</TableHead>
                  <TableHead>{t('leads.source')}</TableHead>
                  <TableHead>{t('leads.status')}</TableHead>
                  <TableHead>{t('leads.date')}</TableHead>
                  <TableHead>{t('leads.aiAgent')}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead: any) => (
                  <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedLeadId(lead.id)}>
                    <TableCell>
                      <div className="font-medium">{lead.first_name} {lead.last_name}</div>
                      {lead.city && <div className="text-xs text-muted-foreground">{lead.city}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{lead.phone}</div>
                      {lead.email && <div className="text-xs text-muted-foreground">{lead.email}</div>}
                    </TableCell>
                    <TableCell><span className="text-sm">{SOURCE_MAP[lead.source] || lead.source}</span></TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded-full ${STATUS_MAP[lead.status]?.color || 'bg-gray-100'}`}>
                        {STATUS_MAP[lead.status]?.label || lead.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(lead.created_at), 'dd.MM HH:mm', { locale: dateFnsLocale })}
                    </TableCell>
                    <TableCell>
                      {lead.ai_agent_status === 'running' ? (
                        <Badge variant="default" className="animate-pulse">▶ {t('leads.agentActive')}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t('leads.agentOff')}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedLeadId(lead.id); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={addLeadOpen} onOpenChange={setAddLeadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('leads.addLeadManually')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t('leads.firstName')} *</Label><Input value={newLead.first_name} onChange={e => setNewLead(p => ({ ...p, first_name: e.target.value }))} /></div>
              <div><Label>{t('leads.lastName')}</Label><Input value={newLead.last_name} onChange={e => setNewLead(p => ({ ...p, last_name: e.target.value }))} /></div>
            </div>
            <div><Label>{t('leads.phone')} *</Label><Input type="tel" value={newLead.phone} onChange={e => setNewLead(p => ({ ...p, phone: e.target.value }))} placeholder="+48..." /></div>
            <div><Label>{t('leads.email')}</Label><Input type="email" value={newLead.email} onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))} /></div>
            <div><Label>{t('leads.city')}</Label><Input value={newLead.city} onChange={e => setNewLead(p => ({ ...p, city: e.target.value }))} /></div>
            <div>
              <Label>{t('leads.priority')}</Label>
              <Select value={newLead.priority} onValueChange={v => setNewLead(p => ({ ...p, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hot">🔥 {t('leads.priorityHot')}</SelectItem>
                  <SelectItem value="warm">🟡 {t('leads.priorityWarm')}</SelectItem>
                  <SelectItem value="normal">⚪ {t('leads.priorityNormal')}</SelectItem>
                  <SelectItem value="cold">🔵 {t('leads.priorityCold')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t('leads.note')}</Label><Textarea value={newLead.notes} onChange={e => setNewLead(p => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddLeadOpen(false)}>{t('leads.cancel')}</Button>
            <Button onClick={() => addLeadMut.mutate()} disabled={!newLead.first_name || !newLead.phone || addLeadMut.isPending}>
              {t('leads.addLead')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedLeadId && (
        <LeadDetailDrawer
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onStatusChange={() => queryClient.invalidateQueries({ queryKey: ['leads'] })}
        />
      )}
    </div>
  );
}