#!/usr/bin/env node
/**
 * ŁAŃCUCH CONVERSIONS API MA PIĘĆ OGNIW — BRAK JEDNEGO NIE DAJE ŻADNEGO OBJAWU.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO TO ISTNIEJE — ZDARZYŁO SIĘ NAPRAWDĘ
 * ═══════════════════════════════════════════════════════════════════════════
 * 13.09.2026, kilka godzin po wdrożeniu CAPI, scalenie gałęzi agenta głosowego
 * skasowało JEDNO ogniwo: zapis `meta_fbp`/`meta_fbc` w `billing-payu-order`.
 * Gałąź powstała przed CAPI i przyniosła starszą wersję tego pliku.
 *
 * Po scaleniu wszystko wyglądało na kompletne — front wysyłał ciasteczka,
 * webhook wołał `meta-capi`, funkcja stała na miejscu, sekrety były ustawione.
 * A każda konwersja kończyła się cicho na `capi_pominiete: brak_zgody`, bo
 * kolumny na zamówieniu były puste. Zero błędów. Zero czerwieni. Zero konwersji.
 *
 * To jest dokładnie ta klasa usterki, której nie łapie ani kontrola typów,
 * ani testy: KAŻDY plik z osobna jest poprawny, brakuje POŁĄCZENIA.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KONTROLA POZYTYWNA
 * ═══════════════════════════════════════════════════════════════════════════
 * Na końcu sprawdzamy, że bramka UMIE zapalić się na czerwono — na tekście,
 * o którym wiadomo, że ogniwa nie zawiera. Bez tego „5/5 ogniw" mogłoby
 * znaczyć „wyrażenie regularne pasuje do wszystkiego".
 */

import { readFileSync, existsSync } from 'node:fs';

const OGNIWA = [
  {
    nazwa: 'front pamięta kliknięcie w reklamę',
    plik: 'src/main.tsx',
    wzorzec: /zapamietajKlikniecieReklamy\(\)/,
    dlaczego: 'bez tego `fbc` nie powstanie i konwersji nie da się przypisać do kampanii',
  },
  {
    nazwa: 'okno zakupu planu wysyła ciasteczka',
    plik: 'src/components/billing/OknoZakupu.tsx',
    wzorzec: /ciasteczkaDoZamowienia\(\)/,
    dlaczego: 'bez tego zakup planu nie trafi do Meta',
  },
  {
    nazwa: 'okno doładowania wysyła ciasteczka',
    plik: 'src/components/billing/DoladowanieModal.tsx',
    wzorzec: /ciasteczkaDoZamowienia\(\)/,
    dlaczego: 'bez tego doładowanie nie trafi do Meta',
  },
  {
    nazwa: 'zamówienie ZAPISUJE ciasteczka',
    plik: 'supabase/functions/billing-payu-order/index.ts',
    wzorzec: /meta_fbp:\s*typeof meta_fbp/,
    dlaczego: 'TO OGNIWO ZNIKŁO PRZY SCALENIU 13.09.2026 — cały łańcuch wyglądał na sprawny',
  },
  {
    nazwa: 'webhook woła meta-capi po wydaniu',
    plik: 'supabase/functions/billing-payu-webhook/index.ts',
    wzorzec: /functions\/v1\/meta-capi/,
    dlaczego: 'bez tego serwerowa kopia zdarzenia nigdy nie wychodzi',
  },
  {
    nazwa: 'meta-capi zarejestrowana w konfiguracji',
    plik: 'supabase/config.toml',
    wzorzec: /\[functions\.meta-capi\]/,
    dlaczego: 'bez wpisu funkcja nie wdroży się z `verify_jwt = false`',
  },
];

function sprawdz(ogniwa, czytaj) {
  const brakujace = [];
  for (const o of ogniwa) {
    const tresc = czytaj(o.plik);
    if (tresc === null) { brakujace.push({ ...o, powod: 'nie ma pliku' }); continue; }
    if (!o.wzorzec.test(tresc)) brakujace.push({ ...o, powod: 'wzorzec nie występuje' });
  }
  return brakujace;
}

const zDysku = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

const brakujace = sprawdz(OGNIWA, zDysku);

for (const o of OGNIWA) {
  const zle = brakujace.find((b) => b.nazwa === o.nazwa);
  console.log(zle ? `❌ ${o.nazwa} — ${zle.powod}\n   ${o.plik}\n   ${o.dlaczego}` : `✅ ${o.nazwa}`);
}

// ── kontrola pozytywna ──────────────────────────────────────────────────────
const naPusto = sprawdz(OGNIWA, () => '// pusty plik bez żadnego ogniwa');
if (naPusto.length !== OGNIWA.length) {
  console.log(`\n❌ KONTROLA POZYTYWNA PADŁA: na pustej treści bramka znalazła ${OGNIWA.length - naPusto.length} ogniw. Wynik przeglądu jest bez wartości.`);
  process.exit(1);
}
console.log(`\n✅ kontrola pozytywna — bramka zapala się na treści bez ogniw (${naPusto.length}/${OGNIWA.length})`);

if (brakujace.length) {
  console.log(`\n🔴 ŁAŃCUCH PRZERWANY: brakuje ${brakujace.length} z ${OGNIWA.length} ogniw. Konwersje do Meta NIE dojdą, i nic tego nie zgłosi.`);
  process.exit(1);
}
console.log(`\nŁańcuch kompletny: ${OGNIWA.length}/${OGNIWA.length} ogniw.`);
