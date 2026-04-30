// Wspólne źródło prawdy mapowania tygodni UI -> daty.
// MUSI być zgodne z src/lib/utils.ts -> getWeekDates(year).
//
// Reguła: tydzień 1 zaczyna się w PIERWSZY PONIEDZIAŁEK roku.
// Każdy kolejny tydzień to +7 dni. To NIE jest ISO-8601 week.
//
// Przykład 2026:
//   t.13 = 2026-03-30 .. 2026-04-05
//   t.14 = 2026-04-06 .. 2026-04-12
//   t.15 = 2026-04-13 .. 2026-04-19
//   t.16 = 2026-04-20 .. 2026-04-26

export interface UiWeek {
  year: number;
  week: number;
  startISO: string; // YYYY-MM-DD (poniedziałek)
  endISO: string;   // YYYY-MM-DD (niedziela)
}

function firstMondayUTC(year: number): Date {
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** UI tydzień (year, weekNumber) -> zakres dat. */
export function uiWeekRange(year: number, week: number): UiWeek {
  const firstMon = firstMondayUTC(year);
  const start = new Date(firstMon);
  start.setUTCDate(firstMon.getUTCDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { year, week, startISO: fmt(start), endISO: fmt(end) };
}

/** Data (YYYY-MM-DD lub Date) -> UI tydzień (year, weekNumber). */
export function uiWeekFromDate(periodFromIso: string): UiWeek {
  const [y, m, d] = periodFromIso.split("-").map(Number);
  const periodFrom = new Date(Date.UTC(y, m - 1, d));

  let year = y;
  let firstMon = firstMondayUTC(year);
  if (periodFrom < firstMon) {
    year = y - 1;
    firstMon = firstMondayUTC(year);
  }
  const diffDays = Math.round((periodFrom.getTime() - firstMon.getTime()) / 86400000);
  const week = Math.floor(diffDays / 7) + 1;
  return uiWeekRange(year, week);
}

/** Helper: sformatowana etykieta. */
export function uiWeekLabel(year: number, week: number): string {
  const r = uiWeekRange(year, week);
  return `t.${r.week}/${r.year} (${r.startISO} – ${r.endISO})`;
}
