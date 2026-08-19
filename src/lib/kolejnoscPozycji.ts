/**
 * Kolejność pozycji na dokumentach warsztatowych.
 *
 * NAJPIERW CAŁA ROBOCIZNA, potem części i materiały — każda grupa w swojej
 * kolejności ze zlecenia.
 *
 * Samo `sort_order` tego nie daje. Warsztat dopisuje pozycje na przemian
 * (usługa, część do niej, kolejna usługa), więc na dokumencie wychodziła
 * sieczka: „wymiana oleju, olej 5w30, wymiana szczęk, filtr oleju…". Klient
 * porównuje kosztorys z tym, co warsztat ma na ekranie w zleceniu, i musi
 * widzieć ten sam porządek — inaczej szuka pozycji po numerach, których
 * nie ma.
 */

/** Czy pozycja to robocizna (usługa), a nie część ani materiał. */
export const toRobocizna = (item: { item_type?: string | null } | null | undefined): boolean =>
  item?.item_type === 'service' || item?.item_type === 'task';

/**
 * Robocizna przed częściami, bez zmiany kolejności wewnątrz grup.
 *
 * @param wKolejnosci pozycje POSORTOWANE już wg `sort_order` (patrz `sortWorkshopOrderItems`)
 */
export function robociznaPrzedCzesciami<T extends { item_type?: string | null }>(wKolejnosci: T[]): T[] {
  return [...wKolejnosci.filter(toRobocizna), ...wKolejnosci.filter((i) => !toRobocizna(i))];
}
