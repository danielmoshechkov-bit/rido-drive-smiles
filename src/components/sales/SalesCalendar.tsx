import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { useMyCallbacks, useSalesLeads } from "@/hooks/useSalesLeads";
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { pl } from "date-fns/locale";
import { Phone, Clock, User, ChevronLeft, ChevronRight, Building, Calendar as CalendarIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export function SalesCalendar() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  
  const { data: callbacks, isLoading: callbacksLoading } = useMyCallbacks();
  const { data: leads } = useSalesLeads();

  // Get callbacks for the selected date
  const selectedDateCallbacks = useMemo(() => {
    if (!callbacks) return [];
    return callbacks.filter(callback => {
      const callbackDate = new Date(callback.callback_date);
      return isSameDay(callbackDate, selectedDate);
    });
  }, [callbacks, selectedDate]);

  // Get all dates that have callbacks for calendar highlighting
  const datesWithCallbacks = useMemo(() => {
    if (!callbacks) return new Set<string>();
    return new Set(
      callbacks.map(callback => 
        format(new Date(callback.callback_date), 'yyyy-MM-dd')
      )
    );
  }, [callbacks]);

  // Count callbacks per day for the month view
  const callbackCountByDay = useMemo(() => {
    if (!callbacks) return {};
    const counts: Record<string, number> = {};
    callbacks.forEach(callback => {
      const dateKey = format(new Date(callback.callback_date), 'yyyy-MM-dd');
      counts[dateKey] = (counts[dateKey] || 0) + 1;
    });
    return counts;
  }, [callbacks]);

  const handlePreviousMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setCurrentMonth(today);
  };

  // Get lead info for callback
  const getLeadInfo = (leadId: string) => {
    return leads?.find(lead => lead.id === leadId);
  };

  const isPastCallback = (callbackDate: string) => {
    return new Date(callbackDate) < new Date();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Calendar */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Kalendarz oddzwonień
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePreviousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleToday}>
                Dziś
              </Button>
              <Button variant="outline" size="sm" onClick={handleNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && setSelectedDate(date)}
            month={currentMonth}
            onMonthChange={setCurrentMonth}
            locale={pl}
            className="rounded-md border w-full"
            modifiers={{
              hasCallbacks: (date) => datesWithCallbacks.has(format(date, 'yyyy-MM-dd')),
            }}
            modifiersClassNames={{
              hasCallbacks: "bg-primary/20 text-primary font-bold",
            }}
            components={{
              DayContent: ({ date }) => {
                const dateKey = format(date, 'yyyy-MM-dd');
                const count = callbackCountByDay[dateKey];
                return (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <span>{date.getDate()}</span>
                    {count && count > 0 && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-primary font-bold">
                        {count}
                      </span>
                    )}
                  </div>
                );
              },
            }}
          />
          
          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-primary/20"></div>
              <span>Zaplanowane oddzwonienia</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selected day events */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">
            {format(selectedDate, "d MMMM yyyy", { locale: pl })}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {selectedDateCallbacks.length} zaplanowanych oddzwonień
          </p>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            {callbacksLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : selectedDateCallbacks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>Brak zaplanowanych oddzwonień</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDateCallbacks.map((callback) => {
                  const lead = getLeadInfo(callback.lead_id);
                  const isPast = isPastCallback(callback.callback_date);
                  
                  return (
                    <div
                      key={callback.id}
                      className={`p-3 rounded-lg border ${
                        isPast 
                          ? "bg-destructive/5 border-destructive/20" 
                          : "bg-muted/50 border-muted"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              {format(new Date(callback.callback_date), "HH:mm")}
                            </span>
                            {isPast && (
                              <Badge variant="destructive" className="text-xs">
                                Do zadzwonienia!
                              </Badge>
                            )}
                          </div>
                          
                          {lead && (
                            <>
                              <div className="flex items-center gap-2">
                                <Building className="h-3 w-3 text-muted-foreground" />
                                <span className="text-sm font-medium">{lead.company_name}</span>
                              </div>
                              
                              {lead.phone && (
                                <div className="flex items-center gap-2">
                                  <Phone className="h-3 w-3 text-muted-foreground" />
                                  <a 
                                    href={`tel:${lead.phone}`}
                                    className="text-sm text-primary hover:underline"
                                  >
                                    {lead.phone}
                                  </a>
                                </div>
                              )}
                            </>
                          )}
                          
                          {callback.notes && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {callback.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
