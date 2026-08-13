/**
 * Test 1 — healthcheck drukarki (nic nie drukuje).
 * Uruchomienie:  node scripts/elzab/01-healthcheck.ts
 */

import * as cmd from '../../supabase/functions/_shared/elzab/commands.ts';
import { hex } from '../../supabase/functions/_shared/elzab/codec.ts';
import { toUserMessage } from '../../supabase/functions/_shared/elzab/errors.ts';
import { connect, fail, header, ok, warn } from './common.ts';

const started = Date.now();
header('ELZAB — healthcheck (odczyt zegara, identyfikacja, status)');

let client;
try {
  client = await connect();
  ok(`połączono w ${Date.now() - started} ms`);
  await client.drain();

  const clock = await client.getClock();
  ok(`zegar drukarki: ${clock.iso}`);
  const drift = Math.abs(Date.now() - new Date(clock.iso).getTime()) / 60000;
  if (drift > 5) warn(`zegar drukarki różni się od komputera o ~${Math.round(drift)} min`);

  // Identyfikacja bywa odrzucana (NAK) na Zeta — dlatego healthcheckiem jest zegar.
  const ident = await client.send('identyfikacja', cmd.identify(), 2, { allowNak: true });
  if (ident.ack) {
    ok(`identyfikacja: NT=${ident.payload[0]} NW=${ident.payload[1]} (${hex(ident.payload)})`);
  } else {
    warn('identyfikacja (Esc F6H): NAK — normalne dla części firmware, pomijamy');
  }

  const status = await client.readStatusSafe();
  ok(`status: 1=${fmt(status.status1)} 2=${fmt(status.status2)}`);

  const last = await client.getLastReceiptNumber();
  ok(`nr ostatniego paragonu: ${last.value ?? '(nieodczytany)'} [surowe: ${last.raw || 'brak'}]`);

  console.log(`\n${'✓'} healthcheck zakończony w ${Date.now() - started} ms`);
} catch (error) {
  fail(toUserMessage(error));
  console.error(error);
  process.exitCode = 1;
} finally {
  await client?.close();
}

function fmt(value?: number) {
  return value === undefined ? '—' : `0x${value.toString(16).padStart(2, '0')}`;
}
