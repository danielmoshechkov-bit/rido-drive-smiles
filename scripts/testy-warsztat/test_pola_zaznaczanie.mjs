// KAŻDE pole w module warsztatu ma zaznaczać treść przy kliknięciu.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const pliki = (d) => readdirSync(d).flatMap((w) => {
  const s = join(d, w);
  return statSync(s).isDirectory() ? pliki(s) : (extname(s) === '.tsx' ? [s] : []);
});
const elementy = (t) => { const o = []; let i = 0;
  while (true) { i = t.indexOf('<Input', i); if (i < 0) break; const k = t.indexOf('/>', i); if (k < 0) break; o.push(t.slice(i, k + 2)); i = k + 2; } return o; };
let brak = [], podw = [], razem = 0;
for (const f of pliki('src/components/workshop')) {
  for (const el of elementy(readFileSync(f, 'utf8'))) {
    // Pola godziny/daty pomijamy: przeglądarka renderuje je jako segmenty
    // (gg:mm), nie ma w nich tekstu do zaznaczenia, a `select()` i tak nic
    // tam nie robi. Reguła dotyczy pól, w których wpisuje się treść.
    if (/type="(time|date|datetime-local|color|checkbox|radio|file)"/.test(el)) continue;
    razem++;
    const n = (el.match(/onFocus/g) || []).length;
    if (n === 0) brak.push(f);
    if (n > 1) podw.push(f);
  }
}
if (brak.length || podw.length) {
  if (brak.length) console.error('Pola bez zaznaczania:', [...new Set(brak)].join(', '));
  if (podw.length) console.error('Podwojny onFocus:', [...new Set(podw)].join(', '));
  process.exit(1);
}
console.log(`OK: ${razem} pol, wszystkie zaznaczaja tresc przy kliknieciu.`);
