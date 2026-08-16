// ============================================================================
// kolumny-ktorych-nie-ma.mjs — CZY PYTAMY BAZĘ O KOLUMNY, KTÓRYCH NIE MA.
//
// Powód powstania: panel warsztatu pytał `service_providers` o kolumny
// `address, city`. Takich kolumn nie ma — są `company_address`, `company_city`.
// Zapytanie ZAWSZE zwracało błąd, błędu nikt nie sprawdzał (destrukturyzacja
// bez `error`), więc nowy warsztat dostawał pusty formularz zamiast
// wypełnionego danymi, które już podał. Nikt tego nie zgłosił, bo puste pole
// wygląda jak „jeszcze nie wypełniłem".
//
// W repozytorium jest 762 odczytów bez sprawdzenia `error` w 305 plikach —
// dopisywanie `error` wszędzie to praca na tygodnie i w większości miejsc
// bez znaczenia. Ale JEDNA podklasa tych błędów jest zawsze prawdziwa
// i wykrywalna bez uruchamiania aplikacji: zapytanie o nieistniejącą kolumnę.
// Ono nie „może zawieść" — ono zawodzi ZAWSZE, przy każdym wywołaniu.
//
// Ten skrypt czyta prawdziwy schemat bazy i porównuje z tym, o co pyta kod.
//
//   node scripts/kolumny-ktorych-nie-ma.mjs
// ============================================================================
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of existsSync(join(ROOT, ".env.local")) ? readFileSync(join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const PROJEKT = "wclrrytmrscqvsyxyvnn";

async function schemat() {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJEKT}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "select table_name, column_name from information_schema.columns where table_schema='public'",
    }),
  });
  if (!r.ok) throw new Error(`odczyt schematu → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const mapa = new Map();
  for (const w of await r.json()) {
    if (!mapa.has(w.table_name)) mapa.set(w.table_name, new Set());
    mapa.get(w.table_name).add(w.column_name);
  }
  return mapa;
}

function pliki(katalog) {
  const out = [];
  for (const w of readdirSync(katalog)) {
    const p = join(katalog, w);
    if (statSync(p).isDirectory()) out.push(...pliki(p));
    else if (/\.(ts|tsx)$/.test(w) && !p.includes("integrations/supabase/types")) out.push(p);
  }
  return out;
}

/**
 * Kolumny z `.select("…")`. Odrzucamy to, czego nie da się sprawdzić statycznie:
 * osadzone relacje (`klient:workshop_clients(...)`), gwiazdki i aliasy.
 * Fałszywy alarm jest tu gorszy niż przeoczenie — kontrola, która krzyczy
 * na poprawny kod, zostaje wyłączona po tygodniu.
 */
export function kolumnyZSelect(tekst) {
  // RELACJE OSADZONE USUWAMY W CAŁOŚCI, razem z nazwą.
  // Pierwsza wersja kasowała tylko nawiasy, więc `vehicles(brand, model)`
  // zostawiało „vehicles" wyglądające jak kolumna — i kontrola zgłosiła
  // 66 „błędów", z których większość była poprawnym kodem. Kontrola, która
  // krzyczy na poprawny kod, zostaje wyłączona po tygodniu (zasada 28).
  let t = tekst;
  for (let i = 0; i < 6; i++) {
    const nowy = t.replace(/[A-Za-z_][\w]*\s*(?::\s*[A-Za-z_][\w!.]*)?\s*\([^()]*\)/g, "");
    if (nowy === t) break;
    t = nowy;
  }
  return t
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .filter((k) => !k.includes("*") && !k.includes(":") && !k.includes("!") && !k.includes(" "))
    .filter((k) => /^[a-z_][a-z0-9_]*$/i.test(k));
}

export function znajdzZapytania(kod) {
  const out = [];
  const re = /\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)\s*(?:\.\w+\([^)]*\)\s*)*?\.select\(\s*["'`]([^"'`]*)["'`]/gs;
  for (const m of kod.matchAll(re)) {
    out.push({ tabela: m[1], kolumny: kolumnyZSelect(m[2]), linia: kod.slice(0, m.index).split("\n").length });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mapa = await schemat();
  console.log(`schemat: ${mapa.size} tabel`);
  const bledy = [];
  let sprawdzonych = 0;
  for (const p of pliki(join(ROOT, "src"))) {
    for (const z of znajdzZapytania(readFileSync(p, "utf8"))) {
      const kolumny = mapa.get(z.tabela);
      if (!kolumny) continue;                       // widok albo tabela spoza public — nie zgadujemy
      for (const k of z.kolumny) {
        sprawdzonych++;
        if (!kolumny.has(k)) bledy.push({ plik: p.replace(ROOT + "/", ""), linia: z.linia, tabela: z.tabela, kolumna: k });
      }
    }
  }
  // LICZNIK, nie samo „czysto". Kontrola, która sprawdziła zero kolumn,
  // wygląda w wyniku identycznie jak kontrola, która sprawdziła wszystkie.
  console.log(`sprawdzonych odwołań do kolumn: ${sprawdzonych}`);
  if (!bledy.length) { console.log("✅ każda kolumna, o którą pyta kod, istnieje w bazie"); process.exit(0); }
  console.log(`\n❌ ${bledy.length} zapytań o kolumny, których NIE MA:`);
  for (const b of bledy) console.log(`   ${b.plik}:${b.linia}  ${b.tabela}.${b.kolumna}`);
  process.exit(1);
}
