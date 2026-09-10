import test from "node:test";
import assert from "node:assert/strict";
import { sprawdzDostepKsef } from "./ksefDostep.ts";

/**
 * Test bramki `ksef-integration`.
 *
 * ZASADA, KTÓREJ PILNUJE: każdy zestaw odmów musi zawierać przypadek, który
 * MA PRZEJŚĆ. Sam zestaw odmów niczego nie dowodzi — bramka odrzucająca
 * wszystko wypadłaby zielono, a wtedy nikt nie wyśle żadnej faktury do KSeF.
 */

const KLUCZ = "service-role-udawany-klucz-0123456789";

const WLASCICIEL = "11111111-1111-1111-1111-111111111111";
const OBCY = "22222222-2222-2222-2222-222222222222";
const ADMIN = "33333333-3333-3333-3333-333333333333";

const FAKTURA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ENCJA = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

/** Namiastka klienta bazy — oddaje dokładnie to, co ma oddać produkcja. */
function klient(userId: string | null) {
  return {
    auth: {
      getUser: (_t: string) =>
        Promise.resolve(userId ? { data: { user: { id: userId } }, error: null }
                               : { data: { user: null }, error: new Error("zly token") }),
    },
    from(tabela: string) {
      const wynik = (dane: unknown) => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: dane, error: null }) }) }),
      });
      if (tabela === "user_roles") {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: userId === ADMIN ? [{ role: "admin" }] : [],
              error: null,
            }),
          }),
        };
      }
      if (tabela === "user_invoices") return wynik({ user_id: WLASCICIEL });
      if (tabela === "entities") return wynik({ owner_user_id: WLASCICIEL });
      return wynik(null);
    },
  } as any;
}

const zadanie = (naglowek: string | null) =>
  new Request("https://x/ksef", {
    method: "POST",
    headers: naglowek ? { Authorization: naglowek } : {},
  });

test("KONTROLA POZYTYWNA: kanał wewnętrzny (klucz serwisowy) przechodzi", async () => {
  // Tak woła `billing-invoice-issue` po wystawieniu faktury platformy.
  // Gdyby ta droga padła, faktury platformy przestałyby trafiać do KSeF.
  const w = await sprawdzDostepKsef(zadanie(`Bearer ${KLUCZ}`), klient(null), { invoice_id: FAKTURA }, KLUCZ);
  assert.equal(w.ok, true);
  if (w.ok) assert.equal(w.kto.rodzaj, "internal");
});

test("KONTROLA POZYTYWNA: właściciel dostaje się do SWOJEJ faktury", async () => {
  const w = await sprawdzDostepKsef(zadanie("Bearer jwt"), klient(WLASCICIEL), { invoice_id: FAKTURA }, KLUCZ);
  assert.equal(w.ok, true);
  if (w.ok) assert.equal(w.kto.rodzaj, "user");
});

test("KONTROLA POZYTYWNA: administrator przechodzi do cudzej faktury", async () => {
  const w = await sprawdzDostepKsef(zadanie("Bearer jwt"), klient(ADMIN), { invoice_id: FAKTURA }, KLUCZ);
  assert.equal(w.ok, true);
  if (w.ok) assert.equal(w.kto.rodzaj, "admin");
});

test("SEDNO: bez tokenu nie da się nic — to była cała dziura", async () => {
  const w = await sprawdzDostepKsef(zadanie(null), klient(null), { invoice_id: FAKTURA }, KLUCZ);
  assert.equal(w.ok, false);
  if (!w.ok) assert.equal(w.odp.status, 401);
});

test("SEDNO: obcy nie wyśle cudzej faktury do KSeF", async () => {
  const w = await sprawdzDostepKsef(zadanie("Bearer jwt"), klient(OBCY), { invoice_id: FAKTURA }, KLUCZ);
  assert.equal(w.ok, false);
  if (!w.ok) assert.equal(w.odp.status, 403);
});

test("SEDNO: obcy nie nadpisze cudzych ustawień KSeF", async () => {
  const w = await sprawdzDostepKsef(zadanie("Bearer jwt"), klient(OBCY), { entity_id: ENCJA }, KLUCZ);
  assert.equal(w.ok, false);
  if (!w.ok) assert.equal(w.odp.status, 403);
});

test("zły token to odmowa, nie przepuszczenie", async () => {
  const w = await sprawdzDostepKsef(zadanie("Bearer cokolwiek"), klient(null), {}, KLUCZ);
  assert.equal(w.ok, false);
  if (!w.ok) assert.equal(w.odp.status, 401);
});

test("brak sekretu serwisowego NIE otwiera kanału wewnętrznego", async () => {
  // Pusty `serviceKey` (nieustawiony sekret) nie może sprawiać, że pusty
  // albo dowolny token przechodzi jako wywołanie wewnętrzne.
  const w = await sprawdzDostepKsef(zadanie("Bearer "), klient(null), {}, "");
  assert.equal(w.ok, false);
});

test("działanie bez zasobu wymaga zalogowania, ale nie właścicielstwa", async () => {
  // `test_connection` podaje NIP i token we WŁASNYM ciele — nie sięga po cudze.
  const w = await sprawdzDostepKsef(zadanie("Bearer jwt"), klient(OBCY), { nip: "123", token: "t" }, KLUCZ);
  assert.equal(w.ok, true);
});

test("odmowa nie zdradza, czy dokument istnieje", async () => {
  // Ta sama odpowiedź dla „nie ma takiej faktury" i „nie twoja" — inaczej
  // różnica mówiłaby, które identyfikatory są prawdziwe.
  const pusty = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: OBCY } }, error: null }) },
    from: (t: string) => t === "user_roles"
      ? { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }
      : { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) },
  } as any;
  const nieistniejaca = await sprawdzDostepKsef(zadanie("Bearer jwt"), pusty, { invoice_id: FAKTURA }, KLUCZ);
  const cudza = await sprawdzDostepKsef(zadanie("Bearer jwt"), klient(OBCY), { invoice_id: FAKTURA }, KLUCZ);
  assert.equal(nieistniejaca.ok, false);
  assert.equal(cudza.ok, false);
  if (!nieistniejaca.ok && !cudza.ok) {
    assert.equal(nieistniejaca.odp.status, cudza.odp.status);
  }
});
