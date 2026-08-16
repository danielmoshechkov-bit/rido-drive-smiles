import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { liczbaWzorcow, wzorceWJezyku, zdanieAwarii } from "./voiceWzorce.ts";

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
    for (const z of zdania(j)) assert(!/\d/.test(z), `${j}: cyfra we wzorcu, ma byc slowami: ${z}`);
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
