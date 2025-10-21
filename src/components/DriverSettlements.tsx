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
  amounts: {
    total_earnings?: number;
    commission_amount?: number;
    rental_fee?: number;
    net_amount?: number;
    uberCard?: number;
    uberCash?: number;
    boltGross?: number;
    boltNet?: number;
    boltCash?: number;
    freeNowGross?: number;
    freeNowNet?: number;
    freeNowCash?: number;
    fuel?: number;
    vatFromFuel?: number;
    vatRefundHalf?: number;
    commission?: number;
    tax?: number;
  };
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
      .from('rido_visibility_settings')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    if (error) {
      console.error('Error loading visibility settings:', error);
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

  // Calculate totals for a period
  const calculateTotals = (settlements: Settlement[]) => {
    return settlements.reduce((acc, s) => ({
      total_earnings: acc.total_earnings + (s.amounts.total_earnings || 0),
      commission: acc.commission + (s.amounts.commission_amount || 0),
      rental: acc.rental + (s.amounts.rental_fee || 0),
      net: acc.net + (s.amounts.net_amount || 0),
    }), { total_earnings: 0, commission: 0, rental: 0, net: 0 });
  };

  // Render visible fields
  const renderField = (label: string, value: number, visible: boolean, colorClass: string = "text-foreground") => {
    if (!visible) return null;
    
    return (
      <div className="text-center p-3 bg-muted/50 rounded-lg">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={`text-lg font-semibold ${colorClass}`}>
          {value.toFixed(2)} zł
        </p>
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
                const totals = calculateTotals(period.settlements);
                const periodKey = `${period.period_from}_${period.period_to}`;

                return (
                  <Card key={periodKey} className="border-l-4 border-l-primary">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">
                        Okres {format(parseISO(period.period_from), 'dd.MM', { locale: pl })} - {format(parseISO(period.period_to), 'dd.MM.yyyy', { locale: pl })}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="text-center p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">Przychód</p>
                          <p className="text-lg font-semibold text-green-600">{totals.total_earnings.toFixed(2)} zł</p>
                        </div>
                        <div className="text-center p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">Prowizja</p>
                          <p className="text-lg font-semibold text-red-600">-{totals.commission.toFixed(2)} zł</p>
                        </div>
                        <div className="text-center p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">Wynajem</p>
                          <p className="text-lg font-semibold text-orange-600">-{totals.rental.toFixed(2)} zł</p>
                        </div>
                        <div className="text-center p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">Do wypłaty</p>
                          <p className="text-lg font-semibold text-purple-600">{totals.net.toFixed(2)} zł</p>
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
