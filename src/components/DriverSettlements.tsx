import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

interface Settlement {
  id: string;
  driver_id: string;
  source: string;
  period_from: string;
  period_to: string;
  amounts: any;
  created_at: string;
}

interface VisibilitySettings {
  show_uber: boolean;
  show_uber_cashless: boolean;
  show_uber_cash: boolean;
  show_bolt_gross: boolean;
  show_bolt_net: boolean;
  show_bolt_commission: boolean;
  show_bolt_cash: boolean;
  show_freenow_gross: boolean;
  show_freenow_net: boolean;
  show_freenow_commission: boolean;
  show_freenow_cash: boolean;
  show_total_cash: boolean;
  show_total_commission: boolean;
  show_tax: boolean;
  show_fuel: boolean;
  show_fuel_vat: boolean;
  show_fuel_vat_refund: boolean;
  payout_formula: string;
}

interface DriverSettlementsProps {
  driverId: string;
}

export const DriverSettlements = ({ driverId }: DriverSettlementsProps) => {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [visibilitySettings, setVisibilitySettings] = useState<VisibilitySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();

  const loadSettlements = async () => {
    if (!driverId) return;
    
    setLoading(true);
    try {
      console.log('Loading settlements for driver:', driverId);
      
      let query = supabase
        .from('settlements')
        .select('*')
        .eq('driver_id', driverId);

      if (dateFrom) {
        query = query.gte('period_from', format(dateFrom, 'yyyy-MM-dd'));
      }
      if (dateTo) {
        query = query.lte('period_to', format(dateTo, 'yyyy-MM-dd'));
      }

      const { data, error } = await query.order('period_from', { ascending: false });

      if (error) {
        console.error('Error loading settlements:', error);
        toast.error('Błąd podczas ładowania rozliczeń');
        return;
      }

      console.log('Loaded settlements:', data);
      setSettlements((data || []) as Settlement[]);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Błąd podczas ładowania rozliczeń');
    } finally {
      setLoading(false);
    }
  };

  const loadVisibilitySettings = async () => {
    const { data, error } = await supabase
      .from('settlement_visibility_settings')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle();

    if (error) {
      console.error('Error loading visibility settings:', error);
      return;
    }

    if (data) {
      setVisibilitySettings(data as VisibilitySettings);
    }
  };

  useEffect(() => {
    loadVisibilitySettings();
  }, []);

  useEffect(() => {
    loadSettlements();
  }, [driverId, dateFrom, dateTo]);

  // Group settlements by period
  const groupedSettlements = settlements.reduce((acc, settlement) => {
    const key = `${settlement.period_from}_${settlement.period_to}`;
    if (!acc[key]) {
      acc[key] = {
        period_from: settlement.period_from,
        period_to: settlement.period_to,
        settlements: []
      };
    }
    acc[key].settlements.push(settlement);
    return acc;
  }, {} as Record<string, { period_from: string; period_to: string; settlements: Settlement[] }>);

  const periods = Object.values(groupedSettlements).sort((a, b) => 
    new Date(b.period_from).getTime() - new Date(a.period_from).getTime()
  );

  // Calculate payout using formula
  const calculatePayout = (amounts: any): number => {
    if (!visibilitySettings?.payout_formula || !amounts) return 0;
    
    let formula = visibilitySettings.payout_formula;
    
    // Replace variable names with actual values
    const replacements: Record<string, number> = {
      uberCashless: amounts.uberCashless || 0,
      uber: amounts.uber || 0,
      uberCash: amounts.uberCash || 0,
      boltNet: amounts.boltNet || 0,
      boltGross: amounts.boltGross || 0,
      boltCash: amounts.boltCash || 0,
      freenowNet: amounts.freenowNet || 0,
      freenowGross: amounts.freenowGross || 0,
      freenowCash: amounts.freenowCash || 0,
      fuel: amounts.fuel || 0,
      fuelVATRefund: amounts.fuelVATRefund || 0,
      totalCash: amounts.totalCash || 0,
      totalCommission: amounts.totalCommission || 0,
      tax: amounts.tax || 0
    };
    
    Object.entries(replacements).forEach(([key, value]) => {
      formula = formula.replace(new RegExp(key, 'g'), value.toString());
    });
    
    try {
      // Use Function constructor for safe evaluation (simple math only)
      return new Function(`return ${formula}`)();
    } catch {
      console.error('Error evaluating formula:', formula);
      return 0;
    }
  };

  // Render visible field
  const renderField = (label: string, value: number, visible: boolean, colorClass: string = "text-foreground") => {
    if (!visible) return null;
    
    return (
      <div className="flex justify-between p-2 hover:bg-muted/50 rounded">
        <span className="text-sm text-muted-foreground">{label}:</span>
        <span className={`text-sm font-medium ${colorClass}`}>
          {value.toFixed(2)} zł
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!visibilitySettings) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Ładowanie ustawień...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Rozliczenia
            </CardTitle>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Calendar className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, 'dd.MM.yyyy', { locale: pl }) : "Od"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    locale={pl}
                    weekStartsOn={1}
                  />
                </PopoverContent>
              </Popover>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Calendar className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, 'dd.MM.yyyy', { locale: pl }) : "Do"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    locale={pl}
                    weekStartsOn={1}
                  />
                </PopoverContent>
              </Popover>
              
              {(dateFrom || dateTo) && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => { 
                    setDateFrom(undefined); 
                    setDateTo(undefined); 
                  }}
                >
                  Wyczyść
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {settlements.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Brak dostępnych rozliczeń. Rozliczenia pojawią się tutaj po wgraniu danych przez administratora.
            </p>
          ) : (
            <div className="space-y-4">
              {periods.map((period) => {
                const periodKey = `${period.period_from}_${period.period_to}`;
                const settlement = period.settlements[0];
                const amounts = settlement.amounts || {};
                const payout = calculatePayout(amounts);

                return (
                  <Card key={periodKey} className="border-l-4 border-l-primary">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">
                        Okres {format(parseISO(period.period_from), 'dd.MM', { locale: pl })} - {format(parseISO(period.period_to), 'dd.MM.yyyy', { locale: pl })}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {/* UBER */}
                      {renderField('Uber (łącznie)', amounts.uber, visibilitySettings.show_uber)}
                      {renderField('Uber bezgotówka', amounts.uberCashless, visibilitySettings.show_uber_cashless)}
                      {renderField('Uber gotówka', amounts.uberCash, visibilitySettings.show_uber_cash)}
                      
                      {/* BOLT */}
                      {renderField('Bolt brutto', amounts.boltGross, visibilitySettings.show_bolt_gross)}
                      {renderField('Bolt netto', amounts.boltNet, visibilitySettings.show_bolt_net)}
                      {renderField('Bolt prowizja', amounts.boltCommission, visibilitySettings.show_bolt_commission, 'text-destructive')}
                      {renderField('Bolt gotówka', amounts.boltCash, visibilitySettings.show_bolt_cash)}
                      
                      {/* FREENOW */}
                      {renderField('FreeNow brutto', amounts.freenowGross, visibilitySettings.show_freenow_gross)}
                      {renderField('FreeNow netto', amounts.freenowNet, visibilitySettings.show_freenow_net)}
                      {renderField('FreeNow prowizja', amounts.freenowCommission, visibilitySettings.show_freenow_commission, 'text-destructive')}
                      {renderField('FreeNow gotówka', amounts.freenowCash, visibilitySettings.show_freenow_cash)}
                      
                      {/* PODSUMOWANIE */}
                      {renderField('Razem gotówka', amounts.totalCash, visibilitySettings.show_total_cash)}
                      {renderField('Razem prowizja', amounts.totalCommission, visibilitySettings.show_total_commission, 'text-destructive')}
                      {renderField('Podatek 8%/49', amounts.tax, visibilitySettings.show_tax)}
                      
                      {/* PALIWO */}
                      {renderField('Paliwo', amounts.fuel, visibilitySettings.show_fuel, 'text-destructive')}
                      {renderField('VAT z paliwa', amounts.fuelVAT, visibilitySettings.show_fuel_vat)}
                      {renderField('Zwrot VAT', amounts.fuelVATRefund, visibilitySettings.show_fuel_vat_refund, 'text-green-600')}
                      
                      {/* DO WYPŁATY */}
                      <div className="pt-3 mt-3 border-t">
                        <div className="flex justify-between p-3 bg-primary/10 rounded-lg">
                          <span className="text-base font-semibold">Do wypłaty:</span>
                          <span className="text-base font-bold text-primary">
                            {payout.toFixed(2)} zł
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};