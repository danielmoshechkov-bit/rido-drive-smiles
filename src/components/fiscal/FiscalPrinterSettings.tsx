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
import {
  Loader2,
  Plug,
  Printer,
  Save,
  FileBarChart,
  TriangleAlert,
  CheckCircle2,
  Laptop,
  Radar,
  Circle,
  CreditCard,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useFiscalPrinter,
  useSaveFiscalPrinter,
  useTestFiscalPrinter,
  useFiscalDayReport,
  useScanForPrinters,
  FiscalError,
  type FiscalPrinter,
} from '@/hooks/useFiscal';
import type { FoundPrinter } from '@/lib/fiscalBridge';
import { getAutoReportConfig, setAutoReportConfig, type AutoReportConfig } from '@/lib/fiscalAuto';
import {
  getTerminalConfig,
  setTerminalConfig,
  TERMINAL_PROVIDERS,
  type TerminalConfig,
  type TerminalProviderId,
} from '@/lib/fiscalTerminal';
import { CODEPAGE_LABELS } from '@/lib/fiscal';
import {
  DEFAULT_BRIDGE_URL,
  bridgeHealth,
  getBridgeConfig,
  setBridgeConfig,
  type BridgeConfig,
} from '@/lib/fiscalBridge';
import { Switch } from '@/components/ui/switch';
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
  item_name_length: 40,
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
  const scanPrinters = useScanForPrinters(providerId);

  const [form, setForm] = useState<Partial<FiscalPrinter>>(emptyPrinter);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; code?: string } | null>(null);
  const [bridge, setBridge] = useState<BridgeConfig>({ enabled: false, url: DEFAULT_BRIDGE_URL });
  const [bridgeStatus, setBridgeStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [found, setFound] = useState<FoundPrinter[] | null>(null);
  const [terminal, setTerminal] = useState<TerminalConfig>({ enabled: false, provider: 'manual' });
  const [autoReport, setAutoReport] = useState<AutoReportConfig>({ enabled: false, hour: 21 });

  useEffect(() => {
    if (printer) setForm(printer);
  }, [printer]);

  useEffect(() => {
    setBridge(getBridgeConfig(providerId));
    setTerminal(getTerminalConfig(providerId));
    setAutoReport(getAutoReportConfig(providerId));
  }, [providerId]);

  const saveAutoReport = (patch: Partial<AutoReportConfig>) => {
    const next = { ...autoReport, ...patch };
    setAutoReport(next);
    setAutoReportConfig(next, providerId);
  };

  const saveTerminal = (patch: Partial<TerminalConfig>) => {
    const next = { ...terminal, ...patch };
    setTerminal(next);
    setTerminalConfig(next, providerId);
  };

  const saveBridge = (patch: Partial<BridgeConfig>) => {
    const next = { ...bridge, ...patch };
    setBridge(next);
    setBridgeConfig(next, providerId);
  };

  const handleBridgeCheck = async () => {
    setBridgeStatus(null);
    try {
      const health = await bridgeHealth(bridge);
      setBridgeStatus({ ok: true, message: `Mostek działa (wersja ${health.version ?? '?'}).` });
    } catch {
      setBridgeStatus({
        ok: false,
        message: `Mostek nie odpowiada pod ${bridge.url}. Uruchom go poleceniem „npm run fiscal:bridge" na tym komputerze.`,
      });
    }
  };

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
      const result = await testPrinter.mutateAsync(printer ?? undefined);
      setTestResult({ ok: true, message: `${result.message} Zegar drukarki: ${result.clock}.` });
      toast.success('Drukarka odpowiada.');
    } catch (error) {
      const fiscalError = error as FiscalError;
      setTestResult({ ok: false, message: fiscalError.message, code: fiscalError.code });
      toast.error('Brak połączenia z drukarką.');
    }
  };

  const handleScan = async () => {
    setFound(null);
    try {
      const result = await scanPrinters.mutateAsync({ knownHost: form.host || undefined, port: form.port ?? 9100 });
      setFound(result.devices);
      if (!result.devices.length) {
        toast.error('Nie znaleziono drukarki fiskalnej w sieci tego komputera.');
      } else if (result.devices.length === 1) {
        toast.success(`Znaleziono drukarkę pod adresem ${result.devices[0].host}.`);
      } else {
        toast.success(`Znaleziono ${result.devices.length} drukarki — wybierz właściwą.`);
      }
    } catch (error) {
      toast.error((error as FiscalError).message);
    }
  };

  /** Podstawienie znalezionego adresu — zapis zostawiamy użytkownikowi (przycisk Zapisz). */
  const applyFound = (device: FoundPrinter) => {
    set({ host: device.host, port: device.port });
    toast.success(`Ustawiono adres ${device.host}. Kliknij „Zapisz", żeby zapamiętać.`);
  };

  const handleDayReport = async () => {
    if (!confirm('Wykonać raport dobowy? Drukarka wydrukuje raport i zamknie dobę sprzedaży.')) return;
    try {
      const result = await dayReport.mutateAsync(printer ?? undefined);
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

          {!printer && (
            <Alert>
              <Printer className="h-4 w-4" />
              <AlertDescription className="space-y-1">
                <div className="font-medium">Pierwsze uruchomienie — trzy kroki</div>
                <ol className="list-decimal pl-5 text-xs space-y-0.5">
                  <li>włącz <b>mostek lokalny</b> niżej i uruchom go na komputerze przy drukarce</li>
                  <li>kliknij <b>Szukaj</b> — adres drukarki podstawi się sam</li>
                  <li>przepisz litery stawek VAT z drukarki i kliknij <b>Zapisz</b></li>
                </ol>
              </AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <Radar className="h-4 w-4" /> Znajdź drukarkę w sieci
                </div>
                <p className="text-xs text-muted-foreground max-w-xl">
                  Mostek przeszukuje sieć tego komputera i sprawdza, które urządzenie naprawdę odpowiada
                  protokołem drukarki fiskalnej. Nie musisz znać adresu IP.
                  {' '}Gdy drukarka przestanie odpowiadać w trakcie pracy (typowo po zmianie adresu z DHCP),
                  system szuka jej sam i — jeśli w sieci jest dokładnie jedna — poprawia adres bez pytania.
                </p>
              </div>
              <Button onClick={handleScan} disabled={scanPrinters.isPending} className="gap-2">
                {scanPrinters.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
                {scanPrinters.isPending ? 'Szukam…' : 'Szukaj'}
              </Button>
            </div>

            {found && found.length > 0 && (
              <div className="space-y-2">
                {found.map((device) => (
                  <div
                    key={device.host}
                    className="flex items-center justify-between gap-3 rounded-md border bg-background p-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {device.host}:{device.port}
                        {device.host === form.host && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">obecnie ustawiona</Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        zegar drukarki: {device.clock}
                        {device.lastReceiptNumber !== null && ` · ostatni paragon nr ${device.lastReceiptNumber}`}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => applyFound(device)} disabled={device.host === form.host}>
                      Użyj tej
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {found && found.length === 0 && (
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription className="space-y-1">
                  <div>Nie znaleziono drukarki. Sprawdź po kolei:</div>
                  <ul className="list-disc pl-5 text-xs space-y-0.5">
                    <li>drukarka jest włączona i wpięta do tej samej sieci co ten komputer (kabel lub Wi-Fi)</li>
                    <li>w menu drukarki włączony jest interfejs sieciowy i port <b>9100</b></li>
                    <li>komputer nie jest w sieci gościnnej — te sieci izolują urządzenia od siebie</li>
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-md border bg-background p-3">
              <div className="text-xs font-medium mb-1.5">Co musi być ustawione w samej drukarce</div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li className="flex gap-2"><Circle className="h-2 w-2 mt-1.5 shrink-0 fill-current" /> interfejs sieciowy (Ethernet/Wi-Fi) włączony, adres IP z DHCP lub stały</li>
                <li className="flex gap-2"><Circle className="h-2 w-2 mt-1.5 shrink-0 fill-current" /> port <b>9100</b> (surowy TCP) — fabryczny dla ELZAB Zeta</li>
                <li className="flex gap-2"><Circle className="h-2 w-2 mt-1.5 shrink-0 fill-current" /> strona kodowa <b>CP1250 (Windows)</b> — musi zgadzać się z ustawieniem niżej, inaczej znikną polskie znaki</li>
                <li className="flex gap-2"><Circle className="h-2 w-2 mt-1.5 shrink-0 fill-current" /> stawki VAT zaprogramowane przez serwis — litery przepisz do tabeli niżej</li>
                <li className="flex gap-2"><Circle className="h-2 w-2 mt-1.5 shrink-0 fill-current" /> zalecane: rezerwacja adresu IP na routerze (wtedy adres nie zmieni się nigdy)</li>
              </ul>
            </div>
          </div>

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
              <Label>Długość nazwy pozycji</Label>
              <Select
                value={String(form.item_name_length ?? 40)}
                onValueChange={(value) => set({ item_name_length: Number(value) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="40">40 znaków (zalecane)</SelectItem>
                  <SelectItem value="28">28 znaków</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Dłuższe nazwy są skracane automatycznie (skróty branżowe, cięcie na granicy słowa).
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

          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <Laptop className="h-4 w-4" /> Mostek lokalny (ten komputer)
                </div>
                <p className="text-xs text-muted-foreground max-w-xl">
                  Drukarka stoi w sieci lokalnej, a serwer GetRido w chmurze — nie ma jak do niej wejść.
                  Mostek uruchomiony na tym komputerze przyjmuje wydruk z przeglądarki i przekazuje go do
                  drukarki. Ustawienie dotyczy tylko tej przeglądarki.
                </p>
              </div>
              <Switch checked={bridge.enabled} onCheckedChange={(checked) => saveBridge({ enabled: checked })} />
            </div>

            {bridge.enabled && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Adres mostka</Label>
                    <Input value={bridge.url} onChange={(e) => saveBridge({ url: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Token (opcjonalny)</Label>
                    <Input
                      value={bridge.token ?? ''}
                      onChange={(e) => saveBridge({ token: e.target.value })}
                      placeholder="pusty = mostek bez tokenu"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleBridgeCheck} className="gap-1">
                    <Plug className="h-3.5 w-3.5" /> Sprawdź mostek
                  </Button>
                  <code className="text-[11px] text-muted-foreground">npm run fiscal:bridge</code>
                </div>
                {bridgeStatus && (
                  <Alert variant={bridgeStatus.ok ? 'default' : 'destructive'}>
                    {bridgeStatus.ok ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
                    <AlertDescription>{bridgeStatus.message}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <FileBarChart className="h-4 w-4" /> Automatyczny raport dobowy
                </div>
                <p className="text-xs text-muted-foreground max-w-xl">
                  Raport wykona się sam po ustawionej godzinie, na tym komputerze. Zapomniany raport
                  to zablokowana sprzedaż — drukarka blokuje ją po 48 h. Gdy komputer był wyłączony,
                  zaległy raport wykona się przy pierwszym otwarciu panelu.
                </p>
              </div>
              <Switch
                checked={autoReport.enabled}
                onCheckedChange={(checked) => saveAutoReport({ enabled: checked })}
              />
            </div>

            {autoReport.enabled && (
              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Godzina</Label>
                  <Select
                    value={String(autoReport.hour)}
                    onValueChange={(value) => saveAutoReport({ hour: Number(value) })}
                  >
                    <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, hour) => (
                        <SelectItem key={hour} value={String(hour)}>
                          {String(hour).padStart(2, '0')}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[11px] text-muted-foreground pb-2">
                  Ustaw godzinę po zamknięciu warsztatu — raport zamyka dobę sprzedaży.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <CreditCard className="h-4 w-4" /> Terminal płatniczy
                </div>
                <p className="text-xs text-muted-foreground max-w-xl">
                  Gdy włączone, paragon przy płatności <b>kartą lub BLIK-iem</b> drukuje się dopiero po
                  potwierdzeniu płatności. Odrzucona transakcja nie zostawia paragonu do korygowania —
                  wystarczy wybrać inną formę płatności.
                </p>
              </div>
              <Switch checked={terminal.enabled} onCheckedChange={(checked) => saveTerminal({ enabled: checked })} />
            </div>

            {terminal.enabled && (
              <div className="space-y-2">
                <Label className="text-xs">Sposób obsługi terminala</Label>
                <Select
                  value={terminal.provider}
                  onValueChange={(value) => saveTerminal({ provider: value as TerminalProviderId })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.values(TERMINAL_PROVIDERS).map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>{provider.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {TERMINAL_PROVIDERS[terminal.provider].description}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Automatyczna wysyłka kwoty na terminal wymaga sterownika dla konkretnego agenta
                  rozliczeniowego (np. Polcard, eService, PayTel, SumUp) — w Polsce nie ma jednego
                  wspólnego protokołu. Przebieg w programie jest już na to gotowy.
                </p>
              </div>
            )}
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
