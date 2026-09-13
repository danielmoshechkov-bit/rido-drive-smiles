/**
 * Testy pozycji faktury za doładowanie.
 *
 * Dane wejściowe to PRAWDZIWE zamówienia z produkcji (13.09.2026), nie
 * wymyślone liczby — inaczej test dowodziłby zgodności z moim wyobrażeniem
 * cennika, a nie z cennikiem.
 */

import {
  PAKIETY,
  nazwaBezLiczby,
  pozycjaDoladowania,
} from "./pozycjaDoladowania.ts";

let zle = 0;
const sprawdz = (nazwa: string, warunek: boolean, szczegol = "") => {
  if (warunek) console.log(`✅ ${nazwa}`);
  else { zle++; console.log(`❌ ${nazwa}${szczegol ? " — " + szczegol : ""}`); }
};

const zaokr = (v: number) => Math.round(v * 100) / 100;

/**
 * Odtworzenie tego, co z pozycją zrobi `billing-invoice-issue` — łącznie
 * z `unit_net_price`, bo to ono trafia do `P_9A` w KSeF.
 */
function jakWFakturze(p: ReturnType<typeof pozycjaDoladowania>) {
  const brutto = zaokr(p.quantity * p.unit_gross_price);
  const netto = zaokr(brutto / (1 + p.vat_rate / 100));
  return { netto, brutto, cenaJednostkowa: zaokr(netto / (p.quantity || 1)) };
}

// ---------------------------------------------------------------------------
// PRAWDZIWE ZAMÓWIENIA Z PRODUKCJI
// ---------------------------------------------------------------------------
const rzeczywiste: Array<{
  kod: string; nazwa: string; jednostek: number; brutto: number;
  oczekNazwa: string; oczekNetto: number;
}> = [
  { kod: "sms", nazwa: "Wiadomości SMS", jednostek: 100, brutto: 24.60,
    oczekNazwa: "Pakiet SMS — 100 wiadomości", oczekNetto: 20.00 },
  { kod: "vehicle_lookup", nazwa: "Sprawdzenia pojazdu (VIN)", jednostek: 30, brutto: 62.73,
    oczekNazwa: "Pakiet sprawdzeń pojazdu — 30 VIN", oczekNetto: 51.00 },
  { kod: "vehicle_lookup", nazwa: "Sprawdzenia pojazdu (VIN)", jednostek: 10, brutto: 20.91,
    oczekNazwa: "Pakiet sprawdzeń pojazdu — 10 VIN", oczekNetto: 17.00 },
  { kod: "voice_minutes", nazwa: "Minuty rozmów agenta", jednostek: 30, brutto: 42.44,
    oczekNazwa: "Pakiet minut agenta — 30 minut", oczekNetto: 34.50 },
  { kod: "rido_ai", nazwa: "Pakiet Rido AI — 200 pytań", jednostek: 200, brutto: 84.87,
    oczekNazwa: "Pakiet Rido AI — 200 pytań", oczekNetto: 69.00 },
];

for (const z of rzeczywiste) {
  const p = pozycjaDoladowania(z.kod, z.nazwa, z.jednostek, z.brutto);
  const s = jakWFakturze(p);

  sprawdz(`${z.kod} ${z.jednostek}: nazwa niesie zakres usługi`,
    p.name === z.oczekNazwa, `wyszło „${p.name}"`);
  sprawdz(`${z.kod} ${z.jednostek}: 1 pakiet`,
    p.quantity === 1 && p.unit === "pakiet", JSON.stringify(p));
  sprawdz(`${z.kod} ${z.jednostek}: suma faktury = kwota pobrana (${z.brutto})`,
    s.brutto === z.brutto, `wyszło ${s.brutto}`);
  sprawdz(`${z.kod} ${z.jednostek}: netto ${z.oczekNetto}`,
    s.netto === z.oczekNetto, `wyszło ${s.netto}`);
  // P_9A w KSeF bierze się z `unit_net_price`, czyli z tej właśnie liczby.
  sprawdz(`${z.kod} ${z.jednostek}: cena jednostkowa w pełnych groszach`,
    zaokr(s.cenaJednostkowa) === s.cenaJednostkowa && s.cenaJednostkowa === z.oczekNetto,
    `wyszło ${s.cenaJednostkowa}`);
}

// ---------------------------------------------------------------------------
// KONTROLA ODWROTNA — liczba MUSI się pojawić, a nie zniknąć razem ze sztukami
// ---------------------------------------------------------------------------
{
  const p = pozycjaDoladowania("vehicle_lookup", "Sprawdzenia pojazdu (VIN)", 30, 62.73);
  sprawdz("KONTROLA ODWROTNA: liczba jednostek jest na dokumencie",
    /\b30\b/.test(p.name), `nazwa „${p.name}" nie mówi, ile sprawdzeń`);
}

// ---------------------------------------------------------------------------
// ŻADNA LICZBA JEDNOSTEK NIE ROZJEŻDŻA KWOTY
// ---------------------------------------------------------------------------
{
  const cennik: Array<[string, number]> = [
    ["voice_minutes", 1.15], ["sms", 0.20], ["vehicle_lookup", 1.70], ["rido_ai", 0.3450],
  ];
  const zle2: string[] = [];
  for (const [kod, cenaNetto] of cennik) {
    for (let n = 1; n <= 500; n++) {
      const brutto = zaokr(zaokr(n * cenaNetto) * 1.23);
      const s = jakWFakturze(pozycjaDoladowania(kod, "Produkt", n, brutto));
      if (s.brutto !== brutto) zle2.push(`${kod}×${n}: ${s.brutto} ≠ ${brutto}`);
      if (zaokr(s.cenaJednostkowa) !== s.cenaJednostkowa) zle2.push(`${kod}×${n}: ułamek grosza`);
    }
  }
  sprawdz("2000 kombinacji: suma zawsze równa kwocie pobranej, cena zawsze w groszach",
    zle2.length === 0, zle2.slice(0, 5).join("; "));
}

// ---------------------------------------------------------------------------
// PRZYPADKI BRZEGOWE
// ---------------------------------------------------------------------------
{
  const bezJednostek = pozycjaDoladowania("sms", "Wiadomości SMS", null, 24.60);
  sprawdz("brak liczby jednostek → nazwa bez zmyślonej liczby",
    bezJednostek.name === "Pakiet SMS" && bezJednostek.quantity === 1, bezJednostek.name);

  const nieznany = pozycjaDoladowania("nowy_produkt", "Coś nowego", 5, 12.30);
  sprawdz("nieznany kod: nazwa z cennika plus liczba, bez wywrotki",
    nieznany.name === "Coś nowego — 5 szt." && nieznany.unit === "pakiet", nieznany.name);

  const zeroKwoty = pozycjaDoladowania("sms", "Wiadomości SMS", 100, 0);
  sprawdz("kwota zero nie wywraca składania pozycji",
    zeroKwoty.quantity === 1 && zeroKwoty.unit_gross_price === 0, JSON.stringify(zeroKwoty));
}

// ---------------------------------------------------------------------------
// NAZWA BEZ DOKLEJONEJ LICZBY (ścieżka dla kodów spoza słownika)
// ---------------------------------------------------------------------------
sprawdz("ucinamy końcówkę „— 200 pytań”",
  nazwaBezLiczby("Pakiet Rido AI — 200 pytań") === "Pakiet Rido AI");
sprawdz("nazwa bez liczby zostaje nietknięta",
  nazwaBezLiczby("Minuty rozmów agenta") === "Minuty rozmów agenta");
sprawdz("nie ucinamy liczby, która jest częścią nazwy",
  nazwaBezLiczby("Sprawdzenia pojazdu (VIN)") === "Sprawdzenia pojazdu (VIN)");
sprawdz("nie zostawiamy pustej nazwy",
  nazwaBezLiczby("— 200 pytań").length > 0);

// ---------------------------------------------------------------------------
// BRAMKA: każdy AKTYWNY produkt z cennika ma opisany pakiet
// ---------------------------------------------------------------------------
// Lista wzięta z produkcji 13.09.2026. Dodanie produktu bez wpisu ma ZAPALIĆ
// ten test, a nie po cichu wystawić fakturę z nazwą z cennika i „szt.".
{
  const zProdukcji = ["voice_minutes", "sms", "vehicle_lookup", "rido_ai"];
  const brakujace = zProdukcji.filter((k) => !(k in PAKIETY));
  sprawdz("każdy aktywny produkt ma opisany pakiet i jednostkę",
    brakujace.length === 0, `brakuje: ${brakujace.join(", ")}`);
}

if (zle > 0) throw new Error(`${zle} niezgodności w pozycji doładowania`);
console.log("\nWSZYSTKO ZIELONE");
