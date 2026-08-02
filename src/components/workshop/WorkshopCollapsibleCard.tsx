/**
 * Zwijana sekcja panelu.
 *
 * PO CO: Kasa urosła do kilku pełnowymiarowych tabel jedna pod drugą — rozliczenie
 * miesięcy, archiwum raportów, należności, operacje. Każda z nich jest potrzebna, ale
 * nie wszystkie naraz: kasjer patrzy na operacje, właściciel na rozliczenie miesięcy.
 * Zwijanie pozwala zostawić na wierzchu tylko to, czego się właśnie używa.
 *
 * Stan zapamiętujemy w przeglądarce, bo to preferencja konkretnej osoby przy konkretnym
 * stanowisku — a nie ustawienie firmy.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown } from 'lucide-react';

interface Props {
  title: string;
  description?: string;
  /** Klucz zapamiętania stanu; bez niego sekcja zawsze startuje wg `defaultOpen`. */
  storageKey?: string;
  defaultOpen?: boolean;
  /** Treść po prawej stronie nagłówka (np. licznik albo przycisk). */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

export function WorkshopCollapsibleCard({
  title,
  description,
  storageKey,
  defaultOpen = false,
  headerRight,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!storageKey) return;
    const saved = localStorage.getItem(`workshop-section:${storageKey}`);
    if (saved !== null) setOpen(saved === '1');
  }, [storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey) localStorage.setItem(`workshop-section:${storageKey}`, next ? '1' : '0');
      return next;
    });
  };

  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={toggle} className="flex items-center gap-2 text-left flex-1 min-w-0">
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : '-rotate-90'}`} />
            <span className="min-w-0">
              <span className="block font-semibold">{title}</span>
              {description && <span className="block text-xs text-muted-foreground">{description}</span>}
            </span>
          </button>
          {headerRight}
        </div>

        {open && <div className="pt-3">{children}</div>}
      </CardContent>
    </Card>
  );
}
