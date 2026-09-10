/**
 * Czy rejestr NAPRAWDĘ zidentyfikował pojazd — i czy wolno za to pobrać kredyt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 POWÓD ISTNIENIA (10.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 * Warunek stał wewnątrz `vehicle-check` i brzmiał „którekolwiek z pól
 * niepuste". Przepuszczał odpowiedzi, w których rejestr podawał markę i model,
 * ale NIE PODAWAŁ VIN-u — a tak wygląda wpis o niskiej pewności.
 *
 * Klient zgłosił, że dla tablicy `WK93400` widzi BMW M3, choć ma BMW GT5.
 * Odpowiedź rejestru sprawdzona bezpośrednio, tego samego dnia:
 *
 *   CarMake: "BMW", CarModel: "M 3 2.3 Kat. E30"
 *   VehicleIdentificationNumber: ""      ← pusty
 *   ManufacturingYear: "0"               ← nieznany
 *
 * Pokazaliśmy to jako fakt i zeszły dwa kredyty tego samego dnia.
 *
 * VIN JEST POTWIERDZENIEM TOŻSAMOŚCI. Bez niego rejestr nie powiedział „to jest
 * ten pojazd", tylko „coś takiego mam pod tym numerem".
 *
 * Reguła siedzi w osobnym module, bo jest jedyną rzeczą decydującą o pobraniu
 * pieniędzy w tej ścieżce — a taka rzecz ma mieć test uruchamiany w CI, nie
 * komentarz w środku funkcji na sześćset linii.
 */

export interface PojazdZRejestru {
  vin?: string | null;
  make?: string | null;
  model?: string | null;
  engine_size?: string | number | null;
  engine_power_kw?: string | number | null;
}

const niepuste = (v: unknown): boolean => String(v ?? "").trim().length > 0;

/**
 * @param wymagajVin
 *   `true`  — sprawdzenie PO TABLICY. Numeru nie znamy, więc potwierdzeniem
 *             jest VIN od rejestru.
 *   `false` — sprawdzenie PO VIN-IE. Numer podał klient i `mapRegCheckVehicle`
 *             wstawia go w to pole, więc wymaganie VIN-u byłoby tautologią —
 *             warunek byłby spełniony zawsze. Potwierdzeniem jest tu to, że
 *             rejestr cokolwiek o tym numerze wie.
 */
export function pojazdPotwierdzony(mapped: PojazdZRejestru, wymagajVin: boolean): boolean {
  if (wymagajVin && !niepuste(mapped.vin)) return false;
  return niepuste(mapped.make) || niepuste(mapped.model)
    || niepuste(mapped.engine_size) || niepuste(mapped.engine_power_kw);
}

/**
 * Czy rejestr odpowiedział „coś" o pojeździe, ale bez VIN-u.
 *
 * Rozróżnienie ma znaczenie dla KOMUNIKATU: „nie znaleziono" i „znaleziono,
 * ale bez potwierdzenia" to dla warsztatu dwie różne sytuacje. Pierwsza znaczy
 * „sprawdź numer", druga „rejestr nie wie na pewno".
 */
export function odpowiedzBezVin(mapped: PojazdZRejestru): boolean {
  return !niepuste(mapped.vin) && (niepuste(mapped.make) || niepuste(mapped.model));
}
