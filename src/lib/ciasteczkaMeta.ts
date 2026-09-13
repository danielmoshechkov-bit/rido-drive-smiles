/**
 * `fbp` i `fbc` — dwa ciasteczka, bez których dopasowanie po stronie serwera
 * jest znacznie słabsze.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CO TO JEST
 * ═══════════════════════════════════════════════════════════════════════════
 * `_fbp` — identyfikator przeglądarki, zakłada go sam piksel przy pierwszej
 *          odsłonie po zgodzie.
 * `_fbc` — identyfikator KLIKNIĘCIA W REKLAMĘ. Piksel zakłada go tylko wtedy,
 *          gdy w adresie wejścia był parametr `fbclid`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 DLACZEGO `fbc` SKŁADAMY SAMI, GDY GO NIE MA
 * ═══════════════════════════════════════════════════════════════════════════
 * Piksel zakłada `_fbc` przy WEJŚCIU z `fbclid`. Ale u nas piksel nie ładuje
 * się przed zgodą — a baner pokazuje się po wczytaniu strony. Kolejność bywa
 * więc taka: klient klika reklamę → wchodzi z `fbclid` → piksela jeszcze nie
 * ma → klika „Akceptuję" → piksel startuje, ale `fbclid` został już zdjęty
 * z adresu przez router albo przykryty nawigacją.
 *
 * Efekt: konwersja od klienta, który PRZYSZEDŁ Z REKLAMY, nie da się z nią
 * powiązać. Kampania wygląda na nieskuteczną i ktoś ją wyłącza.
 *
 * Dlatego zapamiętujemy `fbclid` przy pierwszym wejściu (jeszcze zanim
 * zniknie z adresu) i składamy z niego `fbc` w formacie Meta:
 *
 *     fb.1.<czas w ms>.<fbclid>
 *
 * ⚠️ Zapamiętanie NIE JEST śledzeniem: `fbclid` zostaje w `sessionStorage`
 * tej jednej karty i nie wychodzi nigdzie, dopóki nie ma zgody marketingowej.
 * Bez zgody nie powstaje ani ciasteczko, ani zdarzenie.
 */

const KLUCZ_FBCLID = "getrido-fbclid";

/** Wartość ciasteczka albo `null`. Nie rzuca, gdy ciasteczka są zablokowane. */
function ciasteczko(nazwa: string): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${nazwa}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Zapamiętanie `fbclid` z adresu wejścia. Wołane RAZ, przy starcie aplikacji,
 * przed jakąkolwiek nawigacją — potem parametru może już nie być.
 */
export function zapamietajKlikniecieReklamy(): void {
  try {
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (!fbclid) return;
    // Pierwsze kliknięcie wygrywa: gdyby klient wrócił z innej reklamy w tej
    // samej karcie, nadpisanie przypisałoby konwersję nie tej kampanii.
    if (window.sessionStorage.getItem(KLUCZ_FBCLID)) return;
    window.sessionStorage.setItem(
      KLUCZ_FBCLID,
      JSON.stringify({ fbclid, czas: Date.now() }),
    );
  } catch {
    // Tryb prywatny albo zablokowane dane witryny — trudno, `fbc` po prostu
    // nie powstanie. To pogarsza dopasowanie, nie psuje niczego.
  }
}

export interface CiasteczkaMeta {
  fbp: string | null;
  fbc: string | null;
}

/**
 * `fbp` i `fbc` do wysłania na serwer.
 *
 * `fbp` bierzemy wyłącznie z ciasteczka — sami go nie składamy, bo musi być
 * dokładnie ten sam, którego użył piksel w przeglądarce. Inaczej Meta
 * zobaczyłaby dwa różne urządzenia zamiast jednego.
 *
 * `fbc` bierzemy z ciasteczka, a gdy go nie ma — składamy z zapamiętanego
 * `fbclid` (patrz nagłówek).
 */
export function ciasteczkaMeta(): CiasteczkaMeta {
  const fbp = ciasteczko("_fbp");
  const zCiasteczka = ciasteczko("_fbc");
  if (zCiasteczka) return { fbp, fbc: zCiasteczka };

  try {
    const surowe = window.sessionStorage.getItem(KLUCZ_FBCLID);
    if (!surowe) return { fbp, fbc: null };
    const { fbclid, czas } = JSON.parse(surowe) as { fbclid: string; czas: number };
    if (!fbclid) return { fbp, fbc: null };
    return { fbp, fbc: `fb.1.${czas}.${fbclid}` };
  } catch {
    return { fbp, fbc: null };
  }
}

/**
 * Ciasteczka w kształcie, w jakim przyjmuje je `billing-payu-order` — czyli
 * pod nazwami KOLUMN, nie pod nazwami Meta.
 *
 * Ta funkcja istnieje po to, żeby nazwy pól były w JEDNYM miejscu. Wołają ją
 * dwa okna zakupu (plan i doładowanie); gdyby każde składało obiekt samo,
 * literówka w jednym z nich dawałaby ciche `null` w bazie i brak konwersji
 * wyłącznie dla jednej ścieżki zakupu — czego nie widać w żadnym dzienniku.
 */
export function ciasteczkaDoZamowienia(): { meta_fbp: string | null; meta_fbc: string | null } {
  const { fbp, fbc } = ciasteczkaMeta();
  return { meta_fbp: fbp, meta_fbc: fbc };
}
