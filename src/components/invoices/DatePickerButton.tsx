import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DatePickerButtonProps {
  label: string;
  value: string;
  onChange: (date: string) => void;
  required?: boolean;
  className?: string;
}

export function DatePickerButton({ 
  label, 
  value, 
  onChange, 
  required,
  className 
}: DatePickerButtonProps) {
  const dateValue = value ? new Date(value) : undefined;

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'));
    }
  };

  return (
    <div className={cn("space-y-1", className)}>
      <label className="text-xs text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal h-10",
              !dateValue && "text-muted-foreground"
            )}
          >
            <CalendarDays className="mr-2 h-4 w-4 shrink-0" />
            {dateValue ? format(dateValue, 'dd-MM-yyyy') : 'Wybierz datę'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateValue}
            onSelect={handleSelect}
            locale={pl}
            initialFocus
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
