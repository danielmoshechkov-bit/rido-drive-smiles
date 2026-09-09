// Dokończenie wysyłki faktur platformy — mail, który nie poszedł za pierwszym razem.
//
// ═══════════════════════════════════════════════════════════════════════════
// PO CO TO ISTNIEJE
// ═══════════════════════════════════════════════════════════════════════════
// Dwie sytuacje zostawiają fakturę bez maila i obie zdarzyły się naprawdę:
//
//   1. KSeF nie oddał jeszcze numeru (`processing`). `billing-invoice-issue`
//      ŚWIADOMIE wstrzymuje wtedy maila: klient nie może dostać faktury bez
//      numeru, a potem drugiej z numerem.
//   2. Wysyłka padła. 09.09.2026 faktura GR/2026/007 nie dotarła do klienta
//      mimo poprawnego adresu — i nie było czym ponowić.
//
// Sygnałem jest `email_sent_at IS NULL`. Migracja `20260909155654` zamknęła
// przeszłość znacznikiem `email_error`, żeby to zadanie nie wysłało po raz
// drugi dokumentów z sierpnia.
//
// ═══════════════════════════════════════════════════════════════════════════
// CZEGO TA FUNKCJA NIE ROBI
// ═══════════════════════════════════════════════════════════════════════════
// Nie wystawia faktur i nie zmienia ich treści. Nie wysyła dokumentu, który
// czeka na numer KSeF — najpierw pyta KSeF o status i wysyła DOPIERO po
// otrzymaniu numeru. Odrzucenia przez KSeF nie „naprawia": zostawia je
// człowiekowi, bo poprawka wymaga decyzji, a nie ponowienia.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** Ile dokumentów bierzemy na jeden przebieg. Zadanie chodzi co 10 minut. */
const NA_PRZEBIEG = 20;

/**
 * Ile czekamy, zanim uznamy brak maila za problem. Bez tego zadanie
 * konkurowałoby z `billing-invoice-issue` o tę samą fakturę: webhook wystawia
 * dokument i wysyła maila w ciągu kilkunastu sekund.
 */
const KARENCJA_MINUT = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  /**
   * Bramka jak w pozostałych zadaniach billingowych: nagłówek `x-cron-secret`
   * porównany z sekretem `BILLING_CRON_SECRET`. `verify_jwt = false` znaczy,
   * że autoryzacja stoi TUTAJ, nie w bramie — a ta funkcja wysyła pocztę do
   * klientów, więc otwarta być nie może.
   *
   * Fail-closed: brak sekretu to odmowa, nie przepuszczenie.
   */
  const oczekiwany = Deno.env.get("BILLING_CRON_SECRET");
  if (!oczekiwany) {
    console.error("billing-faktura-mail-ponow: brak BILLING_CRON_SECRET");
    return json({ error: "Niedostępne" }, 503);
  }
  if (req.headers.get("x-cron-secret") !== oczekiwany) {
    return json({ error: "Brak uprawnień" }, 403);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const { data: ustawienia } = await admin
      .from("billing_settings")
      .select("platform_invoice_user_id")
      .eq("id", true)
      .maybeSingle();

    const platformUserId = (ustawienia as any)?.platform_invoice_user_id;
    if (!platformUserId) return json({ error: "PLATFORM_ACCOUNT_NOT_CONFIGURED" }, 503);

    const granica = new Date(Date.now() - KARENCJA_MINUT * 60_000).toISOString();

    // Wyłącznie faktury PLATFORMY. Faktury warsztatów wysyła ich własny moduł
    // i doklejanie się do nich stąd byłoby wysyłaniem cudzej poczty.
    const { data: czekajace, error: bladListy } = await admin
      .from("user_invoices")
      .select("id, invoice_number, buyer_email, ksef_status, ksef_reference, email_error")
      .eq("user_id", platformUserId)
      .is("email_sent_at", null)
      .is("deleted_at", null)
      .not("buyer_email", "is", null)
      .lt("created_at", granica)
      .order("created_at", { ascending: true })
      .limit(NA_PRZEBIEG);
    if (bladListy) throw bladListy;

    const wynik: Record<string, number> = { sprawdzonych: 0, wyslanych: 0, czeka_na_ksef: 0, bledow: 0, pominietych: 0 };

    for (const f of czekajace ?? []) {
      wynik.sprawdzonych++;

      // Dokumenty sprzed wprowadzenia śladu — migracja oznaczyła je jawnie.
      if (String(f.email_error ?? "").startsWith("stan sprzed")) {
        wynik.pominietych++;
        continue;
      }

      // ── KSeF: pytamy o status, jeśli dokument tam poszedł, a numeru nie ma ──
      let numer = f.ksef_reference as string | null;
      const stanKsef = String(f.ksef_status ?? "");

      if (!numer && (stanKsef === "processing" || stanKsef === "sent")) {
        try {
          const odp = await fetch(`${supabaseUrl}/functions/v1/ksef-integration`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ action: "check_status", invoice_id: f.id }),
          });
          const w = await odp.json().catch(() => ({}));
          if ((w as any)?.ksef_reference) numer = String((w as any).ksef_reference);
        } catch (e) {
          console.error("ponowienie: KSeF niedostępny", f.invoice_number, e);
        }

        if (!numer) {
          wynik.czeka_na_ksef++;
          continue;   // numeru nadal nie ma — mail dalej czeka
        }
      }

      // Odrzucenie przez KSeF to decyzja dla człowieka, nie do ponowienia.
      if (stanKsef === "rejected") {
        wynik.pominietych++;
        continue;
      }

      // ── mail ──
      try {
        const odp = await fetch(`${supabaseUrl}/functions/v1/send-invoice-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            invoice_id: f.id,
            recipient_email: f.buyer_email,
            type: "faktura_oplacona",
          }),
        });
        const w = await odp.json().catch(() => ({}));
        const poszedl = odp.ok && (w as any)?.success !== false;

        await admin.from("user_invoices").update(
          poszedl
            ? { email_sent_at: new Date().toISOString(), email_error: null }
            : { email_error: String((w as any)?.error ?? `HTTP ${odp.status}`).slice(0, 500) },
        ).eq("id", f.id);

        if (poszedl) wynik.wyslanych++; else wynik.bledow++;

        console.log(JSON.stringify({
          event: poszedl ? "ponowienie_mail" : "ponowienie_mail_blad",
          numer: f.invoice_number, do: f.buyer_email, ksef: numer, status: odp.status,
        }));
      } catch (e) {
        wynik.bledow++;
        await admin.from("user_invoices")
          .update({ email_error: String((e as Error)?.message ?? e).slice(0, 500) })
          .eq("id", f.id);
        console.error("ponowienie: mail niewysłany", f.invoice_number, e);
      }
    }

    console.log(JSON.stringify({ event: "ponowienie_faktur", ...wynik }));
    return json({ ok: true, ...wynik });
  } catch (e) {
    console.error("billing-faktura-mail-ponow:", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
