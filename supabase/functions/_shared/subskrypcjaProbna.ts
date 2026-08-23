/**
 * Wiersz `billing_subscriptions` dla świeżo zarejestrowanego warsztatu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO TO ISTNIEJE JAKO WSPÓLNY PLIK
 * ═══════════════════════════════════════════════════════════════════════════
 * Warsztat może powstać DWIEMA drogami:
 *   • `activate-workshop-trial` — z landingu warsztatowego i z modala usług,
 *   • `register-marketplace-user` z `module: 'warsztat'` — z rejestracji
 *     w AuthModal, gdy kontekst zapisu niesie moduł.
 *
 * Obie zapisywały okres próbny wyłącznie do `paid_service_subscriptions`,
 * a rozliczenia czytają `billing_subscriptions`. Klient bez tego wiersza:
 *   • nie wchodzi w tryb dokończenia — nie dostaje trzech dni roboczych
 *     na domknięcie rozpoczętej pracy,
 *   • nie dostaje ostrzeżeń na 7 i na 1 dzień przed końcem,
 *   • w dniu wygaśnięcia po prostu przestaje być przepuszczany.
 *
 * Czyli dokładnie to, czemu tryb dokończenia miał zapobiegać — za to wyłącznie
 * dla klientów pozyskanych PO jego zbudowaniu.
 *
 * Naprawiłem najpierw jedną drogę i o mało nie zostawił drugiej otwartej.
 * Dlatego to jest jeden plik wołany z obu miejsc, a nie dwa podobne bloki:
 * drugi zawsze zostaje w tyle.
 */

// deno-lint-ignore no-explicit-any
type Klient = any;

export type WynikSubskrypcji =
  | { stan: "zalozona" }
  | { stan: "byla" }
  | { stan: "pominieta"; powod: string }
  | { stan: "blad"; powod: string };

/**
 * Zakłada wiersz okresu próbnego, jeśli warsztat jeszcze go nie ma.
 *
 * Nigdy nie rzuca — rejestracja ma się udać nawet wtedy, gdy rozliczenia
 * zawiodą. Ale wynik nazywa rzecz po imieniu, żeby wywołujący mógł to
 * zalogować głośno zamiast przemilczeć.
 */
export async function zalozSubskrypcjeProbna(
  supabaseAdmin: Klient,
  providerId: string | null | undefined,
  trialEndsAt: string,
  snapshot: Record<string, unknown>,
): Promise<WynikSubskrypcji> {
  if (!providerId) return { stan: "pominieta", powod: "brak warsztatu" };

  // `product_line` BIERZEMY Z PLANU, nie wpisujemy z ręki. Kolumna jest
  // NOT NULL z domyślną wartością `other`, a wszystkie istniejące subskrypcje
  // warsztatów mają `warsztat`. Pominięcie jej dałoby wiersz w linii `other`,
  // a unikalny indeks `billing_subscriptions_one_active` jest kluczowany po
  // (typ, id, linia) — więc nie zatrzymałby drugiej subskrypcji po zakupie
  // i klient miałby dwie naraz.
  const { data: plan } = await supabaseAdmin
    .from("billing_plans")
    .select("id, product_line")
    .eq("code", "trial_warsztat")
    .maybeSingle();

  if (!plan?.id || !plan?.product_line) {
    return { stan: "pominieta", powod: "brak planu trial_warsztat" };
  }

  // Warsztat może już mieć żywą subskrypcję, choć nie ma wiersza
  // w `paid_service_subscriptions` — tak wygląda każde konto objęte
  // wariantem A. Pytamy wprost, zamiast wstawiać i zgadywać, co znaczy błąd
  // unikalnego indeksu.
  const { data: zywa } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id")
    .eq("subscriber_type", "service_provider")
    .eq("subscriber_id", providerId)
    .eq("product_line", plan.product_line)
    .in("status", ["trialing", "active", "past_due", "read_only"])
    .maybeSingle();

  if (zywa?.id) return { stan: "byla" };

  const { error } = await supabaseAdmin.from("billing_subscriptions").insert({
    subscriber_type: "service_provider",
    subscriber_id: providerId,
    plan_id: plan.id,
    product_line: plan.product_line,
    status: "trialing",
    current_period_start: new Date().toISOString(),
    current_period_end: trialEndsAt,
    trial_ends_at: trialEndsAt,
    price_snapshot: snapshot,
  });

  return error ? { stan: "blad", powod: error.message } : { stan: "zalozona" };
}

/** Jedno zdanie do logu, żeby obie funkcje brzegowe mówiły to samo. */
export function zalogujSubskrypcje(wynik: WynikSubskrypcji): void {
  if (wynik.stan === "zalozona") {
    console.log("✅ Wiersz subskrypcji (trialing) założony");
  } else if (wynik.stan === "byla") {
    console.log("ℹ️ Subskrypcja już istnieje — nie zakładam drugiej");
  } else {
    // Głośno: bez tego wiersza klient nie dostanie ostrzeżeń przed końcem
    // okresu próbnego ani trybu dokończenia.
    console.error(`⚠️ subskrypcja NIEZAŁOŻONA — ${wynik.powod}`);
  }
}
