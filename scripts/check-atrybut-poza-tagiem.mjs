#!/usr/bin/env node
/**
 * Szuka atrybutów JSX, które wypadły POZA znacznik.
 *
 * Skąd to się bierze: masowa podmiana dopisała `onFocus={...}` do 200 pól naraz,
 * a w części miejsc trafiła linijkę PO zamknięciu znacznika. Taki zapis nie jest
 * błędem składni — React traktuje go jak treść do wyświetlenia i drukuje na
 * ekranie gołe „onFocus=". Ani `tsc`, ani budowanie tego nie zgłaszają;
 * użytkownik widzi to dopiero na produkcji, pod polami formularza.
 *
 * Wykrywanie: linia wyglądająca na atrybut (`nazwa={...}` albo `nazwa="..."`),
 * której poprzednia niepusta linia kończy znacznik (`>` albo `/>`), czyli
 * jesteśmy już w treści, a nie w środku znacznika.
 *
 * Użycie: node scripts/check-atrybut-poza-tagiem.mjs [katalog]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const katalog = process.argv[2] || 'src';
const ATRYBUT = /^\s*[a-zA-Z][a-zA-Z0-9_]*=(\{|")/;
const KONIEC_ZNACZNIKA = /(\/>|>)\s*(\{\/\*.*\*\/\})?\s*$/;
const OTWARCIE_ZNACZNIKA = /<[A-Za-z]/;

const pliki = [];
(function zbierz(sciezka) {
  for (const wpis of readdirSync(sciezka)) {
    const pelna = join(sciezka, wpis);
    if (statSync(pelna).isDirectory()) { zbierz(pelna); continue; }
    if (/\.(tsx|jsx)$/.test(wpis)) pliki.push(pelna);
  }
})(katalog);

const znalezione = [];
for (const plik of pliki) {
  const linie = readFileSync(plik, 'utf8').split('\n');
  for (let i = 1; i < linie.length; i++) {
    if (!ATRYBUT.test(linie[i])) continue;
    let j = i - 1;
    while (j >= 0 && linie[j].trim() === '') j--;
    if (j < 0) continue;
    const poprzednia = linie[j];
    // Poprzednia linia domyka znacznik i sama nie otwiera nowego — czyli
    // ta linia jest już treścią komponentu.
    if (KONIEC_ZNACZNIKA.test(poprzednia) && !OTWARCIE_ZNACZNIKA.test(linie[i])) {
      znalezione.push(`${plik}:${i + 1} — "${linie[i].trim().slice(0, 60)}" stoi po zamkniętym znaczniku (wyświetli się jako tekst)`);
    }
  }
}

if (znalezione.length) {
  console.error(znalezione.join('\n'));
  console.error(`\nZnaleziono ${znalezione.length} atrybutów poza znacznikiem — to widoczny śmieć w interfejsie.`);
  process.exit(1);
}
console.log('OK: żaden atrybut JSX nie wypadł poza znacznik.');
