import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * useUrlFilters — generyczny hook do trzymania stanu filtrów w URL.
 *
 * Kontrakt (A4 z planu):
 *  - stan filtrów żyje w ?query params, nie w Reactcie
 *  - zmiana filtra → replace (nie zaśmieca historii)
 *  - zmiana lokalizacji/typu → push (użytkownik może cofnąć)
 *  - wejście na URL z parametrami → filtry odtwarzają się w UI od razu
 *  - łatwe udostępnianie linku
 *
 * Schema definiuje jak każde pole serializuje się do stringa i z powrotem.
 * Puste/domyślne wartości są usuwane z URL (żeby /nieruchomosci wyglądało
 * czysto zanim użytkownik zacznie filtrować).
 *
 * Ten hook to fundament dla A10/D1 (zapisane wyszukiwania — zapisują ten
 * sam obiekt co URL) i B2 (giełda aut).
 */

export type UrlFilterCodec<T> = {
  parse: (raw: string | null) => T;
  serialize: (value: T) => string | null; // null → usuń z URL
};

export type UrlFilterSchema<T> = {
  [K in keyof T]: UrlFilterCodec<T[K]>;
};

// ---------- Gotowe kodeki ----------

export const stringCodec = (defaultValue = ''): UrlFilterCodec<string> => ({
  parse: (raw) => raw ?? defaultValue,
  serialize: (v) => (v && v !== defaultValue ? v : null),
});

export const numberCodec = (defaultValue?: number): UrlFilterCodec<number | undefined> => ({
  parse: (raw) => {
    if (raw === null || raw === '') return defaultValue;
    const n = Number(raw);
    return Number.isFinite(n) ? n : defaultValue;
  },
  serialize: (v) => (v === undefined || v === null || v === defaultValue ? null : String(v)),
});

export const boolCodec = (defaultValue = false): UrlFilterCodec<boolean> => ({
  parse: (raw) => (raw === '1' || raw === 'true' ? true : defaultValue),
  serialize: (v) => (v && v !== defaultValue ? '1' : null),
});

/** multi-select jako "a,b,c" */
export const stringArrayCodec = (): UrlFilterCodec<string[]> => ({
  parse: (raw) => (raw ? raw.split(',').filter(Boolean) : []),
  serialize: (v) => (v && v.length ? v.join(',') : null),
});

/** enum ograniczony do listy dozwolonych wartości */
export const enumCodec = <T extends string>(allowed: readonly T[], defaultValue: T): UrlFilterCodec<T> => ({
  parse: (raw) => ((raw && (allowed as readonly string[]).includes(raw)) ? (raw as T) : defaultValue),
  serialize: (v) => (v && v !== defaultValue ? v : null),
});

// ---------- Hook ----------

export interface UseUrlFiltersOptions {
  /** Klucze, których zmiana powinna być `push` (nowy wpis w historii) zamiast `replace`. */
  historyPushKeys?: string[];
}

export function useUrlFilters<T extends Record<string, unknown>>(
  schema: UrlFilterSchema<T>,
  options: UseUrlFiltersOptions = {},
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const pushKeys = new Set(options.historyPushKeys ?? []);

  const filters = useMemo(() => {
    const result = {} as T;
    for (const key in schema) {
      result[key] = schema[key].parse(searchParams.get(key));
    }
    return result;
  }, [searchParams, schema]);

  const setFilters = useCallback(
    (patch: Partial<T>) => {
      const shouldPush = Object.keys(patch).some((k) => pushKeys.has(k));
      const next = new URLSearchParams(searchParams);
      (Object.keys(patch) as Array<Extract<keyof T, string>>).forEach((key) => {
        const codec = schema[key];
        if (!codec) return;
        const serialized = codec.serialize(patch[key] as T[typeof key]);
        if (serialized === null || serialized === undefined || serialized === '') {
          next.delete(key);
        } else {
          next.set(key, serialized);
        }
      });
      setSearchParams(next, { replace: !shouldPush });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams, setSearchParams],
  );

  const resetFilters = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    for (const key in schema) next.delete(key);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, schema]);

  const activeCount = useMemo(() => {
    let n = 0;
    for (const key in schema) {
      const raw = searchParams.get(key);
      if (raw !== null && raw !== '') n++;
    }
    return n;
  }, [searchParams, schema]);

  return { filters, setFilters, resetFilters, activeCount, searchParams };
}
