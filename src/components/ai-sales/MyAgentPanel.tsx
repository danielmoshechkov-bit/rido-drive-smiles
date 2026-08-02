import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Bot, ChevronDown, ChevronRight, Plus, Save, Loader2, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ProviderOfferSummary } from './ProviderOfferSummary';
import { useProviderOffer, formatServicePrice } from '@/hooks/useProviderOffer';

const DEFAULT_OBJECTIONS = [
  { key: 'price', label: '"Za drogo / nie mam budżetu"' },
  { key: 'think', label: '"Muszę się zastanowić / oddzwonię"' },
  { key: 'competitor', label: '"Znalazłem taniej u konkurencji"' },
  { key: 'time', label: '"Nie mam teraz czasu"' },
  { key: 'trust', label: '"Skąd wiem że jesteście dobrzy?"' },
  { key: 'diy', label: '"Zrobię to sam / poradzimy sobie"' },
];

interface AgentProfile {
  // Zasady rozmowy
  forbidden_phrases: string;
  // Argumenty sprzedażowe (nie ma ich w karcie usług)
  service_guarantee: string;
  case_studies: string;
  // Negocjacje — dolna granica ceny, widoczna tylko dla agenta
  price_floor: string;
  // Klient
  ideal_customer: string;
  // Obiekcje
  objection_price: string;
  objection_think: string;
  objection_competitor: string;
  objection_time: string;
  objection_trust: string;
  objection_diy: string;
  custom_objections: { name: string; answer: string }[];
  // Styl
  tone: string;
}

const EMPTY_PROFILE: AgentProfile = {
  forbidden_phrases: '',
  service_guarantee: '', case_studies: '',
  price_floor: '',
  ideal_customer: '',
  objection_price: '', objection_think: '', objection_competitor: '',
  objection_time: '', objection_trust: '', objection_diy: '',
  custom_objections: [],
  tone: 'semiformal',
};

const COUNTABLE_FIELDS: (keyof AgentProfile)[] = [
  'price_floor', 'ideal_customer', 'service_guarantee',
  'objection_price', 'objection_think', 'objection_competitor',
  'tone',
];

function calcStrength(p: AgentProfile, hasServices: boolean): number {
  const total = COUNTABLE_FIELDS.length + 1; // +1 za cennik z „Moje usługi"
  let filled = hasServices ? 1 : 0;
  for (const k of COUNTABLE_FIELDS) {
    const v = p[k];
    if (typeof v === 'string' && v.trim()) filled++;
    else if (Array.isArray(v) && v.length > 0) filled++;
  }
  return Math.round((filled / total) * 100);
}

function strengthLabel(pct: number): { text: string; color: string } {
  if (pct <= 30) return { text: 'Uzupełnij dane żeby Agent mógł zacząć pracować', color: 'text-destructive' };
  if (pct <= 60) return { text: 'Dobry start! Dodaj jeszcze odpowiedzi na obiekcje', color: 'text-yellow-600' };
  if (pct <= 85) return { text: 'Agent jest gotowy do pracy. Dodaj przykłady realizacji żeby był jeszcze lepszy', color: 'text-blue-600' };
  return { text: 'Agent na poziomie eksperta 🏆', color: 'text-green-600' };
}

export function MyAgentPanel({
  providerId = null,
  onGoToServices,
}: {
  providerId?: string | null;
  onGoToServices?: () => void;
}) {
  const [profile, setProfile] = useState<AgentProfile>(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [openSections, setOpenSections] = useState({ company: true });
  const [agentActive, setAgentActive] = useState(true);

  const { data: offer } = useProviderOffer(providerId);

  // Load existing profile
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: config } = await supabase
      .from('ai_agent_configs')
      .select('*, ai_call_business_profiles(*)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (config?.ai_call_business_profiles) {
      const bp = config.ai_call_business_profiles;
      const stored = bp.faq_json as any || {};
      setProfile(prev => ({ ...prev, ...stored }));
      setAgentActive(config.is_active || false);
    }
  };

  const handleFieldBlur = useCallback(() => {
    setSaved(false);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie zalogowano');

      // Dane firmy i cennik — zawsze z karty usług, nigdy z kopii w profilu agenta
      const companyName = offer?.company?.company_name || 'Moja firma';
      const companyDescription = offer?.company?.description || '';
      const servicesJson = (offer?.services || []).map(s => ({
        name: s.name,
        category: s.category,
        price_from: s.price_from,
        price_to: s.price_to,
        duration_minutes: s.duration_minutes,
        currency: 'PLN',
      }));

      const { data: config } = await supabase
        .from('ai_agent_configs')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      let configId = config?.id;
      if (!configId) {
        const { data: newConfig, error: cfgErr } = await supabase
          .from('ai_agent_configs')
          .insert({
            user_id: user.id,
            company_name: companyName,
            company_description: companyDescription,
            service_area: offer?.company?.location || null,
            services: servicesJson as any,
            conversation_style: profile.tone,
            is_active: agentActive,
          })
          .select('id')
          .single();
        if (cfgErr) throw cfgErr;
        configId = newConfig.id;
      } else {
        const { error: updErr } = await supabase.from('ai_agent_configs').update({
          company_name: companyName,
          company_description: companyDescription,
          service_area: offer?.company?.location || null,
          services: servicesJson as any,
          conversation_style: profile.tone,
          is_active: agentActive,
        }).eq('id', configId);
        if (updErr) throw updErr;
      }

      const payload = {
        business_description: companyDescription,
        faq_json: profile as any,
        services_json: servicesJson as any,
        pricing_notes: profile.price_floor
          ? `Minimalna akceptowalna cena (nie ujawniać klientowi): ${profile.price_floor} zł`
          : null,
      };

      const { data: existingProfile } = await supabase
        .from('ai_call_business_profiles')
        .select('id')
        .eq('config_id', configId)
        .maybeSingle();

      const { error: profErr } = existingProfile
        ? await supabase.from('ai_call_business_profiles').update(payload).eq('config_id', configId)
        : await supabase.from('ai_call_business_profiles').insert({ config_id: configId, ...payload });
      if (profErr) throw profErr;

      setSaved(true);
      toast.success('Dane zapisane i Agent zaktualizowany ✓');
    } catch (err: any) {
      toast.error('Błąd zapisu: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const strength = calcStrength(profile, !!offer?.services.length);
  const sl = strengthLabel(strength);

  const updateField = (key: keyof AgentProfile, value: any) => {
    setProfile(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const addCustomObjection = () => {
    setProfile(prev => ({
      ...prev,
      custom_objections: [...prev.custom_objections, { name: '', answer: '' }],
    }));
  };

  const updateCustomObjection = (index: number, field: 'name' | 'answer', value: string) => {
    setProfile(prev => ({
      ...prev,
      custom_objections: prev.custom_objections.map((o, i) => i === index ? { ...o, [field]: value } : o),
    }));
  };

  const cheapest = offer?.services.length
    ? offer.services.reduce((min, s) => (Number(s.price_from) || Infinity) < (Number(min.price_from) || Infinity) ? s : min)
    : null;

  return (
    <div className="space-y-4">
      {/* Dane firmy i cennik — źródło prawdy: „Moje usługi" */}
      <ProviderOfferSummary providerId={providerId} onGoToServices={onGoToServices} />

      {/* Wiedza sprzedażowa Agenta */}
      <Collapsible open={openSections.company} onOpenChange={v => setOpenSections(p => ({ ...p, company: v }))}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Jak Agent ma rozmawiać</CardTitle>
                  {saved && <Badge variant="outline" className="text-green-600 border-green-300">Zapisano ✓</Badge>}
                </div>
                {openSections.company ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
              <p className="text-sm text-muted-foreground text-left">Tu ustawiasz tylko to, czego nie ma w karcie usług — argumenty, granice i styl</p>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
              {/* Strength indicator */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Siła Agenta</span>
                  <span className="font-bold">{strength}%</span>
                </div>
                <Progress value={strength} className="h-2" />
                <p className={`text-xs ${sl.color}`}>{sl.text}</p>
              </div>

              {/* Granice */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm border-b pb-1">🚧 Granice Agenta</h4>
                <div className="space-y-1">
                  <Label className="flex items-center gap-1">
                    <Shield className="h-3 w-3 text-destructive" /> Minimalna cena, poniżej której Agent nie schodzi (zł)
                  </Label>
                  <Input type="number" className="max-w-[200px]" value={profile.price_floor} onChange={e => updateField('price_floor', e.target.value)} onBlur={handleFieldBlur} />
                  <p className="text-[11px] text-muted-foreground">
                    Tylko dla Agenta — klient tego nie usłyszy. Ceny usług Agent podaje z karty usług
                    {cheapest ? ` (najtańsza: ${cheapest.name} — ${formatServicePrice(cheapest)})` : ''}.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-destructive">⛔ Czego Agent NIGDY nie powinien mówić</Label>
                  <Textarea value={profile.forbidden_phrases} onChange={e => updateField('forbidden_phrases', e.target.value)} onBlur={handleFieldBlur} className="border-destructive/30" placeholder="np. Nie dawaj rabatów powyżej 10%, nie obiecuj terminów..." rows={2} />
                </div>
              </div>

              {/* Argumenty */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm border-b pb-1">💬 Argumenty sprzedażowe</h4>
                <div className="space-y-1">
                  <Label>Idealny klient</Label>
                  <Textarea value={profile.ideal_customer} onChange={e => updateField('ideal_customer', e.target.value)} onBlur={handleFieldBlur} placeholder="Kogo obsługujecie najlepiej, czego zwykle potrzebuje..." rows={2} />
                </div>
                <div className="space-y-1">
                  <Label>Gwarancja</Label>
                  <Textarea value={profile.service_guarantee} onChange={e => updateField('service_guarantee', e.target.value)} onBlur={handleFieldBlur} placeholder="np. 12 miesięcy gwarancji na robociznę" rows={2} />
                </div>
                <div className="space-y-1">
                  <Label>Przykłady realizacji (problem → rozwiązanie → efekt)</Label>
                  <Textarea value={profile.case_studies} onChange={e => updateField('case_studies', e.target.value)} onBlur={handleFieldBlur} rows={3} />
                </div>
              </div>

              {/* Obiekcje */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm border-b pb-1">💪 Naucz Agenta jak odpowiadać na trudne pytania</h4>
                <p className="text-xs text-muted-foreground">Wpisz jak Ty odpowiadasz — Agent nauczy się tego</p>

                {DEFAULT_OBJECTIONS.map(obj => (
                  <div key={obj.key} className="border-l-4 border-destructive/40 pl-3 space-y-1">
                    <Label className="text-sm font-medium">{obj.label}</Label>
                    <Textarea
                      value={(profile as any)[`objection_${obj.key}`] || ''}
                      onChange={e => updateField(`objection_${obj.key}` as keyof AgentProfile, e.target.value)}
                      onBlur={handleFieldBlur}
                      placeholder="Twoja odpowiedź na tę obiekcję..."
                      rows={2}
                    />
                  </div>
                ))}

                {profile.custom_objections.map((obj, i) => (
                  <div key={i} className="border-l-4 border-primary/40 pl-3 space-y-1">
                    <Input value={obj.name} onChange={e => updateCustomObjection(i, 'name', e.target.value)} placeholder="Nazwa obiekcji..." className="text-sm font-medium" />
                    <Textarea value={obj.answer} onChange={e => updateCustomObjection(i, 'answer', e.target.value)} placeholder="Twoja odpowiedź..." rows={2} />
                  </div>
                ))}

                <Button variant="outline" size="sm" onClick={addCustomObjection}>
                  <Plus className="h-3 w-3 mr-1" /> Dodaj własną obiekcję
                </Button>
              </div>

              {/* Styl */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm border-b pb-1">🎨 Styl komunikacji</h4>
                <div className="flex flex-col sm:flex-row gap-2">
                  {[
                    { value: 'formal', label: '🎩 Formalny (Pan/Pani)' },
                    { value: 'semiformal', label: '👔 Półformalny' },
                    { value: 'casual', label: '😊 Nieformalny (ty)' },
                  ].map(t => (
                    <button key={t.value} onClick={() => updateField('tone', t.value)}
                      className={`flex-1 p-2 rounded-lg border-2 text-sm transition-colors ${profile.tone === t.value ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/30'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Agent aktywny */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>Agent aktywny</Label>
                  <p className="text-xs text-muted-foreground">Gdy wyłączony — Agent nie kontaktuje nowych leadów</p>
                </div>
                <Switch checked={agentActive} onCheckedChange={v => { setAgentActive(v); setSaved(false); }} />
              </div>

              {/* Save button */}
              <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
                {saving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Zapisuję...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" /> Zapisz i aktywuj Agenta</>
                )}
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
