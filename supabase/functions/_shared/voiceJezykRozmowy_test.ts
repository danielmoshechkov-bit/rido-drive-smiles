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

test("nazwy uslug ZOSTAJA po polsku — to dane warsztatu, nie nasz tekst", () => {
  // Swiadome ograniczenie, nie przeoczenie: cennik nalezy do warsztatu i nie
  // wolno nam podmieniac nazw, bo przestalyby sie zgadzac z tym, co warsztat
  // widzi w panelu i na zleceniu. Za to prompt zakazuje CZYTANIA polskiej
  // nazwy na glos w obcojezycznej rozmowie — agent nazywa uslugę wlasnymi
  // slowami w jezyku rozmowy.
  const s = JSON.stringify({ uslugi: [{ nazwa: "Wymiana klocków hamulcowych", cena: { od: 150, do: 250 } }] });
  const ru = JSON.parse(snapshotWJezyku(s, "ru"));
  assert.equal(ru.uslugi[0].nazwa, "Wymiana klocków hamulcowych");
  assert.equal(ru.uslugi[0].cena.do_powiedzenia, "от ста пятидесяти до двухсот пятидесяти злотых");
});

test("JEZYK JEST LEPKI — rejestracja i imie go nie przestawiaja", () => {
  // Regresja z rozmowy 15.08 19:28: trzy ostatnie tury to "Daniel, Mazda RX8",
  // "ENU3658E" i "Понятно". Detektor przeglosowal cyrylice, wykryl polski
  // i agent pozegnal sie po polsku w rosyjskiej rozmowie.
  const r = [
    { role: "user", content: "Здравствуйте, а вы говорите по-русски?" },
    { role: "user", content: "Я б хотел записаться на сервис" },
    { role: "user", content: "Daniel, mm, ee, Mazda RX8" },
    { role: "user", content: "ENU3658E" },
    { role: "user", content: "Понятно" },
  ];
  assert.equal(jezykRozmowy(r), "ru");
});

test("zmiana jezyka wymaga DWOCH kolejnych tur", () => {
  const jedna = [
    { role: "user", content: "Dzień dobry, chciałbym umówić wizytę" },
    { role: "user", content: "Poproszę termin na jutro" },
    { role: "user", content: "Здравствуйте" },
  ];
  assert.equal(jezykRozmowy(jedna), "pl", "jedna tura w srodku rozmowy nie wystarcza");
  const dwie = [...jedna, { role: "user", content: "Я хочу записаться на сервис" }];
  assert.equal(jezykRozmowy(dwie), "ru", "dwie kolejne przestawiaja");
});

test("WYJATEK NA START — jedna wyrazna tura wystarcza", () => {
  // Czekanie na druga ture znaczyloby, ze pierwsza odpowiedz pojdzie po polsku
  // do kogos, kto polskiego nie zna.
  assert.equal(jezykRozmowy([{ role: "user", content: "Здравствуйте! Вы говорите по-русски?" }]), "ru");
  assert.equal(jezykRozmowy([{ role: "user", content: "Good morning, I would like to book my car in" }]), "en");
});

test("sama lacinka bez slow to BRAK SYGNALU, nie polski", () => {
  const r = [
    { role: "user", content: "Здравствуйте, я хочу записаться" },
    { role: "user", content: "Я хотел бы на понедельник" },
    { role: "user", content: "WPM6VC7" },
    { role: "user", content: "Mazda RX8" },
  ];
  assert.equal(jezykRozmowy(r), "ru");
});
