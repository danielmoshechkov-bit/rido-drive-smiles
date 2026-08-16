// Testy helpera z frontu (`src/utils/bladFunkcji.ts`) uruchamiane przez Deno,
// bo repozytorium nie ma runnera dla części frontowej, a ten kod jest czystym
// TypeScriptem bez zależności od Reacta. Precedens: `statusyDostepu_test.ts`
// też sięga poza katalog funkcji.
import { assertEquals, assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { odczytajBladFunkcji } from '../../../src/utils/bladFunkcji.ts';

/** Odtwarza kształt błędu, jaki daje `supabase.functions.invoke` przy non-2xx. */
function bladZOdpowiedzi(status: number, body: unknown, jakoTekst = false) {
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(jakoTekst ? String(body) : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': jakoTekst ? 'text/plain' : 'application/json' },
    }),
  };
}

Deno.test('wyciąga komunikat funkcji zamiast tekstu biblioteki', async () => {
  const b = await odczytajBladFunkcji(
    bladZOdpowiedzi(400, { error: 'Ten email jest już zarejestrowany.', field: 'email' }),
  );
  assertEquals(b.komunikat, 'Ten email jest już zarejestrowany.');
  assertEquals(b.pole, 'email');
  assertEquals(b.status, 400);
});

Deno.test('NIGDY nie pokazuje surowego message z biblioteki', async () => {
  const b = await odczytajBladFunkcji(bladZOdpowiedzi(500, {}));
  assert(!b.komunikat.includes('non-2xx'));
  assert(!b.komunikat.includes('Edge Function'));
});

Deno.test('zna pole `message`, gdy funkcja nie użyła `error`', async () => {
  const b = await odczytajBladFunkcji(bladZOdpowiedzi(400, { message: 'Brak numeru NIP' }));
  assertEquals(b.komunikat, 'Brak numeru NIP');
});

Deno.test('udostępnia surowe ciało, żeby dało się rozpoznać KOD', async () => {
  const b = await odczytajBladFunkcji(
    bladZOdpowiedzi(409, { error: 'ALREADY_SUBSCRIBED', message: 'Masz już plan' }),
  );
  assertEquals(b.surowe?.error, 'ALREADY_SUBSCRIBED');
});

Deno.test('schodzi do komunikatu wg statusu, gdy odpowiedź nie jest JSON-em', async () => {
  const b = await odczytajBladFunkcji(bladZOdpowiedzi(503, 'Service Unavailable', true));
  assert(b.komunikat.includes('chwilowo niedostępna'));
  assertEquals(b.status, 503);
});

Deno.test('402 mówi o planie — tego kodu używa bramka subskrypcji', async () => {
  const b = await odczytajBladFunkcji(bladZOdpowiedzi(402, 'x', true));
  assert(b.komunikat.includes('aktywnego planu'));
});

Deno.test('429 mówi o zbyt częstych próbach', async () => {
  const b = await odczytajBladFunkcji(bladZOdpowiedzi(429, 'x', true));
  assert(b.komunikat.includes('Za dużo prób'));
});

Deno.test('nieznany status daje komunikat ogólny, nie pusty', async () => {
  const b = await odczytajBladFunkcji(bladZOdpowiedzi(418, 'x', true));
  assert(b.komunikat.length > 10);
});

Deno.test('błąd bez kontekstu (awaria sieci) też daje zdanie po polsku', async () => {
  const b = await odczytajBladFunkcji(new Error('Failed to fetch'));
  assert(b.komunikat.includes('Spróbuj ponownie'));
  assertEquals(b.status, undefined);
});

Deno.test('pusty łańcuch w `error` nie jest komunikatem', async () => {
  const b = await odczytajBladFunkcji(bladZOdpowiedzi(400, { error: '   ' }));
  assert(b.komunikat.includes('niepoprawne'));
});

Deno.test('odpowiedź da się odczytać ponownie — używamy clone()', async () => {
  const blad = bladZOdpowiedzi(400, { error: 'raz' });
  await odczytajBladFunkcji(blad);
  const ponownie = await (blad.context as Response).json();
  assertEquals(ponownie.error, 'raz');
});
