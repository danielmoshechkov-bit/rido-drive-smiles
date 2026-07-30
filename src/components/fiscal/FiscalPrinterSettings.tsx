/**
 * Ustawienia drukarki fiskalnej per tenant + status urządzenia + log paragonów.
 *
 * Konfigurację zapisuje wyłącznie właściciel firmy (RLS: fiscal_printers_update/insert
 * wymagają is_fiscal_provider_owner) — pracownik zobaczy formularz w trybie odczytu.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plug, Printer, Save, FileBarChart, TriangleAlert, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useFiscalPrinter,
  useSaveFiscalPrinter,
  useTestFiscalPrinter,
  useFiscalDayReport,
  FiscalError,
  type FiscalPrinter,
} from '@/hooks/useFiscal';
import { CODEPAGE_LABELS } from '@/lib/fiscal';
import { FiscalReceiptsLog } from './FiscalReceiptsLog';

interface Props {
  providerId?: string;
}

const VAT_KEYS: Array<{ key: string; label: string }> = [
  { key: '23', label: '23%' },
  { key: '8', label: '8%' },
  { key: '5', label: '5%' },
  { key: '0', label: '0%' },
  { key: 'zw', label: 'zw.' },
];

const VAT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const emptyPrinter: Partial<FiscalPrinter> = {
  name: 'Drukarka fiskalna',
  model: 'ELZAB Zeta Online',
  host: '',
  port: 9100,
  mode: 'training',
  codepage: 'cp1250',
  connection_mode: 'direct',
  vat_map: { '23': 'A', '8': 'B', '5': 'C', '0': 'D', zw: 'E' },
  is_active: true,
  is_default: true,
};

/** Ile godzin minęło od ostatniego raportu dobowego (drukarka blokuje sprzedaż po 48 h). */
function hoursSince(iso?: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
}

export function FiscalPrinterSettings({ providerId }: Props) {
  const { data: printer, isLoading } = useFiscalPrinter(providerId);
  const savePrinter = useSaveFiscalPrinter(providerId);
  const testPrinter = useTestFiscalPrinter(providerId);
  const dayReport = useFiscalDayReport(providerId);

  const [form, setForm] = useState<Partial<FiscalPrinter>>(emptyPrinter);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; code?: string } | null>(null);

  useEffect(() => {
    if (printer) setForm(printer);
  }, [printer]);

  const set = (patch: Partial<FiscalPrinter>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    if (!form.host?.trim()) {
      toast.error('Podaj adres IP drukarki.');
      return;
    }
    try {
      await savePrinter.mutateAsync(form);
      toast.success('Zapisano konfigurację drukarki.');
    } catch (error: any) {
      toast.error(error?.message || 'Nie udało się zapisać konfiguracji.');
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    try {
      const result = await testPrinter.mutateAsync(printer?.id);
      setTestResult({ ok: true, message: `${result.message} Zegar drukarki: ${result.clock}.` });
      toast.success('Drukarka odpowiada.');
    } catch (error) {
      const fiscalError = error as FiscalError;
      setTestResult({ ok: false, message: fiscalError.message, code: fiscalError.code });
      toast.error('Brak połączenia z drukarką.');
    }
  };

  const handleDayReport = async () => {
    if (!confirm('Wykonać raport dobowy? Drukarka wydrukuje raport i zamknie dobę sprzedaży.')) return;
    try {
      const result = await dayReport.mutateAsync(printer?.id);
      toast.success(result.message);
    } catch (error) {
      toast.error((error as FiscalError).message);
    }
  };

  const sinceReport = hoursSince(printer?.last_day_report_at);
  const reportWarning = sinceReport !== null && sinceReport >= 36;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie konfiguracji…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" /> Drukarka fiskalna
              </CardTitle>
              <CardDescription>
                Konfiguracja urządzenia, na którym drukowane są paragony tej firmy.
              </CardDescription>
            </div>
            {printer && (
              <div className="text-right space-y-1">
                <Badge variant={printer.last_status === 'online' ? 'default' : printer.last_status === 'error' ? 'destructive' : 'secondary'}>
                  {printer.last_status === 'online' ? 'Online' : printer.last_status === 'error' ? 'Błąd' : 'Offline'}
                </Badge>
                {printer.last_seen_at && (
                  <div className="text-[11px] text-muted-foreground">
                    ostatni kontakt: {new Date(printer.last_seen_at).toLocaleString('pl-PL')}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {form.mode === 'training' && (
            <Alert>
              <TriangleAlert className="h-4 w-4" />
              <AlertDescription>
                Tryb <b>szkoleniowy</b>: paragony są niefiskalne (do testów). Przełącz na fiskalny dopiero po
                fiskalizacji urządzenia przez serwis.
              </AlertDescription>
            </Alert>
          )}

          {reportWarning && (
            <Alert variant={sinceReport! >= 48 ? 'destructive' : 'default'}>
              <TriangleAlert className="h-4 w-4" />
              <AlertDescription>
                Od ostatniego raportu dobowego minęło {sinceReport} h.{' '}
                {sinceReport! >= 48
                  ? 'Drukarka mogła zablokować sprzedaż — wykonaj raport dobowy.'
                  : 'Po 48 h drukarka blokuje sprzedaż.'}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nazwa urządzenia</Label>
              <Input value={form.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="Drukarka fiskalna" />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input value={form.model ?? ''} onChange={(e) => set({ model: e.target.value })} placeholder="ELZAB Zeta Online" />
            </div>
            <div className="space-y-2">
              <Label>Adres IP</Label>
              <Input value={form.host ?? ''} onChange={(e) => set({ host: e.target.value })} placeholder="192.168.0.114" />
            </div>
            <div className="space-y-2">
              <Label>Port</Label>
              <Input
                type="number"
                value={form.port ?? 9100}
                onChange={(e) => set({ port: Number(e.target.value) || 9100 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Strona kodowa</Label>
              <Select value={form.codepage ?? 'cp1250'} onValueChange={(value) => set({ codepage: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CODEPAGE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Musi być taka sama jak ustawienie w menu drukarki — inaczej polskie znaki znikną z wydruku.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Tryb pracy</Label>
              <Select value={form.mode ?? 'training'} onValueChange={(value) => set({ mode: value as 'training' | 'fiscal' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="training">Szkoleniowy (niefiskalny)</SelectItem>
                  <SelectItem value="fiscal">Fiskalny</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Stawki VAT — litery zaprogramowane w drukarce</Label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {VAT_KEYS.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <Select
                    value={(form.vat_map as Record<string, string>)?.[key] ?? ''}
                    onValueChange={(value) =>
                      set({ vat_map: { ...(form.vat_map as Record<string, string>), [key]: value } })
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {VAT_LETTERS.map((letter) => (
                        <SelectItem key={letter} value={letter}>{letter}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Przypisanie liter jest ustalane przy fiskalizacji urządzenia — różne drukarki mogą mieć różne.
            </p>
          </div>

          {testResult && (
            <Alert variant={testResult.ok ? 'default' : 'destructive'}>
              {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
              <AlertDescription>
                {testResult.message}
                {testResult.code && <Badge variant="outline" className="ml-2 text-[10px]">{testResult.code}</Badge>}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={savePrinter.isPending} className="gap-2">
              {savePrinter.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Zapisz
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={testPrinter.isPending || !printer} className="gap-2">
              {testPrinter.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              Testuj połączenie
            </Button>
            <Button variant="outline" onClick={handleDayReport} disabled={dayReport.isPending || !printer} className="gap-2">
              {dayReport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
              Raport dobowy
            </Button>
          </div>

          {!printer && (
            <p className="text-xs text-muted-foreground">
              Zapisz konfigurację, żeby odblokować test połączenia i raport dobowy.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log paragonów</CardTitle>
          <CardDescription>Wszystkie próby fiskalizacji — również nieudane, z powodem błędu.</CardDescription>
        </CardHeader>
        <CardContent>
          <FiscalReceiptsLog providerId={providerId} />
        </CardContent>
      </Card>
    </div>
  );
}
