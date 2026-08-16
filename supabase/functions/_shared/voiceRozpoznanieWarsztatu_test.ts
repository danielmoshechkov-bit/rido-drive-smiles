// ============================================================================
// voiceRozpoznanieWarsztatu_test.ts
//
// To jest zmiana w DZIAŁAJĄCEJ ścieżce — dziś agent ma 7/8 scenariuszy.
// Dlatego testy zaczynają się od tego, co MA SIĘ NIE ZMIENIĆ: rozmowa
// na numerze testowym, którego nie ma jeszcze w tabeli numerów, ma dalej
// trafiać w gałąź `agent_id` i dostawać ten sam warsztat.
// ============================================================================
import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { normalizujNumer, numerDocelowy, rozpoznajWarsztat } from "./voiceRozpoznanieWarsztatu.ts";

const WARSZTAT_TESTOWY = "11111111-1111-1111-1111-111111111111";
const WARSZTAT_KOWALSKI = "22222222-2222-2222-2222-222222222222";
const NASZ = "48221015896";

const tabela = (mapa: Record<string, string>) => (n: string) => Promise.resolve(mapa[n] ?? null);
const agent = (id: string | null) => () => Promise.resolve(id);

Deno.test("WYCIEK: nieznany numer NIE dostaje snapshotu warsztatu domyslnego", async () => {
  // 16.08 sprawdzone na produkcji: wywolanie z numerem spoza tabeli dostawalo
  // pelny snapshot jedynego warsztatu — z lista klientow (imie + telefon).
  // Agent jest WSPOLNY dla wszystkich warsztatow, wiec agent_id nie odroznia
  // niczego i nie ma z czego wyprowadzic wlasciwego warsztatu.
  const r = await rozpoznajWarsztat({ called_number: "+48221009999", agent_id: "agent_x" }, tabela({}), agent(WARSZTAT_TESTOWY));
  assertEquals(r.providerId, null, "nieznany numer nie moze dostac CUDZEGO warsztatu");
  assertEquals(r.droga, "nieznany_numer");
  assertEquals(r.numer, "48221009999", "numer ma zostac w wyniku — to slad do zbadania");
});

Deno.test("fallback NIE jest wolany, gdy numer jest obecny ale nieznany", async () => {
  let wolan = 0;
  await rozpoznajWarsztat({ called_number: "48221009999" }, tabela({}), () => { wolan++; return Promise.resolve(WARSZTAT_TESTOWY); });
  assertEquals(wolan, 0, "samo wywolanie fallbacku juz jest bledem — snapshot bylby cudzy");
});

Deno.test("REGRESJA: brak called_number w ogole — tak wygladaja dzisiejsze rozmowy", async () => {
  const r = await rozpoznajWarsztat({ agent_id: "agent_x" }, tabela({ [NASZ]: WARSZTAT_KOWALSKI }), agent(WARSZTAT_TESTOWY));
  assertEquals(r.providerId, WARSZTAT_TESTOWY);
  assertEquals(r.droga, "agent_id");
  assertEquals(r.numer, null);
});

Deno.test("po dodaniu numeru do tabeli wygrywa numer, nie agent", async () => {
  const r = await rozpoznajWarsztat(
    { called_number: "+48221015896", agent_id: "agent_x" },
    tabela({ [NASZ]: WARSZTAT_TESTOWY }),
    agent(WARSZTAT_TESTOWY),
  );
  assertEquals(r.providerId, WARSZTAT_TESTOWY);   // TEN SAM warsztat co przez fallback
  assertEquals(r.droga, "numer");
});

Deno.test("dwa numery to dwa warsztaty — o to w tym wszystkim chodzi", async () => {
  const mapa = { [NASZ]: WARSZTAT_TESTOWY, "48221009999": WARSZTAT_KOWALSKI };
  assertEquals((await rozpoznajWarsztat({ called_number: "221009999" }, tabela(mapa), agent(null))).providerId, WARSZTAT_KOWALSKI);
  assertEquals((await rozpoznajWarsztat({ called_number: "221015896" }, tabela(mapa), agent(null))).providerId, WARSZTAT_TESTOWY);
});

Deno.test("nie znamy ani numeru, ani agenta — pusty snapshot, nie wyjatek", async () => {
  const r = await rozpoznajWarsztat({ called_number: "48500600700" }, tabela({}), agent(null));
  assertEquals(r.providerId, null);
  assertEquals(r.droga, "nieznany_numer");
  assertEquals(r.numer, "48500600700");   // numer znamy, warsztatu nie — slad do zbadania
});

Deno.test("numer w trakcie aktywacji tez nie dostaje cudzego snapshotu", async () => {
  // Zapytanie filtruje po status='aktywny', wiec numer w trakcie aktywacji
  // nie trafia. To ma dac pusty snapshot, a nie snapshot innego warsztatu.
  const r = await rozpoznajWarsztat({ called_number: NASZ, agent_id: "agent_x" }, tabela({}), agent(WARSZTAT_TESTOWY));
  assertEquals(r.droga, "nieznany_numer");
  assertEquals(r.providerId, null);
});

Deno.test("normalizacja: wszystkie postaci daja jeden zapis", () => {
  for (const wariant of ["+48 22 101 58 96", "0048221015896", "48221015896", "221015896", "022 101 58 96", "+48-22-101-58-96"]) {
    assertEquals(normalizujNumer(wariant), NASZ, `nie znormalizowano: ${wariant}`);
  }
});

Deno.test("normalizacja odrzuca smieci zamiast zwracac cos podobnego", () => {
  for (const zly of ["", null, undefined, "anonymous", "12345", "restricted"]) {
    assertEquals(normalizujNumer(zly), null, `przepuszczone: ${String(zly)}`);
  }
});

Deno.test("numer docelowy czytany z kazdego znanego miejsca w ladunku", () => {
  assertEquals(numerDocelowy({ called_number: "221015896" }), NASZ);
  assertEquals(numerDocelowy({ agent_number: "+48221015896" }), NASZ);
  assertEquals(numerDocelowy({ to_number: "0048221015896" }), NASZ);
  assertEquals(numerDocelowy({ call: { to_number: "221015896" } }), NASZ);
  assertEquals(numerDocelowy({ conversation_initiation_client_data: { called_number: "221015896" } }), NASZ);
  assertEquals(numerDocelowy({}), null);
  assertEquals(numerDocelowy(null), null);
});

Deno.test("numer dzwoniacego NIE jest brany za numer docelowy", () => {
  // Gdyby caller_id trafil do rozpoznania, kazdy dzwoniacy z przypadkowego
  // numeru mogl by trafic do cudzego warsztatu.
  assertEquals(numerDocelowy({ caller_id: "48500600700", from_number: "48500600700" }), null);
});

Deno.test("fallback nie jest wolany, gdy numer trafil — zero zbednych odczytow", async () => {
  let wolan = 0;
  await rozpoznajWarsztat({ called_number: NASZ }, tabela({ [NASZ]: WARSZTAT_TESTOWY }), () => { wolan++; return Promise.resolve(null); });
  assertEquals(wolan, 0);
});
