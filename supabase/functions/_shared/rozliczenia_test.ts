// Testy wzorów rozliczeniowych na PRAWDZIWYM arkuszu floty.
//
// Źródło prawdy: fixtures/wzorzec-rozliczenia.csv — eksport z arkusza Google,
// którym Car4Ride rozlicza kierowców. Każda liczba w tych testach pochodzi
// stamtąd, nie z głowy.
//
// Uruchomienie: `npm run test:rozliczenia`
import { assert, assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  czyNaliczacPodatek,
  odliczenieVatOdPaliwa,
  oplataZPlanu,
  policzPodatek,
  przychodLaczny,
  stawkaZPlanu,
  vatOdPaliwa,
  wyplataTygodniowa,
} from "./rozliczenia.ts";

const GROSZ = 0.005;

// ── wczytanie arkusza ────────────────────────────────────────────────────────

/** Dzieli wiersz CSV z uwzględnieniem cudzysłowów (w środku pól są przecinki dziesiętne). */
function podzielWiersz(wiersz: string): string[] {
  const pola: string[] = [];
  let biezace = "";
  let wCudzyslowie = false;
  for (let i = 0; i < wiersz.length; i++) {
    const znak = wiersz[i];
    if (znak === '"') {
      if (wCudzyslowie && wiersz[i + 1] === '"') { biezace += '"'; i++; continue; }
      wCudzyslowie = !wCudzyslowie;
      continue;
    }
    if (znak === "," && !wCudzyslowie) { pola.push(biezace); biezace = ""; continue; }
    biezace += znak;
  }
  pola.push(biezace);
  return pola;
}

/** „4573,8" → 4573.8; pusta komórka → null (w arkuszu znaczy „nie dotyczy"). */
function kwota(tekst: string | undefined): number | null {
  if (tekst === undefined) return null;
  const czyste = tekst.trim().replace(/\s/g, "");
  if (czyste === "") return null;
  const n = Number(czyste.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const KOL = {
  nazwisko: 4,
  uberD: 5,
  uberF: 6,
  boltD: 7,
  boltS: 9,
  freeNowS: 11,
  freeNowT: 12,
  wyplata: 13,
  podatek: 14,
  przychod: 15,
  oplata: 16,
  paliwo: 19,
  sposob: 20,
} as const;

interface WierszArkusza {
  nazwa: string;
  uberD: number; uberF: number; boltD: number; boltS: number;
  freeNowS: number; freeNowT: number;
  wyplata: number; podatek: number | null; przychod: number;
  oplata: number; paliwo: number; sposob: string;
}

const arkusz: Map<string, WierszArkusza> = (() => {
  const tekst = Deno.readTextFileSync(new URL("../../../fixtures/wzorzec-rozliczenia.csv", import.meta.url));
  const mapa = new Map<string, WierszArkusza>();
  for (const wiersz of tekst.split("\n")) {
    if (!wiersz.trim()) continue;
    const p = podzielWiersz(wiersz);
    const nazwa = (p[KOL.nazwisko] || "").trim();
    if (!nazwa || nazwa === "Imie i Nazwisko") continue;
    mapa.set(nazwa, {
      nazwa,
      uberD: kwota(p[KOL.uberD]) ?? 0,
      uberF: kwota(p[KOL.uberF]) ?? 0,
      boltD: kwota(p[KOL.boltD]) ?? 0,
      boltS: kwota(p[KOL.boltS]) ?? 0,
      freeNowS: kwota(p[KOL.freeNowS]) ?? 0,
      freeNowT: kwota(p[KOL.freeNowT]) ?? 0,
      wyplata: kwota(p[KOL.wyplata]) ?? 0,
      podatek: kwota(p[KOL.podatek]),
      przychod: kwota(p[KOL.przychod]) ?? 0,
      oplata: kwota(p[KOL.oplata]) ?? 0,
      paliwo: kwota(p[KOL.paliwo]) ?? 0,
      sposob: (p[KOL.sposob] || "").trim(),
    });
  }
  return mapa;
})();

function wiersz(nazwa: string): WierszArkusza {
  const w = arkusz.get(nazwa);
  if (!w) throw new Error(`Brak wiersza „${nazwa}" w fixtures/wzorzec-rozliczenia.csv`);
  return w;
}

// Kontrola wstępna: gdyby ścieżka albo układ kolumn się rozjechały, wszystkie
// testy niżej porównywałyby zera z zerami i wypadły zielono nad niczym.
Deno.test("arkusz wzorcowy wczytał się i ma spodziewany układ kolumn", () => {
  assert(arkusz.size > 40, `wczytano tylko ${arkusz.size} wierszy`);
  const a = wiersz("ASHRAF ABDELBAKY KHALIL MOHAMED");
  assertEquals(a.boltD, 4573.8);
  assertEquals(a.przychod, 5001.03);
  assertEquals(a.paliwo, 391.26);
});

// ── podatek: przychód × stawka − 50% VAT od paliwa ───────────────────────────

const STAWKA = 8;

const Z_PODATKIEM = [
  "ASHRAF ABDELBAKY KHALIL MOHAMED",
  "Barys Mileuski",
  "Beata Smosarska",
  "Dawid Czostek",
  "Patryk Matusik",
  "Maciej Świstro",
];

for (const nazwa of Z_PODATKIEM) {
  Deno.test(`przychód łączny zgadza się z arkuszem — ${nazwa}`, () => {
    const w = wiersz(nazwa);
    const policzony = przychodLaczny({
      uberWyplacono: w.uberD,
      uberGotowka: w.uberF,
      boltBrutto: w.boltD,
      freeNowPrzedProwizja: w.freeNowS,
    });
    assertAlmostEquals(policzony, w.przychod, GROSZ, `przychód ${policzony} ≠ ${w.przychod}`);
  });

  Deno.test(`podatek zgadza się z arkuszem co do grosza — ${nazwa}`, () => {
    const w = wiersz(nazwa);
    const { podatek } = policzPodatek({
      przychod: w.przychod,
      stawkaProcent: STAWKA,
      wydanoNaPaliwo: w.paliwo,
      podatekNaliczany: true,
    });
    assertAlmostEquals(podatek, w.podatek!, GROSZ, `podatek ${podatek} ≠ ${w.podatek}`);
  });

  Deno.test(`wypłata zgadza się z arkuszem co do grosza — ${nazwa}`, () => {
    const w = wiersz(nazwa);
    const { podatek } = policzPodatek({
      przychod: w.przychod,
      stawkaProcent: STAWKA,
      wydanoNaPaliwo: w.paliwo,
      podatekNaliczany: true,
    });
    // Postać z arkusza: wypłaty platform minus opłata, podatek i paliwo.
    const zArkusza = w.boltS + w.uberD + (w.freeNowS - w.freeNowT) - w.oplata - podatek - w.paliwo;
    assertAlmostEquals(zArkusza, w.wyplata, GROSZ, `wypłata ${zArkusza} ≠ ${w.wyplata}`);
  });
}

// ── plan bez podatku i B2B ───────────────────────────────────────────────────

// Dmytro, Sofiia i Konrad są na planie ryczałtowym („159 zł bez podatku"),
// Bonaventura Motors to firma wystawiająca flocie fakturę (B2B). Obie drogi
// dają zero podatku — i obie są przypisane do kierowcy, nie wywnioskowane
// z kwoty opłaty ani ze sposobu rozliczenia.
const BEZ_PODATKU = ["Dmytro Agafonov", "Sofiia Zhovta", "Konrad Niemyski", "Bonaventura Motors"];

for (const nazwa of BEZ_PODATKU) {
  Deno.test(`plan bez podatku: zero podatku i pełne paliwo — ${nazwa}`, () => {
    const w = wiersz(nazwa);
    const wynik = policzPodatek({
      przychod: w.przychod,
      stawkaProcent: STAWKA,
      wydanoNaPaliwo: w.paliwo,
      podatekNaliczany: false,
    });
    assertEquals(wynik.podatek, 0);
    // Brak podatku = brak odliczenia. Paliwo potrącane w pełnej kwocie.
    assertEquals(wynik.odliczenieVatPaliwa, 0);
    const zArkusza = w.boltS + w.uberD + (w.freeNowS - w.freeNowT) - w.oplata - wynik.podatek - w.paliwo;
    assertAlmostEquals(zArkusza, w.wyplata, GROSZ, `wypłata ${zArkusza} ≠ ${w.wyplata}`);
  });
}

Deno.test("sposób rozliczenia NIE decyduje o podatku", () => {
  // Dowód wprost z arkusza: obaj mają „przelew", jeden ma podatek, drugi nie.
  assertEquals(wiersz("Patryk Matusik").sposob, "przelew");
  assert(wiersz("Patryk Matusik").podatek! > 0);
  assertEquals(wiersz("Dmytro Agafonov").sposob, "przelew");
  assertEquals(wiersz("Dmytro Agafonov").podatek, null);
});

// ── wypłata liczona z agregatów, tak jak liczy ją aplikacja ──────────────────

// Dane z produkcyjnej tabeli `settlements` za tydzień 2026-09-07..13 — ten sam
// tydzień, z którego pochodzi arkusz. Sprawdzamy, że postać używana w kodzie
// (baza − prowizje − gotówka − …) daje dokładnie to, co postać z arkusza.
const AGREGATY: Record<string, { baza: number; prowizje: number; gotowka: number }> = {
  "ASHRAF ABDELBAKY KHALIL MOHAMED": { baza: 4573.8 + 427.23, prowizje: 1220.85 + 115.6, gotowka: 773.31 },
  "Barys Mileuski": { baza: 1759.18 + 2381.51, prowizje: 651.89, gotowka: 435.83 },
  "Beata Smosarska": { baza: 793.95 + 1933.46, prowizje: 526.16, gotowka: 479.31 },
  "Dawid Czostek": { baza: 615.2, prowizje: 0, gotowka: 89.97 },
  "Patryk Matusik": { baza: 2726.97, prowizje: 742.15, gotowka: 502.81 },
};

for (const [nazwa, agregaty] of Object.entries(AGREGATY)) {
  Deno.test(`postać z kodu = postać z arkusza — ${nazwa}`, () => {
    const w = wiersz(nazwa);
    assertAlmostEquals(agregaty.baza, w.przychod, GROSZ, "baza z settlements ≠ przychód z arkusza");
    const { podatek } = policzPodatek({
      przychod: agregaty.baza,
      stawkaProcent: STAWKA,
      wydanoNaPaliwo: w.paliwo,
      podatekNaliczany: true,
    });
    const zKodu = wyplataTygodniowa({
      przychodBazowy: agregaty.baza,
      prowizje: agregaty.prowizje,
      gotowka: agregaty.gotowka,
      podatek,
      oplataStala: w.oplata,
      paliwo: w.paliwo,
    });
    assertAlmostEquals(zKodu, w.wyplata, GROSZ, `wypłata ${zKodu} ≠ ${w.wyplata}`);
  });
}

// ── kontrole pozytywne: stary, zły wzór MUSI się rozjechać z arkuszem ────────

Deno.test("KONTROLA POZYTYWNA: sam procent bez odliczenia VAT od paliwa nie zgadza się z arkuszem", () => {
  const w = wiersz("ASHRAF ABDELBAKY KHALIL MOHAMED");
  const stary = w.przychod * STAWKA / 100; // 400,08 — tyle pokazywał panel
  assertAlmostEquals(stary, 400.0824, GROSZ);
  assert(Math.abs(stary - w.podatek!) > GROSZ, "stary wzór nie odróżnia się od arkusza — test nic nie pilnuje");
  assertAlmostEquals(stary - w.podatek!, odliczenieVatOdPaliwa(w.paliwo), GROSZ);
});

Deno.test("KONTROLA POZYTYWNA: podstawa Ubera bez gotówki zaniża podatek o 8% gotówki", () => {
  const w = wiersz("Dawid Czostek");
  const zlaPodstawa = w.uberD; // 525,23 — kolumna D bez gotówki (tryb „netto")
  const zlyPodatek = zlaPodstawa * STAWKA / 100;
  assert(Math.abs(zlyPodatek - w.podatek!) > GROSZ, "zła podstawa nie odróżnia się — test nic nie pilnuje");
  assertAlmostEquals(w.podatek! - zlyPodatek, Math.abs(w.uberF) * STAWKA / 100, GROSZ);
});

Deno.test("KONTROLA POZYTYWNA: zwrot VAT jako osobna dodatnia pozycja podwaja odliczenie", () => {
  const w = wiersz("Beata Smosarska");
  const { podatek } = policzPodatek({
    przychod: w.przychod, stawkaProcent: STAWKA, wydanoNaPaliwo: w.paliwo, podatekNaliczany: true,
  });
  const podwojnie = w.boltS + w.uberD - w.oplata - podatek - w.paliwo + odliczenieVatOdPaliwa(w.paliwo);
  assert(Math.abs(podwojnie - w.wyplata) > GROSZ, "podwójne odliczenie nie odróżnia się od arkusza");
});

// ── przypadki brzegowe ───────────────────────────────────────────────────────

Deno.test("VAT od paliwa to 23/123 kwoty brutto", () => {
  assertAlmostEquals(vatOdPaliwa(391.26), 73.16243902, 0.0001);
  assertAlmostEquals(vatOdPaliwa(251.61), 47.04902439, 0.0001);
  assertEquals(vatOdPaliwa(0), 0);
  assertEquals(vatOdPaliwa(-10), 0);
});

Deno.test("podatek nigdy nie wychodzi ujemny", () => {
  const { podatek } = policzPodatek({
    przychod: 100, stawkaProcent: 8, wydanoNaPaliwo: 5000, podatekNaliczany: true,
  });
  assertEquals(podatek, 0);
});

Deno.test("plan nadpisuje tylko to, co sam ustala", () => {
  assertEquals(stawkaZPlanu(null, 8), 8);
  assertEquals(stawkaZPlanu({ tax_enabled: true, tax_percentage: null }, 8), 8);
  assertEquals(stawkaZPlanu({ tax_enabled: true, tax_percentage: 5 }, 8), 5);
  assertEquals(stawkaZPlanu({ tax_enabled: false, tax_percentage: 8 }, 8), 0);
  assertEquals(oplataZPlanu({ base_fee: null }, 50), 50);
  assertEquals(oplataZPlanu({ base_fee: 159 }, 50), 159);
  assertEquals(oplataZPlanu({ base_fee: 0 }, 50), 0);
});

Deno.test("podatku nie naliczamy przy planie ryczałtowym ani przy B2B", () => {
  assertEquals(czyNaliczacPodatek({ tax_enabled: false }, {}), false);
  assertEquals(czyNaliczacPodatek({ tax_enabled: true }, { jestB2B: true }), false);
  assertEquals(czyNaliczacPodatek({ tax_enabled: true }, { jestB2B: false, stawkaProcent: 8 }), true);
  assertEquals(czyNaliczacPodatek(null, { stawkaProcent: 0 }), false);
});
