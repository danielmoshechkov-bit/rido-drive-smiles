/**
 * DATA SPRZEDAŻY ZE ZLECENIA — przypadki, na których to się psuje.
 *
 * Testujemy jedyną rzecz w tym pliku, którą da się sprawdzić bez bazy:
 * wybór daty sprzedaży. Reszta (`znajdzFaktureZlecenia`,
 * `przygotujFaktureZeZlecenia`) to zapytania do Supabase i sprawdza się je
 * zachowaniem, nie testem jednostkowym.
 *
 * Dlaczego akurat to: data sprzedaży trafia na dokument i do KSeF, a błąd
 * w niej nie zapala żadnej bramki — faktura z datą sprzedaży równą dacie
 * wystawienia przechodzi walidację XSD i jest wadliwa merytorycznie
 * (art. 106e ust. 1 pkt 6). Taki błąd widać dopiero przy kontroli.
 */
import { dataSprzedazyZeZlecenia } from './dataSprzedazy';

let porazek = 0;
const sprawdz = (opis: string, wynik: unknown, oczekiwane: unknown) => {
  const ok = wynik === oczekiwane;
  if (!ok) porazek++;
  console.log(`${ok ? '✅' : '❌'} ${opis}${ok ? '' : ` — jest ${JSON.stringify(wynik)}, ma być ${JSON.stringify(oczekiwane)}`}`);
};

// Zlecenie zakończone: bierzemy DZIEŃ zakończenia, bez godziny.
sprawdz('znacznik czasu → sam dzień',
  dataSprzedazyZeZlecenia({ completed_at: '2026-03-04T17:42:11.000Z' }), '2026-03-04');

sprawdz('sama data → ta sama data',
  dataSprzedazyZeZlecenia({ completed_at: '2026-03-04' }), '2026-03-04');

// Zlecenie jeszcze w robocie: `undefined`, żeby formularz wpisał dzisiaj.
// `null` i pusty napis NIE mogą przejść jako data — pusta data sprzedaży
// na fakturze to dokument bez jednego z wymaganych pól.
sprawdz('brak zakończenia → undefined', dataSprzedazyZeZlecenia({ completed_at: null }), undefined);
sprawdz('pusty napis → undefined', dataSprzedazyZeZlecenia({ completed_at: '' }), undefined);
sprawdz('brak pola → undefined', dataSprzedazyZeZlecenia({}), undefined);
sprawdz('brak zlecenia → undefined', dataSprzedazyZeZlecenia(null), undefined);

// KONTROLA ODWROTNA: gdyby funkcja zaczęła zwracać dzisiejszą datę zamiast
// `undefined`, powyższe przypadki nadal by przeszły przy nieuważnym zapisie
// oczekiwań. Tu sprawdzamy wprost, że NIE podstawia dnia dzisiejszego.
const dzis = new Date().toISOString().slice(0, 10);
sprawdz('pusty nie podstawia dzisiaj',
  dataSprzedazyZeZlecenia({ completed_at: null }) === dzis, false);

if (porazek > 0) {
  console.error(`\n${porazek} nieudanych przypadków`);
  process.exit(1);
}
console.log('\nData sprzedaży ze zlecenia — wszystkie przypadki OK');
