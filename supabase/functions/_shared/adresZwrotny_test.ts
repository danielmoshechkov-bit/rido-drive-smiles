/**
 * Testy adresu zwrotnego.
 *
 * Sedno: warsztat MUSI go zachować, platforma MUSI go stracić. Sam zestaw
 * „nie ma adresu" wypadłby zielono także wtedy, gdyby funkcja zawsze zwracała
 * `null` — i wtedy klienci warsztatów przestaliby mieć jak odpisać, bez
 * żadnego błędu i bez żadnego zgłoszenia.
 */

import { adresZwrotny } from "./adresZwrotny.ts";

let zle = 0;
const sprawdz = (nazwa: string, warunek: boolean, szczegol = "") => {
  if (warunek) console.log(`✅ ${nazwa}`);
  else { zle++; console.log(`❌ ${nazwa}${szczegol ? " — " + szczegol : ""}`); }
};

// --- KONTROLA ODWROTNA: warsztat zachowuje adres zwrotny -------------------
sprawdz("warsztat: adres zwrotny to jego wlasny e-mail",
  adresZwrotny({ emailFirmy: "warsztat@example.pl", emailNadawcy: "noreply@getrido.pl" })
    === "warsztat@example.pl");

sprawdz("warsztat bez wlasnego e-maila: zostaje adres nadawcy",
  adresZwrotny({ emailFirmy: null, emailNadawcy: "noreply@getrido.pl" })
    === "noreply@getrido.pl");

sprawdz("pusty ciag u firmy traktujemy jak brak",
  adresZwrotny({ emailFirmy: "   ", emailNadawcy: "noreply@getrido.pl" })
    === "noreply@getrido.pl");

// --- PLATFORMA: wiadomosc jednostronna --------------------------------------
sprawdz("platforma: brak adresu zwrotnego",
  adresZwrotny({ bezOdpowiedzi: true, emailFirmy: "kontakt@getrido.pl", emailNadawcy: "noreply@getrido.pl" })
    === null);

// --- WLACZENIE MUSI BYC JAWNE ------------------------------------------------
// Gdyby wystarczyla „prawdziwa" wartosc, literowka w wywolaniu albo przypadkowy
// ciag z formularza odcialby warsztatom korespondencje.
for (const podstepne of ["true", 1, "tak", {}, [], "false"]) {
  sprawdz(`wartosc ${JSON.stringify(podstepne)} NIE wlacza jednostronnosci`,
    adresZwrotny({ bezOdpowiedzi: podstepne, emailFirmy: "warsztat@example.pl" })
      === "warsztat@example.pl",
    String(adresZwrotny({ bezOdpowiedzi: podstepne, emailFirmy: "warsztat@example.pl" })));
}

for (const falszywe of [false, undefined, null, 0, ""]) {
  sprawdz(`wartosc ${JSON.stringify(falszywe)} zostawia adres zwrotny`,
    adresZwrotny({ bezOdpowiedzi: falszywe, emailFirmy: "warsztat@example.pl" })
      === "warsztat@example.pl");
}

// --- BRAK CZEGOKOLWIEK -------------------------------------------------------
sprawdz("brak obu adresow: null, bez pustego naglowka",
  adresZwrotny({}) === null);

if (zle > 0) throw new Error(`${zle} niezgodnosci w adresie zwrotnym`);
console.log("\nWSZYSTKO ZIELONE");
