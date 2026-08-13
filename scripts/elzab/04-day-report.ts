/**
 * Test 4 — raport dobowy (DRUKUJE). W trybie szkoleniowym raport jest niefiskalny.
 * Drukarka blokuje sprzedaż, jeśli od ostatniego raportu minęły 48 h.
 *
 *   node scripts/elzab/04-day-report.ts
 */

import { toUserMessage } from '../../supabase/functions/_shared/elzab/errors.ts';
import { connect, dim, fail, header, ok } from './common.ts';

header('ELZAB — raport dobowy (Esc 25H)');

let client;
const started = Date.now();
try {
  client = await connect();
  await client.drain();

  const clock = await client.getClock();
  console.log(dim(`   zegar drukarki: ${clock.iso}`));

  await client.printDayReport();
  ok(`raport dobowy wykonany w ${Date.now() - started} ms`);
} catch (error) {
  fail(toUserMessage(error));
  process.exitCode = 1;
} finally {
  await client?.close();
}
