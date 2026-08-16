import { createContext, useContext, type ReactNode } from 'react';

/**
 * Czy właśnie trwa wprowadzenie — czyli czy to, co użytkownik teraz zakłada,
 * jest zleceniem PRÓBNYM.
 *
 * Po co kontekst zamiast przekazywania flagi przez pięć poziomów komponentów:
 * potrzebują jej dwa odległe miejsca (zakładanie zlecenia i sprawdzanie
 * pojazdu), a między nimi nie ma nic wspólnego poza tym, że oba siedzą
 * w module warsztatu.
 *
 * UWAGA: to jest tylko podpowiedź dla interfejsu. O tym, czy SMS jest darmowy
 * i czy sprawdzenie pojazdu nie schodzi z limitu, decyduje SERWER na podstawie
 * kolumny `workshop_orders.is_demo` i liczników w bazie. Przeglądarka może
 * skłamać — i dlatego nic tu nie rozstrzyga.
 */
const TrybProbnyContext = createContext(false);

export function TrybProbnyProvider({ aktywny, children }: { aktywny: boolean; children: ReactNode }) {
  return <TrybProbnyContext.Provider value={aktywny}>{children}</TrybProbnyContext.Provider>;
}

/** true, gdy trwa wprowadzenie i zakładane rzeczy są próbne. */
export function useTrybProbny(): boolean {
  return useContext(TrybProbnyContext);
}
