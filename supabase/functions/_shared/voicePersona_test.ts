import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { PERSONA_WARSZTATU, wybierzKonfiguracjeWarsztatu } from "./voicePersona.ts";

Deno.test("jeden wiersz warsztatu — wybrany", () => {
  const w = [{ persona_key: PERSONA_WARSZTATU, is_active: true }];
  assertEquals(wybierzKonfiguracjeWarsztatu(w)?.is_active, true);
});

Deno.test("brak wierszy to null, a nie wyjatek", () => {
  assertEquals(wybierzKonfiguracjeWarsztatu([]), null);
  assertEquals(wybierzKonfiguracjeWarsztatu(null), null);
  assertEquals(wybierzKonfiguracjeWarsztatu(undefined), null);
});

// TO JEST TEN BŁĄD. Drugi wiersz z `sales_agent` i `is_active: false` nie może
// przesłonić włączonego agenta warsztatu — niezależnie od tego, w jakiej
// kolejności baza odda wiersze.
Deno.test("drugi wiersz innej persony nie wylacza agenta warsztatu", () => {
  const a = [
    { persona_key: "sales_agent", is_active: false },
    { persona_key: PERSONA_WARSZTATU, is_active: true },
  ];
  const b = [...a].reverse();
  assertEquals(wybierzKonfiguracjeWarsztatu(a)?.is_active, true);
  assertEquals(wybierzKonfiguracjeWarsztatu(b)?.is_active, true);
});

// ZAWĘŻENIE NIE MOŻE ODEBRAĆ OBSŁUGI: warsztat z inną personą i bez wiersza
// warsztatowego ma dostać SWOJĄ konfigurację, a nie „brak konfiguracji".
Deno.test("bez persony warsztatu wybor jest deterministyczny, nie pusty", () => {
  const a = [
    { persona_key: "service_scheduler", is_active: true },
    { persona_key: "realestate_acquirer", is_active: false },
  ];
  const b = [...a].reverse();
  assertEquals(wybierzKonfiguracjeWarsztatu(a)?.persona_key, "realestate_acquirer");
  assertEquals(wybierzKonfiguracjeWarsztatu(b)?.persona_key, "realestate_acquirer");
});

Deno.test("brakujaca persona_key nie wywraca wyboru", () => {
  const w = [{ is_active: false }, { persona_key: PERSONA_WARSZTATU, is_active: true }];
  assertEquals(wybierzKonfiguracjeWarsztatu(w)?.is_active, true);
});
