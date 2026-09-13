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

/** Czy kod zapisuje konfiguracje ElevenLabs BEZ odczytu weryfikujacego po zapisie. */
function zapisujeBezOdczytu(kod) {
  {
    // Szukamy zapisu do API ElevenLabs (PATCH/POST na /convai/agents/…).
    const zapisy = [...kod.matchAll(/method:\s*"(PATCH|PUT|POST)"[\s\S]{0,400}?convai\/agents|convai\/agents[\s\S]{0,400}?method:\s*"(PATCH|PUT|POST)"/g)];
    if (!zapisy.length) return false;
    // Po zapisie musi paść ODCZYT: fetch GET na tego samego agenta.
    const poZapisie = kod.slice(zapisy[zapisy.length - 1].index);
    // Odczyt bywa schowany w NAZWANYM POMOCNIKU zdefiniowanym wyżej w pliku
    // (`const odczytaj = async () => fetch(…)`). Pierwsza wersja tego testu
    // patrzyla wylacznie na literal URL po zapisie i zapalila sie na
    // elevenlabs-zapis.mjs — czyli na BRAMCE, ktora odczyt weryfikujacy MA.
    // Kontrola, ktora oskarza poprawny kod, uczy przeskakiwac czerwone.
    // Bierzemy KAŻDĄ deklarację i patrzymy na jej ciało — kawałek kodu do
    // następnej deklaracji. Pierwsza próba szukała nazwy i URL-a jednym
    // wyrażeniem: skan zżarł deklarację pomocnika i wskazał przypadkowe `m`.
    const dekl = [...kod.matchAll(/(?:const|let|function)\s+([A-Za-z_$][\w$]*)/g)];
    const pomocnicyOdczytu = dekl
      .filter((d, i) => {
        const cialo = kod.slice(d.index, dekl[i + 1] ? dekl[i + 1].index : kod.length);
        return /fetch\(\s*[^;]*convai\/agents/.test(cialo)
          && /headers/.test(cialo)
          && !/method:\s*["'](?:PATCH|PUT|POST)["']/.test(cialo);
      })
      .map((d) => d[1]);
    const maOdczyt = /convai\/agents\/[^"'`]*["'`]?\s*,\s*\{\s*headers/.test(poZapisie)
      || (/GET|\.json\(\)/.test(poZapisie) && /convai\/agents/.test(poZapisie))
      || pomocnicyOdczytu.some((n) => new RegExp(`(?:await\\s+)?${n}\\s*\\(`).test(poZapisie));
    return !maOdczyt;
  }
}

test("kazdy PATCH konfiguracji ma po sobie odczyt weryfikujacy", () => {
  const bezOdczytu = skrypty.filter(({ kod }) => zapisujeBezOdczytu(kod)).map((s) => s.nazwa);
  assert.deepEqual(bezOdczytu, [],
    "skrypt zapisuje konfiguracje ElevenLabs i NIE odczytuje jej po zapisie — "
    + "kod 200 znaczy 'przyjalem zadanie', nie 'ustawilem wartosc'");
});

// ŻYWOTNOŚĆ. Rozluźniłem tę kontrolę, żeby przestała oskarżać bramkę zapisu.
// Rozluźnienie bez dowodu, że kontrola nadal łapie prawdziwy przypadek, to
// najprostszy sposób na zielony test, który niczego nie pilnuje.
test("kontrola nadal lapie zapis bez odczytu", () => {
  const zly = `
    await fetch("https://api.elevenlabs.io/v1/convai/agents/x", {
      method: "PATCH", headers: { "xi-api-key": K }, body: JSON.stringify(z),
    });
    console.log("gotowe");
  `;
  assert.equal(zapisujeBezOdczytu(zly), true, "PATCH bez odczytu musi byc zlapany");

  const dobry = `
    const odczytaj = async () => (await fetch("https://api.elevenlabs.io/v1/convai/agents/x", { headers: { "xi-api-key": K } })).json();
    await fetch("https://api.elevenlabs.io/v1/convai/agents/x", {
      method: "PATCH", headers: { "xi-api-key": K }, body: JSON.stringify(z),
    });
    const po = await odczytaj();
  `;
  assert.equal(zapisujeBezOdczytu(dobry), false, "PATCH z odczytem przez pomocnika nie moze byc oskarzany");
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
