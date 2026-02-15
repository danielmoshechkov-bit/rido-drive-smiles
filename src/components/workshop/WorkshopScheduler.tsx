import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWorkshopOrders } from '@/hooks/useWorkshop';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, Search, Loader2, Car, Wrench, Clock } from 'lucide-react';
import { format, addDays, startOfWeek, addWeeks, subWeeks, isToday } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Input } from '@/components/ui/input';

interface Props {
  providerId: string;
  onBack: () => void;
}

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 08:00 - 18:00

export function WorkshopScheduler({ providerId, onBack }: Props) {
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [search, setSearch] = useState('');

  const { data: workstations = [] } = useQuery({
    queryKey: ['workshop-workstations', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_workstations')
        .select('*')
        .eq('provider_id', providerId)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: orders = [] } = useWorkshopOrders(providerId);

  // Unplanned tasks (orders without scheduled date)
  const unplannedOrders = useMemo(() => {
    return orders.filter((o: any) =>
      o.status_name !== 'Zakończone' && !o.scheduled_start
    ).slice(0, 10);
  }, [orders]);

  const weekDays = useMemo(() => {
    return Array.from({ length: viewMode === 'day' ? 1 : 5 }, (_, i) =>
      addDays(currentWeekStart, i)
    );
  }, [currentWeekStart, viewMode]);

  const defaultStations = workstations.length > 0 ? workstations : [
    { id: '1', name: 'Prawy podnośnik', sort_order: 0 },
    { id: '2', name: 'Środkowy podnośnik', sort_order: 1 },
    { id: '3', name: 'Lewy podnośnik', sort_order: 2 },
    { id: '4', name: 'Lewy podnośnik dwie kolumny', sort_order: 3 },
    { id: '5', name: 'Lewy podnośnik nożyce', sort_order: 4 },
  ];

  const goToToday = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const weekEnd = addDays(currentWeekStart, 4);
  const headerLabel = `${format(currentWeekStart, 'd', { locale: pl })} – ${format(weekEnd, 'd MMM yyyy', { locale: pl })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-xl font-bold">Terminarz</h2>
      </div>

      {/* Unplanned tasks */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-lg">Zadania do rozplanowania</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj" className="pl-9 w-[200px]" />
            </div>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {unplannedOrders.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center w-full">
                Brak zadań do rozplanowania
              </div>
            ) : (
              unplannedOrders.map((o: any) => (
                <Card key={o.id} className="min-w-[280px] flex-shrink-0 border-l-4 border-l-primary">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Car className="h-4 w-4 text-muted-foreground" />
                      {o.vehicle ? `${o.vehicle.brand} ${o.vehicle.model} ${o.vehicle.plate || ''}` : 'Brak pojazdu'}
                    </div>
                    <div className="text-xs text-muted-foreground">{o.order_number}</div>
                    {o.items?.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1">
                          <Wrench className="h-3 w-3" /> {item.name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> 1.00h
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Calendar controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>Dziś</Button>
          <Button variant="outline" size="icon" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold ml-2">{headerLabel}</h3>
        </div>

        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          {(['day', 'week', 'month'] as const).map(mode => (
            <Button
              key={mode}
              variant={viewMode === mode ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode(mode)}
            >
              {mode === 'day' ? 'Dzień' : mode === 'week' ? 'Tydzień' : 'Miesiąc'}
            </Button>
          ))}
        </div>
      </div>

      {/* Schedule grid */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="w-16 border-b border-r p-2 text-left text-muted-foreground sticky left-0 bg-background z-10"></th>
                {weekDays.map(day => (
                  <th key={day.toISOString()} colSpan={defaultStations.length} className="border-b p-2 text-center">
                    <div className={`font-semibold ${isToday(day) ? 'text-primary' : ''}`}>
                      {format(day, 'EEE dd.MM', { locale: pl })}
                    </div>
                  </th>
                ))}
              </tr>
              <tr className="bg-muted/30">
                <th className="border-b border-r p-1 sticky left-0 bg-muted/30 z-10"></th>
                {weekDays.map(day =>
                  defaultStations.map((st: any) => (
                    <th key={`${day.toISOString()}-${st.id}`} className="border-b border-r p-1 text-center font-normal text-muted-foreground whitespace-nowrap min-w-[80px]">
                      {st.name}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {HOURS.map(hour => (
                <tr key={hour} className="h-12">
                  <td className="border-b border-r p-1 text-right text-muted-foreground font-mono sticky left-0 bg-background z-10">
                    {`${hour}:00`}
                  </td>
                  {weekDays.map(day =>
                    defaultStations.map((st: any) => (
                      <td
                        key={`${day.toISOString()}-${st.id}-${hour}`}
                        className="border-b border-r p-0.5 hover:bg-accent/30 cursor-pointer transition-colors"
                      />
                    ))
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
