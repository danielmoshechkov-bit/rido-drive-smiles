#!/usr/bin/env node
// ============================================================================
// voice-polski-nienaruszony.mjs — JEDNO PYTANIE, JEDNA ODPOWIEDŹ: TAK albo NIE.
//
// Powód powstania: złoty stan pilnował 22 pól konfiguracji ElevenLabs i ani
// jednego znaku promptu. Przez jeden dzień 15.08 prompt urósł o 4950 znaków,
// voiceSnapshot.ts zmienił się trzy razy, a jedyną kontrolą było to, że
// pamiętałem, żeby policzyć SHA ręcznie. Pamięć nie jest kontrolą.
//
// Sprawdza CZTERY warstwy, bo polski agent to cztery warstwy:
//   1. konfiguracja ElevenLabs   (synteza, ASR, tury)      — złoty stan
//   2. blok polski w prompcie    (co model dostaje na wejściu)
//   3. persona z bazy            (ai_agents_config.system_prompt)
//   4. voiceSnapshot.ts          (jak renderujemy godziny, daty, ceny)
//   5. regresja 0/20             (jak to naprawdę brzmi)
//
// 1–4 odpowiadają na „czy coś się zmieniło". 5 odpowiada na „czy nadal działa".
// To NIE jest to samo pytanie i dlatego są obie.
//
//   node scripts/voice-polski-nienaruszony.mjs                 # pełne sprawdzenie
//   node scripts/voice-polski-nienaruszony.mjs --bez-regresji  # bez syntezy (za darmo)
//   node scripts/voice-polski-nienaruszony.mjs --wobec 14fea1dd  # wobec rewizji git
//   node scripts/voice-polski-nienaruszony.mjs --zapisz        # nowy punkt odniesienia
//
// --zapisz odmawia, jeśli regresja nie przeszła. Punktem odniesienia może być
// wyłącznie stan potwierdzony pomiarem, nie stan bieżący.
//
// Wymaga w .env.local: SUPABASE_ACCESS_TOKEN, ELEVENLABS_API_KEY, VOICE_LLM_TOKEN
// Tylko ODCZYT (poza --zapisz, który pisze wyłącznie do config/POLSKI-ODCISK.json).
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = "wclrrytmrscqvsyxyvnn";
const PERSONA_AGENT = "voice_workshop_secretary";
const PLIK_PROMPT = "supabase/functions/voice-agent-chat/index.ts";
const PLIK_SNAPSHOT = "supabase/functions/_shared/voiceSnapshot.ts";
const ODCISK = join(ROOT, "config/POLSKI-ODCISK.json");

const arg = (n) => process.argv.includes(n);
const argWartosc = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const ZAPISZ = arg("--zapisz");
const BEZ_REGRESJI = arg("--bez-regresji");
const WOBEC = argWartosc("--wobec");

for (const line of existsSync(join(ROOT, ".env.local")) ? readFileSync(join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const SB = process.env.SUPABASE_ACCESS_TOKEN;
const EL = process.env.ELEVENLABS_API_KEY;
const LLM = process.env.VOICE_LLM_TOKEN;

const sha = (s) => createHash("sha256").update(s).digest("hex");
const wynik = [];
const zapisz = (nazwa, ok, opis, szczegol) => { wynik.push({ nazwa, ok, opis, szczegol }); };

// ---------------------------------------------------------------------------
// ODCISK BLOKU PROMPTU
//
// Nie hashujemy pliku ani zakresu linii — jedno i drugie zmienia się przy
// przesunięciu importu i alarmowałoby przy zmianach, które promptu nie dotykają.
// Wyciągamy TREŚĆ: literały będące tekstem promptu, z wyciętymi wstawkami
// dynamicznymi (${…}), znormalizowaną spacją. Ta sama funkcja działa na
// dowolnej rewizji git, więc da się porównać z dowolnym dniem wstecz.
// ---------------------------------------------------------------------------
export function fragmentyPromptu(src) {
  const kawalki = [...src.matchAll(/`([^`]*)`/g)].map((m) => m[1]);
  return kawalki
    .filter((k) => k.includes("===") || (k.length >= 40 && /[ąćęłńóśźż]/.test(k)))
    .map((k) => k.replace(/\$\{[^}]*\}/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const zGita = (rev, plik) => execFileSync("git", ["show", `${rev}:${plik}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 32 << 20 });

function odciskiLokalne() {
  const src = readFileSync(join(ROOT, PLIK_PROMPT), "utf8");
  const frag = fragmentyPromptu(src);
  return {
    prompt: { sha: sha(frag.join("\n")), fragmentow: frag.length, znakow: frag.join("\n").length, _frag: frag },
    snapshot: { sha: sha(readFileSync(join(ROOT, PLIK_SNAPSHOT), "utf8")) },
  };
}

function odciskiZRewizji(rev) {
  const frag = fragmentyPromptu(zGita(rev, PLIK_PROMPT));
  return {
    prompt: { sha: sha(frag.join("\n")), fragmentow: frag.length, znakow: frag.join("\n").length, _frag: frag },
    snapshot: { sha: sha(zGita(rev, PLIK_SNAPSHOT)) },
  };
}

// ---------------------------------------------------------------------------
// 1. KONFIGURACJA ELEVENLABS — złoty stan
// ---------------------------------------------------------------------------
function kontrolaKonfiguracji() {
  if (!EL) return zapisz("1. konfiguracja ElevenLabs", false, "brak ELEVENLABS_API_KEY — NIE SPRAWDZONE");
  try {
    const out = execFileSync("node", ["scripts/voice-restore-golden.mjs"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const ile = Number((out.match(/(\d+) pól sprawdzonych/) || [])[1] || 0);
    // Kontrola, która obejrzała zero pól, nie jest kontrolą (zasada 12).
    if (!ile) return zapisz("1. konfiguracja ElevenLabs", false, "porównanie nic nie sprawdziło — ślepa kontrola");
    zapisz("1. konfiguracja ElevenLabs", true, `${ile} pól zgodnych ze złotym stanem`);
  } catch (e) {
    const tekst = String(e.stdout || "") + String(e.stderr || "");
    const pola = [...tekst.matchAll(/ROZJAZD\S*\s+(\S+)/g)].map((m) => m[1]);
    zapisz("1. konfiguracja ElevenLabs", false, "PRODUKCJA ODBIEGA OD ZŁOTEGO STANU", pola.join("\n") || tekst.slice(-400));
  }
}

// ---------------------------------------------------------------------------
// 2 i 4. BLOK PROMPTU I MODUŁ SNAPSHOTU
// ---------------------------------------------------------------------------
function kontrolaKodu(teraz, wzorzec, skad) {
  if (teraz.prompt.sha === wzorzec.prompt.sha) {
    zapisz("2. blok polski w prompcie", true, `${teraz.prompt.fragmentow} fragmentów, ${teraz.prompt.znakow} znaków, sha ${teraz.prompt.sha.slice(0, 16)}`);
  } else {
    // Sama różnica SHA nie mówi, CO się zmieniło — a bez tego nikt nie oceni,
    // czy zmiana dotyczyła polskiego. Dlatego pokazujemy fragmenty.
    const opis = `ZMIENIONY wobec ${skad}: ${wzorzec.prompt.znakow} → ${teraz.prompt.znakow} znaków`;
    if (!wzorzec.prompt._frag) {
      // Bez fragmentów wzorca różnica wyglądałaby jak „dodano wszystko" — czyli
      // alarm, który nic nie mówi. Lepiej przyznać się do braku danych.
      zapisz("2. blok polski w prompcie", false, opis,
        "  (odcisk bez fragmentów — nie umiem pokazać CO się zmieniło; przepisz go: --zapisz)");
    } else {
      const byly = new Set(wzorzec.prompt._frag);
      const sa = new Set(teraz.prompt._frag || []);
      const dodane = [...sa].filter((f) => !byly.has(f));
      const usuniete = [...byly].filter((f) => !sa.has(f));
      const skrot = (f) => (f.length > 110 ? f.slice(0, 110) + "…" : f);
      zapisz("2. blok polski w prompcie", false, opis,
        [...usuniete.map((f) => "  − " + skrot(f)), ...dodane.map((f) => "  + " + skrot(f))].join("\n"));
    }
  }
  teraz.snapshot.sha === wzorzec.snapshot.sha
    ? zapisz("4. voiceSnapshot.ts", true, `sha ${teraz.snapshot.sha.slice(0, 16)}`)
    : zapisz("4. voiceSnapshot.ts", false, `ZMIENIONY wobec ${skad}`,
      `  było ${wzorzec.snapshot.sha.slice(0, 16)}\n  jest ${teraz.snapshot.sha.slice(0, 16)}`);
}

// ---------------------------------------------------------------------------
// 3. PERSONA Z BAZY — prompt ma dwa źródła, kod i baza. Pilnowanie samego kodu
//    zostawia drugie otwarte: personę da się zmienić z panelu, bez commita.
// ---------------------------------------------------------------------------
async function kontrolaPersony(wzorzec) {
  if (!SB) return zapisz("3. persona z bazy", false, "brak SUPABASE_ACCESS_TOKEN — NIE SPRAWDZONE");
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SB}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `select system_prompt from ai_agents_config where agent_id = '${PERSONA_AGENT}' limit 1` }),
  });
  const d = await r.json();
  const tekst = Array.isArray(d) && d[0] ? String(d[0].system_prompt ?? "") : null;
  if (tekst === null) return zapisz("3. persona z bazy", false, `brak wiersza ai_agents_config dla ${PERSONA_AGENT}`);
  const s = sha(tekst);
  if (!wzorzec) return zapisz("3. persona z bazy", true, `${tekst.length} znaków, sha ${s.slice(0, 16)} (pierwszy zapis)`), s;
  s === wzorzec
    ? zapisz("3. persona z bazy", true, `${tekst.length} znaków, sha ${s.slice(0, 16)}`)
    : zapisz("3. persona z bazy", false, "ZMIENIONA — ktoś edytował personę w panelu",
      `  było ${wzorzec.slice(0, 16)}\n  jest ${s.slice(0, 16)} (${tekst.length} znaków)`);
  return s;
}

// ---------------------------------------------------------------------------
// 5. REGRESJA 0/20 — jedyna kontrola, która słucha, a nie porównuje.
//    Parametry bierzemy ZE ZŁOTEGO STANU, nie z literału, żeby test sprawdzał
//    to, czym naprawdę mówi produkcja.
// ---------------------------------------------------------------------------
const ZDANIE = "Dobrze, wymiana klocków i tarcz hamulcowych. Kiedy byłoby wygodnie przyjechać?";

function wav(pcm) {
  const n = pcm.length, h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + n, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(n, 40);
  return Buffer.concat([h, pcm]);
}
const slowa = (s) => (s || "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);

async function ponow(fn, prob = 4) {
  for (let i = 0; i < prob; i++) {
    try { return await fn(); } catch (e) { if (i === prob - 1) throw e; await new Promise((r) => setTimeout(r, 3000 * (i + 1))); }
  }
}

async function kontrolaRegresji() {
  if (BEZ_REGRESJI) return zapisz("5. regresja 0/20", null, "POMINIĘTA (--bez-regresji)");
  if (!EL || !LLM) return zapisz("5. regresja 0/20", false, "brak ELEVENLABS_API_KEY albo VOICE_LLM_TOKEN — NIE SPRAWDZONE");
  const zloty = JSON.parse(readFileSync(join(ROOT, "config/elevenlabs-agent-ZLOTY-STAN.json"), "utf8"));
  const tts = zloty?.conversation_config?.tts || {};
  const glosPl = (tts.supported_voices || []).find((v) => v.language === "pl") || tts;
  const ustawienia = { stability: glosPl.stability ?? tts.stability, similarity_boost: glosPl.similarity_boost ?? tts.similarity_boost, speed: glosPl.speed ?? tts.speed };
  const voiceId = glosPl.voice_id || tts.voice_id;
  const model = tts.model_id;
  const zrodlo = new Set(slowa(ZDANIE));
  let wadliwych = 0; const przyklady = [];
  process.stderr.write(`  synteza ${model} / ${voiceId.slice(0, 8)}… / speed ${ustawienia.speed} — 20 prób: `);
  for (let i = 0; i < 20; i++) {
    const pcm = await ponow(async () => {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_16000`, {
        method: "POST", headers: { "xi-api-key": EL, "Content-Type": "application/json" },
        body: JSON.stringify({ text: ZDANIE, model_id: model, voice_settings: ustawienia }),
      });
      if (!r.ok) throw new Error(`TTS ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    });
    const d = await ponow(async () => {
      const r = await fetch("https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/voice-audio-diagnose", {
        method: "POST", headers: { Authorization: `Bearer ${LLM}`, "Content-Type": "application/json" },
        body: JSON.stringify({ audio_b64: wav(pcm).toString("base64"), mime: "audio/wav", surowy: true, jezyk: "pl" }),
      });
      if (!r.ok) throw new Error(`transkrypcja ${r.status}`);
      return r.json();
    });
    const obce = slowa(d?.transkrypt).filter((w) => !zrodlo.has(w));
    if (obce.length) { wadliwych++; if (przyklady.length < 3) przyklady.push(obce.join(" ").slice(0, 40)); }
    process.stderr.write(obce.length ? "x" : ".");
  }
  process.stderr.write("\n");
  wadliwych === 0
    ? zapisz("5. regresja 0/20", true, "20 syntez, ani jednego wtrętu")
    : zapisz("5. regresja 0/20", false, `${wadliwych}/20 syntez z wtrętem`, "  " + przyklady.join(" | "));
  return wadliwych;
}

// ---------------------------------------------------------------------------
async function main() {
  const teraz = odciskiLokalne();
  const wzorcowy = existsSync(ODCISK) ? JSON.parse(readFileSync(ODCISK, "utf8")) : null;

  let wzorzec, skad;
  if (WOBEC) { wzorzec = odciskiZRewizji(WOBEC); skad = `rewizji ${WOBEC}`; }
  else if (wzorcowy) { wzorzec = { prompt: wzorcowy.prompt, snapshot: wzorcowy.snapshot }; skad = `${wzorcowy.potwierdzony}`; }

  console.log("\n════ CZY POLSKI AGENT JEST NIENARUSZONY ════");
  console.log(wzorzec ? `punkt odniesienia: ${skad}\n` : "BRAK PUNKTU ODNIESIENIA — uruchom z --zapisz po potwierdzeniu regresji\n");

  kontrolaKonfiguracji();
  if (wzorzec) kontrolaKodu(teraz, wzorzec, skad);
  else {
    zapisz("2. blok polski w prompcie", null, `${teraz.prompt.fragmentow} fragmentów, ${teraz.prompt.znakow} znaków, sha ${teraz.prompt.sha.slice(0, 16)} (bez wzorca)`);
    zapisz("4. voiceSnapshot.ts", null, `sha ${teraz.snapshot.sha.slice(0, 16)} (bez wzorca)`);
  }
  const shaPersony = await kontrolaPersony(WOBEC ? null : wzorcowy?.persona_sha);
  const wadliwych = await kontrolaRegresji();

  console.log("");
  for (const w of [...wynik].sort((a, b) => a.nazwa.localeCompare(b.nazwa))) {
    const znak = w.ok === null ? "—" : w.ok ? "✓" : "✗";
    console.log(` ${znak}  ${w.nazwa.padEnd(28)} ${w.opis}`);
    if (w.szczegol) console.log(w.szczegol);
  }

  const zle = wynik.filter((w) => w.ok === false);
  const pominiete = wynik.filter((w) => w.ok === null);
  console.log("\n" + "─".repeat(60));
  if (zle.length === 0 && pominiete.length === 0) console.log("POLSKI NIENARUSZONY: TAK");
  else if (zle.length === 0) console.log(`POLSKI NIENARUSZONY: TAK, ale ${pominiete.length} kontroli pominiętych — to nie jest pełna odpowiedź`);
  else console.log(`POLSKI NIENARUSZONY: NIE — ${zle.map((w) => w.nazwa.replace(/^\d+\.\s*/, "")).join(", ")}`);

  if (ZAPISZ) {
    // Punktem odniesienia może być wyłącznie stan POTWIERDZONY POMIAREM.
    // Zapisanie stanu, którego nikt nie odsłuchał, zamienia kontrolę w echo.
    if (wadliwych !== 0) { console.log("\n--zapisz ODMÓWIONY: regresja nie przeszła albo nie została uruchomiona."); process.exit(1); }
    const rev = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
    writeFileSync(ODCISK, JSON.stringify({
      potwierdzony: `${new Date().toISOString().slice(0, 10)}, commit ${rev}, regresja 0/20`,
      commit: rev,
      // Fragmenty zapisujemy w CAŁOŚCI, nie tylko ich SHA. Bez nich porównanie
      // umie powiedzieć „zmieniło się", ale nie „co się zmieniło" — a pierwsza
      // wersja tego skryptu pokazywała wtedy WSZYSTKIE fragmenty jako dodane.
      prompt: { sha: teraz.prompt.sha, fragmentow: teraz.prompt.fragmentow, znakow: teraz.prompt.znakow, _frag: teraz.prompt._frag },
      snapshot: { sha: teraz.snapshot.sha },
      persona_sha: shaPersony,
      zdanie_regresji: ZDANIE,
    }, null, 2) + "\n");
    console.log(`\nzapisano nowy punkt odniesienia: config/POLSKI-ODCISK.json (commit ${rev})`);
  }
  process.exit(zle.length ? 1 : 0);
}

main().catch((e) => { console.error("BŁĄD:", e.message); process.exit(2); });
