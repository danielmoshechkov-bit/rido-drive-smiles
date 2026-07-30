/**
 * Sonda — format linii opisu (Esc 04H) na ELZAB Zeta.
 *
 * Pierwsza próba (31 znaków) zawiesiła drukarkę w oczekiwaniu na dane, czyli pole ma
 * stałą długość. Testujemy kandydatów, każdego w osobnym paragonie, który na końcu
 * jest anulowany — nic nie wchodzi do obrotu.
 *
 *   node scripts/elzab/93-probe-descline.ts
 */

import * as cmd from '../../supabase/functions/_shared/elzab/commands.ts';
import { concat, ESC, hex } from '../../supabase/functions/_shared/elzab/codec.ts';
import { encodeText } from '../../supabase/functions/_shared/elzab/codepages.ts';
import { createNodeTransport } from './transport-node.ts';
import { HOST, PORT, bold, dim, header, ok, warn } from './common.ts';

const text36 = 'Blotnik przedni prawy malowanie i wym'; // dokładnie 36 znaków

const CANDIDATES: Array<{ label: string; bytes: Uint8Array }> = [
  {
    label: 'Esc 04H + 36 znaków',
    bytes: concat([ESC, 0x04], encodeText(text36.padEnd(36).slice(0, 36), 'cp1250')),
  },
  {
    label: 'Esc 04H + nr linii (1) + 36 znaków',
    bytes: concat([ESC, 0x04, 0x01], encodeText(text36.padEnd(36).slice(0, 36), 'cp1250')),
  },
];

header('ELZAB — sonda linii opisu (Esc 04H)');
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
  console.log(`${dim('→')} ${label.padEnd(34)} ${response.length ? hex(response) : dim('(cisza)')}`);
  return response;
}

try {
  await collect(500);

  for (const candidate of CANDIDATES) {
    console.log(bold(`\n${candidate.label} (${candidate.bytes.length} B)`));
    console.log(dim(`  ${hex(candidate.bytes)}`));

    const open = await step('otwarcie paragonu', cmd.openReceipt(), 3000);
    if (!open.length || open[0] !== 0x06) {
      warn('drukarka nie otworzyła paragonu — pomijam ten wariant');
      await step('anulowanie', cmd.cancelReceipt(), 4000);
      continue;
    }

    await step('linia opisu', candidate.bytes, 2500);
    const status = await step('kontrola stanu (Esc 50H)', cmd.checkStatus(), 4000);

    if (status.length && status[0] === 0x06 && status[1] === 0x00) {
      ok(`${candidate.label}: drukarka przyjęła sekwencję (status 0x00)`);
    } else {
      warn(`${candidate.label}: brak potwierdzenia — format nie pasuje`);
    }

    await step('anulowanie paragonu', cmd.cancelReceipt(), 6000);
    await collect(1500); // drukarka kończy wydruk #ANULOWANY#
  }
} finally {
  await transport.close();
}
