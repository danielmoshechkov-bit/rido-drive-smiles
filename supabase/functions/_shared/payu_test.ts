import { assertEquals, assert, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { createHash } from 'node:crypto';
import {
  sprawdzPodpisPayu,
  rozbierzNaglowek,
  mapujStatusPayu,
  naGrosze,
  zGroszy,
  ipKupujacego,
} from './payu.ts';

// Klucz testowy — NIE jest to żaden prawdziwy sekret, tylko wartość do liczenia
// skrótów w tym pliku. Prawdziwy drugi klucz żyje w sekretach Supabase.
const KLUCZ = 'testowy-drugi-klucz-md5';

const podpisz = (tresc: string, alg = 'md5', klucz = KLUCZ) =>
  createHash(alg).update(tresc + klucz, 'utf8').digest('hex');

const naglowek = (tresc: string, alg = 'MD5', klucz = KLUCZ) =>
  `sender=checkout;algorithm=${alg};signature=${podpisz(tresc, alg.toLowerCase().replace('-', ''), klucz)};content=DOCUMENT`;

// ─────────────────────────────────────────────────────────── podpis

Deno.test('poprawny podpis MD5 przechodzi', () => {
  const tresc = '{"order":{"orderId":"ABC","status":"COMPLETED"}}';
  assertEquals(sprawdzPodpisPayu(tresc, naglowek(tresc), KLUCZ).ok, true);
});

Deno.test('poprawny podpis SHA-256 przechodzi', () => {
  const tresc = '{"order":{"orderId":"ABC"}}';
  const h = `algorithm=SHA-256;signature=${podpisz(tresc, 'sha256')};content=DOCUMENT`;
  assertEquals(sprawdzPodpisPayu(tresc, h, KLUCZ).ok, true);
});

Deno.test('zmiana JEDNEGO znaku w treści unieważnia podpis', () => {
  const tresc = '{"order":{"orderId":"ABC","status":"PENDING"}}';
  const h = naglowek(tresc);
  const podmieniona = tresc.replace('PENDING', 'COMPLETE');
  assertEquals(sprawdzPodpisPayu(podmieniona, h, KLUCZ).ok, false);
});

Deno.test('FAIL-CLOSED: brak nagłówka to odmowa', () => {
  const w = sprawdzPodpisPayu('{}', null, KLUCZ);
  assertEquals(w.ok, false);
  assert(w.powod?.includes('nagłówek'));
});

Deno.test('FAIL-CLOSED: brak drugiego klucza to odmowa', () => {
  const tresc = '{}';
  assertEquals(sprawdzPodpisPayu(tresc, naglowek(tresc), '').ok, false);
  assertEquals(sprawdzPodpisPayu(tresc, naglowek(tresc), '   ').ok, false);
});

Deno.test('FAIL-CLOSED: nieznany algorytm to odmowa, nie domyślny MD5', () => {
  const tresc = '{}';
  const h = `algorithm=ROT13;signature=${podpisz(tresc)};content=DOCUMENT`;
  const w = sprawdzPodpisPayu(tresc, h, KLUCZ);
  assertEquals(w.ok, false);
  assert(w.powod?.includes('ROT13'));
});

Deno.test('cudzy klucz nie przechodzi', () => {
  const tresc = '{"order":{"status":"COMPLETED"}}';
  const h = naglowek(tresc, 'MD5', 'klucz-napastnika');
  assertEquals(sprawdzPodpisPayu(tresc, h, KLUCZ).ok, false);
});

Deno.test('podpis wielkimi literami też jest akceptowany', () => {
  const tresc = '{"a":1}';
  const h = `algorithm=MD5;signature=${podpisz(tresc).toUpperCase()};content=DOCUMENT`;
  assertEquals(sprawdzPodpisPayu(tresc, h, KLUCZ).ok, true);
});

Deno.test('kolejność pól w nagłówku nie ma znaczenia', () => {
  const tresc = '{"a":1}';
  const h = `signature=${podpisz(tresc)};content=DOCUMENT;algorithm=MD5;sender=checkout`;
  assertEquals(sprawdzPodpisPayu(tresc, h, KLUCZ).ok, true);
});

Deno.test('nagłówek bez podpisu jest odrzucany', () => {
  assertEquals(rozbierzNaglowek('algorithm=MD5;content=DOCUMENT'), null);
  assertEquals(rozbierzNaglowek('sender=checkout'), null);
  assertEquals(rozbierzNaglowek(''), null);
});

// ─────────────────────────────────────────────────────────── statusy

Deno.test('COMPLETED to jedyny status, który znaczy „zapłacone"', () => {
  assertEquals(mapujStatusPayu('COMPLETED'), 'oplacone');
  for (const s of ['PENDING', 'NEW', 'CANCELED', 'REJECTED', 'WAITING_FOR_CONFIRMATION']) {
    assert(mapujStatusPayu(s) !== 'oplacone', `${s} nie może znaczyć zapłacone`);
  }
});

Deno.test('WAITING_FOR_CONFIRMATION to oczekiwanie, nie zapłata', () => {
  // Pieniądze są zablokowane, ale jeszcze nie nasze. Wydanie pakietu na tym
  // etapie oznaczałoby oddanie towaru przed zapłatą.
  assertEquals(mapujStatusPayu('WAITING_FOR_CONFIRMATION'), 'oczekuje');
});

Deno.test('nieznany status NIE znaczy zapłacone', () => {
  assertEquals(mapujStatusPayu('COS_NOWEGO'), 'oczekuje');
  assertEquals(mapujStatusPayu(''), 'oczekuje');
});

Deno.test('status jest odporny na wielkość liter', () => {
  assertEquals(mapujStatusPayu('completed'), 'oplacone');
});

// ─────────────────────────────────────────────────────────── kwoty

Deno.test('121,77 zł to dokładnie 12177 groszy', () => {
  // Mnożenie zmiennoprzecinkowe daje tu 12176.999999999998; obcięcie zabrałoby
  // klientowi grosz z rachunku.
  assertEquals(naGrosze(121.77), 12177);
  assertEquals(naGrosze(0.1 + 0.2), 30);
  assertEquals(naGrosze(19), 1900);
  assertEquals(naGrosze(0), 0);
});

Deno.test('konwersja w obie strony zachowuje kwotę', () => {
  for (const k of [19, 59, 129, 121.77, 249.99, 0.01]) {
    assertEquals(zGroszy(naGrosze(k)), k);
  }
});

Deno.test('kwota ujemna albo nie-liczba to wyjątek, nie ciche zero', () => {
  assertThrows(() => naGrosze(-1));
  assertThrows(() => naGrosze(Number.NaN));
  assertThrows(() => naGrosze(Number.POSITIVE_INFINITY));
});

// ─────────────────────────────────────────────────────────── IP

Deno.test('IP bierze pierwszy wpis z x-forwarded-for', () => {
  const h = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' });
  assertEquals(ipKupujacego(h), '203.0.113.7');
});

Deno.test('bez nagłówka IP dajemy pętlę zwrotną, nie pustkę', () => {
  // PayU odrzuca zamówienie bez `customerIp`, a brak adresu w nagłówku nie
  // jest powodem, żeby klient nie mógł zapłacić.
  assertEquals(ipKupujacego(new Headers()), '127.0.0.1');
});

Deno.test('pusty x-forwarded-for schodzi do cf-connecting-ip', () => {
  const h = new Headers({ 'x-forwarded-for': '', 'cf-connecting-ip': '198.51.100.4' });
  assertEquals(ipKupujacego(h), '198.51.100.4');
});

// ─────────────────────────────────────────── potwierdzenie odbioru (capture)

Deno.test('WAITING_FOR_CONFIRMATION wymaga potwierdzenia, nie wydaje towaru', () => {
  // Ten status NIE może mapować się na „opłacone": pieniądze są zablokowane,
  // ale stają się nasze dopiero po potwierdzeniu odbioru. Wydanie pakietu
  // wcześniej oznaczałoby oddanie towaru przed zapłatą.
  //
  // Jednocześnie NIE wolno go zostawić bez działania — PayU czeka wtedy
  // w nieskończoność i klient płaci za nic. To był błąd znaleziony
  // w sandboxie 17.08.2026.
  assertEquals(mapujStatusPayu('WAITING_FOR_CONFIRMATION'), 'oczekuje');
  assert(mapujStatusPayu('WAITING_FOR_CONFIRMATION') !== 'oplacone');
});

Deno.test('dopiero COMPLETED wydaje pakiet', () => {
  assertEquals(mapujStatusPayu('COMPLETED'), 'oplacone');
});
