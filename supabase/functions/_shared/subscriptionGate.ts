/**
 * Bramka subskrypcji dla edge functions (G5).
 *
 * RLS z G4 nie chroni tych ścieżek: funkcje brzegowe piszą kluczem
 * `service_role`, który omija polityki w całości. To jest miejsce, w którym
 * gating najłatwiej obejść — zapytanie z pominięciem przeglądarki trafia
 * prosto do funkcji, a ta pisze bez pytania bazy o zgodę.
 *
 * ⚠️ KOLEJNOŚĆ WDROŻENIA MA ZNACZENIE.
 * Bramka woła funkcję SQL `moze_pracowac`, która powstaje w migracji G4.
 * Wdrożenie tych funkcji PRZED migracją oznacza odmowę dla wszystkich —
 * bo brak funkcji w bazie jest tu traktowany jak brak zgody. Najpierw
 * migracja, potem deploy.
 *
 * Fail-closed jest tu celowe i nie podlega negocjacji: nie wiemy, czy klient
 * zapłacił, więc nie pozwalamy pracować. Odwrotna domyślność oznaczałaby, że
 * awaria bazy otwiera moduł wszystkim.
 */

export const KOD_BRAMKI = 'SUBSCRIPTION_REQUIRED';

export interface WynikBramki {
  wolno: boolean;
  /** Powód odmowy do logu — NIE do pokazania klientowi. */
  powod?: string;
}

/** Minimalny kontrakt klienta Supabase, żeby nie ciągnąć typów generycznych. */
interface KlientRpc {
  rpc(
    nazwa: string,
    argumenty: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Czy podmiot może wykonywać pracę w danej linii produktowej.
 *
 * Decyzję podejmuje funkcja SQL, nie ten plik. Powtórzenie reguły w TypeScripcie
 * dałoby drugie źródło prawdy, które prędzej czy później rozjechałoby się
 * z bazą i z hookiem w przeglądarce — a rozjazd między bramkami znaczy albo
 * odblokowany ekran z odmową przy zapisie, albo odwrotnie.
 */
export async function mozePracowac(
  klient: KlientRpc,
  providerId: string | null | undefined,
  linia = 'warsztat',
): Promise<WynikBramki> {
  if (!providerId) {
    return { wolno: false, powod: 'brak provider_id' };
  }

  const { data, error } = await klient.rpc('moze_pracowac', {
    p_provider: providerId,
    p_linia: linia,
  });

  if (error) {
    // Najczęstsza przyczyna: funkcje wdrożone przed migracją G4.
    return { wolno: false, powod: `rpc moze_pracowac: ${error.message}` };
  }

  return data === true ? { wolno: true } : { wolno: false, powod: 'subskrypcja nieaktywna' };
}

/**
 * Gotowa odpowiedź odmowna. Kod jest stały, żeby front mógł na niego zareagować
 * podpowiedzią zakupu zamiast pokazywać surowy komunikat.
 */
export function odmowaBramki(
  naglowki: Record<string, string>,
  powod?: string,
): Response {
  console.warn('[bramka] odmowa:', powod ?? 'brak powodu');
  return new Response(
    JSON.stringify({
      error: 'Ta operacja wymaga aktywnego planu.',
      code: KOD_BRAMKI,
    }),
    { status: 402, headers: { ...naglowki, 'Content-Type': 'application/json' } },
  );
}
