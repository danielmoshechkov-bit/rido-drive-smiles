/**
 * NORMALIZACJA I SKRÓT DANYCH KUPUJĄCEGO DLA CONVERSIONS API.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 TU SIĘ PSUJE DOPASOWANIE, I TO BEZ ŻADNEGO BŁĘDU
 * ═══════════════════════════════════════════════════════════════════════════
 * Meta porównuje SKRÓTY. `Jan.Kowalski@Gmail.com` i `jankowalski@gmail.com`
 * to ten sam człowiek i dwa różne skróty. Meta nie zgłosi pomyłki — po prostu
 * nie dopasuje, a w panelu zobaczysz „zdarzenia odebrane" i zero poprawy
 * jakości dopasowania.
 *
 * W przeglądarce robi to `gtag`/`fbq` sam. **Tutaj haszujemy MY i nie ma
 * nikogo, kto by to poprawił.**
 *
 * Reguły Meta, wszystkie trzy naraz:
 *   1. małe litery,
 *   2. obcięte białe znaki,
 *   3. dla `gmail.com` i `googlemail.com` — usunięte kropki przed `@`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO TO DRUGI PLIK OBOK `src/lib/daneUzytkownikaDoReklam.ts`
 * ═══════════════════════════════════════════════════════════════════════════
 * Bo to dwa różne środowiska: tamten idzie do bundla przeglądarki przez Vite,
 * ten do Deno przez `supabase functions deploy`. Jednego pliku nie da się
 * wciągnąć w oba bez wynoszenia go poza `supabase/functions`, czego deploy
 * nie zapakuje.
 *
 * **Reguły MUSZĄ być takie same.** Oba pliki mają test na tym samym zestawie
 * przypadków — gdy ktoś zmieni jeden, drugi zapali się na tym samym adresie.
 * Zmieniając regułę tutaj, zmień ją TAM (i odwrotnie).
 */

const DOMENY_Z_NIEISTOTNA_KROPKA = ["gmail.com", "googlemail.com"];

/** Adres w postaci, którą Meta potrafi dopasować — albo `null`. */
export function normalizujEmail(email: string | null | undefined): string | null {
  const surowy = String(email ?? "").trim().toLowerCase();
  if (!surowy) return null;

  const at = surowy.lastIndexOf("@");
  if (at <= 0 || at === surowy.length - 1) return null;

  const lokalna = surowy.slice(0, at);
  const domena = surowy.slice(at + 1);
  if (!domena.includes(".")) return null;

  if (DOMENY_Z_NIEISTOTNA_KROPKA.includes(domena)) {
    const bezKropek = lokalna.replace(/\./g, "");
    if (!bezKropek) return null;
    return `${bezKropek}@${domena}`;
  }
  return `${lokalna}@${domena}`;
}

/**
 * Telefon w E.164 BEZ plusa — Meta chce same cyfry z kierunkowym kraju.
 * Polskie dziewięć cyfr dostaje `48`; bez kraju nie ma czego dopasować.
 */
export function normalizujTelefon(telefon: string | null | undefined): string | null {
  const wejscie = String(telefon ?? "").trim();
  if (!wejscie) return null;
  const same = wejscie.replace(/\D/g, "");
  if (!same) return null;

  if (wejscie.startsWith("+")) return same.length >= 8 ? same : null;
  if (same.length === 9) return `48${same}`;
  if (same.startsWith("48") && same.length === 11) return same;
  return null;
}

/** SHA-256 w zapisie szesnastkowym, małymi literami — tak chce Meta. */
export async function skrot(wartosc: string): Promise<string> {
  const bajty = new TextEncoder().encode(wartosc);
  const wynik = await crypto.subtle.digest("SHA-256", bajty);
  return Array.from(new Uint8Array(wynik))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Skrót adresu gotowy do wysłania — albo `null`, gdy to nie jest adres.
 * `null` znaczy „nie wysyłamy tego pola", nigdy „wyślij pustkę": pole
 * z pustym skrótem pogarsza dopasowanie zamiast je poprawiać.
 */
export async function skrotEmaila(email: string | null | undefined): Promise<string | null> {
  const n = normalizujEmail(email);
  return n ? await skrot(n) : null;
}

export async function skrotTelefonu(telefon: string | null | undefined): Promise<string | null> {
  const n = normalizujTelefon(telefon);
  return n ? await skrot(n) : null;
}
