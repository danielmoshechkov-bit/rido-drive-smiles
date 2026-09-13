/**
 * Testy rozbicia doładowania na pozycję faktury.
 *
 * Dane wejściowe to PRAWDZIWE zamówienia z produkcji (13.09.2026), nie
 * wymyślone liczby — inaczej test dowodziłby zgodności z moim wyobrażeniem
 * cennika, a nie z cennikiem.
 */

import {
  JEDNOSTKI,
  nazwaBezLiczby,
  pozycjaDoladowania,
} from "./pozycjaDoladowania.ts";

let zle = 0;
const sprawdz = (nazwa: string, warunek: boolean, szczegol = "") => {
  if (warunek) console.log(`✅ ${nazwa}`);
  else { zle++; console.log(`❌ ${nazwa}${szczegol ? " — " + szczegol : ""}`); }
};

const zaokr = (v: number) => Math.round(v * 100) / 100;

/** Odtworzenie tego, co z pozycją zrobi `billing-invoice-issue`. */
function sumyJakWFakturze(p: ReturnType<typeof pozycjaDoladowania>) {
  const ilosc = p.quantity;
  const stawka = p.vat_rate;
  if (p.unit_gross_price != null) {
    const brutto = zaokr(ilosc * p.unit_gross_price);
    const netto = zaokr(brutto / (1 + stawka / 100));
    return { netto, brutto };
  }
  const netto = zaokr(ilosc * (p.unit_net_price ?? 0));
  const vat = zaokr(netto * stawka / 100);
  return { netto, brutto: zaokr(netto + vat) };
}

// ---------------------------------------------------------------------------
// PRAWDZIWE ZAMÓWIENIA Z PRODUKCJI
// ---------------------------------------------------------------------------
const rzeczywiste: Array<{
  kod: string; nazwa: string; jednostek: number; brutto: number;
  oczekIlosc: number; oczekJedn: string; oczekCena: number;
}> = [
  { kod: "voice_minutes", nazwa: "Minuty rozmów agenta", jednostek: 30, brutto: 42.44,
    oczekIlosc: 30, oczekJedn: "min", oczekCena: 1.15 },
  { kod: "sms", nazwa: "Wiadomości SMS", jednostek: 100, brutto: 24.60,
    oczekIlosc: 100, oczekJedn: "szt.", oczekCena: 0.20 },
  { kod: "vehicle_lookup", nazwa: "Sprawdzenia pojazdu (VIN)", jednostek: 10, brutto: 20.91,
    oczekIlosc: 10, oczekJedn: "szt.", oczekCena: 1.70 },
  { kod: "vehicle_lookup", nazwa: "Sprawdzenia pojazdu (VIN)", jednostek: 30, brutto: 62.73,
    oczekIlosc: 30, oczekJedn: "szt.", oczekCena: 1.70 },
];

for (const z of rzeczywiste) {
  const p = pozycjaDoladowania(z.kod, z.nazwa, z.jednostek, z.brutto);
  sprawdz(
    `${z.kod} ${z.jednostek}: ilość ${z.oczekIlosc} ${z.oczekJedn} po ${z.oczekCena}`,
    p.quantity === z.oczekIlosc && p.unit === z.oczekJedn && p.unit_net_price === z.oczekCena,
    JSON.stringify(p),
  );
  const sumy = sumyJakWFakturze(p);
  sprawdz(
    `${z.kod} ${z.jednostek}: suma faktury = kwota pobrana (${z.brutto})`,
    sumy.brutto === z.brutto,
    `wyszło ${sumy.brutto}`,
  );
}

// ---------------------------------------------------------------------------
// PRZYPADEK, KTÓRY MUSI ZEJŚĆ NA PACZKĘ
// ---------------------------------------------------------------------------
{
  // 0,3450 zł za pytanie — cena jednostkowa poniżej grosza jest niedopuszczalna
  // (interpretacje KIS 12.2025 i 08.2026), a 0,35 × 200 = 70,00 ≠ 69,00.
  const p = pozycjaDoladowania("rido_ai", "Pakiet Rido AI — 200 pytań", 200, 84.87);
  sprawdz("rido_ai: schodzi na paczkę, nie na cenę z ułamkiem grosza",
    p.quantity === 1 && p.unit_net_price === undefined, JSON.stringify(p));
  sprawdz("rido_ai: jednostka mówi, ile jest w paczce",
    p.unit === "pakiet (200 pytań)", p.unit);
  sprawdz("rido_ai: nazwa nie dubluje liczby",
    p.name === "Pakiet Rido AI — 200 pytań", p.name);
  const sumy = sumyJakWFakturze(p);
  sprawdz("rido_ai: suma faktury = kwota pobrana (84,87)", sumy.brutto === 84.87, `wyszło ${sumy.brutto}`);
  sprawdz("rido_ai: netto wraca do 69,00", sumy.netto === 69.00, `wyszło ${sumy.netto}`);
}

// ---------------------------------------------------------------------------
// KONTROLA ODWROTNA — cena z ułamkiem grosza NIGDY nie wychodzi na fakturę
// ---------------------------------------------------------------------------
{
  let znalezione: string[] = [];
  // Przemiatamy wszystkie sensowne kombinacje: cztery produkty × liczby
  // jednostek od 1 do 500, przy cenach z cennika.
  const cennik: Array<[string, number]> = [
    ["voice_minutes", 1.15], ["sms", 0.20], ["vehicle_lookup", 1.70], ["rido_ai", 0.3450],
  ];
  for (const [kod, cenaNetto] of cennik) {
    for (let n = 1; n <= 500; n++) {
      const brutto = zaokr(zaokr(n * cenaNetto) * 1.23);
      const p = pozycjaDoladowania(kod, "Produkt", n, brutto);
      const cena = p.unit_net_price;
      if (cena != null && zaokr(cena) !== cena) znalezione.push(`${kod}×${n} → ${cena}`);
      const sumy = sumyJakWFakturze(p);
      if (sumy.brutto !== brutto) znalezione.push(`${kod}×${n}: suma ${sumy.brutto} ≠ pobrane ${brutto}`);
    }
  }
  sprawdz("2000 kombinacji: żadna cena jednostkowa nie ma ułamka grosza i każda suma zgadza się z kwotą pobraną",
    znalezione.length === 0, znalezione.slice(0, 5).join("; "));
}

// ---------------------------------------------------------------------------
// KONTROLA POZYTYWNA — rozbicie NAPRAWDĘ zachodzi, a nie wszystko leci na paczkę
// ---------------------------------------------------------------------------
{
  const p = pozycjaDoladowania("sms", "Wiadomości SMS", 100, 24.60);
  sprawdz("KONTROLA POZYTYWNA: przynajmniej jeden produkt dostaje prawdziwą ilość",
    p.quantity === 100 && p.unit_net_price === 0.20 && p.unit_gross_price === undefined,
    JSON.stringify(p));
}

// ---------------------------------------------------------------------------
// PRZYPADKI BRZEGOWE
// ---------------------------------------------------------------------------
{
  const bezJednostek = pozycjaDoladowania("sms", "Wiadomości SMS", null, 24.60);
  sprawdz("brak liczby jednostek → jedna pozycja, nazwa bez zmyślonej liczby",
    bezJednostek.quantity === 1 && bezJednostek.unit === "szt." && bezJednostek.name === "Wiadomości SMS",
    JSON.stringify(bezJednostek));

  const nieznany = pozycjaDoladowania("nowy_produkt", "Coś nowego", 5, 12.30);
  sprawdz("nieznany kod dostaje jednostkę domyślną, nie wywraca się",
    nieznany.unit === "szt." || nieznany.unit.startsWith("pakiet"), JSON.stringify(nieznany));

  const zeroKwoty = pozycjaDoladowania("sms", "Wiadomości SMS", 100, 0);
  sprawdz("kwota zero → pozycja zapasowa, bez dzielenia przez zero",
    zeroKwoty.quantity === 1 && Number.isFinite(zeroKwoty.unit_gross_price ?? 0),
    JSON.stringify(zeroKwoty));
}

// ---------------------------------------------------------------------------
// NAZWA BEZ DOKLEJONEJ LICZBY
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
// BRAMKA: każdy AKTYWNY produkt z cennika ma jednostkę
// ---------------------------------------------------------------------------
// Lista wzięta z produkcji 13.09.2026. Dodanie produktu bez jednostki ma
// ZAPALIĆ ten test, a nie po cichu wystawić fakturę w „szt.".
{
  const zProdukcji = ["voice_minutes", "sms", "vehicle_lookup", "rido_ai"];
  const brakujace = zProdukcji.filter((k) => !(k in JEDNOSTKI));
  sprawdz("każdy aktywny produkt ma opisaną jednostkę miary",
    brakujace.length === 0, `brakuje: ${brakujace.join(", ")}`);
}

if (zle > 0) throw new Error(`${zle} niezgodności w rozbiciu doładowania`);
console.log("\nWSZYSTKO ZIELONE");
