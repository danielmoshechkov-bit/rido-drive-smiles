import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay, addDays, format } from "date-fns";

export interface CalendarEvent {
  id: string;
  calendar_id: string;
  type: "private_event" | "booking" | "blocked_time" | "reminder" | "task";
  title: string;
  description?: string;
  location?: string;
  location_url?: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  status: "draft" | "confirmed" | "cancelled" | "completed" | "no_show";
  visibility: "private" | "public" | "busy_only";
  color?: string;
  reminder_minutes?: number[];
  created_by_user_id?: string;
  booking_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Calendar {
  id: string;
  owner_type: "user" | "company" | "service_provider";
  owner_id: string;
  name: string;
  description?: string;
  timezone: string;
  color: string;
  is_default: boolean;
  is_public: boolean;
  settings?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CalendarUserSettings {
  id: string;
  user_id: string;
  default_view: "day" | "week" | "month" | "agenda" | "schedule";
  week_starts_on: number;
  time_format: "12h" | "24h";
  timezone: string;
  show_weekends: boolean;
  show_declined: boolean;
  default_event_duration_minutes: number;
  reminder_defaults: number[];
  notification_email: boolean;
  notification_sms: boolean;
  notification_push: boolean;
  notification_in_app: boolean;
  working_hours_start: string;
  working_hours_end: string;
}

type ViewType = "day" | "week" | "month" | "agenda";

// Hook do pobierania kalendarzy użytkownika
export function useUserCalendars() {
  return useQuery({
    queryKey: ["user-calendars"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const supabaseAny = supabase as any;
      const { data, error } = await supabaseAny
        .from("calendar_calendars")
        .select("*")
        .eq("owner_type", "user")
        .eq("owner_id", user.id)
        .order("is_default", { ascending: false });

      if (error) throw error;
      return data as Calendar[];
    },
  });
}

// Hook do pobierania lub tworzenia domyślnego kalendarza
export function useDefaultCalendar() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["default-calendar"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const supabaseAny = supabase as any;
      
      // Sprawdź czy istnieje domyślny kalendarz
      let { data, error } = await supabaseAny
        .from("calendar_calendars")
        .select("*")
        .eq("owner_type", "user")
        .eq("owner_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      if (error) throw error;

      // Jeśli nie ma, utwórz nowy
      if (!data) {
        const { data: newCalendar, error: createError } = await supabaseAny
          .from("calendar_calendars")
          .insert({
            owner_type: "user",
            owner_id: user.id,
            name: "Mój kalendarz",
            is_default: true,
            color: "#8b5cf6",
          })
          .select()
          .single();

        if (createError) throw createError;
        data = newCalendar;
      }

      return data as Calendar;
    },
  });
}

// Hook do pobierania wydarzeń kalendarza
export function useCalendarEvents(
  calendarIds: string[],
  view: ViewType,
  currentDate: Date
) {
  return useQuery({
    queryKey: ["calendar-events", calendarIds, view, format(currentDate, "yyyy-MM-dd")],
    queryFn: async () => {
      if (calendarIds.length === 0) return [];

      let startDate: Date;
      let endDate: Date;

      switch (view) {
        case "day":
          startDate = startOfDay(currentDate);
          endDate = endOfDay(currentDate);
          break;
        case "week":
          startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
          endDate = endOfWeek(currentDate, { weekStartsOn: 1 });
          break;
        case "month":
          startDate = startOfMonth(currentDate);
          endDate = endOfMonth(currentDate);
          // Rozszerz o tydzień przed i po dla widoku miesiąca
          startDate = addDays(startDate, -7);
          endDate = addDays(endDate, 7);
          break;
        case "agenda":
          startDate = startOfDay(currentDate);
          endDate = addDays(currentDate, 30);
          break;
        default:
          startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
          endDate = endOfWeek(currentDate, { weekStartsOn: 1 });
      }

      const supabaseAny = supabase as any;
      const { data, error } = await supabaseAny
        .from("calendar_events")
        .select("*")
        .in("calendar_id", calendarIds)
        .gte("start_at", startDate.toISOString())
        .lte("end_at", endDate.toISOString())
        .order("start_at", { ascending: true });

      if (error) throw error;
      return data as CalendarEvent[];
    },
    enabled: calendarIds.length > 0,
  });
}

// Hook do tworzenia wydarzenia
export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (event: Omit<CalendarEvent, "id" | "created_at" | "updated_at">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie zalogowano");

      const supabaseAny = supabase as any;
      const { data, error } = await supabaseAny
        .from("calendar_events")
        .insert({
          ...event,
          created_by_user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CalendarEvent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("Wydarzenie dodane");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Hook do aktualizacji wydarzenia
export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CalendarEvent> & { id: string }) => {
      const supabaseAny = supabase as any;
      const { data, error } = await supabaseAny
        .from("calendar_events")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as CalendarEvent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("Wydarzenie zaktualizowane");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Hook do usuwania wydarzenia
export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabaseAny = supabase as any;
      const { error } = await supabaseAny
        .from("calendar_events")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("Wydarzenie usunięte");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Hook do ustawień użytkownika
export function useCalendarSettings() {
  return useQuery({
    queryKey: ["calendar-settings"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const supabaseAny = supabase as any;
      let { data, error } = await supabaseAny
        .from("calendar_user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      // Domyślne ustawienia jeśli nie istnieją
      if (!data) {
        const { data: newSettings, error: createError } = await supabaseAny
          .from("calendar_user_settings")
          .insert({
            user_id: user.id,
          })
          .select()
          .single();

        if (createError) throw createError;
        data = newSettings;
      }

      return data as CalendarUserSettings;
    },
  });
}

// Hook do aktualizacji ustawień
export function useUpdateCalendarSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<CalendarUserSettings>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie zalogowano");

      const supabaseAny = supabase as any;
      const { data, error } = await supabaseAny
        .from("calendar_user_settings")
        .update(updates)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;
      return data as CalendarUserSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-settings"] });
      toast.success("Ustawienia zapisane");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
