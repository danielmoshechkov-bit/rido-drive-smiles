import { odczytajBladFunkcji } from '@/utils/bladFunkcji';

/**
 * ODMOWA PŁATNOŚCI — cienka warstwa nad `odczytajBladFunkcji`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 DLACZEGO TO ISTNIEJE — KLIENT WIDZIAŁ SUROWY BŁĄD
 * ═══════════════════════════════════════════════════════════════════════════
 * `supabase.functions.invoke` przy KAŻDEJ odpowiedzi spoza 2xx zwraca
 * `data === null` i `error` z jednym, zawsze tym samym zdaniem. Sprawdzone
 * zachowaniem na produkcji, nie odczytem dokumentacji:
 *
 *   data       = null
 *   error      = FunctionsHttpError
 *   error.msg  = Edge Function returned a non-2xx status code
 *   surowy HTTP: 401 {"error":"Musisz być zalogowany."}
 *
 * Serwer WYSYŁA gotowe zdanie i kod, a front go nie czytał. Wzorzec rozsiany
 * po całej ścieżce zakupu:
 *
 *     if (error) throw error;          // ← wychodzi TUTAJ, z surowym błędem
 *     if (data?.error) { ...kody... }  // ← nigdy nie wykonane przy 4xx/5xx
 *
 * był martwy dla każdej odmowy. Mapy komunikatów obsługiwały wyłącznie
 * odpowiedzi 200 z polem `error`, a `billing-checkout` i `billing-payu-order`
 * odmawiają kodem 409.
 *
 * Skutek: warsztat bez danych do faktury — 25 z 30 kont na produkcji — klikał
 * „Kup" i dostawał komunikat o funkcji brzegowej. Nie wiedział ani co jest
 * nie tak, ani co ma zrobić.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CO DOKŁADA PONAD `odczytajBladFunkcji`
 * ═══════════════════════════════════════════════════════════════════════════
 * Czytaniem odpowiedzi zajmuje się `src/utils/bladFunkcji.ts` — jedno miejsce
 * dla całej aplikacji, nie kopia. Tutaj są wyłącznie trzy rzeczy właściwe
 * ścieżce zakupu:
 *
 *   1. KOD odmowy — żeby wołający mógł na niego zareagować (`BRAK_DANYCH_NABYWCY`
 *      prowadzi do formularza, nie do komunikatu o błędzie);
 *   2. odmowa z kodem 200 i polem `error` w ciele — tak odpowiada część
 *      starszych ścieżek, a klient ma nie widzieć różnicy;
 *   3. zasłona na GOŁE KODY. `odczytajBladFunkcji` oddaje `tresc.error` jak
 *      stoi, a `billing-checkout` przy braku bramki odsyła
 *      `{ error: "GATEWAY_NOT_CONFIGURED" }` — bez tego trafiłoby to na ekran.
 *
 * ZDANIA PISZE SERWER. Funkcje brzegowe odmawiają gotową polszczyzną („Zanim
 * zapłacisz, uzupełnij dane do faktury."), więc mapa niżej obejmuje wyłącznie
 * kody przychodzące BEZ zdania. Dopisanie tu czegokolwiek innego znaczy dwa
 * źródła tekstu, które rozjadą się przy pierwszej zmianie.
 */

/** Kod odmowy, po którym pokazujemy formularz danych do faktury. */
export const KOD_BRAK_DANYCH_NABYWCY = 'BRAK_DANYCH_NABYWCY';

/**
 * Kody, których funkcja brzegowa NIE opisuje zdaniem — wysyła sam kod w polu
 * `error`. Właściwe miejsce na zdanie jest w funkcji brzegowej; to jest łata.
 */
const ZDANIA_DO_GOLYCH_KODOW: Record<string, string> = {
  GATEWAY_NOT_CONFIGURED: 'Płatności są chwilowo niedostępne. Spróbuj za chwilę albo napisz do nas.',
  GATEWAY_DISABLED: 'Płatności są chwilowo wyłączone. Spróbuj za chwilę albo napisz do nas.',
};

export interface Odmowa {
  /** Kod z funkcji brzegowej, gdy go podała. */
  kod: string | null;
  /** Zdanie dla klienta — zawsze niepuste, nigdy sam kod. */
  komunikat: string;
  /** Status HTTP, gdy dało się go ustalić. Do logów, nie na ekran. */
  status: number | null;
}

const DOMYSLNE = 'Nie udało się rozpocząć płatności. Spróbuj ponownie za chwilę.';

/**
 * Czy tekst wygląda na KOD, a nie na zdanie. `GATEWAY_NOT_CONFIGURED` ma nie
 * trafić na ekran nawet wtedy, gdy zapomnimy dopisać go do mapy wyżej.
 */
const toKod = (t: unknown): boolean =>
  typeof t === 'string' && /^[A-Z][A-Z0-9_]{2,}$/.test(t.trim());

/**
 * Rozstrzyga, co powiedzieć klientowi po nieudanym `functions.invoke`.
 *
 * Wołane przy KAŻDEJ odmowie — także tej z kodem 200 i polem `error` — żeby
 * jedno miejsce odpowiadało za wszystkie drogi do operatora płatności.
 */
export async function odczytajOdmowe(error: unknown, data?: any): Promise<Odmowa> {
  // Odmowa z kodem 200: `error` jest puste, całość siedzi w `data`.
  const zCiala = error ? await odczytajBladFunkcji(error) : null;
  const surowe: any = zCiala?.surowe ?? data ?? null;

  const surowyBlad = surowe?.error;
  const kod: string | null =
    (typeof surowe?.code === 'string' && surowe.code) ||
    (toKod(surowyBlad) ? String(surowyBlad).trim() : null);

  const zeZdania =
    typeof surowyBlad === 'string' && surowyBlad.trim() && !toKod(surowyBlad)
      ? surowyBlad.trim()
      : typeof surowe?.message === 'string' && surowe.message.trim()
        ? surowe.message.trim()
        : null;

  const komunikat =
    (kod && ZDANIA_DO_GOLYCH_KODOW[kod]) ||
    zeZdania ||
    // Zdanie wg statusu HTTP z `odczytajBladFunkcji` — ale tylko wtedy, gdy nie
    // jest samym kodem, który ta funkcja oddaje bez oceny.
    (zCiala && !toKod(zCiala.komunikat) ? zCiala.komunikat : null) ||
    DOMYSLNE;

  return { kod, komunikat, status: zCiala?.status ?? null };
}
