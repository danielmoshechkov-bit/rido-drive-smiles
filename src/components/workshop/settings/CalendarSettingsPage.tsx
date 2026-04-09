import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, Calendar, Bell, Globe } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UniversalSubTabBar } from '@/components/UniversalSubTabBar';

interface Props {
  providerId: string | null;
}

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
    sms_reminder_24h: true,
    sms_reminder_2h: true,
    sms_confirmation_on_booking: true,
    default_duration: '60',
    _loaded: false,
  });

  // Sync form with loaded settings
  const loaded = settings?.calendar_settings;
  if (loaded && !reminderForm._loaded) {
    setReminderForm({
      sms_reminder_24h: loaded.sms_reminder_24h ?? true,
      sms_reminder_2h: loaded.sms_reminder_2h ?? true,
      sms_confirmation_on_booking: loaded.sms_confirmation_on_booking ?? true,
      default_duration: loaded.default_duration || '60',
      _loaded: true,
    });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('workshop_settings')
        .upsert({
          provider_id: providerId,
          calendar_settings: {
            sms_reminder_24h: reminderForm.sms_reminder_24h,
            sms_reminder_2h: reminderForm.sms_reminder_2h,
            sms_confirmation_on_booking: reminderForm.sms_confirmation_on_booking,
            default_duration: reminderForm.default_duration,
          },
        }, { onConflict: 'provider_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-settings'] });
      toast.success('Ustawienia kalendarza zapisane');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const tabs = [
    { value: 'przypomnienia', label: 'Przypomnienia SMS', visible: true },
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

            <label className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">Przypomnienie 24h przed wizytą</p>
                <p className="text-xs text-muted-foreground">SMS przypominający dzień przed wizytą</p>
              </div>
              <Switch
                checked={reminderForm.sms_reminder_24h}
                onCheckedChange={v => setReminderForm(f => ({ ...f, sms_reminder_24h: v }))}
              />
            </label>

            <label className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">Przypomnienie 2h przed wizytą</p>
                <p className="text-xs text-muted-foreground">SMS przypominający 2 godziny przed wizytą</p>
              </div>
              <Switch
                checked={reminderForm.sms_reminder_2h}
                onCheckedChange={v => setReminderForm(f => ({ ...f, sms_reminder_2h: v }))}
              />
            </label>

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
