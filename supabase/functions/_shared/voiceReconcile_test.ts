import test from "node:test";
import assert from "node:assert/strict";
import {
  missingForCommit,
  normalizePhone,
  normalizePlate,
  reconcileCall,
  type ExtractedCall,
} from "./voiceReconcile.ts";

const extracted = (over: Partial<ExtractedCall> = {}): ExtractedCall => ({
  complaint: "Stuki w zawieszeniu",
  date: "2026-08-06",
  time: "09:00",
  first_name: "Daniel",
  last_name: "Mosaczkowski",
  phone: "519474583",
  brand: "BMW",
  model: "X5",
  plate: "WY996EU",
  ...over,
});

test("numery z rozmów testowych normalizują się do tej samej wartości", () => {
  // Trzy warianty tego samego numeru, jakie ASR wyprodukował w rozmowach 04-05.08.
  assert.equal(normalizePhone("519474583"), "519474583");
  assert.equal(normalizePhone("+48519474583"), "519474583");
  assert.equal(normalizePhone("12 919 474 583"), "919474583"); // przekręcony — NIE trafi
  assert.equal(normalizePhone(null), "");
  assert.equal(normalizePlate("wy 996 eu"), "WY996EU");
  assert.equal(normalizePlate("WY996EU"), "WY996EU");
});

test("caller_id z sygnalizacji bije numer usłyszany przez ASR", () => {
  // W rozmowie 05.08 00:04 ASR podał "12194747458", a sygnalizacja +48519474583.
  const r = reconcileCall({
    extracted: extracted({ phone: "12194747458" }),
    callerId: "+48519474583",
    clientsByPhone: [{ id: "c1", first_name: "Daniel", last_name: "Moszeczkow", phone: "519474583" }],
    vehiclesByPlate: [],
  });
  assert.equal(r.phone, "519474583");
  assert.equal(r.clientId, "c1");
  assert.equal(r.clientSource, "by_caller_id");
  // Nazwisko z BAZY, nie z ASR — ASR mylił je w pięciu rozmowach na pięć.
  assert.equal(r.lastName, "Moszeczkow");
});

test("dane pojazdu z bazy zastępują to, co usłyszał ASR", () => {
  const r = reconcileCall({
    extracted: extracted({ brand: "BMW", model: "X3" }),
    callerId: "+48519474583",
    clientsByPhone: [{ id: "c1", first_name: "Daniel", last_name: "Moszeczkow", phone: "519474583" }],
    vehiclesByPlate: [{ id: "v1", owner_client_id: "c1", brand: "BMW", model: "X5", plate: "WY996EU" }],
  });
  assert.equal(r.vehicleId, "v1");
  assert.equal(r.model, "X5");
  assert.equal(r.vehicleSource, "by_plate");
  assert.equal(r.needsReview, false);
});

test("przypadek (c): rejestracja wskazuje innego właściciela niż telefon — ZAPISUJEMY z flagą", () => {
  const r = reconcileCall({
    extracted: extracted(),
    callerId: "+48600100200",
    clientsByPhone: [{ id: "c-dzwoniacy", first_name: "Anna", last_name: "Nowak", phone: "600100200" }],
    vehiclesByPlate: [{ id: "v1", owner_client_id: "c-wlasciciel", brand: "BMW", model: "X5", plate: "WY996EU" }],
  });
  // ZASADA 9: dopasowanie poprawia dane, nigdy nie wstrzymuje zapisu.
  assert.equal(r.clientId, "c-wlasciciel");
  assert.equal(r.clientSource, "by_vehicle_owner");
  assert.equal(r.needsReview, true);
  assert.ok(r.reviewReason && r.reviewReason.length > 0);
});

test("przypadek (d): nic nie pasuje — nowy klient z danymi z rozmowy", () => {
  const r = reconcileCall({
    extracted: extracted({ last_name: "Mosleczko" }),
    callerId: "+48519474583",
    clientsByPhone: [],
    vehiclesByPlate: [],
  });
  assert.equal(r.clientId, null);
  assert.equal(r.clientSource, "new");
  assert.equal(r.lastName, "Mosleczko");
  assert.equal(r.needsReview, false, "nowy klient to normalna sytuacja, nie powód do weryfikacji");
});

test("brak caller_id nie blokuje niczego — zostaje numer z rozmowy", () => {
  const r = reconcileCall({
    extracted: extracted(),
    callerId: null,
    clientsByPhone: [],
    vehiclesByPlate: [],
  });
  assert.equal(r.phone, "519474583");
});

test("kolejka weryfikacji TYLKO gdy zapisu nie da się wykonać", () => {
  // Dziwne nazwisko to nie powód — zasada 9.
  assert.deepEqual(missingForCommit(extracted({ last_name: "Xqzptr" }), "519474583"), []);
  // Brak terminu — powód.
  assert.deepEqual(missingForCommit(extracted({ date: null }), "519474583"), ["termin: brak daty"]);
  assert.deepEqual(missingForCommit(extracted({ time: null }), "519474583"), ["termin: brak godziny"]);
  // Brak telefonu z obu źródeł — powód.
  assert.equal(missingForCommit(extracted({ phone: null }), null).length, 1);
});

test("rozmowa urwana przed kompletem trafia do kolejki, a nie do bazy", () => {
  const urwana = extracted({ date: null, time: null, plate: null, last_name: null });
  const braki = missingForCommit(urwana, null);
  assert.equal(braki.length, 3);
});
