import { rozbijAdres } from '../../src/utils/adresKlienta.ts';

const proby: Array<[string, string, string, string]> = [
  ['ul. Józefa Paschalisa Jakubowicza 92D', 'ul. Józefa Paschalisa Jakubowicza', '92D', ''],
  ['ul. Kwiatowa 5 m. 12',                  'ul. Kwiatowa', '5', '12'],
  ['ul. Kwiatowa 5 m.12',                   'ul. Kwiatowa', '5', '12'],
  ['3 Maja 5',                              '3 Maja', '5', ''],
  ['3 Maja',                                '3 Maja', '', ''],
  ['Aleja Jana Pawła II 12',                'Aleja Jana Pawła II', '12', ''],
  ['Nowy Świat 6/12',                       'Nowy Świat', '6/12', ''],
  ['ul. Polna 7 lok. 3',                    'ul. Polna', '7', '3'],
  ['Krótka',                                'Krótka', '', ''],
  ['',                                      '', '', ''],
  ['  ul.  Długa   14  ',                   'ul. Długa', '14', ''],
];

let bledy = 0;
for (const [wejscie, ul, nr, lok] of proby) {
  const w = rozbijAdres(wejscie);
  const ok = w.ulica === ul && w.numerBudynku === nr && w.numerLokalu === lok;
  if (!ok) { bledy++; console.log(`🔴 "${wejscie}" → ulica="${w.ulica}" nr="${w.numerBudynku}" lok="${w.numerLokalu}" (oczekiwano "${ul}" / "${nr}" / "${lok}")`); }
  else console.log(`   ok: "${wejscie}"`);
}
console.log(bledy === 0 ? '\nzielono — wszystkie próby przeszły' : `\n🔴 ${bledy} niezgodności`);
if (bledy) Deno.exit(1);
