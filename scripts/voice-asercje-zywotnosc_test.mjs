// ============================================================================
// voice-asercje-zywotnosc_test.mjs — CZY KAŻDA ASERCJA W OGÓLE COŚ ŁAPIE.
//
// ZASADA 32 zastosowana szerzej. Kontrola na `\b` przy cyrylicy znalazła trzy
// żywe błędy przy pierwszym uruchomieniu, ale łapała tylko JEDNĄ przyczynę
// martwoty. Ta kontrola nie pyta DLACZEGO asercja nie działa — pyta, czy
// kiedykolwiek cokolwiek złapała.
//
// Metoda: każda asercja dostaje wypowiedź, która MA ją zapalić, w każdym
// z czterech języków. Asercja, która w danym języku nigdy nic nie łapie,
// jest martwa — niezależnie od przyczyny.
//
// To jest inny test niż voice-asercje_test.mjs. Tamten sprawdza, czy asercja
// ocenia POPRAWNIE. Ten sprawdza, czy w ogóle ŻYJE.
//
//   node --test scripts/voice-asercje-zywotnosc_test.mjs
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASERCJE, ASERCJE_JEZYK, sprawdzRozmowe } from "./voice-asercje.mjs";

const SNAPSHOT = {
  ustawienia: { najpozniejsze_przyjecie_do_wypowiedzenia: "szesnastej" },
  uslugi: [{ nazwa: "Wymiana oleju" }],
  dni: [
    { data: "2026-08-17", do_wypowiedzenia: "poniedziałek, siedemnastego sierpnia",
      do_wypowiedzenia_en: "Monday, 17 August", wolne: ["09:00", "12:30"],
      wolne_do_wypowiedzenia: ["dziewiątej", "dwunastej trzydzieści"],
      ostatni_mozliwy_start_do_wypowiedzenia: "szesnastej" },
  ],
};
const POWITANIE = { role: "agent", message: "Dzień dobry, Warsztat — w czym mogę pomóc?" };

// Wypowiedź, która MA zapalić daną asercję, w każdym języku, w którym asercja
// obowiązuje. `null` = asercja świadomie nie dotyczy tego języka.
const PROWOKACJE = {
  forma_ty:                  { pl: "Kiedy chciałbyś przyjechać?", ru: null, uk: null, en: null },
  plec_przed_imieniem:       { pl: "Czy pasuje Panu dziewiąta?", ru: null, uk: null, en: null },
  relacjonowanie_pracy:      { pl: "Poproszę zaczekać, sprawdzę dostępność.", ru: null, uk: null, en: null },
  cyfry_grupami:             { pl: "Numer to pięćset dziewiętnaście.", ru: null, uk: null, en: null },
  data_powtorzona: {
    pl: "Piątek piętnastego września. Piętnastego września o dziewiątej?",
    ru: "Пятница, пятнадцатого сентября. Пятнадцатого сентября в девять?",
    uk: "П'ятниця, п'ятнадцятого вересня. П'ятнадцятого вересня о дев'ятій?",
    en: "Friday 15 September. 15 September at 9?",
  },
  trzy_godziny: {
    pl: "Mam wolne o dziewiątej, o jedenastej albo o trzynastej?",
    ru: "Свободно в девять, в одиннадцать или в тринадцать?",
    uk: "Вільно о дев'ятій, об одинадцятій чи о тринадцятій?",
    en: "I have 9 am, 11 am or 1 pm — which works?",
  },
  odsylanie_do_telefonu: {
    pl: "Proszę zadzwonić do warsztatu.", ru: "Позвоните в сервис.",
    uk: "Зателефонуйте до сервісу.", en: "Please call us back.",
  },
  data_spoza_snapshotu: {
    pl: "Gotowe — piątek piętnastego września o dziewiątej.",
    ru: "Готово — пятница, пятнадцатого сентября, в девять.",
    uk: "Готово — п'ятниця, п'ятнадцятого вересня, о дев'ятій.",
    en: "Done — Friday 15 September at 9.",
  },
  godzina_spoza_wolnych: {
    pl: "Może być o siedemnastej?", ru: "Может быть в семнадцать?",
    uk: "Може бути о сімнадцятій?", en: "Would 7 pm work?",
  },
  usluga_spoza_cennika: {
    pl: "Zrobimy pełny serwis.", ru: "Сделаем полный сервис.",
    uk: "Зробимо повне обслуговування.", en: "We'll do a full service.",
  },
  pytanie_otwierajace_dwa_razy: {
    pl: "Dobrze, Mazda — w czym mogę pomóc?",
    ru: "Хорошо, Мазда — чем могу помочь?",
    uk: "Добре, Мазда — чим можу допомогти?",
    en: "Alright, a Mazda — how can I help?",
  },
  polszczyzna_w_obcym: {
    pl: null, ru: "Вторник, osiemnastego сентября.",
    uk: "Вівторок, osiemnastego вересня.", en: "Tuesday, Poproszę imię.",
  },
  jezyk_od_pierwszej_odpowiedzi: {
    pl: null, ru: "Dzień dobry, słucham?", uk: "Dzień dobry, słucham?",
    en: "Здравствуйте, чем могу помочь?",
  },
  wzorce_wstrzykniete: { pl: null, ru: "…", uk: "…", en: "…" },
};

const KLIENT = {
  pl: "Chciałbym umówić auto na przegląd zawieszenia.",
  ru: "Хочу записаться на проверку подвески.",
  uk: "Хочу записатися на перевірку підвіски.",
  en: "I would like to book a suspension check.",
};

const wszystkie = [...ASERCJE, ...ASERCJE_JEZYK];

test("kazda asercja lapie cos w kazdym jezyku, w ktorym obowiazuje", () => {
  const martwe = [];
  for (const a of wszystkie) {
    const prow = PROWOKACJE[a.id];
    assert.ok(prow, `BRAK PROWOKACJI dla asercji "${a.id}" — dopisz ja, inaczej ta kontrola jej nie pilnuje`);
    for (const jezyk of ["pl", "ru", "uk", "en"]) {
      const tekst = prow[jezyk];
      if (tekst === null) continue;          // świadomie nie dotyczy
      const ctx = {
        rozmowa: [POWITANIE, { role: "user", message: KLIENT[jezyk] }, { role: "agent", message: tekst }],
        jezyk, snapshot: SNAPSHOT, narzedzia: [], wzorce: [], logiNieznane: false,
      };
      const w = sprawdzRozmowe(ctx).find((x) => x.id === a.id);
      // „nie_dotyczy" jest w porządku — asercja sama mówi, że pomija ten język.
      if (w.stan === "nie_dotyczy") continue;
      if (w.stan !== "blad") martwe.push(`${a.id} / ${jezyk}  (stan: ${w.stan})`);
    }
  }
  assert.deepEqual(martwe, [],
    "asercje, ktore NIE ZAPALILY SIE na wypowiedzi majacej je zapalic — martwe w tym jezyku");
});

test("kazda asercja z listy ma prowokacje", () => {
  const bez = wszystkie.map((a) => a.id).filter((id) => !PROWOKACJE[id]);
  assert.deepEqual(bez, [], "asercje bez prowokacji nie sa pilnowane przez kontrole zywotnosci");
});
