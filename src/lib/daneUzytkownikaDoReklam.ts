/**
 * NORMALIZACJA DANYCH KUPUJĄCEGO POD KONWERSJE ROZSZERZONE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO
 * ═══════════════════════════════════════════════════════════════════════════
 * Konwersje rozszerzone odzyskują sprzedaż, której piksel nie zmierzy: Safari,
 * blokery, zakup na innym urządzeniu niż kliknięcie w reklamę. Google dopasowuje
 * zahaszowany adres kupującego do swojego użytkownika.
 *
 * Mamy tu sytuację lepszą niż większość sklepów: adres znamy z KONTA, nie
 * z formularza — więc jest zawsze i jest prawdziwy.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 NORMALIZACJA JEST TU CAŁĄ ROBOTĄ — I TO ONA CICHO PSUJE DOPASOWANIE
 * ═══════════════════════════════════════════════════════════════════════════
 * Skrót liczy się ze ZNAKÓW. `Jan.Kowalski@Gmail.com` i `jankowalski@gmail.com`
 * to ten sam człowiek i dwa różne skróty. Google nie zgłosi błędu — po prostu
 * nie dopasuje, a Ty zobaczysz „konwersje rozszerzone włączone" i zero poprawy.
 *
 * Reguły Google, wszystkie trzy potrzebne razem:
 *   1. małe litery,
 *   2. obcięte białe znaki,
 *   3. dla `gmail.com` i `googlemail.com` — USUNIĘTE KROPKI z części przed `@`
 *      (Google traktuje je jako nieistotne, więc adres z kropkami i bez to
 *      jedno konto).
 *
 * W przeglądarce `gtag` normalizuje i haszuje sam, gdy poda mu się tekst
 * jawny — ale ta sama funkcja pojedzie potem do Conversions API, gdzie
 * haszujemy SAMI i wtedy nie ma nikogo, kto by to poprawił. Dlatego reguły
 * siedzą tu od początku, w jednym miejscu, przetestowane.
 *
 * ⚠️ ADRESU NIGDY NIE LOGUJEMY. Wychodzi wyłącznie do `gtag`, który haszuje go
 * przed wysłaniem — jawny nie opuszcza przeglądarki.
 */

/** Domeny, w których kropka przed `@` nie ma znaczenia. */
const DOMENY_Z_NIEISTOTNA_KROPKA = ["gmail.com", "googlemail.com"];

/**
 * Adres w postaci, którą Google potrafi dopasować — albo `null`, gdy to nie
 * wygląda na adres. `null` znaczy „nie wysyłamy nic", nigdy „wyślij śmieć".
 */
export function normalizujEmail(email: string | null | undefined): string | null {
  const surowy = String(email ?? "").trim().toLowerCase();
  if (!surowy) return null;

  const at = surowy.lastIndexOf("@");
  // Bez `@` albo z pustą częścią po którejś stronie to nie jest adres.
  if (at <= 0 || at === surowy.length - 1) return null;

  const lokalna = surowy.slice(0, at);
  const domena = surowy.slice(at + 1);
  if (!domena.includes(".")) return null;

  if (DOMENY_Z_NIEISTOTNA_KROPKA.includes(domena)) {
    // `+etykieta` zostawiamy: Google jej NIE odcina, a my nie mamy prawa
    // zgadywać za nich. Usuwamy wyłącznie kropki, bo to jedyna reguła,
    // którą Google podaje wprost.
    const bezKropek = lokalna.replace(/\./g, "");
    if (!bezKropek) return null;
    return `${bezKropek}@${domena}`;
  }

  return `${lokalna}@${domena}`;
}

/**
 * Numer telefonu w formacie E.164 — same cyfry z plusem.
 *
 * Polskie numery trzymamy w bazie bez kierunkowego, więc dziewięć cyfr bez
 * prefiksu dostaje `+48`. Bez kraju Google nie dopasuje niczego.
 */
export function normalizujTelefon(telefon: string | null | undefined): string | null {
  const cyfry = String(telefon ?? "").replace(/[^\d+]/g, "");
  if (!cyfry) return null;

  if (cyfry.startsWith("+")) {
    const same = cyfry.slice(1).replace(/\D/g, "");
    return same.length >= 8 ? `+${same}` : null;
  }
  const same = cyfry.replace(/\D/g, "");
  if (same.length === 9) return `+48${same}`;
  if (same.startsWith("48") && same.length === 11) return `+${same}`;
  return null;
}
