#!/usr/bin/env node
/**
 * Bramka: podatek w rozliczeniach liczony w JEDNYM miejscu i w jeden sposób.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POWÓD (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 * Ten sam podatek liczyły CZTERY miejsca — panel flotowy, ekran kierowcy
 * i dwie funkcje brzegowe — każde trochę inaczej. Wyszły z tego dwie usterki:
 *
 *  1. 50% VAT-u od paliwa było doliczane do WYPŁATY jako „zwrot VAT", zamiast
 *     pomniejszać PODATEK. Wypłata wychodziła ta sama, ale kolumna „Podatek"
 *     pokazywała o pół VAT-u za dużo (ASHRAF 400,08 zamiast 363,50) i nie dało
 *     się jej pogodzić z arkuszem, którym flota rozlicza się naprawdę.
 *
 *  2. W trybie „jeden podatek" podstawą Ubera była kolumna D („Wypłacono Ci")
 *     bez gotówki z kolumny F. Gotówka odebrana od pasażerów jest zarobkiem,
 *     więc podatek był zaniżony dokładnie o 8% gotówki: Dawid Czostek 42,02
 *     zamiast 49,22, Barys Mileuski 315,23 zamiast 331,26.
 *
 * Wzory mieszkają teraz w `supabase/functions/_shared/rozliczenia.ts` i mają
 * testy na arkuszu wzorcowym (`npm run test:rozliczenia`). Ta bramka pilnuje,
 * żeby nie odrosły kopie.
 *
 * Ma WŁASNĄ KONTROLĘ POZYTYWNĄ (kod, o którym wiadomo, że jest zły, musi
 * zapalić) i KONTROLĘ ODWROTNĄ (kod, o którym wiadomo, że jest dobry, nie ma
 * prawa zapalić). Bez tego drugiego zawężenie warunku potrafi zjeść całą
 * czułość, a bramka dalej świeci na zielono.
 */
import { readFileSync } from "node:fs";

const PLIKI = [
  "src/components/FleetSettlementsView.tsx",
  "src/components/DriverSettlements.tsx",
  "supabase/functions/settlements/index.ts",
  "supabase/functions/recalculate-week/index.ts",
];

/** Plik ze wzorami — tu formuły MAJĄ prawo stać. */
const ZRODLO_WZOROW = "supabase/functions/_shared/rozliczenia.ts";

const REGULY = [
  {
    nazwa: "zwrot VAT od paliwa doliczany do wypłaty",
    wzorzec: /\+\s*(total_)?fuel_?[Vv]at_?(Refund|refund)|\+\s*fuelVATRefund|\+\s*odliczenieVatPaliwa\b(?![^\n]*earningsForPayout)/,
    dlaczego:
      "50% VAT-u od paliwa POMNIEJSZA PODATEK (patrz `pomniejszOPaliwo`). " +
      "Doliczone osobno do wypłaty liczy ten sam grosz dwa razy i rozjeżdża " +
      "kolumnę „Podatek” z arkuszem.",
  },
  {
    nazwa: "własny wzór na VAT od paliwa",
    wzorzec: /\/\s*1\.23|23\s*\/\s*123/,
    dlaczego:
      "wzór na VAT od paliwa ma jedno miejsce: `vatOdPaliwa` w " +
      `${ZRODLO_WZOROW}. Kopia rozjedzie się przy pierwszej zmianie stawki.`,
  },
  {
    nazwa: "podstawa Ubera bez gotówki",
    wzorzec: /uber_?[Pp]ayout_?[Dd]\s*\|\|\s*uber_?[Bb]ase/,
    dlaczego:
      "w trybie „jeden podatek” podstawą jest kolumna D RAZEM z gotówką (F), " +
      "czyli `uber_base`. Samo D zaniża podatek o procent od gotówki.",
  },
];

/** Zamienia komentarze i napisy na spacje, zachowując długość (numery linii zostają). */
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
      out[i++] = " ";
      out[i++] = " ";
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

function sprawdzTekst(tekst) {
  const czysty = bezKomentarzy(tekst);
  const trafienia = [];
  for (const regula of REGULY) {
    const wzorzec = new RegExp(regula.wzorzec.source, "g");
    let m;
    while ((m = wzorzec.exec(czysty)) !== null) {
      trafienia.push({
        regula: regula.nazwa,
        dlaczego: regula.dlaczego,
        linia: czysty.slice(0, m.index).split("\n").length,
        fragment: m[0].trim(),
      });
    }
  }
  return trafienia;
}

// ── Kontrola pozytywna: zły kod MUSI zapalić bramkę ─────────────────────────
const ZLE_PRZYKLADY = [
  "const payout = base - vat - fuel + fuel_vat_refund;",
  "const p = netto - cash + fuelVatRefund - fee;",
  "const zwrot = (fuel - fuel / 1.23) / 2;",
  "const vatPaliwa = fuel * 23 / 123;",
  "const podstawa = Math.max(0, uber_payout_d || uber_base);",
];
for (const przyklad of ZLE_PRZYKLADY) {
  if (sprawdzTekst(przyklad).length === 0) {
    console.error("✗ KONTROLA POZYTYWNA PADŁA — bramka nie widzi złego kodu:");
    console.error(`  ${przyklad}`);
    console.error("  Popraw bramkę, zamiast ją omijać.");
    process.exit(1);
  }
}

// ── Kontrola odwrotna: dobry kod NIE MA prawa zapalić bramki ────────────────
const DOBRE_PRZYKLADY = [
  "const { podatek } = pomniejszOPaliwo(podatekBrutto, paliwo, naliczamy);",
  "const payout = wyplataTygodniowa({ przychodBazowy, prowizje, gotowka, podatek, paliwo });",
  "const podstawa = Math.max(0, uber_base);",
  "// zwrot VAT + fuel_vat_refund w komentarzu nie jest kodem",
  'const opis = "zwrot VAT + fuel_vat_refund w napisie też nie";',
];
for (const przyklad of DOBRE_PRZYKLADY) {
  const trafienia = sprawdzTekst(przyklad);
  if (trafienia.length > 0) {
    console.error("✗ KONTROLA ODWROTNA PADŁA — bramka zapala się na dobrym kodzie:");
    console.error(`  ${przyklad}`);
    console.error(`  reguła: ${trafienia[0].regula}`);
    console.error("  Zawęź warunek — bramka krzycząca na dobry kod uczy ignorowania siebie.");
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
    // Plik zniknął albo zmienił nazwę — bramka bez pliku nie pilnuje niczego.
    console.error(`✗ Brak pliku ${plik}. Popraw listę w bramce, zamiast ją omijać.`);
    process.exit(1);
  }
  for (const trafienie of sprawdzTekst(tekst)) {
    bledy.push({ plik, ...trafienie });
  }
}

if (bledy.length > 0) {
  console.error("✗ Podatek liczony po swojemu:\n");
  for (const b of bledy) {
    console.error(`  ${b.plik}:${b.linia}  „${b.fragment}"`);
    console.error(`     ${b.regula} — ${b.dlaczego}\n`);
  }
  console.error(`Wzory są w ${ZRODLO_WZOROW}, testy: npm run test:rozliczenia`);
  process.exit(1);
}

console.log("✓ Podatek liczony wspólnym modułem: brak kopii wzorów i brak podwójnego odliczenia.");
