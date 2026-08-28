#!/usr/bin/env node
/**
 * Bramka: stawka rozliczenia zawsze z ustawień miasta kierowcy.
 *
 * Kwoty rozliczeń zmieniały się same między odświeżeniami. Złożyły się na to DWIE
 * przyczyny i obie muszą zostać zablokowane — sama jedna nie wystarczy:
 *
 *  1. WYŚCIG. Efekt liczący rozliczenia startował z pustym stanem `cities`
 *     (ładowanym osobnym efektem, spoza jego tablicy zależności). Bez listy miast
 *     `cities.find(...)` nie rozwiązywało miasta kierowcy.
 *
 *  2. CICHY FALLBACK. Gdy miasta nie udało się rozwiązać, kalkulacja spadała na
 *     ustawienia floty przez `driverCitySettings?.pole ?? fleetPole`. Kierowca
 *     z Wrocławia (dodatek 0%) liczył się dodatkiem floty (1%) — 9% zamiast 8%.
 *
 * Fallback na ustawienia floty wolno zastosować WYŁĄCZNIE dla miasta, które nie ma
 * żadnego wiersza w fleet_city_settings, i tylko jawnym `driverCitySettings ? ... : ...`,
 * a wiersz musi wtedy dostać widoczny wykrzyknik. Idiom z `?.` jest zakazany, bo
 * podstawia stawkę floty także wtedy, gdy miasto ma swoje ustawienia.
 *
 * Uruchamiane lokalnie: `npm run lint:rozliczenia`.
 */
import { readFileSync } from "node:fs";

const PLIK = "src/components/FleetSettlementsView.tsx";
const zrodlo = readFileSync(PLIK, "utf8");
const linia = (indeks) => zrodlo.slice(0, indeks).split("\n").length;

const bledy = [];

// ── 1. Cichy fallback przez opcjonalne łańcuchowanie ─────────────────────────
// W wersji ścisłej nigdy nie czytamy pól przez `driverCitySettings?.` — obecność
// miasta rozstrzyga jawny warunek, a nie `?.` zsuwające się na ustawienia floty.
{
  const IDIOM = "driverCitySettings?.";
  let od = 0;
  for (;;) {
    const i = zrodlo.indexOf(IDIOM, od);
    if (i === -1) break;
    bledy.push({
      linia: linia(i),
      co: IDIOM,
      dlaczego:
        "cichy fallback na ustawienia floty. Użyj `driverCitySettings ? driverCitySettings.pole : fleetPole` " +
        "i oznacz wiersz wykrzyknikiem, gdy miasto nie ma ustawień.",
    });
    od = i + IDIOM.length;
  }
}

// ── 2. Podstawianie wartości floty przez `??` ────────────────────────────────
// Te pięć kolumn jest w bazie NOT NULL, więc dla miasta z wierszem `??` nie ma
// prawa się uruchomić — jego obecność znaczy, że fallback wrócił.
// fleetUberCalcMode jest świadomie pominięty: uber_calculation_mode to JEDYNA
// z szóstki kolumna nullowalna (NULL na wierszach bolt), więc `??` jest tam zasadne.
{
  const ZAKAZANE = [
    "?? fleetVatRate",
    "?? fleetSettlementMode",
    "?? fleetSecondaryVatRate",
    "?? fleetAdditionalPercentRate",
    "?? fleetBaseFee",
  ];
  for (const wzorzec of ZAKAZANE) {
    let od = 0;
    for (;;) {
      const i = zrodlo.indexOf(wzorzec, od);
      if (i === -1) break;
      bledy.push({
        linia: linia(i),
        co: wzorzec,
        dlaczego:
          "stawka ma pochodzić z ustawień miasta kierowcy. Kolumna jest NOT NULL, " +
          "więc `??` może się uruchomić tylko wtedy, gdy fallback wrócił.",
      });
      od = i + wzorzec.length;
    }
  }
}

sprawdzPrzypisania(
  zrodlo,
  ["driverVatRate", "driverSettlementMode", "driverSecondaryVatRate", "driverAdditionalPercentRate", "driverUberCalcMode", "driverBaseFee"],
  "driverCitySettings",
  (indeks, co, dlaczego) => bledy.push({ linia: linia(indeks), co, dlaczego }),
);

// ── 3. Wyścig: efekt musi czekać na `cities` i mieć je w zależnościach ───────
{
  // Kotwiczymy na efekcie ladujacym rozliczenia, a nie na pierwszym z brzegu
  // wywolaniu fetchSettlements() (te sa tez w obsludze przyciskow).
  const ZNACZNIK = "checkForNewRecordsAfterLoad();";
  const i = zrodlo.indexOf(ZNACZNIK);
  if (i === -1) {
    bledy.push({
      linia: 0,
      co: "brak wywołania fetchSettlements() w efekcie",
      dlaczego: "bramka nie potrafi znaleźć efektu ładującego rozliczenia. Popraw ją, zamiast ją omijać.",
    });
  } else {
    // Początek efektu: ostatnie "useEffect(" przed wywołaniem.
    const poczatek = zrodlo.lastIndexOf("useEffect(", i);
    // Koniec: ten efekt zamyka się na "}, [ ... ]);", a NIE na "});" — szukanie
    // "});" przeskakiwało poza efekt i czytało cudzą tablicę zależności.
    const depsOd = zrodlo.indexOf("}, [", i);
    const depsDo = depsOd === -1 ? -1 : zrodlo.indexOf("]);", depsOd);
    const deps = depsOd === -1 || depsDo === -1 ? "" : zrodlo.slice(depsOd, depsDo + 3);
    const efekt = depsDo === -1 ? "" : zrodlo.slice(poczatek, depsDo + 3);

    if (!deps.includes("cities")) {
      bledy.push({
        linia: linia(poczatek),
        co: "`cities` poza tablicą zależności efektu",
        dlaczego:
          "efekt zamyka w domknięciu pustą listę miast i liczy rozliczenia, zanim miasta się załadują. " +
          "To był wyścig dający różne kwoty przy kolejnych odświeżeniach.",
      });
    }
    if (!efekt.includes("cities.length > 0")) {
      bledy.push({
        linia: linia(poczatek),
        co: "brak warunku `cities.length > 0`",
        dlaczego:
          "bez załadowanej listy miast nie da się rozwiązać miasta kierowcy, " +
          "a stawka musi pochodzić z jego ustawień.",
      });
    }
  }
}

// Sprawdza, ze przypisanie `const <nazwa> = ...;` w ogole siega po ustawienia miasta.
// Bez tego przechodzi najgorszy wariant: `const driverAdditionalPercentRate = flota;`
// — bezwarunkowa wartosc floty, bez "??" i bez "?.", czyli dokladnie ten blad,
// ktory kazal kierowcy z Wroclawia liczyc sie dodatkiem 1% zamiast 0%.
function sprawdzPrzypisania(tekst, nazwy, zrodloMiasta, dodajBlad) {
  for (const nazwa of nazwy) {
    const szukane = `const ${nazwa} =`;
    const i = tekst.indexOf(szukane);
    if (i === -1) {
      dodajBlad(0, `brak przypisania ${nazwa}`, "bramka nie potrafi sprawdzic tego pliku. Popraw ja, zamiast ja omijac.");
      continue;
    }
    const do_ = tekst.indexOf(";", i);
    const wyrazenie = do_ === -1 ? tekst.slice(i) : tekst.slice(i, do_);
    if (!wyrazenie.includes(zrodloMiasta)) {
      dodajBlad(
        i,
        `${nazwa} nie siega po ${zrodloMiasta}`,
        "wartosc brana bezwarunkowo z ustawien floty. Stawka ma pochodzic z ustawien miasta kierowcy.",
      );
    }
  }
}

// ── 4. Ta sama zasada w funkcji brzegowej ────────────────────────────────────
// settlements/index.ts liczy rozliczenia po stronie serwera i ma ten sam obowiazek:
// wartosci z wiersza miasta, fallback na flote tylko dla miasta bez wiersza.
// Tu bylo najgorzej — driverSecondaryVatRate i driverAdditionalPercentRate braly
// wartosc floty BEZWARUNKOWO, a SELECT w ogole nie pobieral tych kolumn.
{
  const PLIK_EDGE = "supabase/functions/settlements/index.ts";
  const edge = readFileSync(PLIK_EDGE, "utf8");
  const liniaEdge = (indeks) => edge.slice(0, indeks).split("\n").length;

  const dodaj = (indeks, co, dlaczego) =>
    bledy.push({ plik: PLIK_EDGE, linia: liniaEdge(indeks), co, dlaczego });

  // Idiom `cs2?.pole ?? flota` podstawia stawke floty takze miastu, ktore ma ustawienia.
  {
    const IDIOM = "cs2?.";
    let od = 0;
    for (;;) {
      const i = edge.indexOf(IDIOM, od);
      if (i === -1) break;
      dodaj(
        i,
        IDIOM,
        "cichy fallback na ustawienia floty. Uzyj `cs2 ? cs2.pole : fleetPoleForSync`.",
      );
      od = i + IDIOM.length;
    }
  }

  // Kolumny NOT NULL — `??` na wartosc floty znaczy, ze fallback wrocil.
  // fleetUberCalcModeForSync pominiety: uber_calculation_mode jest nullowalne.
  for (const wzorzec of [
    "?? fleetVatRateForSync",
    "?? fleetSettlementModeForSync",
    "?? fleetSecondaryVatRateForSync",
    "?? fleetAdditionalPercentRateForSync",
  ]) {
    let od = 0;
    for (;;) {
      const i = edge.indexOf(wzorzec, od);
      if (i === -1) break;
      dodaj(i, wzorzec, "stawka ma pochodzic z ustawien miasta kierowcy.");
      od = i + wzorzec.length;
    }
  }

  sprawdzPrzypisania(
    edge,
    ["driverVatRate", "driverSettlementMode", "driverSecondaryVatRate", "driverAdditionalPercentRate", "driverUberCalcMode"],
    "cs2",
    dodaj,
  );

  // Bez tych kolumn w SELECT funkcja fizycznie nie ma czym policzyc stawki miasta.
  const zapytanieOd = edge.indexOf(".from('fleet_city_settings')");
  if (zapytanieOd === -1) {
    dodaj(0, "brak zapytania o fleet_city_settings", "bramka nie potrafi sprawdzic tego pliku. Popraw ja, zamiast ja omijac.");
  } else {
    const selectOd = edge.indexOf(".select(", zapytanieOd);
    const selectDo = edge.indexOf(")", selectOd);
    const select = selectOd === -1 ? "" : edge.slice(selectOd, selectDo);
    for (const kolumna of ["additional_percent_rate", "secondary_vat_rate"]) {
      if (!select.includes(kolumna)) {
        dodaj(
          selectOd === -1 ? 0 : selectOd,
          `SELECT bez kolumny ${kolumna}`,
          "bez niej funkcja nie ma czym policzyc stawki miasta i bierze wartosc floty.",
        );
      }
    }
  }
}

if (bledy.length > 0) {
  console.error("✖ Stawka rozliczenia może nie pochodzić z ustawień miasta kierowcy.\n");
  for (const { plik, linia: nr, co, dlaczego } of bledy) {
    console.error(`  ${plik ?? PLIK}:${nr}  →  ${co}`);
    console.error(`      ${dlaczego}\n`);
  }
  console.error(
    "  Historia: to przez te dwie rzeczy kwota rozliczenia zmieniała się sama\n" +
      "  między odświeżeniami — 8% albo 9% od tego samego brutto.",
  );
  process.exit(1);
}

console.log("✓ Stawki brane z ustawień miasta: brak cichego fallbacku, efekt czeka na `cities`.");
