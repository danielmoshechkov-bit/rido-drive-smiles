import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Save, Calendar, Bell, Globe, MessageSquare } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UniversalSubTabBar } from '@/components/UniversalSubTabBar';

interface Props {
  providerId: string | null;
}

const DEFAULT_SMS_TEMPLATES = {
  reception: 'Zlecenie serwisowe {POJAZD} zostalo przyjete. Szczegoly: {LINK}',
  estimate: 'Kosztorys dla {POJAZD} jest gotowy do akceptacji: {LINK}',
  ready: 'Twoj pojazd {POJAZD} jest gotowy do odbioru. Zapraszamy!',
  reminder_24h: 'Przypomnienie: jutro o {GODZINA} masz wizyte w serwisie. {POJAZD}',
  reminder_2h: 'Przypomnienie: za 2h wizyta w serwisie. {POJAZD}',
  completed: 'Naprawa {POJAZD} zostala zakonczona. Zapraszamy po odbior!',
};

const REMINDER_OPTIONS = [
  { value: '24h', label: '24 godziny przed' },
  { value: '12h', label: '12 godzin przed' },
  { value: '6h', label: '6 godzin przed' },
  { value: '4h', label: '4 godziny przed' },
  { value: '2h', label: '2 godziny przed' },
  { value: '1h', label: '1 godzina przed' },
];

const SMS_TEMPLATE_LABELS: Record<string, string> = {
  reception: 'Przyjęcie pojazdu',
  estimate: 'Wysłanie kosztorysu',
  ready: 'Pojazd gotowy do odbioru',
  reminder_24h: 'Przypomnienie 24h',
  reminder_2h: 'Przypomnienie 2h',
  completed: 'Zakończenie naprawy',
};

export function CalendarSettingsPage({ providerId }: Props) {
  const [activeTab, setActiveTab] = useState('przypomnienia');
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['workshop-settings', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('workshop_settings')
        .select('*')
        .eq('provider_id', providerId)
        .maybeSingle();
      return data;
    },
  });

  const [reminderForm, setReminderForm] = useState({
    sms_confirmation_on_booking: true,
    default_reminders: ['24h', '2h'] as string[],
    default_duration: '60',
    _loaded: false,
  });

  const [smsTemplates, setSmsTemplates] = useState<Record<string, string>>({ ...DEFAULT_SMS_TEMPLATES });
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  // Sync form with loaded settings
  const loaded = settings?.calendar_settings;
  if (loaded && !reminderForm._loaded) {
    setReminderForm({
      sms_confirmation_on_booking: loaded.sms_confirmation_on_booking ?? true,
      default_reminders: loaded.default_reminders || ['24h', '2h'],
      default_duration: loaded.default_duration || '60',
      _loaded: true,
    });
  }

  if (loaded?.sms_templates && !templatesLoaded) {
    setSmsTemplates({ ...DEFAULT_SMS_TEMPLATES, ...loaded.sms_templates });
    setTemplatesLoaded(true);
  }

  const toggleReminder = (val: string) => {
    setReminderForm(f => ({
      ...f,
      default_reminders: f.default_reminders.includes(val)
        ? f.default_reminders.filter(v => v !== val)
        : [...f.default_reminders, val],
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('workshop_settings')
        .upsert({
          provider_id: providerId,
          calendar_settings: {
            sms_confirmation_on_booking: reminderForm.sms_confirmation_on_booking,
            default_reminders: reminderForm.default_reminders,
            default_duration: reminderForm.default_duration,
            sms_templates: smsTemplates,
          },
        }, { onConflict: 'provider_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-settings'] });
      toast.success('Ustawienia zapisane');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const tabs = [
    { value: 'przypomnienia', label: 'Przypomnienia SMS', visible: true },
    { value: 'szablony', label: 'Szablony SMS', visible: true },
    { value: 'rezerwacje', label: 'Rezerwacje', visible: true },
    { value: 'integracje', label: 'Integracje', visible: true },
  ];

  return (
    <div className="space-y-4">
      <UniversalSubTabBar activeTab={activeTab} onTabChange={setActiveTab} tabs={tabs} />

      {activeTab === 'przypomnienia' && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Ustawienia przypomnień SMS</h3>
            </div>

            <label className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">Wyślij SMS potwierdzający przy rezerwacji</p>
                <p className="text-xs text-muted-foreground">Klient otrzyma SMS z potwierdzeniem wizyty</p>
              </div>
              <Switch
                checked={reminderForm.sms_confirmation_on_booking}
                onCheckedChange={v => setReminderForm(f => ({ ...f, sms_confirmation_on_booking: v }))}
              />
            </label>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Domyślne przypomnienia</Label>
              <p className="text-xs text-muted-foreground">Wybierz kiedy mają być wysyłane przypomnienia SMS. Możesz wybrać kilka.</p>
              <div className="grid grid-cols-2 gap-2">
                {REMINDER_OPTIONS.map(opt => (
                  <label key={opt.value} className={`flex items-center gap-2 cursor-pointer p-3 rounded-lg border transition-colors ${
                    reminderForm.default_reminders.includes(opt.value)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/40'
                  }`}>
                    <input
                      type="checkbox"
                      checked={reminderForm.default_reminders.includes(opt.value)}
                      onChange={() => toggleReminder(opt.value)}
                      className="rounded"
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1 max-w-[200px]">
              <Label className="text-xs">Domyślny czas usługi</Label>
              <Select value={reminderForm.default_duration} onValueChange={v => setReminderForm(f => ({ ...f, default_duration: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">1 godz.</SelectItem>
                  <SelectItem value="120">2 godz.</SelectItem>
                  <SelectItem value="180">3 godz.</SelectItem>
                  <SelectItem value="240">4 godz.</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
                <Save className="h-4 w-4" /> Zapisz ustawienia
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'szablony' && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Szablony wiadomości SMS</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Dostępne zmienne: {'{POJAZD}'}, {'{LINK}'}, {'{GODZINA}'}, {'{DATA}'}, {'{NUMER_ZLECENIA}'}
            </p>

            <div className="space-y-4">
              {Object.entries(SMS_TEMPLATE_LABELS).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label className="text-sm font-medium">{label}</Label>
                  <Textarea
                    value={smsTemplates[key] || ''}
                    onChange={e => setSmsTemplates(t => ({ ...t, [key]: e.target.value }))}
                    rows={2}
                    className="text-sm"
                    placeholder={DEFAULT_SMS_TEMPLATES[key as keyof typeof DEFAULT_SMS_TEMPLATES]}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {(smsTemplates[key] || '').length}/160 znaków (GSM-7)
                  </p>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
                <Save className="h-4 w-4" /> Zapisz szablony
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'rezerwacje' && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Ustawienia rezerwacji online</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Rezerwacje online pozwolą klientom umawiać się na wizytę przez stronę internetową Twojego warsztatu.
            </p>
            <div className="p-4 border rounded-lg bg-muted/30 text-sm text-muted-foreground text-center">
              🚧 Wkrótce dostępne — system rezerwacji online jest w przygotowaniu
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'integracje' && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Integracja z Google Calendar</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Połącz kalendarz warsztatu z Google Calendar, aby synchronizować wizyty i rezerwacje.
            </p>
            <div className="p-4 border rounded-lg bg-muted/30 text-sm text-muted-foreground text-center">
              🚧 Wkrótce dostępne — integracja z Google Calendar jest w przygotowaniu
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
