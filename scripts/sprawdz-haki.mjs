#!/usr/bin/env node
/**
 * Bramka: zero naruszeń zasad haków Reacta.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POWÓD ISTNIENIA (13.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 * Trzy grupy użytkowników — klienci, kierowcy i pracownicy warsztatów — nie
 * mogły wejść do systemu. Objaw: „Ten widok się nie wczytał". Przyczyną był
 * błąd React #310 („Rendered more hooks than during the previous render")
 * w DWÓCH miejscach naraz:
 *
 *   • `ClientPortal` — `useProgramPolecen()` stał ZA `if (loading) return`,
 *   • `DriverFuelView` — pięć `useState` i `useEffect` stały ZA
 *     `if (!fuelCardNumber) return`.
 *
 * Oba objawiały się DOPIERO po zalogowaniu, bo dopiero wtedy warunek wczesnego
 * wyjścia przestawał obowiązywać i haków nagle było więcej niż przy pierwszym
 * renderze. Kontrola typów tego nie widzi. Testy tego nie widziały.
 * `eslint-plugin-react-hooks` widział to od początku — tylko nikt nie patrzył.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO TA JEDNA REGUŁA, A NIE CAŁY `npm run lint`
 * ═══════════════════════════════════════════════════════════════════════════
 * Pełny lint daje dziś ponad cztery tysiące błędów (głównie `no-explicit-any`).
 * Bramka na całość krzyczałaby zawsze i nauczyłaby wszystkich siebie ignorować.
 * `react-hooks/rules-of-hooks` jest na ZERZE — więc każde nowe naruszenie jest
 * nowe i ma być naprawione, zanim wejdzie.
 */

import { ESLint } from 'eslint';

const REGULA = 'react-hooks/rules-of-hooks';

const eslint = new ESLint();

const naruszenia = (wyniki) =>
  wyniki.flatMap((plik) =>
    (plik.messages ?? [])
      .filter((m) => m.ruleId === REGULA)
      .map((m) => ({ plik: plik.filePath, linia: m.line, tresc: m.message })),
  );

// ---------------------------------------------------------------------------
// KONTROLA POZYTYWNA — najpierw sprawdzamy, czy bramka W OGÓLE UMIE ZAPALIĆ
// ---------------------------------------------------------------------------
// Bez tego zielony wynik znaczyłby tylko tyle, że narzędzie milczy — a milczeć
// może i wtedy, gdy nie działa. Zdarzyło się to w tym repozytorium przy audycie
// RLS i przy teście bramki zapisu; oba razy zielono było z niewłaściwego powodu.
//
// ⚠️ Kod kontrolny idzie przez `lintText` ze ŚCIEŻKĄ WEWNĄTRZ `src/`, a nie
// przez plik w katalogu tymczasowym. Pierwsza wersja pisała plik do `/tmp`
// i kontrola pozytywna PADŁA: płaska konfiguracja ESLint dopasowuje reguły po
// ścieżce, a plik spoza projektu nie łapał się na `files: ["**/*.{ts,tsx}"]`.
// Bramka milczała nad kodem, o którym wiadomo, że jest zły.
const KOD_KONTROLNY = `import { useState } from 'react';
export function Kontrolny({ gotowe }: { gotowe: boolean }) {
  if (!gotowe) return null;
  const [x] = useState(0);
  return <div>{x}</div>;
}
`;

const kontrolaZapalila =
  naruszenia(
    await eslint.lintText(KOD_KONTROLNY, { filePath: 'src/__kontrola-hakow.tsx' }),
  ).length > 0;

if (!kontrolaZapalila) {
  console.error(
    '❌ KONTROLA POZYTYWNA PADŁA: bramka nie wykryła haka po wczesnym wyjściu\n' +
      '   w pliku, o którym wiadomo, że jest zły. Wynik na kodzie projektu jest\n' +
      '   bezwartościowy, dopóki to nie zostanie naprawione.',
  );
  process.exit(1);
}
console.log('✅ kontrola pozytywna — bramka wykrywa hak po wczesnym wyjściu');

// ---------------------------------------------------------------------------
// WŁAŚCIWA KONTROLA
// ---------------------------------------------------------------------------
const znalezione = naruszenia(await eslint.lintFiles(['src']));

if (znalezione.length > 0) {
  console.error(`\n❌ NARUSZENIA ZASAD HAKÓW: ${znalezione.length}\n`);
  for (const n of znalezione) {
    console.error(`${n.plik.replace(process.cwd() + '/', '')}:${n.linia}`);
    console.error(`   ${n.tresc}\n`);
  }
  console.error(
    'Hak wywołany po wczesnym `return` przewraca widok DOPIERO wtedy, gdy warunek\n' +
      'tego wyjścia przestanie obowiązywać — czyli zwykle po zalogowaniu, u klienta,\n' +
      'a nie u nas. Przenieś hak NAD wszystkie `return`.',
  );
  process.exit(1);
}

console.log('✅ zero naruszeń zasad haków w src/');
