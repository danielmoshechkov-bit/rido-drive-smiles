import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { liczbaWzorcow, wzorceWJezyku } from "./voiceWzorce.ts";

// POLSKI NIE DOSTAJE ANI JEDNEGO ZNAKU. To jest cała umowa tej zmiany.
Deno.test("polski nie dostaje bloku wzorcow", () => {
  assertEquals(wzorceWJezyku("pl"), null);
  assertEquals(wzorceWJezyku(null), null);
  assertEquals(wzorceWJezyku(undefined), null);
  assertEquals(wzorceWJezyku("de"), null, "nieobslugiwany jezyk = brak bloku, nie polski blok");
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
Deno.test("blok zabrania siegania po polskie przyklady", () => {
  const b = wzorceWJezyku("ru")!;
  assert(b.includes("NIE WOLNO ich wypowiedzieć"));
  assert(b.includes("Nigdy nie wracasz do polskiego"));
});

// Rozmiar: caly sens wyboru wariantu (c) to prompt bez wzrostu x4.
Deno.test("blok jest krotki — jeden jezyk, nie cztery", () => {
  for (const j of ["ru", "uk", "en"]) {
    const d = wzorceWJezyku(j)!.length;
    assert(d < 3500, `${j}: blok ma ${d} znakow, za duzo jak na doklejke do promptu`);
  }
});
