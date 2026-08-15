import test from "node:test";
import assert from "node:assert/strict";
import {
  czasDoWypowiedzenia, czasUslugi, doWypowiedzenia, hhmm, kluczDnia,
  cenaDoWypowiedzenia, minuty, ostatniStart, przyimekZDniem, wolneGodziny, zbudujDni,
} from "./voiceSnapshot.ts";

// --- odmiana: dokładnie te błędy padły w rozmowie 11.08 -------------------

test("dzien miesiaca w dopelniaczu: dziewietnastego, nie dziewietnascie", () => {
  // 19.08.2026 to ŚRODA. Agent w rozmowie 11.08 trzy razy powiedział „wtorek
  // dziewiętnaście sierpnia" — pomylił i odmianę, i dzień tygodnia. Klientka
  // prosiła o wtorek przyszłego tygodnia, czyli 18 sierpnia.
  assert.equal(doWypowiedzenia("2026-08-19"), "środę, dziewiętnastego sierpnia");
  assert.equal(doWypowiedzenia("2026-08-18"), "wtorek, osiemnastego sierpnia");
  assert.equal(doWypowiedzenia("2026-08-12"), "środę, dwunastego sierpnia");
  assert.equal(doWypowiedzenia("2026-08-01"), "sobotę, pierwszego sierpnia");
  assert.equal(doWypowiedzenia("2026-08-21"), "piątek, dwudziestego pierwszego sierpnia");
});

test("przyimek: we wtorek i we srode, nie w wtorek", () => {
  assert.match(przyimekZDniem("2026-08-18"), /^we wtorek/);
  assert.match(przyimekZDniem("2026-08-19"), /^we środę/);
  assert.match(przyimekZDniem("2026-08-17"), /^w poniedziałek/);
});

// --- ostatni start liczony PER USŁUGA ------------------------------------

test("krótka usługa kończy się na najpóźniejszej godzinie przyjęcia", () => {
  // mycie 60 min, praca do 17:00, przyjęcia do 16:00 → decyduje ustawienie
  assert.equal(hhmm(ostatniStart("17:00", 60, "16:00")), "16:00");
});

test("usługa ośmiogodzinna musi zacząć rano — ustawienie NIE wystarcza", () => {
  // ceramika 480 min przy pracy 9-17: 17:00 - 8 h = 9:00, mimo „przyjęcia do 16:00"
  assert.equal(hhmm(ostatniStart("17:00", 480, "16:00")), "09:00");
});

test("usługa dłuższa niż dzień pracy nie ma ani jednego slotu", () => {
  const g = { open: "09:00", close: "17:00" };
  assert.deepEqual(wolneGodziny(g, 960, 6, []), [], "folie 2 dni — brak startu tego dnia");
});

// --- czas: do wyliczeń zawsze, do powiedzenia tylko gdy znany -------------

test("czas z usługi → wolno o nim mówić", () => {
  const r = czasUslugi({ id: "1", nazwa: "x", cena_od: 1, cena_do: 1, duration_minutes: 90 }, 60);
  assert.deepEqual(r, { czas_blokady_min: 90, czas_znany: true });
});

test("brak czasu przy usłudze → domyślny z ustawień, ale NIE do powiedzenia", () => {
  const r = czasUslugi({ id: "1", nazwa: "x", cena_od: 1, cena_do: 1, duration_minutes: null }, 45);
  assert.equal(r.czas_blokady_min, 45);
  assert.equal(r.czas_znany, false, "domyślna wartość rezerwuje miejsce, nie informuje klienta");
});

test("brak czasu i brak ustawienia → 60 minut, nadal nie do powiedzenia", () => {
  const r = czasUslugi({ id: "1", nazwa: "x", cena_od: null, cena_do: null, duration_minutes: null }, null);
  assert.deepEqual(r, { czas_blokady_min: 60, czas_znany: false });
});

test("czas trwania ma gotową formę, poza siatką mówimy zachowawczo", () => {
  assert.equal(czasDoWypowiedzenia(60), "około godziny");
  assert.equal(czasDoWypowiedzenia(120), "około dwóch godzin");
  assert.equal(czasDoWypowiedzenia(75), "kilka godzin");
  assert.equal(czasDoWypowiedzenia(480), "cały dzień");
});

// --- wolne godziny --------------------------------------------------------

test("pojemność to liczba zasobów, nie jeden klient na godzinę", () => {
  const g = { open: "09:00", close: "17:00" };
  // 09:00 zajęte przez 2 z 6 zasobów — nadal wolne
  assert.equal(wolneGodziny(g, 60, 6, ["09:00", "09:00"])[0], "09:00");
  // 09:00 zajęte przez wszystkie 2 zasoby — pierwszy wolny to 09:30
  assert.equal(wolneGodziny(g, 60, 2, ["09:00", "09:00"])[0], "09:30");
});

test("dzień zamknięty nie ma slotów", () => {
  assert.deepEqual(wolneGodziny({ open: "09:00", close: "17:00", closed: true }, 60, 6, []), []);
});

test("zwracamy najwyżej trzy sloty — reszta to szum w prompcie", () => {
  assert.equal(wolneGodziny({ open: "09:00", close: "17:00" }, 60, 6, []).length, 3);
});

test("trzy sloty ROZLOZONE NA DZIEN, nie trzy pierwsze od otwarcia", () => {
  // Regresja z rozmowy 15.08 10:49: kazdy dzien w snapshocie wygladal identycznie
  // (["09:00","09:30","10:00"]), wiec agent nigdy nie widzial popoludnia.
  // Klient trzy razy prosil o pozna godzine i trzy razy uslyszal to samo,
  // az powiedzial „nie, nie dzialaj".
  const o = wolneGodziny({ open: "09:00", close: "17:00" }, 60, 6, []);
  assert.equal(o[0], "09:00", "pierwszy slot to nadal otwarcie");
  assert.equal(o.at(-1), "16:00", "ostatni slot to ostatni MOZLIWY start, nie 10:00");
  assert.ok(minuty(o[1]) > minuty("11:00"), "srodkowy slot ma byc w srodku dnia");
});

test("gdy wolnych godzin jest mniej niz trzy, wracaja wszystkie", () => {
  // 16:00 i 16:30 zajete przy pojemnosci 1 -> zostaje sam poranek
  const g = { open: "15:00", close: "17:00" };
  assert.deepEqual(wolneGodziny(g, 60, 1, ["16:00"], 30, null, 3), ["15:00", "15:30"]);
});

// --- nazwane dni ----------------------------------------------------------

test("pierwsze trzy dni mają nazwy, weekend jest zamknięty z powodem", () => {
  const godziny = {
    mon: { open: "09:00", close: "17:00" }, tue: { open: "09:00", close: "17:00" },
    wed: { open: "09:00", close: "17:00" }, thu: { open: "09:00", close: "17:00" },
    fri: { open: "09:00", close: "17:00" },
    sat: { open: "09:00", close: "17:00", closed: true },
    sun: { open: "09:00", close: "17:00", closed: true },
  };
  // 2026-08-14 to piątek → jutro sobota, pojutrze niedziela
  const dni = zbudujDni("2026-08-14", 4, godziny, () => ["09:00"]);
  assert.equal(dni[0].klucz, "dzisiaj");
  assert.equal(dni[1].klucz, "jutro");
  assert.equal(dni[1].otwarte, false);
  assert.equal(dni[1].powod, "zamknięte");
  assert.equal(dni[2].klucz, "pojutrze");
  assert.equal(dni[3].do_wypowiedzenia, "poniedziałek, siedemnastego sierpnia");
  assert.deepEqual(dni[3].wolne, ["09:00"]);
});

test("dzień zamknięty nie dostaje godzin ani slotów — agent nie ma co proponować", () => {
  const godziny = { sat: { open: "09:00", close: "17:00", closed: true } };
  const dni = zbudujDni("2026-08-15", 1, godziny, () => ["09:00"]);
  assert.equal(dni[0].otwarte, false);
  assert.equal(dni[0].wolne, undefined);
  assert.equal(dni[0].godziny, undefined);
});

test("klucz dnia tygodnia zgadza się z kalendarzem", () => {
  assert.equal(kluczDnia("2026-08-15"), "sat");
  assert.equal(kluczDnia("2026-08-17"), "mon");
  assert.equal(minuty("16:30"), 990);
  assert.equal(hhmm(990), "16:30");
});

// --- cena słowami: regresja z testu na żywo 12.08 -------------------------

test("cena stala slownie", () => {
  assert.equal(cenaDoWypowiedzenia(160, 160), "sto sześćdziesiąt złotych");
  assert.equal(cenaDoWypowiedzenia(150, null), "sto pięćdziesiąt złotych");
  assert.equal(cenaDoWypowiedzenia(122, 122), "sto dwadzieścia dwa złotych");
});

test("widelki w dopelniaczu — agent powiedzial TRZYSTU zamiast dwustu piecdziesieciu", () => {
  // Dokladnie ten przypadek: snapshot 150-250, model powiedzial "do trzystu".
  assert.equal(cenaDoWypowiedzenia(150, 250), "od stu pięćdziesięciu do dwustu pięćdziesięciu złotych");
  assert.equal(cenaDoWypowiedzenia(1500, 2500), "od tysiąca pięciuset do dwóch tysięcy pięciuset złotych");
});

test("kwoty spoza zakresu nie sa zmyslane", () => {
  assert.equal(cenaDoWypowiedzenia(0, 0), "0 złotych");
});

// --- regresja: sloty na dzis po zamknieciu (rozmowa 12.08, 23:42) ---------

test("po zamknieciu dzisiaj nie ma zadnego slotu", () => {
  const g = { open: "09:00", close: "17:00" };
  assert.deepEqual(wolneGodziny(g, 60, 6, [], 30, "16:00", 3, "23:42"), []);
});

test("w srodku dnia nie proponujemy godzin, ktore minely", () => {
  const g = { open: "09:00", close: "17:00" };
  const o = wolneGodziny(g, 60, 6, [], 30, "16:00", 3, "14:00");
  assert.equal(o[0], "14:00", "zaczynamy od aktualnej godziny");
  assert.equal(o.at(-1), "16:00", "konczymy na ostatnim mozliwym starcie");
  assert.ok(!o.includes("09:00"), "poranek juz minal");
});

test("dni przyszle sa nietkniete (odGodziny null)", () => {
  const g = { open: "09:00", close: "17:00" };
  assert.deepEqual(wolneGodziny(g, 60, 6, [], 30, "16:00", 3, null), ["09:00", "12:30", "16:00"]);
});

test("dzien bez wolnych godzin znika z listy jako zamkniety", () => {
  const godziny = { wed: { open: "09:00", close: "17:00" } };
  const dni = zbudujDni("2026-08-12", 1, godziny, () => []);
  assert.equal(dni[0].otwarte, false);
  assert.equal(dni[0].powod, "brak wolnych terminów");
  assert.equal(dni[0].wolne, undefined);
});

// --- regresja: forma slowa "tysiac" (znalezione 15.08 przy wycenie jezykow) ---

test("tysiace maja TRZY formy, nie dwie", () => {
  // Kod znal tylko "tysiac" i "tysiace", wiec dla 5000 mowil "piec TYSIACE
  // zlotych". Ceramika i folie ochronne kosztuja 5-15 tysiecy, wiec to zdanie
  // padloby przed klientem.
  assert.equal(cenaDoWypowiedzenia(1000, null), "tysiąc złotych");
  assert.equal(cenaDoWypowiedzenia(2000, null), "dwa tysiące złotych");
  assert.equal(cenaDoWypowiedzenia(4000, null), "cztery tysiące złotych");
  assert.equal(cenaDoWypowiedzenia(5000, null), "pięć tysięcy złotych");
  assert.equal(cenaDoWypowiedzenia(9000, null), "dziewięć tysięcy złotych");
});

test("wyjatek na dwanascie, trzynascie i czternascie tysiecy", () => {
  // Ostatnia cyfra 2-4, ale forma jest jak przy 5+ — polska pulapka,
  // ktora lapie kazdy naiwny selektor liczby mnogiej.
  assert.equal(cenaDoWypowiedzenia(12000, null), "dwanaście tysięcy złotych");
  assert.equal(cenaDoWypowiedzenia(13000, null), "trzynaście tysięcy złotych");
  assert.equal(cenaDoWypowiedzenia(22000, null), "dwadzieścia dwa tysiące złotych");
});

test("powyzej 9999 NIE wraca cyframi", () => {
  // Stary prog zwracal "12000 zlotych" — czyli lamal wlasna regule "liczby
  // zawsze slowami", te sama, przy ktorej zapis cyframi dal 4/20 wtretow.
  for (const kwota of [10000, 12000, 15000, 99000]) {
    assert.ok(!/\d/.test(cenaDoWypowiedzenia(kwota, null)), `${kwota} wraca cyframi`);
  }
  assert.equal(cenaDoWypowiedzenia(15000, 25000),
    "od piętnastu tysięcy do dwudziestu pięciu tysięcy złotych");
});
