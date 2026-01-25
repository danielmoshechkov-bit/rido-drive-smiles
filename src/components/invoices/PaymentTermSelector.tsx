import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown } from 'lucide-react';
import { addDays, format } from 'date-fns';

interface PaymentTermSelectorProps {
  issueDate: string;
  dueDate: string;
  onDueDateChange: (date: string) => void;
}

const PAYMENT_PRESETS = [
  { days: 7, label: '7 dni' },
  { days: 10, label: '10 dni' },
  { days: 14, label: '2 tygodnie' },
  { days: 30, label: '1 miesiąc' },
];

export function PaymentTermSelector({ issueDate, dueDate, onDueDateChange }: PaymentTermSelectorProps) {
  const handlePresetClick = (days: number) => {
    const baseDate = issueDate ? new Date(issueDate) : new Date();
    const newDueDate = format(addDays(baseDate, days), 'yyyy-MM-dd');
    onDueDateChange(newDueDate);
  };

  // Format date for display
  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return format(date, 'dd.MM.yyyy');
  };

  return (
    <div className="flex items-center w-full h-12 pt-4 pb-1 px-3">
      <span className="flex-1 text-sm">{formatDisplayDate(dueDate)}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mr-1">
            <ChevronDown className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-28 p-1" align="end">
          <div className="flex flex-col gap-0.5">
            {PAYMENT_PRESETS.map((preset) => (
              <Button
                key={preset.days}
                variant="ghost"
                size="sm"
                className="justify-start h-7 text-xs"
                onClick={() => handlePresetClick(preset.days)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
