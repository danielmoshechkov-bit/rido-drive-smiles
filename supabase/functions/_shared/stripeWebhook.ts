// Czysta logika webhooka Stripe — wydzielona z `billing-stripe-webhook/index.ts`,
// żeby dała się przetestować bez sieci, bez bazy i bez operatora.
//
// Powód wydzielenia jest konkretny: dwa błędy wyszły dopiero na produkcji
// (parsowanie nagłówka z wieloma podpisami i okres rozliczeniowy, który przeniósł
// się na pozycje subskrypcji). Oba są czystymi funkcjami danych — testowalnymi
// w milisekundy, gdyby tylko było gdzie je wywołać.
//
// W `index.ts` zostaje wyłącznie orkiestracja: HTTP, baza i kolejność kroków.

/** Okno tolerancji znacznika czasu — chroni przed odtworzeniem starego żądania. */
export const TOLERANCJA_S = 300;

/** Porównanie w czasie stałym — długość i tak jest jawna, treść nie. */
export function rowneStale(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let roznica = 0;
  for (let i = 0; i < a.length; i++) roznica |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return roznica === 0;
}

export interface WynikPodpisu {
  ok: boolean;
  powod?: string;
  diag: Record<string, unknown>;
}

/**
 * Weryfikacja podpisu operatora.
 *
 * Zwraca diagnostykę, nie samo `true/false` — przy odrzuceniu trzeba wiedzieć,
 * CZY problem jest w sekrecie, czy w ładunku, a jedno i drugie wygląda tak samo
 * z zewnątrz.
 *
 * Dwie rzeczy, na których wykładała się pierwsza wersja:
 *
 *  1. Nagłówek może zawierać WIELE podpisów `v1` — Stripe wysyła je równolegle
 *     podczas rotacji sekretu. Zostawianie ostatniego oznaczało odrzucenie,
 *     gdy pasował pierwszy. Sprawdzamy wszystkie.
 *  2. Sekret z panelu bywa wklejony z niewidocznym znakiem końca linii.
 *     `importKey` bierze bajty dosłownie, więc `whsec_abc` i `whsec_abc\n` to
 *     dwa różne klucze. Przycinamy.
 *
 * Ładunek składamy z BAJTÓW: `t.` + surowe body, bez dekodowania i ponownego
 * kodowania. Podpis dotyczy bajtów, które przyszły.
 */
export async function sprawdzPodpis(
  bajtyCiala: Uint8Array,
  naglowek: string,
  sekretSurowy: string,
  teraz: number = Date.now(),
): Promise<WynikPodpisu> {
  const sekret = (sekretSurowy ?? "").trim();
  const diag: Record<string, unknown> = {
    sekret_prefiks: sekret.slice(0, 8),
    sekret_dlugosc: sekret.length,
    sekret_przyciety: sekret.length !== (sekretSurowy ?? "").length,
    body_bajtow: bajtyCiala.length,
    naglowek_obecny: !!naglowek,
  };

  if (!naglowek) return { ok: false, powod: "brak nagłówka stripe-signature", diag };

  let t = 0;
  const podpisyV1: string[] = [];
  for (const czesc of naglowek.split(",")) {
    const i = czesc.indexOf("=");
    if (i < 0) continue;
    const klucz = czesc.slice(0, i).trim();
    const wartosc = czesc.slice(i + 1).trim();
    if (klucz === "t") t = Number(wartosc);
    else if (klucz === "v1") podpisyV1.push(wartosc);
  }
  diag.timestamp = t;
  diag.podpisow_v1 = podpisyV1.length;

  if (!t || podpisyV1.length === 0) {
    return { ok: false, powod: "nagłówek bez t albo v1", diag };
  }

  const roznicaS = Math.abs(teraz / 1000 - t);
  diag.roznica_czasu_s = Math.round(roznicaS);
  if (roznicaS > TOLERANCJA_S) {
    return { ok: false, powod: `znacznik czasu poza tolerancją (${Math.round(roznicaS)} s)`, diag };
  }

  const klucz = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sekret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const prefiks = new TextEncoder().encode(`${t}.`);
  const ladunek = new Uint8Array(prefiks.length + bajtyCiala.length);
  ladunek.set(prefiks, 0);
  ladunek.set(bajtyCiala, prefiks.length);

  const podpis = await crypto.subtle.sign("HMAC", klucz, ladunek);
  const hex = Array.from(new Uint8Array(podpis))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  diag.policzony_prefiks = hex.slice(0, 12);
  diag.otrzymane_prefiksy = podpisyV1.map((p) => p.slice(0, 12));

  const pasuje = podpisyV1.some((v) => rowneStale(hex, v));
  return pasuje ? { ok: true, diag } : { ok: false, powod: "żaden podpis v1 nie pasuje", diag };
}

export const naDate = (sekundy: number | null | undefined): string | null =>
  sekundy ? new Date(sekundy * 1000).toISOString() : null;

/**
 * Okres rozliczeniowy subskrypcji.
 *
 * Od wersji API `2026-06-24.dahlia` `current_period_start` i `current_period_end`
 * NIE są już polami subskrypcji — zeszły na poziom pozycji
 * (`subscription.items.data[]`), bo pozycje jednej subskrypcji mogą mieć różne
 * okresy. Czytanie ze starego miejsca dawało `undefined`, a stąd NULL w kolumnie
 * `NOT NULL` i odrzucony zapis.
 *
 * Bierzemy pozycję pierwszą (sprzedajemy jeden plan na subskrypcję), z odwrotem
 * do pól na poziomie subskrypcji — na wypadek konta pinowanego do starszej
 * wersji API.
 */
export function okresSubskrypcji(sub: any): { start: string | null; end: string | null } {
  const pozycja = sub?.items?.data?.[0];
  const start = pozycja?.current_period_start ?? sub?.current_period_start ?? null;
  const end = pozycja?.current_period_end ?? sub?.current_period_end ?? null;
  return { start: naDate(start), end: naDate(end) };
}

/** Statusy Stripe → nasze. `incomplete_expired` i `unpaid` traktujemy jak koniec. */
export function mapujStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "trialing": return "trialing";
    case "active": return "active";
    case "past_due": return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "unpaid": return "canceled";
    default: return "past_due";
  }
}

/**
 * Czy powtórna dostawa ma być odbita jako duplikat.
 *
 * „Widzieliśmy" nie znaczy „obsłużyliśmy". Gdyby każdy konflikt na `event.id`
 * kończył się odbiciem, pierwsza nieudana próba (chwilowy błąd sieci przy
 * odpytaniu operatora) przepadłaby na zawsze: ponowienie trafiałoby na ten sam
 * konflikt i odchodziło z sukcesem. Domykamy tylko to, co naprawdę domknięte.
 */
export function czyDuplikat(status: string | null | undefined): boolean {
  return status === "processed" || status === "ignored";
}

/**
 * Co zrobić, gdy `UPDATE` subskrypcji trafił zero wierszy.
 *
 * Operator zna subskrypcję, której my nie mamy. Przy zdarzeniach pieniężnych to
 * `failed` — klient płaci, a my o tym nie wiemy, i ktoś musi to zobaczyć.
 * Przy zdarzeniach cyklu życia `ignored`: przy anulowaniu nieznanej subskrypcji
 * nie ma czego naprawiać, a ponawianie w nieskończoność nic nie da.
 */
export function wynikBrakuWiersza(typZdarzenia: string): "failed" | "ignored" {
  return typZdarzenia.startsWith("customer.subscription.") ? "ignored" : "failed";
}
