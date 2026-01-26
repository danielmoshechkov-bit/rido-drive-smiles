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
  { days: 14, label: '2 tyg.' },
  { days: 30, label: '1 mies.' },
];

export function PaymentTermSelector({ issueDate, dueDate, onDueDateChange }: PaymentTermSelectorProps) {
  const handlePresetClick = (days: number) => {
    const baseDate = issueDate ? new Date(issueDate) : new Date();
    const newDueDate = format(addDays(baseDate, days), 'yyyy-MM-dd');
    onDueDateChange(newDueDate);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          className="h-10 px-3 gap-1 text-sm font-medium shrink-0"
        >
          +7 dni
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-28 p-1" align="end">
        <div className="flex flex-col gap-0.5">
          {PAYMENT_PRESETS.map((preset) => (
            <Button
              key={preset.days}
              variant="ghost"
              size="sm"
              className="justify-start h-8 text-sm"
              onClick={() => handlePresetClick(preset.days)}
            >
              +{preset.days} dni
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
