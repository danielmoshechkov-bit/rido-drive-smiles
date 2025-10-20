import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Upload, ExternalLink, FileText, Settings2, Eye } from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

interface RidoEnvSettings {
  active: "test" | "prod";
  test: {
    script_url: string;
    secret: string;
    sheet_url: string;
    use_base64: boolean;
  };
  prod: {
    script_url: string;
    secret: string;
    sheet_url: string;
    use_base64: boolean;
  };
}

interface Settlement {
  id: string;
  period_from: string;
  period_to: string;
  status: string;
  sheet_url: string | null;
  created_at: string;
}

interface VisibilitySettings {
  show_uber_card: boolean;
  show_uber_cash: boolean;
  show_bolt_gross: boolean;
  show_bolt_net: boolean;
  show_bolt_cash: boolean;
  show_freenow_gross: boolean;
  show_freenow_net: boolean;
  show_freenow_cash: boolean;
  show_fuel: boolean;
  show_vat_from_fuel: boolean;
  show_vat_refund_half: boolean;
  show_commission: boolean;
  show_tax: boolean;
}

interface DedupSettings {
  prefer_match_by_email: boolean;
  prefer_match_by_phone: boolean;
  allow_match_by_platform_ids: boolean;
  ignore_empty_email_phone: boolean;
  phone_country_default: string;
}

export default function RidoSettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<RidoEnvSettings>({
    active: "test",
    test: { script_url: "", secret: "", sheet_url: "", use_base64: true },
    prod: { script_url: "", secret: "", sheet_url: "", use_base64: true },
  });
  
  const [uberFile, setUberFile] = useState<File | null>(null);
  const [boltFile, setBoltFile] = useState<File | null>(null);
  const [freenowFile, setFreenowFile] = useState<File | null>(null);
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const [periodFrom, setPeriodFrom] = useState<Date>();
  const [periodTo, setPeriodTo] = useState<Date>();
  const [isCreating, setIsCreating] = useState(false);
  
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  
  const [visibilitySettings, setVisibilitySettings] = useState<VisibilitySettings>({
    show_uber_card: true,
    show_uber_cash: true,
    show_bolt_gross: false,
    show_bolt_net: true,
    show_bolt_cash: false,
    show_freenow_gross: false,
    show_freenow_net: true,
    show_freenow_cash: false,
    show_fuel: true,
    show_vat_from_fuel: false,
    show_vat_refund_half: false,
    show_commission: false,
    show_tax: false,
  });
  
  const [dedupSettings, setDedupSettings] = useState<DedupSettings>({
    prefer_match_by_email: true,
    prefer_match_by_phone: true,
    allow_match_by_platform_ids: true,
    ignore_empty_email_phone: true,
    phone_country_default: 'PL',
  });

  useEffect(() => {
    loadSettings();
    loadSettlements();
    loadVisibilitySettings();
    loadDedupSettings();
  }, []);

  const loadSettings = async () => {
    const { data, error } = await supabase
      .from("rido_settings")
      .select("*")
      .eq("key", "rido_settings_env")
      .maybeSingle();

    if (error) {
      console.error("Error loading settings:", error);
      return;
    }

    if (data && data.value) {
      setSettings(data.value as unknown as RidoEnvSettings);
    }
  };

  const loadSettlements = async () => {
    const { data, error } = await supabase
      .from("rido_settlements")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading settlements:", error);
      return;
    }

    if (data) {
      setSettlements(data);
    }
  };

  const loadVisibilitySettings = async () => {
    const { data, error } = await supabase
      .from("rido_visibility_settings")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .single();

    if (error) {
      console.error("Error loading visibility settings:", error);
      return;
    }

    if (data) {
      setVisibilitySettings({
        show_uber_card: data.show_uber_card,
        show_uber_cash: data.show_uber_cash,
        show_bolt_gross: data.show_bolt_gross,
        show_bolt_net: data.show_bolt_net,
        show_bolt_cash: data.show_bolt_cash,
        show_freenow_gross: data.show_freenow_gross,
        show_freenow_net: data.show_freenow_net,
        show_freenow_cash: data.show_freenow_cash,
        show_fuel: data.show_fuel,
        show_vat_from_fuel: data.show_vat_from_fuel,
        show_vat_refund_half: data.show_vat_refund_half,
        show_commission: data.show_commission,
        show_tax: data.show_tax,
      });
    }
  };

  const loadDedupSettings = async () => {
    const { data, error } = await supabase
      .from("rido_dedup_settings")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .single();

    if (error) {
      console.error("Error loading dedup settings:", error);
      return;
    }

    if (data) {
      setDedupSettings({
        prefer_match_by_email: data.prefer_match_by_email,
        prefer_match_by_phone: data.prefer_match_by_phone,
        allow_match_by_platform_ids: data.allow_match_by_platform_ids,
        ignore_empty_email_phone: data.ignore_empty_email_phone,
        phone_country_default: data.phone_country_default,
      });
    }
  };

  const saveSettings = async () => {
    const { error } = await supabase
      .from("rido_settings")
      .update({ value: settings as any })
      .eq("key", "rido_settings_env");

    if (error) {
      toast.error("Błąd zapisu ustawień");
      console.error(error);
    } else {
      toast.success("✅ Ustawienia zapisane");
    }
  };

  const saveVisibilitySettings = async () => {
    const { error } = await supabase
      .from("rido_visibility_settings")
      .update(visibilitySettings)
      .eq("id", "00000000-0000-0000-0000-000000000001");

    if (error) {
      toast.error("Błąd zapisu ustawień widoczności");
      console.error(error);
    } else {
      toast.success("✅ Ustawienia widoczności zapisane");
    }
  };

  const saveDedupSettings = async () => {
    const { error } = await supabase
      .from("rido_dedup_settings")
      .update(dedupSettings)
      .eq("id", "00000000-0000-0000-0000-000000000001");

    if (error) {
      toast.error("Błąd zapisu ustawień deduplikacji");
      console.error(error);
    } else {
      toast.success("✅ Ustawienia deduplikacji zapisane");
    }
  };

  const currentEnv = settings[settings.active];

  const updateCurrentEnv = (key: keyof typeof currentEnv, value: any) => {
    setSettings({
      ...settings,
      [settings.active]: { ...currentEnv, [key]: value },
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        resolve(base64.split(",")[1]);
      };
      reader.onerror = reject;
    });
  };

  const textToBase64 = (text: string): string => {
    return btoa(text);
  };

  const sendCSVToSheet = async () => {
    if (!uberFile && !boltFile && !freenowFile && !mainFile) {
      toast.error("Wybierz przynajmniej jeden plik CSV");
      return;
    }

    if (!periodFrom || !periodTo) {
      toast.error("Wybierz zakres dat");
      return;
    }

    setIsUploading(true);

    try {
      const payload: any = {
        period_from: format(periodFrom, "yyyy-MM-dd"),
        period_to: format(periodTo, "yyyy-MM-dd"),
      };

      // Read CSV files as text
      if (uberFile) payload.uber_csv = await uberFile.text();
      if (boltFile) payload.bolt_csv = await boltFile.text();
      if (freenowFile) payload.freenow_csv = await freenowFile.text();
      if (mainFile) payload.main_csv = await mainFile.text();

      // Call edge function
      const { data, error } = await supabase.functions.invoke('csv-import', {
        body: payload,
      });

      if (error) {
        console.error('Edge function error:', error);
        toast.error("Błąd importu: " + error.message);
        return;
      }

      if (data.success) {
        toast.success(`✅ Import zakończony! Dodano: ${data.results.added}, Zaktualizowano: ${data.results.updated}, Pominięto: ${data.results.skipped}`);
        
        if (data.results.errors.length > 0) {
          console.error('Import errors:', data.results.errors);
          toast.warning(`Wystąpiły błędy w ${data.results.errors.length} wierszach`);
        }
        
        setUberFile(null);
        setBoltFile(null);
        setFreenowFile(null);
        setMainFile(null);
        
        // Also send to Google Sheets if configured
        if (currentEnv.script_url && currentEnv.secret) {
          await sendToGoogleSheets(payload);
        }
      } else {
        toast.error("Błąd importu");
      }

    } catch (error) {
      console.error(error);
      toast.error("Błąd importu CSV");
    } finally {
      setIsUploading(false);
    }
  };

  const sendToGoogleSheets = async (payload: any) => {
    try {
      const gsPayload = {
        secret: currentEnv.secret,
        ...payload,
      };

      if (currentEnv.use_base64) {
        if (payload.uber_csv) gsPayload.uber_csv = textToBase64(payload.uber_csv);
        if (payload.bolt_csv) gsPayload.bolt_csv = textToBase64(payload.bolt_csv);
        if (payload.freenow_csv) gsPayload.freenow_csv = textToBase64(payload.freenow_csv);
        if (payload.main_csv) gsPayload.main_csv = textToBase64(payload.main_csv);
      }

      const response = await fetch(currentEnv.script_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gsPayload),
      });

      const result = await response.json();

      if (result.success) {
        toast.success("✅ Dane wysłane również do Google Sheets");
      }
    } catch (error) {
      console.error('Error sending to Google Sheets:', error);
    }
  };

  const createNewSettlement = async () => {
    if (!periodFrom || !periodTo) {
      toast.error("Wybierz zakres dat");
      return;
    }

    setIsCreating(true);

    try {
      const payload = {
        secret: currentEnv.secret,
        period_from: format(periodFrom, "yyyy-MM-dd"),
        period_to: format(periodTo, "yyyy-MM-dd"),
      };

      const response = await fetch(currentEnv.script_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        const { data, error } = await supabase
          .from("rido_settlements")
          .insert({
            period_from: format(periodFrom, "yyyy-MM-dd"),
            period_to: format(periodTo, "yyyy-MM-dd"),
            status: "nowe",
            sheet_url: currentEnv.sheet_url,
          })
          .select()
          .single();

        if (error) {
          toast.error("Błąd zapisu rozliczenia");
          console.error(error);
        } else {
          toast.success("✅ Rozliczenie utworzone");
          loadSettlements();
          setSelectedSheet(data.sheet_url);
        }
      } else {
        toast.error("Błąd tworzenia rozliczenia: " + (result.message || ""));
      }
    } catch (error) {
      console.error(error);
      toast.error("Błąd połączenia z Google Sheets");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Sekcja 1: Ustawienia Ogólne */}
      <Card className="shadow-lg border-primary/20">
        <CardHeader className="bg-gradient-to-r from-primary/10 to-secondary/10">
          <CardTitle className="flex items-center gap-2 text-primary">
            🔧 Ustawienia Ogólne
          </CardTitle>
          <CardDescription>
            Konfiguracja środowisk TEST i PROD dla połączenia z Google Sheets
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-4">
            <Label htmlFor="env-switch" className="text-base font-medium">
              Użyj profilu produkcyjnego
            </Label>
            <Switch
              id="env-switch"
              checked={settings.active === "prod"}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, active: checked ? "prod" : "test" })
              }
            />
            <span className="text-sm text-muted-foreground">
              Aktywny: <span className="font-bold text-primary">{settings.active.toUpperCase()}</span>
            </span>
          </div>

          <div className="grid gap-4 mt-6">
            <div>
              <Label htmlFor="script-url">Script URL</Label>
              <Input
                id="script-url"
                value={currentEnv.script_url}
                onChange={(e) => updateCurrentEnv("script_url", e.target.value)}
                placeholder="https://script.google.com/macros/s/..."
              />
            </div>

            <div>
              <Label htmlFor="secret">Sekret RIDO</Label>
              <Input
                id="secret"
                type="password"
                value={currentEnv.secret}
                onChange={(e) => updateCurrentEnv("secret", e.target.value)}
                placeholder="RIDO2025SUPER"
              />
            </div>

            <div>
              <Label htmlFor="sheet-url">Sheet URL</Label>
              <Input
                id="sheet-url"
                value={currentEnv.sheet_url}
                onChange={(e) => updateCurrentEnv("sheet_url", e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="use-base64"
                checked={currentEnv.use_base64}
                onCheckedChange={(checked) =>
                  updateCurrentEnv("use_base64", checked === true)
                }
              />
              <Label htmlFor="use-base64">Użyj kodowania Base64 przy wysyłce CSV</Label>
            </div>
          </div>

          <Button onClick={saveSettings} className="w-full mt-4 bg-primary hover:bg-primary/90">
            💾 Zapisz ustawienia
          </Button>
        </CardContent>
      </Card>

      {/* Sekcja 2: Import CSV */}
      <Card className="shadow-lg border-secondary/20">
        <CardHeader className="bg-gradient-to-r from-secondary/10 to-accent/10">
          <CardTitle className="flex items-center gap-2 text-secondary">
            📂 Import CSV
          </CardTitle>
          <CardDescription>Wyślij pliki CSV do Google Sheets</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4">
            <div>
              <Label htmlFor="uber-csv" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Upload Uber CSV
              </Label>
              <Input
                id="uber-csv"
                type="file"
                accept=".csv"
                onChange={(e) => setUberFile(e.target.files?.[0] || null)}
              />
              {uberFile && <p className="text-sm text-muted-foreground mt-1">📄 {uberFile.name}</p>}
            </div>

            <div>
              <Label htmlFor="bolt-csv" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Upload Bolt CSV
              </Label>
              <Input
                id="bolt-csv"
                type="file"
                accept=".csv"
                onChange={(e) => setBoltFile(e.target.files?.[0] || null)}
              />
              {boltFile && <p className="text-sm text-muted-foreground mt-1">📄 {boltFile.name}</p>}
            </div>

            <div>
              <Label htmlFor="freenow-csv" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Upload FreeNow CSV
              </Label>
              <Input
                id="freenow-csv"
                type="file"
                accept=".csv"
                onChange={(e) => setFreenowFile(e.target.files?.[0] || null)}
              />
              {freenowFile && <p className="text-sm text-muted-foreground mt-1">📄 {freenowFile.name}</p>}
            </div>

            <div>
              <Label htmlFor="main-csv" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Arkusz rozliczeń (główny)
              </Label>
              <Input
                id="main-csv"
                type="file"
                accept=".csv"
                onChange={(e) => setMainFile(e.target.files?.[0] || null)}
              />
              {mainFile && <p className="text-sm text-muted-foreground mt-1">📄 {mainFile.name}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                Główny CSV z systemu — zawiera pełne wiersze rozliczeń
              </p>
            </div>
          </div>

          <Button
            onClick={sendCSVToSheet}
            disabled={isUploading}
            className="w-full bg-secondary hover:bg-secondary/90"
          >
            {isUploading ? "Wysyłanie..." : "📤 Wyślij pliki do Google Sheets"}
          </Button>
        </CardContent>
      </Card>

      {/* Sekcja 3: Tworzenie Rozliczenia */}
      <Card className="shadow-lg border-accent/20">
        <CardHeader className="bg-gradient-to-r from-accent/10 to-primary/10">
          <CardTitle className="flex items-center gap-2 text-accent">
            📅 Tworzenie Rozliczenia
          </CardTitle>
          <CardDescription>Utwórz nowe rozliczenie w arkuszu</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data od</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start", !periodFrom && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {periodFrom ? format(periodFrom, "PPP", { locale: pl }) : "Wybierz datę"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={periodFrom}
                    onSelect={setPeriodFrom}
                    locale={pl}
                    weekStartsOn={1}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>Data do</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start", !periodTo && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {periodTo ? format(periodTo, "PPP", { locale: pl }) : "Wybierz datę"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={periodTo}
                    onSelect={setPeriodTo}
                    locale={pl}
                    weekStartsOn={1}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <Button
            onClick={createNewSettlement}
            disabled={isCreating}
            className="w-full bg-accent hover:bg-accent/90"
          >
            {isCreating ? "Tworzenie..." : "➕ Utwórz nowe rozliczenie"}
          </Button>
        </CardContent>
      </Card>

      {/* Iframe z arkuszem */}
      {selectedSheet && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              Arkusz Google
            </CardTitle>
          </CardHeader>
          <CardContent>
            <iframe
              src={`${selectedSheet}${selectedSheet.includes("?") ? "&" : "?"}rm=minimal`}
              className="w-full border rounded-lg"
              style={{ height: "90vh" }}
              title="Google Sheets"
            />
          </CardContent>
        </Card>
      )}

      {/* Sekcja 4: Widoczność w rozliczeniu kierowcy */}
      <Card className="shadow-lg border-primary/20">
        <CardHeader className="bg-gradient-to-r from-primary/10 to-secondary/10">
          <CardTitle className="flex items-center gap-2 text-primary">
            <Eye className="h-5 w-5" />
            Widoczność w rozliczeniu kierowcy
          </CardTitle>
          <CardDescription>
            Określ, które pola będą widoczne w panelu kierowcy
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-uber-card"
                checked={visibilitySettings.show_uber_card}
                onCheckedChange={(checked) =>
                  setVisibilitySettings({ ...visibilitySettings, show_uber_card: checked === true })
                }
              />
              <Label htmlFor="show-uber-card" className="text-sm font-normal cursor-pointer">
                Uber bezgotówka
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-uber-cash"
                checked={visibilitySettings.show_uber_cash}
                onCheckedChange={(checked) =>
                  setVisibilitySettings({ ...visibilitySettings, show_uber_cash: checked === true })
                }
              />
              <Label htmlFor="show-uber-cash" className="text-sm font-normal cursor-pointer">
                Uber gotówka
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-bolt-gross"
                checked={visibilitySettings.show_bolt_gross}
                onCheckedChange={(checked) =>
                  setVisibilitySettings({ ...visibilitySettings, show_bolt_gross: checked === true })
                }
              />
              <Label htmlFor="show-bolt-gross" className="text-sm font-normal cursor-pointer">
                Bolt brutto
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-bolt-net"
                checked={visibilitySettings.show_bolt_net}
                onCheckedChange={(checked) =>
                  setVisibilitySettings({ ...visibilitySettings, show_bolt_net: checked === true })
                }
              />
              <Label htmlFor="show-bolt-net" className="text-sm font-normal cursor-pointer">
                Bolt netto
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-bolt-cash"
                checked={visibilitySettings.show_bolt_cash}
                onCheckedChange={(checked) =>
                  setVisibilitySettings({ ...visibilitySettings, show_bolt_cash: checked === true })
                }
              />
              <Label htmlFor="show-bolt-cash" className="text-sm font-normal cursor-pointer">
                Bolt gotówka
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-freenow-gross"
                checked={visibilitySettings.show_freenow_gross}
                onCheckedChange={(checked) =>
                  setVisibilitySettings({ ...visibilitySettings, show_freenow_gross: checked === true })
                }
              />
              <Label htmlFor="show-freenow-gross" className="text-sm font-normal cursor-pointer">
                FreeNow brutto
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-freenow-net"
                checked={visibilitySettings.show_freenow_net}
                onCheckedChange={(checked) =>
                  setVisibilitySettings({ ...visibilitySettings, show_freenow_net: checked === true })
                }
              />
              <Label htmlFor="show-freenow-net" className="text-sm font-normal cursor-pointer">
                FreeNow netto
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-freenow-cash"
                checked={visibilitySettings.show_freenow_cash}
                onCheckedChange={(checked) =>
                  setVisibilitySettings({ ...visibilitySettings, show_freenow_cash: checked === true })
                }
              />
              <Label htmlFor="show-freenow-cash" className="text-sm font-normal cursor-pointer">
                FreeNow gotówka
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-fuel"
                checked={visibilitySettings.show_fuel}
                onCheckedChange={(checked) =>
                  setVisibilitySettings({ ...visibilitySettings, show_fuel: checked === true })
                }
              />
              <Label htmlFor="show-fuel" className="text-sm font-normal cursor-pointer">
                Paliwo
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-vat-from-fuel"
                checked={visibilitySettings.show_vat_from_fuel}
                onCheckedChange={(checked) =>
                  setVisibilitySettings({ ...visibilitySettings, show_vat_from_fuel: checked === true })
                }
              />
              <Label htmlFor="show-vat-from-fuel" className="text-sm font-normal cursor-pointer">
                VAT z paliwa
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-vat-refund-half"
                checked={visibilitySettings.show_vat_refund_half}
                onCheckedChange={(checked) =>
                  setVisibilitySettings({ ...visibilitySettings, show_vat_refund_half: checked === true })
                }
              />
              <Label htmlFor="show-vat-refund-half" className="text-sm font-normal cursor-pointer">
                Zwrot VAT (50%)
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-commission"
                checked={visibilitySettings.show_commission}
                onCheckedChange={(checked) =>
                  setVisibilitySettings({ ...visibilitySettings, show_commission: checked === true })
                }
              />
              <Label htmlFor="show-commission" className="text-sm font-normal cursor-pointer">
                Prowizja
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-tax"
                checked={visibilitySettings.show_tax}
                onCheckedChange={(checked) =>
                  setVisibilitySettings({ ...visibilitySettings, show_tax: checked === true })
                }
              />
              <Label htmlFor="show-tax" className="text-sm font-normal cursor-pointer">
                Podatek (8% lub 4,9%)
              </Label>
            </div>
          </div>

          <Button onClick={saveVisibilitySettings} className="w-full mt-4 bg-primary hover:bg-primary/90">
            💾 Zapisz ustawienia widoczności
          </Button>
        </CardContent>
      </Card>

      {/* Sekcja 5: Łączenie kierowców (deduplikacja) */}
      <Card className="shadow-lg border-secondary/20">
        <CardHeader className="bg-gradient-to-r from-secondary/10 to-accent/10">
          <CardTitle className="flex items-center gap-2 text-secondary">
            <Settings2 className="h-5 w-5" />
            Łączenie kierowców (deduplikacja)
          </CardTitle>
          <CardDescription>
            Określ zasady identyfikacji i łączenia danych kierowców
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="prefer-email"
                checked={dedupSettings.prefer_match_by_email}
                onCheckedChange={(checked) =>
                  setDedupSettings({ ...dedupSettings, prefer_match_by_email: checked === true })
                }
              />
              <Label htmlFor="prefer-email" className="text-sm font-normal cursor-pointer">
                Dopasuj po adresie email
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="prefer-phone"
                checked={dedupSettings.prefer_match_by_phone}
                onCheckedChange={(checked) =>
                  setDedupSettings({ ...dedupSettings, prefer_match_by_phone: checked === true })
                }
              />
              <Label htmlFor="prefer-phone" className="text-sm font-normal cursor-pointer">
                Dopasuj po numerze telefonu
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="allow-platform-ids"
                checked={dedupSettings.allow_match_by_platform_ids}
                onCheckedChange={(checked) =>
                  setDedupSettings({ ...dedupSettings, allow_match_by_platform_ids: checked === true })
                }
              />
              <Label htmlFor="allow-platform-ids" className="text-sm font-normal cursor-pointer">
                Dopasuj po ID platform (Uber/Bolt/FreeNow)
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="ignore-empty"
                checked={dedupSettings.ignore_empty_email_phone}
                onCheckedChange={(checked) =>
                  setDedupSettings({ ...dedupSettings, ignore_empty_email_phone: checked === true })
                }
              />
              <Label htmlFor="ignore-empty" className="text-sm font-normal cursor-pointer">
                Ignoruj puste wartości email/telefon
              </Label>
            </div>

            <Separator className="my-4" />

            <div>
              <Label htmlFor="phone-country">Domyślny kraj dla telefonów</Label>
              <Input
                id="phone-country"
                value={dedupSettings.phone_country_default}
                onChange={(e) =>
                  setDedupSettings({ ...dedupSettings, phone_country_default: e.target.value })
                }
                placeholder="PL"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Kod kraju używany do normalizacji numerów (np. +48 dla PL)
              </p>
            </div>
          </div>

          <Button onClick={saveDedupSettings} className="w-full mt-4 bg-secondary hover:bg-secondary/90">
            💾 Zapisz ustawienia deduplikacji
          </Button>
        </CardContent>
      </Card>

      {/* Sekcja 6: Historia Rozliczeń */}
      <Card className="shadow-lg">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardTitle className="flex items-center gap-2">
            📊 Historia Rozliczeń
          </CardTitle>
          <CardDescription>Wszystkie zapisane rozliczenia</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {settlements.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Brak rozliczeń w systemie
            </p>
          ) : (
            <div className="space-y-2">
              {settlements.map((settlement) => (
                <div
                  key={settlement.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">
                      {format(new Date(settlement.period_from), "dd.MM.yyyy")} -{" "}
                      {format(new Date(settlement.period_to), "dd.MM.yyyy")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Status:{" "}
                      <span className="font-medium capitalize">{settlement.status}</span>
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSheet(settlement.sheet_url)}
                    disabled={!settlement.sheet_url}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Otwórz
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
