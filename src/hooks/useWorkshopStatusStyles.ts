import { useMemo, useCallback } from 'react';
import { useWorkshopStatuses, useWorkshopStatusSettings } from '@/hooks/useWorkshop';
import { getStatusStyle, TONE_HEX, type StatusTone } from '@/utils/workshopStatusStyle';

export type ResolvedStatusStyle = {
  tone: StatusTone;
  /** Klasy Tailwind badge'a (paleta Zalecane). W trybie Ręcznym nadpisywane przez badgeStyle. */
  badgeClass: string;
  /** Inline style dla trybu Ręcznego (hex z workshop_order_statuses.color). */
  badgeStyle?: { backgroundColor: string; color: string };
  /** Kolor kropki w dropdownie — ZAWSZE ten sam co badge (jedno źródło). */
  dotColor: string;
  /** Tło/hover wiersza listy — zawsze z palety (nie ruszamy pasków wierszy). */
  row: string;
  border: string;
};

/** Czytelny kolor tekstu na tle hexa (prosty próg luminancji). */
function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#111827' : '#ffffff';
}

/**
 * Kolory statusów zleceń dla panelu wewnętrznego (admin/pracownicy).
 * - color_mode 'recommended' (default): paleta Zalecane z workshopStatusStyle.
 * - color_mode 'custom': hex per status z workshop_order_statuses.color
 *   (edytowalny w Ustawienia > Statusy zleceń); brak hexa -> fallback na paletę.
 * Portal klienta celowo NIE korzysta z tego hooka (publiczny link, brak statusów procesu).
 */
export function useWorkshopStatusStyles(providerId: string | undefined) {
  const { data: statuses = [] } = useWorkshopStatuses(providerId);
  const { data: settings } = useWorkshopStatusSettings(providerId);
  const customMode = (settings as any)?.color_mode === 'custom';

  const hexByName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of statuses as any[]) {
      if (s?.name && s?.color) map[String(s.name).trim()] = s.color;
    }
    return map;
  }, [statuses]);

  const getStyle = useCallback((name?: string | null): ResolvedStatusStyle => {
    const base = getStatusStyle(name);
    const hex = customMode && name ? hexByName[name.trim()] : undefined;
    if (hex) {
      return {
        tone: base.tone,
        badgeClass: base.badge,
        badgeStyle: { backgroundColor: hex, color: contrastText(hex) },
        dotColor: hex,
        row: base.row,
        border: base.border,
      };
    }
    return {
      tone: base.tone,
      badgeClass: base.badge,
      badgeStyle: undefined,
      dotColor: TONE_HEX[base.tone],
      row: base.row,
      border: base.border,
    };
  }, [customMode, hexByName]);

  return { getStyle, customMode };
}
