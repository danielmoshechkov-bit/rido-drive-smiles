// ============================================================================
// scenariusze_test.mjs — KAŻDY SCENARIUSZ MA POWIEDZIEĆ, SKĄD POCHODZI.
//
// ZASADA 31: scenariusz odtwarza rzeczywistość, nie jej uporządkowaną wersję.
//
// Kosztowała nas dzień pomiarów na wyidealizowanych rozmowach. Scenariusz
// „klient od razu mówi, czego chce" napisany czysto wychodził 3/3 zielony;
// przepisany na dosłowne zdanie z transkryptu — z wahaniem „ee", rozwlekłą
// składnią i trzema usługami w jednym oddechu — wyszedł 0/3 i pokazał defekt.
//
// Pole `zrodlo` musi wskazywać `conversation_id` rozmowy, z której pochodzi
// pierwsza wypowiedź klienta. Scenariusze wymyślone są dozwolone, ale muszą
// być OZNACZONE — to dług, który ma być widoczny.
//
//   node --test scripts/scenariusze_test.mjs
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KAT = join(dirname(fileURLToPath(import.meta.url)), "scenariusze");
const DLUG = "wymyslony-przed-transkryptami";

const pliki = readdirSync(KAT).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
const scenariusze = pliki.map((f) => ({ plik: f, ...JSON.parse(readFileSync(join(KAT, f), "utf8")) }));

test("kazdy scenariusz ma pole zrodlo", () => {
  const bez = scenariusze.filter((s) => !s.zrodlo).map((s) => s.plik);
  assert.deepEqual(bez, [],
    "scenariusz bez `zrodlo` — podaj conversation_id rozmowy, z ktorej pochodzi pierwsza wypowiedz");
});

test("zrodlo to conversation_id albo jawne oznaczenie dlugu", () => {
  const zle = scenariusze
    .filter((s) => s.zrodlo !== DLUG && !/^conv_[a-z0-9]{10,}$/i.test(String(s.zrodlo)))
    .map((s) => `${s.plik}: ${s.zrodlo}`);
  assert.deepEqual(zle, [],
    `zrodlo musi byc conversation_id (conv_...) albo doslownie "${DLUG}"`);
});

test("dlug wygladzonych scenariuszy nie rosnie", () => {
  // Siedem scenariuszy (01-07) x cztery jezyki = 28 plikow napisanych przed
  // tym, jak mielismy transkrypty. Ta liczba ma MALEC, nigdy rosnac.
  const MAKS = 28;
  const dlug = scenariusze.filter((s) => s.zrodlo === DLUG);
  assert.ok(dlug.length <= MAKS,
    `wygladzonych scenariuszy jest ${dlug.length}, limit to ${MAKS} — nowy scenariusz ma pochodzic z transkryptu`);
});

test("pierwsza wypowiedz klienta nie jest pusta ani wygladzona do jednego zdania", () => {
  // Nie da sie sprawdzic maszynowo, czy cytat jest doslowny. Da sie sprawdzic,
  // czy scenariusz oznaczony jako pochodzacy z rozmowy nie zostal po drodze
  // skrocony do jednego czystego zdania — realne wypowiedzi maja wahania,
  // urwania albo dlugosc.
  const podejrzane = [];
  for (const s of scenariusze) {
    if (s.zrodlo === DLUG) continue;
    const p = String(s.klient?.pierwsza_wiadomosc || "");
    assert.ok(p.length > 0, `${s.plik}: brak pierwszej wypowiedzi`);
    const maWahanie = /\b(ee+|yy+|mm+|эээ|ее+|erm|umm?)\b/i.test(p);
    const maUrwanie = /--|\.\.\./.test(p);
    const dlugie = p.split(/\s+/).length >= 10;
    // MIESZANE PISMO to tez slad autentycznosci: „Wysłuchaj. Dobry dzień,
    // а вы говорите по-русски?" nie ma wahania ani urwania, a jest doslownym
    // cytatem — takiego zdania nikt nie napisze, projektujac scenariusz.
    const mieszanePismo = /[a-ząćęłńóśźż]/i.test(p) && /[а-яА-ЯёЁіїєґ]/.test(p);
    if (!maWahanie && !maUrwanie && !dlugie && !mieszanePismo) podejrzane.push(`${s.plik} („${p.slice(0, 60)}")`);
  }
  assert.deepEqual(podejrzane, [],
    "scenariusz oznaczony jako pochodzacy z rozmowy wyglada na wygladzony — "
    + "prawdziwe wypowiedzi maja wahania, urwania albo dlugosc");
});
