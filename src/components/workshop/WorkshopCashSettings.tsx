import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Wallet, Lock } from 'lucide-react';
import { useWorkshopFinanceSettings, useSaveFinanceSettings } from '@/hooks/useWorkshopFinance';

// PO CO: kasa liczy dopiero od momentu włączenia — żeby dane historyczne (stare
// zlecenia bez płatności) nie zaśmiecały salda i należności. Domyślnie OFF.
export function WorkshopCashSettings({ providerId }: { providerId: string }) {
  const { data: settings } = useWorkshopFinanceSettings(providerId);
  const save = useSaveFinanceSettings();
  const enabled = !!settings?.cash_enabled;
  const autoClose = !!(settings as any)?.auto_close_month;

  const base = () => ({
    provider_id: providerId,
    work_days: settings?.work_days ?? [1, 2, 3, 4, 5],
    work_start: settings?.work_start ?? '08:00',
    work_end: settings?.work_end ?? '16:00',
    cash_enabled: settings?.cash_enabled ?? false,
    cash_started_at: settings?.cash_started_at ?? null,
  });

  // Komunikat o brakującej kolumnie obsługuje sam hook zapisu — tu nie dublujemy toasta.
  const toggleAutoClose = (on: boolean) => {
    save.mutate({ ...base(), auto_close_month: on } as any);
  };

  const toggle = (on: boolean) => {
    save.mutate({
      provider_id: providerId,
      work_days: settings?.work_days ?? [1, 2, 3, 4, 5],
      work_start: settings?.work_start ?? '08:00',
      work_end: settings?.work_end ?? '16:00',
      cash_enabled: on,
      // moment włączenia: świeży start przy każdym ON
      cash_started_at: on ? new Date().toISOString() : settings?.cash_started_at ?? null,
    });
  };

  return (
    <Card>
      <CardContent className="py-4 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Wallet className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <Label className="text-base">Moduł Kasa</Label>
            <p className="text-sm text-muted-foreground">
              {enabled
                ? `Aktywna. Kasa liczy operacje od ${settings?.cash_started_at ? new Date(settings.cash_started_at).toLocaleString('pl-PL') : '—'}.`
                : 'Wyłączona. Zamknięcie zlecenia nie pyta o formę płatności; panel Kasa nieaktywny.'}
            </p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} disabled={save.isPending} />
      </CardContent>

      {enabled && (
        <CardContent className="py-4 border-t flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <Label className="text-base">Automatyczne zamknięcie miesiąca</Label>
              <p className="text-sm text-muted-foreground max-w-xl">
                {autoClose
                  ? 'Włączone. Przy pierwszym wejściu do Kasy w nowym miesiącu system zamknie poprzedni i zapisze raport w archiwum.'
                  : 'Wyłączone. Kasa będzie tylko przypominać o zamknięciu — bez zamknięcia stary miesiąc liczy się dalej razem z nowym.'}
              </p>
            </div>
          </div>
          <Switch checked={autoClose} onCheckedChange={toggleAutoClose} disabled={save.isPending} />
        </CardContent>
      )}
    </Card>
  );
}
