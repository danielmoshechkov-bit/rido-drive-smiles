import test from "node:test";
import assert from "node:assert/strict";
import {
  czyDuplikat,
  mapujStatus,
  okresSubskrypcji,
  sprawdzPodpis,
  wynikBrakuWiersza,
  gwarancjaCeny,
  kwotyZFaktury,
} from "./stripeWebhook.ts";

// ============================================================================
// Harness offline dla webhooka Stripe (podetap 4.6c).
//
// Powstał po tym, jak DWA błędy tej funkcji wyszły dopiero na produkcji:
// parsowanie nagłówka z wieloma podpisami i okres rozliczeniowy, który
// przeniósł się na pozycje subskrypcji. Oba to czyste funkcje danych — każdy
// z tych testów wykonuje się w milisekundy i złapałby je przed wdrożeniem.
//
// Zero sieci, zero bazy, zero sekretów w repo: podpisy liczone są w locie
// z testowego sekretu tym samym algorytmem co u operatora.
// ============================================================================

const SEKRET = "whsec_testowy_sekret_do_harnessu";
const SEKRET_STARY = "whsec_poprzedni_sekret_z_rotacji";

/** Ten sam algorytm co Stripe: HMAC-SHA256 po `${t}.${body}`, hex. */
async function podpisz(cialo: Uint8Array, t: number, sekret: string): Promise<string> {
  const klucz = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sekret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const prefiks = new TextEncoder().encode(`${t}.`);
  const ladunek = new Uint8Array(prefiks.length + cialo.length);
  ladunek.set(prefiks, 0);
  ladunek.set(cialo, prefiks.length);
  const podpis = await crypto.subtle.sign("HMAC", klucz, ladunek);
  return Array.from(new Uint8Array(podpis))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const cialoTestowe = (obiekt: unknown = { id: "evt_1", type: "invoice.paid" }) =>
  new TextEncoder().encode(JSON.stringify(obiekt));

const TERAZ = 1_770_000_000_000; // stały punkt w czasie — testy nie zależą od zegara
const T = Math.floor(TERAZ / 1000);

// ---------------------------------------------------------------- PODPIS

test("poprawny podpis przechodzi", async () => {
  const cialo = cialoTestowe();
  const naglowek = `t=${T},v1=${await podpisz(cialo, T, SEKRET)}`;
  const w = await sprawdzPodpis(cialo, naglowek, SEKRET, TERAZ);
  assert.equal(w.ok, true, w.powod);
});

test("PRZYPADEK 1: nagłówek z wieloma v1 — pasuje PIERWSZY, nie ostatni", async () => {
  // Dokładnie ten błąd wywalił produkcję 13.08: parser zostawiał ostatni podpis.
  const cialo = cialoTestowe();
  const dobry = await podpisz(cialo, T, SEKRET);
  const naglowek = `t=${T},v1=${dobry},v1=${"f".repeat(64)}`;
  const w = await sprawdzPodpis(cialo, naglowek, SEKRET, TERAZ);
  assert.equal(w.ok, true, "podpis na pierwszej pozycji musi być sprawdzony");
  assert.equal(w.diag.podpisow_v1, 2);
});

test("PRZYPADEK 2: rotacja sekretu — stary i nowy podpis obok siebie", async () => {
  const cialo = cialoTestowe();
  const stary = await podpisz(cialo, T, SEKRET_STARY);
  const nowy = await podpisz(cialo, T, SEKRET);
  const naglowek = `t=${T},v1=${stary},v1=${nowy}`;

  // Endpoint skonfigurowany na NOWY sekret akceptuje nagłówek z obydwoma.
  assert.equal((await sprawdzPodpis(cialo, naglowek, SEKRET, TERAZ)).ok, true);
  // I odwrotnie — dopóki stary sekret jest jeszcze ważny.
  assert.equal((await sprawdzPodpis(cialo, naglowek, SEKRET_STARY, TERAZ)).ok, true);
});

test("PRZYPADEK 3: sekret z białymi znakami z wklejania", async () => {
  const cialo = cialoTestowe();
  const naglowek = `t=${T},v1=${await podpisz(cialo, T, SEKRET)}`;

  for (const brudny of [`${SEKRET}\n`, ` ${SEKRET}`, `${SEKRET}\r\n`, `  ${SEKRET}  `]) {
    const w = await sprawdzPodpis(cialo, naglowek, brudny, TERAZ);
    assert.equal(w.ok, true, `sekret "${JSON.stringify(brudny)}" powinien przejść po przycięciu`);
    assert.equal(w.diag.sekret_przyciety, true, "diagnostyka ma odnotować przycięcie");
  }
});

test("zły sekret odrzucony, a diagnostyka nie zdradza jego treści", async () => {
  const cialo = cialoTestowe();
  const naglowek = `t=${T},v1=${await podpisz(cialo, T, SEKRET)}`;
  const w = await sprawdzPodpis(cialo, naglowek, "whsec_zupelnie_inny_sekret", TERAZ);
  assert.equal(w.ok, false);
  assert.equal(w.powod, "żaden podpis v1 nie pasuje");
  assert.equal(String(w.diag.sekret_prefiks).length, 8, "do logu idzie osiem znaków, nie cały sekret");
});

test("PRZYPADEK 8: znacznik czasu poza tolerancją — odtworzenie starego żądania", async () => {
  const cialo = cialoTestowe();
  const stareT = T - 3600;
  const naglowek = `t=${stareT},v1=${await podpisz(cialo, stareT, SEKRET)}`;
  const w = await sprawdzPodpis(cialo, naglowek, SEKRET, TERAZ);
  assert.equal(w.ok, false, "poprawny podpis sprzed godziny nie wystarcza");
  assert.match(String(w.powod), /tolerancj/);
});

test("PRZYPADEK 9: brak nagłówka stripe-signature", async () => {
  const w = await sprawdzPodpis(cialoTestowe(), "", SEKRET, TERAZ);
  assert.equal(w.ok, false);
  assert.equal(w.diag.naglowek_obecny, false);
});

test("nagłówek bez t albo bez v1 jest odrzucany", async () => {
  const cialo = cialoTestowe();
  assert.equal((await sprawdzPodpis(cialo, `v1=${"a".repeat(64)}`, SEKRET, TERAZ)).ok, false);
  assert.equal((await sprawdzPodpis(cialo, `t=${T}`, SEKRET, TERAZ)).ok, false);
});

test("zmiana jednego bajtu ciała unieważnia podpis", async () => {
  const cialo = cialoTestowe();
  const naglowek = `t=${T},v1=${await podpisz(cialo, T, SEKRET)}`;
  const podmienione = cialoTestowe({ id: "evt_1", type: "invoice.paid", x: 1 });
  assert.equal((await sprawdzPodpis(podmienione, naglowek, SEKRET, TERAZ)).ok, false);
});

// ------------------------------------------------------- OKRES ROZLICZENIOWY

test("PRZYPADEK 4a: okres na POZYCJACH subskrypcji (API 2026-06-24.dahlia)", () => {
  const sub = {
    id: "sub_1",
    items: { data: [{ current_period_start: 1_760_000_000, current_period_end: 1_762_678_400 }] },
  };
  const o = okresSubskrypcji(sub);
  assert.equal(o.start, new Date(1_760_000_000 * 1000).toISOString());
  assert.equal(o.end, new Date(1_762_678_400 * 1000).toISOString());
});

test("PRZYPADEK 4b: okres na poziomie subskrypcji (starsza wersja API)", () => {
  const sub = { id: "sub_1", current_period_start: 1_760_000_000, current_period_end: 1_762_678_400 };
  const o = okresSubskrypcji(sub);
  assert.equal(o.start, new Date(1_760_000_000 * 1000).toISOString());
  assert.equal(o.end, new Date(1_762_678_400 * 1000).toISOString());
});

test("PRZYPADEK 4c: pozycje mają pierwszeństwo przed polami subskrypcji", () => {
  const sub = {
    current_period_start: 1_700_000_000,
    current_period_end: 1_700_100_000,
    items: { data: [{ current_period_start: 1_760_000_000, current_period_end: 1_762_678_400 }] },
  };
  assert.equal(okresSubskrypcji(sub).start, new Date(1_760_000_000 * 1000).toISOString());
});

test("PRZYPADEK 4d: brak okresu w obu miejscach daje null, nie wyjątek", () => {
  // Null jest sygnałem dla wywołującego, żeby POMINĄĆ pole w zapisie —
  // kolumna current_period_start ma DEFAULT now() i nie przyjmie NULL-a.
  assert.deepEqual(okresSubskrypcji({ id: "sub_1" }), { start: null, end: null });
  assert.deepEqual(okresSubskrypcji({ items: { data: [] } }), { start: null, end: null });
  assert.deepEqual(okresSubskrypcji(null), { start: null, end: null });
});

// ------------------------------------------------------- MAPOWANIE STATUSÓW

test("PRZYPADEK 5: mapowanie statusów operatora na nasze", () => {
  assert.equal(mapujStatus("trialing"), "trialing");
  assert.equal(mapujStatus("active"), "active");
  assert.equal(mapujStatus("past_due"), "past_due");
  assert.equal(mapujStatus("canceled"), "canceled");
  assert.equal(mapujStatus("incomplete_expired"), "canceled");
  assert.equal(mapujStatus("unpaid"), "canceled");
  // Nieznany status NIE może dawać `active` — brak wiedzy nie jest dostępem.
  assert.equal(mapujStatus("incomplete"), "past_due");
  assert.equal(mapujStatus("cos_nowego_u_operatora"), "past_due");
});

// ------------------------------------------------------------ IDEMPOTENCJA

test("PRZYPADEK 6: powtórna dostawa domkniętego zdarzenia jest odbijana", () => {
  assert.equal(czyDuplikat("processed"), true);
  assert.equal(czyDuplikat("ignored"), true);
});

test("PRZYPADEK 10: ponowienie zdarzenia NIEUDANEGO ma być przetworzone", () => {
  // To była poprawka wprowadzona bez pokrycia testem. Gdyby `failed` liczyło się
  // jako duplikat, pierwszy chwilowy błąd sieci przepadłby na zawsze: operator
  // ponawia, trafia na konflikt i odchodzi z sukcesem.
  assert.equal(czyDuplikat("failed"), false);
  assert.equal(czyDuplikat("pending"), false);
  assert.equal(czyDuplikat(null), false);
  assert.equal(czyDuplikat(undefined), false);
});

// -------------------------------------------------- UPDATE BEZ TRAFIENIA

test("PRZYPADEK 7: zero trafionych wierszy przy zdarzeniu pieniężnym to failed", () => {
  assert.equal(wynikBrakuWiersza("invoice.paid"), "failed");
  assert.equal(wynikBrakuWiersza("invoice.payment_failed"), "failed");
});

test("PRZYPADEK 7b: zero trafionych wierszy przy cyklu życia to ignored", () => {
  // Przy anulowaniu subskrypcji, której nie mamy, nie ma czego naprawiać.
  assert.equal(wynikBrakuWiersza("customer.subscription.deleted"), "ignored");
  assert.equal(wynikBrakuWiersza("customer.subscription.updated"), "ignored");
});


// ============================================================================
// 4.6b — odtworzenie subskrypcji z `invoice.paid`
//
// Gdy `checkout.session.completed` przepadnie, klient płaci co miesiąc, a u nas
// nie istnieje. Odtworzenie jest wykonalne, bo metadane subskrypcji są pełne —
// ale dwie rzeczy trzeba przy tym zrobić dobrze, i to sprawdzają te testy.
// ============================================================================

test("gwarancja ceny liczy się od założenia subskrypcji, nie od dziś", () => {
  const zalozona = new Date("2026-03-15T10:00:00.000Z");
  assert.equal(gwarancjaCeny(zalozona, null), "2027-03-15T10:00:00.000Z");
});

test("odzysk nie wydłuża gwarancji względem zwykłego zakupu", () => {
  // Ten sam moment zakupu ma dać tę samą datę końca gwarancji niezależnie od
  // tego, KIEDY powstał wiersz. Inaczej nasza awaria byłaby nagrodą dla
  // jednego klienta i krzywdą dla drugiego.
  const zalozona = new Date("2026-03-15T10:00:00.000Z");
  assert.equal(gwarancjaCeny(zalozona, null), gwarancjaCeny(new Date(zalozona), null));
});

test("zakup po końcu promocji nie daje gwarancji", () => {
  assert.equal(gwarancjaCeny(new Date("2026-07-01T00:00:00.000Z"), "2026-06-30T23:59:59.000Z"), null);
});

test("zakup w ostatniej chwili promocji gwarancję daje", () => {
  assert.equal(
    gwarancjaCeny(new Date("2026-06-30T23:59:58.000Z"), "2026-06-30T23:59:59.000Z"),
    "2027-06-30T23:59:58.000Z",
  );
});

test("kwoty biorą się z pozycji faktury, nie z bieżącego cennika", () => {
  // 121,77 zł brutto to kwota z prawdziwej płatności testowej.
  const w = kwotyZFaktury({ lines: { data: [{ amount: 12177 }] }, amount_paid: 99999 }, 23);
  assert.equal(w.brutto, 121.77);
  assert.equal(w.netto, 99.00);
  assert.equal(w.zrodlo, "pozycja_faktury");
});

test("bez pozycji schodzimy do amount_paid i zapisujemy, skąd kwota", () => {
  const w = kwotyZFaktury({ amount_paid: 12177 }, 23);
  assert.equal(w.brutto, 121.77);
  assert.equal(w.zrodlo, "amount_paid");
});

test("brak kwoty nie zmyśla zera", () => {
  // Zero w snapshocie znaczyłoby „klient zapłacił 0 zł" i przy sporze
  // działałoby przeciwko nam. Brak danych ma zostać brakiem danych.
  const w = kwotyZFaktury(null, 23);
  assert.equal(w.brutto, null);
  assert.equal(w.netto, null);
  assert.equal(w.zrodlo, "brak");
});

test("stawka 0% nie zmienia kwoty i nie dzieli przez zero", () => {
  const w = kwotyZFaktury({ lines: { data: [{ amount: 10000 }] } }, 0);
  assert.equal(w.brutto, 100);
  assert.equal(w.netto, 100);
});
