import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { SalesLead, useCreateSalesCallLog, useUpdateSalesLead } from "@/hooks/useSalesLeads";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { 
  Phone, 
  PhoneOff, 
  PhoneMissed, 
  Clock, 
  CalendarIcon,
  Check,
  X,
  HelpCircle,
  RotateCcw,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface SalesCallDialogProps {
  lead: SalesLead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const callSchema = z.object({
  call_status: z.string().min(1, "Wybierz status połączenia"),
  outcome: z.string().optional(),
  notes: z.string().optional(),
  callback_date: z.date().optional(),
});

type CallFormData = z.infer<typeof callSchema>;

const CALL_STATUSES = [
  { value: "answered", label: "Odebrał", icon: Phone, color: "text-green-600" },
  { value: "no_answer", label: "Nie odebrał", icon: PhoneOff, color: "text-gray-600" },
  { value: "busy", label: "Zajęty", icon: PhoneMissed, color: "text-yellow-600" },
  { value: "voicemail", label: "Poczta głosowa", icon: Clock, color: "text-blue-600" },
  { value: "callback", label: "Oddzwonić", icon: RotateCcw, color: "text-purple-600" },
  { value: "wrong_number", label: "Zły numer", icon: X, color: "text-red-600" },
];

const OUTCOMES = [
  { value: "interested", label: "Zainteresowany", icon: Check, color: "text-green-600" },
  { value: "not_interested", label: "Niezainteresowany", icon: X, color: "text-red-600" },
  { value: "undecided", label: "Niezdecydowany", icon: HelpCircle, color: "text-yellow-600" },
  { value: "follow_up", label: "Wymaga kontynuacji", icon: RotateCcw, color: "text-blue-600" },
];

export function SalesCallDialog({ lead, open, onOpenChange }: SalesCallDialogProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  
  const createCallLog = useCreateSalesCallLog();
  const updateLead = useUpdateSalesLead();
  
  const form = useForm<CallFormData>({
    resolver: zodResolver(callSchema),
    defaultValues: {
      call_status: "",
      outcome: "",
      notes: "",
    },
  });

  const selectedStatus = form.watch("call_status");
  const showOutcome = selectedStatus === "answered";
  const showCallback = selectedStatus === "callback" || selectedStatus === "no_answer" || selectedStatus === "busy";

  const onSubmit = async (data: CallFormData) => {
    try {
      await createCallLog.mutateAsync({
        lead_id: lead.id,
        call_status: data.call_status,
        outcome: data.outcome || null,
        notes: data.notes || null,
        callback_date: data.callback_date?.toISOString() || null,
      });

      // Update lead status based on outcome
      if (data.outcome === "interested") {
        await updateLead.mutateAsync({ id: lead.id, status: "interested" });
      } else if (data.call_status !== "no_answer" && data.call_status !== "busy") {
        await updateLead.mutateAsync({ id: lead.id, status: "contacted" });
      }

      form.reset();
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Zapisz połączenie - {lead.company_name}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Call Status */}
            <FormField
              control={form.control}
              name="call_status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status połączenia *</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-3 gap-2">
                      {CALL_STATUSES.map((status) => {
                        const Icon = status.icon;
                        return (
                          <Button
                            key={status.value}
                            type="button"
                            variant={field.value === status.value ? "default" : "outline"}
                            className={cn(
                              "flex-col h-auto py-3 gap-1",
                              field.value === status.value && "ring-2 ring-primary"
                            )}
                            onClick={() => field.onChange(status.value)}
                          >
                            <Icon className={cn("h-5 w-5", field.value !== status.value && status.color)} />
                            <span className="text-xs">{status.label}</span>
                          </Button>
                        );
                      })}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Outcome (only if answered) */}
            {showOutcome && (
              <FormField
                control={form.control}
                name="outcome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rezultat rozmowy</FormLabel>
                    <FormControl>
                      <div className="grid grid-cols-2 gap-2">
                        {OUTCOMES.map((outcome) => {
                          const Icon = outcome.icon;
                          return (
                            <Button
                              key={outcome.value}
                              type="button"
                              variant={field.value === outcome.value ? "default" : "outline"}
                              className="gap-2"
                              onClick={() => field.onChange(outcome.value)}
                            >
                              <Icon className={cn("h-4 w-4", field.value !== outcome.value && outcome.color)} />
                              {outcome.label}
                            </Button>
                          );
                        })}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Callback Date */}
            {showCallback && (
              <FormField
                control={form.control}
                name="callback_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kiedy oddzwonić?</FormLabel>
                    <Popover open={showCalendar} onOpenChange={setShowCalendar}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? (
                              format(field.value, "d MMMM yyyy", { locale: pl })
                            ) : (
                              "Wybierz datę"
                            )}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            field.onChange(date);
                            setShowCalendar(false);
                          }}
                          disabled={(date) => date < new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notatka</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Zapisz ważne informacje z rozmowy..."
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Anuluj
              </Button>
              <Button type="submit" disabled={createCallLog.isPending}>
                {createCallLog.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Zapisz
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
