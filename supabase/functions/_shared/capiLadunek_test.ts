/**
 * Testy ładunku Conversions API.
 *
 * Zestaw przypadków normalizacji jest CELOWO TAKI SAM jak w
 * `src/lib/daneUzytkownikaDoReklam_test.ts`. Reguły muszą być identyczne
 * w obu środowiskach; gdy ktoś zmieni jedno, drugie ma zapalić się na tym
 * samym adresie.
 */

import { normalizujEmail, normalizujTelefon, skrot } from "./normalizacjaMeta.ts";
import { wartoWyslac, zbudujZdarzenieZakupu } from "./capiLadunek.ts";

let zle = 0;
const sprawdz = (nazwa: string, warunek: boolean, szczegol = "") => {
  if (warunek) console.log(`✅ ${nazwa}`);
  else { zle++; console.log(`❌ ${nazwa}${szczegol ? " — " + szczegol : ""}`); }
};

// --- TE SAME PRZYPADKI CO WE FRONCIE ----------------------------------------
const PRZYPADKI_EMAIL: Array<[string | null, string | null]> = [
  ["JAN@Example.PL", "jan@example.pl"],
  ["  jan@example.pl \n", "jan@example.pl"],
  ["Jan.Kowalski@Gmail.com", "jankowalski@gmail.com"],
  ["j.k@googlemail.com", "jk@googlemail.com"],
  ["jan.kowalski@firma.pl", "jan.kowalski@firma.pl"],
  ["jan@poczta.firma.com.pl", "jan@poczta.firma.com.pl"],
  ["jan+sklep@gmail.com", "jan+sklep@gmail.com"],
  ["", null], ["   ", null], [null, null], ["jan", null], ["jan@", null],
  ["@example.pl", null], ["jan@localhost", null], [".@gmail.com", null],
];
for (const [wej, ocz] of PRZYPADKI_EMAIL) {
  const w = normalizujEmail(wej);
  sprawdz(`email „${String(wej)}" → ${JSON.stringify(ocz)}`, w === ocz, `wyszło ${JSON.stringify(w)}`);
}

// --- TELEFON: Meta chce BEZ plusa, front z plusem ---------------------------
sprawdz("telefon: dziewięć cyfr dostaje 48, BEZ plusa (tak chce Meta)",
  normalizujTelefon("601234567") === "48601234567", String(normalizujTelefon("601234567")));
sprawdz("telefon: spacje i myślniki nie przeszkadzają",
  normalizujTelefon("601-234 567") === "48601234567");
sprawdz("telefon: E.164 z plusem traci plus",
  normalizujTelefon("+48601234567") === "48601234567");
sprawdz("telefon: za krótki → null", normalizujTelefon("12345") === null);
sprawdz("telefon: brak → null", normalizujTelefon(null) === null);

// --- SKRÓT ------------------------------------------------------------------
{
  const a = await skrot("jan@example.pl");
  sprawdz("skrót to 64 znaki szesnastkowe małymi literami", /^[0-9a-f]{64}$/.test(a), a);
  const b = await skrot("jan@example.pl");
  sprawdz("ten sam wejściowy daje ten sam skrót", a === b);
  const c = await skrot("inny@example.pl");
  sprawdz("inny wejściowy daje inny skrót", a !== c);
}

// --- ZDARZENIE --------------------------------------------------------------
{
  const z = await zbudujZdarzenieZakupu({
    idZamowienia: "11111111-2222-3333-4444-555555555555",
    email: "Jan.Kowalski@Gmail.com",
    telefon: "601234567",
    kwotaBrutto: 84.87,
    waluta: "pln",
    fbp: "fb.1.1700000000000.123",
    fbc: "fb.1.1700000000000.abc",
    adresIp: "1.2.3.4",
    przegladarka: "Mozilla/5.0",
    czas: 1_700_000_000,
  });

  sprawdz("event_id to IDENTYFIKATOR ZAMÓWIENIA — po tym Meta łączy z pikselem",
    z.event_id === "11111111-2222-3333-4444-555555555555", z.event_id);
  sprawdz("custom_data niesie kwotę i walutę wielkimi literami",
    z.custom_data.value === 84.87 && z.custom_data.currency === "PLN",
    JSON.stringify(z.custom_data));
  sprawdz("event_time w SEKUNDACH, nie milisekundach",
    z.event_time === 1_700_000_000 && z.event_time < 4_000_000_000);

  sprawdz("adres jest ZAHASZOWANY, nie jawny",
    /^[0-9a-f]{64}$/.test(z.user_data.em) && !JSON.stringify(z).includes("Jan.Kowalski"),
    z.user_data.em);
  sprawdz("skrót zgadza się z ręcznie znormalizowanym adresem",
    z.user_data.em === await skrot("jankowalski@gmail.com"));
  sprawdz("telefon też zahaszowany",
    z.user_data.ph === await skrot("48601234567"));
  sprawdz("fbp i fbc idą JAWNIE — to nie są dane osobowe",
    z.user_data.fbp === "fb.1.1700000000000.123" && z.user_data.fbc === "fb.1.1700000000000.abc");
}

// --- PUSTE POLA NIE POWSTAJĄ ------------------------------------------------
{
  const z = await zbudujZdarzenieZakupu({
    idZamowienia: "abc", email: "to-nie-adres", telefon: "123",
    kwotaBrutto: 10, fbp: "fb.1.1.1", czas: 1,
  });
  sprawdz("zły adres NIE tworzy pustego pola `em`", !("em" in z.user_data), JSON.stringify(z.user_data));
  sprawdz("zły telefon NIE tworzy pustego pola `ph`", !("ph" in z.user_data));
  sprawdz("…ale fbp zostaje", z.user_data.fbp === "fb.1.1.1");
}

// --- KIEDY NIE WYSYŁAĆ ------------------------------------------------------
{
  const pusty = await zbudujZdarzenieZakupu({ idZamowienia: "x", kwotaBrutto: 10, czas: 1 });
  sprawdz("bez ŻADNEGO uchwytu o osobie nie wysyłamy", wartoWyslac(pusty) === false);

  const zSamymFbp = await zbudujZdarzenieZakupu({ idZamowienia: "x", kwotaBrutto: 10, fbp: "fb.1.1.1", czas: 1 });
  sprawdz("KONTROLA ODWROTNA: sam fbp wystarczy, żeby wysłać", wartoWyslac(zSamymFbp) === true);

  const zSamymMailem = await zbudujZdarzenieZakupu({ idZamowienia: "x", kwotaBrutto: 10, email: "a@b.pl", czas: 1 });
  sprawdz("KONTROLA ODWROTNA: sam adres też wystarczy", wartoWyslac(zSamymMailem) === true);
}

if (zle > 0) throw new Error(`${zle} niezgodności w ładunku CAPI`);
console.log("\nWSZYSTKO ZIELONE");
