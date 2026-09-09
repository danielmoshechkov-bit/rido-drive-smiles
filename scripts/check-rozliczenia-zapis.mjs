#!/usr/bin/env node
/**
 * Bramka: fetchSettlements nie ma prawa niczego zapisywać.
 *
 * Do 28.08.2026 wejście na "Rozliczenia kierowców" wywoływało przy każdym ładowaniu
 * edge function 'update-driver-debt', a ta nadpisuje settlements.actual_payout kwotą
 * policzoną w przeglądarce. Kwota zależała od tego, czy stan `cities` zdążył się
 * załadować, więc wynik wyścigu trafiał do bazy i przy kolejnym wejściu zapisywał się
 * z powrotem. Rozliczenia "zmieniały się same", także te już opłacone.
 *
 * Odczyt jest odczytem. Zapis wolno wykonać wyłącznie na jawną akcję użytkownika
 * ("Przelicz tydzień", edycja komórki) — czyli poza ciałem fetchSettlements.
 *
 * Uruchamiane lokalnie: `npm run lint:rozliczenia`.
 */
import { readFileSync } from "node:fs";

const PLIK = "src/components/FleetSettlementsView.tsx";
const FUNKCJA = "const fetchSettlements = async (";

/** Zapisy jednoznaczne — w tym pliku nie występują w innym znaczeniu niż zapytanie do Supabase. */
const ZAPISY_JEDNOZNACZNE = [".upsert(", ".insert(", ".update(", "functions.invoke("];
/** `.delete(` bywa też metodą Set/Map — liczymy tylko wtedy, gdy to łańcuch na supabase. */
const OKNO_SUPABASE = 300;

const zrodlo = readFileSync(PLIK, "utf8");

/**
 * Zamienia treść napisów, szablonów i komentarzy na spacje, zachowując długość pliku.
 * Dzięki temu klamra w stringu (np. w `${...}` albo w komunikacie) nie psuje dopasowania
 * klamer, a indeksy nadal wskazują właściwe linie w oryginale.
 */
function bezNapisowIKomentarzy(tekst) {
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
      if (i < n) {
        out[i++] = " ";
        out[i++] = " ";
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const cudzyslow = c;
      i++; // otwierający zostaje
      while (i < n) {
        if (tekst[i] === "\\") {
          out[i] = " ";
          if (i + 1 < n && tekst[i + 1] !== "\n") out[i + 1] = " ";
          i += 2;
          continue;
        }
        if (tekst[i] === cudzyslow) {
          i++;
          break;
        }
        if (tekst[i] !== "\n") out[i] = " ";
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join("");
}

const czyste = bezNapisowIKomentarzy(zrodlo);

const start = czyste.indexOf(FUNKCJA);
if (start === -1) {
  console.error(`✖ Nie znaleziono "${FUNKCJA}" w ${PLIK}.`);
  console.error("  Jeśli funkcję przemianowano, zaktualizuj tę bramkę — nie usuwaj jej.");
  process.exit(1);
}

// UWAGA: pierwszy "{" po nagłówku to typ parametru (`options?: { skipDebtSync... }`),
// a nie ciało. Ciało zaczyna się dopiero za strzałką.
const strzalka = czyste.indexOf("=> {", start);
if (strzalka === -1) {
  console.error(`✖ Nie znaleziono początku ciała fetchSettlements w ${PLIK}.`);
  process.exit(1);
}
const otwarcie = czyste.indexOf("{", strzalka);

let glebokosc = 0;
let koniec = -1;
for (let i = otwarcie; i < czyste.length; i++) {
  const znak = czyste[i];
  if (znak === "{") glebokosc++;
  else if (znak === "}") {
    glebokosc--;
    if (glebokosc === 0) {
      koniec = i;
      break;
    }
  }
}
if (koniec === -1) {
  console.error(`✖ Nie udało się domknąć ciała fetchSettlements w ${PLIK}.`);
  process.exit(1);
}

// Szukamy w wersji oczyszczonej: kod jest ten sam, zniknęły tylko napisy i komentarze,
// więc wzmianka o ".update(" w komentarzu nie wywoła fałszywego alarmu.
const cialo = czyste.slice(otwarcie, koniec + 1);
const numerLinii = (indeksWCiele) =>
  zrodlo.slice(0, otwarcie + indeksWCiele).split("\n").length;

const trafienia = [];

for (const wzorzec of ZAPISY_JEDNOZNACZNE) {
  let od = 0;
  for (;;) {
    const i = cialo.indexOf(wzorzec, od);
    if (i === -1) break;
    trafienia.push({ wzorzec, linia: numerLinii(i) });
    od = i + wzorzec.length;
  }
}

let od = 0;
for (;;) {
  const i = cialo.indexOf(".delete(", od);
  if (i === -1) break;
  const poprzedzajace = cialo.slice(Math.max(0, i - OKNO_SUPABASE), i);
  if (poprzedzajace.includes("supabase")) {
    trafienia.push({ wzorzec: ".delete( (na supabase)", linia: numerLinii(i) });
  }
  od = i + ".delete(".length;
}

// Zabezpieczenie przed cichym przejściem bramki: gdyby wycinanie ciała się rozjechało
// i objęło znikomy fragment pliku, brak trafień nic nie znaczy.
const MIN_ROZMIAR_CIALA = 10000;
if (cialo.length < MIN_ROZMIAR_CIALA) {
  console.error(
    `✖ Wycięte ciało fetchSettlements ma ${cialo.length} znaków — za mało, by to była ta funkcja.`,
  );
  console.error("  Bramka nie potrafi sprawdzić tego pliku. Popraw ją, zamiast ją omijać.");
  process.exit(1);
}

if (trafienia.length > 0) {
  console.error("✖ fetchSettlements zapisuje. Odczyt strony nie może zmieniać rozliczeń.\n");
  for (const { wzorzec, linia } of trafienia) {
    console.error(`  ${PLIK}:${linia}  →  ${wzorzec}`);
  }
  console.error(
    "\n  Zapis wolno wykonać tylko na jawną akcję użytkownika — poza fetchSettlements.\n" +
      "  Historia: to właśnie ten zapis powodował, że kwoty rozliczeń zmieniały się same.",
  );
  process.exit(1);
}

console.log(`✓ fetchSettlements niczego nie zapisuje (sprawdzono ${cialo.length} znaków ciała).`);
