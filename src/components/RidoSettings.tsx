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
import { CalendarIcon, Upload, ExternalLink, FileText } from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";

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
  const [isUploading, setIsUploading] = useState(false);
  
  const [periodFrom, setPeriodFrom] = useState<Date>();
  const [periodTo, setPeriodTo] = useState<Date>();
  const [isCreating, setIsCreating] = useState(false);
  
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    loadSettlements();
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

  const sendCSVToSheet = async () => {
    if (!uberFile && !boltFile && !freenowFile) {
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
        secret: currentEnv.secret,
        period_from: format(periodFrom, "yyyy-MM-dd"),
        period_to: format(periodTo, "yyyy-MM-dd"),
      };

      if (currentEnv.use_base64) {
        if (uberFile) payload.uber_csv = await fileToBase64(uberFile);
        if (boltFile) payload.bolt_csv = await fileToBase64(boltFile);
        if (freenowFile) payload.freenow_csv = await fileToBase64(freenowFile);
      } else {
        if (uberFile) payload.uber_csv = await uberFile.text();
        if (boltFile) payload.bolt_csv = await boltFile.text();
        if (freenowFile) payload.freenow_csv = await freenowFile.text();
      }

      const response = await fetch(currentEnv.script_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        toast.success("✅ Dane zostały wysłane do arkusza");
        setUberFile(null);
        setBoltFile(null);
        setFreenowFile(null);
      } else {
        toast.error("Błąd wysyłki: " + (result.message || "Nieznany błąd"));
      }
    } catch (error) {
      console.error(error);
      toast.error("Błąd połączenia z Google Sheets");
    } finally {
      setIsUploading(false);
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

      {/* Sekcja 4: Historia Rozliczeń */}
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
