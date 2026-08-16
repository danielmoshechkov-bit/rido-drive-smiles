// Jedno źródło prawdy dla godzin pracy usługodawcy.
// Zapisywane w service_providers.working_hours (jsonb) i mirrorowane do workshop_settings.working_hours.

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DayHours {
  closed: boolean;
  open: string;  // "08:00"
  close: string; // "16:00"
}

export type WorkingHours = Record<DayKey, DayHours>;

export const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Poniedziałek',
  tue: 'Wtorek',
  wed: 'Środa',
  thu: 'Czwartek',
  fri: 'Piątek',
  sat: 'Sobota',
  sun: 'Niedziela',
};

export const DAY_SHORT: Record<DayKey, string> = {
  mon: 'Pn', tue: 'Wt', wed: 'Śr', thu: 'Cz', fri: 'Pt', sat: 'So', sun: 'Nd',
};

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  mon: { closed: false, open: '08:00', close: '16:00' },
  tue: { closed: false, open: '08:00', close: '16:00' },
  wed: { closed: false, open: '08:00', close: '16:00' },
  thu: { closed: false, open: '08:00', close: '16:00' },
  fri: { closed: false, open: '08:00', close: '16:00' },
  sat: { closed: true, open: '09:00', close: '13:00' },
  sun: { closed: true, open: '09:00', close: '13:00' },
};

export function normalizeWorkingHours(raw: any): WorkingHours {
  const out = {} as WorkingHours;
  for (const d of DAY_ORDER) {
    const v = raw?.[d];
    out[d] = {
      closed: typeof v?.closed === 'boolean' ? v.closed : DEFAULT_WORKING_HOURS[d].closed,
      open: typeof v?.open === 'string' ? v.open : DEFAULT_WORKING_HOURS[d].open,
      close: typeof v?.close === 'string' ? v.close : DEFAULT_WORKING_HOURS[d].close,
    };
  }
  return out;
}

export function hasWorkingHours(raw: any): boolean {
  return !!raw && typeof raw === 'object' && DAY_ORDER.some(d => raw[d]);
}

const JS_DAY_TO_KEY: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Status otwarcia na teraz. */
export function getOpenStatus(raw: any, now = new Date()): { open: boolean; label: string } {
  if (!hasWorkingHours(raw)) return { open: false, label: '' };
  const hours = normalizeWorkingHours(raw);
  const today = hours[JS_DAY_TO_KEY[now.getDay()]];
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  if (!today.closed && minutesNow >= toMin(today.open) && minutesNow < toMin(today.close)) {
    return { open: true, label: `Otwarte teraz · do ${today.close}` };
  }
  if (!today.closed && minutesNow < toMin(today.open)) {
    return { open: false, label: `Zamknięte · otwiera ${today.open}` };
  }
  // szukamy najbliższego otwartego dnia
  for (let i = 1; i <= 7; i++) {
    const key = JS_DAY_TO_KEY[(now.getDay() + i) % 7];
    if (!hours[key].closed) {
      return { open: false, label: `Zamknięte · ${DAY_SHORT[key]} ${hours[key].open}` };
    }
  }
  return { open: false, label: 'Zamknięte' };
}

// ---------------------------------------------------------------------------
// Konwersja między dwoma formatami tej samej informacji
// ---------------------------------------------------------------------------
//
// 🔴 POWÓD (16.08.2026). Godziny pracy żyją w dwóch kolumnach, w DWÓCH RÓŻNYCH
// kształtach, i mirror między nimi robił się bez konwersji:
//
//   `service_providers.working_hours`  → OBIEKT { mon: {closed, open, close}, … }
//   `workshop_settings.working_hours`  → TABLICA [ {open, from, to} × 7 ], Pn→Nd
//
// „Moje usługi" zapisywały obiekt do OBU kolumn. Formularz rezerwacji
// (`ServiceBookingModal`) czyta tę drugą i miał `if (!Array.isArray(wh))
// return []` — więc po każdym zapisie godzin z „Moich usług" klient końcowy
// widział **zero wolnych terminów**, bez błędu i bez ostrzeżenia. Warsztat
// nie miał jak się dowiedzieć, że traci rezerwacje.

/** Kształt jednego dnia w tabeli `workshop_settings`. */
export interface DzienTablicowy {
  open: boolean;
  from: string;
  to: string;
}

/** Obiekt (service_providers) → tablica Pn…Nd (workshop_settings). */
export function naFormatWarsztatu(godziny: WorkingHours): DzienTablicowy[] {
  return DAY_ORDER.map((d) => ({
    open: !godziny[d].closed,
    from: godziny[d].open,
    to: godziny[d].close,
  }));
}

/** Tablica Pn…Nd (workshop_settings) → obiekt (service_providers). */
export function zFormatuWarsztatu(tablica: unknown): WorkingHours {
  if (!Array.isArray(tablica)) return normalizeWorkingHours(tablica);
  const out = {} as WorkingHours;
  DAY_ORDER.forEach((d, i) => {
    const v = tablica[i] as Partial<DzienTablicowy> | undefined;
    out[d] = {
      closed: !(v?.open ?? !DEFAULT_WORKING_HOURS[d].closed),
      open: typeof v?.from === 'string' ? v.from : DEFAULT_WORKING_HOURS[d].open,
      close: typeof v?.to === 'string' ? v.to : DEFAULT_WORKING_HOURS[d].close,
    };
  });
  return out;
}

/**
 * Przyjmuje JEDEN Z DWÓCH kształtów i zawsze zwraca tablicę warsztatową.
 *
 * Używane przez czytelników, żeby dane zapisane wcześniej w złym kształcie
 * nadal działały. Naprawa samych zapisów nie wystarcza — w bazie siedzą już
 * wiersze zapisane obiektem i nikt ich nie przepisze.
 */
export function jakoFormatWarsztatu(surowe: unknown): DzienTablicowy[] {
  if (Array.isArray(surowe)) return surowe as DzienTablicowy[];
  if (surowe && typeof surowe === 'object') return naFormatWarsztatu(normalizeWorkingHours(surowe));
  return [];
}
