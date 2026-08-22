import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { corsHeaders } from "../_shared/cors.ts";
import { sendMail, emailShell } from "../_shared/smtpSend.ts";

/**
 * Ostrzeżenia przed końcem okresu — 7 dni i 1 dzień.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO
 * ═══════════════════════════════════════════════════════════════════════════
 * Blokada bez uprzedzenia jest karą, nie zasadą. Klient ma wiedzieć, kiedy
 * straci dostęp i co dokładnie przestanie działać — z wyprzedzeniem, które
 * pozwala zdecydować, a nie tylko zareagować.
 *
 * Kogo ostrzec, rozstrzyga `billing_do_ostrzezenia()` w bazie. Ta funkcja robi
 * jedno: wysyła i odnotowuje. Rozdzielenie jest celowe — „kogo" da się
 * sprawdzić bez wysyłania czegokolwiek.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ODNOTOWUJEMY PO UDANEJ WYSYŁCE, NIE PRZED
 * ═══════════════════════════════════════════════════════════════════════════
 * Odwrotna kolejność znaczyłaby, że awaria poczty kasuje ostrzeżenie na zawsze:
 * wiersz w `billing_ostrzezenia` już jest, więc następny przebieg go pominie,
 * a klient nigdy się nie dowie. Lepiej wysłać dwa razy niż ani razu.
 */

const ADRES_ZWROTNY = "kontakt@getrido.pl";

const json = (dane: unknown, status = 200) =>
  new Response(JSON.stringify(dane), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** „za 7 dni" / „jutro" — liczba dni brzmi sztucznie przy jedynce. */
function kiedy(prog: number): string {
  return prog === 1 ? "jutro" : `za ${prog} dni`;
}

function tresc(nazwaFirmy: string, prog: number, koniec: string, powod: string): string {
  const naglowek = powod === "trial"
    ? "Twój okres próbny dobiega końca"
    : "Twoja subskrypcja wymaga odnowienia";

  const wstep = powod === "trial"
    ? `okres próbny dla konta <strong>${nazwaFirmy}</strong> kończy się ${kiedy(prog)}, ${koniec}.`
    : `subskrypcja dla konta <strong>${nazwaFirmy}</strong> wymaga odnowienia ${kiedy(prog)}, ${koniec}.`;

  return emailShell(naglowek, `
    <p>Dzień dobry,</p>
    <p>${wstep}</p>
    <p><strong>Co się wtedy zmieni</strong></p>
    <p>Przez trzy dni robocze będziesz mógł dokończyć rozpoczęte zlecenia:
    zmienić status, dopisać części, wystawić fakturę i powiadomić klienta.
    Nie założysz w tym czasie nowego zlecenia ani nie zmienisz w istniejącym
    klienta i pojazdu.</p>
    <p>Po tych trzech dniach dostęp do zleceń, kartoteki i kasy zostaje wstrzymany.
    <strong>Twoje dane zostają nietknięte</strong> — wracają w całości po opłaceniu.
    Księgowość i faktury działają bez przerwy, także po wstrzymaniu.</p>
    <p><strong>Co zrobić</strong></p>
    <p>Wybierz plan w panelu, w zakładce Rozliczenia. Zajmuje to chwilę
    i nie przerywa pracy.</p>
    <p>Gdyby coś się nie zgadzało, odpisz na tego maila.</p>
    <p>Zespół GetRido</p>
  `);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Bramka: zadanie cykliczne podaje sekret ze skarbca. Fail-closed —
    // brak konfiguracji to odmowa, nie przepuszczenie.
    const oczekiwany = Deno.env.get("BILLING_CRON_SECRET");
    if (!oczekiwany) {
      console.error("billing-ostrzezenia: brak BILLING_CRON_SECRET");
      return json({ error: "Niedostępne" }, 503);
    }
    if (req.headers.get("x-cron-secret") !== oczekiwany) {
      return json({ error: "Brak uprawnień" }, 403);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: doWyslania, error: bladListy } = await admin.rpc("billing_do_ostrzezenia");
    if (bladListy) throw bladListy;

    let wyslane = 0;
    const problemy: string[] = [];

    for (const o of doWyslania ?? []) {
      const koniec = new Date(o.koniec).toLocaleDateString("pl-PL", {
        day: "numeric", month: "long", year: "numeric",
      });
      const temat = o.prog_dni === 1
        ? "Jutro kończy się Twój dostęp — GetRido"
        : `Za ${o.prog_dni} dni kończy się Twój dostęp — GetRido`;

      try {
        await sendMail(o.email, temat, tresc(o.nazwa_firmy, o.prog_dni, koniec, o.powod), {
          replyTo: ADRES_ZWROTNY,
        });
      } catch (e) {
        // Jeden nieudany adres nie może zatrzymać reszty listy.
        problemy.push(`${o.email}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }

      const { error: bladZapisu } = await admin.from("billing_ostrzezenia").insert({
        subscription_id: o.subscription_id,
        prog_dni: o.prog_dni,
        dotyczy_daty: o.koniec,
      });
      if (bladZapisu) {
        // Wysłane, ale nieodnotowane — klient dostanie jutro drugie. Głośno,
        // bo to jedyny ślad.
        console.error("billing-ostrzezenia: wysłane, nieodnotowane", o.subscription_id, bladZapisu);
      }
      wyslane++;
    }

    console.log(JSON.stringify({
      event: "ostrzezenia", do_wyslania: doWyslania?.length ?? 0, wyslane, problemy: problemy.length,
    }));

    return json({ do_wyslania: doWyslania?.length ?? 0, wyslane, problemy });
  } catch (e) {
    console.error("billing-ostrzezenia:", e);
    return json({ error: "Nie udało się wysłać ostrzeżeń" }, 500);
  }
});
