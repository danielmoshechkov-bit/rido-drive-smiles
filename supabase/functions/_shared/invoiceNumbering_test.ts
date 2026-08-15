import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInvoiceNumber,
  extractSeq,
  nextSeq,
  seriesLike,
  type NumberingConfig,
} from "./invoiceNumbering.ts";

// Numeracja liczy się teraz w DWÓCH miejscach: we froncie (podgląd w kreatorze)
// i w edge function (faktura sprzedażowa z webhooka). Moduł jest jeden, ale te
// testy pilnują, żeby rozdzielenie nigdy nie wróciło tylnymi drzwiami —
// dwie faktury o tym samym numerze są nieodwracalne po wysyłce do KSeF.

const FS: NumberingConfig = { prefix: "FS", pattern: "NNN/RRRR", mode: "continuous" };
const dzien = new Date("2026-08-15T10:00:00Z");

test("wzór FS/NNN/RRRR — format uzgodniony dla faktur sprzedażowych GetRido", () => {
  assert.equal(buildInvoiceNumber(FS, dzien, 1), "FS/001/2026");
  assert.equal(buildInvoiceNumber(FS, dzien, 42), "FS/042/2026");
  assert.equal(buildInvoiceNumber(FS, dzien, 1234), "FS/1234/2026");
});

test("wszystkie cztery wzory dają przewidywalny numer", () => {
  const p = (pattern: NumberingConfig["pattern"]) =>
    buildInvoiceNumber({ ...FS, pattern }, dzien, 7);
  assert.equal(p("RRRR/MM/NNN"), "FS/2026/08/007");
  assert.equal(p("RRRR/NNN"), "FS/2026/007");
  assert.equal(p("NNN/RRRR"), "FS/007/2026");
  assert.equal(p("NNN"), "FS/007");
});

test("seria zawęża zapytanie do bieżącego roku, nie do całej historii", () => {
  assert.equal(seriesLike(FS, dzien), "FS/%/2026");
  assert.equal(seriesLike({ ...FS, pattern: "RRRR/MM/NNN" }, dzien), "FS/2026/08/%");
});

test("numer spoza serii jest ignorowany przy liczeniu następnego", () => {
  assert.equal(extractSeq(FS, dzien, "FS/007/2026"), 7);
  assert.equal(extractSeq(FS, dzien, "FS/007/2025"), null, "inny rok to inna seria");
  assert.equal(extractSeq(FS, dzien, "FV/007/2026"), null, "inny prefiks to inna seria");
  assert.equal(extractSeq(FS, dzien, "cokolwiek"), null);
});

test("prefiks ze znakami regexowymi nie rozwala dopasowania", () => {
  // Administrator może wpisać w panelu cokolwiek — prefiks trafia do wyrażenia.
  const dziwny: NumberingConfig = { prefix: "F.S+", pattern: "NNN/RRRR", mode: "continuous" };
  assert.equal(extractSeq(dziwny, dzien, "F.S+/003/2026"), 3);
  assert.equal(extractSeq(dziwny, dzien, "FxSy/003/2026"), null);
});

test("KOLIZJA NUMERU: po zajęciu numeru kolejne liczenie daje następny", () => {
  // Tak działa ponowienie w billing-invoice-issue: numer liczony OD NOWA
  // z aktualnego stanu, nie ponawiany ten sam.
  assert.equal(nextSeq("continuous", []), 1);
  assert.equal(nextSeq("continuous", [1]), 2);
  assert.equal(nextSeq("continuous", [1, 2]), 3);
  // Luka w numeracji NIE jest wypełniana w trybie ciągłym — numer rośnie.
  assert.equal(nextSeq("continuous", [1, 3]), 4);
});

test("tryb fill_gaps wypełnia najniższą lukę", () => {
  assert.equal(nextSeq("fill_gaps", [1, 3]), 2);
  assert.equal(nextSeq("fill_gaps", [1, 2, 3]), 4);
  assert.equal(nextSeq("fill_gaps", []), 1);
});
