import { useState } from 'react';
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

const GOAL_OPTIONS = [
  { value: 'leads', icon: Target, label: '🎯 Zapytania (leady)', desc: 'Formularz kontaktowy na Facebooku/Instagramie' },
  { value: 'calls', icon: Phone, label: '📞 Telefony', desc: 'Reklama zachęcająca do zadzwonienia' },
  { value: 'messages', icon: MessageCircle, label: '💬 Wiadomości', desc: 'Klienci piszą na Messengera/WhatsApp' },
  { value: 'awareness', icon: Eye, label: '👁️ Zasięg', desc: 'Budowanie świadomości marki' },
];

export function AdOrderModal({ open, onClose, service, userId }: AdOrderModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    budget_monthly: 1500,
    campaign_goal: 'leads',
    target_location: '',
    target_audience: '',
    expected_leads: '',
    additional_notes: '',
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!userId || !service) throw new Error('Brak danych');
      const { error } = await supabase.from('ad_orders').insert({
        service_id: service.id,
        provider_user_id: userId,
        budget_monthly: form.budget_monthly,
        campaign_goal: form.campaign_goal,
        target_location: form.target_location,
        target_audience: form.target_audience || null,
        expected_leads_per_month: form.expected_leads ? parseInt(form.expected_leads) : null,
        additional_notes: form.additional_notes || null,
        campaign_name: `${service.name} - ${form.target_location} - Leady`,
        status: 'new',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-orders'] });
      toast.success('Zlecenie wysłane! Specjalista odezwie się do 24h. 🎉');
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
          <DialogTitle>📣 Uruchom reklamę — {service?.name}</DialogTitle>
          <DialogDescription>Nasz specjalista skonfiguruje kampanię Meta Ads i będzie ją optymalizować</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-5">
            {/* Budget */}
            <div className="space-y-2">
              <Label className="font-medium">Miesięczny budżet reklamowy *</Label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[form.budget_monthly]}
                  onValueChange={v => setForm(p => ({ ...p, budget_monthly: v[0] }))}
                  min={500} max={10000} step={100}
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={form.budget_monthly}
                  onChange={e => setForm(p => ({ ...p, budget_monthly: Number(e.target.value) }))}
                  className="w-24 text-right"
                />
                <span className="text-sm text-muted-foreground">zł</span>
              </div>
              <p className="text-xs text-muted-foreground">Szacowana liczba leadów: ~{estMin}–{estMax}/miesiąc</p>
            </div>

            {/* Goal */}
            <div className="space-y-2">
              <Label className="font-medium">Cel kampanii *</Label>
              <div className="grid grid-cols-2 gap-2">
                {GOAL_OPTIONS.map(g => (
                  <button
                    key={g.value}
                    onClick={() => setForm(p => ({ ...p, campaign_goal: g.value }))}
                    className={`text-left p-3 rounded-lg border-2 transition-colors ${
                      form.campaign_goal === g.value ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/30'
                    }`}
                  >
                    <div className="font-medium text-sm">{g.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{g.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Location */}
            <div>
              <Label className="font-medium">Lokalizacja docelowa *</Label>
              <Input
                value={form.target_location}
                onChange={e => setForm(p => ({ ...p, target_location: e.target.value }))}
                placeholder="np. Warszawa i okolice 50 km"
              />
            </div>

            {/* Target Audience */}
            <div>
              <Label className="font-medium">Grupa docelowa <span className="text-muted-foreground font-normal">(opcjonalne)</span></Label>
              <Textarea
                value={form.target_audience}
                onChange={e => setForm(p => ({ ...p, target_audience: e.target.value }))}
                placeholder="np. Właściciele samochodów premium, mężczyźni 30-55 lat"
                rows={2}
              />
            </div>

            {/* Expected Leads */}
            <div>
              <Label>Oczekiwana liczba leadów</Label>
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

            {/* Notes */}
            <div>
              <Label>Dodatkowe uwagi</Label>
              <Textarea
                value={form.additional_notes}
                onChange={e => setForm(p => ({ ...p, additional_notes: e.target.value }))}
                placeholder="Co chcesz zaznaczyć? Specjalne promocje, sezonowość..."
                rows={2}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <p><strong>Usługa:</strong> {service?.name}</p>
              <p><strong>Budżet:</strong> {form.budget_monthly} zł/miesiąc</p>
              <p><strong>Cel:</strong> {GOAL_OPTIONS.find(g => g.value === form.campaign_goal)?.label}</p>
              <p><strong>Lokalizacja:</strong> {form.target_location}</p>
              {form.target_audience && <p><strong>Grupa docelowa:</strong> {form.target_audience}</p>}
            </div>
            <p className="text-sm text-muted-foreground">
              Twoje zlecenie trafi do naszego specjalisty marketingu. Skontaktuje się z Tobą w ciągu 24h, aby omówić szczegóły i poprosić o dostęp do konta Meta.
            </p>
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
              <Send className="h-4 w-4 mr-1" /> Wyślij zlecenie
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
