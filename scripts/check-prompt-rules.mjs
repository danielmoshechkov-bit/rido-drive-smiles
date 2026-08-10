#!/usr/bin/env node
// ============================================================================
// Mechaniczna kontrola sprzeczności w prompcie agenta głosowego.
//
// Powód: SZEŚĆ razy z rzędu ta sama klasa błędu — reguła nakazująca coś, czego
// inna reguła zakazuje, albo zakaz dotyczący czegoś, czego model nie widzi.
// Za każdym razem przeoczona przy ręcznym czytaniu. Prompt jest za duży, żeby
// trzymać go w głowie, więc kontrola musi być mechaniczna.
//
//   node scripts/check-prompt-rules.mjs
//
// Kod wyjścia 1, gdy wykryto kolizję — nadaje się do CI.
// ============================================================================
import { readFileSync } from "node:fs";

const SRC = "supabase/functions/voice-agent-chat/index.ts";
const src = readFileSync(new URL(`../${SRC}`, import.meta.url), "utf8");

// Prompt składa się z literałów doklejanych do `system` plus dwóch zmiennych
// warunkowych, które też trafiają do modelu.
const chunks = [];
for (const m of src.matchAll(/system \+= `((?:[^`\\]|\\.)*)`/g)) chunks.push(m[1]);
for (const m of src.matchAll(/const (?:genderClause|greetingRule|phoneQuestionRule)[\s\S]{0,1200}?;/g)) chunks.push(m[0]);
for (const m of src.matchAll(/const systemTimeContext = `((?:[^`\\]|\\.)*)`/g)) chunks.push(m[1]);
const prompt = chunks.join("\n").replace(/\\n/g, "\n");

const lines = prompt.split("\n").map((l) => l.trim()).filter(Boolean);

const isProhibition = (l) => /\b(NIE|NIGDY|ZAKAZ|ZAKAZANE|Zabronione|ŹLE)\b/.test(l);
const isCommand = (l) =>
  /\b(powiedz|mów|zapowiadaj|podaj|użyj|wywołaj|zadaj|poproś|potwierdź|informuj)\b/i.test(l);

const commands = lines.filter((l) => isCommand(l) && !isProhibition(l));
const prohibitions = lines.filter(isProhibition);

// Zdania w cudzysłowie wewnątrz zakazów — to one najczęściej kolidują.
const bannedQuotes = new Set();
for (const p of prohibitions) {
  for (const q of p.matchAll(/"([^"]{4,60})"/g)) {
    if (/NIGDY|ZAKAZANE|Zabronione/.test(p)) bannedQuotes.add(q[1].toLowerCase());
  }
}

console.log(`Prompt: ${prompt.length} znaków, ~${Math.round(prompt.length / 3.5)} tokenów`);
console.log(`Zdań nakazujących: ${commands.length}   zakazujących: ${prohibitions.length}`);
console.log(`Fraz zakazanych dosłownie: ${bannedQuotes.size}\n`);

let kolizje = 0;

console.log("=== KOLIZJA 1: nakaz trafia w zakazaną frazę ===");
for (const c of commands) {
  const low = c.toLowerCase();
  for (const b of bannedQuotes) {
    if (low.includes(b)) {
      console.log(`  [!] zakazane "${b}"`);
      console.log(`      w nakazie: ${c.slice(0, 120)}`);
      kolizje++;
    }
  }
}
if (!kolizje) console.log("  brak");

console.log("\n=== KOLIZJA 2: zakaz cytujący frazę (zasada 11 — cytat podpowiada) ===");
let cytaty = 0;
for (const b of bannedQuotes) {
  console.log(`  [?] "${b}" — sprawdź, czy da się opisać bez cytowania`);
  cytaty++;
}
if (!cytaty) console.log("  brak");

console.log("\n=== KOLIZJA 3: reguły o rzeczach spoza kontekstu modelu (zasada 11) ===");
// Model NIE widzi: pierwszej wiadomości systemowej ElevenLabs, poprzednich rozmów,
// stanu bazy, cennika (dopóki nie ma go w snapshocie).
const poza = [
  [/pierwsz\w+ wiadomo|powitanie z systemu/i, "pierwsza wiadomość ElevenLabs (usuwana z kontekstu)"],
  [/poprzedni\w+ rozmow/i, "poprzednie rozmowy (nie ma ich w kontekście)"],
  [/cennik|cena us[łl]ugi/i, "cennik (brak w kontekście do FAZY 1B)"],
];
let spoza = 0;
for (const l of lines) {
  for (const [re, opis] of poza) {
    if (re.test(l)) {
      console.log(`  [?] ${opis}`);
      console.log(`      ${l.slice(0, 110)}`);
      spoza++;
    }
  }
}
if (!spoza) console.log("  brak");

console.log(`\nKOLIZJI TWARDYCH: ${kolizje}`);
process.exit(kolizje > 0 ? 1 : 0);
