// Jedyne źródło prawdy dla PUBLICZNEGO adresu aplikacji w edge functions (linki w SMS/e-mail do klienta).
//
// Kolejność: sekret PUBLIC_APP_URL → (back-compat) APP_PUBLIC_URL → stała produkcyjna getrido.pl.
// HARD GUARD: pusty / lovable / preview-- / localhost → wyjątek. Wołający MUSI przerwać wysyłkę —
// lepiej brak SMS-a niż SMS z linkiem na domenę deweloperską. Błąd trafia do logów edge function.

const FALLBACK_APP_URL = "https://getrido.pl";
const FORBIDDEN = ["lovable", "preview--", "localhost", "127.0.0.1"];

export function getPublicAppUrl(): string {
  const raw = (Deno.env.get("PUBLIC_APP_URL") ?? Deno.env.get("APP_PUBLIC_URL") ?? "").trim();
  const base = raw.length > 0 ? raw : FALLBACK_APP_URL;
  const lower = base.toLowerCase();
  if (!lower.startsWith("http") || FORBIDDEN.some((f) => lower.includes(f))) {
    const msg =
      `[publicUrl] Niedozwolony PUBLIC_APP_URL: "${base}". ` +
      `Ustaw sekret PUBLIC_APP_URL na domenę produkcyjną (np. https://getrido.pl). Wysyłkę przerwano.`;
    console.error(msg);
    throw new Error(msg);
  }
  return base.replace(/\/+$/, "");
}

/** Buduje absolutny link publiczny (np. buildPublicUrl(`/r/${token}`)). Normalizuje slashe. */
export function buildPublicUrl(path = ""): string {
  const base = getPublicAppUrl();
  if (!path) return base;
  const clean = String(path).replace(/^\/+/, "");
  return `${base}/${clean}`;
}
