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
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of existsSync(join(ROOT, ".env.local")) ? readFileSync(join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const PROJEKT = "wclrrytmrscqvsyxyvnn";
const MIGAWKA = join(ROOT, "config/schemat-kolumn.json");

// DWA TRYBY, i to nie jest wygodnictwo.
//
// CI nie ma dostępu do bazy i nie powinno go mieć — kontrola, która wymaga
// sekretu produkcyjnego, albo nie zostanie włączona, albo ten sekret trafi
// tam, gdzie nie powinien. Dlatego w CI porównujemy kod z MIGAWKĄ schematu
// leżącą w repozytorium, a migawkę odświeża człowiek: `--odswiez`.
//
// Migawka jest jednocześnie drugą kontrolą: jeśli ktoś doda kolumnę i nie
// odświeży pliku, w przeglądzie zmian widać, że schemat się rozjechał.

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
  let mapa;
  if (process.argv.includes("--odswiez")) {
    mapa = await schemat();
    mkdirSync(dirname(MIGAWKA), { recursive: true });
    writeFileSync(MIGAWKA, JSON.stringify({
      pobrano: new Date().toISOString().slice(0, 10),
      tabele: Object.fromEntries([...mapa].map(([t, k]) => [t, [...k].sort()])),
    }, null, 0) + "\n");
    console.log(`migawka odświeżona: ${mapa.size} tabel → ${MIGAWKA.replace(ROOT + "/", "")}`);
  } else {
    if (!existsSync(MIGAWKA)) {
      console.error("BRAK MIGAWKI SCHEMATU. Uruchom raz: node scripts/kolumny-ktorych-nie-ma.mjs --odswiez");
      process.exit(2);
    }
    const zapis = JSON.parse(readFileSync(MIGAWKA, "utf8"));
    mapa = new Map(Object.entries(zapis.tabele).map(([t, k]) => [t, new Set(k)]));
    const dni = Math.round((Date.now() - Date.parse(zapis.pobrano)) / 864e5);
    if (dni > 30) console.warn(`⚠️ migawka schematu ma ${dni} dni — odśwież: --odswiez`);
    console.log(`schemat z migawki (${zapis.pobrano}): ${mapa.size} tabel`);
  }
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

  // ZNANE BRAKI — lista, która ma tylko MALEĆ.
  //
  // W chwili powstania kontroli w kodzie było 13 takich zapytań, w modułach,
  // których ta praca nie dotyczy (flota, sprzedaż, nieruchomości). Zrobienie
  // z tego czerwonego CI na starcie znaczyłoby, że wszyscy nauczą się je
  // przeskakiwać — a wtedy kontrola przestaje cokolwiek znaczyć.
  //
  // Dlatego: NOWY brak wywraca CI od razu. Brak z listy tylko przypomina o sobie.
  // Brak, który zniknął z kodu, a został na liście, TEŻ wywraca CI — nieaktualna
  // lista wyjątków ukrywa regresje równie skutecznie jak brak kontroli.
  const PLIK_ZNANE = join(ROOT, "config/kolumny-znane-braki.json");
  const znane = existsSync(PLIK_ZNANE) ? JSON.parse(readFileSync(PLIK_ZNANE, "utf8")).braki ?? [] : [];
  const klucz = (b) => `${b.plik}|${b.tabela}.${b.kolumna}`;
  const zbiorZnanych = new Set(znane.map(klucz));
  const nowe = bledy.filter((b) => !zbiorZnanych.has(klucz(b)));
  const znalezione = new Set(bledy.map(klucz));
  const naprawione = znane.filter((b) => !znalezione.has(klucz(b)));

  if (znane.length) console.log(`znane braki (do usunięcia, lista ma maleć): ${znane.length - naprawione.length}`);
  if (naprawione.length) {
    console.log(`\n❌ ${naprawione.length} braków ZNIKNĘŁO z kodu, ale zostało na liście znanych — usuń je z config/kolumny-znane-braki.json:`);
    for (const b of naprawione) console.log(`   ${b.plik}  ${b.tabela}.${b.kolumna}`);
  }
  if (nowe.length) {
    console.log(`\n❌ ${nowe.length} NOWYCH zapytań o kolumny, których NIE MA:`);
    for (const b of nowe) console.log(`   ${b.plik}:${b.linia}  ${b.tabela}.${b.kolumna}`);
  }
  if (nowe.length || naprawione.length) process.exit(1);
  console.log(bledy.length
    ? "✅ bez nowych braków (lista znanych bez zmian)"
    : "✅ każda kolumna, o którą pyta kod, istnieje w bazie");
  process.exit(0);
}
