import test from "node:test";
import assert from "node:assert/strict";
import { cenaDoWypowiedzeniaEn, czasDoWypowiedzeniaEn, doWypowiedzeniaEn, powodEn } from "./voiceSnapshotEn.ts";

test("data po angielsku: dzien tygodnia zgadza sie z polskim modulem", () => {
  // 2026-08-18 to WTOREK — ta sama data, na ktorej modul polski daje
  // „wtorek, osiemnastego sierpnia". Jesli tu wyjdzie inny dzien, to znaczy,
  // ze dwa modulu licza date inaczej — i to jest blad grozniejszy niz zla odmiana.
  assert.equal(doWypowiedzeniaEn("2026-08-18"), "Tuesday, 18 August");
  assert.equal(doWypowiedzeniaEn("2026-08-19"), "Wednesday, 19 August");
  assert.equal(doWypowiedzeniaEn("2026-08-15"), "Saturday, 15 August");
  assert.equal(doWypowiedzeniaEn("2026-01-01"), "Thursday, 1 January");
});

test("liczebnik porzadkowy ZOSTAWIAMY modelowi", () => {
  // Swiadomie „18 August", nie „the eighteenth of August". Angielska odmiana
  // to st/nd/rd/th i model sobie z nia radzi; po polsku pole gotowe jest
  // konieczne, bo agent trzy razy powiedzial „wtorek dziewietnascie sierpnia".
  assert.ok(!doWypowiedzeniaEn("2026-08-18").includes("eighteenth"));
  assert.ok(!doWypowiedzeniaEn("2026-08-01").includes("first"));
});

test("czas trwania — ta sama siatka co po polsku", () => {
  assert.equal(czasDoWypowiedzeniaEn(30), "about half an hour");
  assert.equal(czasDoWypowiedzeniaEn(60), "about an hour");
  assert.equal(czasDoWypowiedzeniaEn(120), "about two hours");
  assert.equal(czasDoWypowiedzeniaEn(75), "a few hours");
  assert.equal(czasDoWypowiedzeniaEn(480), "a full day");
});

test("cena surowa, waluta ZOSTAJE zlotowka", () => {
  assert.equal(cenaDoWypowiedzeniaEn(150, 250), "150 to 250 zloty");
  assert.equal(cenaDoWypowiedzeniaEn(160, 160), "160 zloty");
  assert.equal(cenaDoWypowiedzeniaEn(150, null), "150 zloty");
  // Anglojezyczny klient w polskim warsztacie placi zlotowkami — nie wolno
  // przeliczac ani mowic o funtach czy euro.
  assert.ok(!cenaDoWypowiedzeniaEn(150, 250).match(/pound|euro|dollar|\$|£|€/i));
});

test("powody zamkniecia maja odpowiedniki", () => {
  assert.equal(powodEn("zamknięte"), "closed");
  assert.equal(powodEn("brak wolnych terminów"), "no free slots");
});
