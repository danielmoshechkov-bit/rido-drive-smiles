import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, isAfter, isBefore } from 'date-fns';
import { pl } from 'date-fns/locale';

interface Props {
  from: string;                 // 'yyyy-MM-dd'
  to: string;                   // 'yyyy-MM-dd'
  onChange: (from: string, to: string) => void;
  className?: string;
  align?: 'start' | 'center' | 'end';
}

const f = (d: Date) => format(d, 'yyyy-MM-dd');
const parse = (s?: string) => (s ? parseISO(s) : undefined);

// Kompaktowy single-date picker (ten sam kalendarz, wąskie pole — kończy się przy ikonie).
export function WorkshopDatePicker({ value, onChange, placeholder = 'Wybierz datę', className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={`h-9 w-full justify-start gap-2 font-normal ${className || ''}`}>
          <CalendarIcon className="h-4 w-4 shrink-0" /> {value ? format(parse(value)!, 'dd.MM.yyyy', { locale: pl }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={parse(value)} onSelect={(d) => { if (d) { onChange(f(d)); setOpen(false); } }} weekStartsOn={1} locale={pl} initialFocus />
      </PopoverContent>
    </Popover>
  );
}

// Wspólny kalendarz warsztatu (jeden styl wszędzie). Zakres budowany ręcznie:
// klik 1 = początek (kasuje poprzednie), najeżdżanie pokazuje zakres na żywo,
// klik 2 = koniec → zapis i zamknięcie. Plus szybkie Tydzień/Miesiąc.
export function WorkshopRangeCalendar({ from, to, onChange, className, align = 'start' }: Props) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Date | null>(null); // pierwszy klik
  const [hover, setHover] = useState<Date | null>(null);

  // Aktualnie pokazywany zakres: w trakcie wyboru anchor↔hover, inaczej zatwierdzony.
  const committedFrom = parse(from);
  const committedTo = parse(to) || committedFrom;
  const selecting = anchor !== null;
  const a = anchor, b = selecting ? (hover ?? anchor) : committedTo;
  const lo = selecting ? (a && b && isAfter(a, b) ? b : a) : committedFrom;
  const hi = selecting ? (a && b && isAfter(a, b) ? a : b) : committedTo;

  const onDayClick = (day: Date) => {
    if (!anchor) { setAnchor(day); setHover(day); return; } // klik 1 = start
    const f0 = isAfter(anchor, day) ? day : anchor;          // klik 2 = koniec
    const t0 = isAfter(anchor, day) ? anchor : day;
    onChange(f(f0), f(t0));
    setAnchor(null); setHover(null); setOpen(false);
  };

  const quick = (s: Date, e: Date) => { onChange(f(s), f(e)); setAnchor(null); setHover(null); setOpen(false); };

  const label = from
    ? (to && to !== from
        ? `${format(parse(from)!, 'dd.MM.yyyy', { locale: pl })} – ${format(parse(to)!, 'dd.MM.yyyy', { locale: pl })}`
        : format(parse(from)!, 'dd.MM.yyyy', { locale: pl }))
    : 'Wybierz zakres';

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setAnchor(null); setHover(null); } }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={`h-9 justify-start gap-2 font-normal ${className || ''}`}>
          <CalendarIcon className="h-4 w-4 shrink-0" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-50" align={align} sideOffset={6}>
        <div className="flex items-center justify-between gap-1 border-b p-2">
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { const n = new Date(); quick(startOfWeek(n, { weekStartsOn: 1 }), endOfWeek(n, { weekStartsOn: 1 })); }}>Ten tydzień</Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { const n = new Date(); quick(startOfMonth(n), n); }}>Ten miesiąc</Button>
          </div>
          {selecting && <span className="text-[11px] text-muted-foreground pr-1">Wybierz koniec…</span>}
        </div>
        <Calendar
          mode="default"
          defaultMonth={committedFrom}
          onDayClick={onDayClick}
          onDayMouseEnter={(day) => { if (anchor) setHover(day); }}
          modifiers={{
            rstart: lo ? [lo] : [],
            rend: hi ? [hi] : [],
            rmid: (day: Date) => !!(lo && hi && isAfter(day, lo) && isBefore(day, hi)),
          }}
          modifiersClassNames={{
            rstart: 'bg-primary text-primary-foreground rounded-r-none',
            rend: 'bg-primary text-primary-foreground rounded-l-none',
            rmid: 'bg-accent text-accent-foreground rounded-none',
          }}
          weekStartsOn={1}
          locale={pl}
          numberOfMonths={1}
        />
      </PopoverContent>
    </Popover>
  );
}
