/**
 * Bramka na regresję, która KOSZTOWAŁA SPRZEDAŻ.
 *
 * `supabase.functions.invoke` przy odpowiedzi spoza 2xx zwraca `data === null`
 * i zawsze to samo zdanie w `error.message`. Cała ścieżka zakupu czytała
 * `data.code`, więc żaden komunikat odmowy nigdy nie dotarł do klienta —
 * zamiast „uzupełnij dane do faktury" widział „Edge Function returned
 * a non-2xx status code".
 *
 * Test odtwarza PRAWDZIWE kształty odpowiedzi z `billing-checkout`
 * i `billing-payu-order`. Dwie rzeczy pilnuje przede wszystkim:
 *   1. zdanie serwera dociera do klienta,
 *   2. GOŁY KOD nigdy nie trafia na ekran — dla żadnego statusu.
 *
 * Uruchomienie: `npm run test:front`.
 */
import { odczytajOdmowe, KOD_BRAK_DANYCH_NABYWCY } from '@/lib/odmowaZakupu';

/** Odtworzenie tego, co supabase-js oddaje przy odpowiedzi spoza 2xx. */
class FunctionsHttpError extends Error {
  context: Response;
  constructor(res: Response) { super('Edge Function returned a non-2xx status code'); this.context = res; }
}
const odp = (status: number, body: any) =>
  new FunctionsHttpError(new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  }));

let zle = 0;
const sprawdz = async (opis: string, wynik: Promise<any>, ocz: { kod: string | null; komunikat: string }) => {
  const w = await wynik;
  const ok = w.kod === ocz.kod && w.komunikat === ocz.komunikat;
  if (!ok) { zle++; console.log(`❌ ${opis}\n   dostałem: kod=${w.kod} komunikat=${JSON.stringify(w.komunikat)}\n   chciałem: kod=${ocz.kod} komunikat=${JSON.stringify(ocz.komunikat)}`); }
  else console.log(`✅ ${opis}`);
};

// 1. Prawdziwa odmowa z billing-checkout — ta, która wywalała klienta.
await sprawdz('409 BRAK_DANYCH_NABYWCY → zdanie serwera + kod',
  odczytajOdmowe(odp(409, { error: 'Zanim zapłacisz, uzupełnij dane do faktury.', code: 'BRAK_DANYCH_NABYWCY' }), null),
  { kod: KOD_BRAK_DANYCH_NABYWCY, komunikat: 'Zanim zapłacisz, uzupełnij dane do faktury.' });

// 2. To samo z billing-payu-order (BLIK) — ta sama treść.
await sprawdz('409 z PayU → tak samo',
  odczytajOdmowe(odp(409, { error: 'Zanim zapłacisz, uzupełnij dane do faktury.', code: 'BRAK_DANYCH_NABYWCY' }), null),
  { kod: KOD_BRAK_DANYCH_NABYWCY, komunikat: 'Zanim zapłacisz, uzupełnij dane do faktury.' });

// 3. GOŁY KOD w polu `error` — nie ma prawa trafić na ekran.
await sprawdz('503 GATEWAY_NOT_CONFIGURED → zdanie, nie kod',
  odczytajOdmowe(odp(503, { error: 'GATEWAY_NOT_CONFIGURED' }), null),
  { kod: 'GATEWAY_NOT_CONFIGURED', komunikat: 'Płatności są chwilowo niedostępne. Spróbuj za chwilę albo napisz do nas.' });

// 4. Goły kod, którego NIE MA w mapie — i tak nie pokazujemy kodu.
await sprawdz('nieznany goły kod → zdanie zapasowe, nigdy kod',
  odczytajOdmowe(odp(409, { error: 'JAKIS_NOWY_KOD' }), null),
  { kod: 'JAKIS_NOWY_KOD', komunikat: 'Nie udało się rozpocząć płatności. Spróbuj ponownie za chwilę.' });

// 5. Odmowa z kodem 200 i polem `error` (starsze ścieżki).
await sprawdz('200 z data.error → zdanie z data',
  odczytajOdmowe(null, { error: 'Ten plan i okres już masz.', code: 'PLAN_BEZ_ZMIANY' }),
  { kod: 'PLAN_BEZ_ZMIANY', komunikat: 'Ten plan i okres już masz.' });

// 6. 401 bez kodu — prawdziwy kształt z produkcji.
await sprawdz('401 bez kodu → zdanie serwera',
  odczytajOdmowe(odp(401, { error: 'Musisz być zalogowany.' }), null),
  { kod: null, komunikat: 'Musisz być zalogowany.' });

// 7. Ciało nie jest JSON-em — nie wolno rzucić ani pokazać śmieci.
await sprawdz('ciało nie-JSON → zdanie wg statusu',
  odczytajOdmowe(new FunctionsHttpError(new Response('<html>502</html>', { status: 500 })), null),
  { kod: null, komunikat: 'Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.' });

// 8. Awaria sieci — brak `context`.
await sprawdz('brak kontekstu (sieć) → zdanie ogólne',
  odczytajOdmowe(new Error('Failed to fetch'), null),
  { kod: null, komunikat: 'Nie udało się wykonać operacji. Spróbuj ponownie za chwilę.' });

// 9. KONTROLA POZYTYWNA: sukces nie może wyglądać na odmowę.
const sukces = await odczytajOdmowe(null, { url: 'https://payu/...' });
console.log(sukces.kod === null ? '✅ sukces bez pola error → brak kodu' : `❌ sukces potraktowany jak odmowa: ${JSON.stringify(sukces)}`);
if (sukces.kod !== null) zle++;

// 10. Zamiatarka: dla żadnego statusu komunikat nie może być samym kodem.
for (const st of [400, 401, 402, 403, 404, 409, 429, 500, 502, 503]) {
  const w = await odczytajOdmowe(odp(st, { error: 'KOD_TECHNICZNY_X', code: 'KOD_TECHNICZNY_X' }), null);
  if (/^[A-Z][A-Z0-9_]{2,}$/.test(w.komunikat)) { zle++; console.log(`❌ status ${st}: na ekran poszedł kod ${w.komunikat}`); }
}
console.log('✅ żaden status nie przepuszcza gołego kodu na ekran');

// Wynik oddajemy WYJĄTKIEM, nie `process.exit`. Wyjście z importowanego modułu
// ubiłoby cały przebieg — także pliki testowe, które jeszcze nie ruszyły — i to
// z kodem 0. Bramka meldowałaby sukces nad nieuruchomionymi testami.
if (zle > 0) throw new Error(`${zle} niezgodności w odczycie odmowy zakupu`);
console.log('\nWSZYSTKO ZIELONE');
