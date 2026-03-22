import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { useCreateAISalesAgent, useUpdateAISalesAgent, useAISalesAgent, useAISalesQuestionnaire, useUpsertQuestionnaire } from '@/hooks/useAISalesAgents';
import { ArrowLeft, ArrowRight, Check, Bot, Building2, Wrench as WrenchIcon, DollarSign, Users, ShieldAlert, Cog } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  agentId: string | null;
  onClose: () => void;
}

const STEPS = [
  { id: 'basics', label: 'Podstawy', icon: Bot },
  { id: 'questionnaire', label: 'Questionnaire', icon: Building2 },
  { id: 'integrations', label: 'Integracje', icon: Cog },
  { id: 'summary', label: 'Podsumowanie', icon: Check },
];

const Q_SECTIONS = [
  { id: 'company', label: 'Twoja firma', icon: Building2 },
  { id: 'service', label: 'Twoja usługa', icon: WrenchIcon },
  { id: 'pricing', label: 'Ceny i oferta', icon: DollarSign },
  { id: 'customer', label: 'Twój klient', icon: Users },
  { id: 'objections', label: 'Obiekcje', icon: ShieldAlert },
  { id: 'style', label: 'Styl i instrukcje', icon: Cog },
];

export function AISalesAgentWizard({ agentId, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [qSection, setQSection] = useState(0);
  const createAgent = useCreateAISalesAgent();
  const updateAgent = useUpdateAISalesAgent();
  const { data: existingAgent } = useAISalesAgent(agentId);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(agentId);
  const { data: existingQ } = useAISalesQuestionnaire(currentAgentId);
  const upsertQ = useUpsertQuestionnaire();

  // Agent basics
  const [agentForm, setAgentForm] = useState({
    name: 'Agent Sprzedażowy',
    contact_channels: ['sms'] as string[],
    first_contact_delay_minutes: 2,
  });

  // Questionnaire
  const [q, setQ] = useState<Record<string, any>>({});

  // Integrations
  const [integrations, setIntegrations] = useState({
    meta_access_token: '',
    meta_ad_account_id: '',
    meta_page_id: '',
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_phone_number: '',
    vapi_api_key: '',
    calendar_provider: '',
    calendar_token: '',
    calendar_id: '',
  });

  useEffect(() => {
    if (existingAgent) {
      setAgentForm({
        name: existingAgent.name || 'Agent Sprzedażowy',
        contact_channels: existingAgent.contact_channels || ['sms'],
        first_contact_delay_minutes: existingAgent.first_contact_delay_minutes || 2,
      });
      setIntegrations({
        meta_access_token: existingAgent.meta_access_token || '',
        meta_ad_account_id: existingAgent.meta_ad_account_id || '',
        meta_page_id: existingAgent.meta_page_id || '',
        twilio_account_sid: existingAgent.twilio_account_sid || '',
        twilio_auth_token: existingAgent.twilio_auth_token || '',
        twilio_phone_number: existingAgent.twilio_phone_number || '',
        vapi_api_key: existingAgent.vapi_api_key || '',
        calendar_provider: existingAgent.calendar_provider || '',
        calendar_token: existingAgent.calendar_token || '',
        calendar_id: existingAgent.calendar_id || '',
      });
      setCurrentAgentId(existingAgent.id);
    }
  }, [existingAgent]);

  useEffect(() => {
    if (existingQ) {
      const qData: Record<string, any> = {};
      Object.keys(existingQ).forEach(k => {
        if (k.startsWith('q_')) qData[k] = (existingQ as any)[k];
      });
      setQ(qData);
    }
  }, [existingQ]);

  const qFields = useMemo(() => countFilledFields(), [q]);
  const totalQFields = 38;
  const completion = Math.round((qFields / totalQFields) * 100);

  function countFilledFields() {
    return Object.values(q).filter(v => v !== null && v !== '' && v !== undefined).length;
  }

  const strengthLabel = completion >= 80 ? 'BARDZO SILNA' : completion >= 60 ? 'SILNA' : completion >= 30 ? 'ŚREDNIA' : 'SŁABA';
  const strengthColor = completion >= 80 ? 'text-green-600' : completion >= 60 ? 'text-blue-600' : completion >= 30 ? 'text-yellow-600' : 'text-red-600';

  const handleSaveBasics = async () => {
    if (currentAgentId) {
      await updateAgent.mutateAsync({ id: currentAgentId, ...agentForm });
    } else {
      const result = await createAgent.mutateAsync(agentForm);
      setCurrentAgentId(result.id);
    }
    setStep(1);
  };

  const handleSaveQuestionnaire = async () => {
    if (!currentAgentId) { toast.error('Utwórz najpierw agenta'); return; }
    await upsertQ.mutateAsync({
      agent_id: currentAgentId,
      ...q,
      completion_percentage: completion,
      is_complete: completion >= 80,
    });
  };

  const handleSaveIntegrations = async () => {
    if (!currentAgentId) { toast.error('Utwórz najpierw agenta'); return; }
    await updateAgent.mutateAsync({ id: currentAgentId, ...integrations });
    setStep(3);
  };

  const handleActivate = async () => {
    if (!currentAgentId) return;
    await updateAgent.mutateAsync({ id: currentAgentId, status: 'active' });
    toast.success('Agent uruchomiony!');
    onClose();
  };

  const updateQ = (key: string, value: any) => setQ(prev => ({ ...prev, [key]: value }));
  const toggleChannel = (ch: string) => {
    setAgentForm(prev => ({
      ...prev,
      contact_channels: prev.contact_channels.includes(ch)
        ? prev.contact_channels.filter(c => c !== ch)
        : [...prev.contact_channels, ch]
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}><ArrowLeft className="h-5 w-5" /></Button>
          <h2 className="text-xl font-bold">{agentId ? 'Edytuj agenta' : 'Nowy AI Agent'}</h2>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <button key={s.id} onClick={() => i <= step ? setStep(i) : null}
              className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Step content */}
      {step === 0 && (
        <Card>
          <CardHeader><CardTitle>Podstawy agenta</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Nazwa agenta</Label><Input value={agentForm.name} onChange={e => setAgentForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Kanały kontaktu</Label>
              <div className="flex gap-4">
                {['sms', 'call', 'whatsapp'].map(ch => (
                  <label key={ch} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={agentForm.contact_channels.includes(ch)} onCheckedChange={() => toggleChannel(ch)} />
                    <span className="capitalize">{ch === 'sms' ? 'SMS' : ch === 'call' ? 'Telefon' : 'WhatsApp'}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Opóźnienie pierwszego kontaktu (min): {agentForm.first_contact_delay_minutes}</Label>
              <input type="range" min={1} max={60} value={agentForm.first_contact_delay_minutes}
                onChange={e => setAgentForm(p => ({ ...p, first_contact_delay_minutes: parseInt(e.target.value) }))}
                className="w-full" />
            </div>
            <Button onClick={handleSaveBasics} disabled={createAgent.isPending || updateAgent.isPending} className="gap-2">
              Dalej <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-4">
            {/* Section tabs */}
            <div className="flex gap-1 flex-wrap">
              {Q_SECTIONS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <button key={s.id} onClick={() => setQSection(i)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                      i === qSection ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}>
                    <Icon className="h-3.5 w-3.5" />{s.label}
                  </button>
                );
              })}
            </div>

            <Card>
              <CardContent className="pt-6 space-y-4">
                {qSection === 0 && (<>
                  <QField label="Pełna nazwa firmy" field="q_company_name" q={q} updateQ={updateQ} />
                  <QField label="Opisz swoją firmę w 3-5 zdaniach" field="q_company_description" q={q} updateQ={updateQ} textarea />
                  <QField label="Od ilu lat działasz na rynku?" field="q_years_in_business" q={q} updateQ={updateQ} select={['1-2 lata', '3-5 lat', '6-10 lat', '10+ lat']} />
                  <QField label="Ile osób pracuje w zespole?" field="q_team_size" q={q} updateQ={updateQ} select={['1 osoba', '2-5', '6-20', '20+']} />
                  <QField label="Lokalizacja" field="q_location" q={q} updateQ={updateQ} />
                  <QField label="Jakie obszary obsługujesz?" field="q_service_area" q={q} updateQ={updateQ} textarea />
                  <QField label="Największe osiągnięcia firmy" field="q_company_achievements" q={q} updateQ={updateQ} textarea />
                  <QField label="Certyfikaty, uprawnienia" field="q_certifications" q={q} updateQ={updateQ} textarea />
                </>)}

                {qSection === 1 && (<>
                  <QField label="Pełna nazwa usługi" field="q_service_name" q={q} updateQ={updateQ} />
                  <QField label="Opisz usługę szczegółowo" field="q_service_description" q={q} updateQ={updateQ} textarea />
                  <QField label="Czas realizacji" field="q_service_duration" q={q} updateQ={updateQ} />
                  <QField label="Opisz krok po kroku proces realizacji" field="q_service_process" q={q} updateQ={updateQ} textarea />
                  <QField label="Co wyróżnia Twoją usługę?" field="q_service_unique_value" q={q} updateQ={updateQ} textarea />
                  <QField label="Jakich wyników może oczekiwać klient?" field="q_service_results" q={q} updateQ={updateQ} textarea />
                  <QField label="Czy oferujesz gwarancję? Jaką?" field="q_service_guarantee" q={q} updateQ={updateQ} textarea />
                  <QField label="Podaj 2-3 case studies" field="q_service_case_studies" q={q} updateQ={updateQ} textarea />
                </>)}

                {qSection === 2 && (<>
                  <div className="grid grid-cols-2 gap-4">
                    <QField label="Cena minimalna (zł)" field="q_price_from" q={q} updateQ={updateQ} type="number" />
                    <QField label="Cena maksymalna (zł)" field="q_price_to" q={q} updateQ={updateQ} type="number" />
                  </div>
                  <QField label="Model cenowy" field="q_price_model" q={q} updateQ={updateQ} select={['Cena stała', 'Stawka godzinowa', 'Abonament', 'Wycena indywidualna']} />
                  <QField label="Formy płatności" field="q_payment_methods" q={q} updateQ={updateQ} />
                  <QField label="Warunki płatności (zaliczka, raty?)" field="q_payment_terms" q={q} updateQ={updateQ} textarea />
                  <QField label="Dlaczego Twoja cena jest adekwatna?" field="q_price_justification" q={q} updateQ={updateQ} textarea />
                  <QField label="Aktualne promocje/pakiety" field="q_promotions" q={q} updateQ={updateQ} textarea />
                </>)}

                {qSection === 3 && (<>
                  <QField label="Opisz idealnego klienta" field="q_target_customer_profile" q={q} updateQ={updateQ} textarea />
                  <QField label="Problemy klienta przed skorzystaniem" field="q_customer_problems" q={q} updateQ={updateQ} textarea />
                  <QField label="Jak zmienia się sytuacja klienta po?" field="q_customer_transformation" q={q} updateQ={updateQ} textarea />
                  <QField label="Czego klient się obawia?" field="q_customer_fears" q={q} updateQ={updateQ} textarea />
                  <QField label="Kto NIE jest Twoim klientem?" field="q_wrong_customer" q={q} updateQ={updateQ} textarea />
                </>)}

                {qSection === 4 && (<>
                  <ObjectionField label='"Za drogo / nie mam budżetu"' field="q_objection_price" q={q} updateQ={updateQ} />
                  <ObjectionField label='"Muszę się zastanowić / oddzwonię"' field="q_objection_think" q={q} updateQ={updateQ} />
                  <ObjectionField label='"Nie mam teraz czasu"' field="q_objection_time" q={q} updateQ={updateQ} />
                  <ObjectionField label='"Znalazłem taniej u konkurencji"' field="q_objection_competitor" q={q} updateQ={updateQ} />
                  <ObjectionField label='"Skąd wiem że jesteś dobry?"' field="q_objection_trust" q={q} updateQ={updateQ} />
                  <ObjectionField label='"Zrobię to sam"' field="q_objection_diy" q={q} updateQ={updateQ} />
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium mb-2">➕ Własne obiekcje</p>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="Obiekcja 1" value={q.q_objection_custom_1 || ''} onChange={e => updateQ('q_objection_custom_1', e.target.value)} />
                        <Input placeholder="Odpowiedź" value={q.q_objection_custom_1_answer || ''} onChange={e => updateQ('q_objection_custom_1_answer', e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="Obiekcja 2" value={q.q_objection_custom_2 || ''} onChange={e => updateQ('q_objection_custom_2', e.target.value)} />
                        <Input placeholder="Odpowiedź" value={q.q_objection_custom_2_answer || ''} onChange={e => updateQ('q_objection_custom_2_answer', e.target.value)} />
                      </div>
                    </div>
                  </div>
                </>)}

                {qSection === 5 && (<>
                  <div className="space-y-2">
                    <Label>Ton komunikacji</Label>
                    <div className="flex gap-3">
                      {[
                        { value: 'formal', label: '🎩 Formalny (Pan/Pani)' },
                        { value: 'semiformal', label: '👔 Półformalny' },
                        { value: 'casual', label: '😊 Nieformalny (ty)' },
                      ].map(opt => (
                        <label key={opt.value} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${q.q_sales_tone === opt.value ? 'border-primary bg-primary/5' : 'border-muted'}`}>
                          <input type="radio" name="tone" value={opt.value} checked={q.q_sales_tone === opt.value}
                            onChange={() => updateQ('q_sales_tone', opt.value)} className="sr-only" />
                          <span className="text-sm">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <QField label="Kiedy klienci najchętniej rozmawiają?" field="q_preferred_contact_time" q={q} updateQ={updateQ} />
                  <QField label="Preferowane typy spotkań" field="q_meeting_types" q={q} updateQ={updateQ} />
                  <QField label="Jak długo trwa decyzja zakupowa?" field="q_typical_sales_cycle" q={q} updateQ={updateQ} select={['1 dzień', '2-3 dni', 'Tydzień', '2-4 tygodnie', '1-3 miesiące']} />
                  <QField label="Jak zazwyczaj zamykasz sprzedaż?" field="q_closing_technique" q={q} updateQ={updateQ} textarea />
                  <div className="space-y-2">
                    <Label className="text-red-600">⚠️ Czego agent NIGDY nie powinien mówić</Label>
                    <Textarea
                      className="border-red-200 bg-red-50/50 dark:bg-red-950/20"
                      rows={3}
                      value={q.q_special_instructions || ''}
                      onChange={e => updateQ('q_special_instructions', e.target.value)}
                      placeholder="Np. nigdy nie obiecuj darmowej usługi..."
                    />
                  </div>
                </>)}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => qSection > 0 ? setQSection(qSection - 1) : setStep(0)}>
                <ArrowLeft className="h-4 w-4 mr-2" />Wstecz
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleSaveQuestionnaire} disabled={upsertQ.isPending}>
                  Zapisz sekcję
                </Button>
                {qSection < Q_SECTIONS.length - 1 ? (
                  <Button onClick={() => { handleSaveQuestionnaire(); setQSection(qSection + 1); }}>
                    Dalej <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <Button onClick={() => { handleSaveQuestionnaire(); setStep(2); }}>
                    Do integracji <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Strength sidebar */}
          <div className="space-y-4">
            <Card className="sticky top-24">
              <CardContent className="pt-6 space-y-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Siła sprzedażowa</p>
                  <p className={`text-lg font-bold ${strengthColor}`}>{strengthLabel}</p>
                </div>
                <Progress value={completion} className="h-3" />
                <p className="text-xs text-center text-muted-foreground">{completion}% wypełnione</p>
                <p className="text-xs text-muted-foreground">Im więcej szczegółów podasz, tym skuteczniejszy będzie agent.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Integracje</CardTitle><CardDescription>Podłącz kanały komunikacji</CardDescription></CardHeader>
          <CardContent className="space-y-6">
            {/* Meta Ads */}
            <details className="border rounded-lg p-4">
              <summary className="font-medium cursor-pointer">📘 Meta Ads (Facebook / Instagram)</summary>
              <div className="mt-4 space-y-3">
                <div className="space-y-1"><Label>Meta Access Token</Label><Input type="password" placeholder="EAA..." value={integrations.meta_access_token} onChange={e => setIntegrations(p => ({ ...p, meta_access_token: e.target.value }))} /><p className="text-xs text-muted-foreground">Token do pobierania leadów z formularzy Meta</p></div>
                <div className="space-y-1"><Label>Ad Account ID</Label><Input placeholder="act_..." value={integrations.meta_ad_account_id} onChange={e => setIntegrations(p => ({ ...p, meta_ad_account_id: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Page ID</Label><Input value={integrations.meta_page_id} onChange={e => setIntegrations(p => ({ ...p, meta_page_id: e.target.value }))} /></div>
              </div>
            </details>

            {/* Twilio */}
            <details className="border rounded-lg p-4">
              <summary className="font-medium cursor-pointer">📱 SMS — Twilio</summary>
              <div className="mt-4 space-y-3">
                <div className="space-y-1"><Label>Account SID</Label><Input value={integrations.twilio_account_sid} onChange={e => setIntegrations(p => ({ ...p, twilio_account_sid: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Auth Token</Label><Input type="password" value={integrations.twilio_auth_token} onChange={e => setIntegrations(p => ({ ...p, twilio_auth_token: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Numer telefonu Twilio</Label><Input placeholder="+48..." value={integrations.twilio_phone_number} onChange={e => setIntegrations(p => ({ ...p, twilio_phone_number: e.target.value }))} /></div>
                <a href="https://www.twilio.com/try-twilio" target="_blank" className="text-xs text-primary hover:underline">Utwórz konto Twilio →</a>
              </div>
            </details>

            {/* VAPI */}
            <details className="border rounded-lg p-4">
              <summary className="font-medium cursor-pointer">📞 Rozmowy głosowe — VAPI <span className="text-xs text-muted-foreground ml-2">(opcjonalne)</span></summary>
              <div className="mt-4 space-y-3">
                <div className="space-y-1"><Label>VAPI API Key</Label><Input type="password" value={integrations.vapi_api_key} onChange={e => setIntegrations(p => ({ ...p, vapi_api_key: e.target.value }))} /></div>
                <a href="https://vapi.ai" target="_blank" className="text-xs text-primary hover:underline">Utwórz konto VAPI →</a>
              </div>
            </details>

            {/* Calendar */}
            <details className="border rounded-lg p-4">
              <summary className="font-medium cursor-pointer">📅 Kalendarz</summary>
              <div className="mt-4 space-y-3">
                <div className="space-y-1">
                  <Label>Provider</Label>
                  <Select value={integrations.calendar_provider || ''} onValueChange={v => setIntegrations(p => ({ ...p, calendar_provider: v }))}>
                    <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google">Google Calendar</SelectItem>
                      <SelectItem value="calendly">Calendly</SelectItem>
                      <SelectItem value="custom">Brak (manual)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Token / API Key</Label><Input type="password" value={integrations.calendar_token} onChange={e => setIntegrations(p => ({ ...p, calendar_token: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Calendar ID</Label><Input value={integrations.calendar_id} onChange={e => setIntegrations(p => ({ ...p, calendar_id: e.target.value }))} /></div>
              </div>
            </details>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-2" />Wstecz</Button>
              <Button onClick={handleSaveIntegrations} disabled={updateAgent.isPending}>Dalej <ArrowRight className="h-4 w-4 ml-2" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader><CardTitle>Podsumowanie</CardTitle><CardDescription>Sprawdź konfigurację przed uruchomieniem</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <SummaryItem label="Nazwa agenta" value={agentForm.name} ok />
              <SummaryItem label="Kanały" value={agentForm.contact_channels.join(', ')} ok />
              <SummaryItem label="Questionnaire" value={`${completion}% wypełnione`} ok={completion >= 50} />
              <SummaryItem label="Meta Ads" value={integrations.meta_access_token ? 'Skonfigurowane' : 'Brak'} ok={!!integrations.meta_access_token} />
              <SummaryItem label="Twilio SMS" value={integrations.twilio_phone_number || 'Brak'} ok={!!integrations.twilio_phone_number} />
              <SummaryItem label="Kalendarz" value={integrations.calendar_provider || 'Brak'} ok={!!integrations.calendar_provider} />
            </div>

            {completion < 50 && (
              <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">⚠️ Questionnaire jest wypełniony w mniej niż 50%. Agent może nie być skuteczny. Zalecamy uzupełnienie danych.</p>
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-2" />Wstecz</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Zapisz jako szkic</Button>
                <Button onClick={handleActivate} className="bg-green-600 hover:bg-green-700 text-white gap-2">
                  <Bot className="h-4 w-4" />Uruchom Agenta
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QField({ label, field, q, updateQ, textarea, select, type = 'text' }: {
  label: string; field: string; q: Record<string, any>; updateQ: (k: string, v: any) => void;
  textarea?: boolean; select?: string[]; type?: string;
}) {
  if (select) {
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <Select value={q[field] || ''} onValueChange={v => updateQ(field, v)}>
          <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
          <SelectContent>{select.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    );
  }
  if (textarea) {
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <Textarea rows={3} value={q[field] || ''} onChange={e => updateQ(field, e.target.value)} />
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type={type} value={q[field] || ''} onChange={e => updateQ(field, type === 'number' ? parseFloat(e.target.value) || '' : e.target.value)} />
    </div>
  );
}

function ObjectionField({ label, field, q, updateQ }: {
  label: string; field: string; q: Record<string, any>; updateQ: (k: string, v: any) => void;
}) {
  return (
    <div className="border-l-4 border-red-400 pl-4 py-2 space-y-1">
      <p className="text-sm font-medium">🔴 Obiekcja: <strong>{label}</strong></p>
      <Textarea rows={2} value={q[field] || ''} onChange={e => updateQ(field, e.target.value)}
        placeholder="Jak odpowiadasz na tę obiekcję? Napisz najskuteczniejszą odpowiedź..." />
    </div>
  );
}

function SummaryItem({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
      <div><p className="text-sm font-medium">{label}</p><p className="text-sm text-muted-foreground">{value}</p></div>
      <span className={`text-lg ${ok ? 'text-green-500' : 'text-red-500'}`}>{ok ? '✅' : '❌'}</span>
    </div>
  );
}
