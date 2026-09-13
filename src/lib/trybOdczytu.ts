/**
 * TRYB ODCZYTU — CO WOLNO KLIKNĄĆ, GDY ABONAMENT NIE JEST OPŁACONY.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 PO CO — OBIETNICA, KTÓREJ KOD NIE DOTRZYMYWAŁ
 * ═══════════════════════════════════════════════════════════════════════════
 * Ekran twardej blokady miał przycisk „Przeglądaj i eksportuj swoje dane",
 * a po jego kliknięciu panel stawał się W PEŁNI używalny: dało się kliknąć
 * „Dodaj zlecenie", wypełnić formularz, dodać pojazd. Odmowa przychodziła
 * dopiero z bazy — po wypełnieniu. Pasek nad treścią mówił „zapis i edycja
 * są wyłączone" i było to nieprawdą.
 *
 * Wyłączony przycisk jest uczciwszy niż formularz, który przyjmuje dane
 * i odrzuca je na końcu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ZASADA: DOMYŚLNIE NIE WOLNO
 * ═══════════════════════════════════════════════════════════════════════════
 * Nie da się z DOM-u odczytać, czy przycisk zapisuje. Więc nie zgadujemy
 * w tę stronę — blokujemy WSZYSTKIE przyciski i wysyłki formularzy, a wolno
 * przepuszczamy tylko to, co da się rozpoznać jako czytanie.
 *
 * Pomyłka w jedną stronę: zablokowany eksport. Klient widzi to od razu, mówi,
 * a my dopisujemy `data-odczyt`.
 * Pomyłka w drugą stronę: klient wypełnia formularz i dostaje błąd bazy.
 * Pierwsza jest tańsza, więc domyślną odpowiedzią jest „nie wolno".
 *
 * ⚠️ TO JEST WARSTWA WYGLĄDU, NIE ZABEZPIECZENIE. Właściwą bramką jest RLS
 * i sprawdzenie w funkcjach brzegowych — zapis ma odbić się od bazy niezależnie
 * od tego, co widać na ekranie. Ten plik istnieje po to, żeby klient nie
 * dowiadywał się o blokadzie po wypełnieniu formularza.
 */

/** Znacznik do ręcznego dopuszczenia elementu: `data-odczyt` na przycisku. */
export const ZNACZNIK_WOLNO = 'data-odczyt';

/**
 * Napisy, po których poznajemy czytanie. Dobrane tak, żeby żaden nie występował
 * na przycisku zapisującym — stąd „Pobierz", a nie „Pobierz dane z GUS"
 * (to ostatnie zapisuje NIP do formularza, więc go tu NIE MA).
 */
const SLOWA_CZYTANIA = [
  'eksport', 'pobierz pdf', 'pobierz csv', 'pobierz xml', 'pobierz plik',
  'drukuj', 'wydruk', 'do pdf', 'do csv', 'do excela', 'podgląd wydruku',
];

/** Elementy, które z natury nie zapisują: nawigacja, filtrowanie, sortowanie. */
const ROLE_CZYTANIA = ['tab', 'tablist', 'combobox', 'listbox', 'option', 'menuitem'];

function tekst(el: Element): string {
  return (el.textContent ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Czy ten element wolno kliknąć w trybie odczytu.
 *
 * `el` to cel kliknięcia; funkcja sama szuka najbliższego przodka, który jest
 * elementem sterującym — klika się zwykle w ikonę albo w napis w środku
 * przycisku, nie w sam przycisk.
 */
export function czyWolnoWTrybieOdczytu(el: Element | null): boolean {
  if (!el) return true;

  const sterujacy = el.closest(
    'button, [role="button"], input, select, textarea, a, [role="tab"], [role="menuitem"], [role="option"], [role="combobox"]',
  );
  // Kliknięcie w tło, nagłówek albo wiersz tabeli — nie ma czego blokować.
  if (!sterujacy) return true;

  // 1. Jawne dopuszczenie wygrywa ze wszystkim.
  if (sterujacy.closest(`[${ZNACZNIK_WOLNO}]`)) return true;

  // 2. Odnośniki i pobierania plików.
  const tag = sterujacy.tagName.toLowerCase();
  if (tag === 'a') return true;
  if (sterujacy.hasAttribute('download')) return true;

  // 3. Nawigacja i wybór — zakładki, listy rozwijane, pozycje menu.
  const rola = sterujacy.getAttribute('role');
  if (rola && ROLE_CZYTANIA.includes(rola)) return true;

  // 4. Pola tekstowe i listy wyboru. Formularze zapisujące otwiera przycisk,
  //    a ten jest zablokowany — więc pola, które zostają na ekranie, filtrują.
  if (tag === 'select' || tag === 'textarea') return true;
  if (tag === 'input') {
    const typ = (sterujacy.getAttribute('type') ?? 'text').toLowerCase();
    // Pola przełączające stan (zgody, zaznaczenia do operacji zbiorczych)
    // bywają zapisem, więc zostają zablokowane razem z przyciskami.
    return !['checkbox', 'radio', 'submit', 'button', 'image', 'file'].includes(typ);
  }

  // 5. Przyciski: wolno tylko te, które nazywają się czytaniem.
  const napis = tekst(sterujacy);
  if (SLOWA_CZYTANIA.some((s) => napis.includes(s))) return true;

  // 6. Wszystko pozostałe — nie.
  return false;
}
