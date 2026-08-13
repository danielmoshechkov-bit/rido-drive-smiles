/**
 * Sonda — NIP nabywcy na paragonie (Esc 4BH). DRUKUJE jeden paragon 1,00 zł.
 *
 * Sekwencja nigdy nie była uruchomiona na tym urządzeniu, a długość pola przyjąłem
 * z dokumentacji (42 znaki z dopełnieniem). Zły format = drukarka czeka na dane
 * i przestaje odpowiadać, jak przy Esc 04H — dlatego test ma wbudowane odblokowanie:
 * dosyłkę wypełniacza i anulowanie paragonu.
 *
 * Kolejność testu: otwarcie → Esc 4BH → kontrola stanu → pozycja → zamknięcie.
 * Gdy kontrola stanu nie odpowie, przerywamy i sprzątamy.
 *
 *   node scripts/elzab/13-probe-nip.ts
 *   NIP=5223247450 node scripts/elzab/13-probe-nip.ts
 */

import * as cmd from '../../supabase/functions/_shared/elzab/commands.ts';
import { hex } from '../../supabase/functions/_shared/elzab/codec.ts';
import { createNodeTransport } from './transport-node.ts';
import { HOST, PORT, bold, dim, fail, header, ok, warn } from './common.ts';

const NIP = process.env.NIP ?? '5223247450';
const ITEM = 100; // 1,00 zł

header('ELZAB — sonda NIP nabywcy (Esc 4BH)');
const transport = await createNodeTransport({ host: HOST, port: PORT, connectTimeoutMs: 8000 });

async function collect(ms: number): Promise<Uint8Array> {
  const out: number[] = [];
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const chunk = await transport.read(Math.max(1, deadline - Date.now()));
    if (chunk === null) break;
    if (chunk.length) out.push(...chunk);
  }
  return new Uint8Array(out);
}

async function step(label: string, bytes: Uint8Array, waitMs = 2500) {
  await transport.write(bytes);
  const response = await collect(waitMs);
  console.log(`${dim('→')} ${label.padEnd(30)} ${response.length ? hex(response) : dim('(cisza)')}`);
  return response;
}

/** Odblokowanie drukarki, gdy czeka na dalsze bajty pola o nieznanej długości. */
async function recover() {
  warn('odblokowuję drukarkę: dosyłka wypełniacza + anulowanie');
  await transport.write(new Uint8Array(300).fill(0x20));
  await collect(2000);
  await transport.write(cmd.cancelReceipt());
  await collect(5000);
  const clock = await step('kontrola: odczyt zegara', cmd.readClock(), 3000);
  if (clock.length && clock[0] === 0x06) ok('drukarka odpowiada normalnie');
  else fail('drukarka nadal nie odpowiada — wymaga uwagi');
}

try {
  await collect(400);

  const nipBytes = cmd.buyerNip(NIP);
  console.log(bold(`\nNIP „${NIP}" → ${nipBytes.length} B`));
  console.log(dim(`  ${hex(nipBytes)}`));

  const open = await step('otwarcie paragonu', cmd.openReceipt(), 3000);
  if (!open.length || open[0] !== 0x06) {
    fail('drukarka nie otworzyła paragonu — przerywam');
    await recover();
    process.exit(1);
  }

  await step('NIP nabywcy (Esc 4BH)', nipBytes, 3000);
  const status = await step('kontrola stanu (Esc 50H)', cmd.checkStatus(), 4000);

  if (!status.length) {
    fail('brak odpowiedzi po Esc 4BH — format pola nie pasuje');
    await recover();
    console.log(bold('\nWNIOSEK: Esc 4BH w tym formacie nie działa — NIP na paragonie zostaje jako TODO.'));
    process.exit(1);
  }
  if (status[1] !== 0x00) {
    fail(`drukarka zgłosiła status 0x${status[1]?.toString(16)} — sekwencja odrzucona`);
    await step('anulowanie paragonu', cmd.cancelReceipt(), 5000);
    process.exit(1);
  }
  ok('Esc 4BH przyjęte (status 0x00)');

  await step(
    'pozycja 1,00 zł',
    cmd.saleItem({
      name: 'Test NIP nabywcy',
      quantity: 1,
      unit: 'szt',
      unitPriceGrosze: ITEM,
      totalGrosze: ITEM,
      vatLetter: 'A',
      nameLength: 40,
      codepage: 'cp1250',
    }),
    2500,
  );
  await step('kontrola stanu', cmd.checkStatus(), 4000);
  await step('koniec pozycji', cmd.endItems(ITEM), 2500);
  await step('płatność', cmd.payment(1, 'GOTOWKA', ITEM), 2500);
  const close = await step('zamknięcie paragonu', cmd.closeReceipt(), 20000);

  if (close.length && close[0] === 0x06) {
    ok('paragon z NIP wydrukowany — sprawdź, czy NIP jest na papierze');
  } else {
    fail('zamknięcie odrzucone — paragon unieważniony');
  }
} catch (error) {
  fail(String(error));
  await recover();
  process.exitCode = 1;
} finally {
  await transport.close();
}
