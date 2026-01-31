import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Trash2, 
  Clock,
  User,
  Phone
} from "lucide-react";
import { useAIAgentCalendarSlots, useCreateCalendarSlot, useDeleteCalendarSlot } from "@/hooks/useAIAgentCalendar";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";
import { pl } from "date-fns/locale";

interface AIAgentCalendarPanelProps {
  configId: string;
}

export function AIAgentCalendarPanel({ configId }: AIAgentCalendarPanelProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [newSlotDate, setNewSlotDate] = useState<Date | undefined>(new Date());
  const [newSlotStart, setNewSlotStart] = useState("09:00");
  const [newSlotEnd, setNewSlotEnd] = useState("10:00");

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });

  const { data: slots, isLoading } = useAIAgentCalendarSlots(
    configId,
    format(weekStart, "yyyy-MM-dd"),
    format(weekEnd, "yyyy-MM-dd")
  );

  const createSlot = useCreateCalendarSlot();
  const deleteSlot = useDeleteCalendarSlot();

  const handleCreateSlot = async () => {
    if (!newSlotDate) return;

    await createSlot.mutateAsync({
      config_id: configId,
      slot_date: format(newSlotDate, "yyyy-MM-dd"),
      start_time: newSlotStart,
      end_time: newSlotEnd,
      status: "available",
      lead_id: null,
      call_id: null,
      booking_notes: null,
      confirmed_at: null,
      reminder_sent: false,
    });
  };

  const handleDeleteSlot = async (slotId: string) => {
    await deleteSlot.mutateAsync({ id: slotId, configId });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-green-100 border-green-300 text-green-800";
      case "booked":
        return "bg-blue-100 border-blue-300 text-blue-800";
      case "blocked":
        return "bg-gray-100 border-gray-300 text-gray-800";
      default:
        return "bg-muted border-border";
    }
  };

  // Group slots by date
  const slotsByDate: Record<string, typeof slots> = {};
  slots?.forEach(slot => {
    if (!slotsByDate[slot.slot_date]) {
      slotsByDate[slot.slot_date] = [];
    }
    slotsByDate[slot.slot_date]!.push(slot);
  });

  // Generate week days
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Slot Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Dodaj slot czasowy
          </CardTitle>
          <CardDescription>
            Określ dostępne terminy, w których AI może umawiać spotkania
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <Label>Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[200px] justify-start gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {newSlotDate ? format(newSlotDate, "d MMMM yyyy", { locale: pl }) : "Wybierz datę"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newSlotDate}
                    onSelect={setNewSlotDate}
                    locale={pl}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Od</Label>
              <Input
                type="time"
                value={newSlotStart}
                onChange={(e) => setNewSlotStart(e.target.value)}
                className="w-[120px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Do</Label>
              <Input
                type="time"
                value={newSlotEnd}
                onChange={(e) => setNewSlotEnd(e.target.value)}
                className="w-[120px]"
              />
            </div>

            <Button 
              onClick={handleCreateSlot} 
              disabled={createSlot.isPending}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Dodaj slot
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Week Navigation */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Kalendarz slotów
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(addDays(selectedDate, -7))}
              >
                ← Tydzień
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(new Date())}
              >
                Dziś
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(addDays(selectedDate, 7))}
              >
                Tydzień →
              </Button>
            </div>
          </div>
          <CardDescription>
            {format(weekStart, "d MMMM", { locale: pl })} - {format(weekEnd, "d MMMM yyyy", { locale: pl })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Week Grid */}
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const daySlots = slotsByDate[dateStr] || [];
              const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

              return (
                <div key={dateStr} className="min-h-[200px]">
                  <div className={`text-center p-2 rounded-t-lg ${isToday ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    <p className="text-xs font-medium">
                      {format(day, "EEE", { locale: pl })}
                    </p>
                    <p className="text-lg font-bold">
                      {format(day, "d")}
                    </p>
                  </div>
                  <div className="border border-t-0 rounded-b-lg p-1 space-y-1 min-h-[150px]">
                    {daySlots.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Brak slotów
                      </p>
                    ) : (
                      daySlots.map((slot) => (
                        <div
                          key={slot.id}
                          className={`p-2 rounded border text-xs ${getStatusColor(slot.status)}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>
                                {slot.start_time.slice(0, 5)}-{slot.end_time.slice(0, 5)}
                              </span>
                            </div>
                            {slot.status === "available" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => handleDeleteSlot(slot.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          {slot.status === "booked" && slot.lead && (
                            <div className="mt-1 pt-1 border-t border-current/20">
                              <p className="flex items-center gap-1 truncate">
                                <User className="h-3 w-3" />
                                {slot.lead.company_name}
                              </p>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-300"></div>
              <span className="text-xs text-muted-foreground">Dostępny</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-blue-300"></div>
              <span className="text-xs text-muted-foreground">Zarezerwowany</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-gray-300"></div>
              <span className="text-xs text-muted-foreground">Zablokowany</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
