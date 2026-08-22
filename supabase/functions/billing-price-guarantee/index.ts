// 4.20 — wygaśnięcie gwarancji ceny.
//
// Dwa działania w jednym przebiegu:
//  1. 30 dni przed końcem gwarancji — mail uprzedzający. Cennik to obiecuje,
//     a podwyżka bez zapowiedzi jest najszybszą drogą do rezygnacji.
//  2. Po dacie — podmiana pozycji subskrypcji z ceny startowej na docelową.
//
// Czego NIE robimy: nie zgadujemy, gdzie klient jest. Podmieniamy cenę tylko
// wtedy, gdy bieżąca pozycja subskrypcji wskazuje DOKŁADNIE cenę startową planu,
// na którym klient jest teraz. Cena wynegocjowana indywidualnie, cena już
// docelowa albo nieznana — zostają nietknięte. Zadanie cykliczne, które
// nadpisuje umowę handlową, jest gorsze niż zadanie, które czegoś nie zrobi.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { sendMail, emailShell } from "../_shared/smtpSend.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const STRIPE_API = "https://api.stripe.com/v1";

async function stripe(key: string, path: string, form?: Record<string, string>): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: form ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

/** Ile dni przed końcem gwarancji uprzedzamy klienta. */
const DNI_UPRZEDZENIA = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ── Brama ───────────────────────────────────────────────────────────
  // Fail-closed i bez wyjątków: ta funkcja zmienia CENĘ, którą klient płaci.
  // Brak sekretu nie może znaczyć „wpuść" — znaczy „nie ruszaj niczyich
  // pieniędzy".
  const cronSecret = Deno.env.get("BILLING_CRON_SECRET") ?? "";
  const podany = req.headers.get("x-cron-secret") ?? "";
  if (cronSecret.length < 16 || podany !== cronSecret) {
    console.error("billing-price-guarantee: odmowa — brak lub zły sekret");
    return json({ error: "forbidden" }, 403);
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    console.error("billing-price-guarantee: brak STRIPE_SECRET_KEY");
    return json({ error: "GATEWAY_NOT_CONFIGURED" }, 503);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const teraz = new Date();
  const prog = new Date(teraz.getTime() + DNI_UPRZEDZENIA * 86_400_000);

  const podsumowanie = { uprzedzone: 0, podmienione: 0, pominiete: 0, bledy: 0 };

  try {
    const { data: wiersze, error } = await admin
      .from("billing_subscriptions")
      .select(
        "id, subscriber_id, status, provider_subscription_id, price_guarantee_until, " +
          "price_guarantee_notified_at, price_target_applied_at, price_snapshot, " +
          "plan:billing_plans(id, code, name, price_net, price_net_target, vat_rate, " +
          "stripe_price_id, stripe_price_id_target, stripe_price_id_rok, stripe_price_id_rok_target)",
      )
      .eq("provider", "stripe")
      .in("status", ["active", "trialing", "past_due"])
      .not("price_guarantee_until", "is", null)
      .is("price_target_applied_at", null)
      .lte("price_guarantee_until", prog.toISOString());

    if (error) throw error;

    for (const w of (wiersze ?? []) as any[]) {
      const plan = w.plan;
      const koniec = new Date(w.price_guarantee_until);

      try {
        // ── 1. Uprzedzenie ────────────────────────────────────────────
        if (koniec > teraz) {
          if (w.price_guarantee_notified_at) { podsumowanie.pominiete++; continue; }
          if (plan?.price_net_target == null) {
            // Plan bez ceny docelowej nie podrożeje — nie ma o czym uprzedzać.
            podsumowanie.pominiete++;
            continue;
          }

          const { data: warsztat } = await admin
            .from("service_providers")
            .select("company_name, owner_email, company_email")
            .eq("id", w.subscriber_id)
            .maybeSingle();

          const adres = warsztat?.owner_email || warsztat?.company_email;
          if (adres) {
            await sendMail(
              adres,
              "Koniec ceny promocyjnej za 30 dni",
              emailShell(
                "Koniec ceny promocyjnej",
                `<p>Dzień dobry,</p>` +
                  `<p>cena promocyjna planu <strong>${plan.name}</strong> obowiązuje do ` +
                  `<strong>${koniec.toLocaleDateString("pl-PL")}</strong>.</p>` +
                  `<p>Po tej dacie abonament wyniesie <strong>${plan.price_net_target} zł netto</strong> ` +
                  `miesięcznie zamiast ${plan.price_net} zł. Nie musisz nic robić — ` +
                  `zmiana nastąpi automatycznie przy kolejnej płatności.</p>` +
                  `<p>Jeśli chcesz zmienić albo zakończyć plan, zrobisz to w panelu: ` +
                  `Konto → Twój plan.</p>`,
              ),
            );
          } else {
            console.warn("billing-price-guarantee: brak adresu e-mail dla", w.subscriber_id);
          }

          await admin
            .from("billing_subscriptions")
            .update({ price_guarantee_notified_at: new Date().toISOString() })
            .eq("id", w.id);
          podsumowanie.uprzedzone++;
          continue;
        }

        // ── 2. Podmiana ceny ──────────────────────────────────────────
        if (!w.provider_subscription_id) { podsumowanie.pominiete++; continue; }

        const sub = await stripe(stripeKey, `/subscriptions/${w.provider_subscription_id}`);
        const pozycja = sub?.items?.data?.[0];
        const obecnaCena = pozycja?.price?.id;

        /**
         * OKRES MUSI ZOSTAĆ TEN SAM.
         *
         * Zadanie podmienia cenę startową na docelową. Gdyby zawsze brało
         * wersję miesięczną, klient z subskrypcją ROCZNĄ zostałby po cichu
         * przerzucony na rozliczenie miesięczne — z ceną docelową miesiąca,
         * czyli kilkanaście razy niższą kwotą i zupełnie innym cyklem.
         *
         * Rozpoznajemy po tym, na której cenie klient JEST — Stripe jest tu
         * źródłem prawdy, nie nasza kolumna. Dlatego to sprawdzenie stoi
         * PO pobraniu subskrypcji, nie przed.
         */
        const rocznaObecna = !!plan?.stripe_price_id_rok
          && obecnaCena === plan.stripe_price_id_rok;
        const cenaStart  = rocznaObecna ? plan?.stripe_price_id_rok : plan?.stripe_price_id;
        const cenaTarget = rocznaObecna ? plan?.stripe_price_id_rok_target : plan?.stripe_price_id_target;

        if (!cenaTarget) {
          console.warn("billing-price-guarantee: plan bez ceny docelowej w Stripe",
            plan?.code, rocznaObecna ? "(rok)" : "(miesiąc)");
          podsumowanie.pominiete++;
          continue;
        }

        // Tu jest cała ostrożność tego zadania. Podmieniamy WYŁĄCZNIE z ceny
        // startowej tego planu — nie „z czegokolwiek na docelową".
        if (!pozycja?.id || obecnaCena !== cenaStart) {
          console.warn(
            "billing-price-guarantee: pozycja nie wskazuje ceny startowej — pomijam",
            JSON.stringify({ sub: w.provider_subscription_id, obecnaCena, oczekiwana: cenaStart }),
          );
          // Stemplujemy mimo pominięcia, żeby nie wracać do tego wiersza
          // codziennie do końca świata. Ślad zostaje w logu.
          await admin
            .from("billing_subscriptions")
            .update({ price_target_applied_at: new Date().toISOString() })
            .eq("id", w.id);
          podsumowanie.pominiete++;
          continue;
        }

        await stripe(stripeKey, `/subscriptions/${w.provider_subscription_id}`, {
          "items[0][id]": pozycja.id,
          "items[0][price]": cenaTarget,
          // Bez rozliczenia proporcjonalnego: to nie jest zmiana planu w trakcie
          // okresu, tylko koniec promocji. Nowa cena wchodzi od kolejnego okresu,
          // a klient nie dostaje faktury na różnicę w środku miesiąca.
          proration_behavior: "none",
        });

        const snapshot = (w.price_snapshot ?? {}) as Record<string, unknown>;
        await admin
          .from("billing_subscriptions")
          .update({
            price_target_applied_at: new Date().toISOString(),
            price_snapshot: {
              ...snapshot,
              price_net: plan.price_net_target,
              price_gross: plan.price_net_target != null && plan.vat_rate != null
                ? Math.round(plan.price_net_target * (1 + plan.vat_rate / 100) * 100) / 100
                : null,
              zrodlo: "gwarancja_wygasla",
              poprzednia_cena_netto: snapshot.price_net ?? plan.price_net,
              data: new Date().toISOString(),
            },
          })
          .eq("id", w.id);

        podsumowanie.podmienione++;
      } catch (e) {
        // Błąd na jednym kliencie nie może zatrzymać reszty kolejki.
        podsumowanie.bledy++;
        console.error("billing-price-guarantee: błąd dla subskrypcji", w.id, e);
      }
    }

    console.log("billing-price-guarantee:", JSON.stringify(podsumowanie));
    return json({ ok: true, ...podsumowanie });
  } catch (e) {
    console.error("billing-price-guarantee:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
