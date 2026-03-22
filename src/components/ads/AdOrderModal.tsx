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
import { ArrowLeft, Send, Target, Phone, MessageCircle, Eye, Info } from 'lucide-react';

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
  const [serviceQuestions, setServiceQuestions] = useState({
    unique_value: '', customer_problem: '', customer_result: '',
    current_promotion: '', faq: '',
  });

  const GOAL_OPTIONS = [
    { value: 'leads', icon: Target, label: `🎯 ${t('ads.goalLeads', 'Zapytania (leady)')}`, desc: t('ads.goalLeadsDesc', 'Formularz kontaktowy na Facebooku/Instagramie') },
    { value: 'calls', icon: Phone, label: `📞 ${t('ads.goalCalls', 'Telefony')}`, desc: t('ads.goalCallsDesc', 'Reklama zachęcająca do zadzwonienia') },
    { value: 'messages', icon: MessageCircle, label: `💬 ${t('ads.goalMessages', 'Wiadomości')}`, desc: t('ads.goalMessagesDesc', 'Klienci piszą na Messengera/WhatsApp') },
    { value: 'awareness', icon: Eye, label: `👁️ ${t('ads.goalAwareness', 'Zasięg')}`, desc: t('ads.goalAwarenessDesc', 'Budowanie świadomości marki') },
  ];

  const createMut = useMutation({
    mutationFn: async () => {
      if (!userId || !service) throw new Error('Brak danych');
      const { error } = await supabase.from('ad_orders').insert({
        service_id: service.id, provider_user_id: userId,
        budget_monthly: form.budget_monthly, campaign_goal: form.campaign_goal,
        target_location: form.target_location, target_audience: form.target_audience || null,
        expected_leads_per_month: form.expected_leads ? parseInt(form.expected_leads) : null,
        additional_notes: JSON.stringify({
          notes: form.additional_notes,
          service_questions: serviceQuestions,
        }),
        campaign_name: `${service.name} - ${form.target_location} - Leady`,
        status: 'new',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-orders'] });
      toast.success('Zlecenie wysłane! Specjalista odezwie się w ciągu 24h 🎉');
      handleClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleClose = () => {
    setStep(1);
    setForm({ budget_monthly: 1500, campaign_goal: 'leads', target_location: '', target_audience: '', expected_leads: '', additional_notes: '' });
    setServiceQuestions({ unique_value: '', customer_problem: '', customer_result: '', current_promotion: '', faq: '' });
    onClose();
  };

  const estMin = Math.round(form.budget_monthly / 50);
  const estMax = Math.round(form.budget_monthly / 25);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? '📣 Uruchom reklamę' : '💡 Pomóż nam lepiej reklamować tę usługę'}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? `Usługa: ${service?.name}`
              : 'Te informacje trafią do specjalisty i do Twojego AI Agenta'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="font-medium">Miesięczny budżet reklamowy</Label>
              <div className="flex items-center gap-3">
                <Slider value={[form.budget_monthly]} onValueChange={v => setForm(p => ({ ...p, budget_monthly: v[0] }))} min={500} max={10000} step={100} className="flex-1" />
                <Input type="number" value={form.budget_monthly} onChange={e => setForm(p => ({ ...p, budget_monthly: Number(e.target.value) }))} className="w-24 text-right" />
                <span className="text-sm text-muted-foreground">zł</span>
              </div>
              <p className="text-xs text-muted-foreground">Szacowana liczba zapytań: ~{estMin}–{estMax}/mies.</p>
            </div>

            <div className="space-y-2">
              <Label className="font-medium">Cel kampanii</Label>
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
              <Label className="font-medium">Lokalizacja docelowa *</Label>
              <Input value={form.target_location} onChange={e => setForm(p => ({ ...p, target_location: e.target.value }))} placeholder="np. Warszawa 30 km / Cała Polska" />
            </div>

            <div>
              <Label className="font-medium">Grupa docelowa <span className="text-muted-foreground font-normal">(opcjonalne)</span></Label>
              <Textarea value={form.target_audience} onChange={e => setForm(p => ({ ...p, target_audience: e.target.value }))} placeholder="Opisz idealnego klienta" rows={2} />
            </div>

            <div>
              <Label>Oczekiwana liczba zapytań</Label>
              <Select value={form.expected_leads} onValueChange={v => setForm(p => ({ ...p, expected_leads: v }))}>
                <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">10–20 / miesiąc</SelectItem>
                  <SelectItem value="35">20–50 / miesiąc</SelectItem>
                  <SelectItem value="75">50–100 / miesiąc</SelectItem>
                  <SelectItem value="150">100+ / miesiąc</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Uwagi dla specjalisty</Label>
              <Textarea value={form.additional_notes} onChange={e => setForm(p => ({ ...p, additional_notes: e.target.value }))} placeholder="Co chcesz zaznaczyć? Specjalne promocje, sezonowość..." rows={2} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-medium">Co wyróżnia tę usługę na tle konkurencji?</Label>
              <Textarea
                value={serviceQuestions.unique_value}
                onChange={e => setServiceQuestions(p => ({ ...p, unique_value: e.target.value }))}
                placeholder="np. Używamy najnowszych technologii, 10 lat doświadczenia..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label className="font-medium">Jaki jest główny problem klienta przed skorzystaniem?</Label>
              <Textarea
                value={serviceQuestions.customer_problem}
                onChange={e => setServiceQuestions(p => ({ ...p, customer_problem: e.target.value }))}
                placeholder="np. Auto traci na wartości, brak czasu na samodzielne dbanie..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label className="font-medium">Jaki efekt/rezultat dostaje klient?</Label>
              <Textarea
                value={serviceQuestions.customer_result}
                onChange={e => setServiceQuestions(p => ({ ...p, customer_result: e.target.value }))}
                placeholder="np. Auto wygląda jak nowe, ochrona lakieru na 5 lat..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label className="font-medium">Czy masz teraz promocję lub ofertę specjalną?</Label>
              <Textarea
                value={serviceQuestions.current_promotion}
                onChange={e => setServiceQuestions(p => ({ ...p, current_promotion: e.target.value }))}
                placeholder="np. -20% na pierwszy detailing, pakiet zima gratis..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label className="font-medium">Najczęstsze pytania klientów o tę usługę</Label>
              <Textarea
                value={serviceQuestions.faq}
                onChange={e => setServiceQuestions(p => ({ ...p, faq: e.target.value }))}
                placeholder="np. Ile trwa? Czy trzeba zostawić auto? Jaka jest gwarancja?"
                rows={2}
              />
            </div>

            <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Te odpowiedzi pomogą AI Agentowi skuteczniej rozmawiać z klientami którzy trafią z reklamy
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 2 && (
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Wróć
            </Button>
          )}
          {step === 1 ? (
            <Button onClick={() => setStep(2)} disabled={!form.target_location || !form.campaign_goal}>
              Dalej →
            </Button>
          ) : (
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              <Send className="h-4 w-4 mr-1" /> Wyślij zlecenie ✓
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
