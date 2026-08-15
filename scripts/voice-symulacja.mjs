#!/usr/bin/env node
// ============================================================================
// voice-symulacja.mjs — SCENARIUSZE ROZMÓW BEZ TELEFONU I BEZ KREDYTÓW.
//
// Powód powstania: rosyjski i ukraiński testowaliśmy wyłącznie dzwoniąc,
// angielskiego nie testowaliśmy w rozmowie ANI RAZU, a każdy telefon kosztuje
// kredyty, których zostało 28 tysięcy. Siedem scenariuszy razy cztery języki to
// dwadzieścia osiem rozmów — nie do zrobienia telefonem, do zrobienia tutaj.
//
// SILNIK: POST /v1/convai/agents/{id}/simulate-conversation. Zmierzone na
// sześciu przebiegach: 0 znaków TTS, 0 minut rozmowy, 0 wierszy w bazie.
// Przechodzi przez NASZ prompt i NASZE narzędzia — pierwszy przebieg bez
// snapshotu dał datę z przeszłości („czwartek szósty sierpnia") i formę na
// „ty", oba przepisane z przykładów w prompcie.
//
// SNAPSHOT jest pobierany z voice-agent-init i wstrzykiwany jako
// dynamic_variables — bez tego symulacja testuje agenta, który nie zna
// terminów, i każda data jest zmyślona.
//
//   node scripts/voice-symulacja.mjs                    # wszystkie scenariusze
//   node scripts/voice-symulacja.mjs --jezyk ru         # tylko rosyjskie
//   node scripts/voice-symulacja.mjs --scenariusz 01    # jeden scenariusz
//   node scripts/voice-symulacja.mjs --zapisz           # nowy punkt odniesienia
//   node scripts/voice-symulacja.mjs --transkrypt       # wypisz rozmowy
//
// NIE ZAPISUJE ZLECEŃ ANI REZERWACJI. Fałszywa rezerwacja w kalendarzu
// warsztatu jest gorsza niż brak testu. Gotowość do zlecenia liczymy funkcją
// czystą `missingForCommit`, bez dotykania bazy.
//
// Wymaga w .env.local: ELEVENLABS_API_KEY, VOICE_LLM_TOKEN
// Opcjonalnie: ANTHROPIC_API_KEY — bez niego asercja „gotowe do zlecenia"
// raportuje NIE SPRAWDZONE (nie „przeszło").
// ============================================================================
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sprawdzRozmowe } from "./voice-asercje.mjs";
import { wzorceWJezyku } from "../supabase/functions/_shared/voiceWzorce.ts";
import { missingForCommit, isCancellationIntent, matchBrand } from "../supabase/functions/_shared/voiceReconcile.ts";
import { extractFromTranscript } from "../supabase/functions/_shared/voiceExtraction.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KATALOG = join(ROOT, "scripts/scenariusze");
const ODNIESIENIE = join(ROOT, "scripts/scenariusze/_ostatni-przebieg.json");
const AGENT = "agent_8301ky7ve28ee6jsb3h30h11354g";
const INIT = "https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/voice-agent-init";

for (const line of existsSync(join(ROOT, ".env.local")) ? readFileSync(join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const EL = process.env.ELEVENLABS_API_KEY;
const LLM = process.env.VOICE_LLM_TOKEN;
const ANT = process.env.ANTHROPIC_API_KEY || "";
if (!EL || !LLM) { console.error("BRAK ELEVENLABS_API_KEY albo VOICE_LLM_TOKEN w .env.local — zatrzymuję się, nie obchodzę."); process.exit(2); }

const arg = (n) => process.argv.includes(n);
const wartosc = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const FILTR_JEZYK = wartosc("--jezyk");
const FILTR_ID = wartosc("--scenariusz");
const ZAPISZ = arg("--zapisz");
const TRANSKRYPT = arg("--transkrypt");

// --- snapshot ---------------------------------------------------------------
// Jeden na cały przebieg: pobranie kosztuje ~100 ms, a wszystkie scenariusze
// mają widzieć TEN SAM stan kalendarza. Inaczej dwa przebiegi tego samego
// scenariusza różniłyby się, bo między nimi minęła godzina.
async function pobierzSnapshot() {
  const r = await fetch(INIT, {
    method: "POST",
    headers: { Authorization: `Bearer ${LLM}`, "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: AGENT, caller_id: "+48000000000", called_number: "+48221015896" }),
  });
  if (!r.ok) throw new Error(`voice-agent-init zwrócił ${r.status}`);
  const dv = (await r.json())?.dynamic_variables;
  if (!dv?.rido_snapshot) throw new Error("voice-agent-init nie zwrócił rido_snapshot");
  return { dynamic_variables: dv, obiekt: JSON.parse(dv.rido_snapshot) };
}

// --- jeden przebieg ---------------------------------------------------------
async function symuluj(scenariusz, dynamicVariables) {
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT}/simulate-conversation`, {
    method: "POST",
    headers: { "xi-api-key": EL, "Content-Type": "application/json" },
    body: JSON.stringify({
      simulation_specification: {
        simulated_user_config: {
          first_message: scenariusz.klient.pierwsza_wiadomosc,
          prompt: { prompt: scenariusz.klient.prompt },
        },
        dynamic_variables: dynamicVariables,
      },
      new_turns_limit: scenariusz.tury || 14,
    }),
  });
  if (!r.ok) throw new Error(`symulacja ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return d.simulated_conversation || [];
}

// --- gotowość do zlecenia (bez zapisu) --------------------------------------
async function gotowoscDoZlecenia(rozmowa) {
  if (!ANT) return { stan: "nie_sprawdzone", powod: "brak ANTHROPIC_API_KEY w .env.local" };
  const turns = rozmowa.map((t) => ({ role: t.role === "agent" ? "agent" : "user", message: t.message }));
  const ex = await extractFromTranscript(ANT, "claude-haiku-4-5-20251001", turns, new Date());
  // Telefon w symulacji nie istnieje — podajemy numer z sygnalizacji, tak jak
  // przy prawdziwym połączeniu przychodzącym, żeby nie liczyć jego braku
  // jako defektu rozmowy.
  const braki = missingForCommit(ex, "+48000000000");
  const marka = ex?.vehicle_make ? matchBrand(ex.vehicle_make) : null;
  return {
    stan: braki.length ? "blad" : "ok",
    braki, odwolanie: isCancellationIntent(ex),
    marka_rozpoznana: ex?.vehicle_make ? !!marka : null,
    marka_uslyszana: ex?.vehicle_make || null,
  };
}

// ============================================================================
async function main() {
  const pliki = readdirSync(KATALOG).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  let scenariusze = pliki.map((f) => ({ plik: f, ...JSON.parse(readFileSync(join(KATALOG, f), "utf8")) }));
  if (FILTR_JEZYK) scenariusze = scenariusze.filter((s) => s.jezyk === FILTR_JEZYK);
  if (FILTR_ID) scenariusze = scenariusze.filter((s) => s.id.startsWith(FILTR_ID));
  if (!scenariusze.length) { console.error("Żaden scenariusz nie pasuje do filtrów."); process.exit(2); }

  console.log("\n════ SYMULACJA ROZMÓW ════");
  const snap = await pobierzSnapshot();
  console.log(`snapshot: ${snap.dynamic_variables.rido_snapshot.length} znaków, ${snap.obiekt.dni?.length} dni, ${snap.obiekt.uslugi?.length} usług`);
  console.log(`scenariuszy: ${scenariusze.length}${FILTR_JEZYK ? ` (język ${FILTR_JEZYK})` : ""}\n`);

  const wyniki = [];
  for (const s of scenariusze) {
    process.stdout.write(`  ${s.id} [${s.jezyk}] ${s.opis}… `);
    let rozmowa = [], blad = null;
    try { rozmowa = await symuluj(s, snap.dynamic_variables); } catch (e) { blad = e.message; }
    if (blad) { console.log(`BŁĄD: ${blad}`); wyniki.push({ id: s.id, jezyk: s.jezyk, opis: s.opis, blad }); continue; }

    const narzedzia = rozmowa.flatMap((t) => (t.tool_calls || []).map((c) => c.tool_name));
    const wzorce = (wzorceWJezyku(s.jezyk) || "").split("\n").filter((l) => l.startsWith("  ")).map((l) => l.trim());
    const asercje = sprawdzRozmowe({ rozmowa, jezyk: s.jezyk, snapshot: snap.obiekt, narzedzia, wzorce });
    const commit = await gotowoscDoZlecenia(rozmowa);

    // Oczekiwania ze scenariusza — narzędzia i intencja odwołania.
    const oczek = [];
    for (const n of s.oczekiwane?.narzedzia || []) {
      if (!narzedzia.includes(n)) oczek.push(`nie wywołano ${n}`);
    }
    if (s.oczekiwane?.gotowe_do_zlecenia && commit.stan === "blad") oczek.push(`brakuje do zlecenia: ${commit.braki.join(", ")}`);
    if (s.oczekiwane?.odwolanie && commit.stan !== "nie_sprawdzone" && !commit.odwolanie) oczek.push("nie rozpoznano intencji odwołania");

    const bledy = asercje.filter((a) => a.stan === "blad" && a.waga === "blad");
    const ostrzezenia = asercje.filter((a) => a.stan === "blad" && a.waga === "ostrzezenie");
    const nieSprawdzone = asercje.filter((a) => a.stan === "nie_sprawdzone");
    const czy = bledy.length + oczek.length === 0;
    console.log(`${czy ? "✓" : "✗"}  ${rozmowa.length} tur${bledy.length ? `, ${bledy.length} błędów` : ""}${oczek.length ? `, ${oczek.length} niespełnionych oczekiwań` : ""}${ostrzezenia.length ? `, ${ostrzezenia.length} ostrzeżeń` : ""}${nieSprawdzone.length ? `, ${nieSprawdzone.length} niesprawdzonych` : ""}`);

    for (const a of bledy) for (const n of a.naruszenia) console.log(`       ✗ [${a.id}] ${n.powod}\n         „${n.cytat}"`);
    for (const o of oczek) console.log(`       ✗ [oczekiwanie] ${o}`);
    for (const a of ostrzezenia) console.log(`       ! [${a.id}] ${a.opis}`);
    for (const a of nieSprawdzone) console.log(`       — [${a.id}] NIE SPRAWDZONE: ${a.powod}`);
    if (commit.stan === "nie_sprawdzone") console.log(`       — [gotowe_do_zlecenia] NIE SPRAWDZONE: ${commit.powod}`);
    if (commit.marka_rozpoznana === false) console.log(`       ! [marka] „${commit.marka_uslyszana}" nie jest znaną marką — zapisalibyśmy śmieć`);
    if (TRANSKRYPT) for (const t of rozmowa) console.log(`         [${t.role}] ${String(t.message || "").slice(0, 130)}`);

    wyniki.push({
      id: s.id, jezyk: s.jezyk, opis: s.opis, tur: rozmowa.length, przeszedl: czy,
      bledy: bledy.map((a) => a.id), oczekiwania: oczek,
      ostrzezenia: ostrzezenia.map((a) => a.id), nie_sprawdzone: nieSprawdzone.map((a) => a.id),
      rozmowa: rozmowa.map((t) => ({ role: t.role, message: t.message, tool_calls: (t.tool_calls || []).map((c) => c.tool_name) })),
    });
  }

  // --- podsumowanie i regresja ---------------------------------------------
  const przeszlo = wyniki.filter((w) => w.przeszedl).length;
  console.log("\n" + "─".repeat(64));
  console.log(`PRZESZŁO ${przeszlo} z ${wyniki.length} scenariuszy`);
  const padly = wyniki.filter((w) => !w.przeszedl);
  if (padly.length) console.log("padły: " + padly.map((w) => `${w.id}[${w.jezyk}]`).join(", "));

  // Porównanie z poprzednim przebiegiem — scenariusz, który wcześniej
  // przechodził, a teraz pada, to REGRESJA, nawet gdy reszta jest zielona.
  if (existsSync(ODNIESIENIE)) {
    const stare = JSON.parse(readFileSync(ODNIESIENIE, "utf8"));
    const mapa = new Map((stare.wyniki || []).map((w) => [`${w.id}|${w.jezyk}`, w]));
    const regresje = wyniki.filter((w) => { const p = mapa.get(`${w.id}|${w.jezyk}`); return p?.przeszedl && !w.przeszedl; });
    const naprawy = wyniki.filter((w) => { const p = mapa.get(`${w.id}|${w.jezyk}`); return p && !p.przeszedl && w.przeszedl; });
    console.log(`\nwobec przebiegu z ${stare.kiedy}: ${regresje.length ? `REGRESJE — ${regresje.map((w) => w.id).join(", ")}` : "bez regresji"}${naprawy.length ? `; naprawione: ${naprawy.map((w) => w.id).join(", ")}` : ""}`);
  } else {
    console.log("\nbrak punktu odniesienia — uruchom z --zapisz");
  }

  if (ZAPISZ) {
    mkdirSync(dirname(ODNIESIENIE), { recursive: true });
    writeFileSync(ODNIESIENIE, JSON.stringify({ kiedy: new Date().toISOString().slice(0, 16).replace("T", " "), wyniki }, null, 2) + "\n");
    console.log(`zapisano punkt odniesienia: ${ODNIESIENIE.replace(ROOT + "/", "")}`);
  }
  process.exit(padly.length ? 1 : 0);
}

main().catch((e) => { console.error("BŁĄD:", e.message); process.exit(2); });
