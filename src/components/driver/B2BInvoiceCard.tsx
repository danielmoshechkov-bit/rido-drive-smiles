import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Check, Loader2, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

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
  const { toast } = useToast();

  // Monthly data state
  const [invoiceAmount, setInvoiceAmount] = useState(0);
  const [cashAmount, setCashAmount] = useState(0);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [loadingData, setLoadingData] = useState(true);

  // Auto-invoicing state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    invoiceNumberingMode: 'auto' as 'auto' | 'ask_each_time',
  });

  const transferAmount = invoiceAmount - cashAmount;
  const invoiceMonthLabel = format(new Date(year, month - 1, 1), "LLLL yyyy", { locale: pl });

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

      // Load auto-invoicing settings
      const { data: settings } = await supabase
        .from('driver_auto_invoicing_settings')
        .select('*')
        .eq('driver_user_id', user.id)
        .maybeSingle();

      if (settings) {
        setSettingsForm({
          invoiceNumberingMode: (settings as any).invoice_numbering_mode || 'auto',
        });
      }
    } catch (error) {
      console.error('Error loading auto-invoicing settings:', error);
    } finally {
      setLoadingSettings(false);
    }
  };

  const saveAutoInvoicingSettings = async () => {
    try {
      setSavingSettings(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie jesteś zalogowany");

      const { error } = await supabase
        .from('driver_auto_invoicing_settings')
        .upsert({
          driver_user_id: user.id,
          driver_id: driverId,
          fleet_id: fleetId,
          invoice_numbering_mode: settingsForm.invoiceNumberingMode,
        }, { onConflict: 'driver_user_id' });

      if (error) throw error;

      toast({
        title: "Ustawienia zapisane",
        description: "Ustawienia numerowania faktur zostały zaktualizowane",
      });
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

  const handleSaveSettings = async () => {
    await saveAutoInvoicingSettings();
    setShowSettingsModal(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency: "PLN",
    }).format(amount);
  };

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

          {/* Auto-invoicing status - always enabled for B2B */}
          <div className="border-t pt-4">
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">
                  Autofakturowanie włączone
                </span>
              </div>
              <p className="text-xs text-green-700">
                System automatycznie wygeneruje fakturę na koniec miesiąca. 
                Otrzymasz ją na email, kopia trafi do floty.
              </p>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowSettingsModal(true)}
                className="text-green-700 hover:text-green-800 hover:bg-green-100 p-0 h-auto"
              >
                <Settings className="h-4 w-4 mr-1" />
                Ustawienia numeracji
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings Modal - only invoice numbering */}

      <Dialog open={showSettingsModal} onOpenChange={setShowSettingsModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ustawienia numerowania faktur</DialogTitle>
            <DialogDescription>
              Wybierz sposób numerowania faktur wystawianych automatycznie.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
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
