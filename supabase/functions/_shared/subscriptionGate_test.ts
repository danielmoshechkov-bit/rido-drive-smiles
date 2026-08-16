import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { mozePracowac, odmowaBramki, KOD_BRAMKI } from './subscriptionGate.ts';

/** Klient-atrapa: zwraca to, co mu każemy, i zapamiętuje, o co go pytano. */
function klient(
  odpowiedz: { data: unknown; error: { message: string } | null },
  zapis?: { nazwa?: string; argumenty?: Record<string, unknown> },
) {
  return {
    rpc(nazwa: string, argumenty: Record<string, unknown>) {
      if (zapis) {
        zapis.nazwa = nazwa;
        zapis.argumenty = argumenty;
      }
      return Promise.resolve(odpowiedz);
    },
  };
}

Deno.test('przepuszcza, gdy baza mówi true', async () => {
  const w = await mozePracowac(klient({ data: true, error: null }), 'p1');
  assertEquals(w.wolno, true);
});

Deno.test('odmawia, gdy baza mówi false', async () => {
  const w = await mozePracowac(klient({ data: false, error: null }), 'p1');
  assertEquals(w.wolno, false);
  assertEquals(w.powod, 'subskrypcja nieaktywna');
});

Deno.test('odmawia bez provider_id — nie pyta nawet bazy', async () => {
  const zapis: { nazwa?: string } = {};
  const w = await mozePracowac(klient({ data: true, error: null }, zapis), null);
  assertEquals(w.wolno, false);
  assertEquals(zapis.nazwa, undefined);
});

Deno.test('odmawia przy pustym łańcuchu provider_id', async () => {
  const w = await mozePracowac(klient({ data: true, error: null }), '');
  assertEquals(w.wolno, false);
});

Deno.test('FAIL-CLOSED: błąd RPC to odmowa, nie przepuszczenie', async () => {
  const w = await mozePracowac(
    klient({ data: null, error: { message: 'function moze_pracowac does not exist' } }),
    'p1',
  );
  assertEquals(w.wolno, false);
  assertEquals(w.powod?.includes('does not exist'), true);
});

Deno.test('FAIL-CLOSED: null z bazy to odmowa', async () => {
  const w = await mozePracowac(klient({ data: null, error: null }), 'p1');
  assertEquals(w.wolno, false);
});

Deno.test('FAIL-CLOSED: „true" jako tekst NIE przepuszcza', async () => {
  // Gdyby kiedyś ktoś zwrócił z RPC tekst zamiast boolean, porównanie luźne
  // otworzyłoby bramkę. Dlatego === true, nie truthy.
  const w = await mozePracowac(klient({ data: 'true', error: null }), 'p1');
  assertEquals(w.wolno, false);
});

Deno.test('przekazuje linię produktową do bazy', async () => {
  const zapis: { argumenty?: Record<string, unknown> } = {};
  await mozePracowac(klient({ data: true, error: null }, zapis), 'p1', 'uslugi');
  assertEquals(zapis.argumenty, { p_provider: 'p1', p_linia: 'uslugi' });
});

Deno.test('domyślną linią jest warsztat', async () => {
  const zapis: { argumenty?: Record<string, unknown> } = {};
  await mozePracowac(klient({ data: true, error: null }, zapis), 'p1');
  assertEquals(zapis.argumenty?.p_linia, 'warsztat');
});

Deno.test('odmowa ma status 402 i stały kod', async () => {
  const r = odmowaBramki({ 'x-test': '1' }, 'test');
  assertEquals(r.status, 402);
  assertEquals(r.headers.get('x-test'), '1');
  assertEquals(JSON.parse(await r.text()).code, KOD_BRAMKI);
});
