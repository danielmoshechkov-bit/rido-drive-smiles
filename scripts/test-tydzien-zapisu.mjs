#!/usr/bin/env node
/**
 * Testy wspólnego tygodnia zapisu (`src/hooks/useWybranyTydzien.ts`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POWÓD (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 * Plan rozliczeń ustawia się w dwóch miejscach, a przypisanie ma datę
 * obowiązywania. Dopóki tabela zapisywała od oglądanego tygodnia, a karta
 * kierowcy od bieżącego poniedziałku, to samo ustawienie lądowało w dwóch
 * różnych tygodniach — wyglądało to jak brak synchronizacji planów.
 *
 * Dwie rzeczy, które muszą tu zostać na zawsze:
 *  1. Domyślny tydzień to NAJNOWSZY ZAMKNIĘTY, nie kalendarzowy bieżący.
 *     Tabela rozliczeń nie potrafi pokazać tygodnia w trakcie, więc zapis
 *     w kalendarzowym „dziś" byłby niewidoczny w module rozliczeń.
 *  2. Zdanie o dacie ma być po polsku odmienione („7-13 września", nie
 *     „7-13 wrzesień") — samo `month: 'long'` daje mianownik.
 *
 * Moduł żyje w `src/` i używa aliasu `@`, więc nie da się go wczytać wprost
 * w Node. Składamy go esbuildem (zależność Vite) i sprawdzamy PRAWDZIWY kod,
 * a nie jego replikę.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const katalog = mkdtempSync(join(tmpdir(), 'tydzien-'));
const wejscie = join(katalog, 'wejscie.ts');
const wyjscie = join(katalog, 'wyjscie.mjs');

try {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(wejscie, `export * from '@/hooks/useWybranyTydzien';\n`);

  execFileSync('npx', [
    'esbuild', wejscie,
    '--bundle', '--format=esm', '--platform=node',
    '--alias:@=./src',
    `--outfile=${wyjscie}`,
    '--log-level=error',
  ], { stdio: 'inherit' });

  const { domyslnyTydzien, tydzienZDaty, zdanieOTygodniu } = await import(`file://${wyjscie}`);

  // ── 1. Zdanie: odmiana i zakres ──────────────────────────────────────────
  assert.equal(
    zdanieOTygodniu(tydzienZDaty('2026-09-07')),
    'Zapis zadziała od tygodnia 36 (7-13 września)',
    'zdanie dla tygodnia 36 brzmi inaczej, niż uzgodniono',
  );
  assert.equal(
    zdanieOTygodniu(tydzienZDaty('2026-09-28')),
    'Zapis zadziała od tygodnia 39 (28 września - 4 października)',
    'zakres na przełomie miesiąca ma podawać oba miesiące',
  );

  // KONTROLA POZYTYWNA: mianownik („wrzesień") to dokładnie ten błąd, który
  // wyszedł przy pierwszym uruchomieniu. Gdyby wrócił, ten test ma paść.
  const zdanie = zdanieOTygodniu(tydzienZDaty('2026-09-07'));
  assert.ok(zdanie.includes('września'), 'miesiąc nie jest odmieniony');
  assert.ok(!zdanie.includes('wrzesień'), 'miesiąc w mianowniku — Intl bez dnia w dacie');

  // ── 2. Domyślny tydzień jest ZAMKNIĘTY ───────────────────────────────────
  const domyslny = domyslnyTydzien();
  const dzis = new Date();
  const dzisISO = [
    dzis.getFullYear(),
    String(dzis.getMonth() + 1).padStart(2, '0'),
    String(dzis.getDate()).padStart(2, '0'),
  ].join('-');

  assert.ok(
    domyslny.koniec <= dzisISO,
    `domyślny tydzień kończy się ${domyslny.koniec}, czyli w przyszłości — tabela rozliczeń go nie pokaże`,
  );
  assert.equal(new Date(domyslny.start).getDay(), 1, 'tydzień ma się zaczynać w poniedziałek');
  assert.ok(domyslny.numer >= 1 && domyslny.numer <= 53, 'numer tygodnia poza zakresem');

  // KONTROLA POZYTYWNA: w środku tygodnia kalendarzowy „dziś" NIE jest
  // tygodniem domyślnym. Gdyby ktoś wrócił do brania bieżącego poniedziałku,
  // ten warunek to złapie (w poniedziałek i niedzielę test odpuszcza, bo
  // wtedy obie odpowiedzi mogą być tym samym tygodniem).
  const dzienTygodnia = dzis.getDay();
  if (dzienTygodnia >= 2 && dzienTygodnia <= 6) {
    const poniedzialekDzis = new Date(dzis);
    poniedzialekDzis.setDate(dzis.getDate() + (1 - dzienTygodnia));
    const poniedzialekISO = [
      poniedzialekDzis.getFullYear(),
      String(poniedzialekDzis.getMonth() + 1).padStart(2, '0'),
      String(poniedzialekDzis.getDate()).padStart(2, '0'),
    ].join('-');
    assert.notEqual(
      domyslny.start,
      poniedzialekISO,
      'domyślny tydzień to tydzień kalendarzowy — tabela rozliczeń nie potrafi go pokazać',
    );
  }

  console.log('✓ Tydzień zapisu: domyślnie najnowszy zamknięty, zdanie po polsku odmienione.');
} finally {
  rmSync(katalog, { recursive: true, force: true });
}
