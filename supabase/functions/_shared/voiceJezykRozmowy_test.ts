import test from "node:test";
import assert from "node:assert/strict";
import { jezykRozmowy, snapshotWJezyku } from "./voiceJezykRozmowy.ts";

const w = (...t: string[]) => t.map((c) => ({ role: "user", content: c }));

test("polski jest domyslny — przy niepewnosci nie zmieniamy jezyka", () => {
  assert.equal(jezykRozmowy([]), "pl");
  assert.equal(jezykRozmowy(w("")), "pl");
  assert.equal(jezykRozmowy(w("mhm")), "pl");
  assert.equal(jezykRozmowy(w("Dzień dobry, chciałbym umówić się na wymianę oleju")), "pl");
});

test("polski BEZ ogonkow nadal jest polskim", () => {
  // ASR czesto gubi diakrytyki. Sama lacinka nie moze przestawic rozmowy
  // na angielski, bo wtedy kazda przekrecona polska tura zmienialaby jezyk.
  assert.equal(jezykRozmowy(w("dzien dobry chcialbym termin na jutro")), "pl");
});

test("rosyjski i ukrainski rozrozniane po literach charakterystycznych", () => {
  assert.equal(jezykRozmowy(w("Здравствуйте! Вы говорите по-русски?")), "ru");
  assert.equal(jezykRozmowy(w("Добрий день, чи можу записатися на заміну оливи?")), "uk");
});

test("angielski dopiero przy TRZECH slowach funkcyjnych", () => {
  assert.equal(jezykRozmowy(w("ok")), "pl");
  assert.equal(jezykRozmowy(w("Good morning, I would like to book an appointment for my car")), "en");
});

test("pojedyncze potwierdzenie NIE przestawia rozmowy", () => {
  // Trzy ostatnie tury, nie jedna: „da" w polskiej rozmowie to nie rosyjski.
  assert.equal(jezykRozmowy(w("Dzień dobry, poproszę termin", "tak", "da")), "pl");
});

test("polski snapshot wraca BEZ ZMIANY — zero dodatkowej sciezki", () => {
  const s = JSON.stringify({ dni: [{ data: "2026-08-18", do_wypowiedzenia: "wtorek, osiemnastego sierpnia" }] });
  assert.equal(snapshotWJezyku(s, "pl"), s);
});

test("daty i ceny podmienione na jezyk rozmowy", () => {
  const s = JSON.stringify({
    dni: [{ data: "2026-08-18", do_wypowiedzenia: "wtorek, osiemnastego sierpnia", do_wypowiedzenia_en: "Tuesday, 18 August" }],
    uslugi: [{ czas_znany: true, czas_blokady_min: 60, cena: { od: 150, do: 250, do_powiedzenia: "od stu…" } }],
  });
  const ru = JSON.parse(snapshotWJezyku(s, "ru"));
  assert.equal(ru.dni[0].do_wypowiedzenia, "вторник, восемнадцатого августа");
  assert.equal(ru.uslugi[0].cena.do_powiedzenia, "от ста пятидесяти до двухсот пятидесяти злотых");
  assert.equal(ru.uslugi[0].czas_do_powiedzenia, "около часа");
});

test("W SNAPSHOCIE ZOSTAJE JEDEN JEZYK — pola innych znikaja", () => {
  // Gdyby polskie albo angielskie pole zostalo, model moglby po nie siegnac
  // i wtracic obce slowo w srodek zdania.
  const s = JSON.stringify({
    dni: [{ data: "2026-08-18", do_wypowiedzenia: "wtorek…", do_wypowiedzenia_en: "Tuesday…", powod: "zamknięte", powod_en: "closed" }],
    uslugi: [{ cena: { od: 150, do: null, do_powiedzenia: "sto…", do_powiedzenia_en: "150 zloty" } }],
  });
  const ru = snapshotWJezyku(s, "ru");
  assert.ok(!ru.includes("do_wypowiedzenia_en"));
  assert.ok(!ru.includes("do_powiedzenia_en"));
  assert.ok(!ru.includes("powod_en"));
  assert.ok(!ru.includes("Tuesday"));
  assert.ok(!ru.includes("150 zloty"));
});

test("czego nie umiemy przetlumaczyc — USUWAMY, nie zostawiamy po polsku", () => {
  const s = JSON.stringify({ ustawienia: { polityka_wyceny_tekst: "Kosztorys pokażemy przed rozpoczęciem naprawy." } });
  const ru = JSON.parse(snapshotWJezyku(s, "ru"));
  assert.equal(ru.ustawienia.polityka_wyceny_tekst, undefined);
});

test("uszkodzony snapshot nie wywraca tury", () => {
  assert.equal(snapshotWJezyku("to nie jest JSON", "ru"), "to nie jest JSON");
  assert.equal(snapshotWJezyku("", "ru"), "");
});
