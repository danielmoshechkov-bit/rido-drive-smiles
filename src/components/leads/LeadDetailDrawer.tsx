import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Phone, Mail, MapPin, Copy, Bot, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useState, useEffect } from 'react';

interface LeadDetailDrawerProps {
  leadId: string;
  onClose: () => void;
  onStatusChange: () => void;
}

const STATUS_OPTIONS = [
  { value: 'new', label: '🔵 Nowy' },
  { value: 'viewed', label: '👁️ Obejrzany' },
  { value: 'contacted', label: '📞 Skontaktowany' },
  { value: 'in_conversation', label: '💬 W rozmowie' },
  { value: 'meeting_booked', label: '📅 Spotkanie umówione' },
  { value: 'converted', label: '✅ Klient' },
  { value: 'rejected', label: '❌ Odrzucony' },
  { value: 'no_answer', label: '📵 Brak odpowiedzi' },
  { value: 'opted_out', label: '🚫 Rezygnacja' },
];

export function LeadDetailDrawer({ leadId, onClose, onStatusChange }: LeadDetailDrawerProps) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');

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
    toast.success('Skopiowano!');
  };

  if (!lead) return null;

  const customFields = lead.custom_form_fields as Record<string, string> | null;

  return (
    <Sheet open={true} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">Szczegóły leadu</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Contact Info */}
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
                  <a href={`tel:${lead.phone}`}>Zadzwoń</a>
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

          {/* Source Details */}
          <div className="space-y-2 border-t pt-4">
            <h4 className="font-medium text-sm text-muted-foreground">Szczegóły zapytania</h4>
            <div className="text-sm space-y-1">
              <p>Źródło: <Badge variant="outline">{lead.source === 'meta' ? '📘 Meta Ads' : lead.source === 'manual' ? '✋ Ręczny' : lead.source}</Badge></p>
              {lead.source_detail && <p>Kampania: {lead.source_detail}</p>}
              <p>Data: {format(new Date(lead.created_at), 'dd MMMM yyyy, HH:mm', { locale: pl })}</p>
            </div>
            {customFields && Object.keys(customFields).length > 0 && (
              <div className="mt-3 space-y-1">
                <h5 className="text-xs font-medium text-muted-foreground uppercase">Pola z formularza</h5>
                {Object.entries(customFields).map(([k, v]) => (
                  <div key={k} className="text-sm flex gap-2">
                    <span className="text-muted-foreground">{k}:</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status */}
          <div className="space-y-2 border-t pt-4">
            <Label>Status</Label>
            <Select value={lead.status} onValueChange={v => updateMut.mutate({ status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2 border-t pt-4">
            <Label>Notatki</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={() => { if (notes !== lead.notes) updateMut.mutate({ notes }); }}
              rows={3}
              placeholder="Dodaj notatki..."
            />
          </div>

          {/* AI Agent Section */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="font-medium flex items-center gap-2"><Bot className="h-4 w-4" /> AI Agent Sprzedażowy</h4>
            {lead.ai_agent_status === 'running' ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-green-800">Agent aktywny dla tego leadu</p>
                <p className="text-green-700 mt-1">Agent prowadzi rozmowę SMS i próbuje umówić spotkanie.</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => updateMut.mutate({ ai_agent_status: 'paused' })}>
                  Wstrzymaj agenta
                </Button>
              </div>
            ) : (
              <div className="bg-muted/50 border rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">Agent nieaktywny dla tego leadu</p>
                <Button variant="default" size="sm" className="mt-2" onClick={() => updateMut.mutate({ ai_agent_enabled: true, ai_agent_status: 'running' })}>
                  ▶ Uruchom AI Agenta
                </Button>
              </div>
            )}
          </div>

          {/* Activity Timeline */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="font-medium text-sm text-muted-foreground">Historia aktywności</h4>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-primary">●</span>
                <span className="text-muted-foreground">{format(new Date(lead.created_at), 'dd.MM HH:mm')}</span>
                <span>Lead przyszedł z {lead.source === 'meta' ? 'Meta Ads' : lead.source}</span>
              </div>
              {lead.last_contact_at && (
                <div className="flex gap-2">
                  <span className="text-primary">●</span>
                  <span className="text-muted-foreground">{format(new Date(lead.last_contact_at), 'dd.MM HH:mm')}</span>
                  <span>Ostatni kontakt</span>
                </div>
              )}
              {lead.meeting_scheduled_at && (
                <div className="flex gap-2">
                  <span className="text-green-500">●</span>
                  <span className="text-muted-foreground">{format(new Date(lead.meeting_scheduled_at), 'dd.MM HH:mm')}</span>
                  <span>Spotkanie umówione</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
