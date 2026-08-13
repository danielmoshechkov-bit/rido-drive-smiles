import { lazy, type ComponentType } from 'react';

/**
 * React.lazy odporny na nieaktualne pliki.
 *
 * Moduły ładowane na żądanie (strony, moduły warsztatu) mają w nazwie skrót
 * zawartości. Po wdrożeniu — a w trybie deweloperskim po restarcie serwera —
 * skróty się zmieniają, więc karta otwarta WCZEŚNIEJ prosi o plik, którego już
 * nie ma. Bez obsługi tego błędu React nie ma co wyrenderować i użytkownik
 * dostaje biały ekran, nawet gdy z aplikacją wszystko jest w porządku.
 *
 * Tutaj: jednorazowe przeładowanie strony (znacznik w sessionStorage chroni
 * przed pętlą), które pobiera aktualną wersję. Dopiero powtórny błąd leci dalej,
 * do granicy błędu, która pokaże czytelny komunikat.
 */

const RELOAD_FLAG = 'getrido-chunk-reload';

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const module = await factory();
      // Udany import = aplikacja jest aktualna; zwalniamy blokadę przeładowania.
      try { window.sessionStorage.removeItem(RELOAD_FLAG); } catch { /* tryb prywatny */ }
      return module;
    } catch (error) {
      let alreadyReloaded = false;
      try {
        alreadyReloaded = window.sessionStorage.getItem(RELOAD_FLAG) === '1';
        if (!alreadyReloaded) window.sessionStorage.setItem(RELOAD_FLAG, '1');
      } catch { /* brak sessionStorage — lecimy dalej */ }

      if (!alreadyReloaded) {
        window.location.reload();
        // Strona się przeładowuje — nie rozwiązujemy tej obietnicy, żeby React
        // nie zdążył pokazać błędu przed odświeżeniem.
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}

/** Wariant dla modułów eksportowanych pod nazwą (bez `export default`). */
export function lazyNamedWithRetry<T extends Record<string, any>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K,
) {
  return lazyWithRetry(() => loader().then(m => ({ default: m[name] })));
}
