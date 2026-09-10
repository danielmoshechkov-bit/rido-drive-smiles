import test from "node:test";
import assert from "node:assert/strict";
import { odpowiedzBezVin, pojazdPotwierdzony } from "./vehicleIdentyfikacja.ts";

/**
 * Testy na PRAWDZIWYCH odpowiedziach rejestru, pobranych 10.09.2026 wprost
 * z `regcheck.org.uk/api/reg.asmx/CheckPoland` dla tablic ze zgłoszenia klienta.
 * Nie są zmyślone i nie są uproszczone — to są te pola, które przyszły.
 */

/** `WK93400` — rejestr podał markę i model, ale VIN PUSTY. Klient ma BMW GT5. */
const WK93400 = {
  vin: "",
  make: "BMW",
  model: "M 3 2.3 Kat.                                   E30",
  engine_size: "2302",
  engine_power_kw: "143",
};

/** `WW140TV` — rejestr odpowiedział poprawnie, z VIN-em. */
const WW140TV = {
  vin: "W0VPD5ED4JG110852",
  make: "OPEL",
  model: "Astra IV 1.6                              MR`10 E6",
  engine_size: "1598",
  engine_power_kw: "85",
};

test("PO TABLICY: brak VIN-u to NIE jest identyfikacja — kredyt nie schodzi", () => {
  assert.equal(
    pojazdPotwierdzony(WK93400, true),
    false,
    "marka i model bez VIN-u nie mogą uchodzić za potwierdzenie tożsamości pojazdu",
  );
});

test("PO TABLICY: pełna odpowiedź z VIN-em przechodzi", () => {
  // KONTROLA POZYTYWNA. Bez niej test przechodziłby także wtedy, gdyby reguła
  // odrzucała wszystko — a wtedy warsztat nie sprawdziłby żadnego auta.
  assert.equal(pojazdPotwierdzony(WW140TV, true), true);
});

test("PO VIN-IE: VIN-u nie wymagamy powtórnie, bo podał go klient", () => {
  // `mapRegCheckVehicle` wstawia w to pole numer z zapytania, więc wymaganie
  // VIN-u na tej ścieżce byłoby warunkiem zawsze spełnionym — czyli żadnym.
  const zPytania = { ...WK93400, vin: "WBAXC41020C990530" };
  assert.equal(pojazdPotwierdzony(zPytania, false), true);

  // Ale pusta odpowiedź nadal jest pusta.
  assert.equal(
    pojazdPotwierdzony({ vin: "WBAXC41020C990530", make: "", model: "" }, false),
    false,
    "sam numer z zapytania nie jest wiedzą rejestru o pojeździe",
  );
});

test("pusta odpowiedź rejestru nie przechodzi żadną ścieżką", () => {
  const pusto = { vin: "", make: "", model: "", engine_size: "", engine_power_kw: "" };
  assert.equal(pojazdPotwierdzony(pusto, true), false);
  assert.equal(pojazdPotwierdzony(pusto, false), false);
});

test("białe znaki nie udają danych", () => {
  // Rejestr potrafi oddać pole wypełnione spacjami — `String(x).trim()` musi
  // to uznać za brak, inaczej spacja kupowałaby identyfikację.
  assert.equal(pojazdPotwierdzony({ vin: "   ", make: "BMW" }, true), false);
  assert.equal(pojazdPotwierdzony({ vin: "", make: "   ", model: "  " }, false), false);
});

test("rozróżnienie komunikatu: brak danych vs. dane bez potwierdzenia", () => {
  assert.equal(odpowiedzBezVin(WK93400), true, "jest marka i model, nie ma VIN-u");
  assert.equal(odpowiedzBezVin(WW140TV), false, "VIN jest — to zwykłe trafienie");
  assert.equal(
    odpowiedzBezVin({ vin: "", make: "", model: "" }),
    false,
    "pusta odpowiedź to brak danych, a nie dane bez potwierdzenia",
  );
});
