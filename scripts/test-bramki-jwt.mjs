/**
 * BRAMA PRZED FUNKCJAMI — KTO WOLA BEZ TOKENU SUPABASE (kontrola, 13.09.2026)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SKAD TO SIE WZIELO
 * ═══════════════════════════════════════════════════════════════════════════
 * Wdrozenie szesciu funkcji z repozytorium odcielo przychodzace telefony.
 * `supabase/config.toml` mial wpis:
 *
 *     [functions.voice-agent-init]
 *                                   ← i NIC pod spodem
 *
 * Pusty wpis nie znaczy „zostaw jak jest". Znaczy WARTOSC DOMYSLNA, a domyslna
 * to `verify_jwt = true`. Dopoki funkcje wdrazal ktos inny niz CLI, nie mialo
 * to skutku. Pierwsze wdrozenie stad nalozylo domyslna — i brama zaczela
 * odrzucac webhook od ElevenLabs, ktory nie przedstawia tokenu Supabase.
 *
 * Objaw: 401 przy KAZDYM przychodzacym telefonie. W panelu cisza, w logach
 * funkcji nic, bo do naszego kodu nie docieralo zadne wywolanie. Trzy inne
 * funkcje — w tym worker kupujacy numery — nie mialy wpisu WCALE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CO TU SPRAWDZAMY
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. ZADEN wpis `[functions.X]` nie moze byc pusty. To lapie cala klase bledu,
 *    takze dla funkcji, ktorych jeszcze nie ma na liscie nizej.
 * 2. Funkcje wolane przez PODMIOTY BEZ TOKENU SUPABASE musza miec jawne
 *    `verify_jwt = false` — z wypisanym powodem, kto konkretnie je wola.
 * 3. Kazda z nich musi w ogole miec wpis w `config.toml`.
 *
 * `verify_jwt = false` NIE znaczy „bez zabezpieczen". Znaczy: tozsamosc
 * sprawdza sama funkcja, bo brama nie ma czego sprawdzic. Od tego jest osobna
 * kontrola (`scripts/funkcje-bez-bramki.mjs`) i pozycja w backlogu.
 *
 * Uruchomienie: node scripts/test-bramki-jwt.mjs
 */
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');

let bledy = 0;
const sprawdz = (w, opis) => {
  if (w) console.log('OK: ' + opis);
  else { console.error('BLAD: ' + opis); bledy++; }
};

/**
 * Wolajacy BEZ tokenu Supabase. Powod jest czescia kontroli: kto dopisze tu
 * funkcje, musi umiec nazwac, kto ja wola — inaczej lista rosnie sama.
 */
const WOLANE_BEZ_TOKENU = {
  'voice-agent-init': 'operator telefoniczny (ElevenLabs) przy kazdym polaczeniu',
  'voice-agent-chat': 'operator telefoniczny — tura rozmowy',
  'voice-agent-tools': 'operator telefoniczny — narzedzia agenta',
  'voice-agent-llm': 'operator telefoniczny — model rozmowy',
  'voice-call-postprocess': 'webhook ElevenLabs po zakonczeniu rozmowy',
  'voice-call-commit': 'wlasny token glosowy (oraz panel z JWT uzytkownika)',
  'voice-call-reconcile': 'zegar bazy (cron) — dociaganie zgubionych rozmow',
  'voice-numbers-worker': 'zegar bazy (cron) naglowkiem z wlasnym sekretem — KUPUJE numery',
  'voice-number-activate': 'panel warsztatu; tozsamosc sprawdza sama funkcja',
  'agent-demo-lead': 'strona publiczna /ai-agent, przed zalogowaniem',
  'billing-stripe-webhook': 'operator platnosci Stripe',
  'billing-payu-webhook': 'operator platnosci PayU',
  'payment-core-webhook': 'operator platnosci',
};

/** Mapa: nazwa funkcji → wartosc `verify_jwt` albo null, gdy wpis jest pusty. */
const wpisy = new Map();
let biezaca = null;
for (const linia of config.split('\n')) {
  const naglowek = linia.match(/^\[functions\.([A-Za-z0-9_-]+)\]\s*$/);
  if (naglowek) { biezaca = naglowek[1]; wpisy.set(biezaca, null); continue; }
  if (/^\[/.test(linia)) { biezaca = null; continue; }
  const wartosc = linia.match(/^verify_jwt\s*=\s*(true|false)\s*$/);
  if (biezaca && wartosc) wpisy.set(biezaca, wartosc[1] === 'true');
}

// 1. Zaden wpis nie moze byc pusty — to jest DOKLADNIE ten blad z 13.09.
const puste = [...wpisy.entries()].filter(([, v]) => v === null).map(([k]) => k);
sprawdz(puste.length === 0,
  puste.length
    ? `wpisy bez jawnego verify_jwt (pusty wpis = domyslne TRUE): ${puste.join(', ')}`
    : `kazdy z ${wpisy.size} wpisow w config.toml ma jawne verify_jwt`);

// 2 i 3. Funkcje wolane bez tokenu Supabase.
for (const [funkcja, powod] of Object.entries(WOLANE_BEZ_TOKENU)) {
  const wartosc = wpisy.get(funkcja);
  if (wartosc === undefined) {
    sprawdz(false, `${funkcja}: BRAK WPISU w config.toml → domyslnie verify_jwt=true, a wola ja ${powod}`);
  } else if (wartosc !== false) {
    const co = wartosc === null ? 'wpis PUSTY (czyli domyslnie true)' : `verify_jwt=${wartosc}`;
    sprawdz(false, `${funkcja}: ${co} → brama odrzuci wywolanie, a wola ja ${powod}`);
  } else {
    sprawdz(true, `${funkcja}: jawne verify_jwt=false (wola: ${powod})`);
  }
}

console.log(bledy ? `\n${bledy} BLEDOW` : '\nBRAMKI JWT: wszystko przeszlo');
process.exit(bledy ? 1 : 0);
