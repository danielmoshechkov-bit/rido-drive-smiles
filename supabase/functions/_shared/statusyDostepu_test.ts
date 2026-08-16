import { assertEquals, assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { STATUSY_Z_DOSTEPEM, wolnoPracowac } from './statusyDostepu.ts';

const MIGRACJA_G4 = 'supabase/migrations/20260815120000_gating_g4_bramka_zapisu.sql';
const MIGRACJA_G6 = 'supabase/migrations/20260815140000_gating_g6_karencja_do_read_only.sql';
const HOOK = 'src/hooks/useSubscriptionAccess.ts';

Deno.test('tabela decyzji: przepuszcza dokładnie trzy statusy', () => {
  assertEquals(wolnoPracowac('active'), true);
  assertEquals(wolnoPracowac('trialing'), true);
  assertEquals(wolnoPracowac('past_due'), true);
  assertEquals(wolnoPracowac('read_only'), false);
  assertEquals(wolnoPracowac('canceled'), false);
  assertEquals(wolnoPracowac('expired'), false);
});

Deno.test('nieznany status nie daje dostępu', () => {
  assertEquals(wolnoPracowac('paused'), false);
  assertEquals(wolnoPracowac(''), false);
  assertEquals(wolnoPracowac(null), false);
  assertEquals(wolnoPracowac(undefined), false);
});

/**
 * Sedno G7: trzy bramki mają mówić to samo.
 *
 * Test czyta migrację i wyciąga listę z `RETURN v_status IN (...)`. Gdyby ktoś
 * dopisał status po jednej stronie, a zapomniał po drugiej, CI to złapie —
 * a bez tego rozjazd wyszedłby dopiero u klienta, jako odblokowany ekran
 * z odmową przy zapisie.
 */
Deno.test('SQL moze_pracowac przepuszcza te same statusy co TypeScript', async () => {
  const sql = await Deno.readTextFile(MIGRACJA_G4);
  const dopasowanie = sql.match(/RETURN\s+v_status\s+IN\s*\(([^)]*)\)/i);
  assert(dopasowanie, 'nie znalazłem listy statusów w migracji G4');

  const zSql = dopasowanie[1]
    .split(',')
    .map((x) => x.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)
    .sort();

  assertEquals(zSql, [...STATUSY_Z_DOSTEPEM].sort());
});

/** Hook czyta te same statusy — sprawdzamy, że nie zgubił żadnego z gałęzi. */
Deno.test('hook obsługuje każdy status z tabeli decyzji', async () => {
  const ts = await Deno.readTextFile(HOOK);
  for (const status of STATUSY_Z_DOSTEPEM) {
    assert(ts.includes(`case '${status}'`), `hook nie obsługuje statusu ${status}`);
  }
  // Statusy odbierające dostęp też muszą mieć własną gałąź: wpadnięcie do
  // `default` dałoby poprawny wynik, ale zły POWÓD, a powód decyduje o tym,
  // czy klient zobaczy ekran sprzedażowy, czy komunikat o nieudanej płatności.
  for (const status of ['read_only', 'canceled', 'expired']) {
    assert(ts.includes(`case '${status}'`), `hook nie obsługuje statusu ${status}`);
  }
});

/**
 * Eksport ma działać zawsze — to warunek postawiony wprost. Bramka z G4 nie
 * może objąć SELECT-a, bo odczyt jest tym, czym klient odzyskuje swoje dane.
 */
Deno.test('G4 nie zakłada polityki na SELECT', async () => {
  const sql = await Deno.readTextFile(MIGRACJA_G4);
  const polityki = sql.match(/FOR\s+(INSERT|UPDATE|DELETE|SELECT|ALL)/gi) ?? [];
  const zapisowe = polityki.map((p) => p.split(/\s+/)[1].toUpperCase());

  // W G4 SELECT pojawia się tylko w politykach WIDOCZNOŚCI publicznej
  // (service_providers, services, provider_service_categories) — nigdy na
  // tabelach warsztatowych, i nigdy jako RESTRICTIVE.
  assert(!zapisowe.includes('ALL'), 'FOR ALL objęłoby także odczyt');

  const restrykcyjne = sql.match(/AS RESTRICTIVE FOR (\w+)/gi) ?? [];
  for (const r of restrykcyjne) {
    const cmd = r.split(/\s+/).pop()!.toUpperCase();
    assert(cmd !== 'SELECT', 'polityka RESTRICTIVE na SELECT zablokowałaby eksport');
  }
});

/** Karencja musi przepuszczać — inaczej odrzucona karta blokuje w tej samej sekundzie. */
Deno.test('past_due ma dostęp w obu bramkach', async () => {
  assertEquals(wolnoPracowac('past_due'), true);
  const sql = await Deno.readTextFile(MIGRACJA_G4);
  assert(/'past_due'/.test(sql), 'G4 nie wymienia past_due wśród statusów z dostępem');
});

/** Zejście z karencji ma istnieć — bez zadania past_due jest stanem wiecznym. */
Deno.test('G6 przestawia past_due na read_only, nie odwrotnie', async () => {
  const sql = await Deno.readTextFile(MIGRACJA_G6);
  assert(/SET status = 'read_only'/.test(sql), 'brak przestawienia na read_only');
  assert(/WHERE status = 'past_due'/.test(sql), 'zadanie nie zawęża się do past_due');
  assert(
    /IF v_karencja IS NULL THEN[\s\S]{0,200}RETURN 0/.test(sql),
    'brak zabezpieczenia na brak konfiguracji karencji',
  );
});
