import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { liczbaWzorcow, wzorceWJezyku, zdanieAwarii, zdanieWylaczenia, zdanieZajetosci } from "./voiceWzorce.ts";

// KAZDY JEZYK DOSTAJE WYLACZNIE SWOJ BLOK.
//
// Pierwsza wersja zwracala null dla polskiego, bo polskie wzorce staly
// w prompcie statycznym. FAZA C uporzadkowala je w czysta liste na koncu —
// i angielski zaczal je kopiowac doslownie („Potwierdzenie przyjdzie SMS-em"
// w srodku angielskiego zdania). Teraz polski tez ma swoj blok i nigdy nie
// widzi cudzego.
Deno.test("kazdy jezyk dostaje wlasny blok, nigdy cudzy", () => {
  const pl = wzorceWJezyku("pl")!;
  assert(pl.includes("Poproszę imię oraz markę i model auta."));
  assert(!/[а-яА-Я]/.test(pl), "polski blok zawiera cyrylice");
  for (const j of ["ru", "uk", "en"]) {
    const b = wzorceWJezyku(j)!;
    assert(!b.includes("Poproszę imię"), `${j}: polski wzorzec w bloku obcojezycznym`);
  }
  // Brak jezyka = polski (rozmowa zaczyna sie po polsku).
  assertEquals(wzorceWJezyku(null), pl);
  assertEquals(wzorceWJezyku(undefined), pl);
  assertEquals(wzorceWJezyku("de"), null, "nieobslugiwany jezyk = brak bloku");
});

Deno.test("kazdy obslugiwany jezyk ma komplet wzorcow", () => {
  for (const j of ["ru", "uk", "en"]) {
    assertEquals(liczbaWzorcow(j), liczbaWzorcow("ru"), `${j} ma inna liczbe wzorcow niz ru`);
    assert(liczbaWzorcow(j) >= 25, `${j}: za malo wzorcow (${liczbaWzorcow(j)})`);
  }
});

// NAJWAZNIEJSZA ASERCJA CALEGO MODULU.
// Blad, ktory naprawiamy, to polskie zdanie w rozmowie po rosyjsku. Gdyby
// ktos wkleil polski wzorzec do tablicy ru — wrocilby dokladnie ten blad,
// tylko trudniejszy do znalezienia, bo „przeciez mamy tlumaczenia".
Deno.test("zaden wzorzec obcojezyczny nie zawiera polszczyzny", () => {
  const polskieZnaki = /[ąćęłńśźż]/;
  const polskieSlowa = /\b(poproszę|dziękuję|godzin|wolne|termin|mechanik poda|złotych|przyjechać|pomóc)\b/i;
  for (const j of ["ru", "uk", "en"]) {
    const blok = wzorceWJezyku(j)!;
    // naglowek i regula sa po polsku celowo — sprawdzamy wylacznie wciete zdania
    const zdania = blok.split("\n").filter((l) => l.startsWith("  ")).map((l) => l.trim());
    assert(zdania.length >= 25, `${j}: nie znalazlem zdan w bloku`);
    for (const z of zdania) {
      assert(!polskieZnaki.test(z), `${j}: polskie znaki we wzorcu: ${z}`);
      assert(!polskieSlowa.test(z), `${j}: polskie slowo we wzorcu: ${z}`);
    }
  }
});

// Cyrylica tam, gdzie ma byc; lacinka tam, gdzie ma byc.
Deno.test("alfabet zgodny z jezykiem", () => {
  const zdania = (j: string) => wzorceWJezyku(j)!.split("\n").filter((l) => l.startsWith("  "));
  for (const z of zdania("ru")) assert(/[а-яА-ЯёЁ]/.test(z), `ru bez cyrylicy: ${z}`);
  for (const z of zdania("uk")) assert(/[а-яА-ЯіїєґІЇЄҐ]/.test(z), `uk bez cyrylicy: ${z}`);
  for (const z of zdania("en")) assert(!/[а-яА-Я]/.test(z), `en z cyrylica: ${z}`);
});

// ZASADA 22 zastosowana do liczb: w ru/uk czytamy slowami, bo synteza gubi
// cyfry; w en cyframi, tak jak robi to voiceSnapshotEn.ts. Wzorzec niezgodny
// z konwencja jezyka uczy model zlego zapisu na kazda tura.
Deno.test("konwencja liczb zgodna z modulami snapshotu", () => {
  const zdania = (j: string) => wzorceWJezyku(j)!.split("\n").filter((l) => l.startsWith("  "));
  for (const j of ["ru", "uk"]) {
    for (const z of zdania(j)) {
      // OZNACZENIE MODELU TO NIE LICZBA DO WYPOWIEDZENIA.
      // „RX8", „A4", „308" to nazwy wlasne — agent czyta je tak, jak stoja,
      // i nie zamienia na slowa. Zabraniamy cyfr STOJACYCH SAMODZIELNIE,
      // czyli takich, ktore niosa godzine, date albo kwote.
      const samodzielne = z.replace(/(?<=\p{L})\d+|\d+(?=\p{L})/gu, "");
      assert(!/\d/.test(samodzielne), `${j}: samodzielna cyfra we wzorcu, ma byc slowami: ${z}`);
    }
  }
  assert(zdania("en").some((z) => /\d/.test(z)), "en: brak cyfr, a konwencja angielska to cyfry");
});

// Waluta zostaje zlotowka w kazdym jezyku — klient placi w warsztacie w Polsce.
Deno.test("waluta to zlotowka we wszystkich jezykach", () => {
  assert(wzorceWJezyku("ru")!.includes("злотых"));
  assert(wzorceWJezyku("uk")!.includes("злотих"));
  assert(wzorceWJezyku("en")!.includes("zloty"));
  for (const j of ["ru", "uk", "en"]) {
    const b = wzorceWJezyku(j)!;
    assert(!/€|£|\$|euro|dollar|евро|доллар/i.test(b), `${j}: obca waluta we wzorcach`);
  }
});

// Blok ma powiedziec modelowi, ze polskie przyklady sa zakazane — bez tego
// zdania sa tylko dodatkiem, a nie zastapieniem.
Deno.test("blok obcojezyczny zabrania powrotu do polskiego", () => {
  // Zdanie „polskie przyklady sa ilustracja" stracilo sens, odkad polskich
  // przykladow w prompcie obcojezycznym po prostu NIE MA. Zostaje zakaz powrotu.
  const b = wzorceWJezyku("ru")!;
  assert(b.includes("NIGDY nie wracasz do polskiego"));
  assert(!b.includes("Poproszę"), "blok rosyjski nie moze zawierac polskich wzorcow");
});

// Rozmiar: caly sens wyboru wariantu (c) to prompt bez wzrostu x4.
Deno.test("blok jest krotki — jeden jezyk, nie cztery", () => {
  for (const j of ["ru", "uk", "en"]) {
    const d = wzorceWJezyku(j)!.length;
    assert(d < 3500, `${j}: blok ma ${d} znakow, za duzo jak na doklejke do promptu`);
  }
});

// AWARIA MUSI BYC ZROZUMIALA. 16.08 kazda rozmowa — takze rosyjska —
// konczyla sie polskim zdaniem o problemie technicznym.
Deno.test("zdanie awarii jest w jezyku rozmowy", () => {
  assert(/Извините/.test(zdanieAwarii("techniczne", "ru")));
  assert(/Перепрошую/.test(zdanieAwarii("techniczne", "uk")));
  assert(/Sorry/.test(zdanieAwarii("techniczne", "en")));
  assert(/Przepraszam/.test(zdanieAwarii("techniczne", "pl")));
});

Deno.test("zdanie awarii nie zawiera polszczyzny w obcym jezyku", () => {
  for (const j of ["ru", "uk", "en"]) {
    for (const r of ["zapisane", "limit", "techniczne"] as const) {
      const z = zdanieAwarii(r, j);
      assert(!/[ąćęłńóśźż]/i.test(z), `${j}/${r}: polskie znaki w zdaniu awarii: ${z}`);
    }
  }
});

Deno.test("nieznany jezyk wraca do polskiego, nie do pustki", () => {
  assertEquals(zdanieAwarii("techniczne", "de"), zdanieAwarii("techniczne", "pl"));
  assertEquals(zdanieAwarii("techniczne", null), zdanieAwarii("techniczne", "pl"));
});

// ZADEN WZORZEC NIE ZAKLADA PLCI ROZMOWCY.
//
// Wzorzec o zostawieniu auta na noc brzmial „Jesli potrzebuje PAN pozniej" —
// czyli lamal regule, ktora sam prompt stawia w sekcji 1: do poznania imienia
// mowisz bezosobowo. Asercja `plec_przed_imieniem` zlapala to 5 razy na trzech
// przebiegach, a kontrola D7 w audycie nie — bo skanowala prompt, a wzorzec
// mieszka tutaj.
Deno.test("zaden wzorzec nie zaklada plci rozmowcy", () => {
  const plec = /\b(Pan|Pani|Panu|Pana|Panią|Pani[ae])\b/;
  for (const j of ["pl", "ru", "uk", "en"]) {
    const blok = wzorceWJezyku(j);
    if (!blok) continue;
    for (const z of blok.split("\n").filter((l) => l.startsWith("  ")).map((l) => l.trim())) {
      assert(!plec.test(z), `${j}: wzorzec zaklada plec rozmowcy: ${z}`);
    }
  }
});

// PYTANIE OTWIERAJACE NIE MOZE BYC WZORCEM.
//
// Powitanie wypowiada platforma (first_message). Dopoki „W czym moge pomoc?"
// stalo jako pierwszy wzorzec listy, model siegal po nie odruchowo — takze
// w turze, w ktorej klient wlasnie powiedzial, czego chce. Prawdziwa rozmowa
// 16.08 i reprodukcja 3/3 w symulacji.
Deno.test("zaden wzorzec nie jest pytaniem otwierajacym", () => {
  const otwierajace = ["w czym mogę pomóc", "чем могу помочь", "чим можу допомогти", "how can i help"];
  for (const j of ["pl", "ru", "uk", "en"]) {
    const blok = wzorceWJezyku(j);
    if (!blok) continue;
    for (const z of blok.split("\n").filter((l) => l.startsWith("  ")).map((l) => l.trim().toLowerCase())) {
      // Wyjatek: odpowiedz na prosbe o zmiane jezyka („Да, конечно! Чем могу
      // помочь?") — tam pytanie jest CZESCIA przejscia na inny jezyk i pada
      // zamiast powitania, nie po nim.
      if (/^(да|так|yes)[,!]/.test(z)) continue;
      for (const o of otwierajace) {
        assert(!z.includes(o), `${j}: wzorzec jest pytaniem otwierajacym: ${z}`);
      }
    }
  }
});

// AGENT PROPONUJE, NIE PYTA.
//
// Rozmowy 16-17.08: „Kiedy będzie najwygodniej przyjechać?" i „Утро или день?"
// — agent pytal o pore dnia zamiast podac godzine. Klient dzwoni, zeby sie
// umowic, nie zeby odpowiadac na pytania. Recepcjonistka mowi „mam jutro
// o dziewiatej", nie „kiedy Panu pasuje".
//
// Pytanie o termin wolno zadac DOPIERO po odrzuceniu propozycji — i wtedy
// o GODZINE, nie o pore dnia.
Deno.test("zaden wzorzec nie pyta o termin zamiast go proponowac", () => {
  const pytania = [
    "kiedy będzie najwygodniej", "kiedy byłoby wygodnie",
    "когда вам было бы удобно", "коли вам було б зручно",
    "when would it suit",
  ];
  const poraDnia = ["pora dnia", "время дня", "пора дня", "time of day", "утро или день", "rano czy po południu"];
  for (const j of ["pl", "ru", "uk", "en"]) {
    const blok = (wzorceWJezyku(j) || "").toLowerCase();
    for (const p of [...pytania, ...poraDnia]) {
      assert(!blok.includes(p), `${j}: wzorzec pyta zamiast proponowac — „${p}"`);
    }
  }
});

Deno.test("wzorce potwierdzenia od razu podaja godzine", () => {
  // TYLKO SEKCJA OTWARCIA. Wzorzec „Dobrze, zapisuję. Poproszę numer
  // rejestracyjny." tez zaczyna sie od potwierdzenia, ale zbiera dane
  // i godziny nie potrzebuje — pierwsza wersja tego testu na nim padla.
  const godzina = /dziewiąt|jedenast|девят|одиннадцат|дев'ят|одинадцят|\b\d{1,2}\b/i;
  for (const j of ["pl", "ru", "uk", "en"]) {
    const blok = wzorceWJezyku(j) || "";
    const sekcja = blok.split(/\n(?=[A-ZА-ЯЁІЇЄҐ ]{4,}:)/).find((cz) => /^(OTWARCIE|ОТКРЫТИЕ|ПОЧАТОК|OPENING):/.test(cz.trim())) || "";
    const zdania = sekcja.split("\n").filter((l) => l.startsWith("  ")).map((l) => l.trim());
    const potwierdzenia = zdania.filter((z) => /^(Dobrze|Rozumiem|Хорошо|Понятно|Добре|Зрозуміло|Alright|Understood)[,\s]/i.test(z));
    assert(potwierdzenia.length > 0, `${j}: brak wzorca „potwierdz i zaproponuj"`);
    for (const z of potwierdzenia) {
      assert(godzina.test(z), `${j}: potwierdzenie bez godziny — „${z}"`);
    }
  }
});

// POTWIERDZENIE I PROSBA TO DWIE ROZNE TURY.
//
// Rozmowa 17.08: klientka podala tablice razem z imieniem i marka, agent
// zapytal o nia trzy razy. Wzorzec „Dobrze, zapisuje. Poprosze numer
// rejestracyjny." zawieral PROSBE, wiec jego powtorzenie wygladalo poprawnie.
Deno.test("zaden wzorzec nie laczy potwierdzenia z prosba o te sama rzecz", () => {
  const potwierdzenie = /^(Dobrze|Rozumiem|Notuję|Хорошо|Записал|Понял|Добре|Записав|Зрозуміло|Alright|Got it|Understood)[,.\s]/i;
  const prosba = /(Poproszę|Назовите|Назвіть|And the .*please|Could I have)/i;
  for (const j of ["pl", "ru", "uk", "en"]) {
    const zdania = (wzorceWJezyku(j) || "").split("\n").filter((l) => l.startsWith("  ")).map((l) => l.trim());
    for (const z of zdania) {
      if (!potwierdzenie.test(z)) continue;
      if (!prosba.test(z)) continue;
      // WOLNO potwierdzic COS INNEGO i przejsc dalej: „Rozumiem — Mazda RX8.
      // Poprosze numer rejestracyjny." to dwie rozne rzeczy w jednej turze
      // i tak ma byc. Zabronione jest potwierdzenie PUSTE — samo „Dobrze,
      // zapisuje" — sklejone z prosba, bo wtedy tura wyglada jak ponowne
      // zapytanie o to, co klient wlasnie podal.
      const przedProsba = z.split(/(?=Poproszę|Назовите|Назвіть|And the|Could I have)/)[0];
      const maTresc = /[A-ZĄĆĘŁŃÓŚŹŻ][\wąćęłńóśźż]{2,}|\d/.test(przedProsba.replace(potwierdzenie, ""));
      assert(maTresc, `${j}: puste potwierdzenie sklejone z prosba — „${z}"`);
    }
  }
});

Deno.test("zdanie o zajetosci istnieje w kazdym jezyku i nie jest po polsku", () => {
  const pl = zdanieZajetosci("pl");
  for (const j of ["en", "ru", "uk"] as const) {
    const z = zdanieZajetosci(j);
    assert(z.length > 20, `zdanie o zajetosci w ${j} jest puste albo za krotkie`);
    assert(z !== pl, `zdanie o zajetosci w ${j} to kopia polskiego`);
  }
  // Nieznany jezyk ma wracac do polskiego, a nie zwracac undefined.
  assertEquals(zdanieZajetosci("de"), pl);
  assertEquals(zdanieZajetosci(null), pl);
});

Deno.test("zdanie o zajetosci nie obiecuje oddzwonienia ani nie ma rodzaju", () => {
  for (const j of ["pl", "en", "ru", "uk"] as const) {
    const z = zdanieZajetosci(j).toLowerCase();
    for (const obietnica of ["oddzwoni", "call you back", "перезвоним", "передзвонимо"]) {
      assert(!z.includes(obietnica), `${j}: obiecujemy oddzwonienie, ktorego nikt nie dotrzyma`);
    }
    // RODZAJ GRAMATYCZNY MOWIACEGO — ta sama pulapka co przy "nie doslyszalem".
    //
    // Pierwsza wersja tej kontroli szukala "занят" i zapalila sie na poprawnym
    // "все линии заняты", gdzie forma zgadza sie z LINIAMI, nie z mowiacym.
    // Kontrola, ktora oskarza poprawne zdanie, jest gorsza niz jej brak
    // (zasada 28) — dlatego szukamy form odnoszacych sie do MOWIACEGO.
    for (const rodzaj of [
      "zrozumiałem", "zrozumiałam", "usłyszałem", "usłyszałam", "jestem zajęty", "jestem zajęta",
      "расслышал", "расслышала", "рад", "рада", "готов", "готова",
      "розчув", "розчула", "готовий", "готова",
    ]) {
      assert(!z.includes(rodzaj), `${j}: zdanie ma rodzaj gramatyczny MOWIACEGO (${rodzaj})`);
    }
  }
});

// ============================================================================
// WYŁĄCZONA OBSŁUGA — te same wymagania co przy zajętości, plus jedno własne.
// ============================================================================
Deno.test("zdanie o wylaczeniu istnieje w kazdym jezyku i nie jest po polsku", () => {
  for (const j of ["en", "ru", "uk"] as const) {
    const z = zdanieWylaczenia(j);
    if (!z || z.length < 20) throw new Error(`${j}: brak zdania`);
    if (z === zdanieWylaczenia("pl")) throw new Error(`${j}: to polskie zdanie`);
  }
});

// TO JEST RÓŻNICA, KTÓRA MA ZNACZENIE. Zajętość jest chwilowa i wolno prosić
// o telefon za chwilę. Wyłączenie jest decyzją firmy — ta sama prośba byłaby
// obietnicą, której nikt nie dotrzyma.
Deno.test("zdanie o wylaczeniu nie obiecuje, ze za chwile ktos odbierze", () => {
  const zakazane = [/za kilka minut/i, /in a few minutes/i, /через несколько минут/i, /за кілька хвилин/i];
  for (const j of ["pl", "en", "ru", "uk"] as const) {
    const z = zdanieWylaczenia(j);
    for (const wzorzec of zakazane) {
      if (wzorzec.test(z)) throw new Error(`${j}: obiecuje rychly telefon — "${z}"`);
    }
  }
});

Deno.test("zdanie o wylaczeniu nie jest tym samym co o zajetosci", () => {
  for (const j of ["pl", "en", "ru", "uk"] as const) {
    if (zdanieWylaczenia(j) === zdanieZajetosci(j)) throw new Error(`${j}: te same zdania`);
  }
});

Deno.test("nieznany jezyk wraca do polskiego takze przy wylaczeniu", () => {
  if (zdanieWylaczenia("de") !== zdanieWylaczenia("pl")) throw new Error("brak powrotu do polskiego");
  if (zdanieWylaczenia(null) !== zdanieWylaczenia("pl")) throw new Error("null nie wraca do polskiego");
});
