// ============================================================================
// voiceRozpoznanieWarsztatu.ts — KTÓRY WARSZTAT ODBIERA TĘ ROZMOWĘ.
//
// Dziś warsztat wynika z `agent_id`: jeden agent, jeden warsztat. Przy wielu
// warsztatach `agent_id` przestaje odróżniać cokolwiek — jest wspólny i mówi
// tylko, KTÓRA PERSONA odbiera, nie CZYJ telefon zadzwonił.
//
// Dlatego kolejność jest odwrotna, niż podpowiada nawyk:
//   1. `called_number` → tabela numerów      (numer identyfikuje warsztat)
//   2. `agent_id` → voice_agent_configs      (fallback: nasz numer testowy)
//   3. nic                                   → pusty snapshot, jak dziś
//
// Funkcja jest CZYSTA — odczyty dostaje wstrzyknięte. Bez tego jedynym
// sposobem sprawdzenia rozpoznania byłby prawdziwy telefon, a rozpoznanie
// warsztatu to nie jest rzecz, którą testuje się dzwoniąc.
// ============================================================================

/** Skąd wzięliśmy warsztat. Trafia do logu — inaczej nie wiadomo, czy nowa droga w ogóle działa. */
export type Droga = "numer" | "agent_id" | "nieznany_numer" | "brak";

export interface Rozpoznanie {
  providerId: string | null;
  droga: Droga;
  numer: string | null;   // znormalizowany numer docelowy, jeśli był
}

/**
 * Numer do postaci `48XXXXXXXXX` — same cyfry, z kierunkowym kraju.
 *
 * Webhook przynosi numer w co najmniej trzech postaciach (`+48 22 101 58 96`,
 * `0048221015896`, `221015896`), a w bazie trzymamy jedną. Porównywanie
 * surowych ciągów dałoby ciche „nie znaleziono" — czyli fallback na agenta
 * i cudzy snapshot w słuchawce.
 */
export function normalizujNumer(surowy: unknown): string | null {
  let cyfry = String(surowy ?? "").replace(/\D+/g, "");
  if (!cyfry) return null;
  if (cyfry.startsWith("00")) cyfry = cyfry.slice(2);          // 0048… → 48…
  if (cyfry.length === 9) cyfry = "48" + cyfry;                // krajowy bez kierunkowego
  // Numer krajowy zapisany z zerem międzymiastowym: 0 22 101 58 96.
  if (cyfry.length === 10 && cyfry.startsWith("0")) cyfry = "48" + cyfry.slice(1);
  return cyfry.length >= 9 && cyfry.length <= 15 ? cyfry : null;
}

/**
 * Numer, NA KTÓRY zadzwoniono. Platforma nazywa to pole różnie zależnie
 * od wersji i od tego, czy rozmowa przyszła po SIP, czy z sieci.
 */
export function numerDocelowy(body: Record<string, unknown> | null | undefined): string | null {
  const b = (body || {}) as Record<string, unknown>;
  const call = (b.call || {}) as Record<string, unknown>;
  const dane = (b.conversation_initiation_client_data || {}) as Record<string, unknown>;
  for (const kandydat of [b.called_number, b.agent_number, b.to_number, call.to_number, call.called_number, dane.called_number]) {
    const n = normalizujNumer(kandydat);
    if (n) return n;
  }
  return null;
}

/**
 * Rozpoznanie warsztatu.
 *
 * @param poNumerze  zwraca provider_id dla AKTYWNEGO numeru albo null
 * @param poAgencie  dotychczasowa ścieżka; wołana tylko wtedy, gdy numer nie trafił
 */
export async function rozpoznajWarsztat(
  body: Record<string, unknown> | null | undefined,
  poNumerze: (numer: string) => Promise<string | null>,
  poAgencie: () => Promise<string | null>,
): Promise<Rozpoznanie> {
  const numer = numerDocelowy(body);
  if (numer) {
    const zNumeru = await poNumerze(numer);
    if (zNumeru) return { providerId: zNumeru, droga: "numer", numer };
    // NUMER JEST, ALE GO NIE ZNAMY — I TU FALLBACK JEST ZAKAZANY.
    //
    // Pierwsza wersja szła wtedy na `agent_id`. Sprawdzone na produkcji 16.08:
    // wywołanie z nieznanym numerem dostawało PEŁNY snapshot warsztatu
    // domyślnego — usługi, ceny i do 500 rekordów `workshop_clients`
    // z imieniem i telefonem. Przy jednym warsztacie nieszkodliwe, przy drugim
    // to wyciek danych osobowych KLIENTÓW cudzego warsztatu.
    //
    // Agent jest wspólny dla wszystkich warsztatów, więc `agent_id` nie
    // odróżnia niczego — nie ma z czego wyprowadzić „właściwego" warsztatu.
    // Pusty snapshot jest tu jedyną poprawną odpowiedzią: agent bez danych
    // zamiast agenta z cudzymi.
    return { providerId: null, droga: "nieznany_numer", numer };
  }
  // FALLBACK TYLKO GDY NUMERU NIE MA W OGÓLE. Zostaje, dopóki log nie pokaże,
  // że żadna prawdziwa rozmowa już tędy nie chodzi.
  const zAgenta = await poAgencie();
  if (zAgenta) return { providerId: zAgenta, droga: "agent_id", numer };
  return { providerId: null, droga: "brak", numer };
}
