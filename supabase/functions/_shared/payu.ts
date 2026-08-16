/**
 * PayU — części czyste, testowalne bez sieci i bez sekretów.
 *
 * Podział zadań w billingu: **Stripe obsługuje subskrypcje, PayU jednorazówki.**
 * PayU nie ma w Polsce wygodnego modelu subskrypcyjnego, a Stripe nie obsługuje
 * BLIK-a — czyli sposobu, w jaki warsztat najchętniej zapłaci za pakiet SMS-ów.
 *
 * Ten plik NIE zawiera ani jednego sekretu. Klucze idą wyłącznie przez
 * `Deno.env` i sekrety Supabase.
 */
import { createHash } from 'node:crypto';

export const PAYU_SANDBOX = 'https://secure.snd.payu.com';
export const PAYU_PRODUKCJA = 'https://secure.payu.com';

/** Statusy zamówienia u operatora, mapowane na nasze. */
export type StatusZamowienia = 'nowe' | 'oczekuje' | 'oplacone' | 'anulowane' | 'odrzucone';

/**
 * Mapowanie statusów PayU.
 *
 * `WAITING_FOR_CONFIRMATION` to stan, w którym pieniądze są zablokowane, ale
 * jeszcze nie nasze — traktujemy go jak oczekiwanie, NIE jak zapłatę. Wydanie
 * pakietu na tym etapie oznaczałoby oddanie towaru przed zapłatą.
 */
export function mapujStatusPayu(status: string): StatusZamowienia {
  switch ((status || '').toUpperCase()) {
    case 'COMPLETED': return 'oplacone';
    case 'CANCELED': return 'anulowane';
    case 'REJECTED': return 'odrzucone';
    case 'PENDING':
    case 'WAITING_FOR_CONFIRMATION':
      return 'oczekuje';
    case 'NEW': return 'nowe';
    // Nieznany status nie może znaczyć „zapłacone".
    default: return 'oczekuje';
  }
}

export interface NaglowekPodpisu {
  algorithm: string;
  signature: string;
  sender?: string;
  content?: string;
}

/**
 * Rozbiór nagłówka `OpenPayu-Signature`.
 *
 * Format: `sender=checkout;algorithm=MD5;signature=<hex>;content=DOCUMENT`.
 * Kolejność pól nie jest gwarantowana, więc nie parsujemy pozycyjnie.
 */
export function rozbierzNaglowek(naglowek: string | null): NaglowekPodpisu | null {
  if (!naglowek) return null;
  const pola: Record<string, string> = {};
  for (const czesc of naglowek.split(';')) {
    const i = czesc.indexOf('=');
    if (i <= 0) continue;
    pola[czesc.slice(0, i).trim().toLowerCase()] = czesc.slice(i + 1).trim();
  }
  if (!pola.signature || !pola.algorithm) return null;
  return {
    algorithm: pola.algorithm.toUpperCase(),
    signature: pola.signature.toLowerCase(),
    sender: pola.sender,
    content: pola.content,
  };
}

export interface WynikPodpisu {
  ok: boolean;
  powod?: string;
}

/**
 * Weryfikacja podpisu powiadomienia.
 *
 * PayU liczy skrót z **surowej treści żądania sklejonej z drugim kluczem**
 * (MD5 z konfiguracji punktu płatności). Dlatego treść musi być tą samą
 * sekwencją bajtów, którą przysłał operator — bez parsowania i ponownego
 * serializowania, bo `JSON.stringify` zmienia białe znaki i kolejność.
 *
 * Fail-closed: brak nagłówka, brak klucza, nieznany algorytm i niezgodny skrót
 * dają odmowę. Nie ma ścieżki, w której brak wiedzy przepuszcza.
 */
export function sprawdzPodpisPayu(
  surowaTresc: string,
  naglowek: string | null,
  drugiKlucz: string,
): WynikPodpisu {
  if (!drugiKlucz || !drugiKlucz.trim()) {
    return { ok: false, powod: 'brak drugiego klucza w konfiguracji' };
  }

  const rozbior = rozbierzNaglowek(naglowek);
  if (!rozbior) return { ok: false, powod: 'brak albo nieczytelny nagłówek OpenPayu-Signature' };

  let algorytm: string;
  switch (rozbior.algorithm) {
    case 'MD5': algorytm = 'md5'; break;
    case 'SHA-256':
    case 'SHA256': algorytm = 'sha256'; break;
    case 'SHA-1':
    case 'SHA1': algorytm = 'sha1'; break;
    default:
      return { ok: false, powod: `nieobsługiwany algorytm ${rozbior.algorithm}` };
  }

  const oczekiwany = createHash(algorytm)
    .update(surowaTresc + drugiKlucz.trim(), 'utf8')
    .digest('hex')
    .toLowerCase();

  if (oczekiwany !== rozbior.signature) {
    return { ok: false, powod: 'skrót się nie zgadza' };
  }
  return { ok: true };
}

/**
 * Złotówki → grosze.
 *
 * PayU przyjmuje kwoty w najmniejszej jednostce. Mnożenie zmiennoprzecinkowe
 * bez zaokrąglenia daje 12176.999999999998 dla 121,77 zł, a `Math.trunc`
 * zamieniłby to na 12176 — czyli grosz mniej, niż klient ma zapłacić.
 */
export function naGrosze(kwotaPln: number): number {
  if (!Number.isFinite(kwotaPln) || kwotaPln < 0) {
    throw new Error(`naGrosze: nieprawidłowa kwota ${kwotaPln}`);
  }
  return Math.round(kwotaPln * 100);
}

/** Grosze → złotówki, do zapisu i pokazania. */
export function zGroszy(grosze: number): number {
  return Math.round(grosze) / 100;
}

/**
 * Adres IP kupującego — PayU wymaga go przy zakładaniu zamówienia.
 *
 * `x-forwarded-for` bywa listą („klient, proxy1, proxy2"); interesuje nas
 * pierwszy wpis. Gdy nagłówka nie ma, dajemy adres pętli zwrotnej zamiast
 * pustego pola — PayU odrzuca zamówienie bez `customerIp`, a brak adresu nie
 * jest powodem, żeby klient nie mógł zapłacić.
 */
export function ipKupujacego(naglowki: Headers): string {
  const xff = naglowki.get('x-forwarded-for') ?? '';
  const pierwszy = xff.split(',')[0]?.trim();
  if (pierwszy) return pierwszy;
  return naglowki.get('cf-connecting-ip')?.trim() || '127.0.0.1';
}

// ---------------------------------------------------------------------------
// Rozmowa z operatorem
// ---------------------------------------------------------------------------

/** Token dostępu OAuth. PayU wymaga go przy każdej operacji na zamówieniu. */
export async function tokenPayu(
  baza: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await fetch(`${baza}/pl/standard/user/oauth/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const dane = await res.json().catch(() => ({}));
  if (!res.ok || !dane?.access_token) {
    throw new Error(`PayU OAuth ${res.status}: ${dane?.error_description ?? dane?.error ?? 'brak tokenu'}`);
  }
  return dane.access_token as string;
}

/**
 * Potwierdzenie odbioru środków (capture).
 *
 * 🔴 POWÓD (17.08.2026, znalezione w teście sandboxa): przy WYŁĄCZONYM
 * automatycznym odbiorze w punkcie płatności PayU zatrzymuje zamówienie na
 * `WAITING_FOR_CONFIRMATION` i **czeka, aż sprzedawca sam potwierdzi**.
 * Z własnej inicjatywy `COMPLETED` nie przyśle. My tego kroku nie robiliśmy,
 * więc zamówienie stało w nieskończoność: klient zapłacił, operator potwierdził,
 * a pakiet nie został wydany.
 *
 * Potwierdzamy z naszej strony zamiast polegać na ustawieniu w panelu —
 * ustawienie da się przestawić przy zakładaniu punktu produkcyjnego i ten sam
 * błąd wróciłby z prawdziwymi pieniędzmi.
 *
 * Po potwierdzeniu PayU przysyła osobne powiadomienie ze statusem `COMPLETED`
 * i dopiero ono wydaje pakiet. Tu niczego nie wydajemy — pieniądze są nasze
 * dopiero po tym potwierdzeniu.
 */
export async function potwierdzOdbior(
  baza: string,
  token: string,
  orderId: string,
): Promise<{ ok: boolean; powod?: string }> {
  const res = await fetch(`${baza}/api/v2_1/orders/${orderId}/status`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ orderId, orderStatus: 'COMPLETED' }),
  });

  const dane = await res.json().catch(() => ({}));
  const kod = dane?.status?.statusCode;

  // `SUCCESS` przy pierwszym potwierdzeniu. Powtórne potwierdzenie tego samego
  // zamówienia zwraca błąd „zły stan" — i to NIE jest usterka, tylko dowód,
  // że zamówienie zostało już potwierdzone wcześniej.
  if (res.ok && (kod === 'SUCCESS' || kod === undefined)) return { ok: true };
  if (kod === 'ERROR_ORDER_NOT_UNIQUE' || kod === 'ERROR_VALUE_INVALID') {
    return { ok: true, powod: `już potwierdzone (${kod})` };
  }
  return { ok: false, powod: `${res.status} ${kod ?? ''} ${dane?.status?.statusDesc ?? ''}`.trim() };
}
