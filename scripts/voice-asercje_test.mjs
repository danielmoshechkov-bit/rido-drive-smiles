// ============================================================================
// voice-asercje_test.mjs — TESTY SAMYCH ASERCJI, na utrwalonych wypowiedziach.
//
// Powód powstania: pierwsza wersja asercji `godzina_spoza_wolnych` zapaliła się
// na „Najpóźniej mogę zapisać na szesnastą", choć snapshot miał „szesnastej" —
// ta sama godzina, inny przypadek. Asercja, która krzyczy przy poprawnej
// wypowiedzi, uczy ignorowania czerwonego i jest gorsza niż jej brak.
//
// Wypowiedzi niżej pochodzą z PRAWDZIWYCH przebiegów symulacji 15.08.
// Symulacja jest niedeterministyczna — te testy nie są.
//
//   node --test scripts/voice-asercje_test.mjs
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { sprawdzRozmowe } from "./voice-asercje.mjs";

const SNAPSHOT = {
  ustawienia: { najpozniejsze_przyjecie_do_wypowiedzenia: "szesnastej" },
  uslugi: [{ nazwa: "Wymiana oleju" }, { nazwa: "Wymiana klocków hamulcowych" }],
  dni: [
    { data: "2026-08-17", do_wypowiedzenia: "poniedziałek, siedemnastego sierpnia", do_wypowiedzenia_en: "Monday, 17 August", wolne: ["09:00", "12:30", "16:00"],
      wolne_do_wypowiedzenia: ["dziewiątej", "dwunastej trzydzieści", "szesnastej"],
      ostatni_mozliwy_start_do_wypowiedzenia: "szesnastej" },
    { data: "2026-08-18", do_wypowiedzenia: "wtorek, osiemnastego sierpnia", do_wypowiedzenia_en: "Tuesday, 18 August", wolne: ["09:00"],
      wolne_do_wypowiedzenia: ["dziewiątej"], ostatni_mozliwy_start_do_wypowiedzenia: "szesnastej" },
  ],
};
const ctx = (teksty, opcje = {}) => ({
  rozmowa: teksty.map((t) => (typeof t === "string" ? { role: "agent", message: t } : t)),
  jezyk: opcje.jezyk || "pl", snapshot: SNAPSHOT, narzedzia: opcje.narzedzia || [], wzorce: opcje.wzorce || [],
});
const wynik = (c, id) => sprawdzRozmowe(c).find((a) => a.id === id);
const czysta = (c, id) => assert.equal(wynik(c, id).stan, "ok", JSON.stringify(wynik(c, id).naruszenia));
const brudna = (c, id) => assert.equal(wynik(c, id).stan, "blad", `${id} miała złapać naruszenie`);

// --- FAŁSZYWE ALARMY, które ta asercja już popełniła ------------------------
test("odmieniona godzina to ta sama godzina", () => {
  czysta(ctx(["Najpóźniej mogę zapisać na szesnastą — pasuje?"]), "godzina_spoza_wolnych");
  czysta(ctx(["Dziewiąta rano — pasuje?"]), "godzina_spoza_wolnych");
  czysta(ctx(["Poniedziałek siedemnastego — może być dziewiąta rano?"]), "godzina_spoza_wolnych");
});

test("dzień miesiąca nie jest godziną", () => {
  // „poniedziałek siedemnastego sierpnia o dziewiątej albo o dwunastej trzydzieści"
  // to DWIE godziny. Pierwsza wersja liczyła trzy, bo „siedemnastego" wpadało
  // do wzorca liczebnika.
  czysta(ctx(["Poniedziałek, siedemnastego sierpnia — mam wolne o dziewiątej albo o dwunastej trzydzieści. Która godzina będzie odpowiednia?"]), "trzy_godziny");
});

test("data w formie ze snapshotu przechodzi, choć agent gubi przecinek", () => {
  czysta(ctx(["Gotowe, poniedziałek siedemnastego sierpnia o dziewiątej."]), "data_spoza_snapshotu");
});

// --- PRAWDZIWE DEFEKTY, złapane w przebiegach 15.08 -------------------------
test("forma na ty — „z którego dzwonisz”", () => {
  brudna(ctx(["Numer mamy zapisany z numeru, z którego dzwonisz."]), "forma_ty");
});

test("data spoza snapshotu bez check_availability", () => {
  brudna(ctx(["Gotowe — piątek piętnastego września o dziewiątej."]), "data_spoza_snapshotu");
});

test("ta sama data w innym języku i innej odmianie przechodzi", () => {
  // Snapshot: „Monday, 17 August". Agent: „Monday the 17th of August".
  // Porównanie napisem dawało tu czerwone przy poprawnej dacie.
  czysta(ctx(["Done — Monday the 17th of August at 9."], { jezyk: "en" }), "data_spoza_snapshotu");
  czysta(ctx(["Вторник, восемнадцатого августа — в девять?"], { jezyk: "ru" }), "data_spoza_snapshotu");
  czysta(ctx(["Вівторок, вісімнадцятого серпня — о дев'ятій?"], { jezyk: "uk" }), "data_spoza_snapshotu");
});

test("marka z liczbą nie jest datą", () => {
  czysta(ctx(["BMW serii trzy — poniedziałek siedemnastego sierpnia o dziewiątej."]), "data_spoza_snapshotu");
});

test("ta sama data z check_availability jest w porządku", () => {
  czysta(ctx(["Gotowe — piątek piętnastego września o dziewiątej."], { narzedzia: ["check_availability"] }), "data_spoza_snapshotu");
});

test("data powtórzona w jednej turze", () => {
  brudna(ctx(["Za miesiąc to piątek piętnastego września. Piątek piętnastego września o dziewiątej?"]), "data_powtorzona");
});

test("odsyłanie do telefonu w trakcie telefonu", () => {
  brudna(ctx(["Proszę zadzwonić do warsztatu bezpośrednio."]), "odsylanie_do_telefonu");
});

test("relacjonowanie własnej pracy", () => {
  brudna(ctx(["Poproszę zaczekać, sprawdzę dostępność."]), "relacjonowanie_pracy");
});

test("nazwa usługi spoza cennika", () => {
  brudna(ctx(["Да, мы делаем полный сервис — проверим масло."], { jezyk: "ru" }), "usluga_spoza_cennika");
  czysta(ctx(["Wymiana oleju to sto sześćdziesiąt złotych."]), "usluga_spoza_cennika");
});

// --- ASERCJA TWARDA: obcy język bez polszczyzny -----------------------------
// POWITANIE jest pierwszą turą agenta i po polsku ZAWSZE (first_message
// z konfiguracji ElevenLabs) — dlatego asercja pomija turę zerową, a fixture
// musi ją mieć, żeby odwzorować prawdziwy kształt rozmowy.
const POWITANIE = { role: "agent", message: "Dzień dobry, Warsztat — w czym mogę pomóc?" };

test("polskie słowo w zdaniu rosyjskim = czerwony", () => {
  brudna(ctx([POWITANIE, "Да, конечно! Poproszę imię oraz markę auta."], { jezyk: "ru" }), "polszczyzna_w_obcym");
  brudna(ctx([POWITANIE, "Вторник, osiemnastego сентября."], { jezyk: "ru" }), "polszczyzna_w_obcym");
});

test("powitanie po polsku nie jest defektem rozmowy obcojęzycznej", () => {
  czysta(ctx([POWITANIE, "Да, конечно! Чем могу помочь?"], { jezyk: "ru" }), "polszczyzna_w_obcym");
});

test("czysto rosyjska odpowiedź przechodzi", () => {
  czysta(ctx([{ role: "agent", message: "Dzień dobry, Warsztat — w czym mogę pomóc?" }, "Да, конечно! Чем могу помочь?", { role: "agent", message: "Вторник, восемнадцатого августа — в девять?" }], { jezyk: "ru" }), "polszczyzna_w_obcym");
});

test("marka i tablica łacinką nie są polszczyzną", () => {
  // Toyota Yaris i WX 12345 mają prawo stać łacinką w zdaniu rosyjskim.
  czysta(ctx([{ role: "agent", message: "Dzień dobry, Warsztat — w czym mogę pomóc?" }, "Записано: Toyota Yaris, номер WX 12345."], { jezyk: "ru" }), "polszczyzna_w_obcym");
});

test("pierwsza odpowiedź musi być w języku klienta", () => {
  const powitanie = { role: "agent", message: "Dzień dobry, Warsztat — w czym mogę pomóc?" };
  brudna(ctx([powitanie, { role: "user", message: "Здравствуйте" }, { role: "agent", message: "Dzień dobry, słucham?" }], { jezyk: "ru" }), "jezyk_od_pierwszej_odpowiedzi");
  czysta(ctx([powitanie, { role: "user", message: "Здравствуйте" }, { role: "agent", message: "Здравствуйте! Чем могу помочь?" }], { jezyk: "ru" }), "jezyk_od_pierwszej_odpowiedzi");
});

// --- ZASADA 12: asercja bez materiału mówi to wprost ------------------------
test("brak snapshotu daje NIE SPRAWDZONE, nie zielone", () => {
  const bez = { rozmowa: [{ role: "agent", message: "Gotowe." }], jezyk: "pl", snapshot: null, narzedzia: [], wzorce: [] };
  assert.equal(sprawdzRozmowe(bez).find((a) => a.id === "data_spoza_snapshotu").stan, "nie_sprawdzone");
});

test("asercje polskie nie dotyczą rozmowy obcojęzycznej", () => {
  assert.equal(wynik(ctx(["Чем могу помочь?"], { jezyk: "ru" }), "forma_ty").stan, "nie_dotyczy");
});

test("godziny otwarcia to nie propozycja terminu", () => {
  // 07-en padal 3/3 na „godzina spoza wolnych: 5:00", a agent mowil
  // „we're open Monday through Friday, 9 to 5" — informowal o godzinach pracy.
  czysta(ctx(["We're closed on Sundays. We're open Monday through Friday, 9 to 5."], { jezyk: "en" }), "godzina_spoza_wolnych");
  czysta(ctx(["Pracujemy od dziewiątej do siedemnastej."]), "godzina_spoza_wolnych");
  // ale PROPOZYCJA spoza wolnych dalej jest bledem
  brudna(ctx(["Does Monday at 7 work for you?"], { jezyk: "en" }), "godzina_spoza_wolnych");
});

test("godzina zamkniecia to nie propozycja terminu", () => {
  // 07-en padal 3/3 na „5:00", a agent mowil poprawnie:
  // „we close at 5 pm — the latest we can take a car in is 4 o'clock".
  czysta(ctx(["We close at 5 pm — the latest we can take a car in is 4 o'clock. Would 9 in the morning work?"], { jezyk: "en" }), "godzina_spoza_wolnych");
  czysta(ctx(["Najpóźniej mogę zapisać na szesnastą — o siedemnastej zamykamy."]), "godzina_spoza_wolnych");
  // Ta sama tura nie moze tez liczyc sie jako trzy PROPOZYCJE.
  czysta(ctx(["We close at 5 pm — the latest we can take a car in is 4 o'clock. Would 9 in the morning work?"], { jezyk: "en" }), "trzy_godziny");
});

test("pytanie otwierajace nie moze paść dwa razy", () => {
  const POWITANIE_PL = { role: "agent", message: "Dzień dobry, Warsztat — w czym mogę pomóc?" };
  // Prawdziwa rozmowa 16.08.
  brudna(ctx([POWITANIE_PL, { role: "user", message: "Chciałbym sprawdzenie zawieszenia i wymianę filtrów." },
    "W czym mogę pomóc? Kiedy będzie najwygodniej przyjechać?"]), "pytanie_otwierajace_dwa_razy");
  // Powitanie samo w sobie jest w porzadku.
  czysta(ctx([POWITANIE_PL, { role: "user", message: "Dzień dobry." }, "Kiedy będzie najwygodniej przyjechać?"]), "pytanie_otwierajace_dwa_razy");
  // Pytanie DOMYKAJACE to inne pytanie i wolno je zadac.
  czysta(ctx([POWITANIE_PL, { role: "user", message: "Dobrze." }, "Gotowe. Czy mogę jeszcze w czymś pomóc?"]), "pytanie_otwierajace_dwa_razy");
  // Dziala tez w obcych jezykach.
  brudna(ctx([POWITANIE_PL, { role: "user", message: "Здравствуйте, хочу записаться." }, "Чем могу помочь?"], { jezyk: "ru" }), "pytanie_otwierajace_dwa_razy");
});

test("pytanie domykajace to nie pytanie otwierajace", () => {
  const P = { role: "agent", message: "Dzień dobry, Warsztat — w czym mogę pomóc?" };
  // Falszywy alarm z przebiegu 16.08: to jest poprawne domkniecie rozmowy.
  czysta(ctx([P, { role: "user", message: "Chciałbym zapytać o wymianę opon." },
    "Opon niestety nie wymieniamy. Ale jeśli coś innego przy aucie — chętnie pomogę.",
    { role: "user", message: "A czy myjecie silniki?" },
    "Nie mam tej informacji — mechanik odpowie na miejscu. Czy jest coś innego, w czym mogę pomóc?"]),
    "pytanie_otwierajace_dwa_razy");
  // Krotkie „dzien dobry" nie niesie sprawy — agent ma prawo dopytac.
  czysta(ctx([P, { role: "user", message: "Dzień dobry." }, "W czym mogę pomóc?"]), "pytanie_otwierajace_dwa_razy");
});
