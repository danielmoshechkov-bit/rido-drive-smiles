import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Phone, Mail, MapPin, Copy, Bot } from 'lucide-react';
import { format } from 'date-fns';
import { pl, enUS } from 'date-fns/locale';
import { useState, useEffect } from 'react';

interface LeadDetailDrawerProps {
  leadId: string;
  onClose: () => void;
  onStatusChange: () => void;
}

export function LeadDetailDrawer({ leadId, onClose, onStatusChange }: LeadDetailDrawerProps) {
  const { t, i18n } = useTranslation();
  const dateFnsLocale = i18n.language === 'pl' ? pl : enUS;
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');

  const STATUS_OPTIONS = [
    { value: 'new', label: `🔵 ${t('leads.statusNew')}` },
    { value: 'viewed', label: `👁️ ${t('leads.statusViewed')}` },
    { value: 'contacted', label: `📞 ${t('leads.statusContacted')}` },
    { value: 'in_conversation', label: `💬 ${t('leads.statusInConversation')}` },
    { value: 'meeting_booked', label: `📅 ${t('leads.statusMeetingBookedFull')}` },
    { value: 'converted', label: `✅ ${t('leads.statusConverted')}` },
    { value: 'rejected', label: `❌ ${t('leads.statusRejected')}` },
    { value: 'no_answer', label: `📵 ${t('leads.statusNoAnswer')}` },
    { value: 'opted_out', label: `🚫 ${t('leads.statusOptedOut')}` },
  ];

  const { data: lead } = useQuery({
    queryKey: ['lead-detail', leadId],
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('*').eq('id', leadId).single();
      return data;
    },
  });

  useEffect(() => {
    if (lead?.notes) setNotes(lead.notes);
  }, [lead?.notes]);

  const updateMut = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await supabase.from('leads').update(updates).eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-detail', leadId] });
      onStatusChange();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t('leads.copied'));
  };

  if (!lead) return null;

  const customFields = lead.custom_form_fields as Record<string, string> | null;

  return (
    <Sheet open={true} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">{t('leads.leadDetails')}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-3">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <span>👤</span> {lead.first_name} {lead.last_name}
            </h3>
            {lead.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono">{lead.phone}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(lead.phone)}>
                  <Copy className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <a href={`tel:${lead.phone}`}>{t('leads.call')}</a>
                </Button>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{lead.email}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(lead.email)}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
            {lead.city && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{lead.city}</span>
              </div>
            )}
          </div>

          <div className="space-y-2 border-t pt-4">
            <h4 className="font-medium text-sm text-muted-foreground">{t('leads.queryDetails')}</h4>
            <div className="text-sm space-y-1">
              <p>{t('leads.source')}: <Badge variant="outline">{lead.source === 'meta' ? `📘 ${t('leads.sourceMeta')}` : lead.source === 'manual' ? `✋ ${t('leads.sourceManual')}` : lead.source}</Badge></p>
              {lead.source_detail && <p>{t('leads.campaign')}: {lead.source_detail}</p>}
              <p>{t('leads.date')}: {format(new Date(lead.created_at), 'dd MMMM yyyy, HH:mm', { locale: dateFnsLocale })}</p>
            </div>
            {customFields && Object.keys(customFields).length > 0 && (
              <div className="mt-3 space-y-1">
                <h5 className="text-xs font-medium text-muted-foreground uppercase">{t('leads.formFields')}</h5>
                {Object.entries(customFields).map(([k, v]) => (
                  <div key={k} className="text-sm flex gap-2">
                    <span className="text-muted-foreground">{k}:</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label>{t('leads.status')}</Label>
            <Select value={lead.status} onValueChange={v => updateMut.mutate({ status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label>{t('leads.notes')}</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={() => { if (notes !== lead.notes) updateMut.mutate({ notes }); }}
              rows={3}
              placeholder={t('leads.addNotes')}
            />
          </div>

          <div className="space-y-3 border-t pt-4">
            <h4 className="font-medium flex items-center gap-2"><Bot className="h-4 w-4" /> {t('leads.aiSalesAgent')}</h4>
            {lead.ai_agent_status === 'running' ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-green-800">{t('leads.agentActiveForLead')}</p>
                <p className="text-green-700 mt-1">{t('leads.agentActiveDesc')}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => updateMut.mutate({ ai_agent_status: 'paused' })}>
                  {t('leads.pauseAgent')}
                </Button>
              </div>
            ) : (
              <div className="bg-muted/50 border rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">{t('leads.agentInactiveForLead')}</p>
                <Button variant="default" size="sm" className="mt-2" onClick={() => updateMut.mutate({ ai_agent_enabled: true, ai_agent_status: 'running' })}>
                  ▶ {t('leads.startAgent')}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <h4 className="font-medium text-sm text-muted-foreground">{t('leads.activityHistory')}</h4>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-primary">●</span>
                <span className="text-muted-foreground">{format(new Date(lead.created_at), 'dd.MM HH:mm')}</span>
                <span>{t('leads.leadCameFrom')} {lead.source === 'meta' ? 'Meta Ads' : lead.source}</span>
              </div>
              {lead.last_contact_at && (
                <div className="flex gap-2">
                  <span className="text-primary">●</span>
                  <span className="text-muted-foreground">{format(new Date(lead.last_contact_at), 'dd.MM HH:mm')}</span>
                  <span>{t('leads.lastContact')}</span>
                </div>
              )}
              {lead.meeting_scheduled_at && (
                <div className="flex gap-2">
                  <span className="text-green-500">●</span>
                  <span className="text-muted-foreground">{format(new Date(lead.meeting_scheduled_at), 'dd.MM HH:mm')}</span>
                  <span>{t('leads.meetingBooked')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}