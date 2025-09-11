import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { format, startOfWeek, endOfWeek, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DriverSettlement {
  id: string;
  week_start: string;
  week_end: string;
  bezgotowka: number;
  gotowka: number;
  przychod_laczny: number;
  wyplata: number;
  platform: string;
  created_at: string;
}

interface DriverSettlementsProps {
  driverId: string;
}

export const DriverSettlements = ({ driverId }: DriverSettlementsProps) => {
  const [settlements, setSettlements] = useState<DriverSettlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState(1);

  const loadSettlements = async () => {
    if (!driverId) return;
    
    setLoading(true);
    try {
      console.log('Loading settlements for driver:', driverId);
      
      const { data, error } = await supabase
        .from('driver_settlements')
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

  useEffect(() => {
    loadSettlements();
  }, [driverId]);

  // Group settlements by week for display
  const groupedSettlements = settlements.reduce((acc, settlement) => {
    const key = `${settlement.week_start}_${settlement.week_end}`;
    if (!acc[key]) {
      acc[key] = {
        week_start: settlement.week_start,
        week_end: settlement.week_end,
        platforms: []
      };
    }
    acc[key].platforms.push(settlement);
    return acc;
  }, {} as Record<string, { week_start: string; week_end: string; platforms: DriverSettlement[] }>);

  const weeks = Object.values(groupedSettlements).sort((a, b) => 
    new Date(b.week_start).getTime() - new Date(a.week_start).getTime()
  );

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
            Rozliczenia tygodniowe
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Rozliczenia tygodniowe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {weeks.map((week) => {
              // Calculate totals for the week
              const totals = week.platforms.reduce((acc, settlement) => ({
                bezgotowka: acc.bezgotowka + settlement.bezgotowka,
                gotowka: acc.gotowka + settlement.gotowka,
                przychod_laczny: acc.przychod_laczny + settlement.przychod_laczny,
                wyplata: acc.wyplata + settlement.wyplata
              }), { bezgotowka: 0, gotowka: 0, przychod_laczny: 0, wyplata: 0 });

              return (
                <Card key={`${week.week_start}_${week.week_end}`} className="border-l-4 border-l-primary">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">
                      Tydzień {format(parseISO(week.week_start), 'dd.MM', { locale: pl })} - {format(parseISO(week.week_end), 'dd.MM.yyyy', { locale: pl })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Bezgotówka</p>
                        <p className="text-lg font-semibold text-green-600">
                          {totals.bezgotowka.toFixed(2)} zł
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Gotówka</p>
                        <p className="text-lg font-semibold text-blue-600">
                          {totals.gotowka.toFixed(2)} zł
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Przychód łączny</p>
                        <p className="text-lg font-semibold text-purple-600">
                          {totals.przychod_laczny.toFixed(2)} zł
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Do wypłaty</p>
                        <p className="text-lg font-semibold text-orange-600">
                          {totals.wyplata.toFixed(2)} zł
                        </p>
                      </div>
                    </div>
                    
                    {week.platforms.length > 1 && (
                      <div className="mt-4 pt-4 border-t">
                        <h4 className="text-sm font-medium mb-2">Szczegóły według platform:</h4>
                        <div className="space-y-2">
                          {week.platforms.map((settlement) => (
                            <div key={settlement.id} className="flex justify-between items-center text-sm">
                              <span className="font-medium capitalize">{settlement.platform}</span>
                              <div className="flex gap-4">
                                <span className="text-green-600">{settlement.bezgotowka.toFixed(2)} zł</span>
                                <span className="text-blue-600">{settlement.gotowka.toFixed(2)} zł</span>
                                <span className="text-purple-600">{settlement.przychod_laczny.toFixed(2)} zł</span>
                                <span className="text-orange-600 font-medium">{settlement.wyplata.toFixed(2)} zł</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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