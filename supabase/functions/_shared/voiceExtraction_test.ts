import test from "node:test";
import assert from "node:assert/strict";
import { parseExtraction, transcriptToText } from "./voiceExtraction.ts";

test("czysta odpowiedź modelu parsuje się w komplet danych", () => {
  const r = parseExtraction(JSON.stringify({
    complaint: "Stuki w zawieszeniu z przodu",
    date: "2026-08-07", time: "11:00",
    first_name: "Daniel", last_name: null, phone: null,
    brand: "BMW", model: "X5", plate: "WY996EU",
    wants_cancel: false, wants_reschedule: false,
  }));
  assert.equal(r.parse_failed, false);
  assert.equal(r.complaint, "Stuki w zawieszeniu z przodu");
  assert.equal(r.date, "2026-08-07");
  assert.equal(r.time, "11:00");
  assert.equal(r.last_name, null, "nazwisko nie jest wymagane — agent o nie nie pyta");
});

test("model gadatliwy mimo instrukcji — wycinamy pierwszy obiekt JSON", () => {
  const r = parseExtraction('Oczywiście, oto dane:\n```json\n{"complaint":"Wymiana oleju","date":"2026-08-07","time":"9:00"}\n```\nDaj znać!');
  assert.equal(r.parse_failed, false);
  assert.equal(r.complaint, "Wymiana oleju");
  assert.equal(r.time, "09:00", "9:00 i 09:00 znaczą to samo");
});

test("ZASADA 12: śmieci od modelu to BŁĄD, nie brak danych", () => {
  for (const smiec of ["", "nie wiem", "{niepoprawny json", "null"]) {
    const r = parseExtraction(smiec);
    assert.equal(r.parse_failed, true, `"${smiec}" ma dać parse_failed`);
  }
});

test("nieprawdziwe wartości są ODRZUCANE, nie poprawiane", () => {
  const r = parseExtraction(JSON.stringify({
    date: "07.08.2026",     // zły format
    time: "25:00",          // nie istnieje
    complaint: "  ",        // same spacje
    first_name: "null",     // model wpisał słowo zamiast wartości
  }));
  assert.equal(r.parse_failed, false, "obiekt był poprawnym JSON-em");
  assert.equal(r.date, null);
  assert.equal(r.time, null);
  assert.equal(r.complaint, null);
  assert.equal(r.first_name, null);
});

test("intencja odwołania i przełożenia wraca jako flagi", () => {
  const cancel = parseExtraction(JSON.stringify({ wants_cancel: true }));
  assert.equal(cancel.wants_cancel, true);
  assert.equal(cancel.wants_reschedule, false);
  // Wartości inne niż true nie włączają flagi — "tak" ani 1 nie są true.
  const nie = parseExtraction(JSON.stringify({ wants_cancel: "tak" }));
  assert.equal(nie.wants_cancel, false);
});

test("numer podany świadomie przez klienta ma własną flagę", () => {
  const r = parseExtraction(JSON.stringify({ phone: "600100200", phone_provided_by_customer: true }));
  assert.equal(r.phone, "600100200");
  assert.equal(r.phone_provided_by_customer, true);
});

test("transkrypt bez treści (same narzędzia) nie trafia do modelu", () => {
  assert.equal(transcriptToText([{ role: "agent", message: null }, { role: "agent", message: "  " }]), "");
});

test("transkrypt składa się w tekst z rolami po polsku", () => {
  const txt = transcriptToText([
    { role: "agent", message: "Dzień dobry" },
    { role: "user", message: "Chcę się umówić" },
    { role: "agent", message: null },
  ]);
  assert.equal(txt, "AGENT: Dzień dobry\nKLIENT: Chcę się umówić");
});
