// ============================================================================
// elevenlabs-zapis_test.mjs — CZY KTOŚ OMIJA BRAMKĘ ZAPISU.
//
// Sama funkcja `zapiszKonfiguracje` niczego nie gwarantuje, dopóki da się
// wysłać PATCH obok niej. To ta sama klasa co D11: moduł z zielonymi testami,
// którego nikt nie woła, wygląda w repozytorium identycznie jak działający.
//
// Ten test skanuje wszystkie skrypty i szuka PATCH-ów do API ElevenLabs
// pisanych z ręki.
//
//   node --test scripts/elevenlabs-zapis_test.mjs
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KATALOG = dirname(fileURLToPath(import.meta.url));
const BRAMKA = "elevenlabs-zapis.mjs";

const skrypty = readdirSync(KATALOG)
  .filter((f) => f.endsWith(".mjs") && f !== BRAMKA && !f.includes("_test"))
  .map((f) => ({ nazwa: f, kod: readFileSync(join(KATALOG, f), "utf8") }));

test("zaden skrypt nie wysyla PATCH do ElevenLabs z reki", () => {
  const omijajace = [];
  for (const { nazwa, kod } of skrypty) {
    // PATCH/POST/PUT skierowany na api.elevenlabs.io/v1/convai/agents
    const zapisy = [...kod.matchAll(/method:\s*["'](PATCH|PUT)["']/g)];
    if (!zapisy.length) continue;
    for (const z of zapisy) {
      const okno = kod.slice(Math.max(0, z.index - 400), z.index + 400);
      if (!/api\.elevenlabs\.io\/v1\/convai\/agents/.test(okno)) continue;
      // Wolno, jeśli skrypt korzysta z bramki.
      if (kod.includes("elevenlabs-zapis.mjs")) continue;
      omijajace.push(nazwa);
    }
  }
  assert.deepEqual([...new Set(omijajace)], [],
    "skrypt zapisuje konfiguracje ElevenLabs z pominieciem zapiszKonfiguracje() — "
    + "sondowanie, ktore zapisuje, nie jest sondowaniem (15.08 i 17.08)");
});

test("bramka odmawia bez jawnej zgody i bez powodu", async () => {
  const { zapiszKonfiguracje } = await import("./elevenlabs-zapis.mjs");
  await assert.rejects(
    () => zapiszKonfiguracje({ zmiana: { conversation_config: { tts: { speed: 0.5 } } } }),
    /brak `zamierzone: true`/,
    "zapis bez jawnej zgody musi byc odrzucony",
  );
  await assert.rejects(
    () => zapiszKonfiguracje({ zmiana: {}, zamierzone: true, powod: "krotki" }),
    /`powod` jest obowiazkowy|`powod` jest obowiązkowy/,
    "zapis bez powodu musi byc odrzucony",
  );
});
