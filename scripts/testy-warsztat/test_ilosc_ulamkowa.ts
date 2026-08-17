import { parsujLiczbe, formatujIlosc } from '../../src/utils/workshopOrderTotals.ts';
const proby: Array<[unknown, number]> = [
  ['1,5', 1.5], ['1.5', 1.5], ['2', 2], [2, 2], ['0,25', 0.25],
  ['', 0], [null, 0], [undefined, 0], ['abc', 0], ['1 234,5', 1234.5], ['  3,75  ', 3.75],
];
let b = 0;
for (const [we, ocz] of proby) {
  const w = parsujLiczbe(we);
  if (w !== ocz) { b++; console.log(`🔴 parsujLiczbe(${JSON.stringify(we)}) = ${w}, oczekiwano ${ocz}`); }
}
const fmt: Array<[unknown, string]> = [[2, '2'], [1.5, '1,5'], [0.25, '0,25'], ['1,5', '1,5'], [1, '1']];
for (const [we, ocz] of fmt) {
  const w = formatujIlosc(we);
  if (w !== ocz) { b++; console.log(`🔴 formatujIlosc(${JSON.stringify(we)}) = "${w}", oczekiwano "${ocz}"`); }
}
console.log(b === 0 ? 'zielono — parser i format działają' : `🔴 ${b} niezgodności`);
if (b) Deno.exit(1);
