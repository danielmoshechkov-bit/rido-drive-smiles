// Regression test: pilnuje, że mapowanie tygodni jest spójne z UI
// (src/lib/utils.ts -> getWeekDates).
//
// Jeśli ten test pęknie, znaczy że ktoś zmienił logikę tygodni w jednym
// z dwóch miejsc i powstał rozjazd między edge function a frontem.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { uiWeekRange, uiWeekFromDate, uiWeekLabel } from "./weekMapping.ts";

Deno.test("UI week 2026 — Flame Partner reference (matches getWeekDates frontend)", () => {
  // Frontend src/lib/utils.ts -> getWeekDates(2026):
  //   t.13 = 2026-03-30 .. 2026-04-05
  //   t.14 = 2026-04-06 .. 2026-04-12
  //   t.15 = 2026-04-13 .. 2026-04-19
  //   t.16 = 2026-04-20 .. 2026-04-26
  assertEquals(uiWeekRange(2026, 13), { year: 2026, week: 13, startISO: "2026-03-30", endISO: "2026-04-05" });
  assertEquals(uiWeekRange(2026, 14), { year: 2026, week: 14, startISO: "2026-04-06", endISO: "2026-04-12" });
  assertEquals(uiWeekRange(2026, 15), { year: 2026, week: 15, startISO: "2026-04-13", endISO: "2026-04-19" });
  assertEquals(uiWeekRange(2026, 16), { year: 2026, week: 16, startISO: "2026-04-20", endISO: "2026-04-26" });
});

Deno.test("UI week 2026 — pierwszy poniedziałek = tydzień 1", () => {
  // 1 stycznia 2026 to czwartek; pierwszy poniedziałek = 5 stycznia.
  assertEquals(uiWeekRange(2026, 1).startISO, "2026-01-05");
});

Deno.test("uiWeekFromDate — odwrotne mapowanie zgadza się z uiWeekRange", () => {
  for (let w = 1; w <= 30; w++) {
    const range = uiWeekRange(2026, w);
    const back = uiWeekFromDate(range.startISO);
    assertEquals(back.week, w, `week ${w}: startISO=${range.startISO}`);
    assertEquals(back.year, 2026);
  }
});

Deno.test("uiWeekFromDate — środek i koniec tygodnia również wracają do tego samego tygodnia", () => {
  // środek t.16/2026
  assertEquals(uiWeekFromDate("2026-04-23").week, 16);
  // koniec t.16/2026
  assertEquals(uiWeekFromDate("2026-04-26").week, 16);
  // początek t.13/2026
  assertEquals(uiWeekFromDate("2026-03-30").week, 13);
});

Deno.test("uiWeekLabel format", () => {
  assertEquals(uiWeekLabel(2026, 16), "t.16/2026 (2026-04-20 – 2026-04-26)");
});

Deno.test("Cross-year: data przed pierwszym poniedziałkiem należy do poprzedniego roku", () => {
  // 2026-01-04 (niedziela) jest jeszcze w ostatnim tygodniu 2025
  const r = uiWeekFromDate("2026-01-04");
  assertEquals(r.year, 2025);
});
