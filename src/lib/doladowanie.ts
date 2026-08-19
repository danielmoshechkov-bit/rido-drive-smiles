import { supabase } from '@/integrations/supabase/client';

/**
 * Czuwanie nad doładowaniem: od kliknięcia „Zapłać" do chwili, gdy paczka
 * naprawdę leży na koncie.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO TO ISTNIEJE
 * ═══════════════════════════════════════════════════════════════════════════
 * Wymaganie brzmi: po zakupie stan pokazuje się NATYCHMIAST. Samo unieważnienie
 * licznika po powrocie z bramki tego nie załatwia, bo PayU odsyła klienta
 * NIEZALEŻNIE od tego, czy jego powiadomienie zdążyło już dojść do nas.
 * Jeden odczyt trafiony sekundę za wcześnie pokazuje starą liczbę — i nic już
 * nie próbuje ponownie. To najczęstsza postać „kupiłem, a nie widać".
 *
 * Dlatego nie zgadujemy po liczbie w liczniku (przed zakupem mogła być taka
 * sama), tylko pytamy wprost o ZAMÓWIENIE: `wydane_at` jest ustawiane dopiero
 * wtedy, gdy paczka została wydana. To samo pole chroni przed podwójnym
 * wydaniem, więc jest wiarygodnym znacznikiem „towar na koncie".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DWIE KARTY
 * ═══════════════════════════════════════════════════════════════════════════
 * `DoladowanieModal` otwiera PayU w NOWEJ KARCIE, więc powrót ląduje gdzie
 * indziej niż panel, z którego klient klikał. Karta pierwotna nie przeładowuje
 * się nigdy, a `refetchOnWindowFocus` jest w tym projekcie wyłączony — jej
 * licznik zostaje nieświeży bezterminowo. Stąd rozgłoszenie przez
 * `BroadcastChannel`: karta, która zobaczyła wydanie paczki, mówi o tym
 * pozostałym. Gdy przeglądarka go nie ma, tracimy tylko odświeżenie w drugiej
 * karcie — nic się nie psuje.
 */

const KANAL = 'rido-doladowania';

/** Ile czekamy na powiadomienie od operatora, zanim odezwiemy się do klienta. */
export const LIMIT_POWROTU_MS = 30_000;

/**
 * Karta, która zainicjowała zakup, czeka dłużej: klient płaci w drugiej karcie
 * i może to potrwać. Odpytanie to jeden wiersz co trzy sekundy.
 */
export const LIMIT_KARTY_ZAKUPU_MS = 10 * 60_000;

export type WynikCzuwania =
  | 'wydane'            // paczka na koncie
  | 'oplacone'          // pieniądze przyszły, paczki jeszcze nie wydano
  | 'oczekuje'          // brak potwierdzenia od operatora
  | 'odrzucone'         // płatność anulowana albo odrzucona
  | 'brak';             // nie znaleźliśmy zamówienia

type Zamowienie = { id: string; status: string; wydane_at: string | null };

/** Rozgłoszenie do pozostałych kart tej samej przeglądarki. */
export function rozglosDoladowanie() {
  try {
    const kanal = new BroadcastChannel(KANAL);
    kanal.postMessage('wydane');
    kanal.close();
  } catch { /* przeglądarka bez BroadcastChannel — pomijamy */ }
}

/** Nasłuch rozgłoszeń. Zwraca funkcję odpinającą. */
export function nasluchujDoladowan(gdyWydane: () => void): () => void {
  try {
    const kanal = new BroadcastChannel(KANAL);
    kanal.onmessage = () => gdyWydane();
    return () => kanal.close();
  } catch {
    return () => {};
  }
}

const spij = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Zamówienie po identyfikatorze, a gdy go nie znamy — najnowsze własne z ostatniej
 * godziny. Karta powrotna nie dostaje identyfikatora w adresie (`continueUrl`
 * jest stały), więc musi je odnaleźć sama. Widoczność ogranicza RLS: klient
 * widzi wyłącznie swoje zamówienia.
 */
async function pobierzZamowienie(orderId?: string | null): Promise<Zamowienie | null> {
  // `as any`: `billing_orders` nie ma jeszcze wiersza w wygenerowanych typach
  // (`integrations/supabase/types.ts` odświeża Lovable). Ta sama obejście, co
  // przy `viewing_requests` i pozostałych młodszych tabelach.
  const zapytanie = (supabase as any)
    .from('billing_orders')
    .select('id, status, wydane_at');

  const { data } = orderId
    ? await zapytanie.eq('id', orderId).maybeSingle()
    : await zapytanie
        .gte('created_at', new Date(Date.now() - 60 * 60_000).toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

  return (data as Zamowienie | null) ?? null;
}

/**
 * Czeka, aż zamówienie zostanie WYDANE. Kończy wcześniej, gdy operator odmówi.
 *
 * `gdyWydane` wołamy dokładnie raz i tylko przy realnym wydaniu — to miejsce,
 * w którym interfejs ma unieważnić liczniki.
 */
export async function czekajNaWydanie({
  orderId,
  limitMs,
  krokMs = 3_000,
  gdyWydane,
}: {
  orderId?: string | null;
  limitMs: number;
  krokMs?: number;
  gdyWydane: () => void;
}): Promise<WynikCzuwania> {
  const koniec = Date.now() + limitMs;
  let ostatni: Zamowienie | null = null;

  // Pierwsze pytanie od razu: powiadomienie mogło dojść jeszcze przed powrotem
  // klienta i wtedy nie ma na co czekać.
  for (;;) {
    ostatni = await pobierzZamowienie(orderId);

    if (ostatni?.wydane_at) {
      gdyWydane();
      rozglosDoladowanie();
      return 'wydane';
    }
    if (ostatni && (ostatni.status === 'anulowane' || ostatni.status === 'odrzucone')) {
      return 'odrzucone';
    }
    if (Date.now() + krokMs > koniec) break;
    await spij(krokMs);
  }

  if (!ostatni) return 'brak';
  return ostatni.status === 'oplacone' ? 'oplacone' : 'oczekuje';
}
