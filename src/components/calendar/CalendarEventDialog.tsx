import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addHours, setHours, setMinutes, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Loader2,
  Trash2,
  Bell
} from "lucide-react";
import { 
  CalendarEvent, 
  useCreateEvent, 
  useUpdateEvent, 
  useDeleteEvent 
} from "@/hooks/useCalendar";
import { toast } from "sonner";

interface CalendarEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEvent | null;
  defaultStart?: Date;
  defaultEnd?: Date;
  calendarId: string;
}

const EVENT_COLORS = [
  { value: "#8b5cf6", label: "Fioletowy" },
  { value: "#3b82f6", label: "Niebieski" },
  { value: "#10b981", label: "Zielony" },
  { value: "#f59e0b", label: "Pomarańczowy" },
  { value: "#ef4444", label: "Czerwony" },
  { value: "#ec4899", label: "Różowy" },
  { value: "#6b7280", label: "Szary" },
];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = (i % 2) * 30;
  return {
    value: `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`,
    label: `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`,
  };
});

export function CalendarEventDialog({
  open,
  onOpenChange,
  event,
  defaultStart,
  defaultEnd,
  calendarId,
}: CalendarEventDialogProps) {
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();

  const isEdit = !!event;

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [color, setColor] = useState("#8b5cf6");
  const [type, setType] = useState<"private_event" | "blocked_time" | "reminder" | "task">("private_event");

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (event) {
        setTitle(event.title);
        setDescription(event.description || "");
        setLocation(event.location || "");
        setAllDay(event.all_day);
        setColor(event.color || "#8b5cf6");
        setType(event.type as any);
        
        const start = parseISO(event.start_at);
        const end = parseISO(event.end_at);
        setStartDate(start);
        setEndDate(end);
        setStartTime(format(start, "HH:mm"));
        setEndTime(format(end, "HH:mm"));
      } else {
        // New event
        const start = defaultStart || new Date();
        const end = defaultEnd || addHours(start, 1);
        
        setTitle("");
        setDescription("");
        setLocation("");
        setAllDay(false);
        setColor("#8b5cf6");
        setType("private_event");
        setStartDate(start);
        setEndDate(end);
        setStartTime(format(start, "HH:mm"));
        setEndTime(format(end, "HH:mm"));
      }
    }
  }, [open, event, defaultStart, defaultEnd]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Podaj tytuł wydarzenia");
      return;
    }

    if (!startDate || !endDate) {
      toast.error("Wybierz datę");
      return;
    }

    if (!calendarId) {
      toast.error("Brak kalendarza");
      return;
    }

    // Construct datetime
    const [startHours, startMins] = startTime.split(":").map(Number);
    const [endHours, endMins] = endTime.split(":").map(Number);

    const startAt = setMinutes(setHours(startDate, startHours), startMins);
    const endAt = setMinutes(setHours(endDate, endHours), endMins);

    if (endAt <= startAt) {
      toast.error("Data zakończenia musi być późniejsza niż rozpoczęcia");
      return;
    }

    const eventData = {
      calendar_id: calendarId,
      type,
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      all_day: allDay,
      status: "confirmed" as const,
      visibility: "private" as const,
      color,
    };

    try {
      if (isEdit && event) {
        await updateEvent.mutateAsync({ id: event.id, ...eventData });
      } else {
        await createEvent.mutateAsync(eventData);
      }
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    
    if (!confirm("Czy na pewno chcesz usunąć to wydarzenie?")) return;

    try {
      await deleteEvent.mutateAsync(event.id);
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const isLoading = createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edytuj wydarzenie" : "Nowe wydarzenie"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Tytuł</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Np. Spotkanie z klientem"
              autoFocus
            />
          </div>

          {/* Type & Color */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Typ</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private_event">Wydarzenie</SelectItem>
                  <SelectItem value="blocked_time">Czas zablokowany</SelectItem>
                  <SelectItem value="reminder">Przypomnienie</SelectItem>
                  <SelectItem value="task">Zadanie</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Kolor</Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger>
                  <SelectValue>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: color }}
                      />
                      {EVENT_COLORS.find(c => c.value === color)?.label}
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {EVENT_COLORS.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: c.value }}
                        />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* All day toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="all-day" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Cały dzień
            </Label>
            <Switch 
              id="all-day" 
              checked={allDay} 
              onCheckedChange={setAllDay}
            />
          </div>

          {/* Start date/time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data rozpoczęcia</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "d MMM yyyy", { locale: pl }) : "Wybierz"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      setStartDate(date);
                      if (!endDate || (date && date > endDate)) {
                        setEndDate(date);
                      }
                    }}
                    initialFocus
                    locale={pl}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {!allDay && (
              <div className="space-y-2">
                <Label>Godzina</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_OPTIONS.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* End date/time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data zakończenia</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "d MMM yyyy", { locale: pl }) : "Wybierz"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    disabled={(date) => startDate ? date < startDate : false}
                    initialFocus
                    locale={pl}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {!allDay && (
              <div className="space-y-2">
                <Label>Godzina</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_OPTIONS.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Lokalizacja
            </Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Adres lub link do spotkania"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Opis</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dodatkowe informacje..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          {isEdit && (
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              disabled={isLoading}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Usuń
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Zapisz" : "Utwórz"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
