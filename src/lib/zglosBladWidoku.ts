import { supabase } from "@/integrations/supabase/client";

/**
 * ZGŁOSZENIE WYWROTKI WIDOKU DO BAZY.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO
 * ═══════════════════════════════════════════════════════════════════════════
 * 13.09.2026 trzy grupy użytkowników nie mogły wejść do systemu. Ustalenie
 * przyczyny zajęło dwie rundy pytań do człowieka, bo `console.error` zostaje
 * w przeglądarce klienta. Granica błędu pokazywała komunikat i o nim
 * zapominała.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ZASADA: ZGŁOSZENIE BŁĘDU NIE MA PRAWA WYWOŁAĆ BŁĘDU
 * ═══════════════════════════════════════════════════════════════════════════
 * Ten kod działa w chwili, gdy aplikacja już się wywróciła. Wszystko jest tu
 * więc opakowane, nic nie rzuca, a niepowodzenie zapisu kończy się ciszą.
 * Wyjątek stąd zamieniłby czytelny ekran „Ten widok się nie wczytał" w biały.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CO Z NIEZALOGOWANYMI
 * ═══════════════════════════════════════════════════════════════════════════
 * Tabela przyjmuje zapis wyłącznie od zalogowanego i tylko na jego własny
 * wiersz — tabela zapisywalna przez `anon` to zaproszenie do zapchania bazy.
 * Świadomy koszt: błędów sprzed logowania tu nie będzie. Ta klasa usterek
 * (wywrotka PO zalogowaniu) z definicji dotyczy zalogowanych.
 */

/** Ile znaków bierzemy z długich pól. Dziennik ma być czytelny, nie kompletny. */
const LIMIT_KOMUNIKAT = 500;
const LIMIT_STOS = 4000;
const LIMIT_KOMPONENT = 2000;

/**
 * Ten sam błąd potrafi się powtórzyć kilkanaście razy w sekundzie (React
 * próbuje renderować ponownie). Zapisujemy każdy podpis RAZ na sesję —
 * inaczej jedna wywrotka dawałaby kilkadziesiąt identycznych wierszy
 * i zasłaniała pozostałe.
 */
const juzZgloszone = new Set<string>();

function przytnij(v: unknown, limit: number): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, limit) : null;
}

/**
 * Pierwsze klatki `componentStack` — to one nazywają komponent. Cały stos
 * potrafi mieć sto linii providerów, w których nie ma żadnej informacji.
 */
function nazwijKomponent(componentStack: string | null | undefined): string | null {
  if (!componentStack) return null;
  const klatki = componentStack
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6);
  return przytnij(klatki.join(" ← "), LIMIT_KOMPONENT);
}

export async function zglosBladWidoku(
  blad: Error,
  componentStack?: string | null,
): Promise<void> {
  try {
    const komunikat = przytnij(blad?.message || String(blad), LIMIT_KOMUNIKAT);
    if (!komunikat) return;

    const sciezka = `${window.location.pathname}${window.location.search}`;
    const podpis = `${komunikat}|${sciezka}`;
    if (juzZgloszone.has(podpis)) return;
    juzZgloszone.add(podpis);

    const { data: sesja } = await supabase.auth.getSession();
    const uzytkownik = sesja?.session?.user;
    // Bez zalogowania nie ma gdzie zapisać — polityka tabeli tego nie wpuści,
    // a próba skończyłaby się odmową w konsoli i niczym więcej.
    if (!uzytkownik?.id) return;

    // Role bierzemy osobnym zapytaniem, bo to one rozstrzygają, KOGO dotyczy
    // usterka — „nie działa klientom" i „nie działa kierowcom" to dwa różne
    // zgłoszenia, a bez ról nie da się ich rozróżnić.
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uzytkownik.id);

    await supabase.from("bledy_widoku" as never).insert({
      user_id: uzytkownik.id,
      role: (role ?? []).map((r: { role: string }) => r.role).join(",") || null,
      sciezka,
      komunikat,
      komponent: nazwijKomponent(componentStack),
      stos: przytnij(blad?.stack, LIMIT_STOS),
      przegladarka: przytnij(navigator.userAgent, 300),
      // Skrót wdrożenia, jeśli budowa go wstrzyknęła. Ten sam błąd po
      // wdrożeniu poprawki znaczy co innego niż przed nim.
      wersja: przytnij((import.meta as { env?: Record<string, string> }).env?.VITE_COMMIT_SHA, 64),
    } as never);
  } catch {
    // Cisza jest zamierzona — patrz nagłówek.
  }
}

/** Wyłącznie do testów. */
export function zapomnijZgloszone(): void {
  juzZgloszone.clear();
}
