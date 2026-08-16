// ============================================================================
// glosy-pomiar.mjs — CZY GŁOS WTRĄCA COŚ, CZEGO NIE MA W TEKŚCIE.
//
// Ten sam miernik co przy Ericu i Kamilu: jedno zdanie z liczbami i datą,
// syntezowane wielokrotnie na `eleven_multilingual_v2`, potem transkrybowane
// i porównane ze źródłem. Liczby są w zdaniu celowo — to na nich modele
// syntezy najczęściej wtrącają obce słowa albo gubią człon.
//
// KOSZT JEST LICZONY PRZED URUCHOMIENIEM i wypisany. Bez `--zgoda` nie rusza.
// ============================================================================
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of existsSync(join(ROOT, ".env.local")) ? readFileSync(join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const KLUCZ = process.env.ELEVENLABS_API_KEY;
const ZDANIE = "Środa, osiemnastego sierpnia, godzina dziewiąta trzydzieści — sto pięćdziesiąt złotych.";
const GLOSY = [
  { nazwa: "Alicja", id: "ldzFbnOs5w23MLcNBXQx" },
  { nazwa: "Luiza", id: "C8ZVSJxcymeT86xT429O" },
  { nazwa: "BJBJ", id: "m6j9iSWdnSmguZuMqQjg" },
];
const PROBEK = Number(process.argv.includes("--probek") ? process.argv[process.argv.indexOf("--probek") + 1] : 10);

const bezOgonkow = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
const slowa = (s) => bezOgonkow(s).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
const ZRODLO = new Set(slowa(ZDANIE));

async function synteza(voiceId, tekst) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": KLUCZ, "Content-Type": "application/json" },
    body: JSON.stringify({ text: tekst, model_id: "eleven_multilingual_v2" }),
  });
  if (!r.ok) throw new Error(`TTS ${voiceId} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function transkrypcja(audio) {
  const fd = new FormData();
  fd.append("file", new Blob([audio], { type: "audio/mpeg" }), "p.mp3");
  fd.append("model_id", "scribe_v1");
  fd.append("language_code", "pol");
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": KLUCZ }, body: fd });
  if (!r.ok) throw new Error(`STT → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json())?.text ?? "";
}

const koszt = GLOSY.length * PROBEK * ZDANIE.length;
console.log(`═══ POMIAR GŁOSÓW ═══`);
console.log(`zdanie: ${ZDANIE.length} znaków × ${PROBEK} próbek × ${GLOSY.length} głosy = ${koszt} kredytów`);
if (!process.argv.includes("--zgoda")) {
  console.log("\nBez --zgoda nie uruchamiam. Dopisz --zgoda, gdy koszt jest zaakceptowany.");
  process.exit(0);
}

const wyniki = [];
for (const g of GLOSY) {
  const wtrety = [];
  let udanych = 0;
  for (let i = 0; i < PROBEK; i++) {
    try {
      const audio = await synteza(g.id, ZDANIE);
      const tekst = await transkrypcja(audio);
      udanych++;
      const obce = slowa(tekst).filter((w) => !ZRODLO.has(w) && w.length > 2);
      if (obce.length) wtrety.push({ probka: i + 1, obce, tekst });
      process.stdout.write(obce.length ? "✗" : "·");
    } catch (e) {
      process.stdout.write("!");
      wtrety.push({ probka: i + 1, blad: String(e.message).slice(0, 120) });
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`  ${g.nazwa}: ${wtrety.length}/${udanych} z wtrętami`);
  wyniki.push({ glos: g.nazwa, id: g.id, probek: udanych, wtretow: wtrety.filter((w) => !w.blad).length, szczegoly: wtrety });
}
mkdirSync(join(ROOT, "config"), { recursive: true });
writeFileSync(join(ROOT, "config/glosy-pomiar.json"), JSON.stringify({ zdanie: ZDANIE, probek: PROBEK, wyniki }, null, 1) + "\n");
console.log("\n═══ WYNIK ═══");
for (const w of wyniki) console.log(`  ${w.glos.padEnd(10)} ${w.wtretow}/${w.probek} wtrętów  ${w.wtretow === 0 ? "✅ do listy" : "❌ odpada"}`);
