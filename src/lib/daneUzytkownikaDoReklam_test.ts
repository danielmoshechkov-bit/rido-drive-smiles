/**
 * Testy normalizacji danych kupującego.
 *
 * To jest ta rzecz, po której dopasowanie nie działa i nikt nie wie dlaczego:
 * Google nie zgłasza błędu przy źle znormalizowanym adresie — po prostu nie
 * dopasowuje. Dlatego każda reguła ma tu własny przypadek, a nie jeden
 * zbiorczy.
 */

import { normalizujEmail, normalizujTelefon } from "./daneUzytkownikaDoReklam";

let zle = 0;
const sprawdz = (nazwa: string, warunek: boolean, szczegol = "") => {
  if (warunek) console.log(`✅ ${nazwa}`);
  else { zle++; console.log(`❌ ${nazwa}${szczegol ? " — " + szczegol : ""}`); }
};
const rowne = (nazwa: string, wynik: unknown, oczekiwane: unknown) =>
  sprawdz(nazwa, wynik === oczekiwane, `wyszło ${JSON.stringify(wynik)}, miało być ${JSON.stringify(oczekiwane)}`);

// --- TRZY REGUŁY GOOGLE, KAŻDA OSOBNO ---------------------------------------
rowne("małe litery", normalizujEmail("JAN@Example.PL"), "jan@example.pl");
rowne("obcięte białe znaki", normalizujEmail("  jan@example.pl \n"), "jan@example.pl");
rowne("kropki znikają w gmail.com",
  normalizujEmail("Jan.Kowalski@Gmail.com"), "jankowalski@gmail.com");
rowne("kropki znikają w googlemail.com",
  normalizujEmail("j.k@googlemail.com"), "jk@googlemail.com");

// --- KONTROLA ODWROTNA: poza Gmailem kropka MA znaczenie ---------------------
rowne("poza Gmailem kropki ZOSTAJĄ — inaczej psulibyśmy poprawne adresy",
  normalizujEmail("jan.kowalski@firma.pl"), "jan.kowalski@firma.pl");
rowne("kropka w domenie nietknięta",
  normalizujEmail("jan@poczta.firma.com.pl"), "jan@poczta.firma.com.pl");

// --- `+etykieta` zostaje ------------------------------------------------------
rowne("`+etykieta` NIE jest obcinana — Google jej nie odcina, my też nie",
  normalizujEmail("jan+sklep@gmail.com"), "jan+sklep@gmail.com");

// --- CO NIE JEST ADRESEM, NIE JEDZIE -----------------------------------------
for (const zly of ["", "   ", null, undefined, "jan", "jan@", "@example.pl", "jan@localhost", ".@gmail.com"]) {
  rowne(`„${String(zly)}" → null, zamiast wysyłać śmieć`, normalizujEmail(zly as string), null);
}

// --- TELEFON ------------------------------------------------------------------
rowne("polskie dziewięć cyfr dostaje +48", normalizujTelefon("601234567"), "+48601234567");
rowne("spacje i myślniki nie przeszkadzają", normalizujTelefon("601-234 567"), "+48601234567");
rowne("numer z 48 z przodu", normalizujTelefon("48601234567"), "+48601234567");
rowne("numer już w E.164 zostaje", normalizujTelefon("+48601234567"), "+48601234567");
rowne("zagraniczny z plusem zostaje", normalizujTelefon("+4915112345678"), "+4915112345678");
rowne("za krótki → null", normalizujTelefon("12345"), null);
rowne("pusty → null", normalizujTelefon(""), null);
rowne("brak → null", normalizujTelefon(null), null);

// --- KONTROLA ODWROTNA: coś MUSI przechodzić ---------------------------------
sprawdz("KONTROLA ODWROTNA: normalizacja nie zwraca null dla wszystkiego",
  normalizujEmail("test@example.pl") !== null && normalizujTelefon("601234567") !== null);

if (zle > 0) throw new Error(`${zle} niezgodności w normalizacji danych kupującego`);
console.log("\nWSZYSTKO ZIELONE");
