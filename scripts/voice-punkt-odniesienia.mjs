// ============================================================================
// voice-punkt-odniesienia.mjs — STAN AGENTÓW PRZED ZMIANĄ I PO NIEJ.
//
// Regresja przy agencie głosowym nie wygląda jak czerwony test. Wygląda jak
// pole, które po zapisie z panelu ma inną wartość niż miało — cztery języki
// zamienione na jeden, głos podmieniony na domyślny, przełącznik przestawiony.
// Nikt tego nie zgłosi, bo panel po takiej zmianie wygląda normalnie.
//
// Dlatego przed każdą zmianą dotykającą konfiguracji zdejmujemy odczyt,
// a po zmianie porównujemy wartość po wartości.
//
//   node scripts/voice-punkt-odniesienia.mjs --zapisz    (zdejmij punkt odniesienia)
//   node scripts/voice-punkt-odniesienia.mjs             (porównaj ze stanem bieżącym)
//
// NUMERY TELEFONÓW SĄ MASKOWANE. Ten plik trafia do repozytorium, a repozytorium
// jest publiczne. Do porównania wystarczy „czy się nie zmienił", a nie „jaki jest".
// ============================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of existsSync(join(ROOT, ".env.local")) ? readFileSync(join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const PROJEKT = "wclrrytmrscqvsyxyvnn";
const PLIK = join(ROOT, "config/voice-punkt-odniesienia.json");

const maskuj = (n) => (n ? String(n).slice(0, -4) + "····" : null);

async function pytaj(sql) {
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    console.error("BRAK SUPABASE_ACCESS_TOKEN — zatrzymuję się, nie obchodzę.");
    process.exit(2);
  }
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJEKT}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const tresc = await r.json();
  if (!r.ok || tresc?.message) throw new Error(`odczyt → ${r.status}: ${JSON.stringify(tresc).slice(0, 300)}`);
  return tresc;
}

async function stan() {
  const konfiguracje = await pytaj(`
    select left(c.provider_id::text,8) warsztat, c.persona_key, c.is_active,
           c.voice_id, c.voice_speed::text voice_speed, c.voice_stability::text voice_stability,
           c.voice_similarity::text voice_similarity, c.voice_mode, c.learning_mode,
           c.languages::text languages, c.max_rozmow_rownoczesnie,
           (select count(*) from jsonb_object_keys(c.business_context)) bc_kluczy,
           length(c.business_context::text) bc_znakow
    from voice_agent_configs c order by c.provider_id, c.persona_key`);
  const numery = await pytaj(`
    select left(provider_id::text,8) warsztat, phone_number, status,
           (elevenlabs_phone_id is not null) w_elevenlabs
    from voice_numbers order by created_at`);
  const persony = await pytaj(`select persona_key, enabled, priority from voice_agent_personas order by persona_key`);
  const wierszy = await pytaj(`
    select left(provider_id::text,8) warsztat, count(*)::int wierszy
    from voice_agent_configs group by 1 order by 1`);
  return {
    konfiguracje,
    numery: numery.map((n) => ({ ...n, phone_number: maskuj(n.phone_number) })),
    persony,
    wierszy_konfiguracji: wierszy,
  };
}

// ============================================================================
// SPRAWDZENIA NIEZALEŻNE OD PUNKTU ODNIESIENIA.
//
// Punkt odniesienia mówi „czy coś się zmieniło". To jest inne pytanie:
// „czy stan w ogóle ma sens" — i odpowiedź nie zależy od tego, co było wczoraj.
// ============================================================================
async function sprawdzenia() {
  const bledy = [];

  // 1) JEDEN WARSZTAT, JEDNA KONFIGURACJA.
  //
  // Baza pilnuje pary (provider_id, persona_key) indeksem unikalnym, ale NIE
  // pilnuje, żeby warsztat miał tylko jedną personę. Dokładnie tak powstałby
  // wiersz `sales_agent` z `is_active: false` obok włączonego wiersza warsztatu.
  //
  // To jest wykrywanie, nie blokada — provider mógłby kiedyś legalnie mieć
  // agenta warsztatowego i sprzedażowego naraz. Twardy indeks na samym
  // provider_id zamknąłby tę drogę na zawsze, a problem jest dziś hipotetyczny.
  const wiele = await pytaj(`
    select left(provider_id::text,8) warsztat, count(*)::int wierszy,
           string_agg(persona_key, ', ' order by persona_key) persony
    from voice_agent_configs group by provider_id having count(*) > 1`);
  for (const w of wiele) {
    bledy.push(`warsztat ${w.warsztat} ma ${w.wierszy} konfiguracje (${w.persony}) — jedna z nich decyduje o odbieraniu telefonu`);
  }

  // 2) REMIS PRIORYTETÓW PERSON.
  //
  // Od 19.08 pilnuje tego indeks unikalny w bazie. Sprawdzenie zostaje, bo
  // indeks da się usunąć jedną migracją, a wtedy nic by o tym nie powiedziało.
  const remis = await pytaj(`
    select priority, count(*)::int ile, string_agg(persona_key, ', ' order by persona_key) persony
    from voice_agent_personas where enabled group by priority having count(*) > 1`);
  for (const r of remis) {
    bledy.push(`priorytet ${r.priority} mają ${r.ile} włączone persony (${r.persony}) — "order by priority desc limit 1" nie ma zwycięzcy`);
  }

  // 3) NUMER PRZYPISANY DO WIĘCEJ NIŻ JEDNEGO WARSZTATU.
  //
  // `voice-agent-init` rozpoznaje warsztat po numerze docelowym przez
  // `.limit(1)`. Dwa aktywne wiersze na ten sam numer znaczą, że o tym,
  // czyj snapshot dostanie dzwoniący, decyduje kolejność wierszy w tabeli —
  // a snapshot zawiera dane klientów warsztatu.
  const numery = await pytaj(`
    select phone_number, count(*)::int ile from voice_numbers
    where status = 'aktywny' group by phone_number having count(*) > 1`);
  for (const n of numery) {
    bledy.push(`numer ${String(n.phone_number).slice(0, -4)}···· ma ${n.ile} aktywne wiersze — rozpoznanie warsztatu jest losowe`);
  }

  return bledy;
}

const biezacy = await stan();

if (process.argv.includes("--zapisz")) {
  mkdirSync(dirname(PLIK), { recursive: true });
  writeFileSync(PLIK, JSON.stringify(biezacy, null, 1) + "\n");
  console.log(`punkt odniesienia zapisany → ${PLIK.replace(ROOT + "/", "")}`);
  console.log(`  warsztatów z konfiguracją: ${biezacy.wierszy_konfiguracji.length}`);
  console.log(`  numerów: ${biezacy.numery.length}`);
  const bledy = await sprawdzenia();
  bledy.forEach((b) => console.log(`  ⚠️ ${b}`));
  process.exit(bledy.length ? 1 : 0);
}

if (!existsSync(PLIK)) {
  console.error("BRAK PUNKTU ODNIESIENIA. Zdejmij go raz: node scripts/voice-punkt-odniesienia.mjs --zapisz");
  process.exit(2);
}
const odniesienie = JSON.parse(readFileSync(PLIK, "utf8"));

// PORÓWNANIE POLE PO POLU, nie „czy pliki są identyczne". Komunikat ma mówić,
// CO się zmieniło — inaczej po czerwonym wyniku i tak trzeba szukać ręcznie.
const roznice = [];
const porownaj = (sciezka, a, b) => {
  const ka = JSON.stringify(a), kb = JSON.stringify(b);
  if (ka !== kb) roznice.push({ sciezka, bylo: ka, jest: kb });
};
for (const sekcja of ["konfiguracje", "numery", "persony", "wierszy_konfiguracji"]) {
  const stare = odniesienie[sekcja] ?? [], nowe = biezacy[sekcja] ?? [];
  if (stare.length !== nowe.length) {
    roznice.push({ sciezka: `${sekcja}: liczba wierszy`, bylo: stare.length, jest: nowe.length });
    continue;
  }
  stare.forEach((w, i) => {
    for (const k of Object.keys(w)) porownaj(`${sekcja}[${i}].${k}`, w[k], nowe[i]?.[k]);
  });
}
let sprawdzonych = 0;
for (const s of ["konfiguracje", "numery", "persony", "wierszy_konfiguracji"]) {
  for (const w of biezacy[s] ?? []) sprawdzonych += Object.keys(w).length;
}
console.log(`punkt odniesienia z ${odniesienie.konfiguracje?.length ?? 0} konfiguracji; porównanych wartości: ${sprawdzonych}`);
const bledy = await sprawdzenia();
if (bledy.length) {
  console.log(`\n❌ ${bledy.length} rzeczy, które nie mają sensu niezależnie od punktu odniesienia:`);
  for (const b of bledy) console.log(`   ${b}`);
}
if (!roznice.length) {
  console.log(bledy.length ? "\n(stan identyczny z punktem odniesienia, ale patrz wyżej)"
                           : "✅ stan agentów identyczny z punktem odniesienia");
  process.exit(bledy.length ? 1 : 0);
}
console.log(`\n❌ ${roznice.length} różnic:`);
for (const r of roznice) console.log(`   ${r.sciezka}\n      było: ${r.bylo}\n      jest: ${r.jest}`);
process.exit(1);
