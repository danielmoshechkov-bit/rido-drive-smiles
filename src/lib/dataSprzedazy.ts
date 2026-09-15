/**
 * DATA SPRZEDAŻY NA FAKTURZE ZE ZLECENIA — dzień WYKONANIA usługi.
 *
 * Art. 106e ust. 1 pkt 6 ustawy o VAT: faktura nosi datę dokonania dostawy
 * albo wykonania usługi, o ile jest określona i różni się od daty wystawienia.
 * Obowiązek podatkowy powstaje z chwilą wykonania — późniejsze wystawienie
 * faktury go nie przesuwa, więc data sprzedaży równa dacie wystawienia
 * przy dokumencie wystawianym wstecz jest po prostu nieprawdziwa.
 *
 * `completed_at` pustego zlecenia (jeszcze w robocie) daje `undefined`,
 * a formularz wpisuje wtedy dzień dzisiejszy — i to też jest poprawne:
 * usługę kończy się w chwili wystawienia faktury przy odbiorze.
 *
 * 🔴 Jedno miejsce na tę decyzję. Dwa liczyłyby ją inaczej przy pierwszej
 * zmianie — patrz CLAUDE.md, „ta sama wartość liczona w kilku miejscach".
 */
export function dataSprzedazyZeZlecenia(order: any): string | undefined {
  const d = String(order?.completed_at ?? '').slice(0, 10);
  return d || undefined;
}
