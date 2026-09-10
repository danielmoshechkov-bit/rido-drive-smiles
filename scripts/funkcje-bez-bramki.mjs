/**
 * KTORE FUNKCJE BRZEGOWE WOLAJA PLATNE API NA NASZYCH KLUCZACH BEZ BRAMKI.
 *
 * Powod (10.09.2026): `ai-chat` mial `verify_jwt = false`, opcjonalny naglowek
 * Authorization i zadnego pobrania jednostki — czyli otwarte wejscie do naszego
 * rachunku u Anthropic i Gemini. Pytanie „czy jest tego wiecej" trzeba zadawac
 * mechanicznie, bo funkcji jest ponad 190.
 *
 * Uruchomienie: node scripts/funkcje-bez-bramki.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const KORZEN = new URL('../', import.meta.url).pathname;
const config = readFileSync(join(KORZEN, 'supabase/config.toml'), 'utf8');

// Funkcje z wylaczona bramka platformy.
const bezJwt = new Set();
let biezaca = null;
for (const linia of config.split('\n')) {
  const m = linia.match(/^\s*\[functions\.([a-z0-9-]+)\]/i);
  if (m) { biezaca = m[1]; continue; }
  if (biezaca && /^\s*verify_jwt\s*=\s*false/.test(linia)) bezJwt.add(biezaca);
}

// Adresy, za ktore placimy per wywolanie.
const PLATNE = [
  [/api\.anthropic\.com/, 'Anthropic'],
  [/api\.openai\.com/, 'OpenAI'],
  [/generativelanguage\.googleapis\.com/, 'Gemini'],
  [/api\.elevenlabs\.io/, 'ElevenLabs'],
  [/api\.moonshot/, 'Moonshot'],
  [/openrouter\.ai/, 'OpenRouter'],
  [/api\.deepseek\.com/, 'DeepSeek'],
  [/ai\.gateway\.lovable\.dev/, 'Lovable AI'],
];

/**
 * Co liczy sie jako sprawdzenie, KTO wola.
 *
 * Nie tylko token uzytkownika. Webhook operatora sprawdza PODPIS, zadanie cron
 * — wspolny sekret, posrednik administratora — role. Kontrola, ktora zapala sie
 * na kazdym z nich, nauczylaby ignorowac cala liste.
 */
const maUwierzytelnienie = (src) =>
  /auth\.getUser\(/.test(src)
  || /wymagajRoli|requireRole|subscriptionGate|moze_pracowac/.test(src)
  || /verifySignature|WEBHOOK_SECRET|webhookSecret|timingSafeEqual/.test(src)
  || /CRON_SECRET|cronSecret|x-cron/i.test(src)
  || /SERVICE_ROLE_KEY\s*\)?\s*(?:===|==)|=== *Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/.test(src);
const maPobranie = (src) => /billing_consume|check_usage|deduct_|zuzyj_/.test(src);

const wyniki = [];
for (const nazwa of [...bezJwt].sort()) {
  const plik = join(KORZEN, 'supabase/functions', nazwa, 'index.ts');
  if (!existsSync(plik)) continue;
  const src = readFileSync(plik, 'utf8');
  const dostawcy = PLATNE.filter(([re]) => re.test(src)).map(([, n]) => n);
  if (!dostawcy.length) continue;
  wyniki.push({
    nazwa,
    dostawcy: [...new Set(dostawcy)].join(', '),
    auth: maUwierzytelnienie(src),
    pobranie: maPobranie(src),
  });
}

console.log(`Funkcji z verify_jwt = false: ${bezJwt.size}`);
console.log(`Z tego wolajacych platne API: ${wyniki.length}\n`);
const kol = (t, n) => String(t).slice(0, n).padEnd(n);
console.log(kol('funkcja', 30) + kol('platne API', 24) + kol('sprawdza kto', 14) + 'pobiera jednostke');
for (const w of wyniki) {
  console.log(kol(w.nazwa, 30) + kol(w.dostawcy, 24) + kol(w.auth ? 'tak' : 'NIE', 14) + (w.pobranie ? 'tak' : 'NIE'));
}

const otwarte = wyniki.filter((w) => !w.auth);
console.log(otwarte.length
  ? `\n🔴 BEZ SPRAWDZENIA KTO WOLA: ${otwarte.map((w) => w.nazwa).join(', ')}`
  : '\nKazda funkcja wolajaca platne API sprawdza, kto ja wola.');
