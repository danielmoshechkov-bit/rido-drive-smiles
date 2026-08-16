// ============================================================================
// voice-patch-bez-odczytu_test.mjs — ZAPIS POLA TO NIE ZADZIAŁANIE MECHANIZMU.
//
// ZASADA 32 zastosowana do trzeciej powtarzalnej pomyłki tego projektu.
//
// Trzy razy uznaliśmy, że coś działa, bo API przyjęło zapis:
//   1. `language_presets` — PATCH zwracał 200, pole przechowywało `null`.
//   2. `supported_voices.model_family` — zapisane, zwracane przez GET,
//      a platforma i tak nie przełącza modelu (`multivoice.used: false`).
//   3. `speed` w złotym stanie — dokumentacja mówiła 1.0, produkcja 1.15,
//      bo nikt nie porównał zapisu z odczytem.
//
// Kod 200 znaczy „przyjąłem żądanie", nie „ustawiłem wartość". Jedyny dowód
// to PONOWNY ODCZYT porównany z tym, co chcieliśmy zapisać.
//
// Ta kontrola pilnuje, że każdy skrypt zapisujący konfigurację ElevenLabs
// odczytuje ją po zapisie.
//
//   node --test scripts/voice-patch-bez-odczytu_test.mjs
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KATALOG = dirname(fileURLToPath(import.meta.url));

const skrypty = readdirSync(KATALOG)
  .filter((f) => f.endsWith(".mjs") && !f.includes("_test"))
  .map((f) => ({ nazwa: f, kod: readFileSync(join(KATALOG, f), "utf8") }));

test("kazdy PATCH konfiguracji ma po sobie odczyt weryfikujacy", () => {
  const bezOdczytu = [];
  for (const { nazwa, kod } of skrypty) {
    // Szukamy zapisu do API ElevenLabs (PATCH/POST na /convai/agents/…).
    const zapisy = [...kod.matchAll(/method:\s*"(PATCH|PUT|POST)"[\s\S]{0,400}?convai\/agents|convai\/agents[\s\S]{0,400}?method:\s*"(PATCH|PUT|POST)"/g)];
    if (!zapisy.length) continue;
    // Po zapisie musi paść ODCZYT: fetch GET na tego samego agenta.
    const poZapisie = kod.slice(zapisy[zapisy.length - 1].index);
    const maOdczyt = /convai\/agents\/[^"'`]*["'`]?\s*,\s*\{\s*headers/.test(poZapisie)
      || /GET|\.json\(\)/.test(poZapisie) && /convai\/agents/.test(poZapisie);
    if (!maOdczyt) bezOdczytu.push(nazwa);
  }
  assert.deepEqual(bezOdczytu, [],
    "skrypt zapisuje konfiguracje ElevenLabs i NIE odczytuje jej po zapisie — "
    + "kod 200 znaczy 'przyjalem zadanie', nie 'ustawilem wartosc'");
});

test("skrypt przywracajacy zloty stan porownuje wartosci, nie kody odpowiedzi", () => {
  const kod = readFileSync(join(KATALOG, "voice-restore-golden.mjs"), "utf8");
  // Musi istniec porownanie odczytanej wartosci z oczekiwana — nie sam status.
  assert.match(kod, /ROZJAZD|!==|deepEqual|porówn/i,
    "voice-restore-golden.mjs musi POROWNYWAC wartosci, nie polegac na kodzie odpowiedzi");
  // I musi liczyc, ile pol sprawdzil — kontrola bez licznika moze sprawdzic zero.
  assert.match(kod, /pól sprawdzonych/,
    "brak licznika sprawdzonych pol — kontrola, ktora sprawdzila zero, wyglada jak czysta");
});
