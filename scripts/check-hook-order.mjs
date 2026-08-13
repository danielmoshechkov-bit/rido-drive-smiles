#!/usr/bin/env node
/**
 * Wykrywa użycie zmiennej z hooka PRZED jej deklaracją w tym samym komponencie.
 *
 * Po co osobny skrypt, skoro jest TypeScript i build:
 * ani `tsc`, ani `vite build` tego nie łapią — użycie siedzi w funkcji zwrotnej
 * (useMemo/useEffect), która teoretycznie mogłaby wykonać się później, więc dla
 * kompilatora jest poprawne. W praktyce useMemo wykonuje się W TRAKCIE renderu,
 * więc aplikacja wywala się w przeglądarce komunikatem
 * „Cannot access 'X' before initialization" i użytkownik dostaje biały ekran.
 * Dokładnie to wygasiło kartę zlecenia po zmianie z 12.08.2026.
 *
 * Sprawdzamy tylko wyniki hooków (useState / useMemo / useRef / useCallback),
 * bo to one są odczytywane podczas renderu. Zwykłe funkcje pomocnicze wołane
 * z obsługi zdarzeń są bezpieczne i celowo ich nie zgłaszamy.
 *
 * Użycie: node scripts/check-hook-order.mjs [plik|katalog ...]  (domyślnie: src)
 *
 * W zestawie testów uruchamiany na PLIKACH ZMIENIONYCH — na całym `src`
 * heurystyka daje sporo fałszywych trafień (nazwy pól i typów), a na diffie
 * jest czysta i wyłapuje realny błąd.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const CELE = process.argv.slice(2).length ? process.argv.slice(2) : ['src'];

const plikiTsx = (dir) => {
  const out = [];
  for (const wpis of readdirSync(dir)) {
    const sciezka = join(dir, wpis);
    if (statSync(sciezka).isDirectory()) out.push(...plikiTsx(sciezka));
    else if (['.tsx', '.ts'].includes(extname(sciezka))) out.push(sciezka);
  }
  return out;
};

// const [x, setX] = useState(...)   |   const x = useMemo(...)
const DEKLARACJA = /^\s*const\s+(?:\[\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*)\s*)?\]|([A-Za-z_$][\w$]*))\s*=\s*(useState|useMemo|useRef|useCallback|useReducer)\b/;

let problemy = 0;
const doSprawdzenia = CELE.flatMap((cel) =>
  statSync(cel).isDirectory() ? plikiTsx(cel) : [cel],
).filter((f) => ['.tsx', '.ts'].includes(extname(f)));

// Granice komponentow: linia od poczatku wiersza zaczynajaca funkcje/komponent.
// Bez tego prop `form` w jednym komponencie mylil sie ze stanem `form`
// w drugim komponencie tego samego pliku (fałszywe trafienia).
const GRANICA = /^(export\s+)?(async\s+)?(function|const|class)\s+[A-Za-z_$][\w$]*/;

for (const plik of doSprawdzenia) {
  const linie = readFileSync(plik, 'utf8').split('\n');

  // Podzial pliku na zakresy najwyzszego poziomu (komponent / funkcja).
  const granice = [];
  linie.forEach((l, i) => { if (GRANICA.test(l)) granice.push(i); });
  granice.push(linie.length);

  for (let g = 0; g < granice.length - 1; g++) {
    const od = granice[g];
    const doo = granice[g + 1];
    const deklaracje = new Map();

    for (let i = od; i < doo; i++) {
      const m = linie[i].match(DEKLARACJA);
      if (!m) continue;
      for (const nazwa of [m[1], m[2], m[3]].filter(Boolean)) {
        if (!deklaracje.has(nazwa)) deklaracje.set(nazwa, i);
      }
    }

    for (const [nazwa, deklaracjaLinia] of deklaracje) {
      const wzorzec = new RegExp(`\\b${nazwa.replace(/\$/g, '\\$')}\\b`);
      // Groźne jest TYLKO użycie wykonywane podczas renderu:
      //  - ciało useMemo (liczy się przy każdym renderze),
      //  - tablica zależności useMemo/useEffect (czytana przy renderze).
      // Użycie w zwykłej funkcji pomocniczej albo w obsłudze zdarzenia jest
      // bezpieczne — wykona się długo po inicjalizacji zmiennej.
      let wRenderze = false;
      for (let i = od; i < deklaracjaLinia; i++) {
        const trim = linie[i].trim();
        if (/=\s*useMemo\(/.test(trim)) wRenderze = true;
        const tablicaZaleznosci = /^\},\s*\[.*\]\s*\);?$/.test(trim);
        if (tablicaZaleznosci && wRenderze) wRenderze = false;

        if (!trim || trim.startsWith('//') || trim.startsWith('*') || trim.startsWith('/*')) continue;
        if (/^\s*import\b/.test(linie[i])) continue;
        if (/^(type|interface)\b/.test(trim) || /^[A-Za-z_$][\w$]*\??:\s/.test(trim)) continue;
        if (!wzorzec.test(linie[i])) continue;
        if (!wRenderze && !tablicaZaleznosci) continue;
        console.error(`${plik}:${i + 1} — "${nazwa}" uzyte przed deklaracja (linia ${deklaracjaLinia + 1})`);
        console.error(`    ${trim.slice(0, 110)}`);
        problemy++;
        break;
      }
    }
  }
}

if (problemy > 0) {
  console.error(`\nZnaleziono ${problemy} użyć zmiennej hooka przed deklaracją — to biały ekran w przeglądarce.`);
  process.exit(1);
}
console.log('OK: żadna zmienna z hooka nie jest używana przed deklaracją.');
