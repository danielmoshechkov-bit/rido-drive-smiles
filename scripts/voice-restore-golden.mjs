#!/usr/bin/env node
// ============================================================================
// voice-restore-golden.mjs — POWRÓT DO ZŁOTEGO STANU JEDNYM POLECENIEM.
//
// Po co: 15.08 sam ustawiłem produkcji `eleven_flash_v2_5` pętlą sprawdzającą,
// które modele platforma przyjmuje. Każdy udany PATCH zmieniał konfigurację.
// Za tydzień zrobi to ktoś inny albo Lovable nadpisze coś przy deployu —
// i wtedy trzeba mieć JEDNO polecenie, żeby wrócić, a nie odtwarzać z pamięci
// dziesięć pól, z których każde kosztowało dzień pomiarów.
//
//   node scripts/voice-restore-golden.mjs             # tylko porównanie
//   node scripts/voice-restore-golden.mjs --wykonaj   # porównanie + naprawa
//
// Bez --wykonaj NICZEGO nie zapisuje. Kod wyjścia 1 = produkcja odbiega.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_ID = "agent_8301ky7ve28ee6jsb3h30h11354g";

for (const line of existsSync(join(ROOT, ".env.local")) ? readFileSync(join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const KLUCZ = process.env.ELEVENLABS_API_KEY;
if (!KLUCZ) { console.error("BRAK ELEVENLABS_API_KEY w .env.local — zatrzymuję się, nie obchodzę."); process.exit(2); }

const zloty = JSON.parse(readFileSync(join(ROOT, "config/elevenlabs-agent-ZLOTY-STAN.json"), "utf8"));

// Pola pilnowane. NIE porównujemy całej konfiguracji, bo ElevenLabs dokłada
// własne pola przy każdej aktualizacji platformy i wtedy skrypt krzyczałby
// na zmiany, które nas nie dotyczą. Ta lista to rzeczy, które KOSZTOWAŁY
// pomiary — każda ma uzasadnienie w config/ZLOTY-STAN.md.
const PILNOWANE = [
  ["conversation_config.tts.model_id",            "model syntezy — Flash i Turbo gubią polską fonetykę"],
  ["conversation_config.tts.voice_id",            "głos — Kamil robi 3× więcej wtrętów niż Eric (p = 0,007)"],
  ["conversation_config.tts.stability",           "stabilność"],
  ["conversation_config.tts.similarity_boost",    "podobieństwo"],
  ["conversation_config.tts.speed",               "tempo"],
  ["conversation_config.tts.enable_phoneme_tags", "znaczniki fonemów"],
  ["conversation_config.tts.optimize_streaming_latency", "parametr martwy, wartość zgodna z dokumentacją"],
  ["conversation_config.asr.keywords",            "MUSZĄ być puste — powodowały halucynacje rozpoznawania"],
  ["conversation_config.asr.quality",             "jakość rozpoznawania"],
  ["conversation_config.vad.background_voice_detection", "filtr głosów w tle"],
  ["conversation_config.turn.turn_timeout",       "próg ciszy"],
  ["conversation_config.turn.turn_model",         "model tury"],
  ["conversation_config.turn.speculative_turn",   "spekulatywne tury"],
  ["conversation_config.turn.silence_end_call_timeout", "rozłączenie po ciszy"],
  ["conversation_config.turn.soft_timeout_config.timeout_seconds", "wypełniacz — podniesiony z 4 na 8 s"],
  ["conversation_config.conversation.max_duration_seconds", "maksymalna długość rozmowy"],
  ["conversation_config.agent.first_message",     "powitanie — cytowane DOSŁOWNIE w prompcie voice-agent-chat"],
  ["conversation_config.agent.language",          "język bazowy"],
  ["conversation_config.agent.prompt.prompt",     "ZNACZNIKI RIDO — bez nich agent nie wie, z kim rozmawia"],
  ["conversation_config.agent.prompt.temperature","temperatura"],
  ["conversation_config.agent.prompt.llm",        "źródło instrukcji — custom-llm"],
];

const wez = (o, sciezka) => sciezka.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const rowne = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const skrot = (v) => { const s = JSON.stringify(v); return s == null ? "(brak)" : s.length > 90 ? s.slice(0, 90) + "…" : s; };

const url = `https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`;
const naglowki = { "xi-api-key": KLUCZ, "Content-Type": "application/json" };
const r = await fetch(url, { headers: naglowki });
if (!r.ok) { console.error(`Nie udało się pobrać konfiguracji: ${r.status}`); process.exit(2); }
const teraz = await r.json();

console.log("\x1b[1mPOROWNANIE PRODUKCJI ZE ZŁOTYM STANEM\x1b[0m\n");
const roznice = [];
for (const [sciezka, po_co] of PILNOWANE) {
  const chciane = wez(zloty, sciezka), jest = wez(teraz, sciezka);
  if (rowne(chciane, jest)) continue;
  roznice.push({ sciezka, chciane, jest, po_co });
}

if (!roznice.length) {
  console.log(`  \x1b[32mBEZ RÓŻNIC\x1b[0m — produkcja zgodna ze złotym stanem (${PILNOWANE.length} pól sprawdzonych)`);
  process.exit(0);
}
for (const d of roznice) {
  console.log(`  \x1b[31mROZJAZD\x1b[0m ${d.sciezka}`);
  console.log(`      złoty stan: ${skrot(d.chciane)}`);
  console.log(`      produkcja : ${skrot(d.jest)}`);
  console.log(`      \x1b[90m${d.po_co}\x1b[0m`);
}

if (!process.argv.includes("--wykonaj")) {
  console.log(`\n  ${roznice.length} różnic. Uruchom z \x1b[1m--wykonaj\x1b[0m, żeby przywrócić złoty stan.`);
  process.exit(1);
}

// Budujemy ciało PATCH-a wyłącznie z pól, które faktycznie odbiegają — żeby
// nie przepisywać całej konfiguracji i nie skasować czegoś, czego nie znamy.
const ciało = {};
for (const d of roznice) {
  const czesci = d.sciezka.split(".");
  let w = ciało;
  for (const k of czesci.slice(0, -1)) w = (w[k] ??= {});
  w[czesci.at(-1)] = d.chciane;
}
const rp = await fetch(url, { method: "PATCH", headers: naglowki, body: JSON.stringify(ciało) });
if (!rp.ok) { console.error(`\n  PATCH nie powiódł się: ${rp.status} ${(await rp.text()).slice(0, 200)}`); process.exit(2); }

// Weryfikacja PRZEZ POBRANIE, nie po kodzie odpowiedzi. Kod 200 mówi tylko,
// że żądanie przeszło — nie że wartość jest taka, jakiej chcieliśmy.
const po = await (await fetch(url, { headers: naglowki })).json();
const zostaly = roznice.filter((d) => !rowne(wez(zloty, d.sciezka), wez(po, d.sciezka)));
if (zostaly.length) {
  console.log(`\n  \x1b[31mPRZYWRÓCONO CZĘŚCIOWO\x1b[0m — nadal odbiegają: ${zostaly.map((d) => d.sciezka).join(", ")}`);
  process.exit(1);
}
console.log(`\n  \x1b[32mPRZYWRÓCONO\x1b[0m ${roznice.length} pól, zweryfikowane pobraniem.`);
