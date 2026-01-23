import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Upload, Check, Loader2, Sparkles, Settings, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface B2BInvoiceCardProps {
  driverId: string;
  driverName: string;
  year: number;
  month: number; // 1-12
  fleetId: string | null;
}

interface AutoInvoicingSettings {
  enabled: boolean;
  frequency: 'monthly' | 'weekly' | 'custom';
  custom_interval_days?: number;
  billing_day_of_month: number;
  invoice_numbering_mode: 'auto' | 'ask_each_time';
}

export function B2BInvoiceCard({
  driverId,
  driverName,
  year,
  month,
  fleetId,
}: B2BInvoiceCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const { toast } = useToast();

  // Monthly data state
  const [invoiceAmount, setInvoiceAmount] = useState(0);
  const [cashAmount, setCashAmount] = useState(0);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [loadingData, setLoadingData] = useState(true);

  // Auto-invoicing state
  const [autoInvoicingEnabled, setAutoInvoicingEnabled] = useState(false);
  const [autoSettings, setAutoSettings] = useState<AutoInvoicingSettings | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [hasB2BProfile, setHasB2BProfile] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    frequency: 'monthly' as 'monthly' | 'weekly' | 'custom',
    billingDay: 1,
    customDays: 14,
    invoiceNumberingMode: 'auto' as 'auto' | 'ask_each_time',
  });

  // Invoice number dialog state
  const [showInvoiceNumberDialog, setShowInvoiceNumberDialog] = useState(false);
  const [manualInvoiceNumber, setManualInvoiceNumber] = useState('');

  const transferAmount = invoiceAmount - cashAmount;
  const invoiceMonthLabel = format(new Date(year, month - 1, 1), "LLLL yyyy", { locale: pl });
  const invoiceMonthShort = format(new Date(year, month - 1, 1), "LLLL", { locale: pl });

  useEffect(() => {
    loadAutoInvoicingSettings();
    loadMonthlySettlements();
  }, [driverId, year, month]);

  // Load all settlements for the month
  const loadMonthlySettlements = async () => {
    try {
      setLoadingData(true);
      
      // Calculate month start and next month start
      const monthStart = `${year}-${month.toString().padStart(2, '0')}-01`;
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonthStart = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`;
      
      // Fetch all settlements where period starts in this month
      const { data: settlements, error } = await supabase
        .from('settlements')
        .select('period_from, period_to, amounts')
        .eq('driver_id', driverId)
        .gte('period_from', monthStart)
        .lt('period_from', nextMonthStart)
        .order('period_from', { ascending: true });
      
      if (error) throw error;
      
      if (settlements && settlements.length > 0) {
        // Sum all amounts from all weeks
        let totalBrutto = 0;
        let totalCash = 0;
        
        for (const s of settlements) {
          const amounts = s.amounts as Record<string, number> || {};
          // Brutto = sum of base amounts from all platforms
          totalBrutto += (amounts.uber_base ?? amounts.uberBase ?? amounts.uber ?? 0);
          totalBrutto += (amounts.bolt_projected_d ?? amounts.boltProjectedD ?? amounts.boltGross ?? 0);
          totalBrutto += (amounts.freenow_base_s ?? amounts.freenowBaseS ?? amounts.freenowGross ?? 0);
          
          // Cash = sum of cash from all platforms
          totalCash += Math.abs(amounts.uber_cash_f ?? amounts.uberCashF ?? amounts.uberCash ?? 0);
          totalCash += Math.abs(amounts.bolt_cash ?? amounts.boltCash ?? 0);
          totalCash += Math.abs(amounts.freenow_cash_f ?? amounts.freenowCashF ?? amounts.freenowCash ?? 0);
        }
        
        setInvoiceAmount(totalBrutto);
        setCashAmount(totalCash);
        
        // Set period from first to last settlement
        setPeriodFrom(settlements[0].period_from);
        setPeriodTo(settlements[settlements.length - 1].period_to);
      } else {
        setInvoiceAmount(0);
        setCashAmount(0);
        setPeriodFrom(monthStart);
        setPeriodTo(monthStart);
      }
    } catch (error) {
      console.error('Error loading monthly settlements:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const loadAutoInvoicingSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check for B2B profile
      const { data: b2bProfile } = await supabase
        .from('driver_b2b_profiles')
        .select('id')
        .eq('driver_user_id', user.id)
        .maybeSingle();

      setHasB2BProfile(!!b2bProfile);

      // Load auto-invoicing settings
      const { data: settings } = await supabase
        .from('driver_auto_invoicing_settings')
        .select('*')
        .eq('driver_user_id', user.id)
        .maybeSingle();

      if (settings) {
        setAutoInvoicingEnabled(settings.enabled || false);
        setAutoSettings({
          enabled: settings.enabled || false,
          frequency: settings.frequency as any || 'monthly',
          custom_interval_days: settings.custom_interval_days,
          billing_day_of_month: settings.billing_day_of_month || 1,
          invoice_numbering_mode: (settings as any).invoice_numbering_mode || 'auto',
        });
        setSettingsForm({
          frequency: settings.frequency as any || 'monthly',
          billingDay: settings.billing_day_of_month || 1,
          customDays: settings.custom_interval_days || 14,
          invoiceNumberingMode: (settings as any).invoice_numbering_mode || 'auto',
        });
      }
    } catch (error) {
      console.error('Error loading auto-invoicing settings:', error);
    } finally {
      setLoadingSettings(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency: "PLN",
    }).format(amount);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
      if (!validTypes.includes(selectedFile.type)) {
        toast({
          title: "Nieprawidłowy format",
          description: "Dozwolone formaty: PDF, JPG, PNG, WEBP",
          variant: "destructive",
        });
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast({
          title: "Plik za duży",
          description: "Maksymalny rozmiar pliku to 10MB",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmitInvoice = async () => {
    if (!file) {
      toast({
        title: "Brak pliku",
        description: "Wybierz plik faktury do wysłania",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie jesteś zalogowany");

      const fileExt = file.name.split(".").pop();
      const fileName = `${driverId}/${periodFrom}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("driver-invoices")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("driver-invoices")
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase.from("driver_invoices").insert({
        driver_id: driverId,
        period_month: month,
        period_year: year,
        invoice_amount: invoiceAmount,
        paid_amount: cashAmount,
        remaining_amount: transferAmount,
        file_url: urlData.publicUrl,
        file_name: file.name,
        uploaded_at: new Date().toISOString(),
        status: "pending",
      });

      if (insertError) throw insertError;

      if (fleetId) {
        await supabase.functions.invoke("send-driver-invoice", {
          body: {
            driver_id: driverId,
            driver_name: driverName,
            fleet_id: fleetId,
            invoice_month: invoiceMonthShort,
            file_url: urlData.publicUrl,
            file_name: file.name,
            invoice_amount: invoiceAmount,
            cash_amount: cashAmount,
            transfer_amount: transferAmount,
          },
        });
      }

      setUploaded(true);
      toast({
        title: "Faktura wysłana!",
        description: "Twoja faktura została przesłana do opiekuna floty",
      });
    } catch (error: any) {
      console.error("Error uploading invoice:", error);
      toast({
        title: "Błąd",
        description: error.message || "Nie udało się wysłać faktury",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleAutoInvoicingToggle = async (checked: boolean) => {
    if (checked && !autoInvoicingEnabled) {
      // Show consent modal first
      setShowConsentModal(true);
    } else if (!checked && autoInvoicingEnabled) {
      // Disable auto-invoicing
      await saveAutoInvoicingSettings(false);
    }
  };

  const handleAcceptConsent = async () => {
    try {
      setSavingSettings(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie jesteś zalogowany");

      // Save consents
      const consents = [
        {
          user_id: user.id,
          consent_type: 'self_billing_authorization',
          version: 'v1.0-2026-01-22',
          accepted: true,
          accepted_at: new Date().toISOString(),
          source: 'web',
        },
        {
          user_id: user.id,
          consent_type: 'b2b_auto_invoicing_authorization',
          version: 'v1.0-2026-01-22',
          accepted: true,
          accepted_at: new Date().toISOString(),
          source: 'web',
        },
      ];

      for (const consent of consents) {
        await supabase.from('legal_consents').upsert(consent, {
          onConflict: 'user_id,consent_type',
        });
      }

      // Log to audit
      await supabase.from('audit_log').insert({
        actor_user_id: user.id,
        actor_type: 'user',
        action: 'auto_invoicing_consent_accepted',
        target_type: 'driver_auto_invoicing',
        target_id: driverId,
        metadata: { consents: ['self_billing_authorization', 'b2b_auto_invoicing_authorization'] },
      });

      // Enable auto-invoicing
      await saveAutoInvoicingSettings(true);
      
      setShowConsentModal(false);
      toast({
        title: "Autofakturowanie włączone",
        description: "System będzie automatycznie wystawiał faktury w Twoim imieniu",
      });
    } catch (error: any) {
      console.error('Error accepting consent:', error);
      toast({
        title: "Błąd",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const saveAutoInvoicingSettings = async (enabled: boolean) => {
    try {
      setSavingSettings(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie jesteś zalogowany");

      const settingsData = {
        driver_user_id: user.id,
        driver_id: driverId,
        fleet_id: fleetId,
        enabled,
        frequency: settingsForm.frequency,
        billing_day_of_month: settingsForm.billingDay,
        custom_interval_days: settingsForm.frequency === 'custom' ? settingsForm.customDays : null,
        invoice_numbering_mode: settingsForm.invoiceNumberingMode,
        next_run_at: enabled ? calculateNextRun() : null,
      };

      const { error } = await supabase
        .from('driver_auto_invoicing_settings')
        .upsert(settingsData, { onConflict: 'driver_user_id' });

      if (error) throw error;

      setAutoInvoicingEnabled(enabled);
      setAutoSettings({
        enabled,
        frequency: settingsForm.frequency,
        custom_interval_days: settingsForm.customDays,
        billing_day_of_month: settingsForm.billingDay,
        invoice_numbering_mode: settingsForm.invoiceNumberingMode,
      });

      // Log to audit
      await supabase.from('audit_log').insert({
        actor_user_id: user.id,
        actor_type: 'user',
        action: enabled ? 'auto_invoicing_enabled' : 'auto_invoicing_disabled',
        target_type: 'driver_auto_invoicing',
        target_id: driverId,
      });

      if (!enabled) {
        toast({
          title: "Autofakturowanie wyłączone",
          description: "Wróciłeś do trybu ręcznego wgrywania faktur",
        });
      }
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast({
        title: "Błąd",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const calculateNextRun = () => {
    const now = new Date();
    let nextRun = new Date();

    if (settingsForm.frequency === 'monthly') {
      nextRun.setMonth(now.getMonth() + 1);
      nextRun.setDate(settingsForm.billingDay);
    } else if (settingsForm.frequency === 'weekly') {
      nextRun.setDate(now.getDate() + 7);
    } else {
      nextRun.setDate(now.getDate() + settingsForm.customDays);
    }

    return nextRun.toISOString();
  };

  const handleSaveSettings = async () => {
    await saveAutoInvoicingSettings(autoInvoicingEnabled);
    setShowSettingsModal(false);
    toast({
      title: "Ustawienia zapisane",
      description: "Ustawienia autofakturowania zostały zaktualizowane",
    });
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels: Record<string, string> = {
      monthly: 'Miesięcznie',
      weekly: 'Tygodniowo',
      custom: 'Niestandardowo',
    };
    return labels[frequency] || frequency;
  };

  if (uploaded) {
    return (
      <Card className="border-2 border-green-200 bg-green-50">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <div className="rounded-full bg-green-100 p-3 mb-4">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <p className="text-lg font-semibold text-green-800">Faktura wysłana!</p>
          <p className="text-sm text-green-600 mt-1">
            Faktura za {invoiceMonthLabel} została przesłana
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loadingSettings) {
    return (
      <Card className="border-2 border-blue-200 bg-blue-50">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-2 border-blue-200 bg-blue-50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-blue-600" />
            <span>Faktura do wystawienia</span>
          </CardTitle>
          <p className="text-sm text-muted-foreground capitalize">{invoiceMonthLabel}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingData ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Faktura brutto */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Faktura brutto:</span>
                <span className="text-lg font-bold text-blue-600">
                  {formatCurrency(invoiceAmount)}
                </span>
              </div>

              <div className="border-t pt-3 space-y-2">
                {/* W tym gotówka (informacyjnie) */}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">W tym gotówka:</span>
                  <span className="text-muted-foreground">
                    {formatCurrency(cashAmount)}
                  </span>
                </div>

                {/* Przelew */}
                <div className="flex justify-between items-center">
                  <span className="font-medium">Przelew:</span>
                  <span className="text-lg font-bold text-green-600">
                    {formatCurrency(transferAmount)}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Auto-invoicing toggle */}
          <div className="border-t pt-4">
            <div className="flex items-start gap-3 p-3 bg-white/50 rounded-lg">
              <Checkbox
                id="auto-invoicing"
                checked={autoInvoicingEnabled}
                onCheckedChange={handleAutoInvoicingToggle}
                disabled={savingSettings}
              />
              <div className="flex-1">
                <Label htmlFor="auto-invoicing" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Automatyczne wystawianie faktur
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Po zaznaczeniu wyrażasz zgodę na automatyczne wystawianie faktur w Twoim imieniu na podstawie rozliczeń. Zgodę możesz cofnąć w dowolnym momencie.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  System automatycznie wystawi fakturę na podstawie rozliczenia
                </p>
              </div>
            </div>
          </div>

          {/* Auto-invoicing enabled state */}
          {autoInvoicingEnabled && autoSettings && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">Autofakturowanie: WŁĄCZONE</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowSettingsModal(true)}
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Ustawienia
                </Button>
              </div>
              <p className="text-xs text-amber-700">
                Częstotliwość: {getFrequencyLabel(autoSettings.frequency)}
                {autoSettings.frequency === 'monthly' && ` (dzień ${autoSettings.billing_day_of_month})`}
              </p>
            </div>
          )}

          {/* Manual upload section - only show if auto-invoicing is disabled */}
          {!autoInvoicingEnabled && (
            <div className="border-t pt-4 space-y-3">
              <Label htmlFor="invoice-file" className="text-sm font-medium">
                Wgraj fakturę (PDF lub zdjęcie):
              </Label>
              <Input
                id="invoice-file"
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="bg-white"
              />
              {file && (
                <p className="text-xs text-muted-foreground">
                  Wybrany plik: {file.name}
                </p>
              )}
              <Button
                onClick={handleSubmitInvoice}
                disabled={!file || uploading}
                className="w-full"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Wysyłanie...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Wyślij fakturę
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consent Modal */}
      <Dialog open={showConsentModal} onOpenChange={setShowConsentModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zgody do autofakturowania</DialogTitle>
            <DialogDescription>
              Aby włączyć automatyczne wystawianie faktur, musisz wyrazić poniższe zgody.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3 p-3 border rounded-lg">
              <Check className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Upoważnienie do samofakturowania</p>
                <p className="text-xs text-muted-foreground">
                  Upoważniam GetRido/Flotę do wystawiania faktur w moim imieniu na podstawie rozliczeń.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-3 border rounded-lg">
              <Check className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Zgoda na przetwarzanie danych</p>
                <p className="text-xs text-muted-foreground">
                  Wyrażam zgodę na przetwarzanie danych do celów wystawiania i przechowywania faktur zgodnie z RODO.
                </p>
              </div>
            </div>

            {!hasB2BProfile && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  ⚠️ Uwaga: Nie masz jeszcze uzupełnionego profilu B2B (dane firmy, NIP). 
                  Uzupełnij dane w ustawieniach konta.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConsentModal(false)}>
              Anuluj
            </Button>
            <Button onClick={handleAcceptConsent} disabled={savingSettings}>
              {savingSettings && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Akceptuję i włączam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Modal */}
      <Dialog open={showSettingsModal} onOpenChange={setShowSettingsModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ustawienia autofakturowania</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Częstotliwość</Label>
              <Select 
                value={settingsForm.frequency} 
                onValueChange={(v) => setSettingsForm(prev => ({ ...prev, frequency: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Miesięcznie</SelectItem>
                  <SelectItem value="weekly">Tygodniowo</SelectItem>
                  <SelectItem value="custom">Niestandardowo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {settingsForm.frequency === 'monthly' && (
              <div className="space-y-2">
                <Label>Dzień miesiąca</Label>
                <Select 
                  value={String(settingsForm.billingDay)} 
                  onValueChange={(v) => setSettingsForm(prev => ({ ...prev, billingDay: parseInt(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                      <SelectItem key={day} value={String(day)}>{day}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {settingsForm.frequency === 'custom' && (
              <div className="space-y-2">
                <Label>Co ile dni</Label>
                <Input 
                  type="number"
                  min="1"
                  max="90"
                  value={settingsForm.customDays}
                  onChange={(e) => setSettingsForm(prev => ({ ...prev, customDays: parseInt(e.target.value) || 14 }))}
                />
              </div>
            )}

            <div className="space-y-2 border-t pt-4">
              <Label>Numerowanie faktur</Label>
              <Select 
                value={settingsForm.invoiceNumberingMode} 
                onValueChange={(v) => setSettingsForm(prev => ({ ...prev, invoiceNumberingMode: v as 'auto' | 'ask_each_time' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    Automatycznie (FV/ROK/MIESIĄC/NR)
                  </SelectItem>
                  <SelectItem value="ask_each_time">
                    Pytaj o numer przy każdej fakturze
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {settingsForm.invoiceNumberingMode === 'auto' 
                  ? 'System automatycznie nada kolejny numer faktury'
                  : 'Przed wystawieniem faktury zostaniesz poproszony o podanie numeru'}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsModal(false)}>
              Anuluj
            </Button>
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
