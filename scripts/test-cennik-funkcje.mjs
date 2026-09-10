/**
 * Karta planu musi wymieniac, co jest w pakiecie.
 *
 * 10.09.2026: karty pokazywaly cene i PUSTA liste. Powod: `Number(null) === 0`,
 * a warunek odsiewajacy „zerowy przydzial" trafial w kazda funkcje wlaczona
 * BEZ limitu — czyli w wiekszosc oferty. Standard, Pro i Sieci mialy zero
 * punktow.
 *
 * Uruchomienie: node scripts/test-cennik-funkcje.mjs
 */
import { readFileSync } from 'node:fs';

let bledy = 0;
const sprawdz = (w, opis) => { if (w) console.log('OK: ' + opis); else { console.error('BLAD: ' + opis); bledy++; } };

const zrodlo = readFileSync(new URL('../src/hooks/usePublicPricing.ts', import.meta.url), 'utf8');

sprawdz(/row\.limit_value !== null && Number\(row\.limit_value\) === 0/.test(zrodlo),
  'warunek odsiewa zero, ale NIE null');
sprawdz(!/if \(Number\(row\.limit_value\) === 0\) continue;/.test(zrodlo),
  'stary warunek (null traktowany jak zero) nie wrocil');

// Ta sama regula, policzona na danych o ksztalcie produkcyjnym.
const wiersze = [
  { limit_value: null, opis: 'funkcja bez limitu (Baza klientow)' },
  { limit_value: null, opis: 'funkcja bez limitu (Voicebot 24/7)' },
  { limit_value: 0,    opis: 'zerowy przydzial (VIN w planie warsztatu)' },
  { limit_value: 200,  opis: 'przydzial dodatni (minuty rozmow)' },
];
const przechodzi = (r) => !(r.limit_value !== null && Number(r.limit_value) === 0);
const widoczne = wiersze.filter(przechodzi).map((r) => r.opis);

sprawdz(widoczne.length === 3, `z czterech wierszy widac trzy (${widoczne.length})`);
sprawdz(!widoczne.some((o) => o.includes('zerowy')), 'zerowy przydzial nadal nie jest oferta');
sprawdz(widoczne.filter((o) => o.includes('bez limitu')).length === 2, 'obie funkcje bez limitu sa na liscie');

console.log(bledy ? `\n${bledy} BLEDOW` : '\nCENNIK: wszystko przeszlo');
process.exit(bledy ? 1 : 0);
