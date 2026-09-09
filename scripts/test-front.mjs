#!/usr/bin/env node
/**
 * Uruchamianie testów frontu — `src/**\/*_test.ts`.
 *
 * POWÓD ISTNIENIA (09.09.2026): repozytorium nie ma runnera do frontu. Testy
 * funkcji brzegowych chodzą pod Deno, ale kod frontu używa aliasu `@/` i typów
 * przeglądarki, więc Deno go nie weźmie. Zamiast dokładać cały framework
 * bierzemy `esbuild`, który i tak jest w zależnościach: bundluje plik testowy
 * z rozwiązanym aliasem i odpala go Node'em.
 *
 * Test zgłasza porażkę kodem wyjścia — bez asercji frameworka, bo trzy linijki
 * `process.exit(1)` wystarczają, a niedziałająca bramka jest gorsza niż żadna.
 */
import { build } from 'esbuild';
import { readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const KORZEN = resolve(process.cwd(), 'src');

const zbierz = (kat) => readdirSync(kat).flatMap((w) => {
  const p = join(kat, w);
  return statSync(p).isDirectory() ? zbierz(p) : (p.endsWith('_test.ts') ? [p] : []);
});

const pliki = zbierz(KORZEN).sort();
if (pliki.length === 0) {
  console.log('Brak plików *_test.ts w src/ — nie ma czego uruchomić.');
  process.exit(0);
}

const roboczy = mkdtempSync(join(tmpdir(), 'test-front-'));
let porazek = 0;

try {
  for (const plik of pliki) {
    const wyjscie = join(roboczy, plik.replace(/[\\/]/g, '_').replace(/\.ts$/, '.mjs'));
    await build({
      entryPoints: [plik],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: wyjscie,
      alias: { '@': KORZEN },
      logLevel: 'error',
    });
    console.log(`\n── ${plik} ─────────────────────────────`);
    try {
      await import(pathToFileURL(wyjscie).href);
    } catch (e) {
      porazek++;
      console.error(e?.message ?? e);
    }
  }
} finally {
  rmSync(roboczy, { recursive: true, force: true });
}

process.exit(porazek === 0 ? 0 : 1);
