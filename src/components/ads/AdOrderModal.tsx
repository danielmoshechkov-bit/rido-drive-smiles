import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { ArrowLeft, Send, Target, Phone, MessageCircle, Eye } from 'lucide-react';

interface AdOrderModalProps {
  open: boolean;
  onClose: () => void;
  service: { id: string; name: string } | null;
  userId: string | null;
}

export function AdOrderModal({ open, onClose, service, userId }: AdOrderModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    budget_monthly: 1500, campaign_goal: 'leads', target_location: '',
    target_audience: '', expected_leads: '', additional_notes: '',
  });

  const GOAL_OPTIONS = [
    { value: 'leads', icon: Target, label: `🎯 ${t('ads.goalLeads')}`, desc: t('ads.goalLeadsDesc') },
    { value: 'calls', icon: Phone, label: `📞 ${t('ads.goalCalls')}`, desc: t('ads.goalCallsDesc') },
    { value: 'messages', icon: MessageCircle, label: `💬 ${t('ads.goalMessages')}`, desc: t('ads.goalMessagesDesc') },
    { value: 'awareness', icon: Eye, label: `👁️ ${t('ads.goalAwareness')}`, desc: t('ads.goalAwarenessDesc') },
  ];

  const createMut = useMutation({
    mutationFn: async () => {
      if (!userId || !service) throw new Error(t('ads.noData'));
      const { error } = await supabase.from('ad_orders').insert({
        service_id: service.id, provider_user_id: userId,
        budget_monthly: form.budget_monthly, campaign_goal: form.campaign_goal,
        target_location: form.target_location, target_audience: form.target_audience || null,
        expected_leads_per_month: form.expected_leads ? parseInt(form.expected_leads) : null,
        additional_notes: form.additional_notes || null,
        campaign_name: `${service.name} - ${form.target_location} - Leady`,
        status: 'new',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-orders'] });
      toast.success(t('ads.orderSent'));
      onClose();
      setStep(1);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const estMin = Math.round(form.budget_monthly / 50);
  const estMax = Math.round(form.budget_monthly / 25);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>📣 {t('ads.launchAd')} — {service?.name}</DialogTitle>
          <DialogDescription>{t('ads.launchAdDesc')}</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="font-medium">{t('ads.monthlyBudget')}</Label>
              <div className="flex items-center gap-3">
                <Slider value={[form.budget_monthly]} onValueChange={v => setForm(p => ({ ...p, budget_monthly: v[0] }))} min={500} max={10000} step={100} className="flex-1" />
                <Input type="number" value={form.budget_monthly} onChange={e => setForm(p => ({ ...p, budget_monthly: Number(e.target.value) }))} className="w-24 text-right" />
                <span className="text-sm text-muted-foreground">zł</span>
              </div>
              <p className="text-xs text-muted-foreground">{t('ads.estimatedLeads')}: ~{estMin}–{estMax}/{t('ads.perMonth')}</p>
            </div>

            <div className="space-y-2">
              <Label className="font-medium">{t('ads.campaignGoal')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {GOAL_OPTIONS.map(g => (
                  <button key={g.value} onClick={() => setForm(p => ({ ...p, campaign_goal: g.value }))}
                    className={`text-left p-3 rounded-lg border-2 transition-colors ${form.campaign_goal === g.value ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/30'}`}>
                    <div className="font-medium text-sm">{g.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{g.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="font-medium">{t('ads.targetLocation')}</Label>
              <Input value={form.target_location} onChange={e => setForm(p => ({ ...p, target_location: e.target.value }))} placeholder={t('ads.targetLocationPlaceholder')} />
            </div>

            <div>
              <Label className="font-medium">{t('ads.targetAudience')} <span className="text-muted-foreground font-normal">({t('ads.targetAudienceOptional')})</span></Label>
              <Textarea value={form.target_audience} onChange={e => setForm(p => ({ ...p, target_audience: e.target.value }))} placeholder={t('ads.targetAudiencePlaceholder')} rows={2} />
            </div>

            <div>
              <Label>{t('ads.expectedLeads')}</Label>
              <Select value={form.expected_leads} onValueChange={v => setForm(p => ({ ...p, expected_leads: v }))}>
                <SelectTrigger><SelectValue placeholder={t('ads.selectPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">10–20 / {t('ads.perMonth')}</SelectItem>
                  <SelectItem value="35">20–50 / {t('ads.perMonth')}</SelectItem>
                  <SelectItem value="75">50–100 / {t('ads.perMonth')}</SelectItem>
                  <SelectItem value="150">100+ / {t('ads.perMonth')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('ads.additionalNotes')}</Label>
              <Textarea value={form.additional_notes} onChange={e => setForm(p => ({ ...p, additional_notes: e.target.value }))} placeholder={t('ads.additionalNotesPlaceholder')} rows={2} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <p><strong>{t('ads.service')}:</strong> {service?.name}</p>
              <p><strong>{t('ads.budget')}:</strong> {form.budget_monthly} zł/{t('ads.perMonth')}</p>
              <p><strong>{t('ads.goal')}:</strong> {GOAL_OPTIONS.find(g => g.value === form.campaign_goal)?.label}</p>
              <p><strong>{t('ads.location')}:</strong> {form.target_location}</p>
              {form.target_audience && <p><strong>{t('ads.targetAudience')}:</strong> {form.target_audience}</p>}
            </div>
            <p className="text-sm text-muted-foreground">{t('ads.confirmDesc')}</p>
          </div>
        )}

        <DialogFooter>
          {step === 2 && (
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> {t('ads.back')}
            </Button>
          )}
          {step === 1 ? (
            <Button onClick={() => setStep(2)} disabled={!form.target_location || !form.campaign_goal}>
              {t('ads.next')}
            </Button>
          ) : (
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              <Send className="h-4 w-4 mr-1" /> {t('ads.sendOrder')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}