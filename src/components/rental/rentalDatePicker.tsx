import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';

/** Kalendarz + modal wyboru daty — skopiowane 1:1 ze starej Floty (ExpiryBadges). */
function SimpleCalendar({ selected, onSelect, month }: { selected?: Date; onSelect: (d: Date) => void; month: Date }) {
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  const days: (number | null)[] = [];
  for (let i = 0; i < adjustedFirstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  const weekDays = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
  return (
    <div className="p-2">
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map(d => <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (day === null) return <div key={`e-${index}`} />;
          const date = new Date(month.getFullYear(), month.getMonth(), day);
          const isSelected = selected && selected.getDate() === day && selected.getMonth() === month.getMonth() && selected.getFullYear() === month.getFullYear();
          const isToday = new Date().toDateString() === date.toDateString();
          return (
            <button key={day} type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(date); }}
              className={cn('w-8 h-8 rounded-md text-sm flex items-center justify-center transition-colors',
                isSelected && 'bg-primary text-primary-foreground',
                !isSelected && isToday && 'bg-accent', !isSelected && !isToday && 'hover:bg-muted')}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RentalDatePickerModal({ isOpen, onClose, selected, onSelect, title }: {
  isOpen: boolean; onClose: () => void; selected?: Date; onSelect: (d: Date) => void; title: string;
}) {
  const [month, setMonth] = useState(selected || new Date());
  const [inputValue, setInputValue] = useState(selected ? format(selected, 'ddMMyyyy') : '');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) { setMonth(selected || new Date()); setInputValue(selected ? format(selected, 'ddMMyyyy') : ''); }
  }, [isOpen, selected]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose(); };
    if (isOpen) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const confirmManual = () => {
    if (inputValue.length === 8) {
      const d = parseInt(inputValue.slice(0, 2), 10), m = parseInt(inputValue.slice(2, 4), 10), y = parseInt(inputValue.slice(4, 8), 10);
      const parsed = new Date(y, m - 1, d);
      if (isValid(parsed) && parsed.getDate() === d && m >= 1 && m <= 12) { onSelect(parsed); onClose(); }
      else toast.error('Nieprawidłowa data');
    }
  };
  const fmtIn = (v: string) => v.length <= 2 ? v : v.length <= 4 ? `${v.slice(0, 2)}.${v.slice(2)}` : `${v.slice(0, 2)}.${v.slice(2, 4)}.${v.slice(4)}`;
  const years = Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - 1 + i);
  const months = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={(e) => e.stopPropagation()}>
      <div ref={modalRef} className="bg-popover border rounded-lg shadow-lg w-[320px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b">
          <span className="font-medium text-sm">{title}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-3 space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Wpisz datę (ddmmrrrr):</label>
            <div className="flex gap-2">
              <Input value={fmtIn(inputValue)} onChange={(e) => setInputValue(e.target.value.replace(/\D/g, '').slice(0, 8))}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); confirmManual(); } }}
                placeholder="dd.mm.rrrr" className="text-center font-mono flex-1" maxLength={10} autoFocus />
              <Button size="sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); confirmManual(); }} disabled={inputValue.length !== 8}>OK</Button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="icon" type="button" className="h-7 w-7" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMonth(p => new Date(p.getFullYear(), p.getMonth() - 1)); }}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="flex gap-1">
              <select value={month.getMonth()} onChange={(e) => { e.stopPropagation(); setMonth(p => new Date(p.getFullYear(), parseInt(e.target.value))); }} onClick={(e) => e.stopPropagation()} className="text-sm border rounded px-2 py-1 bg-background">
                {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={month.getFullYear()} onChange={(e) => { e.stopPropagation(); setMonth(p => new Date(parseInt(e.target.value), p.getMonth())); }} onClick={(e) => e.stopPropagation()} className="text-sm border rounded px-2 py-1 bg-background">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <Button variant="outline" size="icon" type="button" className="h-7 w-7" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMonth(p => new Date(p.getFullYear(), p.getMonth() + 1)); }}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <SimpleCalendar selected={selected} onSelect={(d) => { onSelect(d); onClose(); }} month={month} />
        </div>
      </div>
    </div>
  );
}
