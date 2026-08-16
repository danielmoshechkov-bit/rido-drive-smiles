// ============================================================================
// supervoipZakup_test.ts — czy bramka zakupu naprawdę zatrzymuje zakup.
//
// Liczby w tych testach nie są wymyślone: to stan konta odczytany 16.08.
//   saldo 68,72 zł, prepaid, creditLimit 0
//   pakiet „SIP trunk 20" 121,77 zł/mc brutto + usługa API 61,50 zł/mc
//   numer stacjonarny: 1,23 zł/mc brutto, aktywacja 0 zł
// Przy tym stanie saldo NIE pokrywa nawet jednego miesiąca stałych kosztów —
// i test ma to pokazywać, dopóki to prawda.
// ============================================================================
import { assertEquals, assertThrows } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { czyWolnoKupic, przygotujZakup } from "./supervoipZakup.ts";

const KONTO_DZIS = { saldo: 68.72, mozeKupic: true, numeryZablokowane: false, staleMiesieczne: 183.27 };
const NUMER = { miesiecznie: 1.23, aktywacja: 0 };

Deno.test("dzisiejsze saldo nie starcza na wymagany zapas", () => {
  const w = czyWolnoKupic(KONTO_DZIS, NUMER);
  assertEquals(w.wolno, false);
  // 68,72 - 1,23 = 67,49 przy 184,50 zł/mc to mniej niż pół miesiąca.
  assertEquals(w.saldoPo, 67.49);
  assertEquals(w.miesiecyZapasu < 1, true);
});

Deno.test("przy zasilonym saldzie zakup przechodzi", () => {
  const w = czyWolnoKupic({ ...KONTO_DZIS, saldo: 600 }, NUMER);
  assertEquals(w.wolno, true);
  assertEquals(w.saldoPo, 598.77);
});

Deno.test("blokada po stronie operatora wygrywa z kazdym saldem", () => {
  assertEquals(czyWolnoKupic({ ...KONTO_DZIS, saldo: 100000, mozeKupic: false }, NUMER).wolno, false);
  assertEquals(czyWolnoKupic({ ...KONTO_DZIS, saldo: 100000, numeryZablokowane: true }, NUMER).wolno, false);
});

Deno.test("numer zloty z aktywacja liczy sie do salda", () => {
  const w = czyWolnoKupic({ ...KONTO_DZIS, saldo: 400 }, { miesiecznie: 1.23, aktywacja: 100 });
  assertEquals(w.saldoPo, 298.77);
});

Deno.test("bez `zamierzone: true` nie powstaje nawet ladunek zadania", () => {
  assertThrows(
    () => przygotujZakup({ numerIri: "/api/numbers/1", sipIri: "/api/sips/1291084", konto: { ...KONTO_DZIS, saldo: 600 }, koszt: NUMER, powod: "warsztat Kowalski" }),
    Error,
    "zamierzone: true",
  );
});

Deno.test("powod jest obowiazkowy", () => {
  assertThrows(
    () => przygotujZakup({ numerIri: "/api/numbers/1", sipIri: "/api/sips/1291084", konto: { ...KONTO_DZIS, saldo: 600 }, koszt: NUMER, zamierzone: true, powod: "bo tak" }),
    Error,
    "powod",
  );
});

Deno.test("zla postac IRI nie przechodzi — literowka nie ma kupic innego numeru", () => {
  for (const [numer, sip] of [["/api/numbers/abc", "/api/sips/1"], ["1234", "/api/sips/1"], ["/api/numbers/1", "1291084"]]) {
    assertThrows(() => przygotujZakup({
      numerIri: numer, sipIri: sip, konto: { ...KONTO_DZIS, saldo: 600 }, koszt: NUMER,
      zamierzone: true, powod: "warsztat testowy Kowalski",
    }));
  }
});

Deno.test("przy dzisiejszym saldzie ladunek NIE powstaje", () => {
  assertThrows(
    () => przygotujZakup({
      numerIri: "/api/numbers/4109", sipIri: "/api/sips/1291084",
      konto: KONTO_DZIS, koszt: NUMER, zamierzone: true, powod: "warsztat Kowalski, numer warszawski",
    }),
    Error,
    "ODMOWA ZAKUPU",
  );
});

Deno.test("poprawny zakup zwraca ladunek zgodny ze specyfikacja operatora", () => {
  const { sciezka, cialo, werdykt } = przygotujZakup({
    numerIri: "/api/numbers/81045", sipIri: "/api/sips/1291084",
    konto: { ...KONTO_DZIS, saldo: 600 }, koszt: NUMER,
    zamierzone: true, powod: "warsztat Kowalski, numer warszawski",
  });
  assertEquals(sciezka, "/api/voip_numbers");
  assertEquals(cialo, { number: "/api/numbers/81045", sip: "/api/sips/1291084", firstSubscriptionPeriod: null });
  assertEquals(werdykt.wolno, true);
});
