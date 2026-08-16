// ============================================================================
// supervoip-odczyt.mjs — JEDYNA DROGA DO API OPERATORA, WYŁĄCZNIE ODCZYT.
//
// U operatora zapis kosztuje pieniądze i dzwoni do ludzi:
//   POST /api/voip_numbers      kupuje numer z salda konta
//   POST /api/asterisk/do_call  wykonuje POŁĄCZENIE TELEFONICZNE
//   POST /api/sms_messages      wysyła SMS
//
// 15.08 zostawiłem produkcję ElevenLabs na złym modelu, sondując PATCH-em.
// 17.08 zapisałem `turn_timeout: -1`, sondując ponownie. Ta sama pomyłka
// tutaj nie kończy się na złej wartości w konfiguracji — kończy się rachunkiem
// albo telefonem do losowej osoby.
//
// ZASADA 32: błąd, w który wpadasz mimo wiedzy, że istnieje, nie jest błędem
// uwagi — jest brakiem kontroli. Dlatego metoda nie jest parametrem.
//
//   node scripts/supervoip-odczyt.mjs /api/customers/me
//   node scripts/supervoip-odczyt.mjs "/api/regions?country=/api/countries/96"
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const BAZA = "https://restapi.supervoip.pl";

for (const line of existsSync(join(ROOT, ".env.local")) ? readFileSync(join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

/**
 * GET do API operatora. Metody nie da się podać — to jedyna gwarancja,
 * że „sprawdzam, co zwraca" nie zamieni się w „kupiłem numer".
 */
export async function odczytaj(sciezka) {
  const klucz = process.env.SUPERVOIP_API_KEY;
  if (!klucz) throw new Error("BRAK SUPERVOIP_API_KEY — zatrzymuję się, nie obchodzę.");
  if (!String(sciezka).startsWith("/api/")) throw new Error(`ścieżka musi zaczynać się od /api/ — dostałem: ${sciezka}`);
  const r = await fetch(BAZA + sciezka, {
    method: "GET",
    headers: { Authorization: `Bearer ${klucz}`, Accept: "application/ld+json" },
  });
  const tekst = await r.text();
  if (!r.ok) throw new Error(`GET ${sciezka} → ${r.status}: ${tekst.slice(0, 400)}`);
  try {
    return JSON.parse(tekst);
  } catch {
    throw new Error(`GET ${sciezka} → odpowiedź nie jest JSON-em: ${tekst.slice(0, 200)}`);
  }
}

/** Pozycje kolekcji Hydra, niezależnie od tego, czy przyszły jako member, czy goły array. */
export const pozycje = (odp) => odp?.["hydra:member"] ?? odp?.member ?? (Array.isArray(odp) ? odp : []);
export const ile = (odp) => odp?.["hydra:totalItems"] ?? odp?.totalItems ?? pozycje(odp).length;

if (import.meta.url === `file://${process.argv[1]}`) {
  const sciezka = process.argv[2];
  if (!sciezka) {
    console.error("użycie: node scripts/supervoip-odczyt.mjs /api/...");
    process.exit(2);
  }
  odczytaj(sciezka)
    .then((o) => console.log(JSON.stringify(o, null, 1)))
    .catch((e) => { console.error("BŁĄD:", e.message); process.exit(1); });
}
