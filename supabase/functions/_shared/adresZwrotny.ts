/**
 * CZY WIADOMOŚĆ MA ADRES ZWROTNY.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO TO JEST OSOBNA FUNKCJA, A NIE JEDNA LINIJKA W MIEJSCU UŻYCIA
 * ═══════════════════════════════════════════════════════════════════════════
 * `send-invoice-email` ma DWÓCH nadawców i pomyłka jest tu cicha:
 *
 *   • WARSZTAT wystawiający fakturę SWOJEMU klientowi — `Reply-To` wskazuje
 *     na warsztat i MUSI zostać. Bez niego klient warsztatu nie ma jak
 *     odpisać swojemu warsztatowi, a nikt tego nie zgłosi: wiadomość wyjdzie,
 *     dojdzie i będzie wyglądać poprawnie.
 *   • PLATFORMA wystawiająca fakturę za abonament albo doładowanie — tu
 *     adresu zwrotnego nie ma, bo spraw fakturowych nie prowadzimy skrzynką.
 *
 * Decyzja wynika WYŁĄCZNIE z tego, co poda wywołujący, i domyślnie zostaje
 * przy zachowaniu sprzed 13.09.2026. Nowy przełącznik nie ma prawa po cichu
 * odciąć warsztatom korespondencji, więc jednostronność trzeba włączyć
 * JAWNIE — `true`, nie „cokolwiek prawdziwego".
 */

export interface WyborAdresuZwrotnego {
  /** Jawne żądanie wiadomości jednostronnej. Tylko literalne `true` liczy się. */
  bezOdpowiedzi?: unknown;
  /** Adres wystawcy faktury — warsztatu albo platformy. */
  emailFirmy?: string | null;
  /** Adres, z którego wychodzi poczta (zapasowy). */
  emailNadawcy?: string | null;
}

/**
 * Adres zwrotny albo `null`, gdy wiadomość ma być jednostronna.
 *
 * `null` znaczy też: nie wysyłamy nagłówka `List-Unsubscribe` wskazującego
 * mailto. Nagłówek prowadzący do skrzynki, której nikt nie czyta, jest gorszy
 * niż jego brak — a faktura to wiadomość transakcyjna i tego nagłówka nie
 * wymaga.
 */
export function adresZwrotny({
  bezOdpowiedzi,
  emailFirmy,
  emailNadawcy,
}: WyborAdresuZwrotnego): string | null {
  if (bezOdpowiedzi === true) return null;
  const adres = String(emailFirmy ?? "").trim() || String(emailNadawcy ?? "").trim();
  return adres || null;
}
