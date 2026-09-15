/**
 * POSTAĆ PORÓWNYWALNA NUMERU TELEFONU.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO
 * ═══════════════════════════════════════════════════════════════════════════
 * `530890466`, `+48530890466` i `530 890 466` to ten sam numer i trzy różne
 * ciągi znaków. Pracodawca wpisuje go raz przy pracowniku, drugi raz przy
 * zaproszeniu — i jeśli za każdym razem trochę inaczej, dopasowanie po
 * porównaniu tekstów nie znajdzie nic. Tak właśnie powstał w bazie zdublowany
 * wiersz „Pracownik" bez adresu i bez numeru (AUTO-SERWIS HAWRYLUK, 10.09.2026).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 TA SAMA REGUŁA JEST W BAZIE — I MA TAKA ZOSTAĆ
 * ═══════════════════════════════════════════════════════════════════════════
 * Odpowiednikiem jest `public.numer_do_porownania(text)` (migracja
 * `20260915220002_powiazanie_pracownika_po_zalogowaniu.sql`), na której stoją
 * kolumny generowane `telefon_norm`. Dwie postacie tej samej reguły to
 * dokładnie ta klasa błędu, przed którą ostrzega CLAUDE.md — dlatego obie mają
 * test na TYM SAMYM zestawie przypadków (`numerTelefonu_test.ts` oraz kontrola
 * w migracji). Zmieniasz regułę tutaj — zmień ją tam, i odwrotnie.
 *
 * Dlaczego mimo to dwie: baza musi umieć to policzyć w kolumnie generowanej
 * (inaczej normalizacja zależałaby od tego, kto zapisuje wiersz), a funkcja
 * brzegowa musi umieć to policzyć bez odpytywania bazy.
 *
 * Osobno od `normalizacjaMeta.ts`: tamta odpowiada na inne pytanie — jak Meta
 * chce dostać numer do zahaszowania — i jej kształt jest wymuszony przez ich
 * dokumentację, nie przez nasze dopasowanie.
 */

/** `48XXXXXXXXX` albo `null`, gdy to nie jest numer, którym wolno kogoś dopasować. */
export function numerDoPorownania(numer: string | null | undefined): string | null {
  if (numer === null || numer === undefined) return null;
  const tekst = String(numer).trim();
  const cyfry = tekst.replace(/\D/g, "");
  if (!cyfry) return null;

  // Dziewięć cyfr = numer krajowy, dokładamy kierunkowy.
  if (cyfry.length === 9) return `48${cyfry}`;
  // Jedenaście cyfr od 48 = już z kierunkowym.
  if (cyfry.length === 11 && cyfry.startsWith("48")) return cyfry;
  // Zapis międzynarodowy z plusem — bierzemy, jak jest.
  if (tekst.startsWith("+") && cyfry.length >= 8) return cyfry;

  // Cokolwiek innego NIE jest numerem. `null` znaczy „nie dopasowuj po tym",
  // nigdy „dopasuj po czymkolwiek" — luźniejsza reguła wpuściłaby obcego
  // do warsztatu na podstawie śmiecia w polu telefonu.
  return null;
}
