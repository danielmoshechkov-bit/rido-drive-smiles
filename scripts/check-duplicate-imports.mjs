#!/usr/bin/env node
/**
 * Wykrywa DWUKROTNY import tej samej nazwy w jednym pliku.
 *
 * Powstaje przy scalaniu gałęzi: dwie osoby dodają ten sam import w różnych
 * miejscach, git łączy oba bez konfliktu, `tsc` tego nie zgłasza — a aplikacja
 * wywala się dopiero w przeglądarce komunikatem
 * „Identifier 'X' has already been declared" i biały ekran.
 *
 * Użycie: node scripts/check-duplicate-imports.mjs [plik|katalog ...]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const CELE = process.argv.slice(2).length ? process.argv.slice(2) : ['src'];
const pliki = (d) => readdirSync(d).flatMap((w) => {
  const s = join(d, w);
  return statSync(s).isDirectory() ? pliki(s) : (['.ts', '.tsx'].includes(extname(s)) ? [s] : []);
});
const doSprawdzenia = CELE.flatMap((c) => (statSync(c).isDirectory() ? pliki(c) : [c]))
  .filter((f) => ['.ts', '.tsx'].includes(extname(f)));

let problemy = 0;
for (const plik of doSprawdzenia) {
  const tekst = readFileSync(plik, 'utf8');
  const nazwy = new Map(); // nazwa -> linia pierwszego importu
  for (const m of tekst.matchAll(/^import\s+(?:type\s+)?(?:(\w+)\s*,\s*)?(?:\{([^}]*)\})?[^;]*?from\s+['"][^'"]+['"]/gm)) {
    const linia = tekst.slice(0, m.index).split('\n').length;
    const kandydaci = [];
    if (m[1]) kandydaci.push(m[1]);
    if (m[2]) {
      for (const czesc of m[2].split(',')) {
        const nazwa = czesc.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim();
        if (nazwa) kandydaci.push(nazwa);
      }
    }
    for (const n of kandydaci) {
      if (nazwy.has(n)) {
        console.error(`${plik}:${linia} — "${n}" zaimportowane po raz drugi (pierwszy raz w linii ${nazwy.get(n)})`);
        problemy++;
      } else {
        nazwy.set(n, linia);
      }
    }
  }
}

if (problemy > 0) {
  console.error(`\nZnaleziono ${problemy} podwójnych importów — to biały ekran w przeglądarce.`);
  process.exit(1);
}
console.log('OK: żadna nazwa nie jest importowana dwa razy w tym samym pliku.');
