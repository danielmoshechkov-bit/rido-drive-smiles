// ============================================================================
// voiceRegiony_test.ts — czy warsztat dostanie numer ze swojej strefy.
// Strefy odczytane z API operatora 16.08.
// ============================================================================
import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { dopasujStrefe, kierunkowyZTelefonu, type Strefa } from "./voiceRegiony.ts";

const STREFY: Strefa[] = [
  { id: 11, city: "Warszawa", prefix: 22 },
  { id: 20, city: "Gdańsk", prefix: 58 },
  { id: 31, city: "Poznań", prefix: 61 },
  { id: 40, city: "Kraków", prefix: 12 },
  { id: 45, city: "Łódź", prefix: 42 },
  { id: 50, city: "Zielona Góra", prefix: 68 },
];

Deno.test("miasto warsztatu wygrywa", () => {
  const d = dopasujStrefe({ miasto: "Gdańsk" }, STREFY);
  assertEquals(d.strefaId, 20);
  assertEquals(d.droga, "miasto");
});

Deno.test("miasto bez ogonkow i w innej wielkosci liter tez trafia", () => {
  for (const m of ["gdansk", "GDAŃSK", " Gdansk ", "gdańsk"]) {
    assertEquals(dopasujStrefe({ miasto: m }, STREFY).strefaId, 20, `nie trafilo: ${m}`);
  }
  assertEquals(dopasujStrefe({ miasto: "ZIELONA GORA" }, STREFY).strefaId, 50);
  assertEquals(dopasujStrefe({ miasto: "Łódź" }, STREFY).strefaId, 45);
});

Deno.test("gdy miasta nie ma — kierunkowy z telefonu stacjonarnego", () => {
  const d = dopasujStrefe({ miasto: null, telefon: "58 555 12 34" }, STREFY);
  assertEquals(d.strefaId, 20);
  assertEquals(d.droga, "telefon");
});

Deno.test("KOMORKA NIE JEST KIERUNKOWYM — to jest cala pulapka tego modulu", () => {
  // Prawdziwe numery z bazy zaczynaja sie od 796… i 515… . Gdyby brac dwie
  // pierwsze cyfry na slepo, warsztat z komorka 796… dostalby numer z Torunia
  // (kierunkowy 79 nie istnieje) albo trafil w losowa strefe.
  for (const kom of ["796 300 200", "515 000 111", "601 234 567", "888 111 222", "728 999 000"]) {
    assertEquals(kierunkowyZTelefonu(kom), null, `komorka wzieta za kierunkowy: ${kom}`);
  }
  for (const stac of ["58 555 12 34", "+48 12 345 67 89", "0048225551234", "618887766"]) {
    assertEquals(typeof kierunkowyZTelefonu(stac), "number", `kierunkowy nie odczytany: ${stac}`);
  }
});

Deno.test("brak miasta i komorka — Warszawa, ale JAWNIE oznaczona jako awaryjna", () => {
  const d = dopasujStrefe({ miasto: null, telefon: "796 300 200" }, STREFY);
  assertEquals(d.strefaId, 11);
  assertEquals(d.droga, "awaryjne", "fallback musi byc rozpoznawalny w logu, inaczej nikt sie nie dowie");
});

Deno.test("miasto spoza listy stref schodzi do telefonu, nie do Warszawy", () => {
  // Piaseczno nie jest strefa, ale telefon stacjonarny 22 wskazuje Warszawe
  // — i to jest trafienie przez TELEFON, nie awaryjne.
  const d = dopasujStrefe({ miasto: "Piaseczno", telefon: "22 737 10 10" }, STREFY);
  assertEquals(d.strefaId, 11);
  assertEquals(d.droga, "telefon");
});

Deno.test("pusta lista stref nie wywraca sie, tylko oddaje brak", () => {
  assertEquals(dopasujStrefe({ miasto: "Gdańsk" }, []).droga, "brak");
});
