// ============================================================================
// voicePersona.ts — KTÓRA KONFIGURACJA NALEŻY DO AGENTA WARSZTATU.
//
// Powód powstania, 19.08:
//
// `voice_agent_personas` miała DWIE włączone persony z tym samym priorytetem
// (workshop_secretary i sales_agent, obie 8). Panel wybierał personę
// zapytaniem `order by priority desc limit 1`, a przy remisie PostgreSQL nie
// obiecuje, którą z nich zwróci — plan to `Seq Scan` plus sortowanie po jednym
// kluczu, więc decyduje fizyczna kolejność wierszy. Ta kolejność zmienia się
// przy każdym UPDATE na tabeli.
//
// Gdyby remis rozstrzygnął się na korzyść `sales_agent`:
//   panel pokazuje warsztatowi PUSTY formularz z wyłączonym przełącznikiem,
//   warsztat go wypełnia i zapisuje,
//   powstaje DRUGI wiersz w `voice_agent_configs` z `is_active: false`,
//   a `voice-agent-init` czytał konfigurację przez `.eq(provider_id).limit(1)`
//   — bez filtra na personę i bez sortowania. Czyli rzut monetą decydował,
//   czy działający telefon jest odbierany.
//
// DLACZEGO NIE ZWYKŁY FILTR `.eq("persona_key", "workshop_secretary")`:
// bo zawężenie odczytu MOŻE ODEBRAĆ OBSŁUGĘ. Gdyby jakiś warsztat miał dziś
// wiersz z inną personą, filtr zamieniłby go w „brak konfiguracji", a brak
// konfiguracji na ścieżce po numerze znaczy WYŁĄCZONY. Naprawa remisu nie może
// uciszyć telefonu — to byłby ten sam błąd, przed którym się bronimy, wchodzący
// drugimi drzwiami.
//
// Dlatego czytamy WSZYSTKIE wiersze warsztatu (są ich jednostki) i wybieramy
// deterministycznie: persona warsztatu, jeśli jest; w przeciwnym razie pierwsza
// po nazwie. Zbiór wyników nigdy się nie kurczy, a wynik nie zależy od tego,
// w jakiej kolejności baza odda wiersze.
// ============================================================================

/** Persona agenta warsztatowego. Jedyna, którą obsługuje panel „Asystent głosowy". */
export const PERSONA_WARSZTATU = "workshop_secretary";

export interface WierszKonfiguracji {
  persona_key?: string | null;
  [inne: string]: unknown;
}

/**
 * Wybiera konfigurację warsztatu z wierszy zwróconych przez bazę.
 *
 * Zwraca `null` TYLKO wtedy, gdy wierszy nie ma w ogóle — nigdy dlatego, że
 * persona okazała się inna, niż się spodziewaliśmy.
 */
export function wybierzKonfiguracjeWarsztatu<T extends WierszKonfiguracji>(
  wiersze: readonly T[] | null | undefined,
): T | null {
  if (!wiersze?.length) return null;
  const warsztatowa = wiersze.find((w) => w.persona_key === PERSONA_WARSZTATU);
  if (warsztatowa) return warsztatowa;
  // Bez persony warsztatu bierzemy pierwszą PO NAZWIE, a nie pierwszą z brzegu:
  // ta sama zawartość tabeli ma zawsze dawać ten sam wynik.
  return [...wiersze].sort((a, b) =>
    String(a.persona_key ?? "").localeCompare(String(b.persona_key ?? ""))
  )[0];
}
