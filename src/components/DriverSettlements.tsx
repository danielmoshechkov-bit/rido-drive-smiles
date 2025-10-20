import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Settlement {
  id: string;
  driver_id: string;
  platform: string;
  week_start: string;
  week_end: string;
  total_earnings: number;
  commission_amount: number;
  net_amount: number;
  rental_fee: number;
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
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  const loadSettlements = async () => {
    if (!driverId) return;
    
    setLoading(true);
    try {
      console.log('Loading settlements for driver:', driverId);
      
      const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .eq('driver_id', driverId)
        .order('week_start', { ascending: false });

      if (error) {
        console.error('Error loading settlements:', error);
        toast.error('Błąd podczas ładowania rozliczeń');
        return;
      }

      console.log('Loaded settlements:', data);
      setSettlements(data || []);
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
    loadSettlements();
    loadVisibilitySettings();
  }, [driverId]);

  // Group settlements by week
  const groupedSettlements = settlements.reduce((acc, settlement) => {
    const key = `${settlement.week_start}_${settlement.week_end}`;
    if (!acc[key]) {
      acc[key] = {
        week_start: settlement.week_start,
        week_end: settlement.week_end,
        settlements: []
      };
    }
    acc[key].settlements.push(settlement);
    return acc;
  }, {} as Record<string, { week_start: string; week_end: string; settlements: Settlement[] }>);

  const periods = Object.values(groupedSettlements).sort((a, b) => 
    new Date(b.week_start).getTime() - new Date(a.week_start).getTime()
  );

  const toggleWeek = (key: string) => {
    setExpandedWeeks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // Calculate totals for a period
  const calculateTotals = (settlements: Settlement[]) => {
    return settlements.reduce((acc, s) => ({
      total_earnings: acc.total_earnings + s.total_earnings,
      commission: acc.commission + s.commission_amount,
      rental: acc.rental + s.rental_fee,
      net: acc.net + s.net_amount,
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

  if (settlements.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Rozliczenia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Brak dostępnych rozliczeń. Rozliczenia pojawią się tutaj po wgraniu danych przez administratora.
          </p>
        </CardContent>
      </Card>
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
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Rozliczenia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {periods.map((period) => {
              const totals = calculateTotals(period.settlements);
              const periodKey = `${period.week_start}_${period.week_end}`;

              return (
                <Card key={periodKey} className="border-l-4 border-l-primary">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">
                      Okres {format(parseISO(period.week_start), 'dd.MM', { locale: pl })} - {format(parseISO(period.week_end), 'dd.MM.yyyy', { locale: pl })}
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
        </CardContent>
      </Card>
    </div>
  );
};