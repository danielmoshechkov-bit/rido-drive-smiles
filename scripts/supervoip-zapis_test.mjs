// ============================================================================
// supervoip-zapis_test.mjs — czy bramka zapisu do operatora naprawdę broni.
//
// Sama bramka niczego nie gwarantuje, dopóki da się wysłać żądanie obok niej.
// To ta sama klasa co przy ElevenLabs: moduł z zielonymi testami, którego nikt
// nie woła, wygląda w repozytorium identycznie jak działający.
//
//   node --test scripts/supervoip-zapis_test.mjs
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KATALOG = dirname(fileURLToPath(import.meta.url));
const BRAMKA = "supervoip-zapis.mjs";

test("zadna metoda zapisu nie leci do restapi.supervoip.pl z reki", () => {
  const omijajace = [];
  for (const f of readdirSync(KATALOG).filter((x) => x.endsWith(".mjs") && x !== BRAMKA && !x.includes("_test"))) {
    const kod = readFileSync(join(KATALOG, f), "utf8");
    if (kod.includes("supervoip-zapis.mjs")) continue;      // korzysta z bramki
    for (const m of kod.matchAll(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/g)) {
      const okno = kod.slice(Math.max(0, m.index - 500), m.index + 500);
      if (/restapi\.supervoip\.pl|BAZA\s*\+/.test(okno)) omijajace.push(`${f} (${m[1]})`);
    }
  }
  assert.deepEqual(omijajace, [],
    "skrypt zapisuje do API operatora z pominieciem bramki — u tego operatora zapis "
    + "wydaje pieniadze z salda prepaid albo dzwoni do ludzi");
});

test("bramka odmawia bez jawnej zgody i bez powodu", async () => {
  const { zapiszSupervoip } = await import("./supervoip-zapis.mjs");
  await assert.rejects(
    () => zapiszSupervoip({ metoda: "PUT", sciezka: "/api/voip_numbers/1", cialo: {} }),
    /zamierzone: true/,
  );
  await assert.rejects(
    () => zapiszSupervoip({ metoda: "PUT", sciezka: "/api/voip_numbers/1", cialo: {}, zamierzone: true, powod: "bo tak" }),
    /powod/,
  );
});

test("akcje w swiecie sa odrzucane osobnym komunikatem, nie ogolnym", async () => {
  const { zapiszSupervoip } = await import("./supervoip-zapis.mjs");
  // Komunikat ma mowic, CO by sie stalo — "nie na bialej liscie" nie powstrzyma
  // nikogo tak skutecznie jak "wykonaloby POLACZENIE do prawdziwej osoby".
  await assert.rejects(
    () => zapiszSupervoip({ metoda: "POST", sciezka: "/api/asterisk/do_call", cialo: {}, zamierzone: true, powod: "test bramki zapisu" }),
    /POŁĄCZENIE TELEFONICZNE/,
  );
  await assert.rejects(
    () => zapiszSupervoip({ metoda: "POST", sciezka: "/api/sms_messages", cialo: {}, zamierzone: true, powod: "test bramki zapisu" }),
    /SMS/,
  );
});

test("sciezka spoza bialej listy nie przechodzi", async () => {
  const { zapiszSupervoip } = await import("./supervoip-zapis.mjs");
  for (const [metoda, sciezka] of [
    ["DELETE", "/api/voip_numbers/1"],       // kasowanie numeru NIE jest na liscie
    ["PUT", "/api/customers/me"],            // i tak nie istnieje, ale niech odmawia wczesniej
    ["POST", "/api/ivr_scenarios"],
    ["PUT", "/api/voip_numbers/abc"],        // zla postac id
  ]) {
    await assert.rejects(
      () => zapiszSupervoip({ metoda, sciezka, cialo: {}, zamierzone: true, powod: "test bialej listy" }),
      /nie jest na bialej liscie/,
      `${metoda} ${sciezka} powinno byc odrzucone`,
    );
  }
});

test("kontrola nadal lapie zapis z reki — dowod zywotnosci", () => {
  // Rozluznienie skanera bez dowodu, ze nadal cokolwiek lapie, to zielony test,
  // ktory niczego nie pilnuje (zasada 32).
  const zly = `await fetch("https://restapi.supervoip.pl/api/voip_numbers", { method: "POST", body: "{}" });`;
  const znalazl = [...zly.matchAll(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/g)]
    .some((m) => /restapi\.supervoip\.pl/.test(zly.slice(Math.max(0, m.index - 500), m.index + 500)));
  assert.equal(znalazl, true, "skaner musi znajdowac POST do operatora pisany z reki");
});
