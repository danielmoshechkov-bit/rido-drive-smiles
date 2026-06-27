import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';

interface Props {
  from: string;                 // 'yyyy-MM-dd'
  to: string;                   // 'yyyy-MM-dd'
  onChange: (from: string, to: string) => void;
  className?: string;
  align?: 'start' | 'center' | 'end';
}

const f = (d: Date) => format(d, 'yyyy-MM-dd');
const parse = (s?: string) => (s ? parseISO(s) : undefined);

// Wspólny kalendarz warsztatu (jeden styl wszędzie). Zakres: klik = początek,
// drugi klik = koniec — bez dwóch osobnych pól. Plus szybkie Tydzień/Miesiąc.
export function WorkshopRangeCalendar({ from, to, onChange, className, align = 'start' }: Props) {
  const [open, setOpen] = useState(false);
  const committed: DateRange | undefined = from ? { from: parse(from), to: parse(to) || parse(from) } : undefined;
  const [pending, setPending] = useState<DateRange | undefined>(undefined);

  const onSelect = (r: DateRange | undefined) => {
    setPending(r);
    if (r?.from && r?.to) {
      onChange(f(r.from), f(r.to));
      setPending(undefined);
      setOpen(false);
    }
  };

  const quick = (s: Date, e: Date) => { onChange(f(s), f(e)); setPending(undefined); setOpen(false); };

  const label = from
    ? (to && to !== from
        ? `${format(parse(from)!, 'dd.MM.yyyy', { locale: pl })} – ${format(parse(to)!, 'dd.MM.yyyy', { locale: pl })}`
        : format(parse(from)!, 'dd.MM.yyyy', { locale: pl }))
    : 'Wybierz zakres';

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setPending(committed); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={`h-9 justify-start gap-2 font-normal ${className || ''}`}>
          <CalendarIcon className="h-4 w-4 shrink-0" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <div className="flex gap-1 border-b p-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { const n = new Date(); quick(startOfWeek(n, { weekStartsOn: 1 }), endOfWeek(n, { weekStartsOn: 1 })); }}>Ten tydzień</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { const n = new Date(); quick(startOfMonth(n), n); }}>Ten miesiąc</Button>
        </div>
        <Calendar
          mode="range"
          selected={pending ?? committed}
          onSelect={onSelect}
          weekStartsOn={1}
          locale={pl}
          numberOfMonths={1}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
