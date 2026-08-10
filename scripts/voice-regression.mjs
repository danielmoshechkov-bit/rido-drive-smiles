#!/usr/bin/env node
// ============================================================================
// voice-regression.mjs — PORÓWNANIE PRZEBIEGÓW NA PRAWDZIWYCH TRANSKRYPTACH.
//
// Po co, skoro są testy jednostkowe: testy sprawdzają przypadki, które ktoś
// wymyślił. Ten skrypt puszcza bramkę i redakcję na WSZYSTKICH zapisanych
// rozmowach i porównuje wynik z poprzednim przebiegiem. Dwa razy złapało to
// błąd, którego testy nie widziały:
//   - ekstrakcja wpisywała rok 2024/2025, bo prompt nie znał daty rozmowy
//     (8 z 8 testów jednostkowych przechodziło)
//   - redakcja urywała liczebnik: „[numer telefonu]set osiemdziesiąt trzy"
//
// Jeśli coś, co wcześniej przechodziło, teraz odpada — to REGRESJA, nawet gdy
// testy są zielone.
//
//   node scripts/voice-regression.mjs            # przebieg + porównanie
//   node scripts/voice-regression.mjs --zapisz   # zapisz jako nowy punkt odniesienia
//
// Tylko ODCZYT bazy. Model NIE jest wołany — cała ścieżka jest czysta,
// więc przebieg jest darmowy, deterministyczny i można go puszczać zawsze.
// ============================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { redactPersonalData, shouldDistill } from "../supabase/functions/_shared/voiceLearningGate.ts";
import { isCancellationIntent, missingForCommit } from "../supabase/functions/_shared/voiceReconcile.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KATALOG = join(ROOT, "scripts/snapshots");
const PROJECT = "wclrrytmrscqvsyxyvnn";

for (const line of existsSync(join(ROOT, ".env.local")) ? readFileSync(join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const SB = process.env.SUPABASE_ACCESS_TOKEN;
if (!SB) { console.error("BRAK SUPABASE_ACCESS_TOKEN w .env.local — zatrzymuję się, nie obchodzę."); process.exit(2); }

const db = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SB}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const d = await r.json();
  if (!Array.isArray(d)) throw new Error(d?.message || "zapytanie nie powiodło się");
  return d;
};

// --- przebieg ---------------------------------------------------------------
const rozmowy = await db(`
  select vc.elevenlabs_conversation_id as conv,
         coalesce(vc.duration_seconds, 0) as dur,
         (vc.linked_entity_id is not null) as ma_zlecenie,
         coalesce(vt.turns::text, '[]') as turns
    from voice_calls vc
    left join voice_transcripts vt on vt.call_id = vc.id
   where vc.elevenlabs_conversation_id is not null
   order by vc.created_at`);

const wiedza = await db(
  `select id::text as id, is_active, coalesce(situation,'') as s, coalesce(recommended_response,'') as r
     from voice_agent_knowledge order by id`);

const wynik = { rozmowy: {}, wiedza: {} };
const pominiete = [];

for (const c of rozmowy) {
  let turns = [];
  try { turns = JSON.parse(c.turns); } catch { /* transkrypt uszkodzony — zostaje pusty */ }
  const agentMessages = (Array.isArray(turns) ? turns : [])
    .filter((t) => t?.role === "assistant" || t?.role === "agent")
    .map((t) => String(t?.content ?? t?.message ?? ""));

  // Rozmowy sprzed 11.08 nie mają `duration_seconds` — kolumna nie była wypełniana.
  // Liczenie ich jako „zerowej długości" dałoby fałszywy obraz: bramka odrzuciłaby
  // wszystko, a porównanie przebiegów straciłoby sens. Pomijamy je świadomie
  // i mówimy ile, zamiast po cichu zaniżać wynik.
  if (!Number(c.dur)) { pominiete.push(c.conv); continue; }

  const bramka = shouldDistill({
    hasOrder: !!c.ma_zlecenie,
    durationSeconds: Number(c.dur) || 0,
    hadTruncation: agentMessages.some((m) => /nie zdążyłem dokończyć|muszę się streścić/i.test(m)),
    agentMessages,
  });
  wynik.rozmowy[c.conv] = {
    uczy: bramka.allow,
    przeglad: bramka.flagForReview,
    powody: bramka.reasons.map((r) => r.split("(")[0].trim()).sort(),
    tur_agenta: agentMessages.length,
  };
}

for (const w of wiedza) {
  const po = `${redactPersonalData(w.s)}||${redactPersonalData(w.r)}`;
  wynik.wiedza[w.id] = { aktywny: !!w.is_active, zmieniona: po !== `${w.s}||${w.r}`, skrot: po.slice(0, 160) };
}

// Ścieżka odwołania — sprawdzana na syntetycznych stanach, bo w bazie jeszcze
// nie ma takiej rozmowy. Gdy się pojawi, zostanie tu utrwalona automatycznie.
wynik.odwolanie = {
  z_telefonem: missingForCommit({ wants_cancel: true }, "600100200").length,
  bez_telefonu: missingForCommit({ wants_cancel: true }, null).length,
  przelozenie: isCancellationIntent({ wants_reschedule: true }),
  zwykla_bez_terminu: missingForCommit({ date: null, time: null }, "600100200").length,
};

// --- porównanie -------------------------------------------------------------
mkdirSync(KATALOG, { recursive: true });
const poprzednie = readdirSync(KATALOG).filter((f) => f.endsWith(".json")).sort();
const bazowy = poprzednie.length ? JSON.parse(readFileSync(join(KATALOG, poprzednie.at(-1)), "utf8")) : null;

console.log(`\x1b[1mREGRESJA NA ZAPISANYCH TRANSKRYPTACH\x1b[0m`);
console.log(`  rozmów: ${Object.keys(wynik.rozmowy).length}   wpisów wiedzy: ${Object.keys(wynik.wiedza).length}`);
const uczy = Object.values(wynik.rozmowy).filter((r) => r.uczy).length;
console.log(`  bramka przepuszcza: ${uczy} / ${Object.keys(wynik.rozmowy).length}`);
if (pominiete.length) {
  console.log(`  \x1b[33mpominięto ${pominiete.length}\x1b[0m rozmów bez zapisanej długości (kolumna duration_seconds`);
  console.log(`  była pusta do 11.08 — te rozmowy nie wejdą do porównania)`);
}

let regresje = 0;
if (!bazowy) {
  console.log("\n  brak punktu odniesienia — to pierwszy przebieg");
} else {
  console.log(`\n  punkt odniesienia: ${poprzednie.at(-1)}`);
  for (const [conv, teraz] of Object.entries(wynik.rozmowy)) {
    const przed = bazowy.rozmowy?.[conv];
    if (!przed) continue;
    if (przed.uczy && !teraz.uczy) {
      regresje++;
      console.log(`  \x1b[31mREGRESJA\x1b[0m ${conv.slice(-8)}: wcześniej UCZYŁA, teraz odpada — ${teraz.powody.join(", ")}`);
    } else if (!przed.uczy && teraz.uczy) {
      console.log(`  \x1b[33mZMIANA\x1b[0m   ${conv.slice(-8)}: wcześniej odpadała, teraz uczy (sprawdź, czy zamierzone)`);
    }
  }
  for (const [id, teraz] of Object.entries(wynik.wiedza)) {
    const przed = bazowy.wiedza?.[id];
    if (!przed) continue;
    if (przed.skrot !== teraz.skrot) {
      console.log(`  \x1b[33mZMIANA\x1b[0m   wpis ${id.slice(0, 8)}: redakcja daje inny wynik niż poprzednio`);
      console.log(`            przed: ${przed.skrot.slice(0, 90)}`);
      console.log(`            teraz: ${teraz.skrot.slice(0, 90)}`);
    }
  }
  for (const [k, v] of Object.entries(wynik.odwolanie)) {
    if (bazowy.odwolanie && bazowy.odwolanie[k] !== v) {
      regresje++;
      console.log(`  \x1b[31mREGRESJA\x1b[0m ścieżka odwołania „${k}": ${bazowy.odwolanie[k]} → ${v}`);
    }
  }
  if (!regresje) console.log("  \x1b[32mbez regresji\x1b[0m");
}

if (process.argv.includes("--zapisz")) {
  const n = String(poprzednie.length + 1).padStart(3, "0");
  const plik = join(KATALOG, `regresja-${n}.json`);
  writeFileSync(plik, JSON.stringify(wynik, null, 1));
  console.log(`\n  zapisano punkt odniesienia: scripts/snapshots/regresja-${n}.json`);
}

process.exit(regresje ? 1 : 0);
