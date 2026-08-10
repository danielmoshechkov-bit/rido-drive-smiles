import test from "node:test";
import assert from "node:assert/strict";
import { hasPersonalData, redactPersonalData, shouldDistill } from "./voiceLearningGate.ts";

// --- dane osobowe: przypadki WZIĘTE Z BAZY, nie wymyślone ------------------

test("numer telefonu cyframi znika we wszystkich zapisach z bazy", () => {
  for (const wariant of ["519474583", "519-474-583", "519 474 583", "+48 519474583"]) {
    const out = redactPersonalData(`Powtórzę dla pewności — numer ${wariant}, zgadza się?`);
    assert.ok(!/\d{3}/.test(out), `"${wariant}" zostało: ${out}`);
    assert.match(out, /\[numer telefonu\]/);
  }
});

test("numer telefonu SŁOWNIE — tak trafił do bazy wiedzy", () => {
  const out = redactPersonalData(
    "Powtórzyć numer głośno: 'Czyli pięćset dziewiętnaście, cztery siedem, cztery, pięćset osiemdziesiąt trzy - dobrze?'",
  );
  assert.match(out, /\[numer telefonu\]/);
  assert.ok(!/pięćset dziewiętnaście/.test(out));
});

test("tablica rejestracyjna znika, zwykłe słowa zostają", () => {
  const out = redactPersonalData("Podsumowując: Daniel, BMW X5, WY996EU, piątek");
  assert.match(out, /\[nr rejestracyjny\]/);
  assert.ok(!/WY996EU/.test(out));
  // Nie chcemy, żeby filtr zjadał zwykły tekst.
  assert.equal(redactPersonalData("Klient prosi o przegląd"), "Klient prosi o przegląd");
});

test("imię w wołaczu zamienia się na placeholder, forma grzecznościowa zostaje", () => {
  const out = redactPersonalData("Panie Danielu, potwierdzam termin");
  assert.match(out, /^Panie \[imię\]/);
});

test("ZASADA 22: godzina w przykładzie zamienia się na formę", () => {
  // To jest dokładnie ten wpis, przez który agent zmyślił dostępność.
  const out = redactPersonalData("Zaproponuj 2-3 opcje: 'Mamy dostępne 9:00, 11:00 lub 14:00'");
  assert.ok(!/9:00|11:00|14:00/.test(out), out);
  assert.match(out, /\[godzina\]/);
});

test("ZASADA 22: data i kwota też są wartościami", () => {
  assert.match(redactPersonalData("środa 17 czerwca o 10:00"), /\[data\]/);
  assert.match(redactPersonalData("termin 2026-08-07"), /\[data\]/);
  assert.match(redactPersonalData("koszt 250 zł"), /\[kwota\]/);
});

test("hasPersonalData wykrywa to, co redact zmienia", () => {
  assert.equal(hasPersonalData("Podsumuj usługę, pojazd i termin"), false);
  assert.equal(hasPersonalData("numer 519474583"), true);
});

// --- bramka uczenia --------------------------------------------------------

const udana = {
  hasOrder: true, durationSeconds: 95, hadTruncation: false,
  agentMessages: ["Dzień dobry", "Gotowe — piątek o jedenastej"],
};

test("rozmowa udana przechodzi", () => {
  const v = shouldDistill(udana);
  assert.equal(v.allow, true);
  assert.equal(v.flagForReview, false);
  assert.deepEqual(v.reasons, []);
});

test("rozmowa bez zapisu NIE jest wzorcem", () => {
  const v = shouldDistill({ ...udana, hasOrder: false });
  assert.equal(v.allow, false);
  assert.match(v.reasons.join(" "), /brak zapisu/);
  assert.equal(v.flagForReview, true, "ma trafić do przeglądu człowieka");
});

test("rozmowa krótsza niż 30 s nie uczy niczego", () => {
  const v = shouldDistill({ ...udana, durationSeconds: 17 });
  assert.equal(v.allow, false);
  assert.match(v.reasons.join(" "), /krótsza niż 30 s/);
});

test("rozmowa z ucięciem odpowiedzi nie uczy — to był qrgbn9cy", () => {
  const v = shouldDistill({ ...udana, hadTruncation: true });
  assert.equal(v.allow, false);
  assert.equal(v.flagForReview, true);
});

test("agent przepraszał → przegląd, nie destylacja", () => {
  const v = shouldDistill({
    ...udana,
    agentMessages: ["Przepraszam, nie zdążyłem dokończyć. Czy mogę powtórzyć krócej?"],
  });
  assert.equal(v.allow, false);
  assert.equal(v.flagForReview, true);
  assert.match(v.reasons.join(" "), /przepraszał/);
});

test("powody kumulują się — widać wszystkie, nie pierwszy z brzegu", () => {
  const v = shouldDistill({
    hasOrder: false, durationSeconds: 12, hadTruncation: true,
    agentMessages: ["Przepraszam, wystąpił problem techniczny"],
  });
  assert.equal(v.allow, false);
  assert.equal(v.reasons.length, 4);
});
