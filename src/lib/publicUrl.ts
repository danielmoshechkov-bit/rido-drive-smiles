// Jedyne źródło prawdy dla PUBLICZNEGO adresu aplikacji (linki wychodzące do klientów: SMS/e-mail).
//
// Wartość: override z env (VITE_PUBLIC_APP_URL) lub stała produkcyjna getrido.pl.
// NIE używaj window.location.origin do budowy linku, który OPUSZCZA przeglądarkę —
// na domenach deweloperskich (lovable.app / preview--) trafiłby zły adres do SMS/maila klienta.
// window.location.origin zostaw wyłącznie tam, gdzie URL nie wychodzi poza przeglądarkę
// (redirecty auth/OAuth, return_url płatności, navigator.share bieżącej strony).

const FALLBACK_APP_URL = "https://getrido.pl";
const FORBIDDEN = ["lovable", "preview--", "localhost", "127.0.0.1"];

function resolveBase(): string {
  const raw = (import.meta.env?.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  const base = raw && raw.length > 0 ? raw : FALLBACK_APP_URL;
  const lower = base.toLowerCase();
  // HARD GUARD: lepiej rzucić wyjątek (brak wysyłki) niż wysłać link na domenę deweloperską.
  if (!lower.startsWith("http") || FORBIDDEN.some((f) => lower.includes(f))) {
    throw new Error(
      `[publicUrl] Niedozwolony publiczny adres aplikacji: "${base}". ` +
        `Ustaw VITE_PUBLIC_APP_URL na domenę produkcyjną (np. https://getrido.pl).`,
    );
  }
  return base.replace(/\/+$/, "");
}

/** Buduje absolutny link publiczny (np. buildPublicUrl(`/r/${token}`)). Normalizuje slashe. */
export function buildPublicUrl(path = ""): string {
  const base = resolveBase();
  if (!path) return base;
  const clean = String(path).replace(/^\/+/, "");
  return `${base}/${clean}`;
}

/** Referencyjna wartość produkcyjna (bez odczytu env) — do wyświetlania/porównań. */
export const PUBLIC_APP_URL = FALLBACK_APP_URL;
