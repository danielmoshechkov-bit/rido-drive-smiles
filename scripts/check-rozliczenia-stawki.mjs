#!/usr/bin/env node
/**
 * Bramka: stawka rozliczenia pochodzi z JEDNEGO źródła i z właściwego tygodnia.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POWÓD — dwie usterki, których ta bramka pilnuje
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. SIERPIEŃ 2026 — CICHY FALLBACK I MIESZANIE PÓL. Kwoty zmieniały się same
 *    między odświeżeniami. Złożyły się na to dwie przyczyny i obie muszą zostać
 *    zablokowane:
 *      a) WYŚCIG — efekt liczący rozliczenia startował z pustym stanem `cities`,
 *         więc nie umiał rozwiązać miasta kierowcy;
 *      b) CICHY FALLBACK — `driverCitySettings?.pole ?? fleetPole` podstawiał
 *         wartość floty POLE PO POLU. Kierowca z Wrocławia (dodatek 0%) liczył
 *         się dodatkiem floty (1%) — 9% zamiast 8%.
 *    Dlatego rozstrzygnięcie musi być CAŁOŚCIOWE: wygrywa jedno źródło z całym
 *    kompletem wartości, przez `ustawieniaKierowcy(plan, miasto, flota)`.
 *
 * 2. WRZESIEŃ 2026 — PLAN BEZ TYGODNIA. Plan rozliczeń obowiązuje od wskazanego
 *    tygodnia w przód. Wybranie go „dla kierowcy" bez daty działałoby wstecz na
 *    tygodnie już rozliczone i wypłacone. Dlatego `planNaTydzien` musi dostać
 *    początek liczonego tygodnia, a nie być wołane z samym identyfikatorem.
 *
 * Bramka ma KONTROLĘ POZYTYWNĄ (zły kod musi ją zapalić) i KONTROLĘ ODWROTNĄ
 * (dobry kod nie ma prawa jej zapalić).
 *
 * Uruchamiane lokalnie: `npm run lint:rozliczenia`.
 */
import { readFileSync } from "node:fs";

const PLIKI = [
  "src/components/FleetSettlementsView.tsx",
  "supabase/functions/settlements/index.ts",
  "supabase/functions/recalculate-week/index.ts",
];

/** Idiomy, które podstawiają wartość floty POLE PO POLU. */
const ZAKAZANE_IDIOMY = [
  { wzorzec: /driverCitySettings\?\./, opis: "driverCitySettings?." },
  { wzorzec: /\bcs2\?\./, opis: "cs2?." },
  { wzorzec: /\?\?\s*fleetVatRate\b/, opis: "?? fleetVatRate" },
  { wzorzec: /\?\?\s*fleetSettlementMode\b/, opis: "?? fleetSettlementMode" },
  { wzorzec: /\?\?\s*fleetSecondaryVatRate\b/, opis: "?? fleetSecondaryVatRate" },
  { wzorzec: /\?\?\s*fleetAdditionalPercentRate\b/, opis: "?? fleetAdditionalPercentRate" },
  { wzorzec: /\?\?\s*fleetBaseFee\b/, opis: "?? fleetBaseFee" },
  { wzorzec: /\?\?\s*fleetVatRateForSync\b/, opis: "?? fleetVatRateForSync" },
  { wzorzec: /\?\?\s*fleetSettlementModeForSync\b/, opis: "?? fleetSettlementModeForSync" },
  { wzorzec: /\?\?\s*fleetSecondaryVatRateForSync\b/, opis: "?? fleetSecondaryVatRateForSync" },
  { wzorzec: /\?\?\s*fleetAdditionalPercentRateForSync\b/, opis: "?? fleetAdditionalPercentRateForSync" },
];

const POWOD_IDIOMU =
  "cichy fallback na ustawienia floty, pole po polu. Użyj " +
  "`ustawieniaKierowcy(plan, miasto, flota)` — wygrywa JEDNO źródło z całym kompletem.";

/** Zamienia komentarze i napisy na spacje, zachowując długość pliku. */
function bezKomentarzy(tekst) {
  const out = tekst.split("");
  let i = 0;
  const n = tekst.length;
  while (i < n) {
    const c = tekst[i];
    const d = tekst[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && tekst[i] !== "\n") out[i++] = " ";
      continue;
    }
    if (c === "/" && d === "*") {
      out[i++] = " "; out[i++] = " ";
      while (i < n && !(tekst[i] === "*" && tekst[i + 1] === "/")) {
        if (tekst[i] !== "\n") out[i] = " ";
        i++;
      }
      if (i < n) { out[i++] = " "; out[i++] = " "; }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const cudzyslow = c;
      i++;
      while (i < n && tekst[i] !== cudzyslow) {
        if (tekst[i] === "\\") { out[i] = " "; i++; }
        if (i < n && tekst[i] !== "\n") out[i] = " ";
        i++;
      }
      i++;
      continue;
    }
    i++;
  }
  return out.join("");
}

function sprawdzTekst(tekst, { wymagajRozstrzygniecia = true } = {}) {
  const czysty = bezKomentarzy(tekst);
  const bledy = [];
  const linia = (indeks) => czysty.slice(0, indeks).split("\n").length;

  for (const { wzorzec, opis } of ZAKAZANE_IDIOMY) {
    const g = new RegExp(wzorzec.source, "g");
    let m;
    while ((m = g.exec(czysty)) !== null) {
      bledy.push({ linia: linia(m.index), co: opis, dlaczego: POWOD_IDIOMU });
    }
  }

  if (wymagajRozstrzygniecia && !/ustawieniaKierowcy\s*\(/.test(czysty)) {
    bledy.push({
      linia: 0,
      co: "brak wywołania ustawieniaKierowcy(...)",
      dlaczego:
        "stawki mają być rozstrzygnięte jednym wywołaniem (plan → miasto → flota). " +
        "Jeśli plik przestał liczyć rozliczenia, popraw listę w bramce zamiast ją omijać.",
    });
  }

  // Plan bez tygodnia działałby wstecz na tygodnie już wypłacone.
  const g = /planNaTydzien\s*\(([^)]*)\)/g;
  let m;
  while ((m = g.exec(czysty)) !== null) {
    const argumenty = m[1].split(",").map((a) => a.trim()).filter(Boolean);
    if (argumenty.length < 2) {
      bledy.push({
        linia: linia(m.index),
        co: `planNaTydzien(${m[1].trim()})`,
        dlaczego:
          "plan obowiązuje OD TYGODNIA w przód — bez początku tygodnia przypisanie " +
          "działa wstecz na rozliczenia już wypłacone.",
      });
    }
  }

  return bledy;
}

// ── Kontrola pozytywna: zły kod MUSI zapalić bramkę ─────────────────────────
const ZLE = [
  ["const v = driverCitySettings?.vat_rate ?? fleetVatRate;", "cichy fallback po polu"],
  ["const m = cs2?.settlement_mode;", "cs2?. w funkcji brzegowej"],
  ["const r = mojeUstawienia.vat_rate ?? fleetSecondaryVatRate;", "?? na wartości floty"],
  ["const p = planNaTydzien(driverId);", "plan bez tygodnia"],
];
for (const [kod, opis] of ZLE) {
  if (sprawdzTekst(kod, { wymagajRozstrzygniecia: false }).length === 0) {
    console.error(`✗ KONTROLA POZYTYWNA PADŁA — bramka nie widzi złego kodu (${opis}):`);
    console.error(`  ${kod}`);
    process.exit(1);
  }
}

// ── Kontrola odwrotna: dobry kod NIE MA prawa zapalić bramki ────────────────
const DOBRE = [
  "const { ustawienia, zrodlo } = ustawieniaKierowcy(plan, miasto, flota);",
  "const p = planNaTydzien(przypisania, driver.id, currentWeek.start);",
  "const u = ustawienia.uber_calculation_mode ?? 'netto';",
  'const opis = "driverCitySettings?.vat_rate w napisie to nie kod";',
];
for (const kod of DOBRE) {
  const trafienia = sprawdzTekst(kod, { wymagajRozstrzygniecia: false });
  if (trafienia.length > 0) {
    console.error("✗ KONTROLA ODWROTNA PADŁA — bramka zapala się na dobrym kodzie:");
    console.error(`  ${kod}`);
    console.error(`  reguła: ${trafienia[0].co}`);
    process.exit(1);
  }
}

// ── Właściwy przemiat ───────────────────────────────────────────────────────
const bledy = [];
for (const plik of PLIKI) {
  let tekst;
  try {
    tekst = readFileSync(plik, "utf8");
  } catch {
    console.error(`✗ Brak pliku ${plik}. Popraw listę w bramce, zamiast ją omijać.`);
    process.exit(1);
  }
  for (const b of sprawdzTekst(tekst)) bledy.push({ plik, ...b });
}

// ── Wyścig: efekt liczący rozliczenia musi czekać na `cities` ──────────────
{
  const PLIK = "src/components/FleetSettlementsView.tsx";
  const zrodlo = readFileSync(PLIK, "utf8");
  const ZNACZNIK = "checkForNewRecordsAfterLoad();";
  const i = zrodlo.indexOf(ZNACZNIK);
  if (i === -1) {
    bledy.push({
      plik: PLIK,
      linia: 0,
      co: "brak efektu ładującego rozliczenia",
      dlaczego: "bramka nie potrafi znaleźć efektu. Popraw ją, zamiast ją omijać.",
    });
  } else {
    const poczatek = zrodlo.lastIndexOf("useEffect(", i);
    const depsOd = zrodlo.indexOf("}, [", i);
    const depsDo = depsOd === -1 ? -1 : zrodlo.indexOf("]);", depsOd);
    const deps = depsOd === -1 || depsDo === -1 ? "" : zrodlo.slice(depsOd, depsDo + 3);
    const efekt = depsDo === -1 ? "" : zrodlo.slice(poczatek, depsDo + 3);
    const linia = (idx) => zrodlo.slice(0, idx).split("\n").length;

    if (!deps.includes("cities")) {
      bledy.push({
        plik: PLIK, linia: linia(poczatek),
        co: "`cities` poza tablicą zależności efektu",
        dlaczego: "efekt zamyka w domknięciu pustą listę miast i liczy, zanim się załadują.",
      });
    }
    if (!efekt.includes("cities.length > 0")) {
      bledy.push({
        plik: PLIK, linia: linia(poczatek),
        co: "brak warunku `cities.length > 0`",
        dlaczego: "bez listy miast nie da się rozwiązać miasta kierowcy.",
      });
    }
  }
}

if (bledy.length > 0) {
  console.error("✗ Stawki rozliczeń brane po swojemu:\n");
  for (const b of bledy) {
    console.error(`  ${b.plik}:${b.linia}  „${b.co}"`);
    console.error(`     ${b.dlaczego}\n`);
  }
  process.exit(1);
}

console.log("✓ Stawki z jednego źródła (plan → miasto → flota), plan wybierany na tydzień, efekt czeka na `cities`.");
