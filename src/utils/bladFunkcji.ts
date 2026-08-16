/**
 * Odczytanie komunikatu z odpowiedzi funkcji brzegowej.
 *
 * ⚠️ POWÓD ISTNIENIA (16.08.2026): `supabase.functions.invoke` przy odpowiedzi
 * spoza zakresu 2xx ustawia `data = null`, a w `error.message` wkłada **własny**
 * tekst — „Edge Function returned a non-2xx status code". Treść, którą funkcja
 * naprawdę odesłała, siedzi w `error.context` jako obiekt `Response` i nikt jej
 * nie czyta, dopóki jej stamtąd nie wyjmie.
 *
 * Skutek był taki, że `register-marketplace-user` odsyłała poprawne
 * „Ten email jest już zarejestrowany…" ze statusem 400, a użytkownik widział
 * techniczny bełkot o non-2xx. Funkcja działała; niewidoczna była wyłącznie
 * jej odpowiedź.
 */
export interface BladFunkcji {
  /** Komunikat po polsku, gotowy do pokazania. */
  komunikat: string;
  /** Pole formularza, którego dotyczy — jeśli funkcja je wskazała. */
  pole?: string;
  /** Kod HTTP, jeśli udało się go ustalić. */
  status?: number;
  /**
   * Surowe ciało odpowiedzi. Część funkcji odsyła w `error` KOD (np.
   * `already_confirmed`, `ALREADY_SUBSCRIBED`), a nie zdanie — wołający musi
   * mieć jak go rozpoznać, zanim pokaże własny komunikat.
   */
  surowe?: Record<string, unknown>;
}

/**
 * Komunikaty zapasowe dla sytuacji, w których funkcja nie odesłała nic
 * czytelnego. Lepsze niż kod HTTP, gorsze niż zdanie od samej funkcji.
 */
const WEDLUG_STATUSU: Record<number, string> = {
  400: 'Dane w formularzu są niepoprawne. Sprawdź je i spróbuj ponownie.',
  401: 'Musisz być zalogowany, aby wykonać tę operację.',
  402: 'Ta operacja wymaga aktywnego planu.',
  403: 'Nie masz uprawnień do tej operacji.',
  404: 'Nie znaleźliśmy tego, czego szukasz.',
  409: 'Ta operacja została już wykonana.',
  429: 'Za dużo prób w krótkim czasie. Odczekaj chwilę.',
  500: 'Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.',
  503: 'Usługa jest chwilowo niedostępna. Spróbuj ponownie za chwilę.',
};

const OSTATECZNY = 'Nie udało się wykonać operacji. Spróbuj ponownie za chwilę.';

/**
 * Wyciąga czytelny komunikat z błędu zwróconego przez `functions.invoke`.
 *
 * Kolejność: treść od funkcji → komunikat wg kodu HTTP → tekst ogólny.
 * Surowego `error.message` NIE pokazujemy nigdy — to komunikat biblioteki,
 * napisany dla programisty, nie dla użytkownika.
 */
export async function odczytajBladFunkcji(error: unknown): Promise<BladFunkcji> {
  const kontekst = (error as { context?: unknown } | null)?.context;

  if (kontekst instanceof Response) {
    const status = kontekst.status;
    try {
      // `clone()`, bo treść odpowiedzi da się odczytać tylko raz, a wywołujący
      // może chcieć sięgnąć po nią jeszcze w innym miejscu.
      const tresc = await kontekst.clone().json();
      if (tresc && typeof tresc.error === 'string' && tresc.error.trim()) {
        return { komunikat: tresc.error, pole: tresc.field, status, surowe: tresc };
      }
      if (tresc && typeof tresc.message === 'string' && tresc.message.trim()) {
        return { komunikat: tresc.message, pole: tresc.field, status, surowe: tresc };
      }
    } catch {
      // Odpowiedź nie była JSON-em — schodzimy do komunikatu wg statusu.
    }
    return { komunikat: WEDLUG_STATUSU[status] ?? OSTATECZNY, status };
  }

  // Brak kontekstu: awaria sieci albo błąd rzucony przed wysłaniem żądania.
  return { komunikat: OSTATECZNY };
}
