#!/usr/bin/env node
/**
 * Strażnik tłumaczeń.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO
 * ═══════════════════════════════════════════════════════════════════════════
 * Portal ma siedem języków, ale przez tłumaczenie przechodzi ~12% kodu. Reszta
 * to polskie teksty wpisane wprost. Najgorszy przypadek tej klasy: `t('klucz')`
 * dla klucza, którego nie ma w `pl.json` — i18next zwraca wtedy WŁASNĄ NAZWĘ
 * KLUCZA, więc na ekranie ląduje `marketplace.joinFree` zamiast „Dołącz za
 * darmo". Tak było na giełdzie, we wszystkich językach naraz, łącznie z polskim.
 *
 * Znacznik „przetłumaczone do commita X" nie pomaga, bo mówi, kiedy skończyliśmy,
 * a nie co jest nietknięte. Dlatego zamiast znacznika jest LISTA BAZOWA:
 * `scripts/i18n-baseline.json` zawiera klucze, o których już wiemy. Strażnik
 * przepuszcza je, a przewraca się na KAŻDYM NOWYM. Dług przestaje rosnąć od
 * dnia wdrożenia, a stary spłaca się przez skreślanie pozycji z listy.
 *
 * Sprawdza trzy rzeczy:
 *   1. klucz użyty w `t()`, którego nie ma w `pl.json` i bez `defaultValue`,
 *   2. klucz obecny w `pl.json`, brakujący w innym języku — z pominięciem form
 *      mnogich CLDR, których dany język po prostu nie ma,
 *   3. czy listy bazowej nie da się skrócić (pozycje już naprawione).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const KATALOG = 'src';
const LOCALES = 'src/i18n/locales';
const BAZA = 'scripts/i18n-baseline.json';
const ZRODLO = 'pl';

/** Formy mnogie, których część języków nie ma — ich brak nie jest luką. */
const SUFIKSY_MNOGIE = ['_zero', '_one', '_two', '_few', '_many', '_other'];

function splaszcz(obj, prefiks = '', wynik = new Set()) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const klucz = prefiks ? `${prefiks}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) splaszcz(v, klucz, wynik);
    else wynik.add(klucz);
  }
  return wynik;
}

function pliki(katalog, zebrane = []) {
  for (const wpis of readdirSync(katalog)) {
    const sciezka = join(katalog, wpis);
    if (statSync(sciezka).isDirectory()) {
      if (wpis === 'node_modules' || wpis === 'integrations') continue;
      pliki(sciezka, zebrane);
    } else if (/\.tsx?$/.test(wpis) && !wpis.endsWith('.d.ts')) {
      zebrane.push(sciezka);
    }
  }
  return zebrane;
}

const jezyki = readdirSync(LOCALES)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace('.json', ''));

const klucze = Object.fromEntries(
  jezyki.map((j) => [j, splaszcz(JSON.parse(readFileSync(join(LOCALES, `${j}.json`), 'utf8')))]),
);

const baza = existsSync(BAZA) ? new Set(JSON.parse(readFileSync(BAZA, 'utf8')).klucze) : new Set();

// ── 1. Klucze, które wyrenderują własną nazwę ────────────────────────────────
// Klucz musi mieć kropkę: `t(x => …)` i podobne wywołania nie są tłumaczeniami.
const WZORZEC = /\bt\(\s*'([a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)'\s*(\)|,)/g;
const surowe = new Map();

for (const plik of pliki(KATALOG)) {
  const tresc = readFileSync(plik, 'utf8');
  for (const m of tresc.matchAll(WZORZEC)) {
    const [, klucz, nastepny] = m;
    if (klucze[ZRODLO].has(klucz)) continue;
    // `defaultValue` znaczy, że tekst jednak się pokaże — to inny, łagodniejszy dług.
    const ogon = tresc.slice(m.index + m[0].length, m.index + m[0].length + 140);
    if (nastepny === ',' && ogon.includes('defaultValue')) continue;
    if (!surowe.has(klucz)) surowe.set(klucz, relative('.', plik));
  }
}

const nowe = [...surowe.keys()].filter((k) => !baza.has(k)).sort();
const naprawione = [...baza].filter((k) => !surowe.has(k)).sort();

// ── 2. Braki między językami ────────────────────────────────────────────────
const brakiJezykow = [];
for (const jezyk of jezyki) {
  if (jezyk === ZRODLO) continue;
  const brak = [...klucze[ZRODLO]].filter((k) => {
    if (klucze[jezyk].has(k)) return false;
    // Forma mnoga, której ten język nie zna — nie liczymy.
    const sufiks = SUFIKSY_MNOGIE.find((s) => k.endsWith(s));
    if (sufiks) {
      const baza = k.slice(0, -sufiks.length);
      if ([...klucze[jezyk]].some((x) => x.startsWith(baza + '_'))) return false;
    }
    return true;
  });
  if (brak.length) brakiJezykow.push({ jezyk, brak });
}

// ── Wynik ───────────────────────────────────────────────────────────────────
let bledy = 0;

if (nowe.length) {
  bledy++;
  console.error(`\n🔴 NOWE klucze bez tłumaczenia i bez tekstu zapasowego (${nowe.length}):`);
  console.error('   Pokażą się użytkownikowi jako własna nazwa, we wszystkich językach.\n');
  for (const k of nowe) console.error(`   ${k}   ← ${surowe.get(k)}`);
  console.error(`\n   Napraw: dopisz klucz do ${LOCALES}/*.json albo podaj defaultValue.`);
}

if (brakiJezykow.length) {
  bledy++;
  console.error('\n🔴 Klucze obecne w pl.json, brakujące w innych językach:');
  for (const { jezyk, brak } of brakiJezykow) {
    console.error(`   ${jezyk}: ${brak.length}`);
    for (const k of brak.slice(0, 10)) console.error(`      ${k}`);
    if (brak.length > 10) console.error(`      … i ${brak.length - 10} więcej`);
  }
}

if (naprawione.length) {
  console.log(`\n✅ Naprawione od ostatniej aktualizacji listy bazowej (${naprawione.length}):`);
  for (const k of naprawione) console.log(`   ${k}`);
  console.log(`\n   Skróć ${BAZA} o te pozycje — dług się zmniejszył.`);
}

if (!bledy) {
  console.log(`\n✅ Tłumaczenia w porządku. Dług na liście bazowej: ${baza.size} kluczy.`);
}

process.exit(bledy ? 1 : 0);
