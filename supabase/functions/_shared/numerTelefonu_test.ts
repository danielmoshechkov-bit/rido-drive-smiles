/**
 * Przypadki wspólne dla `numerDoPorownania` (Deno) i `numer_do_porownania`
 * (Postgres). Ten sam zestaw stoi w kontroli migracji — gdy ktoś zmieni jedną
 * stronę, druga zapala się na tym samym numerze.
 *
 * Uruchomienie: deno test supabase/functions/_shared/numerTelefonu_test.ts
 */
import { numerDoPorownania } from "./numerTelefonu.ts";

const przypadki: Array<[string | null, string | null, string]> = [
  ["530890466",    "48530890466", "dziewięć cyfr dostaje kierunkowy"],
  ["+48530890466", "48530890466", "zapis z plusem"],
  ["530 890 466",  "48530890466", "spacje nie zmieniają numeru"],
  ["48530890466",  "48530890466", "już z kierunkowym"],
  ["530-890-466",  "48530890466", "myślniki nie zmieniają numeru"],
  // KONTROLA ODWROTNA: śmieć nie ma prawa być numerem — inaczej dopasowanie
  // po nim wpuściłoby obcego do cudzego warsztatu.
  ["123",   null, "za krótkie to nie numer"],
  ["",      null, "pustka to nie numer"],
  ["brak",  null, "tekst to nie numer"],
  [null,    null, "brak wartości to nie numer"],
  ["12345678901", null, "jedenaście cyfr nie od 48 to nie nasz numer"],
];

let porazek = 0;
for (const [wejscie, oczekiwane, opis] of przypadki) {
  const wynik = numerDoPorownania(wejscie);
  const ok = wynik === oczekiwane;
  if (!ok) porazek++;
  console.log(`${ok ? "✅" : "❌"} ${opis}${ok ? "" : ` — jest ${JSON.stringify(wynik)}, ma być ${JSON.stringify(oczekiwane)}`}`);
}

if (porazek > 0) {
  console.error(`\n${porazek} nieudanych przypadków`);
  Deno.exit(1);
}
console.log("\nNumer do porównania — wszystkie przypadki OK");
