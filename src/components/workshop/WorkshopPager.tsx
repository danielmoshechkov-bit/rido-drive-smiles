/**
 * Wspólny pasek stronicowania dla list w portalu.
 *
 * PO CO: listy rosły w nieskończoność i jedyną nawigacją było przewijanie — przy kilkuset
 * pojazdach czy zleceniach nie da się tak pracować, a użytkownik gubi miejsce, w którym był.
 * Jeden komponent zamiast pięciu wariantów: wszędzie ta sama kolejność („Pokaż N na stronę"
 * przy liczniku, przyciski po prawej) i te same skoki, więc nie trzeba się uczyć od nowa.
 */

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const PAGE_SIZES = [20, 50, 100] as const;

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Dopisek po liczniku, np. „w tym miesiącu”. */
  suffix?: string;
  className?: string;
}

export function WorkshopPager({ page, pageSize, total, onPageChange, onPageSizeChange, suffix, className }: Props) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  const first = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, total);

  if (total === 0) return null;

  return (
    <div className={`flex items-center justify-between gap-3 pt-3 text-sm flex-wrap ${className ?? ''}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>Pokaż</span>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>{size}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>
          na stronę · {first}–{last} z {total}{suffix ? ` ${suffix}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-8" disabled={current <= 1} onClick={() => onPageChange(current - 1)}>
          Poprzednia
        </Button>
        <span className="px-2 text-muted-foreground">strona {current} z {pageCount}</span>
        <Button variant="outline" size="sm" className="h-8" disabled={current >= pageCount} onClick={() => onPageChange(current + 1)}>
          Następna
        </Button>
      </div>
    </div>
  );
}

/** Wycinek strony z pełnej listy — trzyma logikę w jednym miejscu. */
export function pageSlice<T>(rows: T[], page: number, pageSize: number): T[] {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);
  return rows.slice((current - 1) * pageSize, current * pageSize);
}
