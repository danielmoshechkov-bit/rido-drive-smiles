#!/usr/bin/env node
/**
 * Szuka zapytań, które proszą bazę o kolumnę, której tam nie ma.
 *
 * Skąd to: `booking-available-slots` czytał `workshop_settings.calendar_settings`
 * — kolumnę, która nigdy nie istniała. PostgREST zwraca wtedy błąd, kod bierze
 * `data` jako puste i leci dalej z wartością domyślną. Efekt: dzienny limit
 * rezerwacji od początku wychodził „bez limitu" i NIKT tego nie zauważył, bo
 * brak limitu wygląda dokładnie jak działający system.
 *
 * To klasa błędów niewidoczna dla kontroli typów (zapytania idą przez `as any`),
 * dla budowania i dla testów UI — widać ją dopiero, gdy ktoś sprawdzi, czy
 * ustawienie faktycznie działa.
 *
 * Jak działa: wyciąga z kodu wywołania `.from('tabela').select('a, b, c')`
 * i porównuje listę kolumn ze schematem bazy (plik src/integrations/supabase/types.ts,
 * który jest generowany z prawdziwego schematu). Pomija `*`, wyrażenia
 * zagnieżdżone `relacja(...)` i aliasy.
 *
 * Użycie: node scripts/check-kolumny-zapytan.mjs [zrzut-schematu.json]
 *   Bez argumentu porównuje z src/integrations/supabase/types.ts (może być nieaktualny).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TYPY = 'src/integrations/supabase/types.ts';
const KATALOGI = ['src', 'supabase/functions'];

// ── schemat ────────────────────────────────────────────────────────────────
//
// Najpierw próbujemy zrzutu z ŻYWEJ bazy (argument: ścieżka do JSON-a
// z information_schema). Wygenerowane `types.ts` bywa nieaktualne — nowe
// kolumny pojawiają się w nim dopiero, gdy ktoś przegeneruje plik, więc
// samo w sobie dawałoby fałszywe alarmy dla świeżych migracji.
const schemat = new Map();
const zrzut = process.argv[2];
if (zrzut) {
  const dane = JSON.parse(readFileSync(zrzut, 'utf8'));
  for (const w of (dane.rows || dane)) schemat.set(w.table_name, new Set(String(w.kolumny).split(',')));
} else {
  const linie = readFileSync(TYPY, 'utf8').split('\n');
  let tabela = null, wRow = false;
  for (const l of linie) {
    const mTab = l.match(/^      ([a-z_0-9]+): \{$/);
    if (mTab) { tabela = mTab[1]; wRow = false; continue; }
    if (!tabela) continue;
    if (/^        Row: \{$/.test(l)) { wRow = true; continue; }
    if (wRow) {
      if (/^        \}$/.test(l)) { wRow = false; continue; }
      const mKol = l.match(/^          ([a-z_0-9]+)\??:/);
      if (mKol) {
        if (!schemat.has(tabela)) schemat.set(tabela, new Set());
        schemat.get(tabela).add(mKol[1]);
      }
    }
  }
}

// ── zapytania z kodu ────────────────────────────────────────────────────────
const pliki = [];
for (const katalog of KATALOGI) {
  (function zbierz(sciezka) {
    for (const wpis of readdirSync(sciezka)) {
      const pelna = join(sciezka, wpis);
      if (statSync(pelna).isDirectory()) { zbierz(pelna); continue; }
      if (/\.(ts|tsx)$/.test(wpis) && !pelna.includes('integrations/supabase/types')) pliki.push(pelna);
    }
  })(katalog);
}

const ZAPYTANIE = /\.from\(\s*['"]([a-z_0-9]+)['"]\s*\)\s*(?:as any\s*)?\.\s*select\(\s*(['"`])([^'"`]*)\2/g;
const znalezione = [];

for (const plik of pliki) {
  const tresc = readFileSync(plik, 'utf8');
  for (const m of tresc.matchAll(ZAPYTANIE)) {
    const [, tabela, , lista] = m;
    const kolumnyTabeli = schemat.get(tabela);
    if (!kolumnyTabeli) continue;                 // tabela spoza schematu (widok, RPC) — pomijamy
    if (lista.includes('*')) continue;

    // odsiewamy zagnieżdżone relacje: "klient:workshop_clients(imie, nazwisko)"
    const bezRelacji = lista.replace(/[a-z_0-9!]+\s*\([^)]*\)/gi, '');
    const kolumny = bezRelacji.split(',')
      .map((k) => k.trim().split(':').pop().trim())  // alias:kolumna → kolumna
      .filter(Boolean)
      .filter((k) => /^[a-z_0-9]+$/.test(k));

    const brakujace = kolumny.filter((k) => !kolumnyTabeli.has(k));
    if (brakujace.length) {
      const nrLinii = tresc.slice(0, m.index).split('\n').length;
      znalezione.push(`${plik}:${nrLinii} — ${tabela} nie ma kolumn: ${brakujace.join(', ')}`);
    }
  }
}

if (znalezione.length) {
  console.error(znalezione.join('\n'));
  console.error(`\nZnaleziono ${znalezione.length} zapytań o nieistniejące kolumny — takie zapytanie zwraca błąd, a kod leci dalej z wartością domyślną.`);
  process.exit(1);
}
console.log(`OK: żadne zapytanie nie prosi o nieistniejącą kolumnę (sprawdzono ${pliki.length} plików, ${schemat.size} tabel).`);
