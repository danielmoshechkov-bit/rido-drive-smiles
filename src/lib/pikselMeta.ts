/**
 * PIKSEL META — JEDNO MIEJSCE, KTÓRE GO ŁADUJE I WYSYŁA ZDARZENIA.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TRZY RZECZY, KTÓRE MUSZĄ BYĆ ZROBIONE OD RAZU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Skrypt nie ładuje się przed zgodą.** W EOG piksel nie może pobrać
 *    `fbevents.js`, ustawić ciasteczka ani wystrzelić zdarzenia, zanim
 *    użytkownik wyrazi zgodę marketingową. Dlatego `<script>` NIE stoi
 *    w `index.html` — wstawiamy go dopiero po zgodzie, stąd.
 *
 * 2. **To jest aplikacja jednostronicowa.** Samo `PageView` przy wczytaniu
 *    pokazałoby wyłącznie wejścia na stronę główną. Zmianę trasy śledzi
 *    `components/PikselMeta.tsx`, który woła `sledzOdslone()`.
 *
 * 3. **`event_id` OD RAZU, nie kiedyś.** Gdy dojdzie Conversions API, Meta
 *    będzie łączyć zdarzenie z przeglądarki i z serwera po parze
 *    `event_name` + `event_id` (okno 48 h). Bez wspólnego identyfikatora każda
 *    konwersja policzy się DWA RAZY — a naprawa po fakcie to przeliczanie
 *    historii od nowa. Dlatego `sledzZdarzenie` zwraca ładunek gotowy do
 *    powtórzenia po stronie serwera i przyjmuje `idZdarzenia` z zewnątrz,
 *    gdy wywołujący sam już go nadał.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CO SIĘ DZIEJE PRZY WYCOFANIU ZGODY W TRAKCIE SESJI
 * ═══════════════════════════════════════════════════════════════════════════
 * Raz wczytanego skryptu nie da się cofnąć z pamięci przeglądarki. Dlatego
 * KAŻDA wysyłka pyta o zgodę na nowo — po wycofaniu nic już nie leci, mimo że
 * `fbevents.js` fizycznie siedzi na stronie. Pełne usunięcie ciasteczek `_fbp`
 * i `_fbc` następuje przy najbliższym przeładowaniu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ŚWIADOMIE POMINIĘTE: `<noscript><img src="facebook.com/tr?...">`
 * ═══════════════════════════════════════════════════════════════════════════
 * Fragment z panelu Meta zawiera obrazek dla przeglądarek bez JavaScriptu.
 * NIE wstawiamy go. Bez JavaScriptu nie działa baner zgód, więc ten obrazek
 * wysłałby odsłonę do Meta u kogoś, kto nie miał jak niczego wybrać — czyli
 * dokładnie to, czego zakazuje EU User Consent Policy. Kilka odsłon mniej
 * kosztuje mniej niż śledzenie bez zgody.
 */

import { czyWolno, subskrybujZgode } from "@/lib/zgody";

export const ID_PIKSELA = "1095723286464143";

/** Zdarzenia standardowe Meta, których używamy. Nie dopisywać „na zapas". */
export type ZdarzenieMeta =
  | "PageView"
  | "CompleteRegistration"
  | "InitiateCheckout"
  | "Purchase"
  | "Lead";

export interface DaneZdarzenia {
  /** Kwota — wymagana przy `Purchase`, inaczej Meta nie policzy przychodu. */
  value?: number;
  currency?: string;
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  [klucz: string]: unknown;
}

/** Ładunek do powtórzenia przez Conversions API — ten sam `event_id`. */
export interface LadunekDlaSerwera {
  event_name: ZdarzenieMeta;
  event_id: string;
  event_time: number;
  event_source_url: string;
  custom_data: DaneZdarzenia;
}

type Fbq = ((...a: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string };
type OknoZPikselem = Window & { fbq?: Fbq; _fbq?: Fbq };

const okno = (): OknoZPikselem => window as unknown as OknoZPikselem;

let zaladowany = false;
let odsloneWyslane = 0;

/** Nowy identyfikator zdarzenia. `crypto.randomUUID` bywa niedostępny po HTTP. */
export function nowyIdZdarzenia(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Wstawienie `fbevents.js`. Wyłącznie stąd i wyłącznie raz.
 *
 * Treść jest odpowiednikiem fragmentu z panelu Meta, przepisanego tak, żeby
 * dało się go wywołać warunkowo — oryginał zakłada, że stoi w `<head>`
 * i wykonuje się zawsze.
 */
function wstawSkrypt(): void {
  const w = okno();
  if (w.fbq) return;

  const kolejka: Fbq = function (...args: unknown[]) {
    // Do czasu wczytania biblioteki zdarzenia idą do kolejki — dokładnie tak
    // robi oryginalny fragment Meta.
    const f = w.fbq as unknown as { callMethod?: (...a: unknown[]) => void; queue: unknown[] };
    if (f.callMethod) f.callMethod(...args);
    else f.queue.push(args);
  } as Fbq;
  kolejka.queue = [];
  kolejka.loaded = true;
  kolejka.version = "2.0";
  w.fbq = kolejka;
  if (!w._fbq) w._fbq = kolejka;

  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
}

/**
 * Uruchomienie piksela, jeśli jest zgoda marketingowa.
 *
 * Wywoływane przy starcie i przy KAŻDEJ zmianie zgody — dlatego musi być
 * bezpieczne przy wielokrotnym wywołaniu.
 */
export function uruchomPiksel(): void {
  if (zaladowany) return;
  if (!czyWolno("marketingowe")) return;

  wstawSkrypt();
  okno().fbq?.("init", ID_PIKSELA);
  zaladowany = true;
  sledzOdslone();
}

/**
 * Podpięcie pod zmiany zgody. Wołane raz, przy montowaniu komponentu.
 * Zwraca funkcję odsubskrybowania.
 */
export function pilnujZgody(): () => void {
  uruchomPiksel();
  return subskrybujZgode(() => uruchomPiksel());
}

/**
 * Zdarzenie do Meta + ładunek gotowy dla Conversions API.
 *
 * Zwraca `null`, gdy nic nie poszło (brak zgody albo piksel niezaładowany) —
 * i to jest sygnał dla wywołującego, żeby NIE wysyłał też wersji serwerowej.
 * CAPI nie omija RODO: serwer ma tę samą zgodę do sprawdzenia.
 */
export function sledzZdarzenie(
  nazwa: ZdarzenieMeta,
  dane: DaneZdarzenia = {},
  idZdarzenia?: string,
): LadunekDlaSerwera | null {
  if (!czyWolno("marketingowe")) return null;
  const w = okno();
  if (!zaladowany || typeof w.fbq !== "function") return null;

  const id = idZdarzenia ?? nowyIdZdarzenia();
  w.fbq("track", nazwa, dane, { eventID: id });

  return {
    event_name: nazwa,
    event_id: id,
    event_time: Math.floor(Date.now() / 1000),
    event_source_url: typeof location !== "undefined" ? location.href : "",
    custom_data: dane,
  };
}

/** Odsłona — przy wczytaniu i przy każdej zmianie trasy. */
export function sledzOdslone(): LadunekDlaSerwera | null {
  const wynik = sledzZdarzenie("PageView");
  if (wynik) odsloneWyslane += 1;
  return wynik;
}

/** Ile odsłon poszło — do testów i do sprawdzenia, że trasa nie dubluje. */
export function licznikOdslon(): number {
  return odsloneWyslane;
}

/** Wyłącznie do testów — nowy przebieg bez pamięci poprzedniego. */
export function zresetujDoTestow(): void {
  zaladowany = false;
  odsloneWyslane = 0;
}
