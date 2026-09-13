/**
 * WSPÓLNY SŁOWNIK ZDARZEŃ — JEDNA LISTA, WIELU ODBIORCÓW.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO
 * ═══════════════════════════════════════════════════════════════════════════
 * Meta i Google nazywają te same rzeczy inaczej (`CompleteRegistration` kontra
 * `sign_up`, `Purchase` kontra `purchase`). Gdyby każde narzędzie wpinać
 * osobno, za trzy miesiące GA4 pokazałby 40 rejestracji, Meta 52 i nikt nie
 * ustaliłby, które jest prawdą.
 *
 * **Rozjazd nazw jest nienaprawialny wstecz** — dane już zebrane zostają
 * rozjechane. Dlatego słownik powstaje razem z drugim odbiorcą, nie po nim.
 *
 * Kolejność wywołania też musi być jedna: zdarzenie opisuje SKUTEK, nie zamiar.
 * `sign_up` po założeniu konta, nie po wysłaniu formularza.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARTOŚCI PRZY ZDARZENIACH BEZ OCZYWISTEJ KWOTY
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 `Lead` bez wartości znaczy dla algorytmu „wszystkie leady równe" — a wtedy
 * optymalizacja kampanii goni najtańsze zgłoszenia, nie najlepsze. Szacunek
 * jest lepszy niż zero.
 *
 * ⚠️ LICZBY PONIŻEJ TO SZACUNEK Z 13.09.2026, NIE POMIAR. Nie mamy jeszcze
 * danych, ilu rejestrujących się kupuje. **DO PRZELICZENIA PO PIERWSZYCH STU
 * REJESTRACJACH** — dopóki tu stoi ten komentarz, nikt nie ma prawa brać tych
 * kwot za zmierzone.
 *
 * Kroki lejka mają wartość ZERO świadomie: mierzymy je, żeby zobaczyć, gdzie
 * ludzie odpadają, a nie żeby licytować. Wartość przy kroku zaburzyłaby
 * optymalizację, bo algorytm zacząłby kupować porzucenia.
 */

import { czyWolno, subskrybujZgode } from "@/lib/zgody";
import { czyProdukcja } from "@/lib/srodowisko";
import { normalizujEmail, normalizujTelefon } from "@/lib/daneUzytkownikaDoReklam";
import { nowyIdZdarzenia, sledzZdarzenie as doMety, type ZdarzenieMeta } from "@/lib/pikselMeta";

/** Identyfikator pomiaru GA4. Pusty = GA4 wyłączone i nic się nie ładuje. */
export const ID_GA4 = "G-TKX3R49RBY";

/** Nazwy zdarzeń tak, jak MY o nich mówimy. Jedyna lista. */
export type Zdarzenie =
  | "rejestracja"
  | "rejestracja_krok"
  | "kontakt"
  | "start_zakupu"
  | "zakup";

interface Opis {
  meta: ZdarzenieMeta | null;
  ga4: string;
  /** Szacunkowa wartość w PLN, gdy zdarzenie nie niesie własnej kwoty. */
  wartoscDomyslna: number | null;
}

export const SLOWNIK: Record<Zdarzenie, Opis> = {
  // 20 zł = wartość konta × obserwowany odsetek rejestracji, które kupują.
  // SZACUNEK — do przeliczenia po pierwszych stu rejestracjach.
  rejestracja: { meta: "CompleteRegistration", ga4: "sign_up", wartoscDomyslna: 20 },

  // Kroki lejka: zero, i to jest decyzja — patrz nagłówek. Do Mety nie idą
  // wcale, bo Meta nie ma dla nich zdarzenia standardowego, a własne
  // zaśmieciłoby konto reklamowe bez pożytku.
  rejestracja_krok: { meta: null, ga4: "rejestracja_krok", wartoscDomyslna: 0 },

  // 60 zł — kontakt jest bliżej zakupu niż rejestracja. SZACUNEK.
  kontakt: { meta: "Lead", ga4: "generate_lead", wartoscDomyslna: 60 },

  // Kwota koszyka jest znana, więc nic nie zgadujemy.
  start_zakupu: { meta: "InitiateCheckout", ga4: "begin_checkout", wartoscDomyslna: null },
  zakup: { meta: "Purchase", ga4: "purchase", wartoscDomyslna: null },
};

export interface DaneZdarzenia {
  /** Kwota. Gdy brak, wchodzi `wartoscDomyslna` ze słownika. */
  value?: number;
  currency?: string;
  /** Co dokładnie — nazwa planu, pakietu, kroku. */
  nazwa?: string;
  /** Identyfikatory pozycji (np. numer zamówienia). */
  identyfikatory?: string[];
}

// ---------------------------------------------------------------------------
// GOOGLE ANALYTICS 4
// ---------------------------------------------------------------------------

let ga4Zaladowany = false;

/**
 * Wstawienie `gtag.js` — wyłącznie po zgodzie analitycznej.
 *
 * `gtag` i sygnał `consent default: denied` stoją już w `index.html`; tutaj
 * dokładamy dopiero SKRYPT. Kolejność jest istotna: gdyby skrypt wszedł przed
 * sygnałem, pierwszy strzał poleciałby bez zgody.
 */
function wstawGa4(): void {
  if (ga4Zaladowany || !ID_GA4) return;
  // Jak przy pikselu: poza produkcją nic nie leci.
  if (!czyProdukcja()) return;
  if (!czyWolno("analityczne")) return;

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${ID_GA4}`;
  document.head.appendChild(s);

  gtag("js", new Date());
  gtag("config", ID_GA4, {
    // Odsłony wysyłamy sami przy zmianie trasy — aplikacja jednostronicowa.
    send_page_view: false,
  });
  ga4Zaladowany = true;
}

function gtag(...args: unknown[]): void {
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer ?? [];
  w.dataLayer.push(args);
}

/** Podpięcie pod zmiany zgody. Wołane raz, przy montowaniu. */
export function pilnujZgodyAnalityki(): () => void {
  wstawGa4();
  return subskrybujZgode(() => wstawGa4());
}

/**
 * KONWERSJE ROZSZERZONE — dane kupującego dla Google.
 *
 * Google haszuje je SAM, po stronie przeglądarki: adres jawny nie opuszcza
 * urządzenia. My tylko normalizujemy (małe litery, obcięte spacje, kropki
 * z Gmaila) — bo `gtag` zrobi to poprawnie, ale ta sama funkcja pojedzie
 * potem do Conversions API, gdzie nikt tego za nas nie poprawi.
 *
 * Bramka to zgoda MARKETINGOWA, bo z niej wynika `ad_user_data` — a bez
 * `ad_user_data` konwersje rozszerzone nie działają w EOG.
 *
 * Wywoływać PRZED zdarzeniem konwersji. U nas dzieje się to przy zalogowaniu,
 * czyli długo wcześniej niż zakup.
 */
export function ustawDaneKupujacego(email?: string | null, telefon?: string | null): void {
  if (!ga4Zaladowany || !czyWolno("marketingowe")) return;

  const dane: Record<string, string> = {};
  const e = normalizujEmail(email);
  const t = normalizujTelefon(telefon);
  if (e) dane.email = e;
  if (t) dane.phone_number = t;

  // Pusty obiekt tylko nadpisałby wcześniejsze dane pustką.
  if (Object.keys(dane).length === 0) return;
  gtag("set", "user_data", dane);
}

/** Odsłona do GA4 — przy zmianie trasy. */
export function odslonaGa4(sciezka: string): void {
  if (!ga4Zaladowany || !czyWolno("analityczne")) return;
  gtag("event", "page_view", { page_path: sciezka });
}

// ---------------------------------------------------------------------------
// JEDNO WYWOŁANIE, DWÓCH ODBIORCÓW
// ---------------------------------------------------------------------------

/**
 * Zgłoszenie zdarzenia do WSZYSTKICH narzędzi naraz.
 *
 * Zwraca `event_id` — ten sam, który poszedł do Mety. Wywołujący, który wysyła
 * też wersję serwerową (Conversions API), ma go użyć, żeby Meta połączyła oba
 * zdarzenia zamiast policzyć konwersję dwa razy.
 *
 * Każdy odbiorca sam sprawdza swoją zgodę: analityka nie otwiera reklam,
 * a zgoda marketingowa nie włącza GA4.
 */
export function zglos(
  zdarzenie: Zdarzenie,
  dane: DaneZdarzenia = {},
  idZdarzenia?: string,
): string {
  const opis = SLOWNIK[zdarzenie];
  const id = idZdarzenia ?? nowyIdZdarzenia();
  const wartosc = dane.value ?? opis.wartoscDomyslna ?? undefined;
  const waluta = dane.currency ?? (wartosc != null ? "PLN" : undefined);

  if (opis.meta) {
    doMety(
      opis.meta,
      {
        ...(wartosc != null ? { value: wartosc, currency: waluta } : {}),
        ...(dane.nazwa ? { content_name: dane.nazwa } : {}),
        ...(dane.identyfikatory ? { content_ids: dane.identyfikatory } : {}),
      },
      id,
    );
  }

  if (ga4Zaladowany && czyWolno("analityczne")) {
    gtag("event", opis.ga4, {
      ...(wartosc != null ? { value: wartosc, currency: waluta } : {}),
      ...(dane.nazwa ? { item_name: dane.nazwa } : {}),
      // Ten sam identyfikator co w Mecie — przy porównywaniu liczb z dwóch
      // narzędzi to jedyny sposób, żeby dopasować konkretne zdarzenie.
      transaction_id: id,
    });
  }

  return id;
}

/** Wyłącznie do testów. */
export function zresetujGa4DoTestow(): void {
  ga4Zaladowany = false;
}
