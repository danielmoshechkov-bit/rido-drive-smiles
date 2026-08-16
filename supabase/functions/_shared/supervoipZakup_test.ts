// ============================================================================
// supervoipZakup_test.ts — czy bramka zakupu naprawdę zatrzymuje zakup.
//
// Liczby są odczytane z konta 16.08, nie wymyślone:
//   saldo 68,72 zł, prepaid, creditLimit 0
//   numer stacjonarny zwykły: 1,23 zł/mc brutto, aktywacja 0 zł
//   numer złoty: aktywacja 50–100 zł
//
// Bramka pilnuje TYLKO tego, czego operator nie sprawdzi za nas w chwili
// zakupu. Zapasu na kolejne miesiące nie pilnujemy — abonament pobiera
// SuperVoIP z salda i to jest ich mechanizm, nie nasz.
// ============================================================================
import { assertEquals, assertThrows } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { czyWolnoKupic, przygotujZakup } from "./supervoipZakup.ts";

const KONTO = { saldo: 68.72, mozeKupic: true, numeryZablokowane: false };
const NUMER = { miesiecznie: 1.23, aktywacja: 0 };

Deno.test("zwykly numer przechodzi przy dzisiejszym saldzie", () => {
  const w = czyWolnoKupic(KONTO, NUMER);
  assertEquals(w.wolno, true);
  assertEquals(w.saldoPo, 67.49);
});

Deno.test("saldo nizsze niz koszt zatrzymuje zakup", () => {
  assertEquals(czyWolnoKupic({ ...KONTO, saldo: 0.5 }, NUMER).wolno, false);
  // Numer złoty z aktywacją 100 zł przy saldzie 68,72 też nie przejdzie.
  assertEquals(czyWolnoKupic(KONTO, { miesiecznie: 1.23, aktywacja: 100 }).wolno, false);
});

Deno.test("saldo rowne kosztowi jeszcze przechodzi", () => {
  const w = czyWolnoKupic({ ...KONTO, saldo: 1.23 }, NUMER);
  assertEquals(w.wolno, true);
  assertEquals(w.saldoPo, 0);
});

Deno.test("blokada po stronie operatora wygrywa z kazdym saldem", () => {
  assertEquals(czyWolnoKupic({ ...KONTO, saldo: 100000, mozeKupic: false }, NUMER).wolno, false);
  assertEquals(czyWolnoKupic({ ...KONTO, saldo: 100000, numeryZablokowane: true }, NUMER).wolno, false);
});

Deno.test("bez `zamierzone: true` nie powstaje nawet ladunek zadania", () => {
  assertThrows(
    () => przygotujZakup({ numerIri: "/api/numbers/1", sipIri: "/api/sips/1291084", konto: KONTO, koszt: NUMER, powod: "warsztat Kowalski" }),
    Error,
    "zamierzone: true",
  );
});

Deno.test("powod jest obowiazkowy", () => {
  assertThrows(
    () => przygotujZakup({ numerIri: "/api/numbers/1", sipIri: "/api/sips/1291084", konto: KONTO, koszt: NUMER, zamierzone: true, powod: "bo tak" }),
    Error,
    "powod",
  );
});

Deno.test("zla postac IRI nie przechodzi — literowka nie ma kupic innego numeru", () => {
  for (const [numer, sip] of [["/api/numbers/abc", "/api/sips/1"], ["1234", "/api/sips/1"], ["/api/numbers/1", "1291084"]]) {
    assertThrows(() => przygotujZakup({
      numerIri: numer, sipIri: sip, konto: KONTO, koszt: NUMER,
      zamierzone: true, powod: "warsztat testowy Kowalski",
    }));
  }
});

Deno.test("brak srodkow zatrzymuje budowanie ladunku, nie dopiero wysylke", () => {
  assertThrows(
    () => przygotujZakup({
      numerIri: "/api/numbers/4109", sipIri: "/api/sips/1291084",
      konto: { ...KONTO, saldo: 0 }, koszt: NUMER, zamierzone: true, powod: "warsztat Kowalski, numer warszawski",
    }),
    Error,
    "ODMOWA ZAKUPU",
  );
});

Deno.test("poprawny zakup zwraca ladunek zgodny ze specyfikacja operatora", () => {
  const { sciezka, cialo, werdykt } = przygotujZakup({
    numerIri: "/api/numbers/81045", sipIri: "/api/sips/1291084",
    konto: KONTO, koszt: NUMER, zamierzone: true, powod: "warsztat Kowalski, numer warszawski",
  });
  assertEquals(sciezka, "/api/voip_numbers");
  assertEquals(cialo, { number: "/api/numbers/81045", sip: "/api/sips/1291084", firstSubscriptionPeriod: null });
  assertEquals(werdykt.wolno, true);
});
