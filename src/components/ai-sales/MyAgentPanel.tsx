import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Building2, ChevronDown, ChevronRight, Plus, Save, Loader2,
  BarChart3, MessageSquare, Calendar, TrendingUp, Shield
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery, useMutation } from '@tanstack/react-query';

const DEFAULT_OBJECTIONS = [
  { key: 'price', label: '"Za drogo / nie mam budżetu"' },
  { key: 'think', label: '"Muszę się zastanowić / oddzwonię"' },
  { key: 'competitor', label: '"Znalazłem taniej u konkurencji"' },
  { key: 'time', label: '"Nie mam teraz czasu"' },
  { key: 'trust', label: '"Skąd wiem że jesteście dobrzy?"' },
  { key: 'diy', label: '"Zrobię to sam / poradzimy sobie"' },
];

interface AgentProfile {
  // Company
  company_name: string;
  company_description: string;
  years_in_business: string;
  team_size: string;
  location: string;
  achievements: string;
  certifications: string;
  forbidden_phrases: string;
  // Service
  service_description: string;
  service_process: string;
  service_duration: string;
  service_results: string;
  service_guarantee: string;
  case_studies: string;
  // Pricing
  price_min: string;
  price_max: string;
  price_floor: string;
  price_justification: string;
  // Customer
  ideal_customer: string;
  customer_problems: string;
  customer_transformation: string;
  wrong_customer: string;
  // Objections
  objection_price: string;
  objection_think: string;
  objection_competitor: string;
  objection_time: string;
  objection_trust: string;
  objection_diy: string;
  custom_objections: { name: string; answer: string }[];
  // Style
  tone: string;
  contact_hours: string;
  meeting_types: string[];
}

const EMPTY_PROFILE: AgentProfile = {
  company_name: '', company_description: '', years_in_business: '', team_size: '',
  location: '', achievements: '', certifications: '', forbidden_phrases: '',
  service_description: '', service_process: '', service_duration: '',
  service_results: '', service_guarantee: '', case_studies: '',
  price_min: '', price_max: '', price_floor: '', price_justification: '',
  ideal_customer: '', customer_problems: '', customer_transformation: '', wrong_customer: '',
  objection_price: '', objection_think: '', objection_competitor: '',
  objection_time: '', objection_trust: '', objection_diy: '',
  custom_objections: [],
  tone: 'semiformal', contact_hours: '', meeting_types: [],
};

const COUNTABLE_FIELDS: (keyof AgentProfile)[] = [
  'company_name', 'company_description', 'location',
  'service_description', 'price_min', 'price_max', 'price_floor',
  'ideal_customer', 'objection_price', 'objection_think', 'objection_competitor',
  'tone',
];

function calcStrength(p: AgentProfile): number {
  const total = COUNTABLE_FIELDS.length;
  let filled = 0;
  for (const k of COUNTABLE_FIELDS) {
    const v = p[k];
    if (typeof v === 'string' && v.trim()) filled++;
    else if (Array.isArray(v) && v.length > 0) filled++;
  }
  return Math.round((filled / total) * 100);
}

function strengthLabel(pct: number): { text: string; color: string } {
  if (pct <= 30) return { text: 'Uzupełnij dane żeby Agent mógł zacząć pracować', color: 'text-destructive' };
  if (pct <= 60) return { text: 'Dobry start! Dodaj jeszcze ceny i obiekcje', color: 'text-yellow-600' };
  if (pct <= 85) return { text: 'Agent jest gotowy do pracy. Dodaj case studies żeby był jeszcze lepszy', color: 'text-blue-600' };
  return { text: 'Agent na poziomie eksperta 🏆', color: 'text-green-600' };
}

export function MyAgentPanel() {
  const [profile, setProfile] = useState<AgentProfile>(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [openSections, setOpenSections] = useState({ company: true, results: false, settings: false });

  // Agent settings
  const [agentActive, setAgentActive] = useState(true);
  const [autoContact, setAutoContact] = useState(true);
  const [notifyMeeting, setNotifyMeeting] = useState(true);
  const [notifyNoAnswer, setNotifyNoAnswer] = useState(false);

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
      setProfile(prev => ({
        ...prev,
        company_name: config.company_name || '',
        company_description: bp.business_description || '',
        ...stored,
      }));
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

      const { data: config } = await supabase
        .from('ai_agent_configs')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!config) {
        // Create config + profile
        const { data: newConfig, error: cfgErr } = await supabase
          .from('ai_agent_configs')
          .insert({
            user_id: user.id,
            company_name: profile.company_name,
            is_active: agentActive,
          })
          .select('id')
          .single();
        if (cfgErr) throw cfgErr;

        await supabase.from('ai_call_business_profiles').insert({
          config_id: newConfig.id,
          business_description: profile.company_description,
          faq_json: profile as any,
        });
      } else {
        await supabase.from('ai_agent_configs').update({
          company_name: profile.company_name,
          is_active: agentActive,
        }).eq('id', config.id);

        const { data: existingProfile } = await supabase
          .from('ai_call_business_profiles')
          .select('id')
          .eq('config_id', config.id)
          .maybeSingle();

        const payload = {
          business_description: profile.company_description,
          faq_json: profile as any,
          pricing_notes: profile.price_justification,
        };

        if (existingProfile) {
          await supabase.from('ai_call_business_profiles').update(payload).eq('config_id', config.id);
        } else {
          await supabase.from('ai_call_business_profiles').insert({ config_id: config.id, ...payload });
        }
      }

      setSaved(true);
      toast.success('Dane zapisane i Agent zaktualizowany ✓');
    } catch (err: any) {
      toast.error('Błąd zapisu: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const strength = calcStrength(profile);
  const sl = strengthLabel(strength);

  const updateField = (key: keyof AgentProfile, value: any) => {
    setProfile(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const toggleMeetingType = (type: string) => {
    setProfile(prev => ({
      ...prev,
      meeting_types: prev.meeting_types.includes(type)
        ? prev.meeting_types.filter(t => t !== type)
        : [...prev.meeting_types, type],
    }));
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

  return (
    <div className="space-y-4">
      {/* ════════ SEKCJA 1: O Twojej firmie ════════ */}
      <Collapsible open={openSections.company} onOpenChange={v => setOpenSections(p => ({ ...p, company: v }))}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Dane firmy i usługi</CardTitle>
                  {saved && <Badge variant="outline" className="text-green-600 border-green-300">Zapisano ✓</Badge>}
                </div>
                {openSections.company ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
              <p className="text-sm text-muted-foreground text-left">Im więcej podasz, tym lepiej Agent będzie rozmawiał z klientami</p>
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

              {/* BLOK A: Firma */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm border-b pb-1">🏢 Twoja firma</h4>
                <div className="space-y-1">
                  <Label>Pełna nazwa firmy *</Label>
                  <Input value={profile.company_name} onChange={e => updateField('company_name', e.target.value)} onBlur={handleFieldBlur} placeholder="np. Auto Detailing Kowalski" />
                </div>
                <div className="space-y-1">
                  <Label>Opisz firmę w 3–5 zdaniach *</Label>
                  <Textarea value={profile.company_description} onChange={e => updateField('company_description', e.target.value)} onBlur={handleFieldBlur} placeholder="Czym się zajmujecie, dla kogo, dlaczego jesteście najlepsi..." rows={3} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Ile lat na rynku</Label>
                    <Select value={profile.years_in_business} onValueChange={v => updateField('years_in_business', v)}>
                      <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="<1">Mniej niż rok</SelectItem>
                        <SelectItem value="1-3">1–3 lata</SelectItem>
                        <SelectItem value="3-10">3–10 lat</SelectItem>
                        <SelectItem value="10+">10+ lat</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Liczba pracowników</Label>
                    <Select value={profile.team_size} onValueChange={v => updateField('team_size', v)}>
                      <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Tylko ja</SelectItem>
                        <SelectItem value="2-5">2–5</SelectItem>
                        <SelectItem value="6-20">6–20</SelectItem>
                        <SelectItem value="20+">20+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Miasto i obszar działania *</Label>
                  <Input value={profile.location} onChange={e => updateField('location', e.target.value)} onBlur={handleFieldBlur} placeholder="np. Warszawa i okolice 50 km" />
                </div>
                <div className="space-y-1">
                  <Label>Największe sukcesy / osiągnięcia</Label>
                  <Textarea value={profile.achievements} onChange={e => updateField('achievements', e.target.value)} onBlur={handleFieldBlur} placeholder="Nagrody, liczba klientów, realizacje..." rows={2} />
                </div>
                <div className="space-y-1">
                  <Label>Certyfikaty i uprawnienia</Label>
                  <Textarea value={profile.certifications} onChange={e => updateField('certifications', e.target.value)} onBlur={handleFieldBlur} rows={2} />
                </div>
                <div className="space-y-1">
                  <Label className="text-destructive">⛔ Czego Agent NIGDY nie powinien mówić</Label>
                  <Textarea value={profile.forbidden_phrases} onChange={e => updateField('forbidden_phrases', e.target.value)} onBlur={handleFieldBlur} className="border-destructive/30" placeholder="np. Nie dawaj rabatów powyżej 10%, nie obiecuj terminów..." rows={2} />
                </div>
              </div>

              {/* BLOK B: Usługa */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm border-b pb-1">🔧 Twoja usługa</h4>
                <div className="space-y-1">
                  <Label>Szczegółowy opis usługi *</Label>
                  <Textarea value={profile.service_description} onChange={e => updateField('service_description', e.target.value)} onBlur={handleFieldBlur} placeholder="Co dokładnie dostaje klient..." rows={3} />
                </div>
                <div className="space-y-1">
                  <Label>Proces realizacji krok po kroku</Label>
                  <Textarea value={profile.service_process} onChange={e => updateField('service_process', e.target.value)} onBlur={handleFieldBlur} rows={2} />
                </div>
                <div className="space-y-1">
                  <Label>Czas realizacji</Label>
                  <Input value={profile.service_duration} onChange={e => updateField('service_duration', e.target.value)} onBlur={handleFieldBlur} placeholder="np. 2-3 godziny / 1 dzień roboczy" />
                </div>
                <div className="space-y-1">
                  <Label>Efekty/rezultaty (konkretne liczby)</Label>
                  <Textarea value={profile.service_results} onChange={e => updateField('service_results', e.target.value)} onBlur={handleFieldBlur} rows={2} />
                </div>
                <div className="space-y-1">
                  <Label>Gwarancja</Label>
                  <Textarea value={profile.service_guarantee} onChange={e => updateField('service_guarantee', e.target.value)} onBlur={handleFieldBlur} rows={2} />
                </div>
                <div className="space-y-1">
                  <Label>Case studies (2–3 przykłady: problem → rozwiązanie → efekt)</Label>
                  <Textarea value={profile.case_studies} onChange={e => updateField('case_studies', e.target.value)} onBlur={handleFieldBlur} rows={3} />
                </div>
              </div>

              {/* BLOK C: Ceny */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm border-b pb-1">💰 Ceny</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Cena minimalna (zł)</Label>
                    <Input type="number" value={profile.price_min} onChange={e => updateField('price_min', e.target.value)} onBlur={handleFieldBlur} />
                  </div>
                  <div className="space-y-1">
                    <Label>Cena maksymalna (zł)</Label>
                    <Input type="number" value={profile.price_max} onChange={e => updateField('price_max', e.target.value)} onBlur={handleFieldBlur} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-destructive flex items-center gap-1">
                      <Shield className="h-3 w-3" /> Min. akceptowalna *
                    </Label>
                    <Input type="number" value={profile.price_floor} onChange={e => updateField('price_floor', e.target.value)} onBlur={handleFieldBlur} />
                    <p className="text-[10px] text-muted-foreground">Tylko dla Agenta — klient nie zobaczy</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Uzasadnienie ceny</Label>
                  <Textarea value={profile.price_justification} onChange={e => updateField('price_justification', e.target.value)} onBlur={handleFieldBlur} placeholder="Dlaczego ta cena jest adekwatna?" rows={2} />
                </div>
              </div>

              {/* BLOK D: Klient */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm border-b pb-1">👤 Twój klient</h4>
                <div className="space-y-1">
                  <Label>Idealny klient *</Label>
                  <Textarea value={profile.ideal_customer} onChange={e => updateField('ideal_customer', e.target.value)} onBlur={handleFieldBlur} placeholder="Wiek, sytuacja, potrzeby..." rows={2} />
                </div>
                <div className="space-y-1">
                  <Label>Problemy klienta przed skorzystaniem</Label>
                  <Textarea value={profile.customer_problems} onChange={e => updateField('customer_problems', e.target.value)} onBlur={handleFieldBlur} rows={2} />
                </div>
                <div className="space-y-1">
                  <Label>Transformacja: jak zmienia się życie klienta po</Label>
                  <Textarea value={profile.customer_transformation} onChange={e => updateField('customer_transformation', e.target.value)} onBlur={handleFieldBlur} rows={2} />
                </div>
                <div className="space-y-1">
                  <Label>Kto NIE jest Twoim klientem</Label>
                  <Textarea value={profile.wrong_customer} onChange={e => updateField('wrong_customer', e.target.value)} onBlur={handleFieldBlur} rows={2} />
                </div>
              </div>

              {/* BLOK E: Obiekcje */}
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

              {/* BLOK F: Styl */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm border-b pb-1">🎨 Styl komunikacji</h4>
                <div className="space-y-2">
                  <Label>Ton Agenta</Label>
                  <div className="flex gap-2">
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
                <div className="space-y-1">
                  <Label>Preferowane godziny kontaktu</Label>
                  <Input value={profile.contact_hours} onChange={e => updateField('contact_hours', e.target.value)} placeholder="np. Pon–Pt 9–17, Sob 10–14" />
                </div>
                <div className="space-y-2">
                  <Label>Preferowany typ spotkania</Label>
                  <div className="flex gap-3">
                    {['Online', 'Telefon', 'Osobiście'].map(type => (
                      <label key={type} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={profile.meeting_types.includes(type)}
                          onCheckedChange={() => toggleMeetingType(type)}
                        />
                        {type}
                      </label>
                    ))}
                  </div>
                </div>
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

      {/* ════════ SEKCJA 2: Wyniki Agenta ════════ */}
      <Collapsible open={openSections.results} onOpenChange={v => setOpenSections(p => ({ ...p, results: v }))}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Co robi Twój Agent</CardTitle>
                </div>
                {openSections.results ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <MessageSquare className="h-5 w-5 mx-auto mb-1 text-primary" />
                  <div className="text-xl font-bold">0</div>
                  <div className="text-xs text-muted-foreground">Rozmowy</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <Calendar className="h-5 w-5 mx-auto mb-1 text-green-600" />
                  <div className="text-xl font-bold">0</div>
                  <div className="text-xs text-muted-foreground">Umówione spotkania</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <TrendingUp className="h-5 w-5 mx-auto mb-1 text-blue-600" />
                  <div className="text-xl font-bold">0%</div>
                  <div className="text-xs text-muted-foreground">Skuteczność</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold">—</div>
                  <div className="text-xs text-muted-foreground">Ostatnia aktywność</div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium">Co działa najlepiej u Twoich klientów</h4>
                <p className="text-sm text-muted-foreground italic">
                  Agent zacznie zbierać sprawdzone podejścia po pierwszych rozmowach z klientami.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium">Wskazówki dla Ciebie</h4>
                {strength < 80 && (
                  <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      💡 Uzupełnij dane o firmie powyżej żeby Agent był skuteczniejszy
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ════════ SEKCJA 3: Ustawienia Agenta ════════ */}
      <Collapsible open={openSections.settings} onOpenChange={v => setOpenSections(p => ({ ...p, settings: v }))}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚙️</span>
                  <CardTitle className="text-base">Konfiguracja</CardTitle>
                </div>
                {openSections.settings ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Agent aktywny</Label>
                  <p className="text-xs text-muted-foreground">Gdy wyłączony — agent nie kontaktuje nowych leadów</p>
                </div>
                <Switch checked={agentActive} onCheckedChange={setAgentActive} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Automatyczny kontakt z leadami</Label>
                  <p className="text-xs text-muted-foreground">Agent sam wyśle SMS do nowych leadów</p>
                </div>
                <Switch checked={autoContact} onCheckedChange={setAutoContact} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Powiadomienia o umówionych spotkaniach</Label>
                </div>
                <Switch checked={notifyMeeting} onCheckedChange={setNotifyMeeting} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Powiadomienia gdy lead nie odpowiada</Label>
                </div>
                <Switch checked={notifyNoAnswer} onCheckedChange={setNotifyNoAnswer} />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
