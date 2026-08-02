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
