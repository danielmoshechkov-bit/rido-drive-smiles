/**
 * Decyzja o dostępie — JEDNA tabela dla trzech bramek.
 *
 * Ta sama reguła żyje dziś w trzech miejscach:
 *  1. `useSubscriptionAccess` — decyduje, co widać na ekranie,
 *  2. funkcja SQL `moze_pracowac` — decyduje, czy baza przyjmie zapis (G4),
 *  3. `_shared/subscriptionGate.ts` — decyduje w funkcjach brzegowych (G5).
 *
 * Punkt 3 pyta punkt 2, więc te dwa nie mogą się rozjechać. Punkt 1 pyta bazę
 * o wiersz i decyduje SAM — i to jest miejsce rozjazdu, którego nikt nie
 * zauważy od razu: ekran odblokowany, a zapis odbity, albo odwrotnie.
 * Dlatego lista jest tutaj, a test pilnuje, żeby SQL mówił to samo.
 */

/** Statusy subskrypcji płatnej, przy których wolno pracować. */
export const STATUSY_Z_DOSTEPEM = ['active', 'trialing', 'past_due'] as const;

export type StatusSubskrypcji = (typeof STATUSY_Z_DOSTEPEM)[number] | string;

/**
 * Czy przy tym statusie wolno pracować.
 *
 * Nieznany status NIE daje dostępu. Gdyby operator płatności dodał kiedyś nowy
 * stan, domyślne przepuszczenie oznaczałoby darmowy dostęp do czasu, aż ktoś
 * to zauważy — a zauważa się takie rzeczy po fakturze, nie od razu.
 */
export function wolnoPracowac(status: string | null | undefined): boolean {
  return (STATUSY_Z_DOSTEPEM as readonly string[]).includes(status ?? '');
}
